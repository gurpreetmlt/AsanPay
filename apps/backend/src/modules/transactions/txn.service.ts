import { and, eq, desc, sql, lt, or } from "drizzle-orm";
import { db } from "../../db/postgres";
import { services, transactions, users, wallets } from "../../db/postgres/schema";
import { transferBetweenWallets, adjustWalletHold } from "../wallet/wallet.ledger";
import { toPaise, fromPaise } from "../wallet/decimal";
import { resolveProvidersForService, callProvider, type RoutedProvider } from "../providers/provider.router";
import type { ProviderOperation, ProviderResult } from "../providers/types";
import { HttpError } from "../../utils/httpError";
import { generateTxnRef } from "../../utils/uid";
import { logger } from "../../utils/logger";
import { sendOpsAlert } from "../../utils/alert";
import { env } from "../../config/env";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import type { UserRole, WalletType } from "@asanpay/shared-types";

type Actor = { id: string; role: UserRole };
type TxnRow = typeof transactions.$inferSelect;

// Which direction money moves for a service, from the retailer's point of view.
//  - debit  (DMT/BBPS/recharge/...): retailer wallet -> system wallet, then provider pays out.
//  - credit (AEPS withdraw/Aadhaar Pay): retailer hands cash over the counter and is
//    reimbursed system wallet -> retailer AEPS wallet — but only AFTER provider success,
//    so nothing moves up-front for credit-type services.
type MoneyDirection = "debit" | "credit" | "none";

export interface ExecuteTxnInput {
  actor: Actor;
  serviceCode: string;
  amount: string | null;
  idempotencyKey: string;
  operation: ProviderOperation;
  direction: MoneyDirection;
  /** Retailer-side wallet the money leaves from / lands in. */
  walletType: WalletType;
  metadata: Record<string, unknown>;
  invoke: (routed: RoutedProvider, txnRef: string) => Promise<ProviderResult>;
}

export interface TxnOutcome {
  txn: TxnRow;
  provider: ProviderResult | null;
}

// The platform's single real-money settlement counterparty at the aggregator/provider —
// structurally marked walletKind = "aggregator" (see wallets schema), not just "whichever
// wallet the root admin happens to have". Every service txn nets against it, so float usage
// is always visible in one place.
async function getSystemWallet(): Promise<{ walletId: string }> {
  const [wallet] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.walletKind, "aggregator"), eq(wallets.walletType, "main")))
    .limit(1);
  if (!wallet) throw new HttpError(500, "System wallet not configured", "SYSTEM_WALLET_MISSING");
  return { walletId: wallet.id };
}

async function getUserWallet(userId: string, walletType: WalletType): Promise<{ walletId: string }> {
  const [wallet] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.walletType, walletType)));
  if (!wallet) throw new HttpError(404, `${walletType} wallet not found`, "WALLET_NOT_FOUND");
  return { walletId: wallet.id };
}

async function assertCanTransact(actor: Actor): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!user || !user.isActive) throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  if (user.kycStatus !== "verified") {
    throw new HttpError(403, "Complete KYC verification to transact", "KYC_NOT_VERIFIED");
  }
}

async function getServiceOrThrow(serviceCode: string) {
  const [service] = await db.select().from(services).where(eq(services.code, serviceCode));
  if (!service || !service.isActive) {
    throw new HttpError(503, "This service is currently unavailable", "SERVICE_DISABLED");
  }
  return service;
}

function assertAmountWithinLimits(
  amount: string | null,
  service: { minAmount: string | null; maxAmount: string | null; name: string },
): void {
  if (amount == null) return;
  const paise = toPaise(amount);
  if (paise <= 0) throw new HttpError(422, "Amount must be positive", "INVALID_AMOUNT");
  if (service.minAmount && paise < toPaise(service.minAmount)) {
    throw new HttpError(422, `Minimum amount for ${service.name} is ₹${service.minAmount}`, "AMOUNT_BELOW_MIN");
  }
  if (!service.maxAmount) {
    throw new HttpError(503, `${service.name} has no max amount configured`, "AMOUNT_LIMIT_MISSING");
  }
  if (paise > toPaise(service.maxAmount)) {
    throw new HttpError(422, `Maximum amount for ${service.name} is ₹${service.maxAmount}`, "AMOUNT_ABOVE_MAX");
  }
}

