import { z } from "zod";
import { env } from "../../config/env";

const amount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive number with up to 2 decimals");

const txnAuthFields = {
  idempotencyKey: z.string().min(8).max(100),
  txnPin: z.string().regex(/^\d{4,6}$/).optional(),
  txnAuth: z.string().min(20).optional(),
};

const requireTxnProof = (data: { txnPin?: string; txnAuth?: string }, ctx: z.RefinementCtx) => {
  if (!env.REQUIRE_TXN_PIN) return;
  if (!data.txnPin && !data.txnAuth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Transaction PIN or txnAuth is required",
      path: ["txnAuth"],
    });
  }
};

export const rechargeSchema = z
  .object({
    ...txnAuthFields,
    serviceCode: z.string().min(2).max(60),
    operatorCode: z.string().min(1).max(60),
    accountRef: z.string().min(3).max(40),
    amount,
  })
  .superRefine(requireTxnProof);

/** BestAPI mobile operator + plans + offers lookup (prepaid only). */
export const rechargeMobileInfoSchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile"),
});

export const bbpsFetchBillSchema = z.object({
  serviceCode: z.string().min(2).max(60),
  billerCode: z.string().min(1).max(80),
  customerParams: z.record(z.string(), z.string()).default({}),
});

export const bbpsPayBillSchema = z
  .object({
    ...txnAuthFields,
    serviceCode: z.string().min(2).max(60),
    billerCode: z.string().min(1).max(80),
    customerParams: z.record(z.string(), z.string()).default({}),
    billFetchRef: z.string().min(1).max(100),
    amount,
  })
  .superRefine(requireTxnProof);

export const dmtBeneficiarySchema = z.object({
  customerMobile: z.string().regex(/^\d{10}$/),
  name: z.string().min(2).max(120),
  accountNumber: z.string().min(6).max(24),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  beneficiaryMobile: z
    .string()
    .regex(/^\d{10}$/)
    .optional(),
  bankId: z.string().min(1).max(20).optional(),
});

export const dmtRemitterProfileSchema = z.object({
  customerMobile: z.string().regex(/^\d{10}$/),
});

export const dmtBeneficiaryVerifySchema = z.object({
  customerMobile: z.string().regex(/^\d{10}$/),
  otp: z.string().regex(/^\d{4,8}$/),
  beneficiaryId: z.string().min(1).max(128),
  referenceKey: z.string().min(8).max(512),
});

export const dmtBeneficiaryDeleteSchema = z.object({
  customerMobile: z.string().regex(/^\d{10}$/),
  beneficiaryId: z.string().min(1).max(128),
});

export const dmtRemitterRegisterSchema = z.object({
  customerMobile: z.string().regex(/^\d{10}$/),
  aadhaarNumber: z.string().regex(/^\d{12}$/),
  referenceKey: z.string().min(8).max(512),
});

export const dmtRemitterRegisterVerifySchema = z.object({
  customerMobile: z.string().regex(/^\d{10}$/),
  otp: z.string().regex(/^\d{4,8}$/),
  referenceKey: z.string().min(8).max(512),
});

export const dmtRemitterKycSchema = z.object({
  customerMobile: z.string().regex(/^\d{10}$/),
  referenceKey: z.string().min(8).max(512),
  biometricPayload: z.string().min(1),
  captureType: z.enum(["FINGER", "FACE"]).optional(),
  latitude: z.string().min(1).max(32).optional(),
  longitude: z.string().min(1).max(32).optional(),
});

export const dmtTransactionOtpSchema = z.object({
  customerMobile: z.string().regex(/^\d{10}$/),
  amount,
  referenceKey: z.string().min(8).max(512),
});

export const dmtRefundOtpSchema = z.object({
  /** InstantPay orderid (providerTxnId on our txn) of the pending remittance. */
  ipayId: z.string().min(6).max(64),
});

export const dmtRefundSchema = z.object({
  ipayId: z.string().min(6).max(64),
  /** referenceKey from the refund OTP response. */
  referenceKey: z.string().min(8).max(512),
  otp: z.string().regex(/^\d{4,8}$/),
});

export const nepalStaticDataSchema = z.object({
  type: z.enum([
    "Gender",
    "Nationality",
    "IDType",
    "IncomeSource",
    "Relationship",
    "PaymentMode",
    "RemittanceReason",
  ]),
});

