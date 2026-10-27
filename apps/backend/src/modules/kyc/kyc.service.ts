import { eq } from "drizzle-orm";
import { isAepsOnboardingRequired, isUsableNobleAgentId } from "../../config/env";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { decryptPII, encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { findLatestAuditLog, insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { kycSubmittedEmailTemplate, notifyUserEmail } from "../../utils/mailer";
import type { AuthUser } from "@asanpay/shared-types";
import { bankNameMatch, formatPanName, isFundRequestEnabled } from "@asanpay/shared-types";
import type { HomeLocationInput, KycSubmitInput } from "../auth/auth.validators";
import { autoCropCard, type CardCropResult } from "./docCheck/cardCrop";
import {
  KYC_DOC_KEY_TO_SLOT,
  KYC_DOC_MAX_BYTES,
  loadKycPhotoBytes,
  parseKycDataUrl,
  metaDataUrlKey,
  metaFileNameKey,
  metaPublicPathKey,
  saveKycDocumentDataUrl,
  type KycDocSlot,
} from "./kycDocuments.service";
import {
  checkKycDocument,
  DOC_CHECK_SLOTS,
  toStoredDocCheck,
  type StoredDocCheck,
} from "./docCheck/docCheck.service";
import {
  getKycVerificationView,
  recordKycVerification,
  type KycVerificationView,
} from "./kycVerification.service";
import {
  GEO_LINK_MAX_ACCURACY_M,
  SIGNUP_GEO_LOW_ACCURACY_MESSAGE,
  markGeoLinkUsed,
  readSignupGeoLink,
  type SignupGeoPurpose,
} from "../geoLink/geoLink.service";
import { evaluateShopPincodeSignal, recordRootedDeviceSignal } from "../risk/riskSignal.service";
import { haversineKm } from "../../core/geo";
import { logger } from "../../utils/logger";

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    uid: row.uid,
    role: row.role,
    name: row.name,
    mobile: row.mobile,
    email: row.email ?? null,
    emailVerifiedAt: row.emailVerifiedAt ? row.emailVerifiedAt.toISOString() : null,
    emailMarketingOptIn: Boolean(row.emailMarketingOptIn),
    parentId: row.parentId,
    kycStatus: row.kycStatus,
    isActive: row.isActive,
    hasKycDocs: Boolean(row.panNumberEncrypted && row.aadhaarNumberEncrypted),
    hasNobleAgent: isUsableNobleAgentId(row.nobleUniqueAgentId),
    aepsOnboardingRequired: isAepsOnboardingRequired(row.role, row.nobleUniqueAgentId),
    hasTxnPin: Boolean(row.txnPinHash),
    hasLoginMpin: Boolean(row.loginMpinHash),
    telegramLinked: Boolean(row.telegramChatId),
    fundRequestEnabled: isFundRequestEnabled(row.role, row.fundRequestEnabled),
  };
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function maskPan(pan: string) {
  if (pan.length < 6) return "••••••••••";
  return `${pan.slice(0, 5)}****${pan.slice(-1)}`;
}

function maskAadhaar(aadhaar: string) {
  const digits = aadhaar.replace(/\D/g, "");
  if (digits.length < 4) return "XXXX XXXX XXXX";
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function maskAccount(account: string) {
  const digits = account.replace(/\s/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

/** Agent self-view: masked KYC details after signup submit (Settings → KYC). */
export type MyKycProfile = {
  kycStatus: AuthUser["kycStatus"];
  hasKycDocs: boolean;
  submittedAt: string | null;
  uid: string;
  mobile: string;
  fullName: string | null;
  email: string | null;
  dob: string | null;
  anniversaryDate: string | null;
  gender: string | null;
  fatherName: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  aadhaarMasked: string | null;
  panMasked: string | null;
  bankAccountName: string | null;
  bankAccountMasked: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  bankBranch: string | null;
  businessName: string | null;
  businessType: string | null;
  cancelledChequeFileName: string | null;
  /** When the home location was saved (null = not set; services then work only near the shop). */
  homeLocationAt: string | null;
  /** PAN / Aadhaar / photo / cross-check statuses — no numbers. */
  verification: KycVerificationView;
};

export async function getMyKycProfile(userId: string): Promise<MyKycProfile> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.isActive) {
    throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  }

  let panMasked: string | null = null;
  let aadhaarMasked: string | null = null;
  try {
    if (user.panNumberEncrypted) {
      const pan = decryptPII(user.panNumberEncrypted).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) panMasked = maskPan(pan);
    }
    if (user.aadhaarNumberEncrypted) {
      const digits = decryptPII(user.aadhaarNumberEncrypted).replace(/\D/g, "");
      if (/^\d{12}$/.test(digits)) aadhaarMasked = maskAadhaar(digits);
    }
  } catch {
    panMasked = null;
    aadhaarMasked = null;
  }
  const hasDocs = Boolean(panMasked && aadhaarMasked);

  const [audit, verification] = await Promise.all([
    findLatestAuditLog({ userId, action: "kyc.submit" }),
    getKycVerificationView(userId),
  ]);
  const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
  const accountRaw = metaString(meta, "bankAccountNumber");

  return {
    kycStatus: user.kycStatus,
    hasKycDocs: hasDocs,
    submittedAt: audit?.createdAt ? audit.createdAt.toISOString() : null,
    uid: user.uid,
    mobile: user.mobile,
    fullName: user.name || null,
    email: user.email ?? null,
    dob: metaString(meta, "dob"),
    anniversaryDate: metaString(meta, "anniversaryDate"),
    gender: metaString(meta, "gender"),
    fatherName: metaString(meta, "fatherName"),
    address: metaString(meta, "address"),
    city: metaString(meta, "city") || metaString(meta, "district"),
    district: metaString(meta, "district"),
    state: metaString(meta, "state"),
    pincode: metaString(meta, "pincode"),
    aadhaarMasked,
    panMasked,
    homeLocationAt: user.homeLocationAt ? user.homeLocationAt.toISOString() : null,
    bankAccountName: metaString(meta, "bankAccountName"),
    bankAccountMasked: accountRaw ? maskAccount(accountRaw) : null,
    bankIfsc: metaString(meta, "bankIfsc"),
    bankName: metaString(meta, "bankName"),
    bankBranch: metaString(meta, "bankBranch"),
    businessName: metaString(meta, "businessName"),
    businessType: metaString(meta, "businessType"),
    cancelledChequeFileName: metaString(meta, "cancelledChequeFileName"),
    verification,
  };
}

/** Signed-in agent's own KYC photo. There is no user id input, so it can only ever return the caller's file. */
export async function getMyKycDocument(
  userId: string,
  docKey: string,
): Promise<{ contentType: string; buffer: Buffer }> {
  const slot = KYC_DOC_KEY_TO_SLOT[docKey];
  if (!slot) {
    throw new HttpError(404, "KYC document not found", "KYC_DOC_NOT_FOUND");
  }
  const audit = await findLatestAuditLog({ userId, action: "kyc.submit" });
  const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
  const loaded = await loadKycPhotoBytes(meta, slot);
  if (!loaded) {
    throw new HttpError(
      404,
      "This KYC photo is not on file. Re-submit KYC with the photo attached.",
      "KYC_PHOTO_MISSING",
    );
  }
  return loaded;
}

const AUTO_CROP_TIMEOUT_MS = 15_000;

/** Card-only, upright JPEG for the agent to confirm. Never throws for cropper problems — `detected: false` instead. */
export async function autoCropKycPhoto(
  dataUrl: string,
  timeoutMs = AUTO_CROP_TIMEOUT_MS,
): Promise<{ dataUrl: string; detected: boolean; method: CardCropResult["method"] }> {
  const parsed = parseKycDataUrl(dataUrl);
  if (!parsed) throw new HttpError(422, "Upload a JPG, PNG, WEBP, or HEIC image", "INVALID_IMAGE_UPLOAD");
  if (parsed.buffer.length > KYC_DOC_MAX_BYTES) throw new HttpError(422, "Image must be under 1.5 MB", "IMAGE_TOO_LARGE");

  const fallback = { dataUrl, detected: false, method: "none" as const };
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const result = await Promise.race([autoCropCard(parsed.buffer).catch(() => null), timeout]);
    if (!result?.detected) return fallback;
    return {
      dataUrl: `data:image/jpeg;base64,${result.image.toString("base64")}`,
      detected: true,
      method: result.method,
    };
  } finally {
    clearTimeout(timer);
  }
}

