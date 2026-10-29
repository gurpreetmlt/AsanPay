import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.middleware";
import { requireRole } from "../../../middleware/rbac.middleware";
import { validateBody } from "../../../middleware/validate";
import { sendSuccess } from "../../../utils/apiResponse";
import { HttpError } from "../../../utils/httpError";
import { executeServiceTxn, recheckTxnStatus } from "../../transactions/txn.service";
import { serviceWindowGuard } from "../../serviceWindow/serviceWindow.service";
import { serviceBlockGuard } from "../../agentControls/agentControls.service";
import { assertVerificationOn } from "../../verifications/verificationRouting.service";
import {
  CMS_PROVIDERS,
  checkCashCollection,
  listCashCollections,
  startCashCollection,
} from "./cms.service";
import { nobleSubmitRecon } from "./recon.service";
import {
  nobleUpiQrCollect,
  nobleUpiQrKyc,
  nobleUpiQrLoad,
  prepareNobleUpiQr,
  type UpiQrGenerateInput,
} from "./upiQr.service";

export const nobleRouter = Router();

nobleRouter.use(requireAuth);

const retailer = requireRole("retailer");
const adminOrRetailer = requireRole("admin", "retailer");
const upiCashPointOn = serviceBlockGuard("upi_cash_point");

const upiLoadSchema = z.object({
  channel: z.enum(["APP", "WEB"]).optional().default("APP"),
});

const upiKycSchema = z.object({
  biometricPayload: z.string().min(20, "Biometric PID data is required"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  channel: z.enum(["APP", "WEB"]).optional().default("APP"),
});

const upiGenerateSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount"),
  mobileNumber: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  channel: z.enum(["APP", "WEB"]).optional().default("APP"),
  deviceOsType: z.string().max(20).optional(),
  deviceOsVersion: z.string().max(20).optional(),
  deviceModel: z.string().max(40).optional(),
  idempotencyKey: z.string().min(8, "idempotencyKey is required").max(100),
});

const upiStatusSchema = z.object({
  txnRef: z.string().min(8, "txnRef is required").max(40),
});

const cmsStartSchema = z.object({
  provider: z.enum(["airtel"]).optional().default("airtel"),
});

const cmsStatusSchema = z.object({
  transactionId: z.string().min(12, "Enter a valid cash collection transaction id").max(25),
});

const ymd = /^\d{4}-\d{2}-\d{2}$/;
const cmsListSchema = z
  .object({
    from: z.string().regex(ymd, "From date must be YYYY-MM-DD"),
    to: z.string().regex(ymd, "To date must be YYYY-MM-DD"),
  })
  .refine((q) => q.from <= q.to, { message: "From date must be on or before To date", path: ["from"] });

const reconSchema = z.object({
  uniqueDateTransactionId: z.string().min(10).max(15),
  transactionType: z.enum(["CW", "MT", "QR", "CD"]),
  transactionDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "transactionDate must be DD/MM/YYYY"),
  reconData: z.array(z.string().min(3)).min(1).max(500),
});

// ── UPI QR ──────────────────────────────────────────────────────────────
nobleRouter.post("/upi-qr/load", retailer, upiCashPointOn, validateBody(upiLoadSchema), async (req, res) => {
  sendSuccess(
    res,
    await nobleUpiQrLoad(req.auth!.sub, {
      endpointIp: req.ip ?? undefined,
      channel: req.body.channel,
    }),
  );
});

nobleRouter.post("/upi-qr/kyc", retailer, upiCashPointOn, validateBody(upiKycSchema), async (req, res) => {
  const body = req.body as z.infer<typeof upiKycSchema>;
  await assertVerificationOn("upi_cash_point_kyc");
  sendSuccess(
    res,
    await nobleUpiQrKyc(req.auth!.sub, {
      biometricPayload: body.biometricPayload,
      latitude: body.latitude != null ? String(body.latitude) : undefined,
      longitude: body.longitude != null ? String(body.longitude) : undefined,
      channel: body.channel,
      endpointIp: req.ip ?? undefined,
    }),
  );
});

