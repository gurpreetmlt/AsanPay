import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { paiseToRupees, rupeesToPaise, type Paise } from "../../core/money";
import { HttpError } from "../../utils/httpError";
import { normaliseUtr } from "./banking.service";

/**
 * "Is this statement really from the bank the admin selected?" — checked before any line is
 * stored, because lines filed under the wrong bank corrupt that bank's reconciliation.
 *
 * Evidence, strongest first:
 *  1. Account number last 4 printed above the transaction table (hard: mismatch blocks)
 *  2. IFSC printed in the same header block (hard: mismatch blocks)
 *  3. Known transactions — UTR + amount already recorded against a bank
 *  4. Balance continuity — opening balance continues from that bank's last uploaded line
 * Nothing conclusive → the admin must confirm the bank explicitly.
 */

export type Verdict = "verified" | "blocked" | "unverified";

export interface VerifyCheck {
  code: "account" | "ifsc" | "known_txns" | "balance";
  result: "pass" | "fail" | "skipped";
  message: string;
}

export interface VerifyResult {
  verdict: Verdict;
  message: string;
  checks: VerifyCheck[];
  suggestedBank: { id: string; bankName: string; last4: string } | null;
  /** Soft duplicate / double-credit risks — import still needs confirmDuplicates when non-empty. */
  duplicateWarnings: Array<{
    code: string;
    message: string;
    utr: string | null;
    amount: string | null;
    date: string | null;
  }>;
}

export interface VerifyInput {
  tenantId: string;
  bankAccountId: string;
  accountLast4?: string | null;
  ifsc?: string | null;
  opening?: { date: string; balance: string } | null;
  lines: ReadonlyArray<{ utr?: string | null; amount: string; direction: "CR" | "DR"; txnDate?: string }>;
}

type BankRow = { id: string; bank_name: string; last4: string; ifsc: string };

const label = (b: BankRow) => `${b.bank_name} ••${b.last4}`;