const DOC_CHECK_LABEL: Record<(typeof DOC_CHECK_SLOTS)[number], string> = {
  panImage: "PAN card photo",
  aadhaarFront: "Aadhaar front photo",
  aadhaarBack: "Aadhaar back photo",
};

function docDataUrl(input: KycSubmitInput, slot: (typeof DOC_CHECK_SLOTS)[number]): string | null {
  const raw = (
    slot === "panImage"
      ? input.panImageDataUrl
      : slot === "aadhaarFront"
        ? input.aadhaarFrontDataUrl
        : input.aadhaarBackDataUrl
  )?.trim();
  return raw && raw.startsWith("data:image") ? raw : null;
}

/** Name from the provider when this PAN was verified — the account name must match the PAN card. */
async function verifiedPanName(userId: string, panNumber: string): Promise<string | null> {
  const audit = await findLatestAuditLog({ userId, action: "kyc.pan_verified" });
  const meta = audit?.metadata;
  const fullName = typeof meta?.fullName === "string" ? meta.fullName.trim() : "";
  if (!fullName || typeof meta?.panEncrypted !== "string") return null;
  let verifiedPan: string;
  try {
    verifiedPan = decryptPII(meta.panEncrypted).toUpperCase().replace(/[^A-Z0-9]/g, "");
  } catch {
    return null;
  }
  const submitted = panNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return verifiedPan === submitted ? formatPanName(fullName) : null;
}

