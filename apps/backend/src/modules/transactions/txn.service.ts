import { and, eq, desc, sql, lt, or, inArray, ne } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  accounts,
  journals,
  providers,
  reconAdjustments,
  services,
  tenants,
  transactions,
  users,
  walletLedgerEntries,
  walletLedgerGroups,
  wallets,
} from "../../db/postgres/schema";
import { transferBetweenWallets, adjustWalletHold, legacyTenantCode } from "../wallet/wallet.ledger";
import { toPaise, fromPaise } from "../wallet/decimal";
import {
  resolveProvidersForService,
  callProvider,
  isStubBlocked,
  type RoutedProvider,
} from "../providers/provider.router";
import { getAdapterByCode } from "../providers/provider.registry";
import type { ProviderOperation, ProviderResult } from "../providers/types";
import { HttpError } from "../../utils/httpError";
import { generateTxnRef } from "../../utils/uid";
import { logger } from "../../utils/logger";
import { sendSlackAlert, sendOpsAlert } from "../../utils/alert";
import { env } from "../../config/env";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import type { UserRole, WalletType } from "@asanpay/shared-types";
import { resolveCustomerFee } from "../service-charges/serviceCharge.service";
import { evaluateVelocitySpike, effectiveDailyLimit } from "../limits/velocity.service";
import { resolveTaxForService, splitFeeGstRupees } from "../commission/tax.service";

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
  /** Principal the provider moves (DMT payout, recharge, bill). */
  amount: string | null;
  /**
   * @deprecated Ignored for debit — fee is always resolved server-side from `service_charges`
   * via resolveCustomerFee (never from the client body). Kept optional so call sites compile.
   */
  customerFee?: string | null;
  idempotencyKey: string;
  operation: ProviderOperation;
  direction: MoneyDirection;
  /** Retailer-side wallet the money leaves from / lands in. */
  walletType: WalletType;
  metadata: Record<string, unknown>;
  invoke: (routed: RoutedProvider, txnRef: string) => Promise<ProviderResult>;
}

/** Wallet charge for a debit: principal + customer fee + GST on fee (rupees). */
function serviceChargeTotal(
  principal: string,
  customerFee?: string | null,
  customerFeeGst?: string | null,
): string {
  const feePaise = customerFee ? toPaise(customerFee) : 0;
  const gstPaise = customerFeeGst ? toPaise(customerFeeGst) : 0;
  if (feePaise < 0) throw new HttpError(422, "Customer fee cannot be negative", "INVALID_CUSTOMER_FEE");
  if (gstPaise < 0) throw new HttpError(422, "Fee GST cannot be negative", "INVALID_CUSTOMER_FEE_GST");
  return fromPaise(toPaise(principal) + feePaise + gstPaise);
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
  if (!wallet) throw new HttpError(500, "System balance not configured", "SYSTEM_WALLET_MISSING");
  return { walletId: wallet.id };
}

async function getUserWallet(userId: string, walletType: WalletType): Promise<{ walletId: string }> {
  const [wallet] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.walletType, walletType)));
  if (!wallet) throw new HttpError(404, `${walletType === "main" ? "Main" : walletType === "aeps" ? "AEPS" : walletType} balance not found`, "WALLET_NOT_FOUND");
  return { walletId: wallet.id };
}

async function assertCanTransact(actor: Actor): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!user || !user.isActive) throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  if (user.kycStatus !== "verified") {
    void sendSlackAlert("KYC issue blocked a live transaction", "critical", {
      retailerId: user.id,
      retailerName: user.name,
      kycStatus: user.kycStatus,
    });
    throw new HttpError(403, "Complete KYC verification to transact", "KYC_NOT_VERIFIED");
  }
}

/**
 * Rule-based fraud heuristics — alert-only (never blocks the transaction). Two checks:
 * rapid repeated transactions in a short window, and an amount far above the retailer's
 * recent average for this service. Either firing is informational for ops, not a hard gate.
 */
