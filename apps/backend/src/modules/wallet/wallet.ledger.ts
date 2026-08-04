/**
 * The cut-over shim. Every legacy money path (wallet.service, txn.service, commission.service)
 * still calls the three functions below with the same arguments and gets the same
 * `{ groupId }` back — but nothing here computes a balance any more. `postJournal()` moves the
 * money in the double-entry ledger, and `wallets.balance` is written afterwards purely as a
 * MIRROR of the agent's ledger account:
 *
 *   wallet_type = 'main'  <-  balance - settleable   (usable: advances + unwithdrawn earnings)
 *   wallet_type = 'aeps'  <-  settleable             (earned, withdrawable to their own bank)
 *
 * That keeps every existing read — dashboards, mobile, admin, the passbook — working unchanged
 * while there is exactly one writer of money. `wallet_ledger_groups` / `wallet_ledger_entries`
 * are likewise no longer a ledger: they are a projection of the mirror, written so the passbook
 * and the `ledger_group_id` foreign keys in `wallet_idempotency` and `commission_ledger` keep
 * resolving.
 *
 * Consequences of collapsing two wallet rows onto one ledger account, all deliberate:
 *   - Funding a child's 'aeps' wallet now lands in their usable balance. Money handed down the
 *     hierarchy is an advance; only AePS and commission credits are earned.
 *   - An upline can no longer pull from a downline's 'aeps' wallet. UPLINE_PULL is floored at
 *     the downline's settleable balance (see USABLE_ONLY_DEBIT_TYPES) because earned money is
 *     theirs to withdraw. This is spec 9.3, not a regression.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  wallets,
  walletLedgerGroups,
  walletLedgerEntries,
  transactions,
  services,
  serviceCategories,
  providers,
  tenants,
  accounts,
  accountBalances,
} from "../../db/postgres/schema";
import {
  postJournal,
  reverseJournal,
  findJournalByIdemKey,
  type Tx,
  type TxnType,
  type JournalEntryInput,
} from "../../core/ledger";
import { rupeesToPaise, paiseToRupees, type Paise } from "../../core/money";
import { HttpError } from "../../utils/httpError";
import {
  ensureHierarchyAccount,
  ensureTreasuryAccount,
  floatAccountCode,
} from "./ledgerAccounts";

const COMPANY = "COMPANY_001";
const FLOAT_CONTROL = "TREASURY_FLOAT_CONTROL";
const COMMISSION_INCOME = "COMMISSION_INCOME";

/**
 * Legacy `services.code` -> ledger txn type. Only services that actually move wallet money need
 * a row; balance enquiry and mini statement run with direction "none" and never reach here.
 * Anything in the BBPS category that is not listed falls back to BBPS — that category is bills
 * by definition. A money-moving service outside it with no mapping throws rather than guessing:
 * a mis-typed journal is a permanent audit defect, a failed request is not.
 */
const SERVICE_TXN_TYPE: Readonly<Record<string, TxnType>> = {
  CASH_WITHDRAW: "AEPS_WITHDRAWAL",
  SHG_WITHDRAW_CASH: "AEPS_WITHDRAWAL",
  AADHAAR_PAY: "AADHAAR_PAY",
  CASH_DEPOSIT: "AEPS_DEPOSIT",
  SHG_DEPOSIT_CASH: "AEPS_DEPOSIT",
  MONEY_TRANSFER: "DMT",
  NEPAL_REMITTANCE: "DMT",
  UPI_CASH_POINT: "DMT",
  AGENT_COLLECTION: "DMT",
  CASH_COLLECTION: "DMT",
  MOBILE_PREPAID: "RECHARGE",
  DTH: "RECHARGE",
  CABLE_TV: "RECHARGE",
  PREPAID_METER: "RECHARGE",
  FASTAG_RECHARGE: "RECHARGE",
  NCMC_RECHARGE: "RECHARGE",
  FLEET_CARD_RECHARGE: "RECHARGE",
  EV_RECHARGE: "RECHARGE",
};

/**
 * DB-backed test world (and verify:load) namespace services as `dmt_<suffix>` etc. so they never
 * collide with catalog codes. Map only those known prefixes — production catalog uses the table
 * above or BBPS category fallback, never this prefix table.
 */
