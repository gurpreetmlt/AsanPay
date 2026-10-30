import { createHash } from "node:crypto";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { isNobleConfigured } from "../../../config/env";
import { db } from "../../../db/postgres";
import { providerSessions, transactions, users } from "../../../db/postgres/schema";
import { decryptPII, encryptPII } from "../../../utils/aes";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import { firstResponseRow, nobleOk, nobleTxnId } from "./aepsOps";
import { noblePost, type NobleApiResponse } from "./client";

/**
 * Session tokens for the Airtel DMT multi-step flow (profile → register → verify → kyc → txn).
 * Stored encrypted in provider_sessions so a restart or a second API instance keeps the flow alive;
 * the in-process map is only a read cache.
 */
type DmtTokenBag = {
  sessionToken: string;
  verifyToken?: string;
  accessToken?: string;
  expiresAt: number;
};

type StoredBag = { expiresAt: number };

const tokenBag = new Map<string, StoredBag>();
const TTL_MS = 55 * 60 * 1000;
const BAG_CACHE_MAX = 5000;

/** Airtel keys stay unprefixed so sessions open across a deploy keep working; other rails prefix theirs. */
function bagKey(retailerUserId: string, mobile: string): string {
  return `${retailerUserId}:${mobile}`;
}

/** provider_sessions.provider_code is varchar(40): `dmt:` + 32 hex chars. */
function bagRowKey(key: string): string {
  return `dmt:${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
}

function cacheBag(key: string, bag: StoredBag): void {
  if (!tokenBag.has(key) && tokenBag.size >= BAG_CACHE_MAX) {
    const oldest = tokenBag.keys().next().value;
    if (oldest !== undefined) tokenBag.delete(oldest);
  }
  tokenBag.set(key, bag);
}

async function loadBag<T extends StoredBag = DmtTokenBag>(key: string): Promise<T | null> {
  const hit = tokenBag.get(key);
  if (hit && hit.expiresAt >= Date.now()) return hit as T;
  try {
    const [row] = await db
      .select({ tokenEncrypted: providerSessions.tokenEncrypted, expiresAt: providerSessions.expiresAt })
      .from(providerSessions)
      .where(eq(providerSessions.providerCode, bagRowKey(key)))
      .limit(1);
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    const bag = JSON.parse(decryptPII(row.tokenEncrypted)) as T;
    cacheBag(key, bag);
    return bag;
  } catch (err) {
    logger.warn({ err }, "DMT session read failed");
    return null;
  }
}

async function saveBag<T extends StoredBag>(key: string, bag: T): Promise<void> {
  cacheBag(key, bag);
  const values = {
    tokenEncrypted: encryptPII(JSON.stringify(bag)),
    expiresAt: new Date(bag.expiresAt),
    obtainedAt: new Date(),
    obtainedBy: "api",
  };
  await db
    .insert(providerSessions)
    .values({ providerCode: bagRowKey(key), ...values })
    .onConflictDoUpdate({ target: providerSessions.providerCode, set: values });
  if (Math.random() < 0.05) {
    await db
      .delete(providerSessions)
      .where(and(sql`${providerSessions.providerCode} like 'dmt:%'`, lt(providerSessions.expiresAt, new Date())));
  }
}

/** Flow state for rails other than Airtel, in the same encrypted store (key = rail + retailer + mobile). */
export async function loadRailFlowState<T extends object>(
  rail: string,
  retailerUserId: string,
  mobile: string,
): Promise<T | null> {
  return loadBag<T & StoredBag>(`${rail}:${bagKey(retailerUserId, mobile)}`);
}

export async function saveRailFlowState<T extends object>(
  rail: string,
  retailerUserId: string,
  mobile: string,
  state: T,
): Promise<void> {
  await saveBag(`${rail}:${bagKey(retailerUserId, mobile)}`, { ...state, expiresAt: Date.now() + TTL_MS });
}

export async function rememberDmtSession(retailerUserId: string, mobile: string, sessionToken: string): Promise<void> {
  await saveBag(bagKey(retailerUserId, mobile), { sessionToken, expiresAt: Date.now() + TTL_MS });
}

export async function rememberDmtVerifyToken(
  retailerUserId: string,
  mobile: string,
  verifyToken: string,
): Promise<void> {
  const key = bagKey(retailerUserId, mobile);
  const prev = await loadBag(key);
  await saveBag(key, {
    sessionToken: prev?.sessionToken ?? verifyToken,
    verifyToken,
    accessToken: prev?.accessToken,
    expiresAt: Date.now() + TTL_MS,
  });
}

export async function rememberDmtAccessToken(
  retailerUserId: string,
  mobile: string,
  accessToken: string,
): Promise<void> {
  const key = bagKey(retailerUserId, mobile);
  const prev = await loadBag(key);
  await saveBag(key, {
    sessionToken: prev?.sessionToken ?? accessToken,
    verifyToken: prev?.verifyToken,
    accessToken,
    expiresAt: Date.now() + TTL_MS,
  });
}

async function readBag(retailerUserId: string, mobile: string): Promise<DmtTokenBag> {
  const bag = await loadBag(bagKey(retailerUserId, mobile));
  if (!bag) {
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
  if (token) await rememberDmtSession(retailerUserId, customerMobile, token);
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
 * The status API needs the remitter mobile and the rail, which the recheck path does not pass.
 * Only open txns are rechecked, so the status filter keeps this on the status index.
 */
export async function dmtRemitterForTxn(clientRef: string): Promise<{ mobile: string; rail: string } | null> {
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
  const meta = rows[0]!.metadata;
  const mobile = meta?.customerMobile;
  if (typeof mobile !== "string" || !/^\d{10}$/.test(mobile)) return null;
  // Transfers from before rails existed carry no dmtRail; they all went through Airtel.
  return { mobile, rail: typeof meta?.dmtRail === "string" ? meta.dmtRail : "airtel" };
}

export async function requireSessionToken(
  retailerUserId: string,
  mobile: string,
  fallback?: string,
): Promise<string> {
  if (fallback && fallback.length >= 8) {
    const bag = await loadBag(bagKey(retailerUserId, mobile));
    if (!bag) {
      await rememberDmtSession(retailerUserId, mobile, fallback);
      return fallback;
    }
  }
  return (await readBag(retailerUserId, mobile)).sessionToken;
}

export async function requireVerifyToken(retailerUserId: string, mobile: string): Promise<string> {
  const bag = await readBag(retailerUserId, mobile);
  if (!bag.verifyToken) {
    throw new HttpError(
      422,
      "Registration OTP was not started. Tap Register to send OTP again.",
      "NOBLE_DMT_VERIFY_TOKEN_MISSING",
    );
  }
  return bag.verifyToken;
}

export async function requireAccessToken(
  retailerUserId: string,
  mobile: string,
  fallback?: string,
): Promise<string> {
  const bag = await readBag(retailerUserId, mobile);
  if (bag.accessToken) return bag.accessToken;
  if (fallback && fallback.length >= 8) return fallback;
  throw new HttpError(
    422,
    "Complete remitter OTP verification before this step.",
    "NOBLE_DMT_ACCESS_TOKEN_MISSING",
  );
}

export { nobleTxnId, firstResponseRow, nobleOk };
