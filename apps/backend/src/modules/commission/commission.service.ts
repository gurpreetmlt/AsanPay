import { and, eq, gt, gte, lte, isNull, isNotNull, or, desc, sql, asc, ilike, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import {
  commissionLedger,
  commissionRules,
  transactions,
  userHierarchy,
  users,
  wallets,
  services,
  serviceCategories,
  providers,
  journals,
  providerCommissionIngest,
  reconciliationExceptions,
} from "../../db/postgres/schema";
import { mirrorBalances, transferBetweenWallets } from "../wallet/wallet.ledger";
import { toPaise, fromPaise } from "../wallet/decimal";
import { logger } from "../../utils/logger";
import { notifyCommissionCredit } from "../notifications/userEmail.service";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import type { UserRole } from "@asanpay/shared-types";
import { applyTdsToGrossPaise, resolveTaxForService } from "./tax.service";
import { reverseJournal } from "../../core/ledger";
import { assertCommissionMonthUnlocked, recordRateChangeEvent } from "./commission.guards";
import { computeFixedPaise, resolveRoleGross } from "./rateCard.math";
import {
  findActiveOverride,
  loadRateConfig,
  providerIncomePaiseFor,
  roleDefaultFor,
  type RateConfig,
} from "./rateCard.config";

const SCHEME_ROLES = ["retailer", "distributor", "super_distributor"] as const;
type SchemeRole = (typeof SCHEME_ROLES)[number];

/** Credits that have not been clawed back after refund / dispute (TC18). */
const activeCommission = isNull(commissionLedger.reversedAt);

/** Admin list filter — default `active` keeps money totals unchanged. */
export type ClawbackVisibility = "active" | "clawed" | "all";

function clawbackVisibilityCondition(visibility?: ClawbackVisibility) {
  if (visibility === "clawed") return isNotNull(commissionLedger.reversedAt);
  if (visibility === "all") return undefined;
  return activeCommission;
}

type RuleType = "flat" | "percentage";

type RuleRow = {
  ruleType: RuleType;
  value: string;
};

export function isSchemeRole(role: string): role is SchemeRole {
  return (SCHEME_ROLES as readonly string[]).includes(role);
}

/** Same integer-paise math as live payout — percentage is 0–100 with up to 4 decimals. */
export function computePayoutPaise(rule: RuleRow, amountPaise: number): number {
  return computeFixedPaise(rule, amountPaise);
}

/** Gross earning for one chain member: override → share of provider income → fixed rule → none. */
async function resolveMemberGrossPaise(input: {
  cfg: RateConfig;
  serviceId: string;
  providerId: string | null;
  userId: string;
  role: UserRole;
  amountPaise: number;
  providerIncomePaise: number | null;
  at: Date;
}) {
  const override = await findActiveOverride(input.serviceId, input.userId, input.at);
  const { share, rule } = roleDefaultFor(input.cfg, input.serviceId, input.providerId, input.role, input.amountPaise);
  return resolveRoleGross({
    amountPaise: input.amountPaise,
    providerIncomePaise: input.providerIncomePaise,
    override,
    sharePercent: share?.sharePercent ?? null,
    shareFlat: share?.flatAmount ?? null,
    fixedRule: rule,
  });
}

export function validateRuleValue(ruleType: RuleType, valueRaw: string): string {
  const valueNum = Number(valueRaw);
  if (!Number.isFinite(valueNum) || valueNum < 0) {
    throw new HttpError(400, "Commission value must be a non-negative number", "INVALID_VALUE");
  }
  if (ruleType === "percentage" && valueNum > 100) {
    throw new HttpError(400, "Percentage cannot exceed 100", "INVALID_VALUE");
  }
  const flatCap = env.MAX_FLAT_COMMISSION_RUPEES ?? 500;
  if (ruleType === "flat" && valueNum > flatCap) {
    throw new HttpError(400, `Flat commission cannot exceed ₹${flatCap}`, "INVALID_VALUE");
  }
  return valueNum.toFixed(4);
}

export function normalizeAmountBound(raw: string | null | undefined, field: "minAmount" | "maxAmount"): string | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new HttpError(
      400,
      field === "minAmount"
        ? "Min amount must be a non-negative number"
        : "Max amount must be a non-negative number",
      "INVALID_AMOUNT",
    );
  }
  return n.toFixed(2);
}