const WORLD_SERVICE_PREFIX_TXN: Readonly<Record<string, TxnType>> = {
  dmt: "DMT",
  aeps: "AEPS_WITHDRAWAL",
  recharge: "RECHARGE",
  bbps: "BBPS",
  deposit: "AEPS_DEPOSIT",
};

function resolveServiceTxnType(serviceCode: string, categoryCode: string): TxnType | undefined {
  const direct = SERVICE_TXN_TYPE[serviceCode];
  if (direct) return direct;
  const head = serviceCode.split("_")[0]?.toLowerCase() ?? "";
  const fromWorld = WORLD_SERVICE_PREFIX_TXN[head];
  if (fromWorld) return fromWorld;
  if (categoryCode === BBPS_CATEGORY) return "BBPS";
  return undefined;
}

const BBPS_CATEGORY = "BILL_PAYMENT_BBPS";

// ---------------------------------------------------------------------------------------
// Tenant + wallet resolution
// ---------------------------------------------------------------------------------------

/**
 * The legacy tables (users, wallets, transactions) are not tenant-scoped yet, so every legacy
 * path posts into AsanPay's own tenant. This is the ONE place that names a tenant code, and it
 * exists only because the legacy rows carry no tenant of their own — the white-label retrofit
 * replaces this lookup with the tenant on the row, and this function disappears with it.
 *
 * Deliberately NOT "the single active tenant": `npm run verify:ledger` leaves a LEDGERTEST
 * tenant behind, so that rule would fail every money movement the first time anyone verifies
 * the engine. Naming the tenant is the boring, correct answer until the rows carry their own.
 *
 * Env override: `LEDGER_TENANT_CODE` (default `ASANPAY`). DB-backed tests set this to
 * `LEDGERTEST` so suite journals never land in production's tenant. Read on every resolve
 * (not a module-load const) so tests can set the env before posting.
 */
const DEFAULT_TENANT_CODE = "ASANPAY";

export function legacyTenantCode(): string {
  return process.env.LEDGER_TENANT_CODE?.trim() || DEFAULT_TENANT_CODE;
}

let cachedTenantId: string | null = null;
let cachedTenantCode: string | null = null;

async function currentTenantId(tx: Tx): Promise<string> {
  const code = legacyTenantCode();
  if (cachedTenantId && cachedTenantCode === code) return cachedTenantId;

  const [row] = await tx
    .select({ id: tenants.id, isActive: tenants.isActive })
    .from(tenants)
    .where(eq(tenants.code, code))
    .limit(1);

  if (!row) {
    throw new HttpError(500, `Tenant ${code} does not exist`, "TENANT_NOT_FOUND");
  }
  // The is_active check guards against someone disabling the live tenant out from under the
  // money paths. It deliberately does NOT apply to an env-overridden tenant: LEDGERTEST is a
  // scratch tenant that must stay is_active = false, because bootstrapLedger() and the
  // reconciliation sweep in server.ts both iterate active tenants and must never pick up
  // throwaway test accounts. Requiring it to be active is what made the two verification
  // entry points fight over the flag.
  if (code === DEFAULT_TENANT_CODE && !row.isActive) {
    throw new HttpError(500, `Tenant ${code} is inactive`, "TENANT_INACTIVE");
  }

  cachedTenantId = row.id;
  cachedTenantCode = code;
  return cachedTenantId;
}

/** Only for tests and scripts that create a tenant after this module has been imported. */
export function clearTenantCache(): void {
  cachedTenantId = null;
  cachedTenantCode = null;
}

interface WalletSide {
  walletId: string;
  userId: string;
  walletType: "main" | "aeps";
  /** The root admin's main wallet — the platform counterparty, not an agent wallet. */
  isAggregator: boolean;
}

async function loadWallet(tx: Tx, walletId: string): Promise<WalletSide> {
  const [row] = await tx
    .select({
      walletId: wallets.id,
      userId: wallets.userId,
      walletType: wallets.walletType,
      walletKind: wallets.walletKind,
    })
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .limit(1);

  if (!row) throw new HttpError(404, "Wallet not found", "WALLET_NOT_FOUND");

  return {
    walletId: row.walletId,
    userId: row.userId,
    walletType: row.walletType,
    isAggregator: row.walletKind === "aggregator",
  };
}

