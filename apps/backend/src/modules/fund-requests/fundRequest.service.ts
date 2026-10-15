import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  accounts,
  bankAccounts,
  bankStatementLines,
  fundRequests,
  fundRequestEvents,
  users,
  walletIdempotency,
} from "../../db/postgres/schema";
import { postJournal, resolveAccount, reverseJournal, type Tx } from "../../core/ledger";
import { ensureHierarchyAccount } from "../wallet/ledgerAccounts";
import { normaliseUtr } from "../banking/banking.service";
import { matchFundRequest, claimStatementLine } from "./matching";
import { HttpError } from "../../utils/httpError";
import { paiseToRupees, type Paise } from "../../core/money";
import { isFundRequestEnabled } from "@asanpay/shared-types";

const COMPANY = "COMPANY_001";

/** Tier-1 auto-credit ceiling. Above this a human looks, however clean the match is. */
const AUTO_CREDIT_CEILING: Paise = 10_000_000n; // ₹1,00,000
const MAX_OPEN_REQUESTS = 10;
const MAX_DAILY_SUBMISSIONS = 20;
const MAX_BACKDATE_DAYS = 7;

type FundRequestRow = typeof fundRequests.$inferSelect;
type FundRequestStatus = FundRequestRow["status"];

export interface SubmitFundRequestInput {
  tenantId: string;
  requesterUserId: string;
  bankAccountId: bigint;
  amount: Paise;
  paymentMode: "cash_deposit" | "neft" | "rtgs" | "imps" | "upi" | "cheque";
  referenceNumber?: string | null;
  depositDatetime: Date;
  senderName?: string | null;
  receiptUrl: string;
  receiptSha256: string;
  remarks?: string | null;
  /** Client Idempotency-Key — same key returns the original request, never a second credit. */
  idempotencyKey?: string;
}