async function checkFraudPatterns(actor: Actor, serviceId: string, amount: string | null): Promise<void> {
  const rapidWindowStart = new Date(Date.now() - env.FRAUD_RAPID_TXN_WINDOW_MS);
  const [rapidCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.userId, actor.id), sql`${transactions.createdAt} >= ${rapidWindowStart}`));
  if ((rapidCount?.count ?? 0) >= env.FRAUD_RAPID_TXN_COUNT) {
    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, actor.id));
    void sendSlackAlert("Suspicious activity: rapid repeated transactions", "critical", {
      retailerId: actor.id,
      retailerName: user?.name,
      txnCountInWindow: rapidCount?.count,
      windowMs: env.FRAUD_RAPID_TXN_WINDOW_MS,
    });
  }

  if (amount == null) return;
  const [avgRow] = await db
    .select({ avgAmount: sql<string>`coalesce(avg(${transactions.amount}), '0')`, sampleSize: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.userId, actor.id), eq(transactions.serviceId, serviceId), eq(transactions.status, "success")));
  const avg = Number(avgRow?.avgAmount ?? 0);
  const sampleSize = avgRow?.sampleSize ?? 0;
  if (sampleSize >= 3 && avg > 0 && Number(amount) > avg * env.FRAUD_AMOUNT_SPIKE_MULTIPLIER) {
    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, actor.id));
    void sendSlackAlert("Suspicious activity: amount far above usual pattern", "critical", {
      retailerId: actor.id,
      retailerName: user?.name,
      amount,
      recentAverage: avg.toFixed(2),
    });
  }
}

/**
 * Alerts (never blocks) when a retailer's successful transactions today cross their daily
 * limit. Falls back to a role-based default (velocity.service.ROLE_DEFAULT_DAILY_LIMIT) when
 * the agent has none configured — previously null meant "no limit at all", which is not a
 * default, it is the absence of one.
 */