/** The agent's single ledger account. Created on first use, so no backfill of new agents. */
async function agentAccountCode(tx: Tx, tenantId: string, side: WalletSide): Promise<string> {
  if (side.isAggregator) {
    throw new HttpError(500, "The aggregator wallet has no hierarchy account", "NOT_AN_AGENT");
  }
  return ensureHierarchyAccount(tx, tenantId, side.userId);
}

/**
 * The ledger type and float account for a service transaction, derived from the transaction row
 * the legacy caller already passes as `referenceId`. Deriving it here is what lets the three
 * call sites switch over without a single argument change.
 */
async function serviceJournalContext(
  tx: Tx,
  tenantId: string,
  transactionId: string,
): Promise<{ txnType: TxnType; floatCode: string; principal: Paise; fee: Paise }> {
  const [row] = await tx
    .select({
      serviceCode: services.code,
      categoryCode: serviceCategories.code,
      providerCode: providers.code,
      providerName: providers.name,
      amount: transactions.amount,
      customerFee: transactions.customerFee,
    })
    .from(transactions)
    .innerJoin(services, eq(services.id, transactions.serviceId))
    .innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .leftJoin(providers, eq(providers.id, transactions.providerId))
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!row) {
    throw new HttpError(404, "Transaction not found for service journal", "TXN_NOT_FOUND");
  }
  if (!row.providerCode) {
    throw new HttpError(
      422,
      `Transaction ${transactionId} has no provider, so it has no float account to net against`,
      "TXN_HAS_NO_PROVIDER",
    );
  }

  const txnType = resolveServiceTxnType(row.serviceCode, row.categoryCode);

  if (!txnType) {
    throw new HttpError(
      500,
      `Service ${row.serviceCode} has no ledger txn type — add it to SERVICE_TXN_TYPE`,
      "SERVICE_NOT_MAPPED",
    );
  }

  // Provision the float account if it is missing rather than failing the money path. A provider
  // row can appear at runtime — resolveAepsProvider() inserts one when the configured AePS
  // adapter has no row yet — and that provider would otherwise have no credit side for its
  // first journal. ensureTreasuryAccount is ON CONFLICT DO NOTHING and creates exactly what
  // `npm run provision:float` creates, so the two paths cannot diverge.
  const floatCode = floatAccountCode(row.providerCode);
  await ensureTreasuryAccount(tx, {
    tenantId,
    code: floatCode,
    name: `Float — ${row.providerName}`,
    type: "float",
  });

  const principal = rupeesToPaise(row.amount);
  const fee = rupeesToPaise(row.customerFee ?? "0");
  if (principal <= 0n) {
    throw new HttpError(422, "Transaction amount must be positive", "INVALID_AMOUNT");
  }
  if (fee < 0n) {
    throw new HttpError(422, "Customer fee cannot be negative", "INVALID_CUSTOMER_FEE");
  }

  return { txnType, floatCode, principal, fee };
}

// ---------------------------------------------------------------------------------------
// The mirror
// ---------------------------------------------------------------------------------------

interface MirrorResult {
  /** walletId -> { delta, new balance }, both in paise. Only wallets whose balance moved. */
  moved: Map<string, { delta: Paise; balance: Paise }>;
}

/**
 * Rewrite `wallets.balance` for every user the journal touched, from their ledger account.
 * Runs after postJournal in the same transaction, so a mirror can never be written for money
 * that did not commit.
 *
 * Wallet rows are locked in ascending id order, and postJournal already locked its accounts in
 * ascending account id order, so the global lock order across both tables is fixed and two
 * concurrent journals over the same pair of agents cannot deadlock.
 */
/**
 * Exported for the DB-backed test world: fixtures fund agents through journals then re-sync
 * the `wallets.balance` mirror. Production money paths call this only from inside journal posts.
 */
