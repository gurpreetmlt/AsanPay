import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { requireIdempotencyKey } from "../../middleware/idempotency.middleware";
import { validateBody } from "../../middleware/validate";
import { walletTxnLimiter } from "../../middleware/rateLimiter";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { rupeesToPaise } from "../../core/money";
import { sendSlackAlert } from "../../utils/alert";
import { resolveTenantId } from "../fund-requests/tenant";
import { rematchPending } from "../fund-requests/fundRequest.service";
import { notifyVanDepositCredit } from "../notifications/userEmail.service";
import {
  registerBankAccount,
  importStatementLines,
  parkUnmatchedCreditsInSuspense,
  unmatchedCreditCount,
  listBankAccounts,
  assertVanWebhookSignature,
  vanWebhookCanonical,
  processVanWebhookCredit,
} from "./banking.service";
import {
  registerBankAccountSchema,
  importStatementSchema,
  parkSuspenseSchema,
  vanWebhookSchema,
} from "./banking.validators";

export const bankingRouter = Router();

/**
 * Bank webhook — no JWT. Auth is HMAC signature via VAN_WEBHOOK_SECRET.
 * Mounted before requireAuth so the bank can call it without an agent token.
 */
bankingRouter.post(
  "/van/webhook",
  walletTxnLimiter,
  validateBody(vanWebhookSchema),
  async (req, res) => {
    const body = req.body as ReturnType<typeof vanWebhookSchema.parse>;
    assertVanWebhookSignature(
      vanWebhookCanonical({
        bankTxnId: body.bankTxnId,
        vanNumber: body.vanNumber,
        vpa: body.vpa,
        amount: body.amount,
      }),
      typeof req.headers["x-van-signature"] === "string"
        ? req.headers["x-van-signature"]
        : undefined,
    );

    const tenantId = await resolveTenantId();
    const result = await processVanWebhookCredit({
      tenantId,
      bankTxnId: body.bankTxnId,
      amount: rupeesToPaise(body.amount),
      amountRupees: body.amount,
      vanNumber: body.vanNumber,
      vpa: body.vpa,
      utr: body.utr,
      txnDate: body.txnDate,
      narration: body.narration,
      senderName: body.senderName,
      collectionAccountLast4: body.collectionAccountLast4,
    });

    // Notify outside the money transaction — failures must never roll back a credit.
    if (!result.replayed) {
      if (result.outcome === "credited" && result.ownerUserId) {
        notifyVanDepositCredit({
          userId: result.ownerUserId,
          amount: result.amount,
          bankTxnId: result.bankTxnId,
        });
      } else if (result.outcome === "suspense") {
        void sendSlackAlert("Unidentified VAN credit", "critical", {
          amount: result.amount,
          message: `Bank txn ${result.bankTxnId} could not be matched to a virtual account`,
          bankTxnId: result.bankTxnId,
          suspenseJournalId: result.suspenseJournalId,
        });
      }
    }

    sendSuccess(
      res,
      {
        outcome: result.outcome,
        replayed: result.replayed,
        bankTxnId: result.bankTxnId,
        amount: result.amount,
        receiveJournalId: result.receiveJournalId ?? null,
        creditJournalId: result.creditJournalId ?? null,
        suspenseJournalId: result.suspenseJournalId ?? null,
        vanId: result.vanId ?? null,
      },
      result.outcome === "credited"
        ? result.replayed
          ? "VAN credit already applied"
          : "VAN deposit credited"
        : result.replayed
          ? "Unidentified credit already parked"
          : "Unidentified credit parked in suspense",
    );
  },
);

bankingRouter.use(requireAuth);

bankingRouter.get("/accounts", async (req, res) => {
  const tenantId = await resolveTenantId();
  const purpose =
    typeof req.query.purpose === "string" &&
    ["collection", "payout", "ops"].includes(req.query.purpose)
      ? (req.query.purpose as "collection" | "payout" | "ops")
      : "collection";
  const accounts = await listBankAccounts(tenantId, { purpose });
  sendSuccess(res, accounts);
});

bankingRouter.post(
  "/accounts",
  requireRole("admin"),
  validateBody(registerBankAccountSchema),
  async (req, res) => {
    const body = req.body as ReturnType<typeof registerBankAccountSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await registerBankAccount({
      tenantId,
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      ifsc: body.ifsc,
      purpose: body.purpose,
      supportsVan: body.supportsVan,
    });
    sendSuccess(
      res,
      { bankAccountId: String(result.bankAccountId), code: result.code },
      "Bank account registered",
      201,
    );
  },
);

bankingRouter.post(
  "/statements/import",
  requireRole("admin"),
  walletTxnLimiter,
  requireIdempotencyKey,
  validateBody(importStatementSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof importStatementSchema.parse>;
    const tenantId = await resolveTenantId();

    const imported = await importStatementLines({
      tenantId,
      bankAccountId: BigInt(body.bankAccountId),
      lines: body.lines.map((line) => ({
        bankTxnId: line.bankTxnId,
        txnDate: line.txnDate,
        valueDatetime: line.valueDatetime ? new Date(line.valueDatetime) : null,
        direction: line.direction,
        amount: rupeesToPaise(line.amount),
        utr: line.utr,
        narration: line.narration,
        senderName: line.senderName,
        balanceAfter: line.balanceAfter != null ? rupeesToPaise(line.balanceAfter) : null,
      })),
    });

    // Newly imported credits should resolve any FR that was waiting for this UTR.
    const rematched = await rematchPending(tenantId);

    sendSuccess(
      res,
      { ...imported, rematched: rematched.processed },
      "Statement lines imported",
    );
  },
);

bankingRouter.get("/unmatched-count", requireRole("admin"), async (_req, res) => {
  const tenantId = await resolveTenantId();
  sendSuccess(res, { count: await unmatchedCreditCount(tenantId) });
});

bankingRouter.post(
  "/park-suspense",
  requireRole("admin"),
  walletTxnLimiter,
  requireIdempotencyKey,
  validateBody(parkSuspenseSchema),
  async (req, res) => {
    const body = req.body as ReturnType<typeof parkSuspenseSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await parkUnmatchedCreditsInSuspense({
      tenantId,
      olderThanHours: body.olderThanHours,
    });
    sendSuccess(res, result, "Unmatched credits parked in suspense");
  },
);
