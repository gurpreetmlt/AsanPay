/** Pure OCR-text rules for KYC document photos (no I/O — unit tested). */

export type DocType = "pan" | "aadhaar_front" | "aadhaar_back" | "unknown";

export type DocTextAnalysis = {
  readable: boolean;
  panKeyword: boolean;
  panNumbers: string[];
  aadhaarGov: boolean;
  aadhaarWord: boolean;
  uidai: boolean;
  address: boolean;
  dobLabel: boolean;
  gender: boolean;
  /** Last 4 digits of every 12-digit (or XXXX-masked) Aadhaar number found. Full numbers are never kept. */
  aadhaarLast4: string[];
  dob: string | null;
  lines: string[];
};

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const MIN_READABLE_CHARS = 25;
const MIN_READABLE_CONFIDENCE = 30;

const TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G" };
const TO_DIGIT: Record<string, string> = { O: "0", D: "0", Q: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6" };

/** OCR often swaps O/0, I/1, S/5 — repair by PAN position (5 letters, 4 digits, 1 letter). */
function repairPanToken(token: string): string | null {
  if (token.length !== 10) return null;
  const out = token
    .split("")
    .map((ch, i) => (i >= 5 && i <= 8 ? (TO_DIGIT[ch] ?? ch) : (TO_LETTER[ch] ?? ch)))
    .join("");
  return PAN_RE.test(out) ? out : null;
}

export function extractPanCandidates(text: string): string[] {
  const up = text.toUpperCase();
  const found = new Set<string>();
  for (const m of up.matchAll(/\b[A-Z0-9]{10}\b/g)) {
    const pan = repairPanToken(m[0]);
    if (pan) found.add(pan);
  }
  // OCR sometimes splits the number with a space: "ABCDE 1234F"
  for (const m of up.matchAll(/\b([A-Z0-9]{5})\s([A-Z0-9]{5})\b/g)) {
    const pan = repairPanToken(`${m[1]}${m[2]}`);
    if (pan) found.add(pan);
  }
  return [...found];
}

function extractAadhaarLast4(text: string): string[] {
  const up = text.toUpperCase();
  const out = new Set<string>();
  const re = /(?<!\d[ -]?)(?:\d{4}|[X*]{4})[ -]?(?:\d{4}|[X*]{4})[ -]?(\d{4})(?![ -]?\d)/g;
  for (const m of up.matchAll(re)) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}

/** Normalize DOB to YYYY-MM-DD (or YYYY when only the year is known). */
export function normalizeDob(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = /(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = /\b(19\d{2}|20\d{2})\b/.exec(s);
  return m ? m[1]! : null;
}

/** True / false when both sides are known; null when one side is missing. Year-only compares the year. */
export function dobMatches(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  if (a.length === 4 || b.length === 4) return a.slice(0, 4) === b.slice(0, 4);
  return a === b;
}

const DOB_LABEL_RE = /DOB|D\.O\.B|DATE\s*OF\s*BIRTH|YEAR\s*OF\s*BIRTH|जन्म/;
const FULL_DATE_RE = /\b\d{1,2}[/\-.]\d{1,2}[/\-.](?:19|20)\d{2}\b/;

/**
 * DOB from OCR text. Aadhaar prints it on the label line; PAN prints it on the line *below*
 * "Date of Birth". Without a label, the first full date not on an issue / download line.
 */
export function extractDob(text: string): string | null {
  const lines = text.toUpperCase().split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!DOB_LABEL_RE.test(lines[i]!)) continue;
    for (const line of [lines[i]!, lines[i + 1] ?? ""]) {
      const date = FULL_DATE_RE.exec(line)?.[0] ?? (/YEAR\s*OF\s*BIRTH/.test(lines[i]!) ? line : null);
      const dob = date ? normalizeDob(date) : null;
      if (dob) return dob;
    }
  }
  for (const line of lines) {
    if (/ISSUE|DOWNLOAD|PRINT|GENERAT/.test(line)) continue;
    const date = FULL_DATE_RE.exec(line)?.[0];
    if (date) return normalizeDob(date);
  }
  return null;
}