export async function mirrorBalances(
  tx: Tx,
  tenantId: string,
  userIds: readonly string[],
  companyMoved: boolean,
): Promise<MirrorResult> {
  const moved: MirrorResult["moved"] = new Map();
  const unique = [...new Set(userIds)];

  if (unique.length > 0) {
    const ledgerRows = await tx
      .select({
        userId: accounts.userId,
        balance: accountBalances.balance,
        settleable: accountBalances.settleable,
      })
      .from(accounts)
      .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
      .where(and(eq(accounts.tenantId, tenantId), inArray(accounts.userId, unique)));

    const byUser = new Map(ledgerRows.map((r) => [r.userId as string, r]));

    const walletRows = await tx
      .select()
      .from(wallets)
      .where(inArray(wallets.userId, unique))
      .orderBy(asc(wallets.id))
      .for("update");

    for (const wallet of walletRows) {
      const ledger = byUser.get(wallet.userId);
      if (!ledger) continue;

      // settleable is clamped to [0, balance] by postJournal, so both projections are >= 0 and
      // the wallets_balance_nonnegative CHECK can never be the thing that fails a valid journal.
      const target =
        wallet.walletType === "aeps" ? ledger.settleable : ledger.balance - ledger.settleable;

      await writeMirror(tx, wallet, target, moved);
    }
  }

  // The `wallets` table is NOT tenant-scoped, so there is exactly one aggregator row for the
  // whole database. Mirroring it from a non-default tenant's COMPANY_001 would overwrite the
  // live aggregator balance with a scratch tenant's figure — which is why verify:shim could not
  // exercise fundWallet(). Only the default tenant owns that row.
  if (companyMoved && legacyTenantCode() === DEFAULT_TENANT_CODE) {
    // The aggregator wallet mirrors COMPANY_001: capacity that has been allocated but not yet
    // pushed down the hierarchy. It deliberately no longer tracks service flow — a service debit
    // credits TREASURY_FLOAT_<provider>, which is a treasury asset and not this wallet.
    const [company] = await tx
      .select({ balance: accountBalances.balance })
      .from(accounts)
      .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
      .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, COMPANY)))
      .limit(1);

    const [aggregator] = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.walletKind, "aggregator"), eq(wallets.walletType, "main")))
      .limit(1)
      .for("update");

    if (company && aggregator) {
      await writeMirror(tx, aggregator, company.balance, moved);
    }
  }

  return { moved };
}

async function writeMirror(
  tx: Tx,
  wallet: typeof wallets.$inferSelect,
  target: Paise,
  moved: MirrorResult["moved"],
): Promise<void> {
  const current = rupeesToPaise(wallet.balance);
  if (target === current) return;

  await tx
    .update(wallets)
    .set({
      balance: paiseToRupees(target),
      version: wallet.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, wallet.id));

  moved.set(wallet.id, { delta: target - current, balance: target });
}

/**
 * Project the mirror onto the legacy passbook tables. One entry per wallet whose mirrored
 * balance actually changed, signed by the direction it moved — for an ordinary main-to-main
 * transfer this reproduces exactly the two rows the old code wrote.
 */
async function writeLegacyEntries(tx: Tx, groupId: string, result: MirrorResult): Promise<void> {
  const rows = [...result.moved.entries()]
    .filter(([, m]) => m.delta !== 0n)
    .map(([walletId, m]) => ({
      groupId,
      walletId,
      entryType: (m.delta > 0n ? "credit" : "debit") as "credit" | "debit",
      amount: paiseToRupees(m.delta < 0n ? -m.delta : m.delta),
      balanceAfter: paiseToRupees(m.balance),
    }));

  if (rows.length > 0) await tx.insert(walletLedgerEntries).values(rows);
}

async function openGroup(
  tx: Tx,
  params: { referenceType: string; referenceId?: string; description?: string },
): Promise<string> {
  const [group] = await tx
    .insert(walletLedgerGroups)
    .values({
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description: params.description,
    })
    .returning();

  if (!group) throw new HttpError(500, "Failed to create ledger group");
  return group.id;
}

// ---------------------------------------------------------------------------------------
// Public API — unchanged signatures
// ---------------------------------------------------------------------------------------

