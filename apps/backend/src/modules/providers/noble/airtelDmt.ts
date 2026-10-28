import { and, eq, inArray, or, sql } from "drizzle-orm";
import { isNobleConfigured } from "../../../config/env";
import { db } from "../../../db/postgres";
import { transactions, users } from "../../../db/postgres/schema";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import { firstResponseRow, nobleOk, nobleTxnId } from "./aepsOps";
import { noblePost, type NobleApiResponse } from "./client";

/** In-memory session tokens for Airtel DMT multi-step flow (profile → register → verify → kyc → txn). */
type DmtTokenBag = {
  sessionToken: string;
  verifyToken?: string;
  accessToken?: string;
  expiresAt: number;
};

const tokenBag = new Map<string, DmtTokenBag>();
const TTL_MS = 55 * 60 * 1000;

function bagKey(retailerUserId: string, mobile: string): string {
  return `${retailerUserId}:${mobile}`;
}

export function rememberDmtSession(retailerUserId: string, mobile: string, sessionToken: string): void {
  tokenBag.set(bagKey(retailerUserId, mobile), {
    sessionToken,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function rememberDmtVerifyToken(retailerUserId: string, mobile: string, verifyToken: string): void {
  const key = bagKey(retailerUserId, mobile);
  const prev = tokenBag.get(key);
  tokenBag.set(key, {
    sessionToken: prev?.sessionToken ?? verifyToken,
    verifyToken,
    accessToken: prev?.accessToken,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function rememberDmtAccessToken(retailerUserId: string, mobile: string, accessToken: string): void {
  const key = bagKey(retailerUserId, mobile);
  const prev = tokenBag.get(key);
  tokenBag.set(key, {
    sessionToken: prev?.sessionToken ?? accessToken,
    verifyToken: prev?.verifyToken,
    accessToken,
    expiresAt: Date.now() + TTL_MS,
  });
}

function readBag(retailerUserId: string, mobile: string): DmtTokenBag {
  const key = bagKey(retailerUserId, mobile);
  const bag = tokenBag.get(key);
  if (!bag || bag.expiresAt < Date.now()) {
    throw new HttpError(
      422,
      "DMT session expired. Search the remitter again to continue.",
      "NOBLE_DMT_SESSION_EXPIRED",
    );
  }
  return bag;
}

export interface AirtelMerchantCtx {
  merchantMobile: string;
  latitude: string;
  longitude: string;
  retailerCode: string;
}

export async function resolveAirtelMerchantCtx(
  retailerUserId: string,
  opts?: { latitude?: string; longitude?: string },
): Promise<AirtelMerchantCtx> {
  if (!isNobleConfigured()) {
    throw new HttpError(
      503,
      "AEPS provider is not configured on the server. Contact support.",
      "NOBLE_NOT_CONFIGURED",
    );
  }
  const [user] = await db
    .select({
      mobile: users.mobile,
      uid: users.uid,
      outletLatitude: users.outletLatitude,
      outletLongitude: users.outletLongitude,
    })
    .from(users)
    .where(eq(users.id, retailerUserId));
  if (!user?.mobile) {
    throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  }
  const lat = (opts?.latitude || user.outletLatitude || "12.9715").trim();
  const lng = (opts?.longitude || user.outletLongitude || "77.5945").trim();
  return {
    merchantMobile: user.mobile,
    latitude: Number(lat).toFixed(4),
    longitude: Number(lng).toFixed(4),
    retailerCode: user.uid.replace(/[^A-Za-z0-9]/g, "").slice(0, 15) || "ASANPAY",
  };
}

export function rowToken(json: NobleApiResponse): string {
  const row = firstResponseRow(json);
  return String(row.token ?? row.sessionToken ?? row.verificationToken ?? "");
}

export function assertNobleDmtOk(httpStatus: number, json: NobleApiResponse, fallback: string): void {
  if (nobleOk(json, httpStatus)) return;
  throw new HttpError(
    httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
    (typeof json.description === "string" && json.description) ||
      (typeof json.message === "string" && json.message) ||
      fallback,
    typeof json.statusCode === "string" ? json.statusCode : "NOBLE_DMT_FAILED",
  );
}

export async function airtelGetCustomer(
  retailerUserId: string,
  customerMobile: string,
  opts?: { latitude?: string; longitude?: string },
): Promise<{ httpStatus: number; json: NobleApiResponse; merchant: AirtelMerchantCtx }> {
  const merchant = await resolveAirtelMerchantCtx(retailerUserId, opts);
  const { httpStatus, json } = await noblePost("dmt", "/api/v1.0/airtel_dmt/get_customer", {
    mobileNumber: customerMobile,
    latitude: merchant.latitude,
    longitude: merchant.longitude,
    merchantMobileNumber: merchant.merchantMobile,
  });
  const token = rowToken(json);
  if (token) rememberDmtSession(retailerUserId, customerMobile, token);
  return { httpStatus, json, merchant };
}

export interface NobleBene {
  name: string;
  accountNumber: string;
  ifsc: string;
  bank: string;
  mobile: string;
}

/** Beneficiaries linked to a remitter. An empty list comes back as a non-success status, not an error. */
export async function nobleBeneList(customerMobile: string): Promise<NobleBene[]> {
  const { httpStatus, json } = await noblePost("dmt", "/api/v1.0/bene/get", {
    remitterMobile: customerMobile,
  });
  if (!nobleOk(json, httpStatus) || !Array.isArray(json.responseData)) {
    if (httpStatus >= 400) {
      logger.warn({ httpStatus, statusCode: json.statusCode }, "Provider beneficiary list failed");
    }
    return [];
  }
  const out: NobleBene[] = [];
  for (const raw of json.responseData) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const accountNumber = String(r.account_no ?? "").trim();
    if (!accountNumber) continue;
    out.push({
      name: String(r.account_name ?? "").trim(),
      accountNumber,
      ifsc: String(r.ifsc ?? "").trim().toUpperCase(),
      bank: String(r.bank ?? "").trim(),
      mobile: String(r.bene_mobile ?? "").trim(),
    });
  }
  return out;
}

/** Per-transfer amount accepted by transaction_validate_otp (whole range, rupees). */
export const AIRTEL_DMT_MIN_AMOUNT = 100;
export const AIRTEL_DMT_MAX_AMOUNT = 5000;

/** Remitter eKYC PID must be captured with this wadh (fingerprint); face uses its own value. */
export const AIRTEL_DMT_KYC_FINGER_WADH = "E0jzJ/P8UopUHAieZn8CKqS4WPMi5ZSYXgfnlfkWjrc=";

export function assertAirtelDmtAmount(amount: string): void {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < AIRTEL_DMT_MIN_AMOUNT || n > AIRTEL_DMT_MAX_AMOUNT) {
    throw new HttpError(
      400,
      `Amount must be between ₹${AIRTEL_DMT_MIN_AMOUNT} and ₹${AIRTEL_DMT_MAX_AMOUNT} per transfer. Split larger amounts into separate transfers.`,
      "NOBLE_DMT_AMOUNT_RANGE",
    );
  }
}

export function assertSixDigitOtp(otp: string): void {
  if (!/^\d{6}$/.test(otp)) {
    throw new HttpError(400, "OTP must be exactly 6 digits. Check the SMS on the remitter mobile.", "NOBLE_DMT_OTP_FORMAT");
  }
}

/**
 * The status API needs the remitter mobile, which the recheck path does not pass. Only open
 * txns are rechecked, so the status filter keeps this on the status index.
 */
export async function dmtRemitterMobileForTxn(clientRef: string): Promise<string | null> {
  const rows = await db
    .select({ metadata: transactions.metadata })
    .from(transactions)
    .where(
      and(
        inArray(transactions.status, ["initiated", "pending"]),
        or(eq(transactions.txnRef, clientRef), sql`${transactions.metadata} ->> 'providerClientRef' = ${clientRef}`),
      ),
    )
    .limit(2);
  if (rows.length !== 1) return null;
  const mobile = rows[0]!.metadata?.customerMobile;
  return typeof mobile === "string" && /^\d{10}$/.test(mobile) ? mobile : null;
}

export function requireSessionToken(retailerUserId: string, mobile: string, fallback?: string): string {
  if (fallback && fallback.length >= 8) {
    const bag = tokenBag.get(bagKey(retailerUserId, mobile));
    if (!bag || bag.expiresAt < Date.now()) {
      rememberDmtSession(retailerUserId, mobile, fallback);
      return fallback;
    }
  }
  return readBag(retailerUserId, mobile).sessionToken;
}

export function requireVerifyToken(retailerUserId: string, mobile: string): string {
  const bag = readBag(retailerUserId, mobile);
  if (!bag.verifyToken) {
    throw new HttpError(
      422,
      "Registration OTP was not started. Tap Register to send OTP again.",
      "NOBLE_DMT_VERIFY_TOKEN_MISSING",
    );
  }
  return bag.verifyToken;
}

export function requireAccessToken(retailerUserId: string, mobile: string, fallback?: string): string {
  const bag = readBag(retailerUserId, mobile);
  if (bag.accessToken) return bag.accessToken;
  if (fallback && fallback.length >= 8) return fallback;
  throw new HttpError(
    422,
    "Complete remitter OTP verification before this step.",
    "NOBLE_DMT_ACCESS_TOKEN_MISSING",
  );
}

export { nobleTxnId, firstResponseRow, nobleOk };
