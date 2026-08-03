import { describe, it, expect } from "vitest";
import {
  allAllowedFlows,
  isFlowAllowed,
  FUNDING_EXCEPTIONS,
  HIERARCHY_TYPES,
  TREASURY_TYPES,
  isTxnType,
  type AccountType,
} from "../src/core/ledger/flowMatrix";

const HIERARCHY = new Set<AccountType>(HIERARCHY_TYPES);
const TREASURY = new Set<AccountType>(TREASURY_TYPES);

describe("flow matrix — money entering the hierarchy has exactly one door", () => {
  it("no treasury account credits a hierarchy wallet except through the documented exceptions", () => {
    const violations = allAllowedFlows().filter(({ from, to, txnType }) => {
      if (!HIERARCHY.has(to)) return false;
      if (!TREASURY.has(from)) return false;
      return !FUNDING_EXCEPTIONS.some((e) => e.from === from && e.txnType === txnType);
    });

    // If this fails, someone added a row like `bank -> retailer` to the matrix. That is the
    // failure this test exists to catch: it lets money reach an agent without passing through
    // COMPANY_001, so nothing can answer "how much balance did we issue today".
    expect(violations).toEqual([]);
  });

  it("every funding exception is actually present in the matrix", () => {
    // Guards the opposite drift: an exception left in the list after its flow was removed
    // would silently widen what the test above tolerates.
    for (const exception of FUNDING_EXCEPTIONS) {
      const matched = allAllowedFlows().some(
        (f) => f.from === exception.from && f.txnType === exception.txnType && HIERARCHY.has(f.to),
      );
      expect(matched, `${exception.from} -> hierarchy as ${exception.txnType}`).toBe(true);
    }
  });

  it("rejects TREASURY -> SD", () => {
    expect(isFlowAllowed("treasury", "sd", "WALLET_TRANSFER")).toBe(false);
    expect(isFlowAllowed("treasury", "sd", "DEPOSIT_CREDIT")).toBe(false);
  });

  it("rejects bank and float funding a distributor", () => {
    expect(isFlowAllowed("bank", "distributor", "DEPOSIT_CREDIT")).toBe(false);
    expect(isFlowAllowed("float", "distributor", "WALLET_TRANSFER")).toBe(false);
    expect(isFlowAllowed("settlement", "retailer", "WALLET_TRANSFER")).toBe(false);
  });

  it("rejects agent-to-agent peer transfers", () => {
    // Compliance boundary, not a preference: peer transfer would make the balance look like
    // stored value rather than a prepaid advance against services.
    const peers: [AccountType, AccountType][] = [
      ["retailer", "retailer"],
      ["distributor", "distributor"],
      ["sd", "sd"],
      ["retailer", "distributor"],
      ["distributor", "sd"],
    ];
    for (const [from, to] of peers) {
      expect(isFlowAllowed(from, to, "WALLET_TRANSFER"), `${from} -> ${to}`).toBe(false);
    }
  });

  it("allows the canonical hierarchy path and nothing wider", () => {
    expect(isFlowAllowed("company", "sd", "WALLET_TRANSFER")).toBe(true);
    expect(isFlowAllowed("sd", "distributor", "WALLET_TRANSFER")).toBe(true);
    expect(isFlowAllowed("distributor", "retailer", "WALLET_TRANSFER")).toBe(true);
    // Skipping a level is not permitted — an SD cannot fund a retailer directly.
    expect(isFlowAllowed("sd", "retailer", "WALLET_TRANSFER")).toBe(false);
  });

  it("allows AePS in both directions with the right txn types", () => {
    expect(isFlowAllowed("float", "retailer", "AEPS_WITHDRAWAL")).toBe(true);
    expect(isFlowAllowed("retailer", "float", "AEPS_DEPOSIT")).toBe(true);
    // An AePS withdrawal must not be usable as a generic funding route.
    expect(isFlowAllowed("float", "retailer", "WALLET_TRANSFER")).toBe(false);
    expect(isFlowAllowed("float", "retailer", "DEPOSIT_CREDIT")).toBe(false);
  });

  it("allows the two-leg deposit path only in the right order", () => {
    expect(isFlowAllowed("bank", "company", "DEPOSIT_RECEIVE")).toBe(true);
    expect(isFlowAllowed("company", "retailer", "DEPOSIT_CREDIT")).toBe(true);
    expect(isFlowAllowed("bank", "retailer", "DEPOSIT_CREDIT")).toBe(false);
  });

  it("opens migrated AePS earnings as a hierarchy credit from float control", () => {
    // The legacy `aeps` wallet holds money the retailer earned by paying out their own cash.
    // Opening it as a plain advance would leave them unable to withdraw their own earnings
    // the moment settlement ships.
    expect(isFlowAllowed("control", "retailer", "OPENING_BALANCE_EARNED")).toBe(true);
    expect(isFlowAllowed("control", "distributor", "OPENING_BALANCE_EARNED")).toBe(true);
    // The company wallet is platform float, not anyone's earnings.
    expect(isFlowAllowed("control", "company", "OPENING_BALANCE_EARNED")).toBe(false);
  });

  it("keeps the earned opening out of every non-migration path", () => {
    // It must never become a general-purpose way to mint withdrawable money.
    expect(isFlowAllowed("company", "retailer", "OPENING_BALANCE_EARNED")).toBe(false);
    expect(isFlowAllowed("bank", "retailer", "OPENING_BALANCE_EARNED")).toBe(false);
    expect(isFlowAllowed("distributor", "retailer", "OPENING_BALANCE_EARNED")).toBe(false);
  });

  it("rejects unknown txn types", () => {
    expect(isTxnType("TOTALLY_MADE_UP")).toBe(false);
    expect(isFlowAllowed("company", "sd", "TOTALLY_MADE_UP" as never)).toBe(false);
  });
});
