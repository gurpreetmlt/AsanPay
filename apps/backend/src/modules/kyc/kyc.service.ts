import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { kycSubmittedEmailTemplate, notifyUserEmail } from "../../utils/mailer";
import type { AuthUser } from "@asanpay/shared-types";
import type { KycSubmitInput } from "../auth/auth.validators";

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

  const latitude = input.latitude?.trim() || user.outletLatitude || null;
  const longitude = input.longitude?.trim() || user.outletLongitude || null;

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

  await insertAuditLog({
    userId,
    action: "kyc.submit",
    entityType: "user",
    entityId: userId,
    metadata: {
      hasBank: Boolean(input.bankAccountNumber && input.bankIfsc),
      city: input.city ?? null,
      pincode: input.pincode ?? null,
      bankName: input.bankName ?? null,
      bankBranch: input.bankBranch ?? null,
      cancelledChequeFileName: input.cancelledChequeFileName ?? null,
      gender: input.gender ?? null,
      fatherName: input.fatherName ?? null,
      dob: input.dob ?? null,
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
      panImageFileName: input.panImageFileName ?? null,
      aadhaarFrontFileName: input.aadhaarFrontFileName ?? null,
      aadhaarBackFileName: input.aadhaarBackFileName ?? null,
      shopPhotoFileName: input.shopPhotoFileName ?? null,
      latitude,
      longitude,
    },
  });

  if (updated.email && updated.emailVerifiedAt) {
    notifyUserEmail(updated.email, () => kycSubmittedEmailTemplate({ name: updated.name }));
  }

  return toAuthUser(updated);
}
