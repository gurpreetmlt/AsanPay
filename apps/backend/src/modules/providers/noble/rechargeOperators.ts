import { cacheGet, cacheSet } from "../../../cache/redis";
import { logger } from "../../../utils/logger";
import { firstResponseRow } from "./aepsOps";
import { noblePost } from "./client";
import { isVerificationOn } from "../../verifications/verificationRouting.service";

/** Provider default when the circle of a number is unknown. */
export const UNKNOWN_CIRCLE_CODE = "50";

const DETECT_TTL_SECONDS = 6 * 60 * 60;
const MEMORY_CACHE_MAX = 5000;

interface MobileOperatorDef {
  label: string;
  /** Prefixes of the provider operator code (without `_B2B`) that belong to this operator. */
  families: string[];
  /** Used only when detection is unavailable. */
  fallbackCode: string;
}

const MOBILE_OPERATORS: Record<string, MobileOperatorDef> = {
  AT: { label: "Airtel", families: ["AIRTEL"], fallbackCode: "AIRTEL_B2B" },
  JIO: { label: "Jio", families: ["JIO", "RELIANCE"], fallbackCode: "JIO_B2B" },
  VI: { label: "Vi", families: ["VI", "VODAFONE", "IDEA", "VODAIDEA"], fallbackCode: "VI_B2B" },
  BL: { label: "BSNL", families: ["BSNL"], fallbackCode: "BSNL_B2B" },
};

const DTH_OPERATORS: Record<string, { label: string; code: string }> = {
  ATV: { label: "Airtel TV", code: "AIRTELTV_B2B" },
  DTV: { label: "Dish TV", code: "DISHTV_B2B" },
  TTV: { label: "Tata Play", code: "TATAPLAY_B2B" },
  STV: { label: "Sun Direct", code: "SUNDIRECT_B2B" },
  VTV: { label: "d2h", code: "D2H_B2B" },
};

export interface DetectedOperatorCircle {
  operatorCodeB2B: string;
  circleCode: string;
  remark: string;
}

export type RechargeRouteResult =
  | {
      ok: true;
      operatorCode: string;
      circleCode: string;
      source: "detected" | "fallback" | "dth";
    }
  | { ok: false; message: string; code: string };

const memoryCache = new Map<string, { value: DetectedOperatorCircle; expiresAt: number }>();

function cacheKey(mobile: string): string {
  return `noble:rc:opcircle:${mobile}`;
}

function memoryGet(mobile: string): DetectedOperatorCircle | null {
  const hit = memoryCache.get(mobile);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memoryCache.delete(mobile);
    return null;
  }
  return hit.value;
}

function memorySet(mobile: string, value: DetectedOperatorCircle): void {
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(mobile, { value, expiresAt: Date.now() + DETECT_TTL_SECONDS * 1000 });
}

/** Test helper. */
export function clearRechargeDetectCache(): void {
  memoryCache.clear();
}

function familyOf(providerCode: string): string {
  return providerCode.toUpperCase().replace(/_B2[BC]$/, "");
}

export function belongsToOperator(ourCode: string, providerCode: string): boolean {
  const def = MOBILE_OPERATORS[ourCode.toUpperCase()];
  if (!def) return false;
  const family = familyOf(providerCode);
  // Short families (VI, JIO) must not prefix-match unrelated codes such as VIDEOCON.
  return def.families.some(
    (f) => family === f || family.startsWith(`${f}_`) || (f.length >= 4 && family.startsWith(f)),
  );
}

/** Human label for a detected provider code, e.g. `AIRTEL_B2B` → `Airtel`. */
export function detectedOperatorLabel(providerCode: string): string {
  for (const [ourCode, def] of Object.entries(MOBILE_OPERATORS)) {
    if (belongsToOperator(ourCode, providerCode)) return def.label;
  }
  return familyOf(providerCode);
}