// ── The engine ──────────────────────────────────────────────────────────────
// Sequence: idempotency-replay -> validations -> hold money (debit services)
// -> provider call -> finalize (commit / reverse / stay pending).
export async function executeServiceTxn(input: ExecuteTxnInput): Promise<TxnOutcome> {
  const { actor, serviceCode, amount, idempotencyKey, operation, direction, walletType, metadata, invoke } = input;

  // Fast path: already claimed / settled for this key — never re-run money or provider.
  const [existing] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.idempotencyKey, idempotencyKey), eq(transactions.userId, actor.id)));
  if (existing) return { txn: existing, provider: null };

  await assertCanTransact(actor);
  const service = await getServiceOrThrow(serviceCode);
  assertAmountWithinLimits(amount, service);

  const routedProviders = await resolveProvidersForService(serviceCode);
  const routed = routedProviders[0]!; // fail-over between providers is a later enhancement

  const txnRef = generateTxnRef();
  const needsMoney = direction !== "none" && amount != null;
  const systemWallet = needsMoney ? await getSystemWallet() : null;
  const userWallet = needsMoney ? await getUserWallet(actor.id, walletType) : null;

  // Claim + optional debit under one advisory lock so parallel same-key requests cannot
  // both insert+debit. Debit uses the same DB tx so a failed balance check rolls back the row.
  let txn: TxnRow;
  let replayOnly = false;
  try {
    const claimed = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${actor.id}:${idempotencyKey}`}))`);

      const [again] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.idempotencyKey, idempotencyKey), eq(transactions.userId, actor.id)));
      if (again) return { row: again, replay: true as const };

      const [created] = await tx
        .insert(transactions)
        .values({
          txnRef,
          idempotencyKey,
          userId: actor.id,
          serviceId: service.id,
          providerId: routed.providerId,
          amount: amount ?? "0",
          status: "initiated",
          walletType,
          metadata,
        })
        .returning();
      const row = created!;

      if (needsMoney && direction === "debit") {
        // Same tx as insert: insufficient balance rolls back the claim row (no orphan initiated txn).
        await transferBetweenWallets(
          {
            fromWalletId: userWallet!.walletId,
            toWalletId: systemWallet!.walletId,
            amount: amount!,
            referenceType: "service_txn",
            referenceId: row.id,
            description: `${service.name} ${txnRef}`,
          },
          tx,
        );
        // Mirror the reservation on the retailer's own wallet row so "Locked vs Available"
        // reporting doesn't need to re-derive it from open transactions.
        await adjustWalletHold(tx, userWallet!.walletId, amount!, "hold");
      }

      return { row, replay: false as const };
    });
    txn = claimed.row;
    replayOnly = claimed.replay;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const [raced] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.idempotencyKey, idempotencyKey), eq(transactions.userId, actor.id)));
    if (raced) return { txn: raced, provider: null };
    throw err;
  }

  if (replayOnly) return { txn, provider: null };

  // 3. Provider call (outside the money lock — may be slow / network).
  const result = await callProvider(routed, operation, txnRef, { ...metadata, amount }, (adapter) =>
    invoke({ ...routed, adapter }, txnRef),
  );

  // 4. Finalize.
  const finalized = await finalizeTxn(txn, result, { direction, walletType });
  return { txn: finalized, provider: result };
}

interface FinalizeContext {
  direction: MoneyDirection;
  walletType: WalletType;
}

/**
 * Credit settlement amount: prefer provider-confirmed amount when it is a valid positive
 * rupee string; otherwise fall back to the requested/locked amount. Debit reversals always
 * reverse the locked (already-debited) amount — never trust a provider figure for that.
 */
export function resolveCreditSettlementAmount(
  lockedAmount: string,
  providerAmount: string | null | undefined,
): string {
  if (providerAmount == null || providerAmount === "") return lockedAmount;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(providerAmount.trim())) return lockedAmount;
  try {
    const paise = toPaise(providerAmount);
    if (!Number.isFinite(paise) || paise <= 0) return lockedAmount;
    return fromPaise(paise);
  } catch {
    return lockedAmount;
  }
}

