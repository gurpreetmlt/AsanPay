import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { requireIdempotencyKey } from "../../middleware/idempotency.middleware";
import { validateBody } from "../../middleware/validate";
import { walletTxnLimiter } from "../../middleware/rateLimiter";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { resolveTenantId } from "../fund-requests/tenant";
import {
  registerSettlementBank,
  verifySettlementBank,
  listSettlementBanks,
  requestSettlement,
  markPayoutSuccess,
  markPayoutFailed,
  markPayoutReturned,
  requestSettlementBankOtp,
  getSettlementRequest,
  listSettlementRequests,
  listOpenSettlements,
  listPendingSettlementBanks,
} from "./settlement.service";
import {
  registerSettlementBankSchema,
  verifySettlementBankSchema,
  requestSettlementSchema,
  markPayoutSuccessSchema,
  markPayoutFailedSchema,
  markPayoutReturnedSchema,
  parseSettlementId,
  parseBankRowId,
  parseRupeeAmount,
} from "./settlement.validators";

function paramId(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

const AGENT_ROLES = ["super_distributor", "distributor", "retailer"] as const;

export const settlementRouter = Router();

settlementRouter.use(requireAuth);

settlementRouter.get("/banks", requireRole(...AGENT_ROLES), async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const tenantId = await resolveTenantId();
  const banks = await listSettlementBanks({ tenantId, userId: req.auth.sub });
  sendSuccess(res, banks);
});

settlementRouter.post(
  "/banks/otp",
  requireRole(...AGENT_ROLES),
  walletTxnLimiter,
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const result = await requestSettlementBankOtp({ userId: req.auth.sub });
    sendSuccess(res, result, "OTP sent for settlement bank change");
  },
);

settlementRouter.post(
  "/banks",
  requireRole(...AGENT_ROLES),
  validateBody(registerSettlementBankSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof registerSettlementBankSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await registerSettlementBank({
      tenantId,
      userId: req.auth.sub,
      accountNumber: body.accountNumber,
      ifsc: body.ifsc,
      holderName: body.holderName,
      otp: body.otp,
    });
    sendSuccess(
      res,
      {
        settlementAccountId: String(result.settlementAccountId),
        accountNumberLast4: result.accountNumberLast4,
        isActive: result.isActive,
      },
      "Settlement bank account registered — awaiting verification",
      201,
    );
  },
);

settlementRouter.post(
  "/banks/:id/verify",
  requireRole("admin"),
  validateBody(verifySettlementBankSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof verifySettlementBankSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await verifySettlementBank({
      tenantId,
      settlementAccountId: parseBankRowId(paramId(req.params.id)),
      adminId: req.auth.sub,
      verificationRef: body.verificationRef,
      activate: body.activate,
    });
    sendSuccess(
      res,
      {
        settlementAccountId: String(result.settlementAccountId),
        isActive: result.isActive,
        verifiedAt: result.verifiedAt.toISOString(),
        coolingUntil: result.coolingUntil?.toISOString() ?? null,
      },
      "Settlement bank account verified",
    );
  },
);

settlementRouter.get("/requests", requireRole(...AGENT_ROLES), async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const tenantId = await resolveTenantId();
  const data = await listSettlementRequests({ tenantId, userId: req.auth.sub });
  sendSuccess(res, data);
});

settlementRouter.get("/requests/open", requireRole("admin"), async (_req, res) => {
  const tenantId = await resolveTenantId();
  const data = await listOpenSettlements({ tenantId });
  sendSuccess(res, data);
});

settlementRouter.get("/banks/pending", requireRole("admin"), async (_req, res) => {
  const tenantId = await resolveTenantId();
  const data = await listPendingSettlementBanks({ tenantId });
  sendSuccess(res, data);
});

settlementRouter.post(
  "/requests",
  requireRole(...AGENT_ROLES),
  walletTxnLimiter,
  requireIdempotencyKey,
  validateBody(requestSettlementSchema),
  async (req, res) => {
    if (!req.auth || !req.idempotencyKey) {
      throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    }
    const body = req.body as ReturnType<typeof requestSettlementSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await requestSettlement({
      tenantId,
      userId: req.auth.sub,
      amount: parseRupeeAmount(body.amount),
      mode: body.mode,
      idempotencyKey: req.idempotencyKey,
    });
    sendSuccess(
      res,
      {
        requestId: String(result.requestId),
        status: result.status,
        replayed: result.replayed,
      },
      result.replayed ? "Settlement request already submitted" : "Settlement request submitted",
      result.replayed ? 200 : 201,
    );
  },
);

settlementRouter.get("/requests/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const tenantId = await resolveTenantId();
  const data = await getSettlementRequest({
    tenantId,
    requestId: parseSettlementId(paramId(req.params.id)),
    actorUserId: req.auth.sub,
    actorRole: req.auth.role,
  });
  sendSuccess(res, data);
});

settlementRouter.post(
  "/requests/:id/success",
  requireRole("admin"),
  requireIdempotencyKey,
  validateBody(markPayoutSuccessSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof markPayoutSuccessSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await markPayoutSuccess({
      tenantId,
      requestId: parseSettlementId(paramId(req.params.id)),
      adminId: req.auth.sub,
      bankUtr: body.bankUtr,
      payoutBankAccountId: body.payoutBankAccountId
        ? BigInt(body.payoutBankAccountId)
        : undefined,
    });
    sendSuccess(
      res,
      { payoutJournalId: String(result.payoutJournalId) },
      "Settlement payout marked successful",
    );
  },
);

settlementRouter.post(
  "/requests/:id/fail",
  requireRole("admin"),
  requireIdempotencyKey,
  validateBody(markPayoutFailedSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof markPayoutFailedSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await markPayoutFailed({
      tenantId,
      requestId: parseSettlementId(paramId(req.params.id)),
      adminId: req.auth.sub,
      failureReason: body.failureReason,
    });
    sendSuccess(
      res,
      { reversalJournalId: String(result.reversalJournalId) },
      "Settlement payout marked failed — balance restored",
    );
  },
);

settlementRouter.post(
  "/requests/:id/returned",
  requireRole("admin"),
  requireIdempotencyKey,
  validateBody(markPayoutReturnedSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof markPayoutReturnedSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await markPayoutReturned({
      tenantId,
      requestId: parseSettlementId(paramId(req.params.id)),
      adminId: req.auth.sub,
      reason: body.reason,
      bankUtr: body.bankUtr,
    });
    sendSuccess(
      res,
      {
        payoutReversalJournalId: String(result.payoutReversalJournalId),
        debitReversalJournalId: String(result.debitReversalJournalId),
      },
      "Settlement marked returned — settleable restored",
    );
  },
);