function parseDetected(row: Record<string, unknown>): DetectedOperatorCircle | null {
  const operatorCodeB2B = typeof row.operatorCodeB2B === "string" ? row.operatorCodeB2B.trim().toUpperCase() : "";
  const circleCode = row.circleCode == null ? "" : String(row.circleCode).trim();
  if (!operatorCodeB2B || !circleCode) return null;
  return {
    operatorCodeB2B,
    circleCode,
    remark: typeof row.remark === "string" ? row.remark.trim() : "",
  };
}

/** Provider lookup of operator + circle for a 10-digit number; cached (Redis when set, else memory). */
export async function detectOperatorAndCircle(mobile: string): Promise<DetectedOperatorCircle | null> {
  const fromMemory = memoryGet(mobile);
  if (fromMemory) return fromMemory;

  const cached = await cacheGet(cacheKey(mobile));
  if (cached) {
    try {
      const value = JSON.parse(cached) as DetectedOperatorCircle;
      if (value.operatorCodeB2B && value.circleCode) {
        memorySet(mobile, value);
        return value;
      }
    } catch {
      /* fall through to live lookup */
    }
  }

  try {
    const { httpStatus, json } = await noblePost("recharge", "/v1.0/recharge/operator_and_circle", {
      rechargeNumber: mobile,
    });
    if (httpStatus >= 400 || json.status !== 1) return null;
    const value = parseDetected(firstResponseRow(json));
    if (!value) return null;
    memorySet(mobile, value);
    await cacheSet(cacheKey(mobile), JSON.stringify(value), DETECT_TTL_SECONDS);
    return value;
  } catch (err) {
    logger.warn({ err }, "Recharge operator/circle lookup failed");
    return null;
  }
}

/**
 * Map our operator code (AT / JIO / VI / BL / ATV …) to the provider operator + circle.
 * Mobile: detected operator wins; a different operator than the one selected is refused.
 */
export async function resolveRechargeRoute(params: {
  serviceCode?: string;
  operatorCode: string;
  accountRef: string;
}): Promise<RechargeRouteResult> {
  const ours = params.operatorCode.trim().toUpperCase();

  const dth = DTH_OPERATORS[ours];
  if (dth || params.serviceCode === "DTH") {
    if (!dth) {
      return {
        ok: false,
        code: "RECHARGE_OPERATOR_UNSUPPORTED",
        message: `DTH operator ${params.operatorCode} is not supported. Select another operator.`,
      };
    }
    return { ok: true, operatorCode: dth.code, circleCode: UNKNOWN_CIRCLE_CODE, source: "dth" };
  }

  const def = MOBILE_OPERATORS[ours];
  if (!def) {
    return {
      ok: false,
      code: "RECHARGE_OPERATOR_UNSUPPORTED",
      message: `Mobile operator ${params.operatorCode} is not supported. Select Airtel, Jio, Vi or BSNL.`,
    };
  }

  const mobile = params.accountRef.replace(/\D/g, "");
  if (!/^\d{10}$/.test(mobile)) {
    return { ok: false, code: "RECHARGE_MOBILE_INVALID", message: "Enter a valid 10-digit mobile" };
  }

  const detected = (await isVerificationOn("recharge_operator_check")) ? await detectOperatorAndCircle(mobile) : null;
  if (!detected) {
    return { ok: true, operatorCode: def.fallbackCode, circleCode: UNKNOWN_CIRCLE_CODE, source: "fallback" };
  }

  if (!belongsToOperator(ours, detected.operatorCodeB2B)) {
    const actual = detectedOperatorLabel(detected.operatorCodeB2B);
    return {
      ok: false,
      code: "RECHARGE_OPERATOR_MISMATCH",
      message: `This number is on ${actual}, not ${def.label}. Select ${actual} and try again.`,
    };
  }

  return {
    ok: true,
    operatorCode: detected.operatorCodeB2B,
    circleCode: detected.circleCode,
    source: "detected",
  };
}