// Settles a transaction exactly once. The whole thing runs in a single DB transaction that
// FIRST locks the txn row and re-checks its status: if a concurrent call (a second /recheck,
// or recheck racing the initial submit) already moved it to a terminal state, this call moves
// NO money and returns the settled row. Money movement and the status flip that authorizes it
// commit or roll back together, so a pending txn can never be credited/reversed twice.
async function finalizeTxn(txn: TxnRow, result: ProviderResult, ctx: FinalizeContext): Promise<TxnRow> {
  const needsMoney = ctx.direction !== "none" && toPaise(txn.amount) > 0;

  const { row: settled, didSettleSuccess } = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, txn.id))
      .for("update");
    if (!locked) throw new HttpError(404, "Transaction not found", "TXN_NOT_FOUND");

    // Idempotency guard: only a txn still in flight may be settled. A terminal txn means a
    // concurrent finalize already ran — return it untouched, moving no money.
    if (locked.status !== "pending" && locked.status !== "initiated") {
      return { row: locked, didSettleSuccess: false };
    }

    if (result.status === "success") {
      // Credit services reimburse the retailer only now, after provider confirmation — in the
      // same tx as the status flip, so it commits atomically with "this txn is now settled".
      // Prefer provider-confirmed amount (partial/dispense mismatch) over the original request.
      const creditAmount =
        needsMoney && ctx.direction === "credit"
          ? resolveCreditSettlementAmount(locked.amount, result.amount)
          : locked.amount;
      if (needsMoney && ctx.direction === "credit") {
        const systemWallet = await getSystemWallet();
        const userWallet = await getUserWallet(txn.userId, ctx.walletType);
        await transferBetweenWallets(
          {
            fromWalletId: systemWallet.walletId,
            toWalletId: userWallet.walletId,
            amount: creditAmount,
            referenceType: "service_txn",
            referenceId: locked.id,
            description: `Service credit ${locked.txnRef}`,
          },
          tx,
        );
      }
      if (needsMoney && ctx.direction === "debit") {
        const userWallet = await getUserWallet(txn.userId, ctx.walletType);
        await adjustWalletHold(tx, userWallet.walletId, locked.amount, "release");
      }
      const [updated] = await tx
        .update(transactions)
        .set({
          status: "success",
          amount: needsMoney && ctx.direction === "credit" ? creditAmount : locked.amount,
          providerTxnId: result.providerTxnId,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, locked.id))
        .returning();
      return { row: updated!, didSettleSuccess: true };
    }

    if (result.status === "failed") {
      // Undo the up-front debit with an explicit balanced reversal group.
      // Always reverse locked.amount (what left the retailer wallet) — not result.amount.
      if (needsMoney && ctx.direction === "debit") {
        const systemWallet = await getSystemWallet();
        const userWallet = await getUserWallet(txn.userId, ctx.walletType);
        await transferBetweenWallets(
          {
            fromWalletId: systemWallet.walletId,
            toWalletId: userWallet.walletId,
            amount: locked.amount,
            referenceType: "reversal",
            referenceId: locked.id,
            description: `Auto-reversal ${locked.txnRef}: ${result.message}`,
          },
          tx,
        );
        await adjustWalletHold(tx, userWallet.walletId, locked.amount, "release");
      }
      const [updated] = await tx
        .update(transactions)
        .set({
          status: "failed",
          providerTxnId: result.providerTxnId,
          failureReason: result.message,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, locked.id))
        .returning();
      return { row: updated!, didSettleSuccess: false };
    }

    // pending: money (if any) stays held with the system wallet until recheck resolves it.
    const [updated] = await tx
      .update(transactions)
      .set({ status: "pending", providerTxnId: result.providerTxnId, updatedAt: new Date() })
      .where(eq(transactions.id, locked.id))
      .returning();
    return { row: updated!, didSettleSuccess: false };
  });

  // Commission runs only for the single call that actually settled the txn to success, and only
  // after that commit — never for a concurrent no-op finalize. Fire-and-forget: a payout failure
  // must not fail the customer's transaction.
  if (didSettleSuccess) distributeCommissionSafe(settled);
  return settled;
}

// An `initiated` txn may still be mid-submit inside executeServiceTxn — its own finalize will
// settle it. Rechecking during that window is a money loophole: a real provider queried by
// clientRef for a txn it has NOT received yet can answer "not found → failed", which would reverse
// the up-front debit (refund the retailer) while the in-flight submit is about to succeed — i.e.
// the service actually happens but the retailer is refunded, a direct platform loss. Only let
// recheck touch an `initiated` txn once it is older than the widest possible submit window, by
// which point any in-flight submit has definitely returned (or the process crashed mid-submit —
// the one legitimate recovery case). `pending` txns are always safe to recheck: the provider has
// already acknowledged them, so a status query is authoritative.
export const INITIATED_RECHECK_GRACE_MS = 90_000;

