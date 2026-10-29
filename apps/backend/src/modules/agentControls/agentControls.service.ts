import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "../../db/postgres";
import { agentServiceBlocks, agentTxnLimits, serviceCategories, services, transactions } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import type { Tx } from "../../core/ledger/types";
import { HttpError } from "../../utils/httpError";
import { resolveServiceTxnType } from "../wallet/wallet.ledger";
import { toPaise } from "../wallet/decimal";
import {
  DMT_AGENT_DAILY_LIMIT_RUPEES,
  DMT_LIMIT_STATUSES,
  DMT_PER_TXN_LIMIT_RUPEES,
  formatRupees,
  isDmtServiceCode,
  istDayStart,
  istMonthStart,
} from "../limits/moneyLimits";

/**
 * Per-agent service switches and transaction limits (admin → agent → Services & limits).
 * Blocks are checked by the route guards (serviceWindowGuard / serviceBlockGuard) and again in
 * executeServiceTxn; limits are enforced only in executeServiceTxn, inside the claim transaction.
 */

export const AGENT_SERVICE_GROUPS = ["aeps", "dmt", "bbps", "recharge", "cms", "upi_cash_point"] as const;
export type AgentServiceGroup = (typeof AGENT_SERVICE_GROUPS)[number];

export const AGENT_SERVICE_LABEL: Record<AgentServiceGroup, string> = {
  aeps: "AePS",
  dmt: "Money transfer (DMT)",
  bbps: "Bill payments (BBPS)",
  recharge: "Recharge",
  cms: "CMS",
  upi_cash_point: "UPI Cash Point",
};

const MAX_LIMIT_RUPEES = 100_000_000;
const CATALOG_CACHE_MS = 60_000;

// ── Service → group mapping ─────────────────────────────────────────────────

const CODE_GROUP: Readonly<Record<string, AgentServiceGroup>> = {
  UPI_CASH_POINT: "upi_cash_point",
  CASH_COLLECTION: "cms",
  AGENT_COLLECTION: "cms",
};

function groupForService(code: string, categoryCode: string): AgentServiceGroup | null {
  const direct = CODE_GROUP[code];
  if (direct) return direct;
  if (isDmtServiceCode(code)) return "dmt";
  switch (resolveServiceTxnType(code, categoryCode)) {
    case "DMT":
      return "dmt";
    case "AEPS_WITHDRAWAL":
    case "AEPS_DEPOSIT":
    case "AADHAAR_PAY":
      return "aeps";
    case "RECHARGE":
      return "recharge";
    case "BBPS":
      return "bbps";
    default:
      return null;
  }
}

type CatalogRow = { id: string; code: string; group: AgentServiceGroup | null; maxAmount: string | null; isActive: boolean };
let catalogCache: { at: number; rows: CatalogRow[] } | null = null;

async function catalog(): Promise<CatalogRow[]> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_CACHE_MS) return catalogCache.rows;
  const rows = await db
    .select({
      id: services.id,
      code: services.code,
      maxAmount: services.maxAmount,
      isActive: services.isActive,
      categoryCode: serviceCategories.code,
    })
    .from(services)
    .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id));
  const mapped = rows.map((r) => ({
    id: r.id,
    code: r.code,
    maxAmount: r.maxAmount,
    isActive: r.isActive,
    group: groupForService(r.code, r.categoryCode),
  }));
  catalogCache = { at: Date.now(), rows: mapped };
  return mapped;
}

export async function serviceGroupForCode(code: string): Promise<AgentServiceGroup | null> {
  return (await catalog()).find((r) => r.code === code)?.group ?? null;
}

// ── Service on/off ──────────────────────────────────────────────────────────

export function blockedMessage(group: AgentServiceGroup): string {
  return `${AGENT_SERVICE_LABEL[group]} is turned off for your account. Contact support.`;
}

export async function assertServiceNotBlocked(userId: string, group: AgentServiceGroup): Promise<void> {
  const [row] = await db
    .select({ id: agentServiceBlocks.id })
    .from(agentServiceBlocks)
    .where(and(eq(agentServiceBlocks.userId, userId), eq(agentServiceBlocks.serviceGroup, group)))
    .limit(1);
  if (row) throw new HttpError(403, blockedMessage(group), "SERVICE_BLOCKED");
}

/** Route guard for start routes outside the night window (UPI Cash Point). */
export function serviceBlockGuard(group: AgentServiceGroup) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    await assertServiceNotBlocked(req.auth.sub, group);
    next();
  };
}

/** GET /admin/users/:id/service-access */
export async function listServiceAccess(userId: string) {
  const rows = await db.select().from(agentServiceBlocks).where(eq(agentServiceBlocks.userId, userId));
  return AGENT_SERVICE_GROUPS.map((group) => {
    const r = rows.find((x) => x.serviceGroup === group);
    return {
      group,
      label: AGENT_SERVICE_LABEL[group],
      enabled: !r,
      reason: r?.reason ?? null,
      blockedAt: r ? r.createdAt.toISOString() : null,
    };
  });
}