/** Pack a bigint fund-request id into the uuid-shaped wallet_idempotency.ledger_group_id column. */
function encodeFrIdemUuid(requestId: bigint): string {
  const hex = requestId.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function decodeFrIdemUuid(uuid: string): bigint {
  return BigInt(`0x${uuid.replace(/-/g, "")}`);
}

function frIdempotencyKey(clientKey: string): string {
  return `FR:${clientKey}`;
}

export async function submitFundRequest(
  input: SubmitFundRequestInput,
): Promise<{ requestId: bigint; status: FundRequestStatus; replayed: boolean }> {
  const { tenantId, requesterUserId, amount, paymentMode, depositDatetime } = input;

  if (amount <= 0n) throw new HttpError(422, "Amount must be positive", "INVALID_AMOUNT");

  const [requester] = await db
    .select({ role: users.role, fundRequestEnabled: users.fundRequestEnabled })
    .from(users)
    .where(eq(users.id, requesterUserId))
    .limit(1);
  if (!requester || !isFundRequestEnabled(requester.role, requester.fundRequestEnabled)) {
    throw new HttpError(
      403,
      "Fund requests are not enabled for your account. Contact your sales manager to enable them.",
      "FUND_REQUEST_DISABLED",
    );
  }
  if (paymentMode !== "cash_deposit") {
    throw new HttpError(
      422,
      "Only cash deposit fund requests are accepted right now. Deposit cash at the bank and upload the receipt.",
      "PAYMENT_MODE_NOT_ALLOWED",
    );
  }

  const now = Date.now();
  if (depositDatetime.getTime() > now) {
    throw new HttpError(422, "Deposit date cannot be in the future", "FUTURE_DEPOSIT");
  }
  if (depositDatetime.getTime() < now - MAX_BACKDATE_DAYS * 86_400_000) {
    throw new HttpError(
      422,
      `Deposit date cannot be older than ${MAX_BACKDATE_DAYS} days`,
      "STALE_DEPOSIT",
    );
  }

  // A cash deposit slip carries a journal number rather than a UTR, so it is the one mode
  // where a reference is optional. Everything else must be traceable to a bank reference.
  const referenceNorm = normaliseUtr(input.referenceNumber);
  if (!referenceNorm && paymentMode !== "cash_deposit") {
    throw new HttpError(422, "Reference number is required", "REFERENCE_REQUIRED");
  }
  if (!input.senderName && ["neft", "imps", "upi"].includes(paymentMode)) {
    throw new HttpError(422, "Sender name is required for this mode", "SENDER_REQUIRED");
  }

  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const storedKey = frIdempotencyKey(input.idempotencyKey);
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${requesterUserId}:${storedKey}`}))`,
      );
      const [prior] = await tx
        .select()
        .from(walletIdempotency)
        .where(
          and(
            eq(walletIdempotency.userId, requesterUserId),
            eq(walletIdempotency.idempotencyKey, storedKey),
          ),
        );
      if (prior) {
        const requestId = decodeFrIdemUuid(prior.ledgerGroupId);
        const [existing] = await tx
          .select({ id: fundRequests.id, status: fundRequests.status })
          .from(fundRequests)
          .where(eq(fundRequests.id, requestId))
          .limit(1);
        if (existing) {
          return { requestId: existing.id, status: existing.status, replayed: true };
        }
        throw new HttpError(
          500,
          "Idempotency key is already claimed but the fund request is missing",
          "IDEM_ORPHAN",
        );
      }
    }

    await assertWithinLimits(tx, tenantId, requesterUserId);
    await assertReceiptNotReused(tx, input.receiptSha256);

    const requesterCode = await ensureHierarchyAccount(tx, tenantId, requesterUserId);
    const requesterAccount = await resolveAccount(tenantId, requesterCode, tx);

    if (requesterAccount.blockTopup) {
      throw new HttpError(403, "Fund requests are blocked for this account", "TOPUP_BLOCKED");
    }

    const [created] = await tx
      .insert(fundRequests)
      .values({
        tenantId,
        requesterUserId,
        requesterAccountId: requesterAccount.id,
        bankAccountId: input.bankAccountId,
        amount,
        paymentMode,
        referenceNumber: input.referenceNumber ?? null,
        referenceNorm,
        depositDatetime,
        senderName: input.senderName ?? null,
        receiptUrl: input.receiptUrl,
        receiptSha256: input.receiptSha256,
        remarks: input.remarks ?? null,
        status: "submitted",
      })
      .returning();

    if (!created) throw new HttpError(500, "Could not create fund request", "CREATE_FAILED");

    await recordEvent(tx, created.id, null, "submitted", requesterUserId, "retailer", null);

    // Match immediately — if the statement is already imported the retailer is credited in
    // seconds instead of waiting for the next batch.
    const next = await runMatch(tx, created);

    if (input.idempotencyKey) {
      await tx.insert(walletIdempotency).values({
        userId: requesterUserId,
        idempotencyKey: frIdempotencyKey(input.idempotencyKey),
        ledgerGroupId: encodeFrIdemUuid(created.id),
      });
    }

    return { requestId: created.id, status: next, replayed: false };
  });
}

/**
 * Re-run matching for everything still waiting. Called after each statement import and on a
 * timer, so a request submitted before its bank line arrives still resolves on its own.
 */
export async function rematchPending(tenantId: string): Promise<{ processed: number }> {
  const pending = await db
    .select()
    .from(fundRequests)
    .where(
      and(
        eq(fundRequests.tenantId, tenantId),
        sql`${fundRequests.status} IN ('submitted','pending_match')`,
      ),
    )
    .limit(200);

  let processed = 0;
  for (const request of pending) {
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(fundRequests)
        .where(eq(fundRequests.id, request.id))
        .for("update");

      if (!locked || !["submitted", "pending_match"].includes(locked.status)) return;
      await runMatch(tx, locked);
      processed += 1;
    });
  }

  return { processed };
}