// Each QR is a UPI Cash Point txn: pending until paid, then the AEPS wallet is credited on settle.
nobleRouter.post("/upi-qr/generate", retailer, upiCashPointOn, validateBody(upiGenerateSchema), async (req, res) => {
  const body = req.body as z.infer<typeof upiGenerateSchema>;
  const userId = req.auth!.sub;
  const input: UpiQrGenerateInput = {
    amount: body.amount,
    mobileNumber: body.mobileNumber,
    latitude: String(body.latitude),
    longitude: String(body.longitude),
    channel: body.channel,
    endpointIp: req.ip ?? undefined,
    deviceOsType: body.deviceOsType,
    deviceOsVersion: body.deviceOsVersion,
    deviceModel: body.deviceModel,
  };
  const ctx = await prepareNobleUpiQr(userId, input);

  const outcome = await executeServiceTxn({
    actor: { id: userId, role: req.auth!.role },
    serviceCode: "UPI_CASH_POINT",
    amount: body.amount,
    idempotencyKey: body.idempotencyKey,
    operation: "upi_qr_collect",
    direction: "credit",
    walletType: "aeps",
    metadata: {
      customerMobile: body.mobileNumber,
      latitude: input.latitude,
      longitude: input.longitude,
      channel: body.channel,
    },
    invoke: async (routed, txnRef) =>
      routed.adapter.code === "noble"
        ? nobleUpiQrCollect(ctx, { ...input, transactionId: txnRef })
        : {
            success: false,
            status: "failed",
            providerTxnId: null,
            amount: null,
            message: "UPI Cash Point is not available on the active provider. Contact support.",
            data: {},
            raw: { provider: routed.adapter.code },
          },
  });

  if (outcome.txn.status === "failed") {
    throw new HttpError(
      502,
      outcome.txn.failureReason || "The bank did not return a UPI QR. Try again.",
      "UPI_QR_NOT_GENERATED",
    );
  }
  const qr = typeof outcome.provider?.data.qr === "string" ? outcome.provider.data.qr : "";
  if (!qr) {
    throw new HttpError(
      502,
      "The bank did not return a UPI QR. Tap Generate QR to try again.",
      "UPI_QR_NOT_GENERATED",
    );
  }
  sendSuccess(res, {
    txn: outcome.txn,
    qr,
    transactionId: outcome.txn.txnRef,
    referenceNumber: String(outcome.provider?.data.referenceNumber ?? ""),
  });
});

nobleRouter.post("/upi-qr/status", retailer, validateBody(upiStatusSchema), async (req, res) => {
  const body = req.body as z.infer<typeof upiStatusSchema>;
  const outcome = await recheckTxnStatus({ id: req.auth!.sub, role: req.auth!.role }, body.txnRef);
  sendSuccess(res, {
    txnRef: outcome.txn.txnRef,
    status: outcome.txn.status,
    amount: outcome.txn.amount,
    message: outcome.txn.failureReason ?? outcome.provider?.message ?? null,
  });
});

// ── Cash Management (CMS) ───────────────────────────────────────────────
nobleRouter.get("/cms/providers", retailer, (_req, res) => {
  sendSuccess(res, CMS_PROVIDERS);
});

nobleRouter.post("/cms/start", retailer, serviceWindowGuard("cms"), validateBody(cmsStartSchema), async (req, res) => {
  const body = req.body as z.infer<typeof cmsStartSchema>;
  sendSuccess(res, await startCashCollection(req.auth!.sub, body.provider));
});

nobleRouter.post("/cms/status", retailer, validateBody(cmsStatusSchema), async (req, res) => {
  const body = req.body as z.infer<typeof cmsStatusSchema>;
  sendSuccess(res, await checkCashCollection(req.auth!.sub, body.transactionId));
});

nobleRouter.get("/cms/transactions", retailer, async (req, res) => {
  const parsed = cmsListSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Select a valid date range", "CMS_RANGE_INVALID");
  }
  sendSuccess(res, await listCashCollections(req.auth!.sub, parsed.data.from, parsed.data.to));
});

// ── Recon (admin or retailer ops) ───────────────────────────────────────
nobleRouter.post("/recon", adminOrRetailer, validateBody(reconSchema), async (req, res) => {
  const body = req.body as z.infer<typeof reconSchema>;
  sendSuccess(res, await nobleSubmitRecon(body));
});
