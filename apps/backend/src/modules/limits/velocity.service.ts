/**
 * Transaction velocity monitoring — task #10.
 *
 * RBI's AePS Touchpoint Operator Directions require risk-based operational controls including
 * transaction velocity limits, on top of the location profiling in modules/aeps/compliance.ts.
 * The project's own spec §9.4 asks for the same: "sudden 5x jump vs 30-day average -> force
 * manual review".
 *
 * This is a DIFFERENT signal from what already existed in txn.service.ts's checkFraudPatterns():
 *   - checkFraudPatterns compares one transaction's amount to the agent's all-time average
 *     transaction size for that service.
 *   - evaluateVelocitySpike (here) compares TODAY's total transaction volume to the agent's
 *     rolling 30-day average DAILY volume. A festival-day spike on a genuine business should
 *     not read the same as a compromised account suddenly moving unusual amounts.
 *
 * Alert-only, same as the existing fraud checks: writes to agent_risk_signals (task #15's
 * table — reused rather than a second findings store) and never blocks the transaction.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { transactions, agentRiskSignals, users } from "../../db/postgres/schema";
import { logger } from "../../utils/logger";
import { istDayStart } from "./moneyLimits";
import type { UserRole } from "@asanpay/shared-types";

/**
 * Fallback used by checkDailyLimit() in txn.service.ts when an agent has no
 * users.dailyLimitAmount configured. Without this, "no limit set" silently meant "no limit at
 * all" — the opposite of what a default should do. Figures are illustrative starting points in
 * rupees; tune once there is a month of real volume to calibrate against, same as every other
 * threshold introduced in this pass.
 */
export const ROLE_DEFAULT_DAILY_LIMIT: Partial<Record<UserRole, string>> = {
  retailer: "100000",
  distributor: "500000",
  super_distributor: "2000000",
};

const VELOCITY_MULTIPLIER = 5;
/** Need at least this many distinct days of history before a "30-day average" means anything. */
const MIN_HISTORY_DAYS = 7;
const LOOKBACK_DAYS = 30;

/**
 * Compare today's running transaction total (including the amount about to post) against the
 * agent's rolling 30-day average daily volume. Fires at >= 5x. Never throws, never blocks —
 * call this alongside the existing checks, not instead of them.
 */
export async function evaluateVelocitySpike(userId: string, amount: string): Promise<void> {
  try {
    const startOfDay = istDayStart();
    const lookbackStart = new Date(startOfDay.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const [todayRow] = await db
      .select({ total: sql<string>`coalesce(sum(${transactions.amount}), '0')` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "success"),
          gte(transactions.createdAt, startOfDay),
        ),
      );
    const todayTotal = Number(todayRow?.total ?? 0) + Number(amount);

    const historyRows = await db
      .select({
        day: sql<string>`date_trunc('day', ${transactions.createdAt} AT TIME ZONE 'Asia/Kolkata')`,
        dayTotal: sql<string>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "success"),
          gte(transactions.createdAt, lookbackStart),
          lt(transactions.createdAt, startOfDay),
        ),
      )
      .groupBy(sql`date_trunc('day', ${transactions.createdAt} AT TIME ZONE 'Asia/Kolkata')`);

    if (historyRows.length < MIN_HISTORY_DAYS) return;

    const avgDaily =
      historyRows.reduce((sum, r) => sum + Number(r.dayTotal), 0) / historyRows.length;
    if (avgDaily <= 0 || todayTotal < avgDaily * VELOCITY_MULTIPLIER) return;

    await db.insert(agentRiskSignals).values({
      userId,
      signalType: "txn_velocity_spike",
      severity: "warn",
      details: {
        todayTotal: todayTotal.toFixed(2),
        avgDailyOver30d: avgDaily.toFixed(2),
        historyDays: historyRows.length,
        multiplier: VELOCITY_MULTIPLIER,
      },
    });
  } catch (err: unknown) {
    // Fire-and-forget by contract: a failure here must never affect the transaction it was
    // evaluating alongside.
    logger.error({ err, userId }, "velocity spike evaluation failed");
  }
}

/** Role-based fallback so an unset dailyLimitAmount never silently means "no limit". */
export async function effectiveDailyLimit(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ role: users.role, dailyLimitAmount: users.dailyLimitAmount })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  return user.dailyLimitAmount ?? ROLE_DEFAULT_DAILY_LIMIT[user.role] ?? null;
}