async function runMatch(tx: Tx, request: FundRequestRow): Promise<FundRequestStatus> {
  const outcome = await matchFundRequest(tx, request);

  const eligibleForAuto =
    outcome.status === "auto_matched" &&
    outcome.amount !== null &&
    outcome.amount <= AUTO_CREDIT_CEILING &&
    (await isKycVerified(tx, request.requesterUserId));

  const nextStatus: FundRequestStatus = eligibleForAuto ? "auto_matched" : outcome.status === "auto_matched" ? "under_review" : outcome.status;

  await tx
    .update(fundRequests)
    .set({
      status: nextStatus,
      matchConfidence: outcome.confidence,
      matchedLineId: outcome.lineId,
    })
    .where(eq(fundRequests.id, request.id));

  await recordEvent(tx, request.id, request.status, nextStatus, null, "system", {
    tier: outcome.tier,
    confidence: outcome.confidence,
    statementLineId: outcome.lineId?.toString() ?? null,
    autoCreditBlockedBy: outcome.status === "auto_matched" && !eligibleForAuto ? "ceiling_or_kyc" : null,
  });

  if (eligibleForAuto && outcome.lineId && outcome.amount !== null) {
    await creditRequest(tx, request.id, outcome.amount, null);
    return "credited";
  }

  return nextStatus;
}

/**
 * Admin approval. Credits the amount from the BANK STATEMENT, never the amount the retailer
 * typed — a partial approval is simply the statement amount being lower than the claim.
 *
 * Credits at/above FUND_APPROVE_DUAL_RUPEES need two different admins: the first sets
 * under_review (maker), the second completes the credit (checker).
 */
export async function approveFundRequest(params: {
  tenantId: string;
  requestId: bigint;
  adminId: string;
  /** Only needed when linking a line manually or overriding a mismatch. */
  creditAmount?: Paise;
  note?: string;
}): Promise<
  | { pendingChecker: true; status: "under_review"; creditedAmount: Paise }
  | { pendingChecker: false; journalId: bigint; creditedAmount: Paise }
> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(fundRequests)
      .where(and(eq(fundRequests.id, params.requestId), eq(fundRequests.tenantId, params.tenantId)))
      .for("update");

    if (!request) throw new HttpError(404, "Fund request not found", "NOT_FOUND");
    if (["credited", "rejected", "cancelled"].includes(request.status)) {
      throw new HttpError(422, `Request is already ${request.status}`, "ALREADY_TERMINAL");
    }
    if (!request.matchedLineId) {
      throw new HttpError(
        422,
        "Link a bank statement line before approving — we credit what the bank received",
        "NO_STATEMENT_LINE",
      );
    }

    const amount = params.creditAmount ?? (await statementAmount(tx, request.matchedLineId));
    const { getTenantSettings } = await import("../tenants/tenantSettings.service");
    const settings = await getTenantSettings(params.tenantId);
    const dualThreshold = BigInt(Math.round(settings.fundApproveDualRupees * 100));

    if (amount >= dualThreshold) {
      if (!request.reviewedBy || request.status !== "under_review") {
        await tx
          .update(fundRequests)
          .set({
            status: "under_review",
            reviewedBy: params.adminId,
            reviewedAt: new Date(),
          })
          .where(eq(fundRequests.id, request.id));
        await recordEvent(tx, request.id, request.status, "under_review", params.adminId, "admin", {
          action: "pre_approved",
          creditAmount: amount.toString(),
          note: params.note ?? null,
        });
        return { pendingChecker: true as const, status: "under_review" as const, creditedAmount: amount };
      }
      if (request.reviewedBy === params.adminId) {
        throw new HttpError(
          422,
          "A second admin must complete this large fund-request credit — you already pre-approved it",
          "MAKER_CHECKER",
        );
      }
    }

    const result = await creditRequest(tx, request.id, amount, params.adminId, params.note);
    return { pendingChecker: false as const, journalId: result.journalId, creditedAmount: amount };
  });
}

/**
 * The two-journal deposit, in one transaction:
 *   J1 DEPOSIT_RECEIVE  Dr TREASURY_BANK_*  Cr COMPANY_001
 *   J2 DEPOSIT_CREDIT   Dr COMPANY_001      Cr RTL_*
 *
 * COMPANY_001 nets to zero, but its debit side now answers "how much wallet balance did we
 * issue today" — which a direct bank-to-retailer credit could never answer.
 *
 * Idempotency keys derive from the request id, so a retry can never double-credit.
 */
