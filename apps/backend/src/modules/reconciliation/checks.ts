import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { reconciliationExceptions } from "../../db/postgres/schema";

export interface ReconFinding {
  checkName: string;
  severity: "info" | "warn" | "critical";
  fingerprint: string;
  details: Record<string, unknown>;
}

/**
 * Ledger vs cached balance. The projection in account_balances must equal the sum of the
 * entries that produced it. Any drift means something wrote a balance outside postJournal().
 */
export async function checkLedgerVsBalance(tenantId: string): Promise<ReconFinding[]> {
  const rows = await db.execute<{
    code: string;
    cached: string;
    derived: string;
  }>(sql`
    SELECT a.code,
           ab.balance::text AS cached,
           COALESCE(SUM(
             CASE WHEN a.account_class IN ('asset','expense')
                  THEN CASE WHEN le.direction = 'DR' THEN le.amount ELSE -le.amount END
                  ELSE CASE WHEN le.direction = 'CR' THEN le.amount ELSE -le.amount END
             END), 0)::text AS derived
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    LEFT JOIN ledger_entries le ON le.account_id = a.id
    WHERE a.tenant_id = ${tenantId}
    GROUP BY a.code, ab.balance
    HAVING ab.balance <> COALESCE(SUM(
             CASE WHEN a.account_class IN ('asset','expense')
                  THEN CASE WHEN le.direction = 'DR' THEN le.amount ELSE -le.amount END
                  ELSE CASE WHEN le.direction = 'CR' THEN le.amount ELSE -le.amount END
             END), 0)
  `);

  return rows.rows.map((r) => ({
    checkName: "ledger_vs_balance",
    severity: "critical" as const,
    fingerprint: `ledger_vs_balance:${r.code}`,
    details: { code: r.code, cachedPaise: r.cached, derivedPaise: r.derived },
  }));
}

/**
 * Trial balance. Every journal must have Sum(DR) == Sum(CR). postJournal() asserts this before
 * writing, so a failure here means a write happened around the engine.
 */
export async function checkTrialBalance(tenantId: string): Promise<ReconFinding[]> {
  const rows = await db.execute<{ journal_id: string; dr: string; cr: string }>(sql`
    SELECT j.id::text AS journal_id,
           SUM(CASE WHEN le.direction = 'DR' THEN le.amount ELSE 0 END)::text AS dr,
           SUM(CASE WHEN le.direction = 'CR' THEN le.amount ELSE 0 END)::text AS cr
    FROM journals j
    JOIN ledger_entries le ON le.journal_id = j.id
    WHERE j.tenant_id = ${tenantId}
    GROUP BY j.id
    HAVING SUM(CASE WHEN le.direction = 'DR' THEN le.amount ELSE 0 END)
        <> SUM(CASE WHEN le.direction = 'CR' THEN le.amount ELSE 0 END)
  `);

  return rows.rows.map((r) => ({
    checkName: "trial_balance",
    severity: "critical" as const,
    fingerprint: `trial_balance:${r.journal_id}`,
    details: { journalId: r.journal_id, debitPaise: r.dr, creditPaise: r.cr },
  }));
}

/**
 * Solvency. Everything we hold (bank + transit + float) must cover everything we owe agents.
 * A shortfall means agent balances exist that no real money backs.
 */
export interface TreasurySummary {
  bank: bigint;
  transit: bigint;
  float: bigint;
  totalAssets: bigint;
  companyBalance: bigint;
  downlineLiability: bigint;
  solvent: boolean;
}

/**
 * One pass over the ledger for every treasury-side figure the dashboard and the solvency check
 * both need. Kept here rather than in reports.ts so the check and the API can never drift onto
 * two different definitions of "assets".
 */
