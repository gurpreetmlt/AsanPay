import { describe, it, expect } from "vitest";
import { normaliseUtr, bankAccountCode } from "../src/modules/banking/banking.service";
import { nameSimilarity } from "../src/modules/fund-requests/matching";
import { retailerFacingStatus } from "../src/modules/fund-requests/fundRequest.service";

describe("UTR normalisation", () => {
  it("collapses the formats banks actually emit into one comparable value", () => {
    const forms = ["UTR1234-5678", "utr1234 5678", "UTR 1234/5678", "utr12345678"];
    const normalised = forms.map(normaliseUtr);
    expect(new Set(normalised).size).toBe(1);
    expect(normalised[0]).toBe("UTR12345678");
  });

  it("treats an empty or punctuation-only reference as absent", () => {
    expect(normaliseUtr("")).toBeNull();
    expect(normaliseUtr("   ")).toBeNull();
    expect(normaliseUtr("---")).toBeNull();
    expect(normaliseUtr(null)).toBeNull();
    expect(normaliseUtr(undefined)).toBeNull();
  });
});

describe("bank account codes", () => {
  it("produces a stable, readable code per bank and purpose", () => {
    expect(bankAccountCode("ICICI Bank", "collection")).toBe("TREASURY_BANK_ICICI_BANK_COLLECTION");
    expect(bankAccountCode("HDFC", "payout")).toBe("TREASURY_BANK_HDFC_PAYOUT");
  });

  it("keeps collection and payout accounts at the same bank distinct", () => {
    expect(bankAccountCode("Axis", "collection")).not.toBe(bankAccountCode("Axis", "ops"));
  });
});

describe("sender name similarity", () => {
  it("matches the same person across bank formatting differences", () => {
    expect(nameSimilarity("RAMESH KUMAR SHARMA", "Ramesh Kumar Sharma")).toBeGreaterThan(0.8);
    expect(nameSimilarity("MR RAMESH KUMAR", "RAMESH KUMAR")).toBeGreaterThan(0.8);
  });

  it("does not match different people", () => {
    expect(nameSimilarity("RAMESH KUMAR", "SURESH PATEL")).toBeLessThan(0.8);
  });

  it("returns zero when there is nothing to compare", () => {
    // Short tokens are dropped, so initials alone must never clear the tier-3 threshold.
    expect(nameSimilarity("R K", "S P")).toBe(0);
  });
});

describe("retailer-facing status", () => {
  it("never leaks fraud-scoring language to the retailer", () => {
    // An honest duplicate entry and a deliberate double-claim look identical from the inside.
    // Showing "suspect" to the first accuses a customer of fraud on the strength of a guess.
    const hidden = retailerFacingStatus("suspect");
    expect(hidden).toBe("Under review by team");
    expect(hidden.toLowerCase()).not.toContain("suspect");
    expect(hidden.toLowerCase()).not.toContain("fraud");
  });

  it("collapses every internal review state into one neutral label", () => {
    for (const s of ["amount_mismatch", "under_review", "suspect"] as const) {
      expect(retailerFacingStatus(s)).toBe("Under review by team");
    }
  });

  it("gives a distinct label for each state the retailer can act on", () => {
    expect(retailerFacingStatus("submitted")).toBe("Verifying with bank");
    expect(retailerFacingStatus("credited")).toBe("Credited");
    expect(retailerFacingStatus("rejected")).toBe("Rejected");
    expect(retailerFacingStatus("cancelled")).toBe("Cancelled");
  });
});