export function canRecheckInitiated(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= INITIATED_RECHECK_GRACE_MS;
}

// ── Status recheck (pending -> success/failed) ─────────────────────────────
export async function recheckTxnStatus(actor: Actor, txnRef: string): Promise<TxnOutcome> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.txnRef, txnRef));
  if (!txn) throw new HttpError(404, "Transaction not found", "TXN_NOT_FOUND");
  if (actor.role !== "admin" && txn.userId !== actor.id) {
    throw new HttpError(403, "Not your transaction", "FORBIDDEN");
  }
  if (txn.status !== "pending" && txn.status !== "initiated") {
    return { txn, provider: null };
  }
  // Don't race an in-flight initial submit (see canRecheckInitiated) — return as-is; the original
  // request will settle it, or a later recheck (past the grace window) will recover a crashed one.
  if (txn.status === "initiated" && !canRecheckInitiated(txn.createdAt, new Date())) {
    return { txn, provider: null };
  }

  const [service] = await db.select().from(services).where(eq(services.id, txn.serviceId));
  if (!service) throw new HttpError(500, "Service missing for transaction", "SERVICE_MISSING");

  const routedProviders = await resolveProvidersForService(service.code);
  const routed = routedProviders[0]!;

  const result = await callProvider(routed, "check_status", txn.txnRef, { txnRef: txn.txnRef }, (adapter) =>
    adapter.checkStatus({
      providerTxnId: txn.providerTxnId,
      clientRef: txn.txnRef,
      // InstantPay reports API needs the txn date in IST (YYYY-MM-DD).
      txnDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(txn.createdAt),
      serviceCode: service.code,
    }),
  );

  // Recheck context: direction from service code; wallet from the stored txn row (not re-derived).
  const direction: MoneyDirection = inferDirectionFromServiceCode(service.code);
  const walletType: WalletType =
    (txn.walletType as WalletType | null) ?? (direction === "credit" ? "aeps" : "main");
  const finalized = await finalizeTxn(txn, result, { direction, walletType });

  await insertAuditLog({
    userId: actor.id,
    action: "txn.status_recheck",
    entityType: "transaction",
    entityId: txn.id,
    ipAddress: null,
    userAgent: null,
    metadata: { from: txn.status, to: finalized.status },
  });

  return { txn: finalized, provider: result };
}

/** Pending older than this may be auto-reconciled (provider already acknowledged). */
export const PENDING_RECONCILE_MIN_AGE_MS = 120_000;

/**
 * Background sweep: settle pending / crash-stale initiated txns so held wallet money is not
 * stuck forever when nobody taps /recheck. Skips initiated rows still inside the submit window.
 * Safe to run concurrently with user rechecks — finalizeTxn row-locks make settlement once-only.
 */
