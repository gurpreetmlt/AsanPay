import { z } from "zod";
import { WALLET_TYPES } from "@asanpay/shared-types";

const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be a positive number with at most 2 decimals")
  .refine((v) => parseFloat(v) > 0, "Amount must be greater than zero");

const requireTxnProof = (data: { txnPin?: string; txnAuth?: string }, ctx: z.RefinementCtx) => {
  if (!data.txnPin && !data.txnAuth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Transaction PIN or txnAuth is required",
      path: ["txnAuth"],
    });
  }
};

export const fundWalletSchema = z
  .object({
    amount: amountSchema,
    description: z.string().trim().max(255).optional(),
    /** When set, admin mints float into this Super Dist (direct child) instead of self. */
    targetUserId: z.string().uuid().optional(),
    txnPin: z.string().regex(/^\d{4,6}$/).optional(),
    txnAuth: z.string().min(20).optional(),
    idempotencyKey: z.string().min(8).max(100),
  })
  .superRefine(requireTxnProof)
  // A top-up mints spendable capacity out of nothing, so it must say why. Funding a downline
  // only moves capacity that already exists, so it stays optional there.
  .superRefine((val, ctx) => {
    if (!val.targetUserId && (val.description?.trim().length ?? 0) < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["description"],
        message: "A company top-up needs a written reason (at least 8 characters)",
      });
    }
  });
export type FundWalletInput = z.infer<typeof fundWalletSchema>;

export const transferWalletSchema = z
  .object({
    targetUserId: z.string().uuid(),
    walletType: z.enum(WALLET_TYPES).default("main"),
    amount: amountSchema,
    description: z.string().trim().max(255).optional(),
    txnPin: z.string().regex(/^\d{4,6}$/).optional(),
    txnAuth: z.string().min(20).optional(),
    idempotencyKey: z.string().min(8).max(100),
  })
  .superRefine(requireTxnProof);
export type TransferWalletInput = z.infer<typeof transferWalletSchema>;

/** Parent requests OTP on child mobile before collecting funds. */
export const pullRequestSchema = z.object({
  targetUserId: z.string().uuid(),
  walletType: z.enum(WALLET_TYPES).default("main"),
  amount: amountSchema,
});
export type PullRequestInput = z.infer<typeof pullRequestSchema>;

/** Confirm collect: child OTP + parent txn PIN. */
export const pullConfirmSchema = z
  .object({
    targetUserId: z.string().uuid(),
    walletType: z.enum(WALLET_TYPES).default("main"),
    amount: amountSchema,
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
    description: z.string().trim().max(255).optional(),
    txnPin: z.string().regex(/^\d{4,6}$/).optional(),
    txnAuth: z.string().min(20).optional(),
    idempotencyKey: z.string().min(8).max(100),
  })
  .superRefine(requireTxnProof);
export type PullConfirmInput = z.infer<typeof pullConfirmSchema>;

export const ledgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type LedgerQueryInput = z.infer<typeof ledgerQuerySchema>;