export async function getTreasurySummary(tenantId: string): Promise<TreasurySummary> {
  const rows = await db.execute<{
    bank: string;
    transit: string;
    float: string;
    company: string;
    owed: string;
  }>(sql`
    SELECT
      COALESCE(SUM(ab.balance) FILTER (WHERE a.account_type = 'bank'), 0)::text AS bank,
      COALESCE(SUM(ab.balance) FILTER (WHERE a.account_type = 'transit'), 0)::text AS transit,
      COALESCE(SUM(ab.balance) FILTER (WHERE a.account_type = 'float'), 0)::text AS float,
      COALESCE(SUM(ab.balance) FILTER (WHERE a.account_type = 'company'), 0)::text AS company,
      COALESCE(SUM(ab.balance) FILTER (WHERE a.account_type IN ('sd','distributor','retailer')), 0)::text AS owed
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    WHERE a.tenant_id = ${tenantId}
  `);

  const row = rows.rows[0] ?? { bank: "0", transit: "0", float: "0", company: "0", owed: "0" };
  const bank = BigInt(row.bank);
  const transit = BigInt(row.transit);
  const float = BigInt(row.float);
  const totalAssets = bank + transit + float;
  const downlineLiability = BigInt(row.owed);

  return {
    bank,
    transit,
    float,
    totalAssets,
    companyBalance: BigInt(row.company),
    downlineLiability,
    solvent: totalAssets >= downlineLiability,
  };
}

export async function checkSolvency(tenantId: string): Promise<ReconFinding[]> {
  const { totalAssets: assets, downlineLiability: owed } = await getTreasurySummary(tenantId);
  if (assets >= owed) return [];

  return [
    {
      checkName: "solvency",
      severity: "critical",
      fingerprint: "solvency",
      details: { assetsPaise: assets.toString(), agentLiabilityPaise: owed.toString(), shortfallPaise: (owed - assets).toString() },
    },
  ];
}

/**
 * Settleable integrity. The withdrawable slice must never exceed the balance, and must equal
 * what the journal history implies. A drift here lets an agent withdraw money they spent.
 */
export async function checkSettleable(tenantId: string): Promise<ReconFinding[]> {
  // Scoped to LIABILITY accounts on purpose. "Settleable" only means anything for an agent
  // wallet; treasury and control accounts legitimately run negative (FLOAT_CONTROL sits at
  // minus the capacity it has issued), so comparing settleable against their balance would
  // flag every healthy treasury account as an exception.
  const rows = await db.execute<{ code: string; balance: string; settleable: string }>(sql`
    SELECT a.code, ab.balance::text, ab.settleable::text
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    WHERE a.tenant_id = ${tenantId}
      AND a.account_class = 'liability'
      AND (ab.settleable < 0 OR ab.settleable > ab.balance)
  `);

  const findings: ReconFinding[] = rows.rows.map((r) => ({
    checkName: "settleable_integrity",
    severity: "critical" as const,
    fingerprint: `settleable_integrity:${r.code}`,
    details: { code: r.code, balancePaise: r.balance, settleablePaise: r.settleable },
  }));

  // The other half of the rule: nothing outside an agent wallet may carry a settleable slice.
  // A treasury account with settleable > 0 would mean the engine classified platform float as
  // somebody's withdrawable earnings.
  const misplaced = await db.execute<{ code: string; settleable: string }>(sql`
    SELECT a.code, ab.settleable::text
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    WHERE a.tenant_id = ${tenantId}
      AND a.account_class <> 'liability'
      AND ab.settleable <> 0
  `);

  for (const r of misplaced.rows) {
    findings.push({
      checkName: "settleable_integrity",
      severity: "critical",
      fingerprint: `settleable_misplaced:${r.code}`,
      details: { code: r.code, settleablePaise: r.settleable, reason: "non-agent account carries settleable" },
    });
  }

  return findings;
}

/** Any agent wallet below zero. Should be impossible — the trigger blocks it. */
export async function checkNegativeAgentBalance(tenantId: string): Promise<ReconFinding[]> {
  const rows = await db.execute<{ code: string; balance: string }>(sql`
    SELECT a.code, ab.balance::text
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    WHERE a.tenant_id = ${tenantId} AND a.account_class = 'liability' AND ab.balance < 0
  `);

  return rows.rows.map((r) => ({
    checkName: "negative_agent_balance",
    severity: "critical" as const,
    fingerprint: `negative_agent_balance:${r.code}`,
    details: { code: r.code, balancePaise: r.balance },
  }));
}

/**
 * Money parked in a transit account longer than 4 hours. Transit is temporary — a balance
 * that does not clear means a float move or payout is stuck mid-flight.
 */
