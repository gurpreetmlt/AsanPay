import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { requireIdempotencyKey } from "../../middleware/idempotency.middleware";
import { validateBody } from "../../middleware/validate";
import { walletTxnLimiter } from "../../middleware/rateLimiter";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { paiseToRupees } from "../../core/money";
import { resolveTenantId } from "./tenant";
import {
  submitFundRequest,
  approveFundRequest,
  rejectFundRequest,
  cancelFundRequest,
  rematchPending,
  getFundRequest,
  listFundRequests,
  retailerFacingStatus,
  type FundRequestListFilter,
} from "./fundRequest.service";
import {
  submitFundRequestSchema,
  approveFundRequestSchema,
  rejectFundRequestSchema,
  parseRequestId,
  parseRupeeAmount,
} from "./fundRequest.validators";

export const fundRequestRouter = Router();

fundRequestRouter.use(requireAuth);

fundRequestRouter.post("/rematch", requireRole("admin"), async (_req, res) => {
  const tenantId = await resolveTenantId();
  const result = await rematchPending(tenantId);
  sendSuccess(res, result, "Pending fund requests rematched");
});

fundRequestRouter.get("/", requireRole("admin", "retailer"), async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const defaultFilter: FundRequestListFilter = req.auth.role === "admin" ? "open" : "all";
  const raw = typeof req.query.status === "string" ? req.query.status : defaultFilter;
  const allowed: FundRequestListFilter[] = ["open", "credited", "rejected", "cancelled", "all"];
  const filter = (allowed.includes(raw as FundRequestListFilter) ? raw : defaultFilter) as FundRequestListFilter;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const offset = typeof req.query.offset === "string" ? Number(req.query.offset) : undefined;
  const tenantId = await resolveTenantId();
  const rows = await listFundRequests({
    tenantId,
    actorUserId: req.auth.sub,
    actorRole: req.auth.role,
    filter,
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
  });
  sendSuccess(res, rows);
});

fundRequestRouter.post(
  "/",
  requireRole("retailer"),
  walletTxnLimiter,
  requireIdempotencyKey,
  validateBody(submitFundRequestSchema),
  async (req, res) => {
    if (!req.auth || !req.idempotencyKey) {
      throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    }
    const body = req.body as ReturnType<typeof submitFundRequestSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await submitFundRequest({
      tenantId,
      requesterUserId: req.auth.sub,
      bankAccountId: BigInt(body.bankAccountId),
      amount: parseRupeeAmount(body.amount),
      paymentMode: body.paymentMode,
      referenceNumber: body.referenceNumber,
      depositDatetime: new Date(body.depositDatetime),
      senderName: body.senderName,
      receiptUrl: body.receiptUrl,
      receiptSha256: body.receiptSha256.toLowerCase(),
      remarks: body.remarks,
      idempotencyKey: req.idempotencyKey,
    });

    sendSuccess(
      res,
      {
        requestId: String(result.requestId),
        status: retailerFacingStatus(result.status),
        replayed: result.replayed,
      },
      result.replayed ? "Fund request already submitted" : "Fund request submitted",
      result.replayed ? 200 : 201,
    );
  },
);

fundRequestRouter.get("/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const tenantId = await resolveTenantId();
  const data = await getFundRequest({
    tenantId,
    requestId: parseRequestId(req.params.id),
    actorUserId: req.auth.sub,
    actorRole: req.auth.role,
  });
  sendSuccess(res, data);
});

fundRequestRouter.post(
  "/:id/cancel",
  requireRole("retailer"),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const tenantId = await resolveTenantId();
    await cancelFundRequest({
      tenantId,
      requestId: parseRequestId(req.params.id),
      requesterUserId: req.auth.sub,
    });
    sendSuccess(res, { status: "cancelled" }, "Fund request cancelled");
  },
);

fundRequestRouter.post(
  "/:id/approve",
  requireRole("admin"),
  walletTxnLimiter,
  requireIdempotencyKey,
  validateBody(approveFundRequestSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof approveFundRequestSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await approveFundRequest({
      tenantId,
      requestId: parseRequestId(req.params.id),
      adminId: req.auth.sub,
      creditAmount: body.creditAmount ? parseRupeeAmount(body.creditAmount) : undefined,
      note: body.note,
    });
    sendSuccess(
      res,
      {
        journalId: String(result.journalId),
        creditedAmount: paiseToRupees(result.creditedAmount),
      },
      "Fund request credited",
    );
  },
);

fundRequestRouter.post(
  "/:id/reject",
  requireRole("admin"),
  validateBody(rejectFundRequestSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof rejectFundRequestSchema.parse>;
    const tenantId = await resolveTenantId();
    await rejectFundRequest({
      tenantId,
      requestId: parseRequestId(req.params.id),
      adminId: req.auth.sub,
      reasonCode: body.reasonCode,
      remarks: body.remarks,
    });
    sendSuccess(res, { status: "rejected" }, "Fund request rejected");
  },
);
