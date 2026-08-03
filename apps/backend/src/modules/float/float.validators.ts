import { z } from "zod";

const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be a positive number with at most 2 decimals")
  .refine((v) => parseFloat(v) > 0, "Amount must be greater than zero");

export const createFloatRouteSchema = z.object({
  fromBankId: z.string().regex(/^\d+$/, "fromBankId must be a numeric id"),
  toProviderId: z.string().uuid("toProviderId must be a UUID"),
  beneficiaryName: z.string().trim().min(2).max(160),
  beneficiaryAccount: z.string().trim().min(6).max(40),
  beneficiaryIfsc: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Enter a valid 11-character IFSC"),
  transferMode: z.enum(["neft", "rtgs", "imps"]).optional(),
  minAmount: amountSchema.optional(),
  maxAmount: amountSchema.optional(),
  priority: z.coerce.number().int().min(1).max(100).optional(),
});
export type CreateFloatRouteBody = z.infer<typeof createFloatRouteSchema>;

export const initiateFloatTransferSchema = z.object({
  routeId: z.string().regex(/^\d+$/, "routeId must be a numeric id"),
  amount: amountSchema,
  bankUtr: z.string().trim().min(4).max(60).optional(),
});
export type InitiateFloatTransferBody = z.infer<typeof initiateFloatTransferSchema>;

export const confirmFloatTransferSchema = z.object({
  bankUtr: z.string().trim().min(4).max(60).optional(),
});
export type ConfirmFloatTransferBody = z.infer<typeof confirmFloatTransferSchema>;
