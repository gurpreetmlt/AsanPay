import type { DocCheckItem, DocCheckSlot, StoredDocCheck } from "./docCheck.service";

export type DocCheckLabelTone = "pass" | "flag" | "fail";
export type DocCheckLabel = { tone: DocCheckLabelTone; text: string };

/** Admin document keys (`documents` map on user detail) for each checked slot. */
const SLOT_TO_DOC_KEY: Record<DocCheckSlot, "panCard" | "aadhaarFront" | "aadhaarBack"> = {
  panImage: "panCard",
  aadhaarFront: "aadhaarFront",
  aadhaarBack: "aadhaarBack",
};

const PASS_TEXT: Record<DocCheckSlot, string> = {
  panImage: "✓ PAN photo matched",
  aadhaarFront: "✓ Aadhaar front matched",
  aadhaarBack: "✓ Aadhaar back matched",
};

function failText(c: DocCheckItem): string {
  if (c.id === "docType") return "✗ Wrong document";
  if (c.id === "panNumber") return "✗ PAN number mismatch";
  if (c.id === "aadhaarNumber") return "✗ Aadhaar number mismatch";
  if (c.id === "quality") return "✗ Poor photo quality";
  return `✗ ${c.label} failed`;
}

function flagText(c: DocCheckItem): string {
  if (c.id === "name") return c.score != null ? `⚠ Name mismatch (${c.score}%)` : "⚠ Name mismatch";
  if (c.id === "dob") return "⚠ Date of birth mismatch";
  if (c.id === "aadhaarNumber") {
    return /couldn't read/i.test(c.detail ?? "") ? "⚠ Aadhaar number unreadable" : "⚠ Aadhaar number mismatch";
  }
  if (c.id === "panNumber") return "⚠ PAN number unreadable";
  if (c.id === "aadhaarQr") return "⚠ Aadhaar QR signature not verified";
  if (c.id === "docType") return "⚠ Date of birth unreadable";
  return "⚠ Photo unreadable";
}

function isStoredDocCheck(v: unknown): v is StoredDocCheck {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<StoredDocCheck>;
  return (r.status === "pass" || r.status === "flag" || r.status === "fail") && Array.isArray(r.checks);
}

/** Short admin labels for one stored photo check, e.g. "✓ Aadhaar QR verified", "⚠ Name mismatch (72%)". */
export function labelsForDocCheck(slot: DocCheckSlot, result: StoredDocCheck): DocCheckLabel[] {
  const failed = result.checks.find((c) => c.status === "fail");
  if (failed) return [{ tone: "fail", text: failText(failed) }];

  const labels: DocCheckLabel[] = [];
  const qrPassed = result.checks.some((c) => c.id === "aadhaarQr" && c.status === "pass");
  if (qrPassed) labels.push({ tone: "pass", text: "✓ Aadhaar QR verified" });
  else if (result.status === "pass") labels.push({ tone: "pass", text: PASS_TEXT[slot] });

  for (const c of result.checks) {
    if (c.status === "flag") labels.push({ tone: "flag", text: flagText(c) });
  }
  return labels;
}

/** `kyc.submit` metadata → labels keyed by admin document key. Old submits (no `docChecks`) → `{}`. */
export function docCheckLabelsFromMeta(
  meta: Record<string, unknown> | null | undefined,
): Partial<Record<"panCard" | "aadhaarFront" | "aadhaarBack", DocCheckLabel[]>> {
  const raw = meta?.docChecks;
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<"panCard" | "aadhaarFront" | "aadhaarBack", DocCheckLabel[]>> = {};
  for (const slot of Object.keys(SLOT_TO_DOC_KEY) as DocCheckSlot[]) {
    const result = (raw as Record<string, unknown>)[slot];
    if (!isStoredDocCheck(result)) continue;
    const labels = labelsForDocCheck(slot, result);
    if (labels.length) out[SLOT_TO_DOC_KEY[slot]] = labels;
  }
  return out;
}
