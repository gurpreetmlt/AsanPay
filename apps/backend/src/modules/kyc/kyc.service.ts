import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import type { AuthUser } from "@asanpay/shared-types";
import type { KycSubmitInput } from "../auth/auth.validators";

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    uid: row.uid,
    role: row.role,
    name: row.name,
    mobile: row.mobile,
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

  const [updated] = await db
    .update(users)
    .set({
      name: input.fullName?.trim() || user.name,
      email: input.email ?? user.email,
      panNumberEncrypted: encryptPII(input.panNumber.toUpperCase()),
      aadhaarNumberEncrypted: encryptPII(input.aadhaarNumber),
      kycStatus: "pending",
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
    },
  });

  return toAuthUser(updated);
}