/**
 * Move `amount` between a wallet's available `balance` and its `holdBalance` bookkeeping field.
 * direction "hold" reserves amount (balance already moved out via a real transfer; this just
 * mirrors it for reporting), "release" clears it back to 0 once the txn resolves (success/failed).
 *
 * Untouched by the cut-over: holdBalance is a reporting field on the legacy wallet row and holds
 * no money, so it is not, and must not become, a ledger concept.
 */
export async function adjustWalletHold(
  tx: Tx,
  walletId: string,
  amount: string,
  direction: "hold" | "release",
): Promise<void> {
  const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for("update");
  if (!wallet) throw new HttpError(404, "Wallet not found", "WALLET_NOT_FOUND");

  const current = rupeesToPaise(wallet.holdBalance);
  const delta = rupeesToPaise(amount);
  const next = direction === "hold" ? current + delta : current - delta;

  await tx
    .update(wallets)
    .set({ holdBalance: paiseToRupees(next < 0n ? 0n : next), updatedAt: new Date() })
    .where(eq(wallets.id, walletId));
}

interface TransferParams {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  referenceType: string;
  referenceId?: string;
  description?: string;
}

async function doTransfer(tx: Tx, params: TransferParams): Promise<{ groupId: string }> {
  const { fromWalletId, toWalletId, referenceType, referenceId, description } = params;
  const amount = rupeesToPaise(params.amount);

  const tenantId = await currentTenantId(tx);
  const from = await loadWallet(tx, fromWalletId);
  const to = await loadWallet(tx, toWalletId);

  const groupId = await openGroup(tx, { referenceType, referenceId, description });

  const plan = await planTransfer(tx, tenantId, {
    from,
    to,
    amount,
    referenceType,
    referenceId,
    description,
    groupId,
  });

  if (plan.kind === "reversal") {
    await reverseJournal(tx, {
      tenantId,
      journalId: plan.reversesId,
      idemKey: plan.idemKey,
      reason: description ?? `Reversal of ${referenceId}`,
    });
  } else {
    await postJournal(tx, {
      tenantId,
      txnType: plan.txnType,
      idemKey: plan.idemKey,
      referenceId: referenceId ?? null,
      reason: description ?? null,
      entries: plan.entries,
    });
  }

  const mirrored = await mirrorBalances(tx, tenantId, plan.userIds, plan.companyMoved);
  await writeLegacyEntries(tx, groupId, mirrored);

  return { groupId };
}

type TransferPlan =
  | {
      kind: "post";
      txnType: TxnType;
      idemKey: string;
      entries: JournalEntryInput[];
      userIds: string[];
      companyMoved: boolean;
    }
  | {
      kind: "reversal";
      idemKey: string;
      reversesId: bigint;
      userIds: string[];
      companyMoved: boolean;
    };

/**
 * The whole legacy-to-ledger mapping, in one place. `referenceType` plus which side is the
 * aggregator wallet is enough to name the txn type, the accounts and a deterministic
 * idempotency key — which is why no call site had to change.
 */