export const nepalPaymentLocationListSchema = z.object({
  type: z.enum(["ACCOUNTPAY", "CASHPAY"]),
  /** Defaults to NEPAL in the adapter when omitted. */
  country: z.string().min(3).max(32).optional(),
  state: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
});

export const nepalStateDistrictSchema = z.object({
  /** InstantPay sample: `India`. Also accept `Nepal` / `NEPAL`. */
  country: z.string().min(3).max(64),
});

export const nepalOutletStatusSchema = z.object({
  /** Set true / "1" when previous actcode was OTPVERFCTN. */
  checkOtpStatus: z
    .union([z.boolean(), z.literal(1), z.literal("1")])
    .optional()
    .transform((v) => v === true || v === 1 || v === "1"),
});

export const nepalOutletRegistrationSchema = z
  .object({
    otpReference: z.string().min(4).max(128),
    otp: z.string().regex(/^\d{4,8}$/),
    gender: z.enum(["Male", "Female", "Other"]),
    category: z.enum(["General", "OBC", "ST", "SC"]),
    fatherOrSpouseName: z.string().min(2).max(120),
    physicallyHandicapped: z.enum(["Handicapped", "Not Handicapped"]),
    alternateOccupationType: z.enum([
      "Government",
      "Self Employed",
      "Public Sector",
      "Private",
      "Other",
      "None",
    ]),
    alternateOccupationDescription: z.string().max(256).optional().default(""),
    highestEducation: z.enum(["Under 10th", "10th", "12th", "Graduate", "Post Graduate"]),
    operatingHoursFrom: z.string().min(4).max(32),
    operatingHoursTo: z.string().min(4).max(32),
    course: z.enum(["IIBF Advance", "IIBF Basic", "Certified by Bank", "None"]),
    courseCompletionDate: z.string().max(32).optional().default(""),
    instituteName: z.string().max(120).optional().default(""),
    deviceName: z.enum(["Laptop", "Handheld"]),
    connectivityType: z.enum(["Landline", "Mobile", "VSAT"]),
    connectionProvider: z.string().min(1).max(64),
    weeklyOff: z.string().min(1).max(64),
    expectedAnnualTurnover: z.union([z.string().min(1).max(32), z.number().nonnegative()]),
    expectedAnnualIncome: z.union([z.string().min(1).max(32), z.number().nonnegative()]),
    bankAccountNo: z.string().min(6).max(24),
    bankIfsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
    accountName: z.string().min(2).max(120),
  })
  .superRefine((data, ctx) => {
    if (data.alternateOccupationType === "Other" && !data.alternateOccupationDescription.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "alternateOccupationDescription is required when type is Other",
        path: ["alternateOccupationDescription"],
      });
    }
  });

export const nepalOutletEkycStatusSchema = z.object({
  /** Optional — InstantPay query `referenceKey`. */
  referenceKey: z.string().min(8).max(256).optional(),
});

const nepalBiometricDataSchema = z.object({
  rdsId: z.string().min(1).max(64),
  rdsVer: z.string().min(1).max(32),
  ci: z.string().min(1).max(64),
  dc: z.string().min(1).max(128),
  dpId: z.string().min(1).max(64),
  hmac: z.string().min(1),
  mc: z.string().max(8192).optional().default(""),
  mi: z.string().min(1).max(64),
  pidData: z.string().min(1),
  sessionKey: z.string().min(1),
});

export const nepalOutletEkycProcessSchema = z
  .object({
    /** PidData XML from RD service (preferred for web/mobile capture). */
    biometricPayload: z.string().min(1).optional(),
    /** Pre-built InstantPay biometric block (tests / advanced clients). */
    biometricData: nepalBiometricDataSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.biometricPayload && !data.biometricData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "biometricPayload or biometricData is required",
        path: ["biometricPayload"],
      });
    }
  });

export const nepalRemitterProfileSchema = z.object({
  customerMobile: z.string().regex(/^\d{10}$/),
});