export async function checkStaleTransit(tenantId: string): Promise<ReconFinding[]> {
  const rows = await db.execute<{
    code: string;
    balance: string;
    updated_at: string;
  }>(sql`
    SELECT a.code, ab.balance::text, ab.updated_at::text
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    WHERE a.tenant_id = ${tenantId}
      AND a.account_type = 'transit'
      AND ab.balance <> 0
      AND ab.updated_at < NOW() - INTERVAL '4 hours'
  `);

  return rows.rows.map((r) => ({
    checkName: "stale_transit",
    severity: "warn" as const,
    fingerprint: `stale_transit:${r.code}`,
    details: {
      code: r.code,
      balancePaise: r.balance,
      lastUpdatedAt: r.updated_at,
      reason: "Transit balance has not cleared for more than 4 hours",
    },
  }));
}

/**
 * Fund requests still open after 24 hours. Terminal states (credited / rejected / cancelled)
 * are excluded — everything else needs an operator.
 */
export async function checkStaleFundRequest(tenantId: string): Promise<ReconFinding[]> {
  const rows = await db.execute<{
    id: string;
    status: string;
    amount: string;
    submitted_at: string;
  }>(sql`
    SELECT fr.id::text, fr.status, fr.amount::text, fr.submitted_at::text
    FROM fund_requests fr
    WHERE fr.tenant_id = ${tenantId}
      AND fr.status NOT IN ('credited', 'rejected', 'cancelled')
      AND fr.submitted_at < NOW() - INTERVAL '24 hours'
  `);

  return rows.rows.map((r) => ({
    checkName: "stale_fund_request",
    severity: "warn" as const,
    fingerprint: `stale_fund_request:${r.id}`,
    details: {
      fundRequestId: r.id,
      status: r.status,
      amountPaise: r.amount,
      submittedAt: r.submitted_at,
      reason: "Fund request unresolved for more than 24 hours",
    },
  }));
}

/**
 * Bank statement CREDIT lines still unmatched after 48 hours — the strongest leakage / fraud
 * signal on the platform. Detection only; parking to suspense is a separate human action.
 */
export async function checkUnmatchedBankCredits(tenantId: string): Promise<ReconFinding[]> {
  const rows = await db.execute<{
    id: string;
    amount: string;
    utr: string | null;
    imported_at: string;
  }>(sql`
    SELECT bsl.id::text,
           bsl.amount::text,
           bsl.utr,
           bsl.imported_at::text
    FROM bank_statement_lines bsl
    WHERE bsl.tenant_id = ${tenantId}
      AND bsl.direction = 'CR'
      AND bsl.match_status = 'unmatched'
      AND COALESCE(bsl.value_datetime, bsl.imported_at) < NOW() - INTERVAL '48 hours'
  `);

  return rows.rows.map((r) => ({
    checkName: "unmatched_bank_credit",
    severity: "critical" as const,
    fingerprint: `unmatched_bank_credit:${r.id}`,
    details: {
      statementLineId: r.id,
      amountPaise: r.amount,
      utr: r.utr,
      importedAt: r.imported_at,
      reason: "Bank credit unmatched for more than 48 hours",
    },
  }));
}

export const ALL_CHECKS = [
  checkLedgerVsBalance,
  checkTrialBalance,
  checkSolvency,
  checkSettleable,
  checkNegativeAgentBalance,
  checkStaleTransit,
  checkStaleFundRequest,
  checkUnmatchedBankCredits,
];

/**
 * Run every check and file what it finds. Auto-fix is forbidden: an exception stays open until
 * a human closes it with a reason, and any correction goes through postJournal() as a
 * RECON_ADJUSTMENT.
 */
export async function runReconciliation(tenantId: string): Promise<ReconFinding[]> {
  const findings: ReconFinding[] = [];
  for (const check of ALL_CHECKS) {
    findings.push(...(await check(tenantId)));
  }

  for (const f of findings) {
    const existing = await db
      .select({ id: reconciliationExceptions.id })
      .from(reconciliationExceptions)
      .where(
        and(
          eq(reconciliationExceptions.tenantId, tenantId),
          eq(reconciliationExceptions.fingerprint, f.fingerprint),
          eq(reconciliationExceptions.status, "open"),
        ),
      )
      .limit(1);

    if (existing[0]) {
      // Same ongoing problem — refresh it rather than filing a duplicate every run.
      await db
        .update(reconciliationExceptions)
        .set({ details: f.details, lastSeenAt: new Date() })
        .where(eq(reconciliationExceptions.id, existing[0].id));
    } else {
      await db.insert(reconciliationExceptions).values({
        tenantId,
        checkName: f.checkName,
        severity: f.severity,
        fingerprint: f.fingerprint,
        details: f.details,
      });
    }
  }

  return findings;
}
