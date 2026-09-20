import type { ProviderTxnStatus } from "../types";

/** Business codes that mean the recharge request was rejected (safe to fail txn). */
export const VYAPAR_HARD_FAIL_CODES = new Set([
  104, 105, 106, 107, 108, 109, 110, 111, 112, 114, 129,
]);

export function parseStatusCode(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map Vyapar status + statusCode → AsanPay provider status.
 * Never fail solely on HTTP 4xx/5xx without a hard-fail statusCode (portal rule).
 */
export function mapVyaparTxnStatus(input: {
  httpStatus: number;
  status?: boolean | string;
  statusCode?: number | string;
}): ProviderTxnStatus {
  const code = parseStatusCode(input.statusCode);
  if (code != null && VYAPAR_HARD_FAIL_CODES.has(code)) return "failed";

  const statusStr =
    typeof input.status === "boolean"
      ? input.status
        ? "SUCCESS"
        : "FAILED"
      : String(input.status ?? "")
          .trim()
          .toUpperCase();

  if (statusStr === "FAILED" || statusStr === "REFUND") return "failed";
  if (statusStr === "PENDING" || statusStr === "DISPUTE") return "pending";
  if (statusStr === "SUCCESS") {
    // 131 = accepted; portal may still leave txn pending until callback.
    if (code === 131) return "pending";
    return "success";
  }

  if (input.httpStatus >= 400) return "pending";
  return "pending";
}

/** Common UI / number-info names → Vyapar recharge operator codes. */
export function mapVyaparOperatorCode(raw: string): string {
  const key = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const table: Record<string, string> = {
    AT: "AT",
    AIRTEL: "AT",
    BL: "BL",
    BSNL: "BL",
    JIO: "JIO",
    "RELIANCE JIO": "JIO",
    VI: "VI",
    VODAFONE: "VI",
    IDEA: "VI",
    "VODA & IDEA (VI)": "VI",
    ATV: "ATV",
    "AIRTEL TV": "ATV",
    "AIRTEL DTH": "ATV",
    DTV: "DTV",
    "DISH TV": "DTV",
    "DISH": "DTV",
    STV: "STV",
    "SUN TV": "STV",
    "SUN DIRECT": "STV",
    "SUN": "STV",
    TTV: "TTV",
    VTV: "VTV",
    D2H: "VTV",
    "VIDEOCON D2H": "VTV",
    "VIDEOCON": "VTV",
    TATA: "TTV",
    "TATA SKY": "TTV",
    "TATA PLAY": "TTV",
    JPL: "JPL",
    TESTOP: "TESTOP",
  };
  return table[key] ?? raw.trim();
}