export const nepalOtpRequestSchema = z
  .object({
    operation: z.enum(["FundTransfer", "RemitterRegistration", "AgentRegistration"]),
    mobile: z
      .string()
      .regex(/^\d{10}$/)
      .optional(),
    beneficiaryId: z.string().min(1).max(64).optional(),
    paymentMode: z.string().min(1).max(64).optional(),
    bankBranchId: z.string().max(64).optional(),
    accountNumber: z.string().max(64).optional(),
    transferAmount: z.string().max(32).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.operation === "FundTransfer" || data.operation === "RemitterRegistration") {
      if (!data.mobile) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "mobile is required for FundTransfer and RemitterRegistration",
          path: ["mobile"],
        });
      }
    }
    if (data.operation === "FundTransfer" && !data.beneficiaryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "beneficiaryId is required for FundTransfer",
        path: ["beneficiaryId"],
      });
    }
    if (data.operation !== "RemitterRegistration" && !data.paymentMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "paymentMode is required except for RemitterRegistration",
        path: ["paymentMode"],
      });
    }
    const isAccountDeposit = /^account\s*deposit$/i.test(data.paymentMode ?? "");
    if (isAccountDeposit) {
      if (!data.bankBranchId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "bankBranchId is required when paymentMode is Account Deposit",
          path: ["bankBranchId"],
        });
      }
      if (!data.accountNumber?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "accountNumber is required when paymentMode is Account Deposit",
          path: ["accountNumber"],
        });
      }
    }
  });

export const nepalRemitterRegistrationSchema = z.object({
  name: z.string().min(1).max(128),
  gender: z.string().min(1).max(32),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.string().min(1).max(256),
  city: z.string().min(1).max(64),
  state: z.string().min(1).max(64),
  district: z.string().min(1).max(64),
  nationality: z.string().min(1).max(64),
  /** InstantPay sample allows empty email. */
  email: z.string().max(128),
  employer: z.string().min(1).max(128),
  idType: z.string().min(1).max(64),
  idNumber: z.string().min(1).max(64),
  idExpiryDate: z.string().max(32).optional(),
  idIssuedPlace: z.string().max(128).optional(),
  incomeSource: z.string().min(1).max(64),
  remitterType: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  incomeSourceType: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  annualIncome: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  otpReference: z.string().min(8).max(128),
  otp: z.string().regex(/^\d{4,8}$/),
  mobile: z.string().regex(/^\d{10}$/),
});

export const nepalRemitterEkycInitiateSchema = z.object({
  remitterId: z.string().min(1).max(64),
});

export const nepalRemitterEkycStatusSchema = z.object({
  remitterId: z.string().min(1).max(64),
  referenceKey: z.string().min(8).max(256),
});

export const nepalRemitterEkycProcessSchema = z
  .object({
    remitterId: z.string().min(1).max(64),
    referenceKey: z.string().min(8).max(256),
    biometricPayload: z.string().min(1).optional(),
    biometricData: nepalBiometricDataSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.biometricPayload && !data.biometricData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "biometricPayload or biometricData is required",
        path: ["biometricPayload"],
      });
    }
  });

export const nepalRemitterUpdateSchema = z.object({
  remitterId: z.string().min(1).max(64),
  remitterType: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  incomeSourceType: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  annualIncome: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export const nepalBeneficiaryRegistrationSchema = z
  .object({
    remitterMobile: z.string().regex(/^\d{10}$/),
    name: z.string().min(1).max(128),
    gender: z.string().min(1).max(32),
    /** Nepal beneficiary mobile (8–15 digits). */
    mobile: z.string().regex(/^\d{8,15}$/),
    relationship: z.string().min(1).max(64),
    address: z.string().min(1).max(256),
    paymentMode: z.string().min(1).max(64),
    bankBranchId: z.string().max(64).optional(),
    accountNumber: z.string().max(64).optional(),
  })
  .superRefine((data, ctx) => {
    const isAccountDeposit = /^account\s*deposit$/i.test(data.paymentMode);
    if (isAccountDeposit) {
      if (!data.bankBranchId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "bankBranchId is required when paymentMode is Account Deposit",
          path: ["bankBranchId"],
        });
      }
      if (!data.accountNumber?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "accountNumber is required when paymentMode is Account Deposit",
          path: ["accountNumber"],
        });
      }
    }
  });

