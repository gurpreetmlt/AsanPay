import type { accountTypeEnum } from "../../db/postgres/schema/accounts";

export type AccountType = (typeof accountTypeEnum.enumValues)[number];

// Every money movement in the system. New flows are added here first — postJournal() rejects
// any txn_type it does not recognise, so this list is the boundary of what the engine can do.
export const TXN_TYPES = [
  "OPENING_BALANCE",
  // The earned slice of a migrated balance. Split out from OPENING_BALANCE because AePS
  // credits are the agent's own money and must stay withdrawable after migration — opening
  // them as a plain advance would trap earnings the agent had already made.
  "OPENING_BALANCE_EARNED",
  "ALLOCATION",
  "DEPOSIT_RECEIVE",
  "DEPOSIT_CREDIT",
  "WALLET_TRANSFER",
  "FLOAT_TRANSFER_INIT",
  "FLOAT_TRANSFER_CONFIRM",
  "DMT",
  "BBPS",
  "RECHARGE",
  "AEPS_DEPOSIT",
  "AEPS_WITHDRAWAL",
  "MICRO_ATM",
  "AADHAAR_PAY",
  "COMMISSION_PAYOUT",
  "SETTLEMENT_DEBIT",
  "SETTLEMENT_PAYOUT",
  "BANK_CHARGE",
  "UNIDENTIFIED_CREDIT",
  "SUSPENSE_RESOLVE",
  "REVERSAL",
  "RECON_ADJUSTMENT",
] as const;

export type TxnType = (typeof TXN_TYPES)[number];

const TXN_TYPE_SET = new Set<string>(TXN_TYPES);

export function isTxnType(value: string): value is TxnType {
  return TXN_TYPE_SET.has(value);
}

/** Agent-owned wallets. Money entering these has exactly one door: COMPANY. */
export const HIERARCHY_TYPES = ["sd", "distributor", "retailer"] as const satisfies AccountType[];

/** Treasury-side accounts. None of these may fund a hierarchy wallet — see FUNDING_EXCEPTIONS. */
export const TREASURY_TYPES = [
  "treasury",
  "bank",
  "transit",
  "float",
  "control",
  "suspense",
  "settlement",
] as const satisfies AccountType[];

/**
 * `REVERSAL` and `RECON_ADJUSTMENT` are the only wildcards. Both are constrained elsewhere:
 * a reversal must reference the journal it mirrors, and a recon adjustment must carry a reason
 * and a named operator. Neither may be posted without those — see postJournal().
 */
export const WILDCARD_TXN_TYPES = ["REVERSAL", "RECON_ADJUSTMENT"] as const satisfies TxnType[];

const WILDCARD_SET = new Set<string>(WILDCARD_TXN_TYPES);

interface FlowRule {
  from: readonly AccountType[];
  to: readonly AccountType[];
  txnTypes: readonly TxnType[];
}

