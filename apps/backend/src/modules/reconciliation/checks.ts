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
export async function checkSolvency(tenantId: string): Promise<ReconFinding[]> {
  const rows = await db.execute<{ assets: string; owed: string }>(sql`
    SELECT
      COALESCE(SUM(ab.balance) FILTER (WHERE a.account_type IN ('bank','transit','float')), 0)::text AS assets,
      COALESCE(SUM(ab.balance) FILTER (WHERE a.account_type IN ('sd','distributor','retailer')), 0)::text AS owed
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    WHERE a.tenant_id = ${tenantId}
  `);

  const row = rows.rows[0];
  if (!row) return [];

  const assets = BigInt(row.assets);
  const owed = BigInt(row.owed);
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

export const ALL_CHECKS = [
  checkLedgerVsBalance,
  checkTrialBalance,
  checkSolvency,
  checkSettleable,
  checkNegativeAgentBalance,
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