export const nepalServiceChargeSchema = z
  .object({
    country: z.string().min(1).max(32).optional().default("Nepal"),
    paymentMode: z.string().min(1).max(64),
    /** INR — may be empty when quoting from NPR payoutAmount (InstantPay sample). */
    transferAmount: z.string().max(32).optional(),
    payoutAmount: z.string().max(32).optional(),
    bankBranchId: z.string().max(64).optional(),
    remitterMobile: z.string().regex(/^\d{10}$/),
    beneficiaryId: z.string().min(1).max(64).optional(),
  })
  .superRefine((data, ctx) => {
    const hasTransfer = Boolean(data.transferAmount?.trim());
    const hasPayout = Boolean(data.payoutAmount?.trim());
    if (!hasTransfer && !hasPayout) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "transferAmount or payoutAmount is required",
        path: ["transferAmount"],
      });
    }
    const isAccountDeposit = /^account\s*deposit$/i.test(data.paymentMode);
    if (isAccountDeposit) {
      if (!data.bankBranchId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "bankBranchId is required when paymentMode is Account Deposit",
          path: ["bankBranchId"],
        });
      }
      if (!data.beneficiaryId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "beneficiaryId is required when paymentMode is Account Deposit",
          path: ["beneficiaryId"],
        });
      }
    }
  });

export const nepalFundTransferSchema = z
  .object({
    ...txnAuthFields,
    remitterMobile: z.string().regex(/^\d{10}$/),
    beneficiaryId: z.string().min(1).max(64),
    transferAmount: amount.refine(
      (v) => Number(v) > 0 && Number(v) <= 50_000,
      "Nepal transfer max is ₹50,000 per transaction",
    ),
    remittanceReason: z.string().min(1).max(128),
    otpReference: z.string().min(8).max(128),
    otp: z.string().regex(/^\d{4,8}$/),
    latitude: z.string().min(1).max(32),
    longitude: z.string().min(1).max(32),
  })
  .superRefine(requireTxnProof);

export const nepalFetchTransactionStatusSchema = z.object({
  /** InstantPay `orderid` / poolReferenceId from Fund Transfer. */
  ipayId: z.string().min(1).max(128),
  latitude: z.string().min(1).max(32),
  longitude: z.string().min(1).max(32),
});

export const dmtTransferSchema = z
  .object({
    ...txnAuthFields,
    customerMobile: z.string().regex(/^\d{10}$/),
    accountNumber: z.string().min(6).max(24),
    ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
    amount,
    mode: z.enum(["imps", "neft"]).default("imps"),
    otp: z.string().regex(/^\d{4,8}$/),
    referenceKey: z.string().min(8).max(512),
    beneficiaryId: z.string().min(1).max(128).optional(),
    latitude: z.string().min(1).max(32).optional(),
    longitude: z.string().min(1).max(32).optional(),
  })
  .superRefine(requireTxnProof);

// accuracyMeters/isMockLocation feed the log-only risk signals in modules/risk/riskSignal.service
// (task #15) — never a compliance gate on their own. Optional because no client sends them yet.
const geoRiskFields = {
  accuracyMeters: z.coerce.number().positive().max(1_000_000).optional(),
  isMockLocation: z.coerce.boolean().optional(),
};

const aepsBase = {
  aadhaarNumber: z.string().regex(/^\d{12}$/),
  bankIin: z.string().min(3).max(11),
  mobile: z.string().regex(/^\d{10}$/),
  biometricPayload: z.string().min(1),
  latitude: z.string().min(1).max(32).optional(),
  longitude: z.string().min(1).max(32).optional(),
  ...geoRiskFields,
};

export const aepsEnquirySchema = z.object({ ...aepsBase });

// No biometric at this step — OTP goes to the customer's mobile; the eventual
// withdrawal carries the OTP inside the PID capture plus this referenceKey.
export const aepsTxnOtpSchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/),
  bankIin: z.string().min(3).max(11),
  mobile: z.string().regex(/^\d{10}$/),
  amount,
  latitude: z.string().min(1).max(32).optional(),
  longitude: z.string().min(1).max(32).optional(),
  ...geoRiskFields,
});

export const aepsWithdrawSchema = z
  .object({
    ...txnAuthFields,
    ...aepsBase,
    amount,
    /** From /aeps/withdraw/otp — required by InstantPay for amounts above ₹5,000. */
    otpReferenceKey: z.string().min(1).max(200).optional(),
  })
  .superRefine(requireTxnProof);

export const aepsDepositSchema = z
  .object({
    ...txnAuthFields,
    ...aepsBase,
    amount,
  })
  .superRefine(requireTxnProof);

export const aadhaarPaySchema = z
  .object({
    ...txnAuthFields,
    ...aepsBase,
    amount,
  })
  .superRefine(requireTxnProof);