// Runs after a service transaction succeeds: pays every ancestor in the chain
// (retailer -> distributor -> super_distributor) their configured cut, each
// payout backed by a system-wallet -> beneficiary-wallet ledger transfer.
// Idempotent per transaction: existing commission_ledger rows short-circuit.
export async function distributeCommissionForTxn(
  transactionId: string,
): Promise<{ failed: number; failures: { beneficiaryUserId: string; error: string }[] }> {
  const failures: { beneficiaryUserId: string; error: string }[] = [];
  const done = () => ({ failed: failures.length, failures });

  const [txn] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!txn || txn.status !== "success") return done();

  // Per beneficiary, so a retry pays only the members a failed run missed. A clawed-back row
  // means this txn was refunded — never pay it again.
  const paidRows = await db
    .select({ beneficiaryUserId: commissionLedger.beneficiaryUserId, reversedAt: commissionLedger.reversedAt })
    .from(commissionLedger)
    .where(eq(commissionLedger.transactionId, transactionId));
  if (paidRows.some((r) => r.reversedAt != null)) return done();
  const alreadyPaid = new Set(paidRows.map((r) => r.beneficiaryUserId));

  // Everyone above (and including) the transacting retailer, closest first.
  const chain = await db
    .select({ userId: userHierarchy.ancestorId, depth: userHierarchy.depth, role: users.role, active: users.isActive })
    .from(userHierarchy)
    .innerJoin(users, eq(userHierarchy.ancestorId, users.id))
    .where(eq(userHierarchy.descendantId, txn.userId))
    .orderBy(userHierarchy.depth);

  const [systemWallet] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.walletKind, "aggregator"), eq(wallets.walletType, "main")))
    .limit(1);
  if (!systemWallet) {
    logger.error({ transactionId }, "commission skipped: no aggregator wallet configured");
    return done();
  }

  const now = new Date();
  const amountPaise = toPaise(txn.amount);

  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const taxCfg = await resolveTaxForService(tenantId, txn.serviceId, now);
  const providerId = txn.providerId ?? null;
  const rateCfg = await loadRateConfig([txn.serviceId], now);
  const providerIncomePaise = providerIncomePaiseFor(rateCfg, txn.serviceId, providerId, amountPaise);

  for (const member of chain) {
    // Admin is the residual earner (whatever margin remains) — no explicit payout row.
    if (member.role === "admin" || !member.active) continue;
    if (alreadyPaid.has(member.userId)) continue;

    const { grossPaise } = await resolveMemberGrossPaise({
      cfg: rateCfg,
      serviceId: txn.serviceId,
      providerId,
      userId: member.userId,
      role: member.role,
      amountPaise,
      providerIncomePaise,
      at: now,
    });
    if (grossPaise <= 0) continue;
    const { netPaise, tdsPaise, tdsPercent, grossPaise: g } = applyTdsToGrossPaise(grossPaise, taxCfg);
    if (netPaise <= 0) continue;
    const gross = fromPaise(g);
    const net = fromPaise(netPaise);
    const tds = fromPaise(tdsPaise);

    const [beneWallet] = await db
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.userId, member.userId), eq(wallets.walletType, "main")));
    if (!beneWallet) continue;

    try {
      // Transfer + ledger insert share one tx: if a concurrent distribution already paid this
      // (transaction, beneficiary), the unique constraint makes the insert throw and the whole
      // tx — including the money transfer — rolls back. No double payout.
      // Wallet credit = net after TDS (gross held as company TDS payable — books later).
      await db.transaction(async (tx) => {
        const { groupId } = await transferBetweenWallets(
          {
            fromWalletId: systemWallet.id,
            toWalletId: beneWallet.id,
            amount: net,
            referenceType: "commission",
            referenceId: txn.id,
            description:
              tdsPaise > 0
                ? `Commission ${txn.txnRef} (${member.role}) net after TDS`
                : `Commission ${txn.txnRef} (${member.role})`,
          },
          tx,
        );
        await tx.insert(commissionLedger).values({
          transactionId: txn.id,
          beneficiaryUserId: member.userId,
          role: member.role,
          amount: net,
          grossAmount: gross,
          tdsAmount: tds,
          tdsPercent: tdsPaise > 0 ? tdsPercent : null,
          ledgerGroupId: groupId,
        });
      });
      notifyCommissionCredit({
        userId: member.userId,
        amount: net,
        txnRef: txn.txnRef,
      });
    } catch (err) {
      // A duplicate (a concurrent run already paid this beneficiary) is success; anything else
      // is a real failure, filed so retryFailedCommissions() pays it later.
      if (isUniqueViolation(err)) continue;
      logger.error({ err, transactionId, beneficiary: member.userId }, "commission payout failed");
      failures.push({
        beneficiaryUserId: member.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (failures.length > 0) {
    await recordCommissionPayoutFailure(txn.id, txn.txnRef, new Error(failures.map((f) => f.error).join("; ")), failures);
  }
  return done();
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

const COMMISSION_RETRY_CHECK = "commission_payout_failed";
/** After this many failed retries the exception is raised to critical (retries continue). */
const COMMISSION_RETRY_ESCALATE_AFTER = 5;

/** Files the retry marker the reconcile sweep picks up. Never throws. */
export async function recordCommissionPayoutFailure(
  transactionId: string,
  txnRef: string,
  err: unknown,
  failures?: { beneficiaryUserId: string; error: string }[],
): Promise<void> {
  const { upsertReconException } = await import("../limits/moneyExceptions");
  await upsertReconException({
    checkName: COMMISSION_RETRY_CHECK,
    severity: "warn",
    fingerprint: `${COMMISSION_RETRY_CHECK}:${transactionId}`,
    details: {
      transactionId,
      txnRef,
      error: err instanceof Error ? err.message : String(err),
      failures: failures ?? [],
    },
  });
}

/**
 * Retries commission payouts that failed earlier. Safe to repeat: each payout is keyed by
 * (transaction, beneficiary) in commission_ledger and by its COMM:* journal idempotency key, so
 * a beneficiary already paid is skipped. Resolved markers are closed; failing ones stay open.
 */
export async function retryFailedCommissions(limit = 20): Promise<{ retried: number; resolved: number }> {
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const open = await db
    .select({
      id: reconciliationExceptions.id,
      details: reconciliationExceptions.details,
    })
    .from(reconciliationExceptions)
    .where(
      and(
        eq(reconciliationExceptions.tenantId, tenantId),
        eq(reconciliationExceptions.checkName, COMMISSION_RETRY_CHECK),
        eq(reconciliationExceptions.status, "open"),
      ),
    )
    .orderBy(asc(reconciliationExceptions.lastSeenAt))
    .limit(limit);

  let resolved = 0;
  for (const marker of open) {
    const details = (marker.details ?? {}) as Record<string, unknown>;
    const transactionId = typeof details.transactionId === "string" ? details.transactionId : null;
    const attempts = Number(details.attempts ?? 1);
    let failedNow: { failed: number; failures: { beneficiaryUserId: string; error: string }[] };
    let error: string | null = null;
    try {
      failedNow = transactionId ? await distributeCommissionForTxn(transactionId) : { failed: 0, failures: [] };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      failedNow = { failed: 1, failures: [] };
    }

    if (failedNow.failed === 0) {
      await db
        .update(reconciliationExceptions)
        .set({
          status: "closed",
          closeNote: "Commission retry paid every pending beneficiary (or the transaction is no longer successful).",
          closedAt: new Date(),
          lastSeenAt: new Date(),
        })
        .where(eq(reconciliationExceptions.id, marker.id));
      resolved += 1;
      continue;
    }

    // distributeCommissionForTxn already refreshed the marker for per-beneficiary failures;
    // a whole-run error is recorded here.
    if (error) {
      await db
        .update(reconciliationExceptions)
        .set({ details: { ...details, error, attempts: attempts + 1 }, lastSeenAt: new Date() })
        .where(eq(reconciliationExceptions.id, marker.id));
    }
    if (attempts + 1 >= COMMISSION_RETRY_ESCALATE_AFTER) {
      await db
        .update(reconciliationExceptions)
        .set({ severity: "critical" })
        .where(eq(reconciliationExceptions.id, marker.id));
    }
  }
  return { retried: open.length, resolved };
}

/**
 * Claw back commission after a successful txn is refunded / dispute-refunded (TC18).
 * Reverses any unreversed COMMISSION_PAYOUT journals for the txn, marks ledger rows,
 * and sets txn status to `refunded` when it was still `success`.
 */
export async function clawbackCommissionForTxn(
  transactionId: string,
  opts?: { performedBy?: string | null; reason?: string },
): Promise<{ clawedRows: number; reversedJournals: number }> {
  const reason = opts?.reason ?? `Commission clawback for txn ${transactionId}`;
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();

  return db.transaction(async (tx) => {
    const [txn] = await tx
      .select({ id: transactions.id, status: transactions.status, userId: transactions.userId })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .for("update");
    if (!txn) throw new HttpError(404, "Transaction not found", "TXN_NOT_FOUND");

    const rows = await tx
      .select({
        id: commissionLedger.id,
        beneficiaryUserId: commissionLedger.beneficiaryUserId,
      })
      .from(commissionLedger)
      .where(and(eq(commissionLedger.transactionId, transactionId), activeCommission));

    const candidates = await tx
      .select({ id: journals.id, txnType: journals.txnType })
      .from(journals)
      .where(and(eq(journals.tenantId, tenantId), eq(journals.referenceId, transactionId)));

    const commissionIds = candidates.filter((c) => c.txnType === "COMMISSION_PAYOUT").map((c) => c.id);
    let reversedJournals = 0;
    const beneficiaryIds = new Set(rows.map((r) => r.beneficiaryUserId));

    if (commissionIds.length > 0) {
      const already = await tx
        .select({ reversesId: journals.reversesId })
        .from(journals)
        .where(and(eq(journals.tenantId, tenantId), inArray(journals.reversesId, commissionIds)));
      const reversedSet = new Set(already.map((a) => a.reversesId).filter(Boolean));
      for (const journalId of commissionIds) {
        if (reversedSet.has(journalId)) continue;
        await reverseJournal(tx, {
          tenantId,
          journalId,
          idemKey: `COMM_CB:${transactionId}:${journalId}`,
          performedBy: opts?.performedBy ?? null,
          reason,
        });
        reversedJournals += 1;
      }
    }

    if (rows.length > 0) {
      await tx
        .update(commissionLedger)
        .set({ reversedAt: new Date() })
        .where(
          and(
            eq(commissionLedger.transactionId, transactionId),
            isNull(commissionLedger.reversedAt),
          ),
        );
    }

    if (beneficiaryIds.size > 0 || reversedJournals > 0) {
      await mirrorBalances(tx, tenantId, [...beneficiaryIds], false);
    }

    if (txn.status === "success") {
      await tx
        .update(transactions)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(transactions.id, transactionId));
    }

    return { clawedRows: rows.length, reversedJournals };
  });
}

/** Store raw provider commission payload (TC15). Parsing awaits sample from owner. */
export async function storeProviderCommissionIngest(input: {
  providerCode: string;
  payload: unknown;
  externalRef?: string | null;
  parseNote?: string | null;
}) {
  const code = input.providerCode.trim().toLowerCase();
  if (!code || code.length > 40) {
    throw new HttpError(400, "Provider code must be 1–40 characters", "INVALID_PROVIDER_CODE");
  }
  if (input.payload == null || typeof input.payload !== "object") {
    throw new HttpError(400, "Payload must be a JSON object or array", "INVALID_PAYLOAD");
  }
  const [row] = await db
    .insert(providerCommissionIngest)
    .values({
      providerCode: code,
      externalRef: input.externalRef?.trim() || null,
      payload: input.payload as Record<string, unknown>,
      parseStatus: "stored",
      parseNote:
        input.parseNote?.trim() ||
        "Stored raw — parse rules pending sample payload confirmation",
    })
    .returning({
      id: providerCommissionIngest.id,
      providerCode: providerCommissionIngest.providerCode,
      parseStatus: providerCommissionIngest.parseStatus,
      createdAt: providerCommissionIngest.createdAt,
    });
  return row;
}

/** Agent-facing estimate for confirm UI (TC22) — uses live scheme + TDS rules. */
export async function estimateMyCommission(input: {
  userId: string;
  role: UserRole;
  amount: string;
  serviceId?: string;
  serviceCode?: string;
  providerId?: string | null;
}) {
  if (!isSchemeRole(input.role)) {
    throw new HttpError(403, "Earnings estimate is only for agent roles", "FORBIDDEN");
  }
  let serviceId = input.serviceId;
  let serviceCode: string | null = null;
  let serviceName: string | null = null;
  if (serviceId) {
    const [svc] = await db
      .select({ id: services.id, code: services.code, name: services.name })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    if (!svc) throw new HttpError(404, "Service not found", "SERVICE_NOT_FOUND");
    serviceCode = svc.code;
    serviceName = svc.name;
  } else if (input.serviceCode?.trim()) {
    const [svc] = await db
      .select({ id: services.id, code: services.code, name: services.name })
      .from(services)
      .where(eq(services.code, input.serviceCode.trim()))
      .limit(1);
    if (!svc) throw new HttpError(404, "Service not found for this code", "SERVICE_NOT_FOUND");
    serviceId = svc.id;
    serviceCode = svc.code;
    serviceName = svc.name;
  } else {
    throw new HttpError(400, "Enter a valid service id or service code", "SERVICE_REQUIRED");
  }

  const amountNum = Number(input.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new HttpError(400, "Amount must be a positive number", "INVALID_AMOUNT");
  }
  const amount = amountNum.toFixed(2);
  const amountPaise = toPaise(amount);
  const now = new Date();
  const providerId = input.providerId || null;

  const { resolveTenantId } = await import("../fund-requests/tenant");
  const taxCfg = await resolveTaxForService(await resolveTenantId(), serviceId, now);
  const rateCfg = await loadRateConfig([serviceId], now);
  const resolved = await resolveMemberGrossPaise({
    cfg: rateCfg,
    serviceId,
    providerId,
    userId: input.userId,
    role: input.role,
    amountPaise,
    providerIncomePaise: providerIncomePaiseFor(rateCfg, serviceId, providerId, amountPaise),
    at: now,
  });
  if (resolved.source === "none") {
    return {
      serviceId,
      serviceCode,
      serviceName,
      amount,
      matched: false,
      estimated: true,
      gross: "0.00",
      tds: "0.00",
      net: "0.00",
      tax: {
        tdsApplies: taxCfg.tdsApplies,
        tdsPercent: taxCfg.tdsPercent,
      },
    };
  }
  const grossPaise = Math.max(0, resolved.grossPaise);
  const { netPaise, tdsPaise, grossPaise: g, tdsPercent } = applyTdsToGrossPaise(grossPaise, taxCfg);
  return {
    serviceId,
    serviceCode,
    serviceName,
    amount,
    matched: true,
    estimated: true,
    gross: fromPaise(g),
    tds: fromPaise(tdsPaise),
    net: fromPaise(netPaise),
    tax: {
      tdsApplies: taxCfg.tdsApplies,
      tdsPercent: tdsPaise > 0 ? tdsPercent : taxCfg.tdsPercent,
    },
  };
}

/** Role-default slab from `commission_rules` (no per-agent override). */
async function findRoleDefaultRule(
  serviceId: string,
  providerId: string | null,
  role: UserRole,
  amount: string,
  at: Date,
) {
  const amountNum = amount;
  // A provider-specific slab (commission_rules.providerId = this txn's provider) wins over the
  // generic null-provider default for the same service+role — ORDER BY puts provider-specific
  // rows first (NULLS LAST on the boolean match), then most-recently-effective.
  const rules = await db
    .select({
      id: commissionRules.id,
      ruleType: commissionRules.ruleType,
      value: commissionRules.value,
      providerId: commissionRules.providerId,
    })
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.serviceId, serviceId),
        eq(commissionRules.role, role),
        eq(commissionRules.isActive, true),
        lte(commissionRules.effectiveFrom, at),
        or(isNull(commissionRules.effectiveTo), gt(commissionRules.effectiveTo, at)),
        or(isNull(commissionRules.minAmount), lte(commissionRules.minAmount, amountNum)),
        or(isNull(commissionRules.maxAmount), sql`${commissionRules.maxAmount} >= ${amountNum}`),
        providerId
          ? or(isNull(commissionRules.providerId), eq(commissionRules.providerId, providerId))
          : isNull(commissionRules.providerId),
      ),
    )
    .orderBy(desc(commissionRules.effectiveFrom));

  const providerSpecific = providerId ? rules.find((r) => r.providerId === providerId) : undefined;
  const match = providerSpecific ?? rules.find((r) => r.providerId === null) ?? null;
  if (!match) return null;
  return { id: match.id, ruleType: match.ruleType, value: match.value };
}

