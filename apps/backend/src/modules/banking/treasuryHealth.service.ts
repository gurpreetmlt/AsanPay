import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { paiseToRupees } from "../../core/money";
import { getDailyCloseStatus } from "./dailyClose.service";

export type HealthBand = "healthy" | "watch" | "attention";

export interface TreasuryHealthScore {
  score: number;
  band: HealthBand;
  windowDays: number;
  match: {
    pct: number;
    matched: number;
    eligible: number;
    unmatched: number;
    needsReview: number;
  };
  gap: {
    pct: number;
    bank: string | null;
    books: string | null;
    difference: string | null;
  };
  freshness: {
    pct: number;
    activeBanks: number;
    banksWithStatement: number;
    oldestDays: number | null;
  };
  closePenalty: number;
  footnote: string | null;
}

function bandFor(score: number): HealthBand {
  if (score >= 90) return "healthy";
  if (score >= 70) return "watch";
  return "attention";
}

function freshScoreForDays(days: number | null): number {
  if (days === null) return 0;
  if (days <= 0) return 100;
  if (days === 1) return 80;
  if (days === 2) return 60;
  if (days === 3) return 40;
  if (days <= 6) return 20;
  return 0;
}

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Live treasury ops score (0–100): match quality + cash gap + statement freshness.
 * Optional −10 when today's daily-close blockers are still open.
 */
export async function getTreasuryHealthScore(params: {
  tenantId: string;
  windowDays?: number;
}): Promise<TreasuryHealthScore> {
  const windowDays = Math.min(Math.max(params.windowDays ?? 7, 1), 31);

  const matchRows = await db.execute<{
    matched: string;
    unmatched: string;
    needs_review: string;
    eligible: string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE match_status = 'matched')::text AS matched,
      COUNT(*) FILTER (WHERE match_status = 'unmatched')::text AS unmatched,
      COUNT(*) FILTER (WHERE match_status = 'suspense')::text AS needs_review,
      COUNT(*) FILTER (WHERE match_status IN ('matched', 'unmatched', 'suspense'))::text AS eligible
    FROM bank_statement_lines
    WHERE tenant_id = ${params.tenantId}
      AND txn_date >= ((now() AT TIME ZONE 'Asia/Kolkata')::date - ${windowDays - 1}::int)
  `);
  const matched = Number(matchRows.rows[0]?.matched ?? 0);
  const unmatched = Number(matchRows.rows[0]?.unmatched ?? 0);
  const needsReview = Number(matchRows.rows[0]?.needs_review ?? 0);
  const eligible = Number(matchRows.rows[0]?.eligible ?? 0);
  const matchPct = eligible === 0 ? 100 : Math.round((100 * matched) / eligible);

  const banks = await db.execute<{
    balance: string;
    statement_balance: string | null;
    statement_as_of: string | null;
  }>(sql`
    SELECT COALESCE(ab.balance, 0)::text AS balance,
           stmt.balance_after::text AS statement_balance,
           stmt.txn_date::text AS statement_as_of
    FROM bank_accounts ba
    LEFT JOIN account_balances ab ON ab.account_id = ba.ledger_account_id
    LEFT JOIN LATERAL (
      SELECT l.balance_after, l.txn_date
      FROM bank_statement_lines l
      WHERE l.bank_account_id = ba.id AND l.balance_after IS NOT NULL
      ORDER BY l.txn_date DESC, l.id DESC
      LIMIT 1
    ) stmt ON true
    WHERE ba.tenant_id = ${params.tenantId} AND ba.deleted_at IS NULL AND ba.is_active
  `);

  let statementPaise = 0n;
  let booksCompared = 0n;
  let banksWithStatement = 0;
  const today = istToday();
  const freshScores: number[] = [];
  let oldestDays: number | null = null;

  for (const b of banks.rows) {
    if (b.statement_balance != null) {
      statementPaise += BigInt(b.statement_balance);
      booksCompared += BigInt(b.balance);
      banksWithStatement += 1;
    }
    const asOf = b.statement_as_of;
    if (!asOf) {
      freshScores.push(0);
      continue;
    }
    const days = Math.max(
      0,
      Math.floor((Date.parse(today) - Date.parse(asOf)) / (24 * 3600 * 1000)),
    );
    freshScores.push(freshScoreForDays(days));
    oldestDays = oldestDays === null ? days : Math.max(oldestDays, days);
  }

  const activeBanks = banks.rows.length;
  const hasStatement = banksWithStatement > 0;
  const diffPaise = hasStatement ? statementPaise - booksCompared : null;
  let gapPct = 0;
  if (!hasStatement) {
    gapPct = 0;
  } else if (diffPaise === 0n) {
    gapPct = 100;
  } else {
    const bankAbs = statementPaise < 0n ? -statementPaise : statementPaise;
    const diffAbs = diffPaise! < 0n ? -diffPaise! : diffPaise!;
    if (bankAbs === 0n) {
      gapPct = diffAbs === 0n ? 100 : 0;
    } else {
      const ratio = Number((diffAbs * 10000n) / bankAbs) / 100;
      gapPct = Math.max(0, 100 - Math.min(100, Math.round(ratio)));
    }
  }

  const freshPct =
    activeBanks === 0
      ? 0
      : Math.round(freshScores.reduce((a, b) => a + b, 0) / activeBanks);

  let score = Math.round(0.5 * matchPct + 0.25 * gapPct + 0.25 * freshPct);
  let closePenalty = 0;
  let footnote: string | null = null;

  try {
    const close = await getDailyCloseStatus({ tenantId: params.tenantId, date: today });
    if (!close.closed) {
      const openBlockers = close.steps.filter((s) => s.blocking && !s.done);
      if (openBlockers.length) {
        closePenalty = 10;
        score = Math.max(0, score - closePenalty);
        footnote = `Today's daily close still open: ${openBlockers.map((s) => s.title).join(", ")} (−10)`;
      }
    }
  } catch {
    // score still valid without close checklist
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    band: bandFor(score),
    windowDays,
    match: { pct: matchPct, matched, eligible, unmatched, needsReview },
    gap: {
      pct: gapPct,
      bank: hasStatement ? paiseToRupees(statementPaise) : null,
      books: hasStatement ? paiseToRupees(booksCompared) : null,
      difference: diffPaise !== null ? paiseToRupees(diffPaise) : null,
    },
    freshness: {
      pct: freshPct,
      activeBanks,
      banksWithStatement,
      oldestDays,
    },
    closePenalty,
    footnote,
  };
}
