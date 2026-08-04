import { and, eq, sql } from "drizzle-orm";
import { accounts, accountBalances, journals, ledgerEntries } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { assertPositiveAmount, paiseToRupees, type Paise } from "../money";
import { resolveAccounts, type ResolvedAccount } from "./accountResolver";
import { isFlowAllowed, isTxnType, type TxnType } from "./flowMatrix";
import type { Tx } from "./types";

export interface JournalEntryInput {
  /** Account code, resolved against (tenant_id, code). Never an id — nothing is hardcoded. */
  code: string;
  dir: "DR" | "CR";
  /** Paise. Always positive; direction carries the sign. */
  amount: Paise;
}

export interface PostJournalInput {
  tenantId: string;
  txnType: TxnType;
  /** Unique per tenant. A replay returns the original journal instead of posting again. */
  idemKey: string;
  /** The operator who caused this. NULL only for system-generated journals (cron, webhook). */
  performedBy?: string | null;
  reason?: string | null;
  referenceId?: string | null;
  /** Required when txnType is REVERSAL: the journal this one mirrors. */
  reversesId?: bigint | null;
  entries: readonly JournalEntryInput[];
}

export interface PostedJournal {
  id: bigint;
  tenantId: string;
  txnType: string;
  idemKey: string;
  /** True when the idempotency key had already been used and nothing new was written. */
  replayed: boolean;
}

// Credits that represent money the agent EARNED, and may therefore withdraw to their own bank.
// Everything else in a hierarchy wallet is a prepaid advance against services: spendable, but
// not cash-withdrawable. See spec §6.1 and §9.3 — this distinction is a compliance boundary,
// not a product preference.
const SETTLEABLE_CREDIT_TYPES = new Set<TxnType>([
  "AEPS_WITHDRAWAL",
  "MICRO_ATM",
  "AADHAAR_PAY",
  "COMMISSION_PAYOUT",
  // Migrated AePS earnings. Without this the backfill would silently convert money an agent
  // had already earned into a non-withdrawable advance.
  "OPENING_BALANCE_EARNED",
]);

const SETTLEABLE_DEBIT_TYPES = new Set<TxnType>(["SETTLEMENT_DEBIT", "SETTLEMENT_PAYOUT"]);

// Debits that may only consume the USABLE part of a liability wallet (balance - settleable),
// not the whole balance. An upline reclaiming an advance must not be able to reach into money
// the downline earned: that money is theirs to withdraw, and taking it would be the compliance
// problem the UPLINE_PULL type exists to bound. Without this the DB's
// `settleable <= balance` CHECK would still stop it, but as an opaque constraint error.
const USABLE_ONLY_DEBIT_TYPES = new Set<TxnType>(["UPLINE_PULL"]);

interface AccountDelta {
  account: ResolvedAccount;
  balanceDelta: bigint;
  settleableDelta: bigint;
}

/**
 * The ONLY function allowed to write journals, ledger_entries or account_balances.
 * Every other module calls this. The eslint import boundary in eslint.config.js is what
 * keeps a feature module from reaching around it.
 *
 * Always takes the caller's transaction — a journal is one atomic business event and must
 * commit or roll back together with whatever authorised it.
 */