// The matrix is DEBIT account -> CREDIT account, which is not the same as the direction the
// physical money travels. AePS is the clearest example: `float -> retailer` means we debit our
// float (the customer's bank paid us) and credit the retailer (we now owe them the cash they
// handed over). See spec §4.7.
const FLOW_RULES: readonly FlowRule[] = [
  // --- Treasury-internal asset relocation. Never funding, so these are allowed freely. ---
  { from: ["bank"], to: ["transit"], txnTypes: ["FLOAT_TRANSFER_INIT"] },
  { from: ["transit"], to: ["float"], txnTypes: ["FLOAT_TRANSFER_CONFIRM"] },
  { from: ["bank"], to: ["suspense"], txnTypes: ["UNIDENTIFIED_CREDIT"] },

  // --- The only two doors into the company wallet. ---
  { from: ["bank"], to: ["company"], txnTypes: ["DEPOSIT_RECEIVE"] },
  { from: ["control"], to: ["company"], txnTypes: ["ALLOCATION"] },
  { from: ["suspense"], to: ["company"], txnTypes: ["SUSPENSE_RESOLVE"] },

  // --- Company is the only account that may credit a hierarchy wallet. ---
  {
    from: ["company"],
    to: HIERARCHY_TYPES,
    txnTypes: ["WALLET_TRANSFER", "DEPOSIT_CREDIT"],
  },
  { from: ["sd"], to: ["distributor"], txnTypes: ["WALLET_TRANSFER"] },
  { from: ["distributor"], to: ["retailer"], txnTypes: ["WALLET_TRANSFER"] },

  // --- Services: retailer spends into our float, and pays our commission income. ---
  {
    from: ["retailer"],
    to: ["float"],
    txnTypes: ["DMT", "BBPS", "RECHARGE", "AEPS_DEPOSIT"],
  },
  {
    // Spec §4.5: a DMT journal has three legs — Dr RTL, Cr FLOAT, Cr COMMISSION_INCOME.
    // The service charge we keep is a credit to income in the same journal.
    from: ["retailer"],
    to: ["income"],
    txnTypes: ["DMT", "BBPS", "RECHARGE", "AEPS_DEPOSIT"],
  },

  // --- AePS: money comes INTO the platform and we owe the retailer. Not funding. ---
  {
    from: ["float"],
    to: ["retailer"],
    txnTypes: ["AEPS_WITHDRAWAL", "MICRO_ATM", "AADHAAR_PAY"],
  },

  // --- Commission we pay out. Spec §2.2 sources this from income, §4.7 from expense. ---
  { from: ["income", "expense"], to: HIERARCHY_TYPES, txnTypes: ["COMMISSION_PAYOUT"] },

  // --- Settlement: money leaving the hierarchy, never entering it. ---
  { from: HIERARCHY_TYPES, to: ["settlement"], txnTypes: ["SETTLEMENT_DEBIT"] },
  { from: ["settlement"], to: ["bank"], txnTypes: ["SETTLEMENT_PAYOUT"] },
  { from: HIERARCHY_TYPES, to: ["bank"], txnTypes: ["SETTLEMENT_PAYOUT"] },

  // --- Costs. ---
  { from: ["expense"], to: ["bank"], txnTypes: ["BANK_CHARGE"] },

  // --- One-time migration only. See FUNDING_EXCEPTIONS and spec "Applying this to the
  //     existing codebase" step 2: give every pre-ledger rupee an origin. ---
  {
    from: ["control"],
    to: HIERARCHY_TYPES,
    txnTypes: ["OPENING_BALANCE", "OPENING_BALANCE_EARNED"],
  },
  { from: ["control"], to: ["company"], txnTypes: ["OPENING_BALANCE"] },
];

/**
 * The complete, deliberate list of flows where a non-COMPANY account credits a hierarchy
 * wallet. The invariant test asserts the matrix contains nothing beyond these — if a future
 * change adds a `bank -> retailer` or `settlement -> retailer` row, that test fails.
 */
export const FUNDING_EXCEPTIONS: readonly { from: AccountType; txnType: TxnType }[] = [
  // The customer's bank paid us; the retailer already handed over the cash.
  { from: "float", txnType: "AEPS_WITHDRAWAL" },
  { from: "float", txnType: "MICRO_ATM" },
  { from: "float", txnType: "AADHAAR_PAY" },
  // One-time backfill of balances that predate the ledger.
  { from: "control", txnType: "OPENING_BALANCE" },
  { from: "control", txnType: "OPENING_BALANCE_EARNED" },
];

type FlowKey = `${AccountType}>${AccountType}`;

const MATRIX = new Map<FlowKey, Set<TxnType>>();
for (const rule of FLOW_RULES) {
  for (const from of rule.from) {
    for (const to of rule.to) {
      const key: FlowKey = `${from}>${to}`;
      let allowed = MATRIX.get(key);
      if (!allowed) {
        allowed = new Set<TxnType>();
        MATRIX.set(key, allowed);
      }
      for (const t of rule.txnTypes) allowed.add(t);
    }
  }
}

export function isFlowAllowed(from: AccountType, to: AccountType, txnType: TxnType): boolean {
  if (WILDCARD_SET.has(txnType)) return true;
  return MATRIX.get(`${from}>${to}`)?.has(txnType) ?? false;
}

/** Every (from, to, txnType) triple the matrix permits. Used by the invariant tests. */
export function allAllowedFlows(): { from: AccountType; to: AccountType; txnType: TxnType }[] {
  const out: { from: AccountType; to: AccountType; txnType: TxnType }[] = [];
  for (const [key, txnTypes] of MATRIX) {
    const [from, to] = key.split(">") as [AccountType, AccountType];
    for (const txnType of txnTypes) out.push({ from, to, txnType });
  }
  return out;
}
