import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { transactions, users } from "../../db/postgres/schema";
import {
  commissionCreditEmailTemplate,
  deviceNewLoginEmailTemplate,
  largeDebitAlertEmailTemplate,
  notifyUserEmail,
  productUpdateEmailTemplate,
  securityPinChangedEmailTemplate,
  statementEmailTemplate,
  type SendMailInput,
} from "../../utils/mailer";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";

export async function notifyVerifiedUser(
  userId: string,
  build: (ctx: { name: string; email: string }) => SendMailInput,
): Promise<void> {
  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row?.email || !row.emailVerifiedAt) return;
  notifyUserEmail(row.email, () => build({ name: row.name, email: row.email! }));
}

export function notifyNewDeviceLogin(input: {
  userId: string;
  deviceLabel: string | null;
  ipAddress: string | null;
}): void {
  void notifyVerifiedUser(input.userId, ({ name }) =>
    deviceNewLoginEmailTemplate({
      name,
      deviceLabel: input.deviceLabel ?? "New device",
      ipAddress: input.ipAddress,
    }),
  );
}

export function notifyMpinChanged(userId: string): void {
  void notifyVerifiedUser(userId, ({ name }) =>
    securityPinChangedEmailTemplate({ name, kind: "mpin" }),
  );
}

export function notifyLargeWalletDebit(input: {
  userId: string;
  amount: string;
  targetName: string;
}): void {
  const threshold = env.WALLET_LARGE_DEBIT_ALERT_RS;
  const amountNum = Number(input.amount);
  if (!Number.isFinite(amountNum) || amountNum < threshold) return;
  void notifyVerifiedUser(input.userId, ({ name }) =>
    largeDebitAlertEmailTemplate({
      name,
      amount: input.amount,
      targetName: input.targetName,
      thresholdRs: threshold,
    }),
  );
}

export function notifyCommissionCredit(input: {
  userId: string;
  amount: string;
  txnRef: string;
}): void {
  void notifyVerifiedUser(input.userId, ({ name }) =>
    commissionCreditEmailTemplate({
      name,
      amount: input.amount,
      txnRef: input.txnRef,
    }),
  );
}

export async function broadcastProductUpdate(input: {
  subject: string;
  headline: string;
  body: string;
}): Promise<{ sent: number }> {
  const rows = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(
      and(
        isNotNull(users.email),
        isNotNull(users.emailVerifiedAt),
        eq(users.emailMarketingOptIn, true),
        eq(users.isActive, true),
      ),
    );

  let sent = 0;
  for (const row of rows) {
    if (!row.email) continue;
    notifyUserEmail(row.email, () =>
      productUpdateEmailTemplate({
        name: row.name,
        subject: input.subject,
        headline: input.headline,
        body: input.body,
      }),
    );
    sent += 1;
  }
  return { sent };
}

type Period = "daily" | "monthly";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Emails verified users a compact txn summary for the previous UTC day / previous calendar month. */
export async function runStatementEmailJobs(): Promise<{ daily: number; monthly: number }> {
  const now = new Date();
  const today = startOfUtcDay(now);
  const yesterdayStart = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const daily = await sendStatementsForRange("daily", yesterdayStart, today);

  let monthly = 0;
  if (now.getUTCDate() === 1) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    monthly = await sendStatementsForRange("monthly", monthStart, monthEnd);
  }

  return { daily, monthly };
}

async function sendStatementsForRange(period: Period, from: Date, to: Date): Promise<number> {
  const rows = await db
    .select({
      userId: transactions.userId,
      name: users.name,
      email: users.email,
      txnCount: sql<number>`count(*)::int`,
      successCount: sql<number>`count(*) filter (where ${transactions.status} = 'success')::int`,
      volume: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.status} = 'success'), 0)::text`,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.userId, users.id))
    .where(
      and(
        gte(transactions.createdAt, from),
        lt(transactions.createdAt, to),
        isNotNull(users.email),
        isNotNull(users.emailVerifiedAt),
        eq(users.isActive, true),
      ),
    )
    .groupBy(transactions.userId, users.name, users.email);

  let sent = 0;
  for (const row of rows) {
    if (!row.email || row.txnCount < 1) continue;
    notifyUserEmail(row.email, () =>
      statementEmailTemplate({
        name: row.name,
        period,
        from,
        to,
        txnCount: row.txnCount,
        successCount: row.successCount,
        volumeRs: row.volume,
      }),
    );
    sent += 1;
  }
  logger.info({ period, from, to, sent }, "statement emails queued");
  return sent;
}