async function creditRequest(
  tx: Tx,
  requestId: bigint,
  amount: Paise,
  adminId: string | null,
  note?: string,
): Promise<{ journalId: bigint }> {
  const [request] = await tx.select().from(fundRequests).where(eq(fundRequests.id, requestId));
  if (!request) throw new HttpError(404, "Fund request not found", "NOT_FOUND");

  const [bank] = await tx
    .select({ code: accounts.code })
    .from(bankAccounts)
    .innerJoin(accounts, eq(accounts.id, bankAccounts.ledgerAccountId))
    .where(eq(bankAccounts.id, request.bankAccountId));

  if (!bank) throw new HttpError(500, "Bank account has no ledger account", "BANK_NOT_LINKED");

  const [requester] = await tx
    .select({ code: accounts.code })
    .from(accounts)
    .where(eq(accounts.id, request.requesterAccountId));

  if (!requester) throw new HttpError(500, "Requester has no ledger account", "ACCOUNT_NOT_FOUND");

  if (request.matchedLineId) {
    const claimed = await claimStatementLine(tx, request.matchedLineId, request.id);
    if (!claimed) {
      throw new HttpError(
        422,
        "That bank statement line is already claimed by another request",
        "LINE_ALREADY_CLAIMED",
      );
    }
  }

  const receive = await postJournal(tx, {
    tenantId: request.tenantId,
    txnType: "DEPOSIT_RECEIVE",
    idemKey: `FR:${request.id}:RECEIVE`,
    performedBy: adminId,
    referenceId: String(request.id),
    reason: note ?? "Retailer deposit received",
    entries: [
      { code: bank.code, dir: "DR", amount },
      { code: COMPANY, dir: "CR", amount },
    ],
  });

  const credit = await postJournal(tx, {
    tenantId: request.tenantId,
    txnType: "DEPOSIT_CREDIT",
    idemKey: `FR:${request.id}:CREDIT`,
    performedBy: adminId,
    referenceId: String(request.id),
    reason: note ?? "Fund request credited",
    entries: [
      { code: COMPANY, dir: "DR", amount },
      { code: requester.code, dir: "CR", amount },
    ],
  });

  await tx
    .update(fundRequests)
    .set({
      status: "credited",
      creditedAmount: amount,
      receiveJournalId: receive.id,
      creditJournalId: credit.id,
      reviewedBy: adminId,
      reviewedAt: adminId ? new Date() : null,
      creditedAt: new Date(),
    })
    .where(eq(fundRequests.id, request.id));

  await recordEvent(
    tx,
    request.id,
    request.status,
    "credited",
    adminId,
    adminId ? "admin" : "system",
    { creditedPaise: amount.toString(), claimedPaise: request.amount.toString() },
  );

  return { journalId: credit.id };
}

export async function rejectFundRequest(params: {
  tenantId: string;
  requestId: bigint;
  adminId: string;
  reasonCode: string;
  remarks: string;
}): Promise<void> {
  if (!params.reasonCode || !params.remarks?.trim()) {
    throw new HttpError(422, "A rejection needs a reason the retailer can read", "REASON_REQUIRED");
  }

  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(fundRequests)
      .where(and(eq(fundRequests.id, params.requestId), eq(fundRequests.tenantId, params.tenantId)))
      .for("update");

    if (!request) throw new HttpError(404, "Fund request not found", "NOT_FOUND");
    if (["credited", "rejected", "cancelled"].includes(request.status)) {
      throw new HttpError(422, `Request is already ${request.status}`, "ALREADY_TERMINAL");
    }

    await tx
      .update(fundRequests)
      .set({
        status: "rejected",
        rejectReasonCode: params.reasonCode,
        rejectRemarks: params.remarks.trim(),
        reviewedBy: params.adminId,
        reviewedAt: new Date(),
      })
      .where(eq(fundRequests.id, request.id));

    await recordEvent(tx, request.id, request.status, "rejected", params.adminId, "admin", {
      reasonCode: params.reasonCode,
    });
  });
}

