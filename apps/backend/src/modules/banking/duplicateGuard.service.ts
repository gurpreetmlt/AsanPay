import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { paiseToRupees, rupeesToPaise } from "../../core/money";
import { normaliseUtr } from "./banking.service";

export type DuplicateRiskCode = "UTR_ALREADY_CREDITED" | "AMOUNT_DATE_ALREADY_CREDITED" | "UTR_IN_STATEMENT";

export interface DuplicateRisk {
  code: DuplicateRiskCode;
  message: string;
  utr: string | null;
  amount: string | null;
  date: string | null;
}

/**
 * Soft duplicate / double-credit risks for statement import or fund-request credit.
 * Caller must require an explicit confirm before proceeding when risks.length > 0.
 */
export async function findImportDuplicateRisks(params: {
  tenantId: string;
  bankAccountId: string;
  lines: ReadonlyArray<{
    utr?: string | null;
    amount: string;
    direction: "CR" | "DR";
    txnDate?: string;
  }>;
}): Promise<DuplicateRisk[]> {
  const risks: DuplicateRisk[] = [];
  const credits = params.lines.filter((l) => l.direction === "CR");
  if (!credits.length) return risks;

  const withUtr = credits
    .map((l) => ({
      utr: normaliseUtr(l.utr),
      amount: rupeesToPaise(l.amount).toString(),
      date: l.txnDate?.slice(0, 10) ?? null,
    }))
    .filter((l): l is { utr: string; amount: string; date: string | null } => !!l.utr && l.utr.length >= 6);

  if (withUtr.length) {
    const pairs = sql.join(
      withUtr.map((k) => sql`(${k.utr}, ${k.amount}::bigint)`),
      sql`, `,
    );
    const credited = await db.execute<{ utr: string; amount: string; source: string; ref: string }>(sql`
      WITH k(utr, amount) AS (VALUES ${pairs})
      SELECT DISTINCT k.utr, k.amount::text AS amount, x.source, x.ref FROM k
      JOIN LATERAL (
        SELECT 'fund_request'::text AS source, fr.id::text AS ref
        FROM fund_requests fr
        WHERE fr.tenant_id = ${params.tenantId}
          AND fr.reference_norm = k.utr
          AND fr.status = 'credited'
        UNION ALL
        SELECT 'bank_entry'::text, be.id::text
        FROM bank_entries be
        WHERE be.tenant_id = ${params.tenantId}
          AND be.status = 'approved' AND be.reversed_at IS NULL
          AND upper(regexp_replace(coalesce(be.utr, ''), '[^A-Za-z0-9]', '', 'g')) = k.utr
      ) x ON true
      LIMIT 20
    `);
    for (const r of credited.rows) {
      risks.push({
        code: "UTR_ALREADY_CREDITED",
        message: `UTR ${r.utr} is already credited (₹${paiseToRupees(BigInt(r.amount))} via ${r.source.replace(/_/g, " ")} #${r.ref}). Importing again can double-count it.`,
        utr: r.utr,
        amount: paiseToRupees(BigInt(r.amount)),
        date: null,
      });
    }
  }

  const dated = credits
    .filter((l) => l.txnDate)
    .map((l) => ({
      amount: rupeesToPaise(l.amount).toString(),
      date: l.txnDate!.slice(0, 10),
    }));
  if (dated.length) {
    const pairs = sql.join(
      dated.map((k) => sql`(${k.date}::date, ${k.amount}::bigint)`),
      sql`, `,
    );
    const hits = await db.execute<{ txn_date: string; amount: string; cnt: string }>(sql`
      WITH k(txn_date, amount) AS (VALUES ${pairs})
      SELECT k.txn_date::text, k.amount::text AS amount, COUNT(*)::text AS cnt
      FROM k
      JOIN fund_requests fr ON fr.tenant_id = ${params.tenantId}
        AND fr.bank_account_id = ${params.bankAccountId}::bigint
        AND fr.status = 'credited'
        AND fr.amount = k.amount
        AND (fr.deposit_datetime AT TIME ZONE 'Asia/Kolkata')::date = k.txn_date
      GROUP BY k.txn_date, k.amount
      HAVING COUNT(*) > 0
      LIMIT 10
    `);
    for (const r of hits.rows) {
      risks.push({
        code: "AMOUNT_DATE_ALREADY_CREDITED",
        message: `₹${paiseToRupees(BigInt(r.amount))} on ${r.txn_date} is already credited ${r.cnt} time(s) on this bank. Check this is not a second import of the same deposit.`,
        utr: null,
        amount: paiseToRupees(BigInt(r.amount)),
        date: r.txn_date,
      });
    }
  }

  // De-dupe identical messages
  const seen = new Set<string>();
  return risks.filter((r) => {
    const key = `${r.code}:${r.utr ?? ""}:${r.amount ?? ""}:${r.date ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Risks before crediting one fund request (same UTR already credited, or same amount+date). */
export async function findFundRequestCreditRisks(params: {
  tenantId: string;
  requestId: string;
  bankAccountId: string;
  referenceNorm: string | null;
  amountPaise: string;
  depositDate: string;
}): Promise<DuplicateRisk[]> {
  const risks: DuplicateRisk[] = [];
  const date = params.depositDate.slice(0, 10);

  if (params.referenceNorm && params.referenceNorm.length >= 6) {
    const rows = await db.execute<{ id: string; amount: string }>(sql`
      SELECT id::text, amount::text
      FROM fund_requests
      WHERE tenant_id = ${params.tenantId}
        AND reference_norm = ${params.referenceNorm}
        AND status = 'credited'
        AND id <> ${params.requestId}::bigint
      LIMIT 5
    `);
    for (const r of rows.rows) {
      risks.push({
        code: "UTR_ALREADY_CREDITED",
        message: `UTR ${params.referenceNorm} was already credited on fund request #${r.id} (₹${paiseToRupees(BigInt(r.amount))}). Approving again would double-credit.`,
        utr: params.referenceNorm,
        amount: paiseToRupees(BigInt(r.amount)),
        date: null,
      });
    }

    const be = await db.execute<{ id: string; amount: string }>(sql`
      SELECT id::text, amount::text
      FROM bank_entries
      WHERE tenant_id = ${params.tenantId}
        AND status = 'approved' AND reversed_at IS NULL
        AND upper(regexp_replace(coalesce(utr, ''), '[^A-Za-z0-9]', '', 'g')) = ${params.referenceNorm}
      LIMIT 5
    `);
    for (const r of be.rows) {
      risks.push({
        code: "UTR_ALREADY_CREDITED",
        message: `UTR ${params.referenceNorm} is already on approved bank entry #${r.id}. Approving this fund request may double-count the same money.`,
        utr: params.referenceNorm,
        amount: paiseToRupees(BigInt(r.amount)),
        date: null,
      });
    }
  }

  const sameAmt = await db.execute<{ id: string }>(sql`
    SELECT id::text
    FROM fund_requests
    WHERE tenant_id = ${params.tenantId}
      AND bank_account_id = ${params.bankAccountId}::bigint
      AND status = 'credited'
      AND amount = ${params.amountPaise}::bigint
      AND (deposit_datetime AT TIME ZONE 'Asia/Kolkata')::date = ${date}::date
      AND id <> ${params.requestId}::bigint
    LIMIT 3
  `);
  if (sameAmt.rows.length) {
    risks.push({
      code: "AMOUNT_DATE_ALREADY_CREDITED",
      message: `Another credited fund request (#${sameAmt.rows[0]!.id}) already used ₹${paiseToRupees(BigInt(params.amountPaise))} on ${date} for this bank.`,
      utr: params.referenceNorm,
      amount: paiseToRupees(BigInt(params.amountPaise)),
      date,
    });
  }

  return risks;
}
