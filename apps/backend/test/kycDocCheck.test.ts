import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseSecureQrPayload } from "../src/modules/kyc/docCheck/aadhaarSecureQr";
import {
  analyzeDocText,
  bestNameMatch,
  classifyDocType,
  dobMatches,
  extractDob,
  extractPanCandidates,
  isAadhaarLike,
  isPanLike,
  nameSimilarity,
  normalizeDob,
  normalizeGender,
} from "../src/modules/kyc/docCheck/docText";
import { docCheckLabelsFromMeta } from "../src/modules/kyc/docCheck/docCheckLabels";
import { laplacianVariance } from "../src/modules/kyc/docCheck/imageQuality";
import { escalateDifferentPerson } from "../src/modules/kyc/docCheck/identityRules";
import { linesToText } from "../src/modules/kyc/docCheck/paddleOcr";

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

  it("treats DOB + gender as an Aadhaar front even when the number is unreadable", () => {
    const noisy = analyzeDocText("AR bl mn\nAEH / DOB: 08/06/1994\nMale\n0324 0251 |", 36);
    expect(isAadhaarLike(noisy)).toBe(true);
    expect(isPanLike(noisy)).toBe(false);
  });

  it("only calls OCR output 'clearly readable' when confident and long", () => {
    expect(analyzeDocText("AR जनरल ह्रलनललततर Ch EET 2 CEE Sena BV AEH DOB TES", 38).clearlyReadable).toBe(false);
    expect(analyzeDocText(`${PAN_TEXT}\n${PAN_TEXT}`, 85).clearlyReadable).toBe(true);
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

  it("reads PAN DOB from the line below the label and skips issue dates", () => {
    expect(analyzeDocText(PAN_TEXT, 85).dob).toBe("1990-02-01");
    expect(extractDob("Issue Date: 12/03/2021\nRahul Kumar\nDOB: 01/02/1990")).toBe("1990-02-01");
    expect(extractDob("Download Date: 12/03/2021\nGovernment of India")).toBeNull();
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

describe("different-person rule", () => {
  type Item = { id: string; status: "pass" | "flag" | "fail" | "skip"; detail?: string; score?: number };
  const flagName = (score: number): Item => ({ id: "name", status: "flag", score });
  const flagDob: Item = { id: "dob", status: "flag" };

  it("keeps one soft mismatch amber", () => {
    const checks: Item[] = [flagName(30), { id: "dob", status: "pass" }];
    escalateDifferentPerson(checks, "Aadhaar card", false);
    expect(checks.map((c) => c.status)).toEqual(["flag", "pass"]);
  });

  it("turns name < 50 % + DOB mismatch red", () => {
    const checks: Item[] = [flagName(30), { ...flagDob }];
    escalateDifferentPerson(checks, "Aadhaar card", false);
    expect(checks.map((c) => c.status)).toEqual(["fail", "fail"]);
    expect(checks[0]!.detail).toContain("belongs to someone else");
  });

  it("keeps name 50–80 % + DOB mismatch amber", () => {
    const checks: Item[] = [flagName(65), { ...flagDob }];
    escalateDifferentPerson(checks, "PAN card", false);
    expect(checks.map((c) => c.status)).toEqual(["flag", "flag"]);
  });

  it("turns Aadhaar number mismatch + name mismatch red", () => {
    const checks: Item[] = [{ id: "aadhaarNumber", status: "flag" }, flagName(70)];
    escalateDifferentPerson(checks, "Aadhaar card", true);
    expect(checks.map((c) => c.status)).toEqual(["fail", "fail"]);
    expect(checks[0]!.detail).toContain("number and name");
  });

  it("keeps a lone Aadhaar number mismatch amber (OCR digit misread)", () => {
    const checks: Item[] = [{ id: "aadhaarNumber", status: "flag" }, { id: "name", status: "pass", score: 96 }];
    escalateDifferentPerson(checks, "Aadhaar card", true);
    expect(checks.map((c) => c.status)).toEqual(["flag", "pass"]);
  });

  it("turns a lone mismatch with the provider-verified PAN red", () => {
    const checks: Item[] = [{ id: "panNumber", status: "flag" }, { id: "name", status: "pass", score: 96 }];
    escalateDifferentPerson(checks, "PAN card", true, true);
    expect(checks.map((c) => c.status)).toEqual(["fail", "pass"]);
    expect(checks[0]!.detail).toBe(
      "This PAN card belongs to someone else — the number doesn't match your details. Upload a photo of your own PAN card.",
    );
  });

  it("uses the same someone-else message for a PAN with a different name and DOB", () => {
    const checks: Item[] = [{ id: "panNumber", status: "skip" }, flagName(20), { ...flagDob }];
    escalateDifferentPerson(checks, "PAN card", false, true);
    expect(checks.map((c) => c.status)).toEqual(["skip", "fail", "fail"]);
    expect(checks[1]!.detail).toContain("This PAN card belongs to someone else — the name and date of birth don't match");
  });
});

describe("older PAN card text", () => {
  it("recognises the header even when OCR drops spaces or the first word", () => {
    expect(isPanLike(analyzeDocText("INCOMETAX DEPARTMENT\nGOVT. OF INDIA", 80))).toBe(true);
    expect(isPanLike(analyzeDocText("lNCOME TAX DEPARTMENT", 80))).toBe(true);
    expect(isPanLike(analyzeDocText("Permanent Account Number Card", 80))).toBe(true);
  });
});

describe("PaddleOCR reading order", () => {
  const box = (left: number, top: number, w = 100, h = 20) => [
    [left, top],
    [left + w, top],
    [left + w, top + h],
    [left, top + h],
  ];
  it("rebuilds rows top → bottom and runs left → right", () => {
    const text = linesToText([
      { text: "22/09/1995", mean: 0.9, box: box(10, 200) },
      { text: "GOVT. OF INDIA", mean: 0.9, box: box(300, 12) },
      { text: "Date of Birth", mean: 0.9, box: box(10, 170) },
      { text: "INCOME TAX DEPARTMENT", mean: 0.9, box: box(10, 10) },
    ]);
    expect(text.split("\n")).toEqual(["INCOME TAX DEPARTMENT  GOVT. OF INDIA", "Date of Birth", "22/09/1995"]);
    expect(extractDob(text)).toBe("1995-09-22");
  });
});

describe("gender on card", () => {
  it("reads FEMALE before MALE and normalises form values", () => {
    expect(analyzeDocText("Arzoo\nDOB: 22/09/1995\nFemale\n2666 7507 5127", 70).genderValue).toBe("female");
    expect(analyzeDocText("Gurpreet Singh\nDOB: 08/06/1994\nMale", 70).genderValue).toBe("male");
    expect(normalizeGender("Male")).toBe("male");
    expect(normalizeGender("F")).toBe("female");
    expect(normalizeGender("Other")).toBe("other");
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

describe("admin doc check labels", () => {
  const at = "2026-10-26T00:00:00.000Z";

  it("labels pass, QR, name mismatch and wrong document", () => {
    const labels = docCheckLabelsFromMeta({
      docChecks: {
        panImage: {
          status: "pass",
          docType: "pan",
          message: "",
          checkedAt: at,
          checks: [
            { id: "docType", label: "PAN card", status: "pass" },
            { id: "name", label: "Name match", status: "pass", score: 96 },
          ],
        },
        aadhaarBack: {
          status: "flag",
          docType: "aadhaar_back",
          message: "",
          checkedAt: at,
          checks: [
            { id: "aadhaarQr", label: "Aadhaar QR", status: "pass" },
            { id: "name", label: "Name match", status: "flag", score: 72 },
          ],
        },
        aadhaarFront: {
          status: "fail",
          docType: "pan",
          message: "",
          checkedAt: at,
          checks: [{ id: "docType", label: "Aadhaar card", status: "fail" }],
        },
      },
    });
    expect(labels.panCard).toEqual([{ tone: "pass", text: "✓ PAN photo matched" }]);
    expect(labels.aadhaarBack).toEqual([
      { tone: "pass", text: "✓ Aadhaar QR verified" },
      { tone: "flag", text: "⚠ Name mismatch (72%)" },
    ]);
    expect(labels.aadhaarFront).toEqual([{ tone: "fail", text: "✗ Wrong document" }]);
  });

  it("returns nothing for old submits without docChecks", () => {
    expect(docCheckLabelsFromMeta({ city: "Jaipur" })).toEqual({});
    expect(docCheckLabelsFromMeta(null)).toEqual({});
  });
});
