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
  receiptDataUrl: z.string().max(4_000_000, "Receipt file must be 2 MB or smaller").optional(),
  receiptName: z.string().trim().max(200).optional().nullable(),
  receiptUrl: z.string().max(2000).optional(),
  receiptSha256: z.string().optional(),
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

const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const RECEIPT_RE = /^data:(image\/(png|jpeg|jpg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/;

/** Validates the uploaded receipt and returns its decoded bytes. */
export function parseReceiptDataUrl(dataUrl: string | undefined): Buffer {
  if (!dataUrl) {
    throw new HttpError(
      422,
      "Upload the deposit receipt file. If you are using the mobile app, update it to the latest version.",
      "RECEIPT_FILE_REQUIRED",
    );
  }
  const m = RECEIPT_RE.exec(dataUrl);
  if (!m) {
    throw new HttpError(422, "Receipt must be a PNG, JPG, WEBP image or a PDF", "INVALID_RECEIPT");
  }
  const bytes = Buffer.from(m[3] ?? "", "base64");
  if (bytes.length === 0) throw new HttpError(422, "Receipt file is empty", "INVALID_RECEIPT");
  if (bytes.length > MAX_RECEIPT_BYTES) {
    throw new HttpError(422, "Receipt file must be 2 MB or smaller", "RECEIPT_TOO_LARGE");
  }
  return bytes;
}

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