/** PUT /admin/users/:id/service-access */
export async function setServiceAccess(
  adminId: string,
  userId: string,
  input: { group: AgentServiceGroup; enabled: boolean; reason: string },
) {
  if (input.enabled) {
    await db
      .delete(agentServiceBlocks)
      .where(and(eq(agentServiceBlocks.userId, userId), eq(agentServiceBlocks.serviceGroup, input.group)));
  } else {
    await db
      .insert(agentServiceBlocks)
      .values({ userId, serviceGroup: input.group, reason: input.reason, createdBy: adminId })
      .onConflictDoUpdate({
        target: [agentServiceBlocks.userId, agentServiceBlocks.serviceGroup],
        set: { reason: input.reason, createdBy: adminId, createdAt: new Date() },
      });
  }
  await insertAuditLog({
    userId: adminId,
    action: input.enabled ? "admin.service_unblock" : "admin.service_block",
    entityType: "user",
    entityId: userId,
    metadata: { group: input.group, reason: input.reason },
  });
  return listServiceAccess(userId);
}

// ── Transaction limits ──────────────────────────────────────────────────────

export interface AgentLimit {
  perTxnRupees: number | null;
  dailyRupees: number | null;
  monthlyRupees: number | null;
}

interface PlatformDefault {
  perTxnRupees: number | null;
  dailyRupees: number | null;
  monthlyRupees: number | null;
}

async function platformDefaults(): Promise<Record<AgentServiceGroup, PlatformDefault>> {
  const rows = await catalog();
  const out = {} as Record<AgentServiceGroup, PlatformDefault>;
  for (const group of AGENT_SERVICE_GROUPS) {
    const maxes = rows
      .filter((r) => r.group === group && r.isActive && r.maxAmount != null)
      .map((r) => Number(r.maxAmount));
    let perTxn = maxes.length > 0 ? Math.max(...maxes) : null;
    if (group === "dmt") perTxn = perTxn == null ? DMT_PER_TXN_LIMIT_RUPEES : Math.min(perTxn, DMT_PER_TXN_LIMIT_RUPEES);
    out[group] = {
      perTxnRupees: perTxn,
      dailyRupees: group === "dmt" ? DMT_AGENT_DAILY_LIMIT_RUPEES : null,
      monthlyRupees: null,
    };
  }
  return out;
}

const num = (v: string | null) => (v == null ? null : Number(v));

export async function getAgentLimit(userId: string, group: AgentServiceGroup): Promise<AgentLimit | null> {
  const [r] = await db
    .select()
    .from(agentTxnLimits)
    .where(and(eq(agentTxnLimits.userId, userId), eq(agentTxnLimits.serviceGroup, group)))
    .limit(1);
  if (!r) return null;
  return { perTxnRupees: num(r.perTxnRupees), dailyRupees: num(r.dailyRupees), monthlyRupees: num(r.monthlyRupees) };
}

/** GET /admin/users/:id/txn-limits */
export async function listAgentLimits(userId: string) {
  const [rows, defaults] = await Promise.all([
    db.select().from(agentTxnLimits).where(eq(agentTxnLimits.userId, userId)),
    platformDefaults(),
  ]);
  return AGENT_SERVICE_GROUPS.map((group) => {
    const r = rows.find((x) => x.serviceGroup === group);
    return {
      group,
      label: AGENT_SERVICE_LABEL[group],
      platform: defaults[group],
      custom: r
        ? { perTxnRupees: num(r.perTxnRupees), dailyRupees: num(r.dailyRupees), monthlyRupees: num(r.monthlyRupees) }
        : null,
      reason: r?.reason ?? null,
      updatedAt: r ? r.updatedAt.toISOString() : null,
    };
  });
}

function checkAmountField(label: string, v: number | null): void {
  if (v == null) return;
  if (!Number.isFinite(v) || v <= 0) throw new HttpError(422, `${label} must be more than ₹0`, "INVALID_LIMIT");
  if (Math.round(v * 100) !== v * 100) throw new HttpError(422, `${label} can have at most 2 decimal places`, "INVALID_LIMIT");
  if (v > MAX_LIMIT_RUPEES) throw new HttpError(422, `${label} cannot be more than ${formatRupees(MAX_LIMIT_RUPEES)}`, "INVALID_LIMIT");
}