/** The retailer may withdraw a request only while nothing has been decided about it. */
export async function cancelFundRequest(params: {
  tenantId: string;
  requestId: bigint;
  requesterUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(fundRequests)
      .where(and(eq(fundRequests.id, params.requestId), eq(fundRequests.tenantId, params.tenantId)))
      .for("update");

    if (!request) throw new HttpError(404, "Fund request not found", "NOT_FOUND");
    if (request.requesterUserId !== params.requesterUserId) {
      throw new HttpError(403, "Not your request", "FORBIDDEN");
    }
    if (!["submitted", "pending_match"].includes(request.status)) {
      throw new HttpError(422, "This request can no longer be cancelled", "NOT_CANCELLABLE");
    }

    await tx
      .update(fundRequests)
      .set({ status: "cancelled" })
      .where(eq(fundRequests.id, request.id));

    await recordEvent(
      tx,
      request.id,
      request.status,
      "cancelled",
      params.requesterUserId,
      "retailer",
      null,
    );
  });
}

/**
 * Undo a credited request (test entry, credited by mistake). Journals are append-only, so both
 * deposit journals get a REVERSAL; the statement line it claimed goes back to unmatched.
 * Fails with a clear message when the agent has already spent the money (no-overdraft trigger).
 */
export async function voidFundRequest(params: {
  tenantId: string;
  requestId: bigint;
  adminId: string;
  reason: string;
}): Promise<{ reversalJournalIds: string[] }> {
  const reason = params.reason.trim();
  if (reason.length < 5) {
    throw new HttpError(422, "Reason must be at least 5 characters (e.g. Test entry)", "REASON_REQUIRED");
  }

  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(fundRequests)
      .where(and(eq(fundRequests.id, params.requestId), eq(fundRequests.tenantId, params.tenantId)))
      .for("update");

    if (!request) throw new HttpError(404, "Fund request not found", "NOT_FOUND");
    if (request.status !== "credited") {
      throw new HttpError(422, `Only credited requests can be voided — this one is ${request.status}`, "NOT_VOIDABLE");
    }
    if (!request.creditJournalId || !request.receiveJournalId) {
      throw new HttpError(500, "Credited request is missing its journals", "MISSING_JOURNAL");
    }

    const reversalJournalIds: string[] = [];
    try {
      for (const journalId of [request.creditJournalId, request.receiveJournalId]) {
        const rev = await reverseJournal(tx, {
          tenantId: params.tenantId,
          journalId,
          idemKey: `FR:${request.id}:VOID:${journalId}`,
          performedBy: params.adminId,
          reason: `Fund request ${request.id} voided: ${reason}`,
        });
        reversalJournalIds.push(String(rev.id));
      }
    } catch (err) {
      if (err instanceof Error && /Overdraft blocked/i.test(err.message)) {
        throw new HttpError(
          422,
          `The agent's wallet no longer has ₹${paiseToRupees((request.creditedAmount ?? request.amount) as Paise)} — part of this credit was already spent, so it cannot be voided.`,
          "INSUFFICIENT_BALANCE",
        );
      }
      throw err;
    }

    await tx.execute(sql`
      UPDATE bank_statement_lines
      SET match_status = 'unmatched', matched_to_type = NULL, matched_to_id = NULL
      WHERE tenant_id = ${params.tenantId}
        AND ((matched_to_type = 'fund_request' AND matched_to_id = ${String(request.id)})
          OR (matched_to_type = 'journal'
              AND matched_to_id IN (${String(request.receiveJournalId)}, ${String(request.creditJournalId)})))
    `);

    await tx
      .update(fundRequests)
      .set({
        status: "voided",
        matchedLineId: null,
        // Frees the UTR so a corrected request for the same deposit can be submitted again.
        referenceNorm: null,
        voidedAt: new Date(),
        voidedBy: params.adminId,
        voidReason: reason,
      })
      .where(eq(fundRequests.id, request.id));

    await recordEvent(tx, request.id, "credited", "voided", params.adminId, "admin", {
      reason,
      reversalJournalIds,
    });

    return { reversalJournalIds };
  });
}

/**
 * Retailer-facing label. Internal states never leak: "suspect" and every fraud signal read as
 * "Under review by team", because an honest duplicate entry looks identical from the inside.
 */