async function planTransfer(
  tx: Tx,
  tenantId: string,
  ctx: {
    from: WalletSide;
    to: WalletSide;
    amount: Paise;
    referenceType: string;
    referenceId?: string;
    description?: string;
    groupId: string;
  },
): Promise<TransferPlan> {
  const { from, to, amount, referenceType, referenceId, groupId } = ctx;

  switch (referenceType) {
    // Super Dist -> Distributor, Distributor -> Retailer. The flow matrix rejects everything
    // else, including a peer transfer, which the old code happily allowed.
    case "downline_transfer": {
      const fromCode = await agentAccountCode(tx, tenantId, from);
      const toCode = await agentAccountCode(tx, tenantId, to);
      return {
        kind: "post",
        txnType: "WALLET_TRANSFER",
        // Callers dedupe upstream on wallet_idempotency; the group id keys the journal.
        idemKey: `LEGACY:${groupId}`,
        entries: [
          { code: fromCode, dir: "DR", amount },
          { code: toCode, dir: "CR", amount },
        ],
        userIds: [from.userId, to.userId],
        companyMoved: false,
      };
    }

    // An upline reclaiming an unspent advance, OTP-gated in the product. postJournal floors this
    // debit at the downline's settleable balance — earned money cannot be pulled back.
    case "upline_pull": {
      const fromCode = await agentAccountCode(tx, tenantId, from);
      const toCode = await agentAccountCode(tx, tenantId, to);
      return {
        kind: "post",
        txnType: "UPLINE_PULL",
        idemKey: `LEGACY:${groupId}`,
        entries: [
          { code: fromCode, dir: "DR", amount },
          { code: toCode, dir: "CR", amount },
        ],
        userIds: [from.userId, to.userId],
        companyMoved: false,
      };
    }

    case "service_txn": {
      if (!referenceId) {
        throw new HttpError(500, "A service journal needs its transaction id", "REFERENCE_REQUIRED");
      }
      const { txnType, floatCode, principal, fee } = await serviceJournalContext(
        tx,
        tenantId,
        referenceId,
      );

      // Debit: retailer pays principal into float and (optionally) fee into income.
      // Spec §4.5 — three legs when customer_fee > 0: Dr RTL, Cr FLOAT, Cr COMMISSION_INCOME.
      // Call sites must debit/hold `principal + fee` so the transfer amount matches the journal.
      if (to.isAggregator) {
        const expected = principal + fee;
        if (amount !== expected) {
          throw new HttpError(
            500,
            `Service debit amount ${paiseToRupees(amount)} must equal principal ${paiseToRupees(principal)} + fee ${paiseToRupees(fee)}`,
            "SERVICE_DEBIT_MISMATCH",
          );
        }
        const agentCode = await agentAccountCode(tx, tenantId, from);
        const entries: JournalEntryInput[] = [
          { code: agentCode, dir: "DR", amount },
          { code: floatCode, dir: "CR", amount: principal },
        ];
        if (fee > 0n) {
          entries.push({ code: COMMISSION_INCOME, dir: "CR", amount: fee });
        }
        return {
          kind: "post",
          txnType,
          idemKey: `TXN_DR:${referenceId}`,
          entries,
          userIds: [from.userId],
          companyMoved: false,
        };
      }

      // Credit: AePS and friends. The customer's bank paid us and we now owe the retailer the
      // cash they handed over, so the money direction is the reverse of the journal direction.
      // Credit path ignores customer_fee (income on cash-out is product work if ever needed).
      if (amount !== principal) {
        throw new HttpError(
          500,
          `Service credit amount ${paiseToRupees(amount)} must equal principal ${paiseToRupees(principal)}`,
          "SERVICE_CREDIT_MISMATCH",
        );
      }
      const agentCode = await agentAccountCode(tx, tenantId, to);
      return {
        kind: "post",
        txnType,
        idemKey: `TXN_CR:${referenceId}`,
        entries: [
          { code: floatCode, dir: "DR", amount },
          { code: agentCode, dir: "CR", amount },
        ],
        userIds: [to.userId],
        companyMoved: false,
      };
    }

    // Auto-reversal of a failed debit. Never a fresh credit: the reverses_id link is what makes
    // a dispute traceable months later, so we mirror the original journal instead.
    case "reversal": {
      if (!referenceId) {
        throw new HttpError(500, "A reversal needs its transaction id", "REFERENCE_REQUIRED");
      }
      const original = await findJournalByIdemKey(tx, tenantId, `TXN_DR:${referenceId}`);
      if (!original) {
        // The debit was posted by the pre-cut-over code, so there is no journal to mirror. Drain
        // in-flight debit transactions before deploying this release; anything that slips through
        // has to be refunded by hand as a RECON_ADJUSTMENT with a named operator.
        throw new HttpError(
          500,
          `No ledger journal for transaction ${referenceId} — it was debited before the ledger cut-over and must be reversed manually`,
          "LEGACY_REVERSAL_UNMAPPED",
        );
      }
      return {
        kind: "reversal",
        idemKey: `TXN_RV:${referenceId}`,
        reversesId: original.id,
        userIds: [to.userId],
        companyMoved: false,
      };
    }

    // Commission is paid out of income, never out of the company wallet. It is a settleable
    // credit: the agent earned it and may withdraw it to their own bank. Service debits credit
    // COMMISSION_INCOME when `transactions.customer_fee` is set (third leg on service_txn).
    case "commission": {
      const toCode = await agentAccountCode(tx, tenantId, to);
      return {
        kind: "post",
        txnType: "COMMISSION_PAYOUT",
        // One payout per (transaction, beneficiary) — the same key commission_ledger enforces.
        idemKey: `COMM:${referenceId ?? groupId}:${toCode}`,
        entries: [
          { code: COMMISSION_INCOME, dir: "DR", amount },
          { code: toCode, dir: "CR", amount },
        ],
        userIds: [to.userId],
        companyMoved: false,
      };
    }

    default:
      throw new HttpError(
        500,
        `No ledger mapping for referenceType ${referenceType}`,
        "REFERENCE_TYPE_NOT_MAPPED",
      );
  }
}