/** PUT /admin/users/:id/txn-limits */
export async function setAgentLimit(
  adminId: string,
  userId: string,
  input: { group: AgentServiceGroup; perTxnRupees: number | null; dailyRupees: number | null; monthlyRupees: number | null; reason: string },
) {
  const { group, perTxnRupees, dailyRupees, monthlyRupees } = input;
  if (perTxnRupees == null && dailyRupees == null && monthlyRupees == null) {
    throw new HttpError(422, "Enter at least one limit, or use Reset to go back to platform defaults", "LIMIT_REQUIRED");
  }
  checkAmountField("Per transaction limit", perTxnRupees);
  checkAmountField("Daily limit", dailyRupees);
  checkAmountField("Monthly limit", monthlyRupees);

  const platform = (await platformDefaults())[group];
  if (perTxnRupees != null && platform.perTxnRupees != null && perTxnRupees > platform.perTxnRupees) {
    throw new HttpError(
      422,
      `Per transaction limit cannot be more than the platform maximum ${formatRupees(platform.perTxnRupees)} for ${AGENT_SERVICE_LABEL[group]}`,
      "LIMIT_ABOVE_PLATFORM",
    );
  }
  if (perTxnRupees != null && dailyRupees != null && dailyRupees < perTxnRupees) {
    throw new HttpError(422, "Daily limit must be at least the per transaction limit", "INVALID_LIMIT");
  }
  if (dailyRupees != null && monthlyRupees != null && monthlyRupees < dailyRupees) {
    throw new HttpError(422, "Monthly limit must be at least the daily limit", "INVALID_LIMIT");
  }

  const before = await getAgentLimit(userId, group);
  const values = {
    perTxnRupees: perTxnRupees == null ? null : perTxnRupees.toFixed(2),
    dailyRupees: dailyRupees == null ? null : dailyRupees.toFixed(2),
    monthlyRupees: monthlyRupees == null ? null : monthlyRupees.toFixed(2),
    reason: input.reason,
    createdBy: adminId,
    updatedAt: new Date(),
  };
  await db
    .insert(agentTxnLimits)
    .values({ userId, serviceGroup: group, ...values })
    .onConflictDoUpdate({ target: [agentTxnLimits.userId, agentTxnLimits.serviceGroup], set: values });
  await insertAuditLog({
    userId: adminId,
    action: "admin.txn_limit_set",
    entityType: "user",
    entityId: userId,
    metadata: { group, before, after: { perTxnRupees, dailyRupees, monthlyRupees }, reason: input.reason },
  });
  return listAgentLimits(userId);
}

/** DELETE /admin/users/:id/txn-limits/:group */
export async function clearAgentLimit(adminId: string, userId: string, group: AgentServiceGroup, reason: string) {
  const before = await getAgentLimit(userId, group);
  await db.delete(agentTxnLimits).where(and(eq(agentTxnLimits.userId, userId), eq(agentTxnLimits.serviceGroup, group)));
  await insertAuditLog({
    userId: adminId,
    action: "admin.txn_limit_clear",
    entityType: "user",
    entityId: userId,
    metadata: { group, before, reason },
  });
  return listAgentLimits(userId);
}

// ── Enforcement (called from executeServiceTxn) ─────────────────────────────

export function assertAgentPerTxnLimit(group: AgentServiceGroup, limit: AgentLimit | null, amount: string): void {
  if (!limit?.perTxnRupees) return;
  if (toPaise(amount) > Math.round(limit.perTxnRupees * 100)) {
    throw new HttpError(
      422,
      `A single ${AGENT_SERVICE_LABEL[group]} transaction cannot be more than ${formatRupees(limit.perTxnRupees)} for your account. Enter a smaller amount.`,
      "AGENT_PER_TXN_LIMIT",
    );
  }
}

/**
 * Daily / monthly caps for one agent + service group. Runs inside the claim transaction under an
 * advisory lock so two parallel requests cannot both fit under a cap only one should.
 */
export async function assertAgentPeriodLimitsInTx(
  tx: Tx,
  userId: string,
  group: AgentServiceGroup,
  amount: string,
  caps: { dailyRupees: number | null; monthlyRupees: number | null },
): Promise<void> {
  if (!caps.dailyRupees && !caps.monthlyRupees) return;
  const serviceIds = (await catalog()).filter((r) => r.group === group).map((r) => r.id);
  if (serviceIds.length === 0) return;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agent_limit:${userId}:${group}`}))`);

  const now = new Date();
  const dayStart = istDayStart(now);
  const [row] = await tx
    .select({
      day: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.createdAt} >= ${dayStart}), 0)::text`,
      month: sql<string>`coalesce(sum(${transactions.amount}), 0)::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        inArray(transactions.serviceId, serviceIds),
        inArray(transactions.status, [...DMT_LIMIT_STATUSES]),
        gte(transactions.createdAt, istMonthStart(now)),
      ),
    );

  const label = AGENT_SERVICE_LABEL[group];
  const amountPaise = toPaise(amount);
  const check = (cap: number | null, usedText: string, period: "today" | "this month", word: "daily" | "monthly", retry: string) => {
    if (!cap) return;
    const capPaise = Math.round(cap * 100);
    const usedPaise = toPaise(usedText);
    if (usedPaise + amountPaise <= capPaise) return;
    const leftPaise = Math.max(0, capPaise - usedPaise);
    throw new HttpError(
      422,
      leftPaise === 0
        ? `You have reached your ${formatRupees(cap)} ${word} ${label} limit. ${retry}`
        : `You can do only ${formatRupees(leftPaise / 100)} more in ${label} ${period} (your ${word} limit is ${formatRupees(cap)}). Enter a smaller amount.`,
      word === "daily" ? "AGENT_DAILY_LIMIT" : "AGENT_MONTHLY_LIMIT",
    );
  };
  check(caps.dailyRupees, row?.day ?? "0", "today", "daily", "Try again tomorrow.");
  check(caps.monthlyRupees, row?.month ?? "0", "this month", "monthly", "Try again next month.");
}
