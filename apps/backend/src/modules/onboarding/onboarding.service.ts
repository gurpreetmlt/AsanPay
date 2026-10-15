import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { env, isInstantPayAepsMode } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { encryptInstantPayAadhaar } from "../providers/instantpay/crypto";
import { instantPayPost, mapInstantPayStatus } from "../providers/instantpay/client";
import { parsePidDataXml } from "../providers/instantpay/pidXml";
import type {
  BioKycSubmitInput,
  MerchantListInput,
  MinKycSignupInput,
  MobileChangeInitiateInput,
  MobileChangeVerifyInput,
} from "./onboarding.validators";

export interface OutletProfile {
  outletId: string;
  name: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  pincode: string | null;
  state: string | null;
  districtName: string | null;
  address: string | null;
  /** true when InstantPay was actually called; false on non-InstantPay rails. */
  live: boolean;
}

/**
 * InstantPay Signup Min-KYC (POST /user/outlet/signup/minKyc) — registers the retailer as an
 * outlet and persists the returned outletId + business geo on the user row. Idempotent on the
 * provider side: InstantPay updates the profile if the outlet is already registered.
 * Non-InstantPay rails fabricate an outletId so the rest of the AEPS flow can be tested end-to-end.
 */
export async function signupMinKyc(
  userId: string,
  input: MinKycSignupInput,
  endpointIp: string,
): Promise<OutletProfile> {
  const [user] = await db
    .select({ mobile: users.mobile, instantpayOutletId: users.instantpayOutletId })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  const mobile = input.mobile;
  // InstantPay wants degrees with 4 decimals.
  const latitude = input.latitude.toFixed(4);
  const longitude = input.longitude.toFixed(4);

  let profile: OutletProfile;

  if (!isInstantPayAepsMode()) {
    profile = {
      outletId: user.instantpayOutletId?.startsWith("MOCK")
        ? user.instantpayOutletId
        : `MOCK${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      name: input.name,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      pincode: input.address.pincode,
      state: null,
      districtName: null,
      address: input.address.full,
      live: false,
    };
  } else {
    const res = await instantPayPost(
      "/user/outlet/signup/minKyc",
      {
        mobile,
        name: input.name,
        gender: input.gender,
        pan: input.pan,
        email: input.email,
        address: {
          full: input.address.full,
          city: input.address.city,
          pincode: input.address.pincode,
        },
        aadhaar: encryptInstantPayAadhaar(input.aadhaarNumber),
        dateOfBirth: input.dateOfBirth,
        latitude,
        longitude,
      },
      { endpointIp },
    );

    const data = (res.data && !Array.isArray(res.data) ? res.data : {}) as Record<string, unknown>;
    const outletId = data.outletId != null ? String(data.outletId) : "";
    if (mapInstantPayStatus(res) !== "success" || !outletId) {
      throw new HttpError(
        422,
        String(res.status ?? "InstantPay onboarding failed"),
        "INSTANTPAY_ONBOARDING_FAILED",
      );
    }

    profile = {
      outletId,
      name: (data.name as string | null) ?? null,
      dateOfBirth: (data.dateOfBirth as string | null) ?? null,
      gender: (data.gender as string | null) ?? null,
      pincode: (data.pincode as string | null) ?? null,
      state: (data.state as string | null) ?? null,
      districtName: (data.districtName as string | null) ?? null,
      address: (data.address as string | null) ?? null,
      live: true,
    };
  }

  await db
    .update(users)
    .set({
      instantpayOutletId: profile.outletId,
      outletLatitude: latitude,
      outletLongitude: longitude,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  logger.info(
    { userId, outletId: profile.outletId, mode: env.AEPS_PROVIDER_MODE },
    "InstantPay outlet onboarding saved",
  );
  return profile;
}

export interface BioKycStatus {
  /** ACTION-REQUIRED → run Merchant Biometric KYC; NO-ACTION-REQUIRED → already done. */
  action: "ACTION-REQUIRED" | "NO-ACTION-REQUIRED" | string;
  /** PENDING / APPROVAL_PENDING → poll again (30-min intervals); APPROVED → txn-eligible. */
  status: string;
  approved: boolean;
  /** Masked Aadhaar (e.g. XXXX-XXXX-9262). Empty → encryptedAadhaar mandatory in bio-KYC call. */
  outletAadhaarNumber: string | null;
  isFaceAuthAvailable: boolean;
  isBiometricKycMandatory: boolean;
  /** wadh for RD-service PidOptions during the eKYC capture. */
  pidOptionWadh: string | null;
  /** Pass-through key for the Merchant Biometric KYC call. */
  referenceKey: string | null;
  referenceKeyType: string | null;
  live: boolean;
}

/**
 * Merchant Biometric eKYC Status (POST /user/outlet/signup/biometricKycStatus).
 * spKey: DMI = DMT rail, WAP = AePS rail. Non-InstantPay rails report APPROVED so downstream
 * flows stay testable without InstantPay.
 */
export async function biometricKycStatus(
  userId: string,
  spKey: "DMI" | "WAP",
  endpointIp: string,
): Promise<BioKycStatus> {
  const [user] = await db
    .select({ instantpayOutletId: users.instantpayOutletId })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (!user.instantpayOutletId) {
    throw new HttpError(
      422,
      "Complete merchant onboarding (min-KYC signup) first",
      "INSTANTPAY_OUTLET_REQUIRED",
    );
  }

  if (!isInstantPayAepsMode()) {
    return {
      action: "NO-ACTION-REQUIRED",
      status: "APPROVED",
      approved: true,
      outletAadhaarNumber: "XXXX-XXXX-0000",
      isFaceAuthAvailable: false,
      isBiometricKycMandatory: false,
      pidOptionWadh: null,
      referenceKey: `MOCKKYC-${randomUUID().slice(0, 16)}`,
      referenceKeyType: "OutletBiometicKyc",
      live: false,
    };
  }

  // Docs show both "spKey" and "spkey" casings across examples — send both to be safe.
  const res = await instantPayPost(
    "/user/outlet/signup/biometricKycStatus",
    { spKey, spkey: spKey },
    { outletId: user.instantpayOutletId, endpointIp },
  );
  if (mapInstantPayStatus(res) !== "success") {
    throw new HttpError(
      422,
      String(res.status ?? "Biometric KYC status check failed"),
      "INSTANTPAY_BIOKYC_STATUS_FAILED",
    );
  }

  const data = (res.data && !Array.isArray(res.data) ? res.data : {}) as Record<string, unknown>;
  const status = String(data.status ?? "").toUpperCase();
  return {
    action: String(data.action ?? ""),
    status,
    approved: status === "APPROVED",
    outletAadhaarNumber:
      typeof data.outletAadhaarNumber === "string" && data.outletAadhaarNumber
        ? data.outletAadhaarNumber
        : null,
    isFaceAuthAvailable: Boolean(data.isFaceAuthAvailable),
    isBiometricKycMandatory: Boolean(data.isBiometricKycMandatory),
    pidOptionWadh: typeof data.pidOptionWadh === "string" ? data.pidOptionWadh : null,
    referenceKey: typeof data.referenceKey === "string" ? data.referenceKey : null,
    referenceKeyType: typeof data.referenceKeyType === "string" ? data.referenceKeyType : null,
    live: true,
  };
}

/**
 * Merchant Biometric KYC submit (POST /user/outlet/signup/biometricKyc) — merchant's own
 * Aadhaar fingerprint validated against UIDAI to activate the outlet on a rail.
 * The RD capture MUST embed the status API's `pidOptionWadh` (PidOptions wadh attribute).
 * After success, poll biometricKycStatus until APPROVED. Non-InstantPay rails short-circuit to success.
 */
export async function submitBiometricKyc(
  userId: string,
  input: BioKycSubmitInput,
  endpointIp: string,
): Promise<{ submitted: boolean; message: string; live: boolean }> {
  const [user] = await db
    .select({
      instantpayOutletId: users.instantpayOutletId,
      outletLatitude: users.outletLatitude,
      outletLongitude: users.outletLongitude,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (!user.instantpayOutletId) {
    throw new HttpError(
      422,
      "Complete merchant onboarding (min-KYC signup) first",
      "INSTANTPAY_OUTLET_REQUIRED",
    );
  }

  const latitude = input.latitude != null ? input.latitude.toFixed(4) : user.outletLatitude;
  const longitude = input.longitude != null ? input.longitude.toFixed(4) : user.outletLongitude;
  if (!latitude || !longitude) {
    throw new HttpError(422, "Latitude and longitude are required", "AEPS_GEO_REQUIRED");
  }

  if (!isInstantPayAepsMode()) {
    return { submitted: true, message: "Biometric KYC not required on the PaySprint rail", live: false };
  }

  // encryptedAadhaar mandatory only when the status API returned an empty outletAadhaarNumber.
  const encryptedAadhaar = input.aadhaarNumber ? encryptInstantPayAadhaar(input.aadhaarNumber) : "";
  const externalRef = `BK-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const res = await instantPayPost(
    "/user/outlet/signup/biometricKyc",
    {
      referenceKey: input.referenceKey,
      latitude,
      longitude,
      externalRef,
      captureType: "FINGER",
      biometricData: parsePidDataXml(input.biometricPayload, encryptedAadhaar),
    },
    { outletId: user.instantpayOutletId, endpointIp },
  );
  if (mapInstantPayStatus(res) !== "success") {
    throw new HttpError(
      422,
      String(res.status ?? "Biometric KYC failed"),
      "INSTANTPAY_BIOKYC_FAILED",
    );
  }

  logger.info({ userId, outletId: user.instantpayOutletId, externalRef }, "InstantPay biometric KYC submitted");
  return { submitted: true, message: String(res.status ?? "Success"), live: true };
}

/**
 * Outlet Mobile Change Initiate (POST /user/outlet/v2/mobileUpdate) — InstantPay sends OTPs to
 * BOTH the existing and the new number; a verify call completes the change. This updates the
 * merchant's InstantPay profile only — our own users.mobile stays untouched.
 */
export async function mobileChangeInitiate(
  userId: string,
  input: MobileChangeInitiateInput,
  endpointIp: string,
): Promise<{
  existing: string;
  new: string;
  /** Pass both into the mobile-change verify call along with the OTP. */
  otpReferenceID: string | null;
  hash: string | null;
  message: string;
  live: boolean;
}> {
  const [user] = await db
    .select({
      mobile: users.mobile,
      instantpayOutletId: users.instantpayOutletId,
      outletLatitude: users.outletLatitude,
      outletLongitude: users.outletLongitude,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (!user.instantpayOutletId) {
    throw new HttpError(
      422,
      "Complete merchant onboarding (min-KYC signup) first",
      "INSTANTPAY_OUTLET_REQUIRED",
    );
  }

  const existingMobileNumber = input.existingMobileNumber ?? user.mobile;
  if (existingMobileNumber === input.newMobileNumber) {
    throw new HttpError(400, "New mobile number is same as the existing one", "MOBILE_UNCHANGED");
  }
  const latitude = input.latitude != null ? input.latitude.toFixed(4) : user.outletLatitude;
  const longitude = input.longitude != null ? input.longitude.toFixed(4) : user.outletLongitude;
  if (!latitude || !longitude) {
    throw new HttpError(422, "Latitude and longitude are required", "AEPS_GEO_REQUIRED");
  }

  if (!isInstantPayAepsMode()) {
    const mask = (m: string) => `OTP send on ********${m.slice(-2)}`;
    return {
      existing: mask(existingMobileNumber),
      new: mask(input.newMobileNumber),
      otpReferenceID: `MOCKREF-${randomUUID().slice(0, 12)}`,
      hash: `MOCKHASH-${randomUUID().slice(0, 12)}`,
      message: "Mobile change OTPs are not required on the PaySprint rail",
      live: false,
    };
  }

  const res = await instantPayPost(
    "/user/outlet/v2/mobileUpdate",
    {
      existingMobileNumber,
      newMobileNumber: input.newMobileNumber,
      aadhaar: encryptInstantPayAadhaar(input.aadhaarNumber),
      latitude,
      longitude,
    },
    { endpointIp },
  );
  if (mapInstantPayStatus(res) !== "success") {
    throw new HttpError(
      422,
      String(res.status ?? "Mobile change request failed"),
      "INSTANTPAY_MOBILE_CHANGE_FAILED",
    );
  }

  const data = (res.data && !Array.isArray(res.data) ? res.data : {}) as Record<string, unknown>;
  logger.info({ userId, outletId: user.instantpayOutletId }, "InstantPay outlet mobile change initiated");
  return {
    existing: String(data.existing ?? ""),
    new: String(data.new ?? ""),
    otpReferenceID: typeof data.otpReferenceID === "string" ? data.otpReferenceID : null,
    hash: typeof data.hash === "string" ? data.hash : null,
    message: String(res.status ?? "OTP sent"),
    live: true,
  };
}

/**
 * Outlet Mobile Change Validate (POST /user/outlet/v2/mobileUpdateVerify) — completes the
 * change with the OTP + otpReferenceID/hash from the initiate response. Provider-side only.
 */
export async function mobileChangeVerify(
  userId: string,
  input: MobileChangeVerifyInput,
  endpointIp: string,
): Promise<{ changed: boolean; message: string; live: boolean }> {
  if (!isInstantPayAepsMode()) {
    return { changed: true, message: "Mobile number changed (no provider update needed on the PaySprint rail)", live: false };
  }

  const res = await instantPayPost(
    "/user/outlet/v2/mobileUpdateVerify",
    {
      otpReferenceID: input.otpReferenceID,
      otp: input.otp,
      hash: input.hash,
    },
    { endpointIp },
  );
  if (mapInstantPayStatus(res) !== "success") {
    throw new HttpError(
      422,
      String(res.status ?? "Mobile change verification failed"),
      "INSTANTPAY_MOBILE_CHANGE_VERIFY_FAILED",
    );
  }

  logger.info({ userId }, "InstantPay outlet mobile change verified");
  return { changed: true, message: String(res.status ?? "Mobile Number successfully changed"), live: true };
}

export interface MerchantListEntry {
  outletId: number | string;
  name: string;
  mobile: string;
  email: string;
  pan: string;
  kycStatus: boolean;
  isActive: boolean;
  latitude: string;
  longitude: string;
  /** true = bank-enabled for AePS; false/null = still pending at the bank end. */
  wapStatus: boolean | null;
}

export interface MerchantListResult {
  meta: {
    totalPages: number;
    currentPage: number;
    totalRecords: number;
    recordsOnCurrentPage: number;
  };
  records: MerchantListEntry[];
  live: boolean;
}

/**
 * Merchant List (POST /user/outlet/list) — partner-wide directory of onboarded outlets. This is
 * a client-level (not outlet-level) call, so no outlet header. Admin-only in our app.
 */
export async function merchantList(
  input: MerchantListInput,
  endpointIp: string,
): Promise<MerchantListResult> {
  if (!isInstantPayAepsMode()) {
    // Reflect locally-onboarded merchants so the admin list works on non-InstantPay rails too.
    const rows = await db
      .select({
        instantpayOutletId: users.instantpayOutletId,
        name: users.name,
        mobile: users.mobile,
        email: users.email,
        outletLatitude: users.outletLatitude,
        outletLongitude: users.outletLongitude,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.role, "retailer"));
    const onboarded = rows.filter((r) => r.instantpayOutletId);
    return {
      meta: {
        totalPages: 1,
        currentPage: 1,
        totalRecords: onboarded.length,
        recordsOnCurrentPage: onboarded.length,
      },
      records: onboarded.map((r) => ({
        outletId: r.instantpayOutletId ?? "",
        name: r.name,
        mobile: r.mobile,
        email: r.email ?? "",
        pan: "",
        kycStatus: true,
        isActive: r.isActive,
        latitude: r.outletLatitude ?? "",
        longitude: r.outletLongitude ?? "",
        wapStatus: true,
      })),
      live: false,
    };
  }

  const res = await instantPayPost(
    "/user/outlet/list",
    {
      pagination: { pageNumber: input.pageNumber, recordsPerPage: String(input.recordsPerPage) },
      filters: {
        outletId: input.outletId ?? 0,
        mobile: input.mobile ?? "",
        pan: input.pan ?? "",
      },
    },
    { endpointIp },
  );
  if (mapInstantPayStatus(res) !== "success") {
    throw new HttpError(422, String(res.status ?? "Merchant list failed"), "INSTANTPAY_MERCHANT_LIST_FAILED");
  }

  const data = (res.data && !Array.isArray(res.data) ? res.data : {}) as Record<string, unknown>;
  const meta = (data.meta && typeof data.meta === "object" ? data.meta : {}) as Record<string, unknown>;
  const records = Array.isArray(data.records) ? (data.records as Record<string, unknown>[]) : [];
  return {
    meta: {
      totalPages: Number(meta.totalPages ?? 1),
      currentPage: Number(meta.currentPage ?? input.pageNumber),
      totalRecords: Number(meta.totalRecords ?? records.length),
      recordsOnCurrentPage: Number(meta.recordsOnCurrentPage ?? records.length),
    },
    records: records.map((r) => {
      const products = (r.products && typeof r.products === "object" ? r.products : {}) as Record<string, unknown>;
      return {
        outletId: (r.outletId as number | string) ?? "",
        name: String(r.name ?? ""),
        mobile: String(r.mobile ?? ""),
        email: String(r.email ?? ""),
        pan: String(r.pan ?? ""),
        kycStatus: Boolean(r.KYCStatus),
        isActive: Boolean(r.isActive),
        latitude: String(r.Latitude ?? ""),
        longitude: String(r.Longitude ?? ""),
        wapStatus: products.wapStatus == null ? null : Boolean(products.wapStatus),
      };
    }),
    live: true,
  };
}

export async function getOnboardingStatus(userId: string): Promise<{
  onboarded: boolean;
  outletId: string | null;
  latitude: string | null;
  longitude: string | null;
  mode: string;
}> {
  const [user] = await db
    .select({
      instantpayOutletId: users.instantpayOutletId,
      outletLatitude: users.outletLatitude,
      outletLongitude: users.outletLongitude,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  return {
    onboarded: Boolean(user.instantpayOutletId),
    outletId: user.instantpayOutletId,
    latitude: user.outletLatitude,
    longitude: user.outletLongitude,
    mode: env.AEPS_PROVIDER_MODE,
  };
}