export function retailerFacingStatus(status: FundRequestStatus): string {
  switch (status) {
    case "submitted":
    case "pending_match":
      return "Verifying with bank";
    case "auto_matched":
      return "Verified — crediting";
    case "amount_mismatch":
    case "under_review":
    case "suspect":
      return "Under review by team";
    case "credited":
      return "Credited";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "voided":
      return "Reversed by team";
  }
}

async function recordEvent(
  tx: Tx,
  fundRequestId: bigint,
  fromStatus: FundRequestStatus | null,
  toStatus: FundRequestStatus,
  actorId: string | null,
  actorType: "retailer" | "admin" | "system",
  metadata: Record<string, unknown> | null,
): Promise<void> {
  await tx.insert(fundRequestEvents).values({
    fundRequestId,
    fromStatus,
    toStatus,
    actorId,
    actorType,
    metadata,
  });
}

async function assertWithinLimits(tx: Tx, tenantId: string, userId: string): Promise<void> {
  const [open] = await tx
    .select({ n: sql<string>`COUNT(*)` })
    .from(fundRequests)
    .where(
      and(
        eq(fundRequests.tenantId, tenantId),
        eq(fundRequests.requesterUserId, userId),
        sql`${fundRequests.status} NOT IN ('credited','rejected','cancelled')`,
      ),
    );

  if (Number(open?.n ?? 0) >= MAX_OPEN_REQUESTS) {
    throw new HttpError(429, "Too many open fund requests", "TOO_MANY_OPEN");
  }

  const dayAgo = new Date(Date.now() - 86_400_000);
  const [today] = await tx
    .select({ n: sql<string>`COUNT(*)` })
    .from(fundRequests)
    .where(
      and(
        eq(fundRequests.tenantId, tenantId),
        eq(fundRequests.requesterUserId, userId),
        gte(fundRequests.submittedAt, dayAgo),
      ),
    );

  if (Number(today?.n ?? 0) >= MAX_DAILY_SUBMISSIONS) {
    throw new HttpError(429, "Daily fund request limit reached", "DAILY_LIMIT");
  }
}

/** One deposit slip, one claim — across every retailer, not just this one. */
async function assertReceiptNotReused(tx: Tx, sha256: string): Promise<void> {
  const [existing] = await tx
    .select({ id: fundRequests.id })
    .from(fundRequests)
    .where(eq(fundRequests.receiptSha256, sha256))
    .limit(1);

  if (existing) {
    throw new HttpError(422, "This receipt has already been submitted", "RECEIPT_REUSED");
  }
}