// Moves money between two wallets as one journal in the double-entry ledger, then mirrors the
// result onto `wallets.balance`. Pass `existingTx` to run inside a caller's transaction (e.g. so
// a transaction-status compare-and-swap and the money movement it authorizes commit or roll back
// together) — the ledger requires it, so a caller without one gets a transaction of its own.
export async function transferBetweenWallets(
  params: TransferParams,
  existingTx?: Tx,
): Promise<{ groupId: string }> {
  if (params.fromWalletId === params.toWalletId) {
    throw new HttpError(422, "Cannot transfer a wallet to itself", "INVALID_TRANSFER");
  }
  if (existingTx) return doTransfer(existingTx, params);
  return db.transaction((tx) => doTransfer(tx, params));
}

interface FundParams {
  walletId: string;
  amount: string;
  referenceId?: string;
  description?: string;
}

async function doFund(tx: Tx, params: FundParams): Promise<{ groupId: string }> {
  const amount = rupeesToPaise(params.amount);
  const tenantId = await currentTenantId(tx);
  const target = await loadWallet(tx, params.walletId);

  const groupId = await openGroup(tx, {
    referenceType: "external_funding",
    referenceId: params.referenceId,
    description: params.description,
  });

  // Step 1 — mint spendable capacity on the company wallet. Dr FLOAT_CONTROL / Cr COMPANY.
  // No asset moves; this is the ALLOCATION the spec puts behind maker-checker, and admin
  // appears only in `performed_by`, never as a wallet.
  await postJournal(tx, {
    tenantId,
    txnType: "ALLOCATION",
    idemKey: `LEGACY:${groupId}:ALLOC`,
    referenceId: params.referenceId ?? null,
    reason: params.description ?? null,
    entries: [
      { code: FLOAT_CONTROL, dir: "DR", amount },
      { code: COMPANY, dir: "CR", amount },
    ],
  });

  // Step 2 — when the target is an agent rather than the aggregator wallet, push it down. Two
  // journals rather than one because company is the only account allowed to credit a hierarchy
  // wallet, and control -> agent directly is reserved for the one-time opening-balance backfill.
  const userIds: string[] = [];
  if (!target.isAggregator) {
    const toCode = await agentAccountCode(tx, tenantId, target);
    await postJournal(tx, {
      tenantId,
      txnType: "WALLET_TRANSFER",
      idemKey: `LEGACY:${groupId}:FUND`,
      referenceId: params.referenceId ?? null,
      reason: params.description ?? null,
      entries: [
        { code: COMPANY, dir: "DR", amount },
        { code: toCode, dir: "CR", amount },
      ],
    });
    userIds.push(target.userId);
  }

  const mirrored = await mirrorBalances(tx, tenantId, userIds, true);
  await writeLegacyEntries(tx, groupId, mirrored);

  return { groupId };
}

// Money entering the system from outside (a reconciled bank transfer, an admin float load).
// In the ledger this is never single-sided: it mints capacity against TREASURY_FLOAT_CONTROL,
// so every rupee still has an origin and the trial balance stays at zero.
export async function fundWallet(params: FundParams, existingTx?: Tx): Promise<{ groupId: string }> {
  if (existingTx) return doFund(existingTx, params);
  return db.transaction((tx) => doFund(tx, params));
}
