import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { paiseToRupees } from "../../core/money";
import { runReconciliation, type ReconFinding } from "./checks";
import { floatCoverageSnapshot } from "../float/float.service";
import { unmatchedCreditCount } from "../banking/banking.service";

export interface LedgerHealthReport {
  trialBalanceOk: boolean;
  solvencyOk: boolean;
  solvency?: { assets: string; owed: string; shortfall: string };
  floatCoverage: {
    floatBalance: string;
    transitBalance: string;
    openTransfers: number;
    openAmount: string;
  };
  unmatchedBankCredits: number;
  openFindings: Array<{
    checkName: string;
    severity: ReconFinding["severity"];
    fingerprint: string;
    details: Record<string, unknown>;
  }>;
  ranAt: string;
}

/** Live treasury health for the admin reports page. Runs checks but does not persist. */
export async function getLedgerHealthReport(tenantId: string): Promise<LedgerHealthReport> {
  const {
    checkTrialBalance,
    checkSolvency,
    checkLedgerVsBalance,
    checkSettleable,
    checkNegativeAgentBalance,
    checkStaleTransit,
    checkStaleFundRequest,
    checkUnmatchedBankCredits,
  } = await import("./checks");

  const findings: ReconFinding[] = [];
  for (const check of [
    checkLedgerVsBalance,
    checkTrialBalance,
    checkSolvency,
    checkSettleable,
    checkNegativeAgentBalance,
    checkStaleTransit,
    checkStaleFundRequest,
    checkUnmatchedBankCredits,
  ]) {
    findings.push(...(await check(tenantId)));
  }

  const trialBalanceOk = !findings.some((f) => f.checkName === "trial_balance");
  const solvencyFinding = findings.find((f) => f.checkName === "solvency");
  const solvencyOk = !solvencyFinding;

  const floatCoverage = await floatCoverageSnapshot(tenantId);
  const unmatchedBankCredits = await unmatchedCreditCount(tenantId);

  return {
    trialBalanceOk,
    solvencyOk,
    solvency: solvencyFinding
      ? {
          assets: paiseToRupees(BigInt(String(solvencyFinding.details.assetsPaise ?? "0"))),
          owed: paiseToRupees(BigInt(String(solvencyFinding.details.agentLiabilityPaise ?? "0"))),
          shortfall: paiseToRupees(BigInt(String(solvencyFinding.details.shortfallPaise ?? "0"))),
        }
      : undefined,
    floatCoverage,
    unmatchedBankCredits,
    openFindings: findings.map((f) => ({
      checkName: f.checkName,
      severity: f.severity,
      fingerprint: f.fingerprint,
      details: f.details,
    })),
    ranAt: new Date().toISOString(),
  };
}

export async function runAndPersistReconciliation(tenantId: string) {
  const findings = await runReconciliation(tenantId);
  return {
    findingCount: findings.length,
    findings: findings.map((f) => ({
      checkName: f.checkName,
      severity: f.severity,
      fingerprint: f.fingerprint,
      details: f.details,
    })),
  };
}

export async function listOpenReconExceptions(tenantId: string, limit = 100) {
  const rows = await db.execute<{
    id: string;
    check_name: string;
    severity: string;
    fingerprint: string;
    details: Record<string, unknown>;
    first_seen_at: string;
    last_seen_at: string;
  }>(sql`
    SELECT id::text, check_name, severity, fingerprint, details,
           first_seen_at::text, last_seen_at::text
    FROM reconciliation_exceptions
    WHERE tenant_id = ${tenantId}
      AND status = 'open'
    ORDER BY last_seen_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 500)}
  `);

  return rows.rows.map((r) => ({
    id: r.id,
    checkName: r.check_name,
    severity: r.severity,
    fingerprint: r.fingerprint,
    details: r.details,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  }));
}
