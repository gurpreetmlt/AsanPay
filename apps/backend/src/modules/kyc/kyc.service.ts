import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { decryptPII, encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { findLatestAuditLog, insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { kycSubmittedEmailTemplate, notifyUserEmail } from "../../utils/mailer";
import type { AuthUser } from "@asanpay/shared-types";
import type { KycSubmitInput } from "../auth/auth.validators";
import {
  metaDataUrlKey,
  metaFileNameKey,
  metaPublicPathKey,
  saveKycDocumentDataUrl,
  type KycDocSlot,
} from "./kycDocuments.service";

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
    hasInstantpayOutlet: Boolean(row.instantpayOutletId),
    hasTxnPin: Boolean(row.txnPinHash),
    hasLoginMpin: Boolean(row.loginMpinHash),
    telegramLinked: Boolean(row.telegramChatId),
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

  const audit = await findLatestAuditLog({ userId, action: "kyc.submit" });
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
    bankAccountName: metaString(meta, "bankAccountName"),
    bankAccountMasked: accountRaw ? maskAccount(accountRaw) : null,
    bankIfsc: metaString(meta, "bankIfsc"),
    bankName: metaString(meta, "bankName"),
    bankBranch: metaString(meta, "bankBranch"),
    businessName: metaString(meta, "businessName"),
    businessType: metaString(meta, "businessType"),
    cancelledChequeFileName: metaString(meta, "cancelledChequeFileName"),
  };
}

/** Stores KYC PII encrypted. Status stays pending until admin verifies (Task 18). */
export async function submitKyc(userId: string, input: KycSubmitInput): Promise<AuthUser> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.isActive) {
    throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  }
  if (user.kycStatus === "verified") {
    throw new HttpError(409, "KYC is already verified", "KYC_ALREADY_VERIFIED");
  }

  const latitude =
    input.shopPhotoLatitude?.trim() || input.latitude?.trim() || user.outletLatitude || null;
  const longitude =
    input.shopPhotoLongitude?.trim() || input.longitude?.trim() || user.outletLongitude || null;

  const [updated] = await db
    .update(users)
    .set({
      name: input.fullName?.trim() || user.name,
      email: input.email ?? user.email,
      panNumberEncrypted: encryptPII(input.panNumber.toUpperCase()),
      aadhaarNumberEncrypted: encryptPII(input.aadhaarNumber),
      kycStatus: "pending",
      ...(latitude && longitude
        ? { outletLatitude: latitude, outletLongitude: longitude }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw new HttpError(500, "Failed to save KYC");

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
      docMeta[metaPublicPathKey(slot)] = saved.publicPath;
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
      ...docMeta,
    },
  });

  if (updated.email && updated.emailVerifiedAt) {
    notifyUserEmail(updated.email, () => kycSubmittedEmailTemplate({ name: updated.name }));
  }

  return toAuthUser(updated);
}