// ── Earnings reads (retailer/distributor dashboards) ────────────────────────
function istDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+05:30`);
}

function istDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function todayYmdIst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export async function getEarningsSummary(userId: string, since: Date) {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      count: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .where(and(eq(commissionLedger.beneficiaryUserId, userId), sql`${commissionLedger.createdAt} >= ${since}`,
    activeCommission,
  ));
  return row ?? { total: "0", count: 0 };
}

export async function listEarnings(userId: string, limit = 50, offset = 0) {
  return db
    .select({
      id: commissionLedger.id,
      amount: commissionLedger.amount,
      transactionId: commissionLedger.transactionId,
      txnRef: transactions.txnRef,
      createdAt: commissionLedger.createdAt,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .where(and(eq(commissionLedger.beneficiaryUserId, userId), activeCommission))
    .orderBy(desc(commissionLedger.createdAt))
    .limit(Math.min(limit, 100))
    .offset(offset);
}

/** My Earnings shell (TC08) — net totals + active service / downline badges. */
export async function getMyEarningsSummary(
  userId: string,
  role: UserRole,
  fromYmd?: string,
  toYmd?: string,
) {
  const from = fromYmd ?? todayYmdIst();
  const to = toYmd ?? from;
  if (from > to) {
    throw new HttpError(400, "From date must be on or before To date", "INVALID_DATE_RANGE");
  }
  const since = istDayStart(from);
  const until = istDayEnd(to);
  const range = and(
    eq(commissionLedger.beneficiaryUserId, userId),
    gte(commissionLedger.createdAt, since),
    lte(commissionLedger.createdAt, until),
    activeCommission,
  );

  const [totals] = await db
    .select({
      totalNet: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      totalGross: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), '0')`,
      totalTds: sql<string>`coalesce(sum(coalesce(${commissionLedger.tdsAmount}, 0)), '0')`,
      creditCount: sql<number>`count(*)::int`,
      activeServices: sql<number>`count(distinct ${transactions.serviceId})::int`,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .where(range);

  let activeDownline: number | null = null;
  if (role === "super_distributor" || role === "distributor") {
    const byDown = await listMyEarningsByDownline(userId, role, from, to);
    activeDownline = byDown.length;
  }

  return {
    from,
    to,
    totalNet: String(totals?.totalNet ?? "0"),
    totalGross: String(totals?.totalGross ?? "0"),
    totalTds: String(totals?.totalTds ?? "0"),
    creditCount: totals?.creditCount ?? 0,
    activeServices: totals?.activeServices ?? 0,
    activeDownline,
  };
}