async function checkDailyLimit(actor: Actor, amount: string | null): Promise<void> {
  if (amount == null) return;
  const [user, limit] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, actor.id)).then((r) => r[0]),
    effectiveDailyLimit(actor.id),
  ]);
  if (!limit) return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${transactions.amount}), '0')` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, actor.id),
        eq(transactions.status, "success"),
        sql`${transactions.createdAt} >= ${startOfDay}`,
      ),
    );
  const todayTotal = Number(row?.total ?? 0) + Number(amount);
  if (todayTotal > Number(limit)) {
    void sendSlackAlert("Daily transaction limit exceeded", "general", {
      retailerId: actor.id,
      retailerName: user?.name,
      todayTotal: todayTotal.toFixed(2),
      dailyLimit: limit,
    });
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
  const {
    actor,
    serviceCode,
    amount,
    customerFee,
    idempotencyKey,
    operation,
    direction,
    walletType,
    metadata,
    invoke,
  } = input;

  // Fast path: already claimed / settled for this key — never re-run money or provider.
  const [existing] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.idempotencyKey, idempotencyKey), eq(transactions.userId, actor.id)));
  if (existing) return { txn: existing, provider: null };

  await assertCanTransact(actor);
  const service = await getServiceOrThrow(serviceCode);
  assertAmountWithinLimits(amount, service);
  void checkFraudPatterns(actor, service.id, amount);
  void checkDailyLimit(actor, amount);
  if (amount != null) void evaluateVelocitySpike(actor.id, amount);

  const routedProviders = await resolveProvidersForService(serviceCode);
  const routed = routedProviders[0]!; // fail-over between providers is a later enhancement

  // All 7 txn.controller debit call sites share this path. Fee is never taken from the client
  // body (input.customerFee is ignored) so a retailer cannot set fee=0. No schedule → "0.00".
  void customerFee;
  const feeConfigured =
    direction === "debit" && amount != null
      ? await resolveCustomerFee(service.id, routed.providerId, actor.role, amount, new Date())
      : "0";

  const [actorRow] = await db
    .select({ uid: users.uid })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  if (!actorRow?.uid) {
    throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  }
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const taxCfg = await resolveTaxForService(await resolveTenantId(), service.id, new Date());
  // Stored fee is always the base (excl. GST): with GST included, fee + GST = the configured fee.
  const feeSplit =
    direction === "debit" && Number(feeConfigured) > 0
      ? splitFeeGstRupees(feeConfigured, taxCfg)
      : { fee: feeConfigured, gst: "0.00" };
  const feeNormalized = feeSplit.fee;
  const feeGstNormalized = feeSplit.gst;

  const txnRef = generateTxnRef(actorRow.uid);
  const needsMoney = direction !== "none" && amount != null;
  const debitTotal =
    needsMoney && direction === "debit" && amount != null
      ? serviceChargeTotal(amount, feeNormalized, feeGstNormalized)
      : amount;
  const systemWallet = needsMoney ? await getSystemWallet() : null;
  const userWallet = needsMoney ? await getUserWallet(actor.id, walletType) : null;

  // Claim + optional debit under one advisory lock so parallel same-key requests cannot
  // both insert+debit. Debit uses the same DB tx so a failed balance check rolls back the row.
  let txn: TxnRow;
  let replayOnly: boolean;
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
          customerFee: feeNormalized,
          customerFeeGst: feeGstNormalized,
          status: "initiated",
          walletType,
          metadata,
        })
        .returning();
      const row = created!;

      if (needsMoney && direction === "debit") {
        // Same tx as insert: insufficient balance rolls back the claim row (no orphan initiated txn).
        // Debit principal + fee so the journal can Cr FLOAT (principal) + Cr COMMISSION_INCOME (fee).
        await transferBetweenWallets(
          {
            fromWalletId: userWallet!.walletId,
            toWalletId: systemWallet!.walletId,
            amount: debitTotal!,
            referenceType: "service_txn",
            referenceId: row.id,
            description: `${service.name} ${txnRef}`,
          },
          tx,
        );
        // Mirror the reservation on the retailer's own wallet row so "Locked vs Available"
        // reporting doesn't need to re-derive it from open transactions.
        await adjustWalletHold(tx, userWallet!.walletId, debitTotal!, "hold");
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
  /** Skip the critical failure alert (expected outcomes such as an unpaid QR). */
  quietFailure?: boolean;
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

const PROVIDER_ECONOMICS_KEYS = [
  "rrn",
  "commission",
  "surcharge",
  "charges",
  "transactionId",
  "apiTransactionId",
] as const;

/**
 * Small scalar fields from the provider response kept on the txn row — provider commission /
 * charges for margin reports and the RRN + provider transaction id the daily recon upload needs.
 */
export function withProviderEconomics(
  metadata: Record<string, unknown> | null,
  result: ProviderResult,
): Record<string, unknown> | null {
  const data = (result.data ?? {}) as Record<string, unknown>;
  const picked: Record<string, string> = {};
  for (const key of PROVIDER_ECONOMICS_KEYS) {
    const v = data[key];
    if ((typeof v === "string" && v.trim()) || typeof v === "number") picked[key] = String(v).trim().slice(0, 100);
  }
  if (Object.keys(picked).length === 0) return metadata;
  const prev = (metadata?.provider ?? {}) as Record<string, unknown>;
  return { ...(metadata ?? {}), provider: { ...prev, ...picked } };
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

    const lockedDebitHeld =
      needsMoney && ctx.direction === "debit"
        ? serviceChargeTotal(locked.amount, locked.customerFee, locked.customerFeeGst)
        : locked.amount;

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
        await adjustWalletHold(tx, userWallet.walletId, lockedDebitHeld, "release");
      }
      const [updated] = await tx
        .update(transactions)
        .set({
          status: "success",
          amount: needsMoney && ctx.direction === "credit" ? creditAmount : locked.amount,
          providerTxnId: result.providerTxnId,
          metadata: withProviderEconomics(locked.metadata, result),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, locked.id))
        .returning();
      return { row: updated!, didSettleSuccess: true };
    }

    if (result.status === "failed") {
      // Undo the up-front debit with an explicit balanced reversal group.
      // Always reverse what left the retailer wallet (principal + fee) — not result.amount.
      if (needsMoney && ctx.direction === "debit") {
        const systemWallet = await getSystemWallet();
        const userWallet = await getUserWallet(txn.userId, ctx.walletType);
        await transferBetweenWallets(
          {
            fromWalletId: systemWallet.walletId,
            toWalletId: userWallet.walletId,
            amount: lockedDebitHeld,
            referenceType: "reversal",
            referenceId: locked.id,
            description: `Auto-reversal ${locked.txnRef}: ${result.message}`,
          },
          tx,
        );
        await adjustWalletHold(tx, userWallet.walletId, lockedDebitHeld, "release");
      }
      const [updated] = await tx
        .update(transactions)
        .set({
          status: "failed",
          providerTxnId: result.providerTxnId,
          metadata: withProviderEconomics(locked.metadata, result),
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
      .set({
        status: "pending",
        providerTxnId: result.providerTxnId,
        metadata: withProviderEconomics(locked.metadata, result),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, locked.id))
      .returning();
    return { row: updated!, didSettleSuccess: false };
  });

  // Commission runs only for the single call that actually settled the txn to success, and only
  // after that commit — never for a concurrent no-op finalize. Fire-and-forget: a payout failure
  // must not fail the customer's transaction.
  if (didSettleSuccess) distributeCommissionSafe(settled);
  if (settled.status === "failed" && !ctx.quietFailure) {
    void sendSlackAlert("Transaction failure", "critical", {
      retailerId: settled.userId,
      txnRef: settled.txnRef,
      amount: settled.amount,
      errorCode: "TXN_FAILED",
      message: settled.failureReason ?? undefined,
    });
  }
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

/**
 * Status must come from the provider that processed the txn — after a rail switch the current
 * primary has never seen it, and a "not found" there would refund a txn that may have succeeded.
 */
async function resolveRecheckProvider(providerId: string | null, serviceCode: string): Promise<RoutedProvider> {
  if (!providerId) {
    const routedProviders = await resolveProvidersForService(serviceCode);
    return routedProviders[0]!;
  }
  const [row] = await db.select({ id: providers.id, code: providers.code }).from(providers).where(eq(providers.id, providerId));
  const adapter = row ? getAdapterByCode(row.code) : null;
  if (!row || !adapter || isStubBlocked(adapter, env.NODE_ENV, env.ALLOW_STUB_PROVIDERS)) {
    throw new HttpError(
      409,
      "This transaction was processed by a provider that is no longer connected. Contact support to settle it manually.",
      "TXN_PROVIDER_UNAVAILABLE",
    );
  }
  return { adapter, providerId: row.id, providerServiceCode: `${row.code}:${serviceCode}` };
}

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

  const routed = await resolveRecheckProvider(txn.providerId, service.code);

  const result = await callProvider(routed, "check_status", txn.txnRef, { txnRef: txn.txnRef }, (adapter) =>
    adapter.checkStatus({
      providerTxnId: txn.providerTxnId,
      clientRef: txn.txnRef,
      // Provider status APIs need the txn date in IST (YYYY-MM-DD).
      txnDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(txn.createdAt),
      serviceCode: service.code,
      createdAt: txn.createdAt,
    }),
  );

  // Recheck context: direction from service code; wallet from the stored txn row (not re-derived).
  const direction: MoneyDirection = inferDirectionFromServiceCode(service.code);
  const walletType: WalletType =
    (txn.walletType as WalletType | null) ?? (direction === "credit" ? "aeps" : "main");
  // An unpaid UPI QR expiring is routine, not an incident.
  const finalized = await finalizeTxn(txn, result, {
    direction,
    walletType,
    quietFailure: service.code === "UPI_CASH_POINT",
  });

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

/**
 * Provider push callback (e.g. VyaparAPI partner callback) already knows the terminal
 * status — settle without calling the provider again.
 */
export async function settleTxnFromProviderCallback(
  txnRef: string,
  result: ProviderResult,
): Promise<TxnOutcome> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.txnRef, txnRef));
  if (!txn) throw new HttpError(404, "Transaction not found for partnerid", "TXN_NOT_FOUND");
  if (txn.status !== "pending" && txn.status !== "initiated") {
    return { txn, provider: result };
  }

  const [service] = await db.select().from(services).where(eq(services.id, txn.serviceId));
  if (!service) throw new HttpError(500, "Service missing for transaction", "SERVICE_MISSING");

  const direction: MoneyDirection = inferDirectionFromServiceCode(service.code);
  const walletType: WalletType =
    (txn.walletType as WalletType | null) ?? (direction === "credit" ? "aeps" : "main");
  const finalized = await finalizeTxn(txn, result, { direction, walletType });

  await insertAuditLog({
    userId: null,
    action: "txn.provider_callback",
    entityType: "transaction",
    entityId: txn.id,
    ipAddress: null,
    userAgent: null,
    metadata: { from: txn.status, to: finalized.status, providerTxnId: result.providerTxnId },
  });

  return { txn: finalized, provider: result };
}

export interface UnsubmittedTxnCheck {
  txn: TxnRow;
  serviceCode: string;
  direction: MoneyDirection;
  walletType: WalletType;
  /** What a failed settlement returns to the retailer wallet (principal + fee + GST for debits). */
  refundAmount: string;
  /** Debit posted by the double-entry ledger — only these can be auto-reversed. */
  hasDebitJournal: boolean;
  /** Debit recorded for this txn in the pre-ledger wallet book ("0.00" when none). */
  legacyDebitAmount: string;
  /** A pre-ledger reversal already exists for this txn. */
  legacyReversed: boolean;
  /** Wallet-book lines of any kind referencing this txn on the retailer's wallets. */
  walletBookEntries: number;
  /** The retailer's ledger account — the credit side of a manual refund. */
  agentAccountCode: string | null;
  /** Part of the wallet hold that still belongs to this txn. */
  heldForThisTxn: string;
}

/**
 * Guards for manually failing a stuck txn that no provider can answer for: it must still be in
 * flight, past the submit window, carry no provider order id, and its provider (if any) must be
 * disconnected — otherwise a status recheck is the only safe path.
 */
export async function checkUnsubmittedTxn(txnRef: string): Promise<UnsubmittedTxnCheck> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.txnRef, txnRef));
  if (!txn) throw new HttpError(404, `Transaction ${txnRef} not found`, "TXN_NOT_FOUND");
  if (txn.status !== "pending" && txn.status !== "initiated") {
    throw new HttpError(409, `Transaction ${txnRef} is already ${txn.status}`, "TXN_ALREADY_SETTLED");
  }
  if (!canRecheckInitiated(txn.createdAt, new Date())) {
    throw new HttpError(409, `Transaction ${txnRef} is still being submitted. Try again in 2 minutes.`, "TXN_IN_FLIGHT");
  }
  if (txn.providerTxnId) {
    throw new HttpError(
      409,
      `Transaction ${txnRef} has a provider order ID. Run a status recheck instead of failing it manually.`,
      "TXN_HAS_PROVIDER_REF",
    );
  }
  if (txn.providerId) {
    const [row] = await db.select({ code: providers.code }).from(providers).where(eq(providers.id, txn.providerId));
    const adapter = row ? getAdapterByCode(row.code) : null;
    if (row && adapter && !isStubBlocked(adapter, env.NODE_ENV, env.ALLOW_STUB_PROVIDERS)) {
      throw new HttpError(
        409,
        `Transaction ${txnRef} is routed to ${row.code}, which is still connected. Run a status recheck instead.`,
        "TXN_PROVIDER_CONNECTED",
      );
    }
  }

  const [service] = await db.select().from(services).where(eq(services.id, txn.serviceId));
  if (!service) throw new HttpError(500, "Service missing for transaction", "SERVICE_MISSING");

  const direction = inferDirectionFromServiceCode(service.code);
  const walletType: WalletType =
    (txn.walletType as WalletType | null) ?? (direction === "credit" ? "aeps" : "main");
  const movesMoney = direction === "debit" && toPaise(txn.amount) > 0;
  const refundAmount = movesMoney ? serviceChargeTotal(txn.amount, txn.customerFee, txn.customerFeeGst) : "0.00";

  const [debitJournal] = await db
    .select({ id: journals.id })
    .from(journals)
    .where(eq(journals.idemKey, `TXN_DR:${txn.id}`))
    .limit(1);

  const [userWallet] = await db
    .select({ id: wallets.id, holdBalance: wallets.holdBalance })
    .from(wallets)
    .where(and(eq(wallets.userId, txn.userId), eq(wallets.walletType, walletType)));

  // Any of the retailer's wallets — older code did not always debit the wallet the row names.
  const legacyRows = await db
    .select({
      referenceType: walletLedgerGroups.referenceType,
      entryType: walletLedgerEntries.entryType,
      amount: walletLedgerEntries.amount,
    })
    .from(walletLedgerEntries)
    .innerJoin(walletLedgerGroups, eq(walletLedgerGroups.id, walletLedgerEntries.groupId))
    .innerJoin(wallets, eq(wallets.id, walletLedgerEntries.walletId))
    .where(and(eq(walletLedgerGroups.referenceId, txn.id), eq(wallets.userId, txn.userId)));
  const legacyDebitPaise = legacyRows
    .filter((r) => r.referenceType === "service_txn" && r.entryType === "debit")
    .reduce((sum, r) => sum + toPaise(r.amount), 0);
  const legacyReversed = legacyRows.some((r) => r.referenceType === "reversal");
  const walletBookEntries = legacyRows.length;

  const [account] = await db
    .select({ code: accounts.code })
    .from(accounts)
    .innerJoin(tenants, eq(tenants.id, accounts.tenantId))
    .where(and(eq(accounts.userId, txn.userId), eq(tenants.code, legacyTenantCode())))
    .limit(1);

  // The wallet hold is one number across all in-flight debits; only the excess over the other
  // open debits can belong to this txn.
  let heldForThisTxn = "0.00";
  if (movesMoney && userWallet) {
    const others = await db
      .select({
        code: services.code,
        amount: transactions.amount,
        customerFee: transactions.customerFee,
        customerFeeGst: transactions.customerFeeGst,
      })
      .from(transactions)
      .innerJoin(services, eq(services.id, transactions.serviceId))
      .where(
        and(
          eq(transactions.userId, txn.userId),
          eq(transactions.walletType, walletType),
          inArray(transactions.status, ["pending", "initiated"]),
          ne(transactions.id, txn.id),
        ),
      );
    const otherHeld = others
      .filter((o) => inferDirectionFromServiceCode(o.code) === "debit")
      .reduce((sum, o) => sum + toPaise(serviceChargeTotal(o.amount, o.customerFee, o.customerFeeGst)), 0);
    const mine = toPaise(userWallet.holdBalance) - otherHeld;
    heldForThisTxn = fromPaise(Math.max(0, Math.min(mine, toPaise(refundAmount))));
  }

  return {
    txn,
    serviceCode: service.code,
    direction,
    walletType,
    refundAmount,
    hasDebitJournal: Boolean(debitJournal),
    legacyDebitAmount: fromPaise(legacyDebitPaise),
    legacyReversed,
    walletBookEntries,
    agentAccountCode: account?.code ?? null,
    heldForThisTxn,
  };
}

/** Ops: fail a txn that never reached a provider, through the normal reversal path. */
export async function failUnsubmittedTxn(txnRef: string, reason: string): Promise<TxnRow> {
  const check = await checkUnsubmittedTxn(txnRef);
  // A reversal mirrors the original debit journal; without one the ledger refuses the refund.
  if (check.direction === "debit" && toPaise(check.refundAmount) > 0 && !check.hasDebitJournal) {
    throw new HttpError(
      409,
      `Transaction ${txnRef} has no ledger debit entry, so it cannot be auto-reversed. Refund ${check.refundAmount} to ${check.agentAccountCode ?? "the retailer's ledger account"} with an approved recon adjustment, then close it with --refund-adjustment.`,
      "TXN_NO_DEBIT_JOURNAL",
    );
  }
  const finalized = await finalizeTxn(
    check.txn,
    {
      success: false,
      status: "failed",
      providerTxnId: null,
      amount: null,
      message: reason,
      data: {},
      raw: { source: "manual_unsubmitted_fail" },
    },
    { direction: check.direction, walletType: check.walletType },
  );

  await insertAuditLog({
    userId: null,
    action: "txn.manual_fail_unsubmitted",
    entityType: "transaction",
    entityId: check.txn.id,
    ipAddress: null,
    userAgent: null,
    metadata: { from: check.txn.status, to: finalized.status, refundAmount: check.refundAmount, reason },
  });

  return finalized;
}

/**
 * Ops: close a stuck txn that never took any money — no ledger journal, no wallet-book line and
 * no wallet hold. Moves no money; marks the txn failed with an audit trail.
 */
export async function closeTxnNeverCharged(txnRef: string, reason: string): Promise<TxnRow> {
  const check = await checkUnsubmittedTxn(txnRef);
  if (check.hasDebitJournal || check.walletBookEntries > 0 || toPaise(check.heldForThisTxn) > 0) {
    throw new HttpError(
      409,
      `Transaction ${txnRef} has money on record (ledger debit, wallet-book entry or hold). Use the refund path instead.`,
      "TXN_WAS_CHARGED",
    );
  }

  const closed = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(transactions).where(eq(transactions.id, check.txn.id)).for("update");
    if (!locked || (locked.status !== "pending" && locked.status !== "initiated")) {
      throw new HttpError(409, `Transaction ${txnRef} is already ${locked?.status ?? "gone"}`, "TXN_ALREADY_SETTLED");
    }
    const [updated] = await tx
      .update(transactions)
      .set({ status: "failed", failureReason: reason, completedAt: new Date(), updatedAt: new Date() })
      .where(eq(transactions.id, locked.id))
      .returning();
    return updated!;
  });

  await insertAuditLog({
    userId: null,
    action: "txn.manual_close_never_charged",
    entityType: "transaction",
    entityId: check.txn.id,
    ipAddress: null,
    userAgent: null,
    metadata: { from: check.txn.status, to: closed.status, amount: check.txn.amount, reason },
  });

  return closed;
}

/**
 * Ops: close a pre-ledger debit txn whose refund was already paid by an approved recon
 * adjustment. Moves no money itself — it only verifies the adjustment matches this txn exactly,
 * releases this txn's share of the wallet hold, and marks the txn failed.
 */
export async function closeTxnRefundedByAdjustment(
  txnRef: string,
  adjustmentId: bigint,
  reason: string,
): Promise<TxnRow> {
  const check = await checkUnsubmittedTxn(txnRef);
  const refundPaise = toPaise(check.refundAmount);
  if (check.direction !== "debit" || refundPaise <= 0 || check.hasDebitJournal) {
    throw new HttpError(
      409,
      `Transaction ${txnRef} can be auto-reversed. Run the script without --refund-adjustment.`,
      "TXN_AUTO_REVERSIBLE",
    );
  }
  if (check.legacyReversed || toPaise(check.legacyDebitAmount) !== refundPaise) {
    throw new HttpError(
      409,
      `Transaction ${txnRef}: wallet debit on record is ${check.legacyDebitAmount}${check.legacyReversed ? " and it was already reversed" : ""}, not ${check.refundAmount}. Do not refund it.`,
      "TXN_LEGACY_DEBIT_MISMATCH",
    );
  }

  const [adj] = await db.select().from(reconAdjustments).where(eq(reconAdjustments.id, adjustmentId));
  if (!adj || adj.status !== "approved" || adj.journalId == null) {
    throw new HttpError(409, `Recon adjustment ${adjustmentId} is not approved yet`, "ADJUSTMENT_NOT_APPROVED");
  }
  if (adj.amount !== BigInt(refundPaise)) {
    throw new HttpError(409, `Recon adjustment ${adjustmentId} amount does not equal ${check.refundAmount}`, "ADJUSTMENT_AMOUNT_MISMATCH");
  }
  if (!check.agentAccountCode || adj.creditCode !== check.agentAccountCode) {
    throw new HttpError(
      409,
      `Recon adjustment ${adjustmentId} must credit ${check.agentAccountCode ?? "the retailer's ledger account"}`,
      "ADJUSTMENT_ACCOUNT_MISMATCH",
    );
  }
  const [reused] = await db
    .select({ txnRef: transactions.txnRef })
    .from(transactions)
    .where(sql`${transactions.metadata} -> 'manualRefund' ->> 'adjustmentId' = ${String(adjustmentId)}`)
    .limit(1);
  if (reused) {
    throw new HttpError(409, `Recon adjustment ${adjustmentId} already closed ${reused.txnRef}`, "ADJUSTMENT_ALREADY_USED");
  }

  const closed = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(transactions).where(eq(transactions.id, check.txn.id)).for("update");
    if (!locked || (locked.status !== "pending" && locked.status !== "initiated")) {
      throw new HttpError(409, `Transaction ${txnRef} is already ${locked?.status ?? "gone"}`, "TXN_ALREADY_SETTLED");
    }
    if (toPaise(check.heldForThisTxn) > 0) {
      const userWallet = await getUserWallet(locked.userId, check.walletType);
      await adjustWalletHold(tx, userWallet.walletId, check.heldForThisTxn, "release");
    }
    const [updated] = await tx
      .update(transactions)
      .set({
        status: "failed",
        failureReason: reason,
        metadata: {
          ...(locked.metadata ?? {}),
          manualRefund: { adjustmentId: String(adjustmentId), journalId: String(adj.journalId) },
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, locked.id))
      .returning();
    return updated!;
  });

  await insertAuditLog({
    userId: null,
    action: "txn.manual_close_refunded",
    entityType: "transaction",
    entityId: check.txn.id,
    ipAddress: null,
    userAgent: null,
    metadata: {
      from: check.txn.status,
      to: closed.status,
      refundAmount: check.refundAmount,
      adjustmentId: String(adjustmentId),
      holdReleased: check.heldForThisTxn,
      reason,
    },
  });

  return closed;
}

/** Pending older than this may be auto-reconciled (provider already acknowledged). */
export const PENDING_RECONCILE_MIN_AGE_MS = 120_000;

/** A txn stuck non-terminal past this age fires the critical "transaction failure" Slack alert. */
const TXN_CRITICAL_STUCK_MS = 5 * 60 * 1000;

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

  const criticalStuckCutoff = new Date(now - TXN_CRITICAL_STUCK_MS);

  let changed = 0;
  for (const txn of candidates) {
    try {
      const before = txn.status;
      const outcome = await recheckTxnStatus(
        { id: txn.userId, role: "admin" },
        txn.txnRef,
      );
      if (outcome.txn.status !== before) changed += 1;

      if (outcome.txn.status === "success" && (before === "pending" || before === "initiated")) {
        void sendSlackAlert("Retry succeeded after initial delay", "general", {
          retailerId: txn.userId,
          txnRef: txn.txnRef,
          amount: txn.amount,
        });
      } else if (outcome.txn.status === before && txn.createdAt < criticalStuckCutoff) {
        void sendSlackAlert("Transaction failure: stuck past threshold", "critical", {
          retailerId: txn.userId,
          txnRef: txn.txnRef,
          status: outcome.txn.status,
          amount: txn.amount,
          ageMs: now - txn.createdAt.getTime(),
        });
      }

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
        void sendSlackAlert("Wallet balance mismatch found in daily reconciliation", "critical", {
          retailerId: txn.userId,
          txnRef: txn.txnRef,
          dbStatusBefore: before,
          providerStatusNow: outcome.txn.status,
          amount: txn.amount,
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
  if (code.startsWith("aeps_") || code === "aadhaar_pay" || code === "UPI_CASH_POINT") return "credit";
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
      providerTxnId: transactions.providerTxnId,
      failureReason: transactions.failureReason,
      metadata: transactions.metadata,
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
