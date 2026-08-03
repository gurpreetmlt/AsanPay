import { z } from "zod";
import { rupeesToPaise } from "../../core/money";
import { HttpError } from "../../utils/httpError";

const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be a positive number with at most 2 decimals")
  .refine((v) => parseFloat(v) > 0, "Amount must be greater than zero");

const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid 11-character IFSC");

export const registerSettlementBankSchema = z.object({
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,18}$/, "Account number must be 6–18 digits"),
  ifsc: ifscSchema,
  holderName: z.string().trim().min(2, "Holder name is required").max(160),
  /** Required when replacing an already-active settlement bank (24h cooling applies after verify). */
  otp: z
    .string()
    .regex(/^\d{6}$/, "OTP must be a 6-digit code")
    .optional(),
});
export type RegisterSettlementBankBody = z.infer<typeof registerSettlementBankSchema>;

export const verifySettlementBankSchema = z.object({
  verificationRef: z.string().trim().min(1).max(80).optional(),
  activate: z.boolean().optional().default(true),
});
export type VerifySettlementBankBody = z.infer<typeof verifySettlementBankSchema>;

export const requestSettlementSchema = z.object({
  amount: amountSchema,
  mode: z.enum(["imps", "neft", "rtgs"]).optional().default("imps"),
});
export type RequestSettlementBody = z.infer<typeof requestSettlementSchema>;

export const markPayoutSuccessSchema = z.object({
  bankUtr: z.string().trim().min(1, "Bank UTR is required").max(60),
  payoutBankAccountId: z.string().regex(/^\d+$/, "payoutBankAccountId must be a numeric id").optional(),
});
export type MarkPayoutSuccessBody = z.infer<typeof markPayoutSuccessSchema>;

export const markPayoutFailedSchema = z.object({
  failureReason: z.string().trim().min(1, "Failure reason is required").max(500),
});
export type MarkPayoutFailedBody = z.infer<typeof markPayoutFailedSchema>;

export const markPayoutReturnedSchema = z.object({
  reason: z.string().trim().min(1, "Return reason is required").max(500),
  bankUtr: z.string().trim().max(60).optional(),
});
export type MarkPayoutReturnedBody = z.infer<typeof markPayoutReturnedSchema>;

export function parseSettlementId(raw: string | undefined): bigint {
  if (!raw || !/^\d+$/.test(raw)) {
    throw new HttpError(422, "Settlement request id must be a positive integer", "INVALID_ID");
  }
  return BigInt(raw);
}

export function parseBankRowId(raw: string | undefined): bigint {
  if (!raw || !/^\d+$/.test(raw)) {
    throw new HttpError(422, "Settlement bank id must be a positive integer", "INVALID_ID");
  }
  return BigInt(raw);
}

export function parseRupeeAmount(rupees: string) {
  try {
    return rupeesToPaise(rupees);
  } catch {
    throw new HttpError(422, "Amount must be a valid rupee value", "INVALID_AMOUNT");
  }
}
