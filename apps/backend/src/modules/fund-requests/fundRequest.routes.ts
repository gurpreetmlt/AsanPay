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
  listLineCandidates,
  linkFundRequestLine,
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

/** Express 5 params can be `string | string[]`; validators want a single string. */
function paramId(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

fundRequestRouter.use(requireAuth);

fundRequestRouter.post("/rematch", requireRole("admin"), async (_req, res) => {
  const tenantId = await resolveTenantId();
  const result = await rematchPending(tenantId);
  sendSuccess(res, result, "Pending fund requests rematched");
});

const AGENT_ROLES = ["super_distributor", "distributor", "retailer"] as const;

fundRequestRouter.get("/", requireRole("admin", ...AGENT_ROLES), async (req, res) => {
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
  requireRole(...AGENT_ROLES),
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
    requestId: parseRequestId(paramId(req.params.id)),
    actorUserId: req.auth.sub,
    actorRole: req.auth.role,
  });
  sendSuccess(res, data);
});

fundRequestRouter.post(
  "/:id/cancel",
  requireRole(...AGENT_ROLES),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const tenantId = await resolveTenantId();
    await cancelFundRequest({
      tenantId,
      requestId: parseRequestId(paramId(req.params.id)),
      requesterUserId: req.auth.sub,
    });
    sendSuccess(res, { status: "cancelled" }, "Fund request cancelled");
  },
);

fundRequestRouter.get("/:id/line-candidates", requireRole("admin"), async (req, res) => {
  const tenantId = await resolveTenantId();
  sendSuccess(res, await listLineCandidates({ tenantId, requestId: parseRequestId(paramId(req.params.id)) }));
});

fundRequestRouter.post("/:id/link-line", requireRole("admin"), async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const lineId = typeof req.body?.lineId === "string" ? req.body.lineId : "";
  if (!/^\d+$/.test(lineId)) throw new HttpError(422, "Select a bank statement line to link", "VALIDATION_ERROR");
  const tenantId = await resolveTenantId();
  const result = await linkFundRequestLine({
    tenantId,
    requestId: parseRequestId(paramId(req.params.id)),
    lineId: BigInt(lineId),
    adminId: req.auth.sub,
  });
  sendSuccess(res, result, "Bank line linked — review and approve");
});

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
      requestId: parseRequestId(paramId(req.params.id)),
      adminId: req.auth.sub,
      creditAmount: body.creditAmount ? parseRupeeAmount(body.creditAmount) : undefined,
      note: body.note,
    });
    if (result.pendingChecker) {
      sendSuccess(
        res,
        {
          pendingChecker: true,
          status: result.status,
          creditedAmount: paiseToRupees(result.creditedAmount),
        },
        "Pre-approved — a second admin must complete this credit",
      );
      return;
    }
    sendSuccess(
      res,
      {
        pendingChecker: false,
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
      requestId: parseRequestId(paramId(req.params.id)),
      adminId: req.auth.sub,
      reasonCode: body.reasonCode,
      remarks: body.remarks,
    });
    sendSuccess(res, { status: "rejected" }, "Fund request rejected");
  },
);
