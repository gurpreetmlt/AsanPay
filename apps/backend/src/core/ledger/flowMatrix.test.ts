/**
 * The guard the flow matrix's own comments promise. These are pure-function tests — no
 * database — so they run on every commit and fail the moment someone widens the matrix in a
 * way that lets money into a hierarchy wallet through a door other than COMPANY_001.
 *
 * Spec §2.2: "Add a unit test asserting that no allowed flow credits a hierarchy wallet from a
 * treasury account other than through COMPANY_001. If someone later adds a row to the matrix
 * that breaks this, the test should fail."
 */
import { describe, expect, it } from "vitest";
import { accountTypeEnum } from "../../db/postgres/schema/accounts";
import {
  FUNDING_EXCEPTIONS,
  HIERARCHY_TYPES,
  TREASURY_TYPES,
  TXN_TYPES,
  UPWARD_EXCEPTIONS,
  WILDCARD_TXN_TYPES,
  isFlowAllowed,
  isTxnType,
  type AccountType,
  type TxnType,
} from "./flowMatrix";

const ALL_ACCOUNT_TYPES = accountTypeEnum.enumValues as readonly AccountType[];
const WILDCARDS = new Set<string>(WILDCARD_TXN_TYPES);

/** Every (from, to, txnType) the matrix currently permits, wildcards excluded. */
function allowedFlows(): { from: AccountType; to: AccountType; txnType: TxnType }[] {
  const out: { from: AccountType; to: AccountType; txnType: TxnType }[] = [];
  for (const from of ALL_ACCOUNT_TYPES) {
    for (const to of ALL_ACCOUNT_TYPES) {
      for (const txnType of TXN_TYPES) {
        if (WILDCARDS.has(txnType)) continue;
        if (isFlowAllowed(from, to, txnType)) out.push({ from, to, txnType });
      }
    }
  }
  return out;
}

const isHierarchy = (t: AccountType) => (HIERARCHY_TYPES as readonly AccountType[]).includes(t);
const isTreasury = (t: AccountType) => (TREASURY_TYPES as readonly AccountType[]).includes(t);

describe("flow matrix — one door into the hierarchy", () => {
  it("the matrix is populated", () => {
    // Without this, an accidentally empty matrix would make every "no violations" assertion
    // below pass for the wrong reason.
    const flows = allowedFlows();
    expect(flows.length).toBeGreaterThan(20);
    expect(flows.some((f) => f.from === "company" && f.to === "sd")).toBe(true);
  });

  it("only COMPANY_001 credits a hierarchy wallet from a treasury account", () => {
    const permitted = new Set(FUNDING_EXCEPTIONS.map((e) => `${e.from}>${e.txnType}`));

    const violations = allowedFlows()
      .filter((f) => isTreasury(f.from) && isHierarchy(f.to))
      .filter((f) => !permitted.has(`${f.from}>${f.txnType}`));

    expect(violations).toEqual([]);
  });

  it("every declared funding exception is actually in the matrix", () => {
    // Guards the other direction: a stale exception left behind after a matrix row is removed
    // quietly widens what the test above will tolerate.
    for (const e of FUNDING_EXCEPTIONS) {
      const used = HIERARCHY_TYPES.some((to) => isFlowAllowed(e.from, to, e.txnType));
      expect(used, `${e.from} -> hierarchy via ${e.txnType} is declared but not in the matrix`).toBe(
        true,
      );
    }
  });

  it("rejects TREASURY -> SD", () => {
    for (const txnType of TXN_TYPES) {
      if (WILDCARDS.has(txnType)) continue;
      expect(isFlowAllowed("treasury", "sd", txnType)).toBe(false);
    }
  });

  it("rejects bank, float and settlement crediting a retailer outside the exceptions", () => {
    expect(isFlowAllowed("bank", "retailer", "DEPOSIT_CREDIT")).toBe(false);
    expect(isFlowAllowed("settlement", "retailer", "SETTLEMENT_PAYOUT")).toBe(false);
    expect(isFlowAllowed("float", "retailer", "WALLET_TRANSFER")).toBe(false);
  });
});

describe("flow matrix — no peer transfers", () => {
  it("hierarchy-to-hierarchy credits are limited to the declared upward exceptions", () => {
    const permitted = new Set(UPWARD_EXCEPTIONS.map((e) => `${e.from}>${e.to}>${e.txnType}`));

    const violations = allowedFlows()
      .filter((f) => isHierarchy(f.from) && isHierarchy(f.to))
      // Downward transfers are the normal hierarchy flow, not peer movement.
      .filter((f) => !isDownward(f.from, f.to))
      .filter((f) => !permitted.has(`${f.from}>${f.to}>${f.txnType}`));

    expect(violations).toEqual([]);
  });

  it("rejects level-skipping in both directions", () => {
    expect(isFlowAllowed("sd", "retailer", "WALLET_TRANSFER")).toBe(false);
    expect(isFlowAllowed("retailer", "sd", "UPLINE_PULL")).toBe(false);
  });

  it("rejects same-tier transfers", () => {
    expect(isFlowAllowed("retailer", "retailer", "WALLET_TRANSFER")).toBe(false);
    expect(isFlowAllowed("distributor", "distributor", "WALLET_TRANSFER")).toBe(false);
  });
});

/** sd -> distributor -> retailer, one level at a time. */
function isDownward(from: AccountType, to: AccountType): boolean {
  return (
    (from === "sd" && to === "distributor") || (from === "distributor" && to === "retailer")
  );
}

describe("flow matrix — txn type guard", () => {
  it("isTxnType accepts every declared type and nothing else", () => {
    for (const t of TXN_TYPES) expect(isTxnType(t)).toBe(true);
    expect(isTxnType("WALLET_TRANSFERR")).toBe(false);
    expect(isTxnType("")).toBe(false);
  });

  it("an unknown txn type is never allowed on any pair", () => {
    for (const from of ALL_ACCOUNT_TYPES) {
      for (const to of ALL_ACCOUNT_TYPES) {
        expect(isFlowAllowed(from, to, "NOT_A_TXN_TYPE" as TxnType)).toBe(false);
      }
    }
  });
});
