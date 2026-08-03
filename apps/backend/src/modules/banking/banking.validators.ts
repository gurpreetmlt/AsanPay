import { z } from "zod";

const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be a positive number with at most 2 decimals")
  .refine((v) => parseFloat(v) > 0, "Amount must be greater than zero");

export const registerBankAccountSchema = z.object({
  bankName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().min(6).max(40),
  ifsc: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Enter a valid 11-character IFSC"),
  purpose: z.enum(["collection", "payout", "ops"]),
  supportsVan: z.boolean().optional(),
});
export type RegisterBankAccountBody = z.infer<typeof registerBankAccountSchema>;

export const importStatementSchema = z.object({
  bankAccountId: z.string().regex(/^\d+$/, "bankAccountId must be a numeric id"),
  lines: z
    .array(
      z.object({
        bankTxnId: z.string().trim().min(1).max(120).optional().nullable(),
        txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "txnDate must be YYYY-MM-DD"),
        valueDatetime: z.string().datetime({ offset: true }).optional().nullable(),
        direction: z.enum(["DR", "CR"]),
        amount: amountSchema,
        utr: z.string().trim().max(60).optional().nullable(),
        narration: z.string().trim().max(500).optional().nullable(),
        senderName: z.string().trim().max(160).optional().nullable(),
        balanceAfter: amountSchema.optional().nullable(),
      }),
    )
    .min(1)
    .max(500),
});
export type ImportStatementBody = z.infer<typeof importStatementSchema>;

export const parkSuspenseSchema = z.object({
  olderThanHours: z.coerce.number().int().min(1).max(720).optional(),
});
export type ParkSuspenseBody = z.infer<typeof parkSuspenseSchema>;