export async function postJournal(tx: Tx, input: PostJournalInput): Promise<PostedJournal> {
  const { tenantId, txnType, idemKey, entries } = input;

  // 1 ── Shape and type validation -------------------------------------------------------
  if (!isTxnType(txnType)) {
    throw new HttpError(500, `Unknown ledger txn type: ${txnType}`, "UNKNOWN_TXN_TYPE");
  }
  if (!idemKey) {
    throw new HttpError(500, "postJournal requires an idempotency key", "IDEM_KEY_REQUIRED");
  }
  if (entries.length < 2) {
    throw new HttpError(500, "A journal needs at least one debit and one credit", "BAD_JOURNAL");
  }
  if (txnType === "REVERSAL" && !input.reversesId) {
    throw new HttpError(500, "A REVERSAL must reference the journal it mirrors", "BAD_REVERSAL");
  }
  if (txnType === "RECON_ADJUSTMENT" && (!input.reason || !input.performedBy)) {
    throw new HttpError(
      500,
      "A RECON_ADJUSTMENT requires a written reason and a named operator",
      "BAD_ADJUSTMENT",
    );
  }

  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const e of entries) {
    assertPositiveAmount(e.amount, `entry amount for ${e.code}`);
    if (e.dir === "DR") totalDebit += e.amount;
    else totalCredit += e.amount;
  }

  // 2 ── Sum-zero assertion. A violation is a P0: never let it reach the database. --------
  if (totalDebit !== totalCredit) {
    throw new HttpError(
      500,
      `Unbalanced journal: DR ${paiseToRupees(totalDebit)} != CR ${paiseToRupees(totalCredit)}`,
      "UNBALANCED_JOURNAL",
    );
  }
  if (totalDebit === 0n) {
    throw new HttpError(500, "A journal cannot post a zero amount", "ZERO_JOURNAL");
  }

  // 3 ── Resolve codes -> accounts --------------------------------------------------------
  const resolved = await resolveAccounts(
    tenantId,
    entries.map((e) => e.code),
    tx,
  );

  for (const [code, acc] of resolved) {
    if (acc.status !== "active") {
      throw new HttpError(422, `Account ${code} is ${acc.status}`, "ACCOUNT_NOT_ACTIVE");
    }
  }

  // 4 ── Flow matrix. Every debit leg must be a permitted source for every credit leg. ----
  const debitLegs = entries.filter((e) => e.dir === "DR");
  const creditLegs = entries.filter((e) => e.dir === "CR");
  for (const d of debitLegs) {
    for (const c of creditLegs) {
      const from = resolved.get(d.code) as ResolvedAccount;
      const to = resolved.get(c.code) as ResolvedAccount;
      if (!isFlowAllowed(from.accountType, to.accountType, txnType)) {
        throw new HttpError(
          422,
          `Flow not permitted: ${from.code} (${from.accountType}) -> ${to.code} (${to.accountType}) as ${txnType}`,
          "FLOW_NOT_ALLOWED",
        );
      }
    }
  }

  // 5 ── Idempotency. Claim the key BEFORE touching balances, so a concurrent duplicate
  //      blocks here and then returns the original instead of double-posting. ------------
  const existing = await tx
    .select({ id: journals.id })
    .from(journals)
    .where(and(eq(journals.tenantId, tenantId), eq(journals.idemKey, idemKey)))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, tenantId, txnType, idemKey, replayed: true };
  }

  const inserted = await tx
    .insert(journals)
    .values({
      tenantId,
      txnType,
      idemKey,
      referenceId: input.referenceId ?? null,
      performedBy: input.performedBy ?? null,
      reason: input.reason ?? null,
      reversesId: input.reversesId ?? null,
    })
    .onConflictDoNothing({ target: [journals.tenantId, journals.idemKey] })
    .returning({ id: journals.id });

  const journal = inserted[0];
  if (!journal) {
    // A concurrent transaction claimed the same key and committed while we waited on the
    // unique index. Read its journal and return it — we have written nothing.
    const winner = await tx
      .select({ id: journals.id })
      .from(journals)
      .where(and(eq(journals.tenantId, tenantId), eq(journals.idemKey, idemKey)))
      .limit(1);
    if (!winner[0]) {
      throw new HttpError(500, "Idempotency key conflict could not be resolved", "IDEM_CONFLICT");
    }
    return { id: winner[0].id, tenantId, txnType, idemKey, replayed: true };
  }

  // 6 ── Net effect per account -----------------------------------------------------------
  // A REVERSAL must undo the settleable effect of the journal it mirrors. Without this a
  // failed SETTLEMENT_DEBIT would restore balance but leave settleable permanently reduced,
  // trapping the agent's earned money.
  let originalTxnType: TxnType | null = null;
  if (txnType === "REVERSAL" && input.reversesId) {
    const [orig] = await tx
      .select({ txnType: journals.txnType })
      .from(journals)
      .where(and(eq(journals.id, input.reversesId), eq(journals.tenantId, tenantId)))
      .limit(1);
    if (orig && isTxnType(orig.txnType)) originalTxnType = orig.txnType;
  }

  const deltas = new Map<bigint, AccountDelta>();
  for (const e of entries) {
    const account = resolved.get(e.code) as ResolvedAccount;
    let d = deltas.get(account.id);
    if (!d) {
      d = { account, balanceDelta: 0n, settleableDelta: 0n };
      deltas.set(account.id, d);
    }

    // Balance is kept in the account's NATURAL direction: a credit raises a liability wallet,
    // a debit raises an asset. Storing every class the same way lets one non-negative rule
    // cover agent wallets without special-casing the sign for treasury accounts.
    const signed = naturalSign(account.accountClass, e.dir) * e.amount;
    d.balanceDelta += signed;

    if (account.accountClass === "liability") {
      if (e.dir === "CR" && SETTLEABLE_CREDIT_TYPES.has(txnType)) d.settleableDelta += e.amount;
      if (e.dir === "DR" && SETTLEABLE_DEBIT_TYPES.has(txnType)) d.settleableDelta -= e.amount;
      // Reversal legs are the mirror of the original: undoing a settleable debit credits the
      // wallet (restore), undoing a settleable credit debits it (take back).
      if (originalTxnType) {
        if (e.dir === "CR" && SETTLEABLE_DEBIT_TYPES.has(originalTxnType)) {
          d.settleableDelta += e.amount;
        }
        if (e.dir === "DR" && SETTLEABLE_CREDIT_TYPES.has(originalTxnType)) {
          d.settleableDelta -= e.amount;
        }
      }
    }
  }

  // 7 ── Lock. Ascending account id, always, for EVERY account the journal touches — not
  //      just the balance-checked ones. Locking only the liability subset deadlocks: journal
  //      A holding liability #5 and waiting to update internal #3, against journal B holding
  //      #3 and waiting for #5, is a cycle. One ordered lock set removes it by construction.
  const orderedIds = [...deltas.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  await tx
    .insert(accountBalances)
    .values(orderedIds.map((accountId) => ({ accountId })))
    .onConflictDoNothing({ target: accountBalances.accountId });

  const locked = new Map<bigint, { balance: bigint; settleable: bigint; version: bigint }>();
  for (const accountId of orderedIds) {
    const rows = await tx
      .select({
        balance: accountBalances.balance,
        settleable: accountBalances.settleable,
        version: accountBalances.version,
      })
      .from(accountBalances)
      .where(eq(accountBalances.accountId, accountId))
      .for("update");

    const row = rows[0];
    if (!row) {
      throw new HttpError(500, `Missing balance row for account ${accountId}`, "BALANCE_MISSING");
    }
    locked.set(accountId, row);
  }

  // 8 ── Validate, then write entries with balance_after --------------------------------
  const running = new Map<bigint, bigint>();
  for (const [accountId, row] of locked) running.set(accountId, row.balance);

  const entryRows: (typeof ledgerEntries.$inferInsert)[] = [];
  for (const e of entries) {
    const account = resolved.get(e.code) as ResolvedAccount;
    const before = running.get(account.id) as bigint;
    const after = before + naturalSign(account.accountClass, e.dir) * e.amount;

    // No overdraft, no exception path. The DB trigger enforces this too; failing here gives
    // the caller a usable error instead of a raw Postgres exception.
    if (account.accountClass === "liability" && after < 0n) {
      throw new HttpError(
        422,
        `Insufficient balance in ${account.code}: have ${paiseToRupees(before)}, need ${paiseToRupees(e.amount)}`,
        "INSUFFICIENT_BALANCE",
      );
    }

    // Floor the debit at the locked settleable amount rather than at zero. Read from `locked`,
    // not from a running total: settleable is untouched by this journal (UPLINE_PULL is in
    // neither settleable set), so the value at lock time is the value that will be written.
    if (
      account.accountClass === "liability" &&
      USABLE_ONLY_DEBIT_TYPES.has(txnType) &&
      after < (locked.get(account.id)?.settleable ?? 0n)
    ) {
      const settleable = locked.get(account.id) as { settleable: bigint };
      throw new HttpError(
        422,
        `Insufficient usable balance in ${account.code}: ${paiseToRupees(before)} held, of which ` +
          `${paiseToRupees(settleable.settleable)} is the agent's earned balance and cannot be pulled`,
        "INSUFFICIENT_USABLE_BALANCE",
      );
    }

    // Settlement may only withdraw earned money. Prepaid advance (balance - settleable) stays
    // in the wallet for services. Only hierarchy wallets carry a settleable slice
    // (requiresBalanceCheck); treasury liability accounts like SETTLE_PAYABLE do not.
    if (
      account.accountClass === "liability" &&
      account.requiresBalanceCheck &&
      SETTLEABLE_DEBIT_TYPES.has(txnType) &&
      e.dir === "DR"
    ) {
      const settleable = locked.get(account.id)?.settleable ?? 0n;
      if (e.amount > settleable) {
        throw new HttpError(
          422,
          `Insufficient settleable balance in ${account.code}: have ${paiseToRupees(settleable)} ` +
            `settleable of ${paiseToRupees(before)} total — prepaid advance cannot be withdrawn to bank`,
          "INSUFFICIENT_SETTLEABLE",
        );
      }
    }

    if (
      account.accountClass === "liability" &&
      account.requiresBalanceCheck &&
      account.blockSettlement &&
      SETTLEABLE_DEBIT_TYPES.has(txnType) &&
      e.dir === "DR"
    ) {
      throw new HttpError(
        422,
        `Settlement is blocked on account ${account.code}. Contact support if you need this lifted.`,
        "SETTLEMENT_BLOCKED",
      );
    }

    running.set(account.id, after);
    entryRows.push({
      journalId: journal.id,
      accountId: account.id,
      direction: e.dir,
      amount: e.amount,
      balanceAfter: after,
    });
  }

  await tx.insert(ledgerEntries).values(entryRows);

  // 9 ── Project the cached balances, in the same transaction ----------------------------
  for (const accountId of orderedIds) {
    const d = deltas.get(accountId) as AccountDelta;
    const row = locked.get(accountId) as { balance: bigint; settleable: bigint; version: bigint };
    const newBalance = running.get(accountId) as bigint;

    // Settleable can never exceed the balance: earned money that was then SPENT on a service
    // is gone, and must stop counting as withdrawable. The spec's §6.1 formula only subtracts
    // SETTLEMENT_PAYOUT, which would let a retailer spend their AePS earnings on a DMT and
    // still settle them — and would break the account_balances CHECK. Clamping here is what
    // keeps "spendable yes, withdrawable only once" true.
    const rawSettleable = row.settleable + d.settleableDelta;
    const newSettleable = clamp(rawSettleable, 0n, newBalance < 0n ? 0n : newBalance);

    await tx
      .update(accountBalances)
      .set({
        balance: newBalance,
        settleable: newSettleable,
        version: row.version + 1n,
        updatedAt: new Date(),
      })
      .where(eq(accountBalances.accountId, accountId));
  }

  return { id: journal.id, tenantId, txnType, idemKey, replayed: false };
}