export async function listMyEarnings(
  userId: string,
  opts: { from?: string; to?: string; limit?: number; offset?: number },
) {
  const from = opts.from ?? todayYmdIst();
  const to = opts.to ?? from;
  if (from > to) {
    throw new HttpError(400, "From date must be on or before To date", "INVALID_DATE_RANGE");
  }
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const since = istDayStart(from);
  const until = istDayEnd(to);

  const rows = await db
    .select({
      id: commissionLedger.id,
      netAmount: commissionLedger.amount,
      grossAmount: commissionLedger.grossAmount,
      tdsAmount: commissionLedger.tdsAmount,
      transactionId: commissionLedger.transactionId,
      txnRef: transactions.txnRef,
      txnAmount: transactions.amount,
      serviceId: transactions.serviceId,
      serviceCode: services.code,
      serviceName: services.name,
      createdAt: commissionLedger.createdAt,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(
      and(
        eq(commissionLedger.beneficiaryUserId, userId),
        gte(commissionLedger.createdAt, since),
        lte(commissionLedger.createdAt, until),
        activeCommission,
      ),
    )
    .orderBy(desc(commissionLedger.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    netAmount: String(r.netAmount),
    grossAmount: r.grossAmount != null ? String(r.grossAmount) : String(r.netAmount),
    tdsAmount: r.tdsAmount != null ? String(r.tdsAmount) : "0",
    transactionId: r.transactionId,
    txnRef: r.txnRef,
    txnAmount: String(r.txnAmount),
    serviceId: r.serviceId,
    serviceCode: r.serviceCode,
    serviceName: r.serviceName,
    createdAt: r.createdAt,
  }));
}

function parseEarningsRange(fromYmd?: string, toYmd?: string) {
  const from = fromYmd ?? todayYmdIst();
  const to = toYmd ?? from;
  if (from > to) {
    throw new HttpError(400, "From date must be on or before To date", "INVALID_DATE_RANGE");
  }
  return { from, to, since: istDayStart(from), until: istDayEnd(to) };
}

type ProductEarnRow = {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  volume: string;
  netAmount: string;
  grossAmount: string;
  tdsAmount: string;
  creditCount: number;
};

function mapProductEarnRows(
  rows: {
    serviceId: string;
    serviceCode: string;
    serviceName: string;
    volume: string;
    netAmount: string;
    grossAmount: string;
    tdsAmount: string;
    creditCount: number;
  }[],
): ProductEarnRow[] {
  return rows.map((r) => ({
    serviceId: r.serviceId,
    serviceCode: r.serviceCode,
    serviceName: r.serviceName,
    volume: String(r.volume),
    netAmount: String(r.netAmount),
    grossAmount: String(r.grossAmount),
    tdsAmount: String(r.tdsAmount),
    creditCount: r.creditCount,
  }));
}

const productSelect = {
  serviceId: services.id,
  serviceCode: services.code,
  serviceName: services.name,
  volume: sql<string>`coalesce(sum(${transactions.amount}), '0')`,
  netAmount: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
  grossAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), '0')`,
  tdsAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.tdsAmount}, 0)), '0')`,
  creditCount: sql<number>`count(*)::int`,
};

/** Product-wise summary for My Earnings (retailer primary; SD/Dist shared). */
export async function listMyEarningsByProduct(
  userId: string,
  fromYmd?: string,
  toYmd?: string,
  opts?: { downlineUserId?: string; role?: UserRole },
): Promise<ProductEarnRow[]> {
  const { since, until } = parseEarningsRange(fromYmd, toYmd);
  const base = and(
    eq(commissionLedger.beneficiaryUserId, userId),
    gte(commissionLedger.createdAt, since),
    lte(commissionLedger.createdAt, until),
    activeCommission,
  );

  if (opts?.downlineUserId) {
    if (!opts.role || (opts.role !== "super_distributor" && opts.role !== "distributor")) {
      throw new HttpError(403, "Downline filter is only for Super Distributor / Distributor", "FORBIDDEN");
    }
    const agent = alias(users, "earn_prod_agent");
    const downline = alias(users, "earn_prod_down");

    if (opts.role === "distributor") {
      const rows = await db
        .select(productSelect)
        .from(commissionLedger)
        .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
        .innerJoin(services, eq(transactions.serviceId, services.id))
        .innerJoin(agent, eq(transactions.userId, agent.id))
        .where(and(base, eq(agent.id, opts.downlineUserId), eq(agent.parentId, userId)))
        .groupBy(services.id, services.code, services.name)
        .orderBy(desc(sql`sum(${commissionLedger.amount})`));
      return mapProductEarnRows(rows);
    }

    const rows = await db
      .select(productSelect)
      .from(commissionLedger)
      .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
      .innerJoin(services, eq(transactions.serviceId, services.id))
      .innerJoin(agent, eq(transactions.userId, agent.id))
      .innerJoin(
        downline,
        and(
          eq(downline.id, opts.downlineUserId),
          eq(downline.parentId, userId),
          or(
            and(eq(agent.id, downline.id), eq(agent.role, "distributor")),
            and(eq(agent.parentId, downline.id), eq(agent.role, "retailer")),
          ),
        ),
      )
      .where(base)
      .groupBy(services.id, services.code, services.name)
      .orderBy(desc(sql`sum(${commissionLedger.amount})`));
    return mapProductEarnRows(rows);
  }

  const rows = await db
    .select(productSelect)
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(base)
    .groupBy(services.id, services.code, services.name)
    .orderBy(desc(sql`sum(${commissionLedger.amount})`));
  return mapProductEarnRows(rows);
}

/** Downline-wise earnings (SD / Dist only). */
export async function listMyEarningsByDownline(
  userId: string,
  role: UserRole,
  fromYmd?: string,
  toYmd?: string,
  q?: string,
) {
  if (role !== "super_distributor" && role !== "distributor") {
    throw new HttpError(403, "Downline earnings are only for Super Distributor / Distributor", "FORBIDDEN");
  }
  const { since, until } = parseEarningsRange(fromYmd, toYmd);
  const needle = q?.trim();
  const agent = alias(users, "earn_dl_agent");
  const downline = alias(users, "earn_dl_down");

  const search =
    needle && needle.length > 0
      ? or(
          ilike(downline.name, `%${needle}%`),
          ilike(downline.uid, `%${needle}%`),
          ilike(downline.mobile, `%${needle}%`),
        )
      : undefined;

  if (role === "distributor") {
    const rows = await db
      .select({
        userId: downline.id,
        name: downline.name,
        uid: downline.uid,
        mobile: downline.mobile,
        isActive: downline.isActive,
        volume: sql<string>`coalesce(sum(${transactions.amount}), '0')`,
        netAmount: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
        grossAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), '0')`,
        tdsAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.tdsAmount}, 0)), '0')`,
        creditCount: sql<number>`count(*)::int`,
      })
      .from(commissionLedger)
      .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
      .innerJoin(downline, eq(transactions.userId, downline.id))
      .where(
        and(
          eq(commissionLedger.beneficiaryUserId, userId),
          gte(commissionLedger.createdAt, since),
          lte(commissionLedger.createdAt, until),
          activeCommission,
          eq(downline.parentId, userId),
          ...(search ? [search] : []),
        ),
      )
      .groupBy(downline.id, downline.name, downline.uid, downline.mobile, downline.isActive)
      .orderBy(desc(sql`sum(${commissionLedger.amount})`));

    return rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      uid: r.uid,
      mobile: r.mobile,
      shopLabel: r.name,
      isActive: r.isActive,
      volume: String(r.volume),
      netAmount: String(r.netAmount),
      grossAmount: String(r.grossAmount),
      tdsAmount: String(r.tdsAmount),
      creditCount: r.creditCount,
    }));
  }

  // Super Distributor: attribute retailer txns to their distributor parent.
  const rows = await db
    .select({
      userId: downline.id,
      name: downline.name,
      uid: downline.uid,
      mobile: downline.mobile,
      isActive: downline.isActive,
      volume: sql<string>`coalesce(sum(${transactions.amount}), '0')`,
      netAmount: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      grossAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), '0')`,
      tdsAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.tdsAmount}, 0)), '0')`,
      creditCount: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .innerJoin(agent, eq(transactions.userId, agent.id))
    .innerJoin(
      downline,
      and(
        eq(downline.parentId, userId),
        or(
          and(eq(agent.id, downline.id), eq(agent.role, "distributor")),
          and(eq(agent.parentId, downline.id), eq(agent.role, "retailer")),
        ),
      ),
    )
    .where(
      and(
        eq(commissionLedger.beneficiaryUserId, userId),
        gte(commissionLedger.createdAt, since),
        lte(commissionLedger.createdAt, until),
        activeCommission,
        ...(search ? [search] : []),
      ),
    )
    .groupBy(downline.id, downline.name, downline.uid, downline.mobile, downline.isActive)
    .orderBy(desc(sql`sum(${commissionLedger.amount})`));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    uid: r.uid,
    mobile: r.mobile,
    shopLabel: r.name,
    isActive: r.isActive,
    volume: String(r.volume),
    netAmount: String(r.netAmount),
    grossAmount: String(r.grossAmount),
    tdsAmount: String(r.tdsAmount),
    creditCount: r.creditCount,
  }));
}

