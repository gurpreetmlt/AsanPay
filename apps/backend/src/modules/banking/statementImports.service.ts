import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { HttpError } from "../../utils/httpError";

/**
 * Statement upload history. One row per uploaded file / paste; every line it brought in carries
 * `import_id`. Matched / unmatched counts are computed from the lines on read, so undoing a match
 * or linking one later is reflected without touching this table.
 */

export async function startStatementImport(params: {
  tenantId: string;
  bankAccountId: bigint;
  importId?: string;
  fileName?: string | null;
  source?: "file" | "paste";
  periodFrom?: string;
  periodTo?: string;
  accountLast4?: string | null;
  /** verified = engine confirmed the bank; confirmed = admin ticked the confirmation. */
  verification?: "verified" | "confirmed";
  importedBy: string;
}): Promise<bigint> {
  if (params.importId) {
    const rows = await db.execute<{ id: string }>(sql`
      SELECT id::text FROM bank_statement_imports
      WHERE id = ${params.importId} AND tenant_id = ${params.tenantId}
        AND bank_account_id = ${String(params.bankAccountId)}
    `);
    if (!rows.rows[0]) {
      throw new HttpError(
        422,
        "This upload does not belong to the selected bank. Clear the statement and upload it again.",
        "IMPORT_MISMATCH",
      );
    }
    return BigInt(params.importId);
  }

  const rows = await db.execute<{ id: string }>(sql`
    INSERT INTO bank_statement_imports
      (tenant_id, bank_account_id, file_name, source, period_from, period_to,
       account_last4, verification, imported_by)
    VALUES (
      ${params.tenantId}, ${String(params.bankAccountId)}, ${params.fileName?.trim() || null},
      ${params.source ?? (params.fileName ? "file" : "paste")},
      ${params.periodFrom ?? null}, ${params.periodTo ?? null},
      ${params.accountLast4 ?? null}, ${params.verification ?? null}, ${params.importedBy}
    )
    RETURNING id::text
  `);
  const id = rows.rows[0]?.id;
  if (!id) throw new HttpError(500, "Could not record the statement upload", "IMPORT_FAILED");
  return BigInt(id);
}

export async function recordImportBatch(params: {
  importId: bigint;
  lines: number;
  inserted: number;
  duplicates: number;
}): Promise<void> {
  await db.execute(sql`
    UPDATE bank_statement_imports
    SET line_count = line_count + ${params.lines},
        inserted_count = inserted_count + ${params.inserted},
        duplicate_count = duplicate_count + ${params.duplicates}
    WHERE id = ${String(params.importId)}
  `);
}

type ImportRow = {
  id: string;
  bank_account_id: string;
  bank_name: string;
  last4: string;
  file_name: string | null;
  source: string;
  period_from: string | null;
  period_to: string | null;
  line_count: number;
  inserted_count: number;
  duplicate_count: number;
  imported_by_name: string | null;
  created_at: string;
  account_last4: string | null;
  verification: string | null;
  matched: string;
  suspense: string;
  unmatched: string;
};

export async function listStatementImports(params: {
  tenantId: string;
  bankAccountId?: string;
  limit: number;
}) {
  const bankFilter = params.bankAccountId ? sql`AND i.bank_account_id = ${params.bankAccountId}` : sql``;
  const rows = await db.execute<ImportRow>(sql`
    SELECT i.id::text, i.bank_account_id::text, ba.bank_name, ba.account_number_last4 AS last4,
           i.file_name, i.source, i.period_from::text, i.period_to::text,
           i.line_count, i.inserted_count, i.duplicate_count,
           u.name AS imported_by_name, i.created_at::text, i.account_last4, i.verification,
           COUNT(l.id) FILTER (WHERE l.matched_to_id IS NOT NULL)::text AS matched,
           COUNT(l.id) FILTER (WHERE l.matched_to_id IS NULL AND l.suspense_journal_id IS NOT NULL)::text AS suspense,
           COUNT(l.id) FILTER (
             WHERE l.matched_to_id IS NULL AND l.suspense_journal_id IS NULL AND l.match_status <> 'ignored'
           )::text AS unmatched
    FROM bank_statement_imports i
    JOIN bank_accounts ba ON ba.id = i.bank_account_id
    LEFT JOIN users u ON u.id = i.imported_by
    LEFT JOIN bank_statement_lines l ON l.import_id = i.id
    WHERE i.tenant_id = ${params.tenantId} ${bankFilter}
    GROUP BY i.id, ba.bank_name, ba.account_number_last4, u.name
    ORDER BY i.created_at DESC
    LIMIT ${params.limit}
  `);

  return rows.rows.map((r) => ({
    id: r.id,
    bankAccountId: r.bank_account_id,
    bankName: r.bank_name,
    last4: r.last4,
    fileName: r.file_name,
    source: r.source,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    lineCount: Number(r.line_count),
    newLines: Number(r.inserted_count),
    duplicates: Number(r.duplicate_count),
    matched: Number(r.matched),
    suspense: Number(r.suspense),
    unmatched: Number(r.unmatched),
    importedBy: r.imported_by_name,
    uploadedAt: r.created_at,
    accountLast4: r.account_last4,
    verification: r.verification,
  }));
}
