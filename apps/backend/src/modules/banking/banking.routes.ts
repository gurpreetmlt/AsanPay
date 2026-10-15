import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { requireIdempotencyKey } from "../../middleware/idempotency.middleware";
import { validateBody } from "../../middleware/validate";
import { walletTxnLimiter } from "../../middleware/rateLimiter";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { paiseToRupees, rupeesToPaise } from "../../core/money";
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
  updateBankAccount,
  setBankAccountActive,
  deleteBankAccount,
  assertVanWebhookSignature,
  vanWebhookCanonical,
  processVanWebhookCredit,
  assignVirtualAccount,
  listVirtualAccounts,
} from "./banking.service";
import {
  registerBankAccountSchema,
  updateBankAccountSchema,
  setBankAccountActiveSchema,
  importStatementSchema,
  parkSuspenseSchema,
  vanWebhookSchema,
  assignVanSchema,
  reconQuerySchema,
  reconAutoMatchSchema,
  reconLinkSchema,
  reconUnlinkSchema,
  statementImportsQuerySchema,
  verifyStatementSchema,
} from "./banking.validators";
import { verifyStatementBank, type VerifyResult } from "./statementVerify.service";
import { listStatementImports, recordImportBatch, startStatementImport } from "./statementImports.service";
import {
  autoMatchStatement,
  getReconciliation,
  linkStatementLine,
  unlinkStatementLine,
} from "./reconciliation.service";
import { normalizeVanWebhookPayload } from "./vanAdapters";

export const bankingRouter = Router();

/**
 * Bank webhook — no JWT. Auth is HMAC signature via VAN_WEBHOOK_SECRET.
 * Mounted before requireAuth so the bank can call it without an agent token.
 * Optional header `X-Van-Bank`: generic | icici | hdfc — selects payload adapter.
 */
bankingRouter.post("/van/webhook", walletTxnLimiter, async (req, res) => {
  const bankHint =
    typeof req.headers["x-van-bank"] === "string" ? req.headers["x-van-bank"] : undefined;
  const normalized = normalizeVanWebhookPayload(req.body, bankHint);
  const body = vanWebhookSchema.parse(normalized);

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
});

bankingRouter.use(requireAuth);

bankingRouter.get("/accounts", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const tenantId = await resolveTenantId();
  const purposeRaw = typeof req.query.purpose === "string" ? req.query.purpose : "collection";
  if (purposeRaw === "all" && req.auth.role !== "admin") {
    throw new HttpError(403, "Only admin can list all bank accounts", "FORBIDDEN");
  }
  const purpose =
    purposeRaw === "all"
      ? undefined
      : ["collection", "payout", "ops"].includes(purposeRaw)
        ? (purposeRaw as "collection" | "payout" | "ops")
        : "collection";
  // Admin "all" view includes inactive rows so ops can see full bank inventory.
  const activeOnly = purposeRaw === "all" ? false : true;
  const accounts = await listBankAccounts(tenantId, { purpose, activeOnly });
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
      holderName: body.holderName,
      accountType: body.accountType,
      branchName: body.branchName,
      branchCode: body.branchCode,
    });
    sendSuccess(
      res,
      { bankAccountId: String(result.bankAccountId), code: result.code },
      "Bank account registered",
      201,
    );
  },
);

bankingRouter.patch(
  "/accounts/:id",
  requireRole("admin"),
  validateBody(updateBankAccountSchema),
  async (req, res) => {
    const body = req.body as ReturnType<typeof updateBankAccountSchema.parse>;
    const tenantId = await resolveTenantId();
    const id = String(req.params.id || "");
    if (!/^\d+$/.test(id)) throw new HttpError(422, "Invalid bank account id", "INVALID_ID");
    const result = await updateBankAccount({
      tenantId,
      bankAccountId: BigInt(id),
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      ifsc: body.ifsc,
      purpose: body.purpose,
      supportsVan: body.supportsVan,
      holderName: body.holderName,
      accountType: body.accountType,
      branchName: body.branchName,
      branchCode: body.branchCode,
    });
    sendSuccess(res, result, "Bank account updated");
  },
);

bankingRouter.post(
  "/accounts/:id/active",
  requireRole("admin"),
  validateBody(setBankAccountActiveSchema),
  async (req, res) => {
    const body = req.body as ReturnType<typeof setBankAccountActiveSchema.parse>;
    const tenantId = await resolveTenantId();
    const id = String(req.params.id || "");
    if (!/^\d+$/.test(id)) throw new HttpError(422, "Invalid bank account id", "INVALID_ID");
    const result = await setBankAccountActive({
      tenantId,
      bankAccountId: BigInt(id),
      isActive: body.isActive,
    });
    sendSuccess(res, result, body.isActive ? "Bank account enabled" : "Bank account disabled");
  },
);