/** Product → txn credits for expand (TC11). Optional downline scope for SD/Dist. */
export async function listMyEarningsProductTxns(
  userId: string,
  serviceId: string,
  opts: {
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
    downlineUserId?: string;
    role?: UserRole;
  },
) {
  const { since, until } = parseEarningsRange(opts.from, opts.to);
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const conds = [
    eq(commissionLedger.beneficiaryUserId, userId),
    eq(transactions.serviceId, serviceId),
    gte(commissionLedger.createdAt, since),
    lte(commissionLedger.createdAt, until),
    activeCommission,
  ];

  if (opts.downlineUserId) {
    if (!opts.role || (opts.role !== "super_distributor" && opts.role !== "distributor")) {
      throw new HttpError(403, "Downline filter is only for Super Distributor / Distributor", "FORBIDDEN");
    }
    const agent = alias(users, "earn_txn_agent");
    const downline = alias(users, "earn_txn_down");

    if (opts.role === "distributor") {
      const rows = await db
        .select({
          id: commissionLedger.id,
          netAmount: commissionLedger.amount,
          grossAmount: commissionLedger.grossAmount,
          tdsAmount: commissionLedger.tdsAmount,
          transactionId: commissionLedger.transactionId,
          txnRef: transactions.txnRef,
          txnAmount: transactions.amount,
          createdAt: commissionLedger.createdAt,
        })
        .from(commissionLedger)
        .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
        .innerJoin(agent, eq(transactions.userId, agent.id))
        .where(and(...conds, eq(agent.id, opts.downlineUserId), eq(agent.parentId, userId)))
        .orderBy(desc(commissionLedger.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map((r) => ({
        id: r.id,
        netAmount: String(r.netAmount),
        grossAmount: r.grossAmount != null ? String(r.grossAmount) : String(r.netAmount),
        tdsAmount: r.tdsAmount != null ? String(r.tdsAmount) : "0",
        transactionId: r.transactionId,
        txnRef: r.txnRef,
        txnAmount: String(r.txnAmount),
        createdAt: r.createdAt,
      }));
    }

    const rows = await db
      .select({
        id: commissionLedger.id,
        netAmount: commissionLedger.amount,
        grossAmount: commissionLedger.grossAmount,
        tdsAmount: commissionLedger.tdsAmount,
        transactionId: commissionLedger.transactionId,
        txnRef: transactions.txnRef,
        txnAmount: transactions.amount,
        createdAt: commissionLedger.createdAt,
      })
      .from(commissionLedger)
      .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
      .innerJoin(agent, eq(transactions.userId, agent.id))
      .innerJoin(
        downline,
        and(
          eq(downline.id, opts.downlineUserId),
          eq(downline.parentId, userId),
          or(
            and(eq(agent.id, downline.id), eq(agent.role, "distributor")),
            and(eq(agent.parentId, downline.id), eq(agent.role, "retailer")),
          ),
        ),
      )
      .where(and(...conds))
      .orderBy(desc(commissionLedger.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => ({
      id: r.id,
      netAmount: String(r.netAmount),
      grossAmount: r.grossAmount != null ? String(r.grossAmount) : String(r.netAmount),
      tdsAmount: r.tdsAmount != null ? String(r.tdsAmount) : "0",
      transactionId: r.transactionId,
      txnRef: r.txnRef,
      txnAmount: String(r.txnAmount),
      createdAt: r.createdAt,
    }));
  }

  const rows = await db
    .select({
      id: commissionLedger.id,
      netAmount: commissionLedger.amount,
      grossAmount: commissionLedger.grossAmount,
      tdsAmount: commissionLedger.tdsAmount,
      transactionId: commissionLedger.transactionId,
      txnRef: transactions.txnRef,
      txnAmount: transactions.amount,
      createdAt: commissionLedger.createdAt,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .where(and(...conds))
    .orderBy(desc(commissionLedger.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    netAmount: String(r.netAmount),
    grossAmount: r.grossAmount != null ? String(r.grossAmount) : String(r.netAmount),
    tdsAmount: r.tdsAmount != null ? String(r.tdsAmount) : "0",
    transactionId: r.transactionId,
    txnRef: r.txnRef,
    txnAmount: String(r.txnAmount),
    createdAt: r.createdAt,
  }));
}

/** Admin payout report — network-wide commission_ledger with optional role/date filters. */
export async function listAdminCommissionPayouts(filters?: {
  role?: SchemeRole;
  since?: Date;
  until?: Date;
  q?: string;
  clawback?: ClawbackVisibility;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(filters?.limit ?? 50, 200);
  const offset = filters?.offset ?? 0;

  const conditions = [
    clawbackVisibilityCondition(filters?.clawback),
    filters?.role ? eq(commissionLedger.role, filters.role) : undefined,
    filters?.since ? sql`${commissionLedger.createdAt} >= ${filters.since}` : undefined,
    filters?.until ? sql`${commissionLedger.createdAt} <= ${filters.until}` : undefined,
    filters?.q?.trim()
      ? or(
          ilike(users.name, `%${filters.q.trim()}%`),
          ilike(users.uid, `%${filters.q.trim()}%`),
          ilike(users.mobile, `%${filters.q.trim()}%`),
          ilike(transactions.txnRef, `%${filters.q.trim()}%`),
        )
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));

  const whereClause = and(...conditions);

  const [summary] = await db
    .select({
      total: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      count: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .innerJoin(users, eq(commissionLedger.beneficiaryUserId, users.id))
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: commissionLedger.id,
      amount: commissionLedger.amount,
      role: commissionLedger.role,
      createdAt: commissionLedger.createdAt,
      reversedAt: commissionLedger.reversedAt,
      transactionId: commissionLedger.transactionId,
      txnRef: transactions.txnRef,
      txnAmount: transactions.amount,
      serviceId: transactions.serviceId,
      serviceName: services.name,
      serviceCode: services.code,
      beneficiaryUserId: users.id,
      beneficiaryName: users.name,
      beneficiaryUid: users.uid,
      beneficiaryMobile: users.mobile,
    })
    .from(commissionLedger)
    .innerJoin(users, eq(commissionLedger.beneficiaryUserId, users.id))
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(whereClause)
    .orderBy(desc(commissionLedger.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    summary: {
      total: String(summary?.total ?? "0"),
      count: summary?.count ?? 0,
    },
    rows: rows.map((r) => ({
      ...r,
      amount: String(r.amount),
      txnAmount: String(r.txnAmount),
      reversedAt: r.reversedAt ? r.reversedAt.toISOString() : null,
      clawedBack: Boolean(r.reversedAt),
    })),
  };
}

/** Agent Settings — monthly TDS summary for the logged-in beneficiary. */
export async function getMyMonthlyTdsSummary(userId: string, monthYmd?: string) {
  const month = monthYmd && /^\d{4}-\d{2}$/.test(monthYmd) ? monthYmd : todayYmdIst().slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00+05:30`);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const [totals] = await db
    .select({
      totalGross: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), '0')`,
      totalTds: sql<string>`coalesce(sum(coalesce(${commissionLedger.tdsAmount}, 0)), '0')`,
      totalNet: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      creditCount: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .where(
      and(
        eq(commissionLedger.beneficiaryUserId, userId),
        gte(commissionLedger.createdAt, monthStart),
        sql`${commissionLedger.createdAt} < ${monthEnd}`,
        activeCommission,
      ),
    );

  const [userRow] = await db
    .select({ panNumberEncrypted: users.panNumberEncrypted })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    month,
    totalGross: String(totals?.totalGross ?? "0"),
    totalTds: String(totals?.totalTds ?? "0"),
    totalNet: String(totals?.totalNet ?? "0"),
    creditCount: totals?.creditCount ?? 0,
    hasPan: Boolean(userRow?.panNumberEncrypted),
  };
}

/** Admin TDS register — net/gross/TDS by agent × calendar month (IST). */
export async function listAdminTdsRegister(filters?: {
  month?: string; // YYYY-MM
  role?: SchemeRole;
  q?: string;
  clawback?: ClawbackVisibility;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(filters?.limit ?? 100, 500);
  const offset = filters?.offset ?? 0;
  const month = filters?.month?.trim();
  const monthStart = month ? new Date(`${month}-01T00:00:00+05:30`) : undefined;
  let monthEnd: Date | undefined;
  if (monthStart) {
    monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
  }

  const conditions = [
    clawbackVisibilityCondition(filters?.clawback),
    sql`coalesce(${commissionLedger.tdsAmount}, 0) > 0`,
    filters?.role ? eq(commissionLedger.role, filters.role) : undefined,
    monthStart ? sql`${commissionLedger.createdAt} >= ${monthStart}` : undefined,
    monthEnd ? sql`${commissionLedger.createdAt} < ${monthEnd}` : undefined,
    filters?.q?.trim()
      ? or(
          ilike(users.name, `%${filters.q.trim()}%`),
          ilike(users.uid, `%${filters.q.trim()}%`),
          ilike(users.mobile, `%${filters.q.trim()}%`),
        )
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));

  const whereClause = and(...conditions);
  const monthKey = sql<string>`to_char(timezone('Asia/Kolkata', ${commissionLedger.createdAt}), 'YYYY-MM')`;

  const [summary] = await db
    .select({
      totalGross: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), '0')`,
      totalTds: sql<string>`coalesce(sum(coalesce(${commissionLedger.tdsAmount}, 0)), '0')`,
      totalNet: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      count: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .innerJoin(users, eq(commissionLedger.beneficiaryUserId, users.id))
    .where(whereClause);

  const rows = await db
    .select({
      month: monthKey,
      beneficiaryUserId: users.id,
      beneficiaryName: users.name,
      beneficiaryUid: users.uid,
      beneficiaryMobile: users.mobile,
      role: commissionLedger.role,
      grossAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), '0')`,
      tdsAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.tdsAmount}, 0)), '0')`,
      netAmount: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      creditCount: sql<number>`count(*)::int`,
      clawedCreditCount: sql<number>`count(*) filter (where ${commissionLedger.reversedAt} is not null)::int`,
    })
    .from(commissionLedger)
    .innerJoin(users, eq(commissionLedger.beneficiaryUserId, users.id))
    .where(whereClause)
    .groupBy(monthKey, users.id, users.name, users.uid, users.mobile, commissionLedger.role)
    .orderBy(desc(monthKey), desc(sql`sum(coalesce(${commissionLedger.tdsAmount}, 0))`))
    .limit(limit)
    .offset(offset);

  return {
    summary: {
      totalGross: String(summary?.totalGross ?? "0"),
      totalTds: String(summary?.totalTds ?? "0"),
      totalNet: String(summary?.totalNet ?? "0"),
      count: summary?.count ?? 0,
    },
    rows: rows.map((r) => ({
      month: r.month,
      beneficiaryUserId: r.beneficiaryUserId,
      beneficiaryName: r.beneficiaryName,
      beneficiaryUid: r.beneficiaryUid,
      beneficiaryMobile: r.beneficiaryMobile,
      role: r.role,
      grossAmount: String(r.grossAmount),
      tdsAmount: String(r.tdsAmount),
      netAmount: String(r.netAmount),
      creditCount: r.creditCount,
      clawedCreditCount: r.clawedCreditCount,
      clawedBack: r.clawedCreditCount > 0,
    })),
  };
}

/** Admin DMT fee-GST register — txns with customer_fee_gst > 0. */
export async function listAdminDmtGstRegister(filters?: {
  since?: Date;
  until?: Date;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(filters?.limit ?? 100, 500);
  const offset = filters?.offset ?? 0;
  const conditions = [
    sql`coalesce(${transactions.customerFeeGst}, 0) > 0`,
    filters?.since ? sql`${transactions.createdAt} >= ${filters.since}` : undefined,
    filters?.until ? sql`${transactions.createdAt} <= ${filters.until}` : undefined,
    filters?.q?.trim()
      ? or(
          ilike(users.name, `%${filters.q.trim()}%`),
          ilike(users.uid, `%${filters.q.trim()}%`),
          ilike(users.mobile, `%${filters.q.trim()}%`),
          ilike(transactions.txnRef, `%${filters.q.trim()}%`),
        )
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));
  const whereClause = and(...conditions);

  const [summary] = await db
    .select({
      totalFee: sql<string>`coalesce(sum(${transactions.customerFee}), '0')`,
      totalGst: sql<string>`coalesce(sum(${transactions.customerFeeGst}), '0')`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.userId, users.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: transactions.id,
      txnRef: transactions.txnRef,
      createdAt: transactions.createdAt,
      amount: transactions.amount,
      customerFee: transactions.customerFee,
      customerFeeGst: transactions.customerFeeGst,
      status: transactions.status,
      serviceCode: services.code,
      serviceName: services.name,
      agentUserId: users.id,
      agentName: users.name,
      agentUid: users.uid,
      agentMobile: users.mobile,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.userId, users.id))
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(whereClause)
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    summary: {
      totalFee: String(summary?.totalFee ?? "0"),
      totalGst: String(summary?.totalGst ?? "0"),
      count: summary?.count ?? 0,
    },
    rows: rows.map((r) => ({
      id: r.id,
      txnRef: r.txnRef,
      createdAt: r.createdAt,
      amount: String(r.amount),
      customerFee: String(r.customerFee ?? "0"),
      customerFeeGst: String(r.customerFeeGst ?? "0"),
      status: r.status,
      serviceCode: r.serviceCode,
      serviceName: r.serviceName,
      agentUserId: r.agentUserId,
      agentName: r.agentName,
      agentUid: r.agentUid,
      agentMobile: r.agentMobile,
    })),
  };
}


// ── Role-default scheme CRUD (commission_rules) ─────────────────────────────

export type CommissionRuleInput = {
  serviceId: string;
  providerId?: string | null;
  role: SchemeRole;
  ruleType: RuleType;
  value: string;
  minAmount?: string | null;
  maxAmount?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive?: boolean;
};

async function assertServiceExists(serviceId: string) {
  const [row] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1);
  if (!row) throw new HttpError(400, "Unknown service", "INVALID_SERVICE");
}

async function assertProviderExists(providerId: string | null | undefined) {
  if (!providerId) return;
  const [row] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).limit(1);
  if (!row) throw new HttpError(400, "Unknown provider", "INVALID_PROVIDER");
}

function parseOptionalDate(raw: string | null | undefined, field: string): Date | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, `${field} must be a valid date`, "INVALID_DATE");
  }
  return d;
}

export async function listCommissionRules(filters?: {
  serviceId?: string;
  role?: SchemeRole;
  activeOnly?: boolean;
}) {
  const conditions = [
    filters?.serviceId ? eq(commissionRules.serviceId, filters.serviceId) : undefined,
    filters?.role ? eq(commissionRules.role, filters.role) : undefined,
    filters?.activeOnly ? eq(commissionRules.isActive, true) : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));

  const rows = await db
    .select({
      id: commissionRules.id,
      serviceId: commissionRules.serviceId,
      serviceCode: services.code,
      serviceName: services.name,
      categoryName: serviceCategories.name,
      providerId: commissionRules.providerId,
      providerName: providers.name,
      role: commissionRules.role,
      ruleType: commissionRules.ruleType,
      value: commissionRules.value,
      minAmount: commissionRules.minAmount,
      maxAmount: commissionRules.maxAmount,
      effectiveFrom: commissionRules.effectiveFrom,
      effectiveTo: commissionRules.effectiveTo,
      isActive: commissionRules.isActive,
    })
    .from(commissionRules)
    .innerJoin(services, eq(commissionRules.serviceId, services.id))
    .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .leftJoin(providers, eq(commissionRules.providerId, providers.id))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(
      asc(serviceCategories.displayOrder),
      asc(services.displayOrder),
      asc(commissionRules.role),
      desc(commissionRules.effectiveFrom),
    );

  return rows.map((r) => ({
    ...r,
    value: String(r.value),
    minAmount: r.minAmount != null ? String(r.minAmount) : null,
    maxAmount: r.maxAmount != null ? String(r.maxAmount) : null,
  }));
}

type RuleSnapshotRow = {
  serviceId: string;
  providerId: string | null;
  role: string;
  ruleType: string;
  value: string | number;
  minAmount: string | number | null;
  maxAmount: string | number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
};

function ruleSnapshot(r: RuleSnapshotRow): Record<string, unknown> {
  return {
    serviceId: r.serviceId,
    providerId: r.providerId,
    role: r.role,
    ruleType: r.ruleType,
    value: String(r.value),
    minAmount: r.minAmount != null ? String(r.minAmount) : null,
    maxAmount: r.maxAmount != null ? String(r.maxAmount) : null,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    isActive: r.isActive,
  };
}

export async function createCommissionRule(
  adminId: string,
  input: CommissionRuleInput,
  opts?: { reason?: string },
) {
  if (!isSchemeRole(input.role)) {
    throw new HttpError(400, "Role must be retailer, distributor, or super_distributor", "INVALID_ROLE");
  }
  await assertServiceExists(input.serviceId);
  await assertProviderExists(input.providerId);

  const value = validateRuleValue(input.ruleType, input.value);
  const minAmount = normalizeAmountBound(input.minAmount, "minAmount");
  const maxAmount = normalizeAmountBound(input.maxAmount, "maxAmount");
  if (minAmount != null && maxAmount != null && Number(minAmount) > Number(maxAmount)) {
    throw new HttpError(400, "Min amount cannot be greater than max amount", "INVALID_AMOUNT");
  }

  const effectiveFrom = parseOptionalDate(input.effectiveFrom, "effectiveFrom") ?? new Date();
  const effectiveTo = parseOptionalDate(input.effectiveTo, "effectiveTo");
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new HttpError(400, "Effective to must be after effective from", "INVALID_DATE");
  }

  await assertCommissionMonthUnlocked([effectiveFrom]);

  const [created] = await db
    .insert(commissionRules)
    .values({
      serviceId: input.serviceId,
      providerId: input.providerId || null,
      role: input.role,
      ruleType: input.ruleType,
      value,
      minAmount,
      maxAmount,
      effectiveFrom,
      effectiveTo,
      isActive: input.isActive !== false,
    })
    .returning();

  if (!created) {
    throw new HttpError(500, "Failed to create commission rule", "RULE_CREATE_FAILED");
  }

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_rule_create",
    entityType: "commission_rule",
    entityId: created.id,
    metadata: { serviceId: input.serviceId, role: input.role, ruleType: input.ruleType, value },
  });
  await recordRateChangeEvent({
    adminId,
    entityType: "rule",
    entityId: created.id,
    serviceId: created.serviceId,
    before: null,
    after: ruleSnapshot(created),
    reason: opts?.reason ?? "Rule created",
  });

  return created;
}

export async function updateCommissionRule(
  adminId: string,
  ruleId: string,
  patch: Partial<CommissionRuleInput>,
  opts?: { reason?: string },
) {
  const [existing] = await db.select().from(commissionRules).where(eq(commissionRules.id, ruleId)).limit(1);
  if (!existing) throw new HttpError(404, "Commission rule not found", "RULE_NOT_FOUND");

  if (patch.role !== undefined && !isSchemeRole(patch.role)) {
    throw new HttpError(400, "Role must be retailer, distributor, or super_distributor", "INVALID_ROLE");
  }
  if (patch.serviceId) await assertServiceExists(patch.serviceId);
  if (patch.providerId !== undefined) await assertProviderExists(patch.providerId);

  const ruleType = patch.ruleType ?? existing.ruleType;
  const value =
    patch.value !== undefined ? validateRuleValue(ruleType, patch.value) : String(existing.value);
  if (patch.ruleType && patch.value === undefined) {
    validateRuleValue(ruleType, String(existing.value));
  }

  const minAmount =
    patch.minAmount !== undefined
      ? normalizeAmountBound(patch.minAmount, "minAmount")
      : existing.minAmount != null
        ? String(existing.minAmount)
        : null;
  const maxAmount =
    patch.maxAmount !== undefined
      ? normalizeAmountBound(patch.maxAmount, "maxAmount")
      : existing.maxAmount != null
        ? String(existing.maxAmount)
        : null;
  if (minAmount != null && maxAmount != null && Number(minAmount) > Number(maxAmount)) {
    throw new HttpError(400, "Min amount cannot be greater than max amount", "INVALID_AMOUNT");
  }

  const effectiveFrom =
    patch.effectiveFrom !== undefined
      ? (parseOptionalDate(patch.effectiveFrom, "effectiveFrom") ?? existing.effectiveFrom)
      : existing.effectiveFrom;
  const effectiveTo =
    patch.effectiveTo !== undefined
      ? parseOptionalDate(patch.effectiveTo, "effectiveTo")
      : existing.effectiveTo;
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new HttpError(400, "Effective to must be after effective from", "INVALID_DATE");
  }

  await assertCommissionMonthUnlocked([existing.effectiveFrom, effectiveFrom]);

  const [updated] = await db
    .update(commissionRules)
    .set({
      serviceId: patch.serviceId ?? existing.serviceId,
      providerId: patch.providerId !== undefined ? patch.providerId || null : existing.providerId,
      role: patch.role ?? existing.role,
      ruleType,
      value,
      minAmount,
      maxAmount,
      effectiveFrom,
      effectiveTo,
      isActive: patch.isActive ?? existing.isActive,
    })
    .where(eq(commissionRules.id, ruleId))
    .returning();

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_rule_update",
    entityType: "commission_rule",
    entityId: ruleId,
    metadata: patch as Record<string, unknown>,
  });
  if (updated) {
    await recordRateChangeEvent({
      adminId,
      entityType: "rule",
      entityId: ruleId,
      serviceId: updated.serviceId,
      before: ruleSnapshot(existing),
      after: ruleSnapshot(updated),
      reason: opts?.reason ?? "Rule updated",
    });
  }

  return updated;
}

export async function deleteCommissionRule(adminId: string, ruleId: string, opts?: { reason?: string }) {
  const [existing] = await db.select().from(commissionRules).where(eq(commissionRules.id, ruleId)).limit(1);
  if (!existing) throw new HttpError(404, "Commission rule not found", "RULE_NOT_FOUND");

  await assertCommissionMonthUnlocked([existing.effectiveFrom]);

  await db.delete(commissionRules).where(eq(commissionRules.id, ruleId));

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_rule_delete",
    entityType: "commission_rule",
    entityId: ruleId,
    metadata: {},
  });
  await recordRateChangeEvent({
    adminId,
    entityType: "rule",
    entityId: ruleId,
    serviceId: existing.serviceId,
    before: ruleSnapshot(existing),
    after: null,
    reason: opts?.reason ?? "Rule deleted",
  });

  return { id: ruleId, deleted: true };
}

/** Preview role-default payouts for an amount (ignores per-agent overrides). */
export async function previewCommissionSplit(input: {
  serviceId: string;
  amount: string;
  providerId?: string | null;
  /** Optional provider commission / pool for this txn — warns when scheme gross exceeds it. */
  providerPool?: string | null;
}) {
  await assertServiceExists(input.serviceId);
  if (input.providerId) await assertProviderExists(input.providerId);

  const amountNum = Number(input.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new HttpError(400, "Amount must be a positive number", "INVALID_AMOUNT");
  }
  const amount = amountNum.toFixed(2);
  const amountPaise = toPaise(amount);
  const now = new Date();
  const providerId = input.providerId || null;

  let providerPoolPaise: number | null = null;
  if (input.providerPool != null && String(input.providerPool).trim() !== "") {
    const poolNum = Number(input.providerPool);
    if (!Number.isFinite(poolNum) || poolNum < 0) {
      throw new HttpError(400, "Provider pool must be a non-negative number", "INVALID_PROVIDER_POOL");
    }
    providerPoolPaise = toPaise(poolNum.toFixed(2));
  }

  const { resolveTenantId } = await import("../fund-requests/tenant");
  const taxCfg = await resolveTaxForService(await resolveTenantId(), input.serviceId, now);

  const splits: Array<{
    role: SchemeRole;
    ruleId: string | null;
    ruleType: RuleType | null;
    value: string | null;
    payout: string;
    gross: string;
    tds: string;
    net: string;
    matched: boolean;
  }> = [];

  for (const role of SCHEME_ROLES) {
    const rule = await findRoleDefaultRule(input.serviceId, providerId, role, amount, now);
    if (!rule) {
      splits.push({
        role,
        ruleId: null,
        ruleType: null,
        value: null,
        payout: "0.00",
        gross: "0.00",
        tds: "0.00",
        net: "0.00",
        matched: false,
      });
      continue;
    }
    const grossPaise = computePayoutPaise(rule, amountPaise);
    const { netPaise, tdsPaise, grossPaise: g } = applyTdsToGrossPaise(Math.max(0, grossPaise), taxCfg);
    const net = fromPaise(netPaise);
    splits.push({
      role,
      ruleId: rule.id,
      ruleType: rule.ruleType,
      value: String(rule.value),
      payout: net,
      gross: fromPaise(g),
      tds: fromPaise(tdsPaise),
      net,
      matched: true,
    });
  }

  const totalNetPaise = splits.reduce((sum, s) => sum + toPaise(s.net), 0);
  const totalGrossPaise = splits.reduce((sum, s) => sum + toPaise(s.gross), 0);
  const underwater =
    providerPoolPaise == null
      ? null
      : {
          providerPool: fromPaise(providerPoolPaise),
          totalGross: fromPaise(totalGrossPaise),
          shortfall: fromPaise(Math.max(0, totalGrossPaise - providerPoolPaise)),
          isUnderwater: totalGrossPaise > providerPoolPaise,
        };

  return {
    serviceId: input.serviceId,
    providerId,
    amount,
    tax: {
      tdsApplies: taxCfg.tdsApplies,
      tdsPercent: taxCfg.tdsPercent,
      gstOnFeeApplies: taxCfg.gstOnFeeApplies,
      gstOnFeePercent: taxCfg.gstOnFeePercent,
    },
    splits,
    totalPayout: fromPaise(totalNetPaise),
    totalGross: fromPaise(totalGrossPaise),
    underwater,
  };
}

/**
 * TCR03 — daily underwater ops: scheme gross vs provider pool % of amount.
 * Pool is an admin ops input (same idea as preview providerPool), not a stored rule.
 */
export async function listAdminUnderwaterReport(filters?: {
  date?: string; // YYYY-MM-DD IST
  /** Expected provider commission as percent of txn/probe amount (0–100). */
  providerPoolPercent: string;
  probeAmount?: string;
  txnLimit?: number;
}) {
  const poolPct = Number(filters?.providerPoolPercent);
  if (!Number.isFinite(poolPct) || poolPct < 0 || poolPct > 100) {
    throw new HttpError(
      400,
      "Provider pool percent must be a number from 0 to 100",
      "INVALID_PROVIDER_POOL_PERCENT",
    );
  }

  const date = filters?.date?.trim() || todayYmdIst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, "date must be YYYY-MM-DD", "INVALID_DATE");
  }

  let probeAmount = "1000.00";
  if (filters?.probeAmount != null && String(filters.probeAmount).trim() !== "") {
    const n = Number(filters.probeAmount);
    if (!Number.isFinite(n) || n <= 0) {
      throw new HttpError(400, "Probe amount must be a positive number", "INVALID_AMOUNT");
    }
    probeAmount = n.toFixed(2);
  }
  const probePaise = toPaise(probeAmount);
  const probePoolPaise = Math.round((probePaise * poolPct) / 100);
  const probePool = fromPaise(probePoolPaise);
  const txnLimit = Math.min(filters?.txnLimit ?? 50, 100);

  const dayStart = istDayStart(date);
  const dayEnd = istDayEnd(date);

  const serviceRows = await db
    .selectDistinct({
      serviceId: commissionRules.serviceId,
      serviceCode: services.code,
      serviceName: services.name,
      providerId: commissionRules.providerId,
      providerName: providers.name,
    })
    .from(commissionRules)
    .innerJoin(services, eq(commissionRules.serviceId, services.id))
    .leftJoin(providers, eq(commissionRules.providerId, providers.id))
    .where(
      and(
        eq(commissionRules.isActive, true),
        sql`(${commissionRules.effectiveTo} is null or ${commissionRules.effectiveTo} >= ${dayStart})`,
        sql`${commissionRules.effectiveFrom} <= ${dayEnd}`,
      ),
    );

  const schemes: Array<{
    serviceId: string;
    serviceCode: string;
    serviceName: string;
    providerId: string | null;
    providerName: string | null;
    probeAmount: string;
    providerPool: string;
    totalGross: string;
    shortfall: string;
    schemesHref: string;
  }> = [];

  for (const s of serviceRows) {
    const preview = await previewCommissionSplit({
      serviceId: s.serviceId,
      amount: probeAmount,
      providerId: s.providerId,
      providerPool: probePool,
    });
    if (!preview.underwater?.isUnderwater) continue;
    const qs = new URLSearchParams({ serviceId: s.serviceId });
    if (s.providerId) qs.set("providerId", s.providerId);
    schemes.push({
      serviceId: s.serviceId,
      serviceCode: s.serviceCode,
      serviceName: s.serviceName,
      providerId: s.providerId,
      providerName: s.providerName,
      probeAmount,
      providerPool: preview.underwater.providerPool,
      totalGross: preview.underwater.totalGross,
      shortfall: preview.underwater.shortfall,
      schemesHref: `/tax-commission/schemes?${qs.toString()}`,
    });
  }

  schemes.sort((a, b) => toPaise(b.shortfall) - toPaise(a.shortfall));

  const txnAgg = await db
    .select({
      transactionId: commissionLedger.transactionId,
      txnRef: transactions.txnRef,
      createdAt: transactions.createdAt,
      amount: transactions.amount,
      serviceId: transactions.serviceId,
      serviceCode: services.code,
      serviceName: services.name,
      providerId: transactions.providerId,
      totalGross: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), '0')`,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(
      and(
        activeCommission,
        gte(commissionLedger.createdAt, dayStart),
        lte(commissionLedger.createdAt, dayEnd),
        eq(transactions.status, "success"),
      ),
    )
    .groupBy(
      commissionLedger.transactionId,
      transactions.txnRef,
      transactions.createdAt,
      transactions.amount,
      transactions.serviceId,
      services.code,
      services.name,
      transactions.providerId,
    )
    .orderBy(desc(transactions.createdAt))
    .limit(500);

  const underwaterTxns = txnAgg
    .map((r) => {
      const amountPaise = toPaise(String(r.amount));
      const poolPaise = Math.round((amountPaise * poolPct) / 100);
      const grossPaise = toPaise(String(r.totalGross));
      const shortfallPaise = Math.max(0, grossPaise - poolPaise);
      return {
        transactionId: r.transactionId,
        txnRef: r.txnRef,
        createdAt: r.createdAt.toISOString(),
        amount: String(r.amount),
        serviceId: r.serviceId,
        serviceCode: r.serviceCode,
        serviceName: r.serviceName,
        providerId: r.providerId,
        totalGross: String(r.totalGross),
        providerPool: fromPaise(poolPaise),
        shortfall: fromPaise(shortfallPaise),
        isUnderwater: grossPaise > poolPaise,
        schemesHref: `/tax-commission/schemes?serviceId=${encodeURIComponent(r.serviceId)}`,
      };
    })
    .filter((r) => r.isUnderwater)
    .sort((a, b) => toPaise(b.shortfall) - toPaise(a.shortfall))
    .slice(0, txnLimit);

  return {
    date,
    providerPoolPercent: String(Number(poolPct.toFixed(4))),
    probeAmount,
    summary: {
      underwaterSchemeCount: schemes.length,
      underwaterTxnCount: underwaterTxns.length,
    },
    schemes,
    txns: underwaterTxns,
  };
}