/**
 * Balances are stored in each class's natural direction, so every stored balance reads as a
 * positive number under normal operation:
 *   ASSET / EXPENSE  — debit-normal:  DR increases, CR decreases
 *   LIABILITY / INTERNAL / INCOME — credit-normal: CR increases, DR decreases
 */
function naturalSign(
  accountClass: ResolvedAccount["accountClass"],
  dir: "DR" | "CR",
): 1n | -1n {
  const debitNormal = accountClass === "asset" || accountClass === "expense";
  if (debitNormal) return dir === "DR" ? 1n : -1n;
  return dir === "CR" ? 1n : -1n;
}

function clamp(value: bigint, min: bigint, max: bigint): bigint {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Post the exact mirror of an existing journal. Never delete and never re-credit with a fresh
 * journal — the reverses_id link is what makes a dispute traceable months later.
 */
export async function reverseJournal(
  tx: Tx,
  params: {
    tenantId: string;
    journalId: bigint;
    idemKey: string;
    performedBy?: string | null;
    reason: string;
  },
): Promise<PostedJournal> {
  const original = await tx
    .select({ id: journals.id, txnType: journals.txnType, referenceId: journals.referenceId })
    .from(journals)
    .where(and(eq(journals.id, params.journalId), eq(journals.tenantId, params.tenantId)))
    .limit(1);

  if (!original[0]) {
    throw new HttpError(404, "Journal to reverse not found", "JOURNAL_NOT_FOUND");
  }

  const alreadyReversed = await tx
    .select({ id: journals.id })
    .from(journals)
    .where(and(eq(journals.tenantId, params.tenantId), eq(journals.reversesId, params.journalId)))
    .limit(1);

  if (alreadyReversed[0]) {
    throw new HttpError(422, "Journal is already reversed", "ALREADY_REVERSED");
  }

  const legs = await tx
    .select({
      code: accounts.code,
      direction: ledgerEntries.direction,
      amount: ledgerEntries.amount,
    })
    .from(ledgerEntries)
    .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
    .where(eq(ledgerEntries.journalId, params.journalId));

  return postJournal(tx, {
    tenantId: params.tenantId,
    txnType: "REVERSAL",
    idemKey: params.idemKey,
    performedBy: params.performedBy ?? null,
    reason: params.reason,
    referenceId: original[0].referenceId,
    reversesId: params.journalId,
    entries: legs.map((l) => ({
      code: l.code,
      dir: l.direction === "DR" ? ("CR" as const) : ("DR" as const),
      amount: l.amount,
    })),
  });
}

/**
 * Look up an already-posted journal by its idempotency key. Returns null when the key was
 * never used. Callers that need to reverse a journal they posted earlier under a deterministic
 * key use this instead of storing the journal id alongside their own rows.
 */
export async function findJournalByIdemKey(
  tx: Tx,
  tenantId: string,
  idemKey: string,
): Promise<{ id: bigint } | null> {
  const [row] = await tx
    .select({ id: journals.id })
    .from(journals)
    .where(and(eq(journals.tenantId, tenantId), eq(journals.idemKey, idemKey)))
    .limit(1);

  return row ?? null;
}