type SignupGeoFix = {
  latitude: string;
  longitude: string;
  accuracyMeters: number | null;
  source: "phone_qr" | "device";
  geoLinkId: string | null;
};

/**
 * Home location added after signup (agent signed up at the shop). Set once by the agent: letting them
 * re-capture "home" anywhere would move the 5 km service zone, so a change goes through support.
 */
export async function saveHomeLocation(userId: string, input: HomeLocationInput): Promise<{ homeLocationAt: string }> {
  const [user] = await db
    .select({
      isActive: users.isActive,
      homeLocationAt: users.homeLocationAt,
      outletLatitude: users.outletLatitude,
      outletLongitude: users.outletLongitude,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || !user.isActive) throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  if (user.homeLocationAt) {
    throw new HttpError(
      409,
      "Your home location is already saved. Contact support to change it.",
      "HOME_LOCATION_ALREADY_SET",
    );
  }

  const fix = await resolveSignupGeoFix(userId, "home", input.geoLinkToken, input.location);
  if (!fix) throw new HttpError(422, "Capture your home location first", "HOME_LOCATION_REQUIRED");

  const savedAt = new Date();
  await db
    .update(users)
    .set({ homeLatitude: fix.latitude, homeLongitude: fix.longitude, homeLocationAt: savedAt, updatedAt: savedAt })
    .where(eq(users.id, userId));
  if (fix.geoLinkId) await markGeoLinkUsed(fix.geoLinkId);
  if (input.location?.isRooted) {
    void recordRootedDeviceSignal(userId, ["home"]).catch((err: unknown) =>
      logger.error({ err, userId }, "rooted device risk signal failed"),
    );
  }

  const homeToShopKm =
    user.outletLatitude && user.outletLongitude
      ? Number(
          haversineKm(
            Number(user.outletLatitude),
            Number(user.outletLongitude),
            Number(fix.latitude),
            Number(fix.longitude),
          ).toFixed(2),
        )
      : null;
  await insertAuditLog({
    userId,
    action: "kyc.home_location_set",
    entityType: "user",
    entityId: userId,
    metadata: {
      latitude: fix.latitude,
      longitude: fix.longitude,
      source: fix.source,
      accuracyMeters: fix.accuracyMeters,
      homeToShopKm,
    },
  });

  return { homeLocationAt: savedAt.toISOString() };
}

/** Shop / home point from a web phone-QR token (server-stored fix) or the app's device GPS. */
async function resolveSignupGeoFix(
  userId: string,
  purpose: SignupGeoPurpose,
  token: string | undefined,
  device: KycSubmitInput["shopLocation"],
): Promise<SignupGeoFix | null> {
  if (token) {
    const link = await readSignupGeoLink(userId, token, purpose);
    return {
      latitude: link.latitude,
      longitude: link.longitude,
      accuracyMeters: link.accuracyMeters,
      source: "phone_qr",
      geoLinkId: link.id,
    };
  }
  if (!device) return null;
  const label = purpose === "shop" ? "shop" : "home";
  if (device.isMockLocation) {
    throw new HttpError(
      422,
      `Turn off mock / fake location apps on your phone, then fetch the ${label} location again.`,
      "GEO_MOCK_LOCATION",
    );
  }
  const accuracy = device.accuracyMeters != null ? Math.round(device.accuracyMeters) : null;
  if (accuracy == null || accuracy > GEO_LINK_MAX_ACCURACY_M) {
    throw new HttpError(422, SIGNUP_GEO_LOW_ACCURACY_MESSAGE, "GEO_LOW_ACCURACY");
  }
  return {
    latitude: device.latitude.toFixed(6),
    longitude: device.longitude.toFixed(6),
    accuracyMeters: accuracy,
    source: "device",
    geoLinkId: null,
  };
}

/** Stores KYC PII encrypted. Status stays pending until admin verifies (Task 18). */
/** Free BestAPI check of the signup bank — usually a cache hit from POST /kyc/bank-check. Warn only, never blocks. */
async function signupBankCheckMeta(
  userId: string,
  accountNumber: string | undefined,
  ifsc: string | undefined,
  nameToMatch: string,
): Promise<{ bankCheckStatus: string | null; bankNameAsPerBank: string | null; bankNameMatchPercent: number | null }> {
  if (!accountNumber || !ifsc) return { bankCheckStatus: null, bankNameAsPerBank: null, bankNameMatchPercent: null };
  try {
    const { verifyBankAccount } = await import("../transactions/bankNameCheck.service");
    const v = await verifyBankAccount({ userId, accountNumber, ifsc, purpose: "signup_bank", bestApiOnly: true });
    return {
      bankCheckStatus: v.status,
      bankNameAsPerBank: v.bankName,
      bankNameMatchPercent: v.bankName && nameToMatch ? bankNameMatch(nameToMatch, v.bankName).percent : null,
    };
  } catch (err) {
    logger.warn({ err, userId }, "signup bank check failed");
    return { bankCheckStatus: "error", bankNameAsPerBank: null, bankNameMatchPercent: null };
  }
}

export async function submitKyc(userId: string, input: KycSubmitInput): Promise<AuthUser> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.isActive) {
    throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  }
  if (user.kycStatus === "verified") {
    throw new HttpError(409, "KYC is already verified", "KYC_ALREADY_VERIFIED");
  }

  const shopFix = await resolveSignupGeoFix(userId, "shop", input.shopGeoLinkToken, input.shopLocation);
  const homeFix = await resolveSignupGeoFix(userId, "home", input.homeGeoLinkToken, input.homeLocation);

  // Decisive photo checks run here on the server, before anything is saved — the app's own
  // check only guides the agent and can be bypassed. Usually a cache hit from
  // POST /documents/check; otherwise capped at 20 s per photo.
  const docChecks: Partial<Record<(typeof DOC_CHECK_SLOTS)[number], StoredDocCheck>> = {};
  const checkHints = {
    dob: input.dob,
    gender: input.gender,
    aadhaarLast4: input.aadhaarNumber.replace(/\D/g, "").slice(-4),
    pan: input.panNumber,
  };
  await Promise.all(
    DOC_CHECK_SLOTS.map(async (slot) => {
      const raw = docDataUrl(input, slot);
      if (!raw) {
        throw new HttpError(422, `Upload ${DOC_CHECK_LABEL[slot]} to submit KYC`, "KYC_DOC_PHOTO_REQUIRED");
      }
      const result = await checkKycDocument(userId, slot, raw, checkHints).catch((err) => {
        if (err instanceof HttpError) throw err;
        return null;
      });
      if (result) docChecks[slot] = toStoredDocCheck(result);
    }),
  );
  const statusCtx = { actorId: userId, source: "submit" as const };
  const failedSlot = DOC_CHECK_SLOTS.find((slot) => docChecks[slot]?.status === "fail");
  if (failedSlot) {
    const message = `${DOC_CHECK_LABEL[failedSlot]}: ${docChecks[failedSlot]!.message}`;
    await recordKycVerification(userId, { slots: docChecks }, { ...statusCtx, reason: message });
    throw new HttpError(422, message, "KYC_DOC_CHECK_FAILED");
  }

  const latitude =
    shopFix?.latitude ||
    input.shopPhotoLatitude?.trim() ||
    input.latitude?.trim() ||
    user.outletLatitude ||
    null;
  const longitude =
    shopFix?.longitude ||
    input.shopPhotoLongitude?.trim() ||
    input.longitude?.trim() ||
    user.outletLongitude ||
    null;

  const panName = await verifiedPanName(userId, input.panNumber);
  const bankCheckMeta = await signupBankCheckMeta(
    userId,
    input.bankAccountNumber,
    input.bankIfsc,
    panName ?? (input.fullName?.trim() || user.name || ""),
  );

  const [updated] = await db
    .update(users)
    .set({
      name: panName ?? (input.fullName?.trim() || user.name),
      email: input.email ?? user.email,
      panNumberEncrypted: encryptPII(input.panNumber.toUpperCase()),
      aadhaarNumberEncrypted: encryptPII(input.aadhaarNumber),
      kycStatus: "pending",
      ...(latitude && longitude
        ? { outletLatitude: latitude, outletLongitude: longitude }
        : {}),
      ...(homeFix
        ? { homeLatitude: homeFix.latitude, homeLongitude: homeFix.longitude, homeLocationAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw new HttpError(500, "Failed to save KYC");

  for (const fix of [shopFix, homeFix]) {
    if (fix?.geoLinkId) await markGeoLinkUsed(fix.geoLinkId);
  }
  if (shopFix) {
    void evaluateShopPincodeSignal(userId, shopFix, input.businessPincode ?? input.pincode).catch((err: unknown) =>
      logger.error({ err, userId }, "shop pincode risk signal failed"),
    );
  }
  const rootedOn = [
    input.shopLocation?.isRooted ? "shop" : null,
    input.homeLocation?.isRooted ? "home" : null,
  ].filter((p): p is string => p != null);
  if (rootedOn.length) {
    void recordRootedDeviceSignal(userId, rootedOn).catch((err: unknown) =>
      logger.error({ err, userId }, "rooted device risk signal failed"),
    );
  }
  const homeToShopKm =
    shopFix && homeFix
      ? Number(
          haversineKm(
            Number(shopFix.latitude),
            Number(shopFix.longitude),
            Number(homeFix.latitude),
            Number(homeFix.longitude),
          ).toFixed(2),
        )
      : null;

  const docMeta: Record<string, string | null> = {
    cancelledChequeFileName: input.cancelledChequeFileName ?? null,
    panImageFileName: input.panImageFileName ?? null,
    aadhaarFrontFileName: input.aadhaarFrontFileName ?? null,
    aadhaarBackFileName: input.aadhaarBackFileName ?? null,
    personalPhotoFileName: input.personalPhotoFileName ?? null,
    shopPhotoFileName: input.shopPhotoFileName ?? null,
  };

  const dataUrlInputs: Partial<Record<KycDocSlot, string | undefined>> = {
    panImage: input.panImageDataUrl,
    aadhaarFront: input.aadhaarFrontDataUrl,
    aadhaarBack: input.aadhaarBackDataUrl,
    cancelledCheque: input.cancelledChequeDataUrl,
    personalPhoto: input.personalPhotoDataUrl,
    shopPhoto: input.shopPhotoDataUrl,
  };

  for (const slot of Object.keys(dataUrlInputs) as KycDocSlot[]) {
    const raw = dataUrlInputs[slot]?.trim();
    if (!raw || !raw.startsWith("data:image")) continue;
    try {
      const saved = await saveKycDocumentDataUrl(userId, slot, raw);
      docMeta[metaFileNameKey(slot)] = saved.fileName;
      docMeta[metaDataUrlKey(slot)] = saved.dataUrl;
      docMeta[metaPublicPathKey(slot)] = saved.storagePath;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(422, `Could not save ${slot} image`, "KYC_IMAGE_SAVE_FAILED");
    }
  }

  await insertAuditLog({
    userId,
    action: "kyc.submit",
    entityType: "user",
    entityId: userId,
    metadata: {
      hasBank: Boolean(input.bankAccountNumber && input.bankIfsc),
      address: input.address ?? null,
      city: input.city ?? null,
      pincode: input.pincode ?? null,
      bankAccountName: input.bankAccountName ?? null,
      bankAccountNumber: input.bankAccountNumber ?? null,
      bankIfsc: input.bankIfsc ?? null,
      bankName: input.bankName ?? null,
      bankBranch: input.bankBranch ?? null,
      ...bankCheckMeta,
      gender: input.gender ?? null,
      fatherName: input.fatherName ?? null,
      dob: input.dob ?? null,
      anniversaryDate: input.anniversaryDate ?? null,
      district: input.district ?? null,
      state: input.state ?? null,
      businessName: input.businessName ?? null,
      businessType: input.businessType ?? null,
      businessCategory: input.businessCategory ?? null,
      monthlyTurnover: input.monthlyTurnover ?? null,
      businessProof: input.businessProof ?? null,
      businessAddress: input.businessAddress ?? null,
      businessPincode: input.businessPincode ?? null,
      businessDistrict: input.businessDistrict ?? null,
      businessState: input.businessState ?? null,
      personalPhotoLatitude: input.personalPhotoLatitude ?? null,
      personalPhotoLongitude: input.personalPhotoLongitude ?? null,
      shopPhotoLatitude: input.shopPhotoLatitude ?? null,
      shopPhotoLongitude: input.shopPhotoLongitude ?? null,
      latitude,
      longitude,
      shopLocation: shopFix
        ? { source: shopFix.source, accuracyMeters: shopFix.accuracyMeters }
        : null,
      homeLocation: homeFix
        ? {
            latitude: homeFix.latitude,
            longitude: homeFix.longitude,
            source: homeFix.source,
            accuracyMeters: homeFix.accuracyMeters,
          }
        : null,
      homeToShopKm,
      ...docMeta,
      ...(Object.keys(docChecks).length ? { docChecks } : {}),
    },
  });
  // New submission → any earlier admin decision no longer applies.
  await recordKycVerification(userId, { slots: docChecks, review: null }, statusCtx);

  if (updated.email && updated.emailVerifiedAt) {
    notifyUserEmail(updated.email, () => kycSubmittedEmailTemplate({ name: updated.name }));
  }

  return toAuthUser(updated);
}
