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
};

/** Shown under the PAN field when 10 characters are entered but the format is wrong (e.g. letter O for zero). */
export const PAN_FORMAT_ERROR = "PAN must be 5 letters, 4 numbers, then 1 letter (e.g. ABCDE1234F)";

/** UI state per photo field. */
export type KycDocCheckUi =
  | { state: "checking" }
  | { state: KycDocCheckStatus; message: string };

export const KYC_DOC_CHECK_COPY = {
  checking: "Checking photo…",
  flag: "We couldn't fully read this photo — it will be reviewed.",
  panPass: "✓ PAN card verified",
  aadhaarQrPass: "✓ Aadhaar QR verified",
  aadhaarPass: "✓ Aadhaar card verified",
} as const;

/** Map an API result to what the field shows. A failed / unreachable check is a non-blocking `flag`. */
export function kycDocCheckToUi(slot: KycDocCheckSlot, result: KycDocCheckResult | null): KycDocCheckUi {
  if (!result) return { state: "flag", message: KYC_DOC_CHECK_COPY.flag };
  if (result.status === "fail") return { state: "fail", message: result.message };
  if (result.status === "flag") return { state: "flag", message: KYC_DOC_CHECK_COPY.flag };
  const message =
    slot === "panImage"
      ? KYC_DOC_CHECK_COPY.panPass
      : result.qr?.verified
        ? KYC_DOC_CHECK_COPY.aadhaarQrPass
        : KYC_DOC_CHECK_COPY.aadhaarPass;
  return { state: "pass", message };
}

export function kycDocCheckLabel(ui: KycDocCheckUi): string {
  return ui.state === "checking" ? KYC_DOC_CHECK_COPY.checking : ui.message;
}

/** Continue stays disabled while a photo on this step is being checked or was rejected. */
export function kycDocCheckBlocksStep(ui: KycDocCheckUi | undefined): boolean {
  return ui?.state === "checking" || ui?.state === "fail";
}