bankingRouter.delete("/accounts/:id", requireRole("admin"), async (req, res) => {
  const tenantId = await resolveTenantId();
  const id = String(req.params.id || "");
  if (!/^\d+$/.test(id)) throw new HttpError(422, "Invalid bank account id", "INVALID_ID");
  await deleteBankAccount({ tenantId, bankAccountId: BigInt(id) });
  sendSuccess(res, { id }, "Bank account deleted");
});

bankingRouter.get("/accounts-meta", requireRole("admin"), async (_req, res) => {
  sendSuccess(res, { ok: true });
});

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

    // The first batch of an upload decides whether this statement may go under this bank.
    let verdict: VerifyResult["verdict"] | undefined;
    if (!body.importId) {
      const check = await verifyStatementBank({
        tenantId,
        bankAccountId: body.bankAccountId,
        accountLast4: body.accountLast4,
        ifsc: body.ifsc,
        opening: body.opening,
        lines: body.lines,
      });
      if (check.verdict === "blocked") {
        const hint = check.suggestedBank
          ? ` Select ${check.suggestedBank.bankName} ••${check.suggestedBank.last4} instead.`
          : " Select the correct bank.";
        throw new HttpError(422, `${check.message}.${hint}`, "STATEMENT_BANK_MISMATCH");
      }
      if (check.verdict === "unverified" && !body.confirmedBank) {
        throw new HttpError(
          422,
          "Could not confirm which bank this statement is from. Tick “I confirm this statement is for the selected bank” and import again.",
          "STATEMENT_BANK_UNCONFIRMED",
        );
      }
      verdict = check.verdict;
    }

    const importId = await startStatementImport({
      tenantId,
      bankAccountId: BigInt(body.bankAccountId),
      importId: body.importId,
      fileName: body.fileName,
      source: body.source,
      periodFrom: body.periodFrom,
      periodTo: body.periodTo,
      accountLast4: body.accountLast4,
      verification: verdict === "verified" ? "verified" : verdict === "unverified" ? "confirmed" : undefined,
      importedBy: req.auth.sub,
    });

    const imported = await importStatementLines({
      tenantId,
      bankAccountId: BigInt(body.bankAccountId),
      importId,
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
    await recordImportBatch({
      importId,
      lines: body.lines.length,
      inserted: imported.imported,
      duplicates: imported.skipped,
    });

    // Fund requests first: an agent's deposit must claim its line before a bank entry can.
    const rematched = await rematchPending(tenantId);
    const autoMatched = await autoMatchStatement({ tenantId, bankAccountId: BigInt(body.bankAccountId) });

    sendSuccess(
      res,
      {
        ...imported,
        importId: String(importId),
        rematched: rematched.processed,
        autoMatched: autoMatched.linked,
      },
      "Statement lines imported",
    );
  },
);

bankingRouter.post(
  "/statements/verify",
  requireRole("admin"),
  validateBody(verifyStatementSchema),
  async (req, res) => {
    const body = req.body as ReturnType<typeof verifyStatementSchema.parse>;
    const tenantId = await resolveTenantId();
    sendSuccess(res, await verifyStatementBank({ tenantId, ...body }));
  },
);

bankingRouter.get("/statement-imports", requireRole("admin"), async (req, res) => {
  const q = statementImportsQuerySchema.safeParse(req.query);
  if (!q.success) {
    throw new HttpError(422, q.error.issues[0]?.message ?? "Invalid upload history filter", "VALIDATION_ERROR");
  }
  const tenantId = await resolveTenantId();
  sendSuccess(res, await listStatementImports({ tenantId, ...q.data }));
});

bankingRouter.get("/reconciliation", requireRole("admin"), async (req, res) => {
  const q = reconQuerySchema.safeParse(req.query);
  if (!q.success) {
    throw new HttpError(422, q.error.issues[0]?.message ?? "Select a bank and a valid period", "VALIDATION_ERROR");
  }
  const tenantId = await resolveTenantId();
  const report = await getReconciliation({
    tenantId,
    bankAccountId: BigInt(q.data.bankAccountId),
    from: q.data.from,
    to: q.data.to,
  });
  sendSuccess(res, report);
});