export async function reconcileStaleTransactions(limit = 40): Promise<{ checked: number; changed: number }> {
  const now = Date.now();
  const initiatedCutoff = new Date(now - INITIATED_RECHECK_GRACE_MS);
  const pendingCutoff = new Date(now - PENDING_RECONCILE_MIN_AGE_MS);
  const stuckCutoff = new Date(now - env.TXN_STUCK_ALERT_MS);

  const candidates = await db
    .select()
    .from(transactions)
    .where(
      or(
        and(eq(transactions.status, "pending"), lt(transactions.updatedAt, pendingCutoff)),
        and(eq(transactions.status, "initiated"), lt(transactions.createdAt, initiatedCutoff)),
      ),
    )
    .orderBy(transactions.updatedAt)
    .limit(limit);

  let changed = 0;
  for (const txn of candidates) {
    try {
      const before = txn.status;
      const outcome = await recheckTxnStatus(
        { id: txn.userId, role: "admin" },
        txn.txnRef,
      );
      if (outcome.txn.status !== before) changed += 1;

      if (outcome.txn.status === before && txn.createdAt < stuckCutoff) {
        void sendOpsAlert("Transaction stuck past reconcile threshold", {
          txnRef: txn.txnRef,
          status: outcome.txn.status,
          createdAt: txn.createdAt,
          ageMs: now - txn.createdAt.getTime(),
        });
      }
    } catch (err) {
      logger.error({ err, txnRef: txn.txnRef }, "txn reconcile failed");
      void sendOpsAlert("Transaction reconcile threw an error", {
        txnRef: txn.txnRef,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { checked: candidates.length, changed };
}

/**
 * Daily full-sweep reconciliation: cross-checks every non-terminal transaction from the last
 * `lookbackDays` against the provider's live status API (adapters expose no batch recon-file
 * endpoint today, so per-txn checkStatus is the closest equivalent) and alerts on any mismatch
 * between what our DB says and what the provider reports.
 */
export async function runDailyReconciliation(
  lookbackDays = 7,
): Promise<{ checked: number; mismatched: number }> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select()
    .from(transactions)
    .where(and(or(eq(transactions.status, "pending"), eq(transactions.status, "initiated")), sql`${transactions.createdAt} >= ${since}`))
    .orderBy(transactions.updatedAt);

  let mismatched = 0;
  for (const txn of candidates) {
    try {
      const before = txn.status;
      const outcome = await recheckTxnStatus({ id: txn.userId, role: "admin" }, txn.txnRef);
      if (outcome.txn.status !== before) {
        mismatched += 1;
        void sendOpsAlert("Daily reconciliation found a status mismatch", {
          txnRef: txn.txnRef,
          dbStatusBefore: before,
          providerStatusNow: outcome.txn.status,
        });
      }
    } catch (err) {
      logger.error({ err, txnRef: txn.txnRef }, "daily reconciliation check failed");
      void sendOpsAlert("Daily reconciliation check threw an error", {
        txnRef: txn.txnRef,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { checked: candidates.length, mismatched };
}

export function inferDirectionFromServiceCode(code: string): MoneyDirection {
  if (code === "aeps_balance_enquiry" || code === "aeps_mini_statement") return "none";
  // Deposit is the odd AEPS one out: retailer wallet funds the customer's bank credit (debit).
  if (code === "aeps_cash_deposit") return "debit";
  if (code.startsWith("aeps_") || code === "aadhaar_pay") return "credit";
  return "debit";
}

// ── History / receipt reads ─────────────────────────────────────────────────
export async function listMyTransactions(actor: Actor, limit = 50, offset = 0) {
  return db
    .select({
      id: transactions.id,
      txnRef: transactions.txnRef,
      amount: transactions.amount,
      status: transactions.status,
      walletType: transactions.walletType,
      serviceId: transactions.serviceId,
      serviceName: services.name,
      serviceCode: services.code,
      createdAt: transactions.createdAt,
      completedAt: transactions.completedAt,
    })
    .from(transactions)
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(eq(transactions.userId, actor.id))
    .orderBy(desc(transactions.createdAt))
    .limit(Math.min(limit, 100))
    .offset(offset);
}

export async function getReceipt(actor: Actor, txnRef: string) {
  const [row] = await db
    .select({
      txnRef: transactions.txnRef,
      amount: transactions.amount,
      customerFee: transactions.customerFee,
      status: transactions.status,
      walletType: transactions.walletType,
      failureReason: transactions.failureReason,
      providerTxnId: transactions.providerTxnId,
      metadata: transactions.metadata,
      serviceName: services.name,
      serviceCode: services.code,
      userId: transactions.userId,
      initiatedAt: transactions.initiatedAt,
      completedAt: transactions.completedAt,
    })
    .from(transactions)
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(eq(transactions.txnRef, txnRef));
  if (!row) throw new HttpError(404, "Transaction not found", "TXN_NOT_FOUND");
  if (actor.role !== "admin" && row.userId !== actor.id) {
    throw new HttpError(403, "Not your transaction", "FORBIDDEN");
  }
  return row;
}

// Placeholder until the commission engine lands (next module): logs instead of paying.
function distributeCommissionSafe(txn: TxnRow): void {
  import("../commission/commission.service")
    .then((mod) => mod.distributeCommissionForTxn(txn.id))
    .catch((err: unknown) => {
      logger.error({ err, txnId: txn.id }, "commission distribution failed");
      void sendOpsAlert("Commission distribution failed", {
        txnId: txn.id,
        txnRef: txn.txnRef,
        err: err instanceof Error ? err.message : String(err),
      });
    });
}