async function isKycVerified(tx: Tx, userId: string): Promise<boolean> {
  const [user] = await tx
    .select({ kycStatus: users.kycStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.kycStatus === "verified";
}

async function statementAmount(tx: Tx, lineId: bigint): Promise<Paise> {
  const [line] = await tx
    .select({ amount: bankStatementLines.amount })
    .from(bankStatementLines)
    .where(eq(bankStatementLines.id, lineId));

  if (!line) throw new HttpError(404, "Statement line not found", "LINE_NOT_FOUND");
  return line.amount;
}

const OPEN_STATUSES: FundRequestStatus[] = [
  "submitted",
  "pending_match",
  "auto_matched",
  "amount_mismatch",
  "suspect",
  "under_review",
];

export type FundRequestListFilter = "open" | "credited" | "rejected" | "cancelled" | "voided" | "all";

type RequesterSummary = { id: string; name: string; mobile: string; uid: string; role: string };

function mapFundRequestRow(row: FundRequestRow, actorRole: string, requester?: RequesterSummary) {
  return {
    id: String(row.id),
    amount: paiseToRupees(row.amount),
    paymentMode: row.paymentMode,
    referenceNumber: row.referenceNumber,
    depositDatetime: row.depositDatetime.toISOString(),
    senderName: row.senderName,
    bankAccountId: String(row.bankAccountId),
    receiptUrl: row.receiptUrl,
    status: actorRole === "admin" ? row.status : retailerFacingStatus(row.status),
    displayStatus: retailerFacingStatus(row.status),
    creditedAmount: row.creditedAmount != null ? paiseToRupees(row.creditedAmount) : null,
    rejectReasonCode: row.rejectReasonCode,
    rejectRemarks: row.rejectRemarks,
    submittedAt: row.submittedAt.toISOString(),
    creditedAt: row.creditedAt?.toISOString() ?? null,
    ...(actorRole === "admin" ? { hasBankLine: row.matchedLineId != null } : {}),
    ...(requester ? { requester } : {}),
  };
}

/** List fund requests for admin (tenant-wide) or retailer (own only). */
export async function listFundRequests(params: {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  filter?: FundRequestListFilter;
  limit?: number;
  offset?: number;
}): Promise<ReturnType<typeof mapFundRequestRow>[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const filter = params.filter ?? (params.actorRole === "admin" ? "open" : "all");

  const conditions = [eq(fundRequests.tenantId, params.tenantId)];
  if (params.actorRole !== "admin") {
    conditions.push(eq(fundRequests.requesterUserId, params.actorUserId));
  }
  if (filter === "open") conditions.push(inArray(fundRequests.status, OPEN_STATUSES));
  else if (filter === "credited") conditions.push(eq(fundRequests.status, "credited"));
  else if (filter === "rejected") conditions.push(eq(fundRequests.status, "rejected"));
  else if (filter === "cancelled") conditions.push(eq(fundRequests.status, "cancelled"));
  else if (filter === "voided") conditions.push(eq(fundRequests.status, "voided"));

  const rows = await db
    .select({
      request: fundRequests,
      requesterId: users.id,
      requesterName: users.name,
      requesterMobile: users.mobile,
      requesterUid: users.uid,
      requesterRole: users.role,
      bankName: bankAccounts.bankName,
      bankLast4: bankAccounts.accountNumberLast4,
    })
    .from(fundRequests)
    .innerJoin(users, eq(users.id, fundRequests.requesterUserId))
    .leftJoin(bankAccounts, eq(bankAccounts.id, fundRequests.bankAccountId))
    .where(and(...conditions))
    .orderBy(desc(fundRequests.submittedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(
    ({ request, requesterId, requesterName, requesterMobile, requesterUid, requesterRole, bankName, bankLast4 }) => ({
      ...mapFundRequestRow(
        request,
        params.actorRole,
        params.actorRole === "admin"
          ? {
              id: requesterId,
              name: requesterName,
              mobile: requesterMobile,
              uid: requesterUid,
              role: requesterRole,
            }
          : undefined,
      ),
      bankName: bankName ?? null,
      bankLast4: bankLast4 ?? null,
    }),
  );
}

/** Load one request for the authenticated actor (owner or admin). */
export async function getFundRequest(params: {
  tenantId: string;
  requestId: bigint;
  actorUserId: string;
  actorRole: string;
}): Promise<ReturnType<typeof mapFundRequestRow>> {
  const [row] = await db
    .select()
    .from(fundRequests)
    .where(and(eq(fundRequests.id, params.requestId), eq(fundRequests.tenantId, params.tenantId)))
    .limit(1);

  if (!row) throw new HttpError(404, "Fund request not found", "NOT_FOUND");
  if (params.actorRole !== "admin" && row.requesterUserId !== params.actorUserId) {
    throw new HttpError(403, "Not your request", "FORBIDDEN");
  }

  let requester: RequesterSummary | undefined;
  if (params.actorRole === "admin") {
    const [u] = await db
      .select({ id: users.id, name: users.name, mobile: users.mobile, uid: users.uid, role: users.role })
      .from(users)
      .where(eq(users.id, row.requesterUserId))
      .limit(1);
    if (u) requester = u;
  }

  return mapFundRequestRow(row, params.actorRole, requester);
}

/**
 * Unclaimed bank credits an admin can tie to a request by hand — same bank, credit side,
 * within a week of the stated deposit time. Exact-amount lines sort first.
 */
export async function listLineCandidates(params: { tenantId: string; requestId: bigint }) {
  const [request] = await db
    .select()
    .from(fundRequests)
    .where(and(eq(fundRequests.id, params.requestId), eq(fundRequests.tenantId, params.tenantId)))
    .limit(1);
  if (!request) throw new HttpError(404, "Fund request not found", "NOT_FOUND");

  const day = request.depositDatetime.toISOString().slice(0, 10);
  const rows = await db.execute<{
    id: string;
    txn_date: string;
    amount: string;
    utr: string | null;
    narration: string | null;
    sender_name: string | null;
  }>(sql`
    SELECT l.id::text, l.txn_date::text, l.amount::text, l.utr, l.narration, l.sender_name
    FROM bank_statement_lines l
    WHERE l.tenant_id = ${params.tenantId}
      AND l.bank_account_id = ${String(request.bankAccountId)}
      AND l.direction = 'CR'
      AND l.match_status = 'unmatched'
      AND l.matched_to_id IS NULL
      AND l.txn_date BETWEEN (${day}::date - 7) AND (${day}::date + 7)
      AND NOT EXISTS (
        SELECT 1 FROM fund_requests fr
        WHERE fr.matched_line_id = l.id AND fr.id <> ${String(request.id)}
          AND fr.status NOT IN ('rejected', 'cancelled')
      )
    ORDER BY (l.amount = ${String(request.amount)}) DESC, ABS(l.txn_date - ${day}::date), l.id
    LIMIT 30
  `);

  return rows.rows.map((r) => ({
    id: r.id,
    txnDate: r.txn_date,
    amount: paiseToRupees(BigInt(r.amount)),
    exactAmount: r.amount === String(request.amount),
    utr: r.utr,
    narration: r.narration,
    senderName: r.sender_name,
  }));
}

/** Admin ties a statement line to a request that matching could not resolve on its own. */
export async function linkFundRequestLine(params: {
  tenantId: string;
  requestId: bigint;
  lineId: bigint;
  adminId: string;
}): Promise<{ status: FundRequestStatus }> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(fundRequests)
      .where(and(eq(fundRequests.id, params.requestId), eq(fundRequests.tenantId, params.tenantId)))
      .for("update");
    if (!request) throw new HttpError(404, "Fund request not found", "NOT_FOUND");
    if (!OPEN_STATUSES.includes(request.status)) {
      throw new HttpError(422, `Request is already ${request.status}`, "ALREADY_TERMINAL");
    }

    const [line] = await tx
      .select()
      .from(bankStatementLines)
      .where(and(eq(bankStatementLines.id, params.lineId), eq(bankStatementLines.tenantId, params.tenantId)))
      .for("update");
    if (!line) throw new HttpError(404, "Bank statement line not found. Reload and try again.", "LINE_NOT_FOUND");
    if (line.bankAccountId !== request.bankAccountId) {
      throw new HttpError(422, "That line is from a different bank than the one the agent deposited into", "WRONG_BANK");
    }
    if (line.direction !== "CR") {
      throw new HttpError(422, "Only a credit (money in) line can be linked to a deposit", "NOT_A_CREDIT");
    }
    if (line.matchStatus !== "unmatched" || line.matchedToId !== null) {
      throw new HttpError(422, "That bank line is already matched to another record", "LINE_ALREADY_CLAIMED");
    }
    const [other] = await tx
      .select({ id: fundRequests.id })
      .from(fundRequests)
      .where(
        and(
          eq(fundRequests.matchedLineId, line.id),
          sql`${fundRequests.id} <> ${request.id}`,
          inArray(fundRequests.status, OPEN_STATUSES),
        ),
      )
      .limit(1);
    if (other) {
      throw new HttpError(422, `That bank line is already linked to fund request #${other.id}`, "LINE_ALREADY_CLAIMED");
    }

    const next: FundRequestStatus = line.amount === request.amount ? "under_review" : "amount_mismatch";
    await tx
      .update(fundRequests)
      .set({ status: next, matchedLineId: line.id, matchConfidence: null })
      .where(eq(fundRequests.id, request.id));
    await recordEvent(tx, request.id, request.status, next, params.adminId, "admin", {
      action: "line_linked",
      statementLineId: line.id.toString(),
    });
    return { status: next };
  });
}