export async function verifyStatementBank(input: VerifyInput): Promise<VerifyResult> {
  const banksRes = await db.execute<BankRow>(sql`
    SELECT id::text, bank_name, account_number_last4 AS last4, ifsc
    FROM bank_accounts
    WHERE tenant_id = ${input.tenantId} AND deleted_at IS NULL
  `);
  const banks = banksRes.rows;
  const selected = banks.find((b) => b.id === input.bankAccountId);
  if (!selected) throw new HttpError(404, "Company bank account not found", "BANK_NOT_FOUND");

  const checks: VerifyCheck[] = [];
  let suggested: BankRow | null = null;
  const others = banks.filter((b) => b.id !== selected.id);

  // 1. Account number
  const acct = input.accountLast4?.trim() || null;
  let accountPass = false;
  let hardFail = false;
  if (acct) {
    if (acct === selected.last4) {
      accountPass = true;
      checks.push({ code: "account", result: "pass", message: `Statement account ••${acct} matches ${label(selected)}` });
    } else {
      hardFail = true;
      suggested = others.find((b) => b.last4 === acct) ?? null;
      checks.push({
        code: "account",
        result: "fail",
        message: `This statement is for account ••${acct}, but you selected ${label(selected)}`,
      });
    }
  } else {
    checks.push({ code: "account", result: "skipped", message: "Account number not found in the statement" });
  }

  // 2. IFSC
  const ifsc = input.ifsc?.trim().toUpperCase() || null;
  let ifscPass = false;
  if (ifsc) {
    if (ifsc === selected.ifsc.trim().toUpperCase()) {
      ifscPass = true;
      checks.push({ code: "ifsc", result: "pass", message: `IFSC ${ifsc} matches ${label(selected)}` });
    } else {
      hardFail = true;
      suggested ??= others.find((b) => b.ifsc.trim().toUpperCase() === ifsc) ?? null;
      checks.push({
        code: "ifsc",
        result: "fail",
        message: `Statement IFSC ${ifsc} does not match ${label(selected)} (${selected.ifsc.toUpperCase()})`,
      });
    }
  } else {
    checks.push({ code: "ifsc", result: "skipped", message: "IFSC not found in the statement" });
  }

  // 3. Known transactions (UTR + amount) already recorded against a bank
  const keyed = input.lines
    .map((l) => ({ utr: normaliseUtr(l.utr), amount: rupeesToPaise(l.amount).toString() }))
    .filter((l): l is { utr: string; amount: string } => !!l.utr && l.utr.length >= 6);
  const hitsByBank = new Map<string, number>();
  if (keyed.length) {
    const pairs = sql.join(
      keyed.map((k) => sql`(${k.utr}, ${k.amount}::bigint)`),
      sql`, `,
    );
    const hits = await db.execute<{ bank_account_id: string; hits: string }>(sql`
      WITH k(utr, amount) AS (VALUES ${pairs})
      SELECT bank_account_id::text, COUNT(DISTINCT utr)::text AS hits FROM (
        SELECT l.bank_account_id, k.utr FROM k
        JOIN bank_statement_lines l ON l.tenant_id = ${input.tenantId} AND l.utr_norm = k.utr AND l.amount = k.amount
        UNION ALL
        SELECT be.bank_account_id, k.utr FROM k
        JOIN bank_entries be ON be.tenant_id = ${input.tenantId} AND be.bank_account_id IS NOT NULL
          AND be.status::text <> 'rejected' AND be.amount = k.amount
          AND upper(regexp_replace(coalesce(be.utr, ''), '[^A-Za-z0-9]', '', 'g')) = k.utr
        UNION ALL
        SELECT fr.bank_account_id, k.utr FROM k
        JOIN fund_requests fr ON fr.tenant_id = ${input.tenantId}
          AND fr.reference_norm = k.utr AND fr.amount = k.amount
      ) x
      GROUP BY bank_account_id
    `);
    for (const h of hits.rows) hitsByBank.set(h.bank_account_id, Number(h.hits));
  }
  const sameHits = hitsByBank.get(selected.id) ?? 0;
  const otherBest = others
    .map((b) => ({ bank: b, hits: hitsByBank.get(b.id) ?? 0 }))
    .sort((a, b) => b.hits - a.hits)[0];
  let knownFail = false;
  if (otherBest && otherBest.hits > sameHits && otherBest.hits > 0) {
    knownFail = true;
    suggested ??= otherBest.bank;
    checks.push({
      code: "known_txns",
      result: "fail",
      message:
        sameHits > 0
          ? `${otherBest.hits} transaction(s) match ${label(otherBest.bank)} vs ${sameHits} for ${label(selected)} — this file looks like the wrong bank`
          : `${otherBest.hits} transaction(s) on this statement are recorded for ${label(otherBest.bank)}, none for ${label(selected)}`,
    });
  } else if (sameHits > 0) {
    checks.push({
      code: "known_txns",
      result: "pass",
      message: `${sameHits} transaction(s) on this statement are already recorded for ${label(selected)}`,
    });
  } else {
    checks.push({ code: "known_txns", result: "skipped", message: "No transaction on this statement is recorded yet" });
  }

  // 4. Balance continuity with the last uploaded line before the statement starts
  let balancePass = false;
  let balanceOther: BankRow | null = null;
  /** Selected bank has prior lines but opening does not continue them (gap or wrong bank). */
  let balanceGap = false;
  if (input.opening) {
    const opening = rupeesToPaise(input.opening.balance);
    const last = await db.execute<{ bank_account_id: string; balance_after: string }>(sql`
      SELECT DISTINCT ON (bank_account_id) bank_account_id::text, balance_after::text
      FROM bank_statement_lines
      WHERE tenant_id = ${input.tenantId} AND balance_after IS NOT NULL AND txn_date < ${input.opening.date}
      ORDER BY bank_account_id, txn_date DESC, id DESC
    `);
    const lastBy = new Map(last.rows.map((r) => [r.bank_account_id, BigInt(r.balance_after)]));
    const prev = lastBy.get(selected.id);
    if (prev === undefined) {
      checks.push({ code: "balance", result: "skipped", message: `No earlier statement with balances for ${label(selected)}` });
    } else if (prev === opening) {
      balancePass = true;
      checks.push({
        code: "balance",
        result: "pass",
        message: `Opening balance ₹${paiseToRupees(opening)} continues from the last uploaded statement`,
      });
    } else {
      balanceOther = others.find((b) => lastBy.get(b.id) === opening) ?? null;
      balanceGap = !balanceOther;
      checks.push({
        code: "balance",
        result: "fail",
        message: balanceOther
          ? `Opening balance ₹${paiseToRupees(opening)} continues ${label(balanceOther)}'s statement, not ${label(selected)}'s (₹${paiseToRupees(prev as Paise)})`
          : `Opening balance ₹${paiseToRupees(opening)} does not continue from the last uploaded balance ₹${paiseToRupees(prev as Paise)} — wrong bank or a statement period is missing`,
      });
      if (balanceOther) suggested ??= balanceOther;
    }
  } else {
    checks.push({ code: "balance", result: "skipped", message: "Statement has no balance column" });
  }

  // Hard identity (account / IFSC) can override soft wrong-bank hints.
  // Soft matches (known UTRs / balance continuity on selected) must NOT override
  // stronger evidence that the file belongs to another company bank.
  const hardMatch = accountPass || ifscPass;
  const softMatch = sameHits > 0 || balancePass;
  const pointsElsewhere =
    knownFail ||
    !!balanceOther ||
    (!!otherBest && otherBest.hits > sameHits && otherBest.hits >= 1);
  if (pointsElsewhere && otherBest && otherBest.hits > sameHits) {
    suggested ??= otherBest.bank;
  }

  let verdict: Verdict;
  let message: string;
  if (hardFail) {
    verdict = "blocked";
    message = checks.find((c) => c.result === "fail" && (c.code === "account" || c.code === "ifsc"))!.message;
  } else if (pointsElsewhere && !hardMatch) {
    verdict = "blocked";
    message = `This statement looks like ${suggested ? label(suggested) : "another bank"}'s, not ${label(selected)}'s. Import is blocked — switch bank or upload the correct file.`;
  } else if (balanceGap && !hardMatch && !softMatch) {
    verdict = "blocked";
    message = `Opening balance does not continue ${label(selected)}'s last statement. Import is blocked — select the correct bank or upload the missing period first.`;
  } else if (hardMatch || softMatch) {
    verdict = "verified";
    message = `Statement verified for ${label(selected)}`;
  } else {
    verdict = "unverified";
    message = `Could not confirm this statement belongs to ${label(selected)}. Confirm the bank before importing.`;
  }

  const { findImportDuplicateRisks } = await import("./duplicateGuard.service");
  const duplicateWarnings = await findImportDuplicateRisks({
    tenantId: input.tenantId,
    bankAccountId: input.bankAccountId,
    lines: input.lines,
  });

  return {
    verdict,
    message,
    checks,
    suggestedBank: suggested ? { id: suggested.id, bankName: suggested.bank_name, last4: suggested.last4 } : null,
    duplicateWarnings,
  };
}
