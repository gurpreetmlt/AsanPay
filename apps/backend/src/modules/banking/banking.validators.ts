import { z } from "zod";

const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be a positive number with at most 2 decimals")
  .refine((v) => parseFloat(v) > 0, "Amount must be greater than zero");

const bankProfileFields = {
  holderName: z.string().trim().max(160, "Account name must be 160 characters or fewer").optional(),
  accountType: z.enum(["current", "savings"], { message: "Account type must be Current or Savings" }).optional(),
  branchName: z.string().trim().max(120, "Branch name must be 120 characters or fewer").optional(),
  branchCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{0,20}$/, "Branch code must be letters or digits only (max 20)")
    .optional(),
};

export const registerBankAccountSchema = z.object({
  bankName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().min(6).max(40),
  ifsc: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Enter a valid 11-character IFSC"),
  purpose: z.enum(["collection", "payout", "ops"]),
  supportsVan: z.boolean().optional(),
  ...bankProfileFields,
});
export type RegisterBankAccountBody = z.infer<typeof registerBankAccountSchema>;

export const updateBankAccountSchema = z.object({
  bankName: z.string().trim().min(2).max(120).optional(),
  accountNumber: z.string().trim().min(6).max(40).optional(),
  ifsc: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Enter a valid 11-character IFSC")
    .optional(),
  purpose: z.enum(["collection", "payout", "ops"]).optional(),
  supportsVan: z.boolean().optional(),
  ...bankProfileFields,
});
export type UpdateBankAccountBody = z.infer<typeof updateBankAccountSchema>;

export const setBankAccountActiveSchema = z.object({
  isActive: z.boolean(),
});
export type SetBankAccountActiveBody = z.infer<typeof setBankAccountActiveSchema>;

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
        balanceAfter: z
          .string()
          .regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Balance must be a number with at most 2 decimals")
          .optional()
          .nullable(),
      }),
    )
    .min(1)
    .max(500),
  // Upload history. The first batch of an upload omits importId and gets one back; later
  // batches of the same file send it so the whole file is one history row.
  importId: z.string().regex(/^\d+$/, "importId must be a numeric id").optional(),
  fileName: z.string().trim().max(200).optional().nullable(),
  source: z.enum(["file", "paste"]).optional(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodFrom must be YYYY-MM-DD").optional(),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodTo must be YYYY-MM-DD").optional(),
  ...statementIdentityFields(),
  confirmedBank: z.boolean().optional(),
});
export type ImportStatementBody = z.infer<typeof importStatementSchema>;

function statementIdentityFields() {
  return {
    accountLast4: z
      .string()
      .regex(/^\d{4}$/, "accountLast4 must be 4 digits")
      .optional()
      .nullable(),
    ifsc: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "IFSC must be 11 characters, e.g. IDIB000M123")
      .optional()
      .nullable(),
    opening: z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Opening date must be YYYY-MM-DD"),
        balance: z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Opening balance must be a number"),
      })
      .optional()
      .nullable(),
  };
}

export const verifyStatementSchema = z.object({
  bankAccountId: z.string().regex(/^\d+$/, "Select which company bank this statement belongs to"),
  ...statementIdentityFields(),
  lines: z
    .array(
      z.object({
        utr: z.string().trim().max(60).optional().nullable(),
        amount: amountSchema,
        direction: z.enum(["DR", "CR"]),
      }),
    )
    .max(500),
});

export const statementImportsQuerySchema = z.object({
  bankAccountId: z.string().regex(/^\d+$/, "Select a company bank account").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const reconQuerySchema = z
  .object({
    bankAccountId: z.string().regex(/^\d+$/, "Select a company bank account"),
    from: isoDate,
    to: isoDate,
  })
  .refine((v) => v.from <= v.to, { message: "From date must be on or before To date", path: ["from"] })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 366 * 86_400_000, {
    message: "Period can be at most one year",
    path: ["to"],
  });

export const reconAutoMatchSchema = z.object({
  bankAccountId: z.string().regex(/^\d+$/, "Select a company bank account"),
});

export const reconLinkSchema = z.object({
  lineId: z.string().regex(/^\d+$/, "lineId must be a numeric id"),
  journalId: z.string().regex(/^\d+$/, "journalId must be a numeric id"),
});

export const reconUnlinkSchema = z.object({
  lineId: z.string().regex(/^\d+$/, "lineId must be a numeric id"),
});

export const parkSuspenseSchema = z.object({
  olderThanHours: z.coerce.number().int().min(1).max(720).optional(),
});
export type ParkSuspenseBody = z.infer<typeof parkSuspenseSchema>;

/** Bank → AsanPay VAN credit webhook body. Signature covers bankTxnId|vanNumber|vpa|amount. */
export const vanWebhookSchema = z
  .object({
    bankTxnId: z.string().trim().min(1, "bankTxnId is required").max(120),
    amount: amountSchema,
    vanNumber: z.string().trim().min(1).max(40).optional().nullable(),
    vpa: z.string().trim().min(1).max(100).optional().nullable(),
    utr: z.string().trim().max(60).optional().nullable(),
    txnDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "txnDate must be YYYY-MM-DD")
      .optional(),
    narration: z.string().trim().max(500).optional().nullable(),
    senderName: z.string().trim().max(160).optional().nullable(),
    /** Last 4 of the company collection account — required when the VAN cannot be matched. */
    collectionAccountLast4: z
      .string()
      .regex(/^\d{4}$/, "collectionAccountLast4 must be exactly 4 digits")
      .optional()
      .nullable(),
  })
  .refine((b) => Boolean(b.vanNumber?.trim()) || Boolean(b.vpa?.trim()), {
    message: "Provide vanNumber or vpa so the credit can be matched",
    path: ["vanNumber"],
  });
export type VanWebhookBody = z.infer<typeof vanWebhookSchema>;

export const assignVanSchema = z
  .object({
    userId: z.string().uuid("userId must be a UUID"),
    bankAccountId: z.string().regex(/^\d+$/, "bankAccountId must be a numeric id"),
    vanNumber: z.string().trim().min(4).max(40).optional().nullable(),
    vpa: z.string().trim().min(3).max(100).optional().nullable(),
  })
  .refine((b) => Boolean(b.vanNumber?.trim()) || Boolean(b.vpa?.trim()), {
    message: "Provide vanNumber or vpa",
    path: ["vanNumber"],
  });
export type AssignVanBody = z.infer<typeof assignVanSchema>;
