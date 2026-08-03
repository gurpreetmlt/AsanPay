import { z } from "zod";
import { rupeesToPaise } from "../../core/money";
import { HttpError } from "../../utils/httpError";

const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be a positive number with at most 2 decimals")
  .refine((v) => parseFloat(v) > 0, "Amount must be greater than zero");

export const submitFundRequestSchema = z.object({
  bankAccountId: z.string().regex(/^\d+$/, "bankAccountId must be a numeric id"),
  amount: amountSchema,
  paymentMode: z.enum(["cash_deposit", "neft", "rtgs", "imps", "upi", "cheque"]),
  referenceNumber: z.string().trim().min(1).max(60).optional().nullable(),
  depositDatetime: z.string().datetime({ offset: true }),
  senderName: z.string().trim().min(1).max(160).optional().nullable(),
  receiptUrl: z.string().url().max(2000),
  receiptSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, "receiptSha256 must be a 64-character hex SHA-256"),
  remarks: z.string().trim().max(500).optional().nullable(),
});
export type SubmitFundRequestBody = z.infer<typeof submitFundRequestSchema>;

export const approveFundRequestSchema = z.object({
  creditAmount: amountSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type ApproveFundRequestBody = z.infer<typeof approveFundRequestSchema>;

export const rejectFundRequestSchema = z.object({
  reasonCode: z.string().trim().min(1).max(40),
  remarks: z.string().trim().min(1).max(500),
});
export type RejectFundRequestBody = z.infer<typeof rejectFundRequestSchema>;

export function parseRequestId(raw: string | undefined): bigint {
  if (!raw || !/^\d+$/.test(raw)) {
    throw new HttpError(422, "Fund request id must be a positive integer", "INVALID_ID");
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