export function analyzeDocText(text: string, confidence: number): DocTextAnalysis {
  const up = text.toUpperCase();
  const alnum = up.replace(/[^A-Z0-9]/g, "").length;
  return {
    readable: alnum >= MIN_READABLE_CHARS && confidence >= MIN_READABLE_CONFIDENCE,
    panKeyword: /INCOME\s*TAX|PERMANENT\s*ACCOUNT|आयकर/.test(up),
    panNumbers: extractPanCandidates(up),
    aadhaarGov: /GOVERNMENT\s*OF\s*INDIA|GOVT\.?\s*OF\s*INDIA|भारत\s*सरकार/.test(up),
    aadhaarWord: /AADHAA?R|आधार/.test(up),
    uidai: /UNIQUE\s*IDENTIFICATION|IDENTIFICATION\s*AUTHORITY|विशिष्ट\s*पहचान/.test(up),
    address: /\bADDRESS\b|पता/.test(up),
    dobLabel: DOB_LABEL_RE.test(up),
    gender: /\b(?:MALE|FEMALE|TRANSGENDER)\b|पुरुष|महिला/.test(up),
    aadhaarLast4: extractAadhaarLast4(up),
    dob: extractDob(text),
    lines: text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  };
}

export function scoreDocTypes(a: DocTextAnalysis): Record<Exclude<DocType, "unknown">, number> {
  const aadhaarNo = a.aadhaarLast4.length > 0;
  return {
    pan: (a.panKeyword ? 2 : 0) + (a.panNumbers.length ? 2 : 0),
    aadhaar_front:
      (a.aadhaarGov ? 1 : 0) +
      (a.aadhaarWord ? 1 : 0) +
      (aadhaarNo ? 2 : 0) +
      (a.dobLabel ? 1 : 0) +
      (a.gender ? 1 : 0),
    aadhaar_back:
      (a.uidai ? 2 : 0) + (a.address ? 1 : 0) + (aadhaarNo ? 1 : 0) + (a.aadhaarWord ? 1 : 0),
  };
}

export function classifyDocType(a: DocTextAnalysis): DocType {
  const scores = scoreDocTypes(a);
  let best: DocType = "unknown";
  let bestScore = 1;
  for (const [type, score] of Object.entries(scores) as [Exclude<DocType, "unknown">, number][]) {
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

/** Needs an Aadhaar-only marker — "Government of India" + DOB also appear on PAN cards. */
export function isAadhaarLike(a: DocTextAnalysis): boolean {
  return a.aadhaarWord || a.uidai || a.aadhaarLast4.length > 0 || (a.aadhaarGov && a.gender);
}

export function isPanLike(a: DocTextAnalysis): boolean {
  return a.panKeyword || a.panNumbers.length > 0;
}

/** PAN markers present and PAN outscores both Aadhaar sides. */
export function looksLikePan(a: DocTextAnalysis): boolean {
  return isPanLike(a) && classifyDocType(a) === "pan";
}

// ── Name fuzzy match ──────────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[b.length]!;
}

function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : 1 - levenshtein(a, b) / max;
}

/** 0..1 similarity; tolerant of word order ("KUMAR RAHUL" vs "RAHUL KUMAR"). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  const sorted = (s: string) => s.split(" ").sort().join(" ");
  return Math.max(ratio(na, nb), ratio(sorted(na), sorted(nb)));
}

/**
 * Best similarity of `expected` against any OCR line (or two adjacent lines joined),
 * using word windows so label noise ("NAME RAHUL KUMAR") does not drag the score down.
 */
export function bestNameMatch(expected: string, lines: string[]): number {
  const want = normalizeName(expected);
  if (!want) return 0;
  const k = want.split(" ").length;
  const candidates: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    candidates.push(lines[i]!);
    if (i + 1 < lines.length) candidates.push(`${lines[i]} ${lines[i + 1]}`);
  }
  let best = 0;
  for (const c of candidates) {
    const words = normalizeName(c).split(" ").filter(Boolean);
    if (!words.length) continue;
    for (let size = Math.max(1, k - 1); size <= k + 1; size++) {
      for (let start = 0; start + size <= words.length; start++) {
        best = Math.max(best, nameSimilarity(want, words.slice(start, start + size).join(" ")));
        if (best >= 0.999) return best;
      }
    }
  }
  return best;
}
