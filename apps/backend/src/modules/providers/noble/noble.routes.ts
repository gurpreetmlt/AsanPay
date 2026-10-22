import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.middleware";
import { requireRole } from "../../../middleware/rbac.middleware";
import { validateBody } from "../../../middleware/validate";
import { sendSuccess } from "../../../utils/apiResponse";
import { nobleCmsStart, nobleCmsStatus } from "./cms.service";
import { nobleSubmitRecon } from "./recon.service";
import {
  nobleUpiQrGenerate,
  nobleUpiQrKyc,
  nobleUpiQrLoad,
  nobleUpiQrStatus,
} from "./upiQr.service";

export const nobleRouter = Router();

nobleRouter.use(requireAuth);

const retailer = requireRole("retailer");
const adminOrRetailer = requireRole("admin", "retailer");

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
});

const upiStatusSchema = z.object({
  transactionId: z.string().min(8).max(40),
  /** DD/MM/YYYY */
  transactionDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "transactionDate must be DD/MM/YYYY"),
});

const cmsStartSchema = z.object({
  merchantId: z.string().min(1).max(10),
  transactionId: z.string().min(12).max(25).optional(),
});

const cmsStatusSchema = z.object({
  transactionId: z.string().min(12).max(25),
});

const reconSchema = z.object({
  uniqueDateTransactionId: z.string().min(10).max(15),
  transactionType: z.enum(["CW", "MT", "QR", "CD"]),
  transactionDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "transactionDate must be DD/MM/YYYY"),
  reconData: z.array(z.string().min(3)).min(1).max(500),
});

// ── UPI QR ──────────────────────────────────────────────────────────────
nobleRouter.post("/upi-qr/load", retailer, validateBody(upiLoadSchema), async (req, res) => {
  sendSuccess(
    res,
    await nobleUpiQrLoad(req.auth!.sub, {
      endpointIp: req.ip ?? undefined,
      channel: req.body.channel,
    }),
  );
});

nobleRouter.post("/upi-qr/kyc", retailer, validateBody(upiKycSchema), async (req, res) => {
  const body = req.body as z.infer<typeof upiKycSchema>;
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

nobleRouter.post("/upi-qr/generate", retailer, validateBody(upiGenerateSchema), async (req, res) => {
  const body = req.body as z.infer<typeof upiGenerateSchema>;
  sendSuccess(
    res,
    await nobleUpiQrGenerate(req.auth!.sub, {
      amount: body.amount,
      mobileNumber: body.mobileNumber,
      latitude: String(body.latitude),
      longitude: String(body.longitude),
      channel: body.channel,
      endpointIp: req.ip ?? undefined,
      deviceOsType: body.deviceOsType,
      deviceOsVersion: body.deviceOsVersion,
      deviceModel: body.deviceModel,
    }),
  );
});

nobleRouter.post("/upi-qr/status", retailer, validateBody(upiStatusSchema), async (req, res) => {
  const body = req.body as z.infer<typeof upiStatusSchema>;
  sendSuccess(res, await nobleUpiQrStatus(body));
});

// ── Airtel CMS ──────────────────────────────────────────────────────────
nobleRouter.post("/cms/start", retailer, validateBody(cmsStartSchema), async (req, res) => {
  const body = req.body as z.infer<typeof cmsStartSchema>;
  sendSuccess(res, await nobleCmsStart(body));
});

nobleRouter.post("/cms/status", retailer, validateBody(cmsStatusSchema), async (req, res) => {
  const body = req.body as z.infer<typeof cmsStatusSchema>;
  sendSuccess(res, await nobleCmsStatus(body.transactionId));
});

// ── Recon (admin or retailer ops) ───────────────────────────────────────
nobleRouter.post("/recon", adminOrRetailer, validateBody(reconSchema), async (req, res) => {
  const body = req.body as z.infer<typeof reconSchema>;
  sendSuccess(res, await nobleSubmitRecon(body));
});