bankingRouter.post(
  "/reconciliation/auto-match",
  requireRole("admin"),
  validateBody(reconAutoMatchSchema),
  async (req, res) => {
    const body = req.body as ReturnType<typeof reconAutoMatchSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await autoMatchStatement({ tenantId, bankAccountId: BigInt(body.bankAccountId) });
    sendSuccess(res, result, `${result.linked} statement line(s) matched by UTR`);
  },
);

bankingRouter.post(
  "/reconciliation/link",
  requireRole("admin"),
  validateBody(reconLinkSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof reconLinkSchema.parse>;
    const tenantId = await resolveTenantId();
    await linkStatementLine({
      tenantId,
      lineId: BigInt(body.lineId),
      journalId: BigInt(body.journalId),
      adminId: req.auth.sub,
    });
    sendSuccess(res, { lineId: body.lineId }, "Statement line matched");
  },
);

bankingRouter.post(
  "/reconciliation/unlink",
  requireRole("admin"),
  validateBody(reconUnlinkSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof reconUnlinkSchema.parse>;
    const tenantId = await resolveTenantId();
    await unlinkStatementLine({ tenantId, lineId: BigInt(body.lineId), adminId: req.auth.sub });
    sendSuccess(res, { lineId: body.lineId }, "Match removed");
  },
);

/** Headline numbers for the admin "Bank & deposits" page. */
bankingRouter.get("/summary", requireRole("admin"), async (_req, res) => {
  const tenantId = await resolveTenantId();
  const rows = await db.execute<{
    pending: string;
    unmatched: string;
    credited_today: string;
    bank_total: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM fund_requests
        WHERE tenant_id = ${tenantId}
          AND status IN ('submitted','pending_match','auto_matched','amount_mismatch','suspect','under_review'))::text AS pending,
      (SELECT COUNT(*) FROM bank_statement_lines
        WHERE tenant_id = ${tenantId} AND direction = 'CR' AND match_status = 'unmatched')::text AS unmatched,
      (SELECT COALESCE(SUM(credited_amount), 0) FROM fund_requests
        WHERE tenant_id = ${tenantId} AND status = 'credited'
          AND (credited_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date)::text AS credited_today,
      (SELECT COALESCE(SUM(ab.balance), 0) FROM bank_accounts ba
        JOIN account_balances ab ON ab.account_id = ba.ledger_account_id
        WHERE ba.tenant_id = ${tenantId} AND ba.deleted_at IS NULL)::text AS bank_total
  `);
  const banks = await db.execute<{ bank_name: string; last4: string; balance: string }>(sql`
    SELECT ba.bank_name, ba.account_number_last4 AS last4, COALESCE(ab.balance, 0)::text AS balance
    FROM bank_accounts ba
    LEFT JOIN account_balances ab ON ab.account_id = ba.ledger_account_id
    WHERE ba.tenant_id = ${tenantId} AND ba.deleted_at IS NULL AND ba.is_active
    ORDER BY ab.balance DESC NULLS LAST
  `);
  const r = rows.rows[0];
  sendSuccess(res, {
    pendingFundRequests: Number(r?.pending ?? 0),
    unmatchedLines: Number(r?.unmatched ?? 0),
    creditedToday: paiseToRupees(BigInt(r?.credited_today ?? "0")),
    bankTotal: paiseToRupees(BigInt(r?.bank_total ?? "0")),
    banks: banks.rows.map((b) => ({
      bankName: b.bank_name,
      last4: b.last4,
      balance: paiseToRupees(BigInt(b.balance)),
    })),
  });
});

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

bankingRouter.get("/van", requireRole("admin"), async (req, res) => {
  const tenantId = await resolveTenantId();
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  sendSuccess(res, await listVirtualAccounts(tenantId, userId));
});

/** Self-service — the caller's own virtual account(s) for the "Add Money" screen. */
bankingRouter.get("/van/mine", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const tenantId = await resolveTenantId();
  const vans = await listVirtualAccounts(tenantId, req.auth.sub);
  sendSuccess(res, vans.filter((v) => v.status === "active"));
});

bankingRouter.post(
  "/van/assign",
  requireRole("admin"),
  validateBody(assignVanSchema),
  async (req, res) => {
    const body = req.body as ReturnType<typeof assignVanSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await assignVirtualAccount({
      tenantId,
      userId: body.userId,
      bankAccountId: BigInt(body.bankAccountId),
      vanNumber: body.vanNumber,
      vpa: body.vpa,
    });
    sendSuccess(
      res,
      {
        vanId: String(result.vanId),
        vanNumber: result.vanNumber,
        vpa: result.vpa,
      },
      "Virtual account assigned",
      201,
    );
  },
);
