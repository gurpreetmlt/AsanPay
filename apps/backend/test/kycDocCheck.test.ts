import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseSecureQrPayload } from "../src/modules/kyc/docCheck/aadhaarSecureQr";
import {
  analyzeDocText,
  bestNameMatch,
  classifyDocType,
  dobMatches,
  extractPanCandidates,
  isAadhaarLike,
  isPanLike,
  nameSimilarity,
  normalizeDob,
} from "../src/modules/kyc/docCheck/docText";
import { laplacianVariance } from "../src/modules/kyc/docCheck/imageQuality";

const PAN_TEXT = `INCOME TAX DEPARTMENT GOVT. OF INDIA
Permanent Account Number Card
ABCDE1234F
Name
RAHUL KUMAR SHARMA
Father's Name
SURESH KUMAR SHARMA
Date of Birth
01/02/1990`;

const AADHAAR_FRONT_TEXT = `भारत सरकार
Government of India
Rahul Kumar Sharma
DOB: 01/02/1990
Male
1234 5678 9012
मेरा आधार, मेरी पहचान`;

const AADHAAR_BACK_TEXT = `भारतीय विशिष्ट पहचान प्राधिकरण
Unique Identification Authority of India
Address: S/O Suresh Kumar Sharma, 12 MG Road,
Jaipur, Rajasthan - 302001
XXXX XXXX 9012`;

describe("KYC doc text rules", () => {
  it("recognises a PAN card and reads the PAN number", () => {
    const a = analyzeDocText(PAN_TEXT, 85);
    expect(a.readable).toBe(true);
    expect(isPanLike(a)).toBe(true);
    expect(a.panNumbers).toContain("ABCDE1234F");
    expect(classifyDocType(a)).toBe("pan");
    expect(isAadhaarLike(a)).toBe(false);
  });

  it("repairs common OCR swaps inside the PAN number", () => {
    expect(extractPanCandidates("ABCDEl234F")).toContain("ABCDE1234F");
    expect(extractPanCandidates("ABCDEI2S4F")).toContain("ABCDE1254F");
    expect(extractPanCandidates("A8CDE1234F")).toContain("ABCDE1234F");
    expect(extractPanCandidates("ABCDE 1234F")).toContain("ABCDE1234F");
    expect(extractPanCandidates("IDENTIFICATION AUTHORITY")).toEqual([]);
  });

  it("recognises Aadhaar front and keeps only the last 4 digits", () => {
    const a = analyzeDocText(AADHAAR_FRONT_TEXT, 80);
    expect(isAadhaarLike(a)).toBe(true);
    expect(isPanLike(a)).toBe(false);
    expect(classifyDocType(a)).toBe("aadhaar_front");
    expect(a.aadhaarLast4).toEqual(["9012"]);
    expect(a.dob).toBe("1990-02-01");
    expect(JSON.stringify(a)).not.toContain("123456789012");
  });

  it("recognises Aadhaar back with a masked number", () => {
    const a = analyzeDocText(AADHAAR_BACK_TEXT, 80);
    expect(classifyDocType(a)).toBe("aadhaar_back");
    expect(a.aadhaarLast4).toEqual(["9012"]);
    expect(a.dobLabel || a.gender).toBe(false);
  });

  it("does not read a 16-digit VID as an Aadhaar number", () => {
    const a = analyzeDocText("VID : 9134 5678 1234 5678", 80);
    expect(a.aadhaarLast4).toEqual([]);
  });

  it("marks near-empty OCR output as unreadable", () => {
    expect(analyzeDocText("~ ~ ab", 90).readable).toBe(false);
    expect(analyzeDocText(PAN_TEXT, 10).readable).toBe(false);
  });
});

describe("KYC name / DOB match", () => {
  it("matches names regardless of word order and label noise", () => {
    expect(nameSimilarity("Rahul Kumar", "KUMAR RAHUL")).toBe(1);
    expect(bestNameMatch("Rahul Kumar Sharma", ["Name: RAHUL KUMAR SHARMA"])).toBe(1);
    expect(bestNameMatch("Rahul Kumar Sharma", PAN_TEXT.split("\n"))).toBeGreaterThanOrEqual(0.8);
  });

  it("scores a different person below 0.8", () => {
    expect(bestNameMatch("Priya Verma", PAN_TEXT.split("\n"))).toBeLessThan(0.8);
  });

  it("normalises DOB formats", () => {
    expect(normalizeDob("01-02-1990")).toBe("1990-02-01");
    expect(normalizeDob("1990-02-01")).toBe("1990-02-01");
    expect(normalizeDob("Year of Birth: 1990")).toBe("1990");
    expect(dobMatches("1990-02-01", "1990")).toBe(true);
    expect(dobMatches("1990-02-01", "1991-02-01")).toBe(false);
    expect(dobMatches(null, "1990-02-01")).toBeNull();
  });
});

function buildSecureQr(fields: string[], photo: Buffer): string {
  const parts: Buffer[] = [];
  for (const f of fields) parts.push(Buffer.from(f, "latin1"), Buffer.from([255]));
  parts.push(photo, Buffer.alloc(256, 7));
  const gz = gzipSync(Buffer.concat(parts));
  return BigInt(`0x${gz.toString("hex")}`).toString(10);
}

describe("Aadhaar Secure QR parsing", () => {
  const v2Fields = [
    "V2",
    "3",
    "901220190101123456789",
    "Rahul Kumar Sharma",
    "01-02-1990",
    "M",
    "S/O Suresh Kumar Sharma",
    "Jaipur",
    "Near Temple",
    "12",
    "MG Road",
    "302001",
    "Jaipur GPO",
    "Rajasthan",
    "MG Road",
    "Jaipur",
    "Jaipur",
    "5678",
  ];

  it("decodes V2 fields and exposes only the last 4 Aadhaar digits", () => {
    const parsed = parseSecureQrPayload(buildSecureQr(v2Fields, Buffer.alloc(400, 1)));
    expect(parsed).not.toBeNull();
    expect(parsed!.data.version).toBe("V2");
    expect(parsed!.data.aadhaarLast4).toBe("9012");
    expect(parsed!.data.name).toBe("Rahul Kumar Sharma");
    expect(parsed!.data.dob).toBe("01-02-1990");
    expect(parsed!.data.gender).toBe("M");
    expect(parsed!.data.address).toContain("Rajasthan");
    expect(parsed!.data.hasPhoto).toBe(true);
    expect(parsed!.signature.length).toBe(256);
  });

  it("decodes V1 (no version tag)", () => {
    const parsed = parseSecureQrPayload(buildSecureQr(v2Fields.slice(1, 17), Buffer.alloc(400, 1)));
    expect(parsed?.data.version).toBe("V1");
    expect(parsed?.data.aadhaarLast4).toBe("9012");
  });

  it("rejects non-Aadhaar QR text", () => {
    expect(parseSecureQrPayload("https://example.com/pan?ABCDE1234F")).toBeNull();
    expect(parseSecureQrPayload("1".repeat(300))).toBeNull();
  });
});

describe("blur metric", () => {
  it("is ~0 for a flat image and high for sharp edges", () => {
    const w = 40;
    const h = 40;
    const flat = new Uint8Array(w * h).fill(128);
    const checker = new Uint8Array(w * h).map((_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 255 : 0);
    expect(laplacianVariance(flat, w, h)).toBe(0);
    expect(laplacianVariance(checker, w, h)).toBeGreaterThan(1000);
  });
});
