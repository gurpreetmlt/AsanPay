/** KYC photo check (POST /api/kyc/documents/check) — shared by agent web + mobile so copy stays identical. */

export type KycDocCheckSlot = "panImage" | "aadhaarFront" | "aadhaarBack";
export type KycDocCheckStatus = "pass" | "flag" | "fail";

export type KycDocCheckResult = {
  ok: boolean;
  status: KycDocCheckStatus;
  docType: "pan" | "aadhaar_front" | "aadhaar_back" | "unknown";
  checks: {
    id: string;
    label: string;
    status: KycDocCheckStatus | "skip";
    detail?: string;
    score?: number;
  }[];
  message: string;
  qr?: { verified: boolean };
  /** Only with `autoCrop: true`: the cropped, upright card that was checked (null = checked as picked). */
  croppedDataUrl?: string | null;
  /** Only with `autoCrop: true`: false = no card outline found; the app opens manual crop. */
  cardDetected?: boolean;
};

/** Shown under the PAN field when 10 characters are entered but the format is wrong (e.g. letter O for zero). */
export const PAN_FORMAT_ERROR = "PAN must be 5 letters, 4 numbers, then 1 letter (e.g. ABCDE1234F)";

/** One line in the per-field result list under a checked photo. */
export type KycDocCheckItem = { tone: KycDocCheckStatus; text: string };

/** UI state per photo field. */
export type KycDocCheckUi =
  | { state: "checking" }
  | { state: KycDocCheckStatus; message: string; items: KycDocCheckItem[] };

/** "✓ PAN number matched", "⚠ Name 72% match" … — skipped checks and photo-quality rows are hidden. */
function checkItem(c: KycDocCheckResult["checks"][number]): KycDocCheckItem | null {
  if (c.status === "skip") return null;
  const pass = c.status === "pass";
  const tone = c.status;
  switch (c.id) {
    case "docType":
      return pass ? { tone, text: `✓ ${c.label} detected` } : null;
    case "panNumber":
      if (pass) return { tone, text: "✓ PAN number matched" };
      return c.status === "fail"
        ? { tone, text: "✗ PAN number doesn't match" }
        : { tone, text: "⚠ PAN number not readable" };
    case "aadhaarNumber":
      if (pass) return { tone, text: "✓ Aadhaar number matched" };
      if (c.status === "fail") return { tone, text: "✗ Aadhaar number doesn't match" };
      return /couldn't read/i.test(c.detail ?? "")
        ? { tone, text: "⚠ Aadhaar number not readable" }
        : { tone, text: "⚠ Aadhaar number doesn't match" };
    case "name":
      return pass
        ? { tone, text: `✓ Name matched${c.score != null ? ` (${c.score}%)` : ""}` }
        : { tone, text: `⚠ Name ${c.score != null ? `${c.score}% match` : "doesn't match"}` };
    case "dob":
      return pass ? { tone, text: "✓ Date of birth matched" } : { tone, text: "⚠ Date of birth doesn't match" };
    case "gender":
      return pass ? { tone, text: "✓ Gender matched" } : { tone, text: "⚠ Gender doesn't match" };
    case "aadhaarQr":
      return pass ? { tone, text: "✓ Aadhaar QR verified" } : { tone, text: "⚠ Aadhaar QR signature not valid" };
    default:
      return null;
  }
}

export const KYC_DOC_CHECK_COPY = {
  checking: "Checking photo…",
  flag: "We couldn't fully read this photo — it will be reviewed.",
  panPass: "✓ PAN card verified",
  aadhaarQrPass: "✓ Aadhaar QR verified",
  aadhaarPass: "✓ Aadhaar card verified",
} as const;

/** Map an API result to what the field shows. A failed / unreachable check is a non-blocking `flag`. */
export function kycDocCheckToUi(slot: KycDocCheckSlot, result: KycDocCheckResult | null): KycDocCheckUi {
  if (!result) return { state: "flag", message: KYC_DOC_CHECK_COPY.flag, items: [] };
  const items = result.checks.map(checkItem).filter((i): i is KycDocCheckItem => i !== null);
  if (result.status === "fail") return { state: "fail", message: result.message, items: [] };
  if (result.status === "flag") return { state: "flag", message: KYC_DOC_CHECK_COPY.flag, items };
  const message =
    slot === "panImage"
      ? KYC_DOC_CHECK_COPY.panPass
      : result.qr?.verified
        ? KYC_DOC_CHECK_COPY.aadhaarQrPass
        : KYC_DOC_CHECK_COPY.aadhaarPass;
  return { state: "pass", message, items };
}

export function kycDocCheckLabel(ui: KycDocCheckUi): string {
  return ui.state === "checking" ? KYC_DOC_CHECK_COPY.checking : ui.message;
}

/** PAN register names come in capitals ("GURPREET SINGH") — store and show them as "Gurpreet Singh". */
export function formatPanName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s.'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Form values sent with a photo check so the server can compare them with the card.
 * Only the Aadhaar last 4 digits — never the full number.
 */
export function kycDocCheckHints(form: { dob?: string; gender?: string; aadhaar?: string; pan?: string }): {
  pan: string;
  aadhaarLast4: string;
  dob?: string;
  gender?: string;
} {
  const digits = (form.aadhaar ?? "").replace(/\D/g, "");
  const pan = (form.pan ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return {
    // Always sent: empty means "not typed yet", so the card is not compared with older details.
    pan: /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : "",
    aadhaarLast4: digits.length === 12 ? digits.slice(-4) : "",
    ...(form.dob ? { dob: form.dob } : {}),
    ...(form.gender ? { gender: form.gender } : {}),
  };
}

/** Photo fields on a signup step (step 3 = PAN, step 4 = Aadhaar; 0-based index 2 / 3). */
export function kycDocCheckSlotsForStep(stepIndex: number): KycDocCheckSlot[] {
  if (stepIndex === 2) return ["panImage"];
  if (stepIndex === 3) return ["aadhaarFront", "aadhaarBack"];
  return [];
}

/** Continue stays disabled while a photo on this step is being checked or was rejected. */
export function kycDocCheckBlocksStep(ui: KycDocCheckUi | undefined): boolean {
  return ui?.state === "checking" || ui?.state === "fail";
}
