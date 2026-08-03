import { and, between, eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { bankStatementLines, fundRequests } from "../../db/postgres/schema";
import type { Tx } from "../../core/ledger";

export type MatchOutcome =
  | { tier: 1; confidence: 100; lineId: bigint; amount: bigint; status: "auto_matched" }
  | { tier: 2; confidence: 80; lineId: bigint; amount: bigint; status: "amount_mismatch" }
  | { tier: 3; confidence: 60; lineId: bigint; amount: bigint; status: "under_review" }
  | { tier: 4; confidence: 0; lineId: null; amount: null; status: "pending_match" }
  | { tier: 0; confidence: 0; lineId: bigint; amount: null; status: "suspect" };

/**
 * Match one fund request against imported bank statement lines.
 *
 * Only tier 1 — exact UTR AND exact amount — may ever auto-credit. Everything else goes to a
 * human. A fuzzy match that credits the wrong retailer is unrecoverable in a way that a few
 * hours of review delay simply is not.
 */
export async function matchFundRequest(
  tx: Tx,
  request: typeof fundRequests.$inferSelect,
): Promise<MatchOutcome> {
  const from = new Date(request.depositDatetime.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(request.depositDatetime.getTime() + 48 * 60 * 60 * 1000);

  const candidates = await tx
    .select()
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.bankAccountId, request.bankAccountId),
        eq(bankStatementLines.direction, "CR"),
        between(
          bankStatementLines.txnDate,
          from.toISOString().slice(0, 10),
          to.toISOString().slice(0, 10),
        ),
      ),
    );

  const ref = request.referenceNorm;

  if (ref) {
    const utrMatches = candidates.filter((l) => l.utrNorm === ref);

    // A UTR that already belongs to another claim. Do NOT auto-reject: an honest
    // duplicate-entry mistake and a deliberate double-claim look identical from here.
    const consumed = utrMatches.find((l) => l.matchStatus !== "unmatched" || l.matchedToId !== null);
    if (consumed) {
      return { tier: 0, confidence: 0, lineId: consumed.id, amount: null, status: "suspect" };
    }

    const exact = utrMatches.find((l) => l.amount === request.amount);
    if (exact) {
      return { tier: 1, confidence: 100, lineId: exact.id, amount: exact.amount, status: "auto_matched" };
    }

    const differing = utrMatches[0];
    if (differing) {
      return {
        tier: 2,
        confidence: 80,
        lineId: differing.id,
        amount: differing.amount,
        status: "amount_mismatch",
      };
    }
  }

  // Tier 3 — a cash deposit slip carries no UTR. Amount + same day + a plausible sender name
  // is suggestive, never conclusive, so this can only ever reach a human.
  const sameDay = candidates.filter(
    (l) =>
      l.matchStatus === "unmatched" &&
      l.matchedToId === null &&
      l.amount === request.amount &&
      l.txnDate === request.depositDatetime.toISOString().slice(0, 10),
  );

  if (sameDay.length === 1) {
    const only = sameDay[0] as (typeof candidates)[number];
    const similar =
      !request.senderName ||
      !only.senderName ||
      nameSimilarity(request.senderName, only.senderName) > 0.8;

    if (similar) {
      return { tier: 3, confidence: 60, lineId: only.id, amount: only.amount, status: "under_review" };
    }
  }

  return { tier: 4, confidence: 0, lineId: null, amount: null, status: "pending_match" };
}

/**
 * Claim a statement line for a request. The partial unique index on
 * (matched_to_type, matched_to_id) is the real guard; the row lock here just turns a
 * concurrent race into a clean "already claimed" instead of a constraint error.
 */
export async function claimStatementLine(
  tx: Tx,
  lineId: bigint,
  requestId: bigint,
): Promise<boolean> {
  const [line] = await tx
    .select({ id: bankStatementLines.id, matchStatus: bankStatementLines.matchStatus, matchedToId: bankStatementLines.matchedToId })
    .from(bankStatementLines)
    .where(eq(bankStatementLines.id, lineId))
    .for("update");

  if (!line) return false;
  if (line.matchedToId !== null || line.matchStatus === "matched") return false;

  await tx
    .update(bankStatementLines)
    .set({ matchStatus: "matched", matchedToType: "fund_request", matchedToId: requestId })
    .where(eq(bankStatementLines.id, lineId));

  return true;
}

/**
 * Token-overlap similarity, deliberately crude. It only ever gates whether a case reaches a
 * human, never whether money moves, so a smarter algorithm would buy nothing here.
 */
export function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    new Set(
      s
        .toUpperCase()
        .replace(/[^A-Z ]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );

  const setA = norm(a);
  const setB = norm(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;

  return shared / Math.min(setA.size, setB.size);
}

/** Requests still unresolved past the review window, for the exceptions queue. */
export async function staleRequestCount(tenantId: string, hours = 24): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(fundRequests)
    .where(
      and(
        eq(fundRequests.tenantId, tenantId),
        sql`${fundRequests.status} IN ('submitted','pending_match','amount_mismatch','under_review','suspect')`,
        sql`${fundRequests.submittedAt} < now() - make_interval(hours => ${hours})`,
      ),
    );

  return Number(row?.n ?? 0);
}
