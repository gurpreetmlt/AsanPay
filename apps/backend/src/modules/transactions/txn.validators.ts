import { z } from "zod";
import { env } from "../../config/env";
import { DMT_RAIL_CODES } from "../providers/dmtRails.service";

/** DMT bank rail picked on the transfer screen; older app builds send none and stay on Airtel. */
const rail = z.enum(DMT_RAIL_CODES, { message: "Select a valid DMT bank (Airtel, Jio or Fino)" }).default("airtel");

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

/** BestAPI mobile operator lookup (prepaid). Plans/offers load on demand. */
export const rechargeMobileInfoSchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile"),
});

export const rechargeMobilePlansSchema = z.object({
  mobile: z.string().trim().optional(),
  operatorCode: z.string().trim().min(1, "Select an operator").max(16),
  circleCode: z.string().trim().min(1, "Select a circle/state").max(8),
});

export const rechargeMobileOffersSchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile"),
  operatorCode: z.string().trim().min(1, "Select an operator").max(16),
  circleCode: z.string().trim().min(1, "Select a circle/state").max(8),
});

export const rechargeDthPlansSchema = z.object({
  operatorCode: z.string().trim().min(1, "Select a DTH operator").max(16),
});

export const rechargeDthInfoSchema = z.object({
  operatorCode: z.string().trim().min(1, "Select a DTH operator").max(16),
  number: z
    .string()
    .trim()
    .min(8, "Enter a valid DTH subscriber number")
    .max(20, "Enter a valid DTH subscriber number"),
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
  rail,
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

export const dmtBankNameCheckSchema = z.object({
  accountNumber: z.string().regex(/^\d{6,18}$/, "Account number must be 6–18 digits"),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid 11-character IFSC (e.g. SBIN0001234)"),
  idempotencyKey: z.string().min(8).max(80),
});

export const dmtRemitterProfileSchema = z.object({
  rail,
  customerMobile: z.string().regex(/^\d{10}$/),
});

export const dmtBeneficiaryVerifySchema = z.object({
  rail,
  customerMobile: z.string().regex(/^\d{10}$/),
  otp: z.string().regex(/^\d{4,8}$/),
  beneficiaryId: z.string().min(1).max(128),
  referenceKey: z.string().min(8).max(512),
});

export const dmtBeneficiaryDeleteSchema = z.object({
  rail,
  customerMobile: z.string().regex(/^\d{10}$/),
  beneficiaryId: z.string().min(1).max(128),
});

export const dmtRemitterRegisterSchema = z.object({
  rail,
  customerMobile: z.string().regex(/^\d{10}$/),
  aadhaarNumber: z.string().regex(/^\d{12}$/),
  referenceKey: z.string().min(8).max(512),
});

export const dmtRemitterRegisterVerifySchema = z.object({
  rail,
  customerMobile: z.string().regex(/^\d{10}$/),
  otp: z.string().regex(/^\d{4,8}$/),
  referenceKey: z.string().min(8).max(512),
});

export const dmtRemitterKycSchema = z.object({
  rail,
  customerMobile: z.string().regex(/^\d{10}$/),
  referenceKey: z.string().min(8).max(512),
  biometricPayload: z.string().min(1),
  captureType: z.enum(["FINGER", "FACE"]).optional(),
  latitude: z.string().min(1).max(32).optional(),
  longitude: z.string().min(1).max(32).optional(),
});

export const dmtTransactionOtpSchema = z.object({
  rail,
  customerMobile: z.string().regex(/^\d{10}$/),
  amount,
  referenceKey: z.string().min(8).max(512),
});

export const dmtRefundOtpSchema = z.object({
  /** Provider order id (providerTxnId on our txn) of the pending remittance. */
  ipayId: z.string().min(6).max(64),
});

export const dmtRefundSchema = z.object({
  ipayId: z.string().min(6).max(64),
  /** referenceKey from the refund OTP response. */
  referenceKey: z.string().min(8).max(512),
  otp: z.string().regex(/^\d{4,8}$/),
});

/** Web phone-QR location fix (`/geo-link`), used when the browser blocks location. */
const geoLinkToken = z
  .string()
  .regex(/^[a-f0-9]{48}$/, "Location capture is not valid. Verify your location again.")
  .optional();

export const dmtTransferSchema = z
  .object({
    ...txnAuthFields,
    rail,
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
    geoLinkToken,
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
    /** From /aeps/withdraw/otp — required by the provider for amounts above ₹5,000. */
    otpReferenceKey: z.string().min(1).max(200).optional(),
    geoLinkToken,
  })
  .superRefine(requireTxnProof);

export const aepsDepositSchema = z
  .object({
    ...txnAuthFields,
    ...aepsBase,
    amount,
    geoLinkToken,
  })
  .superRefine(requireTxnProof);

export const aadhaarPaySchema = z
  .object({
    ...txnAuthFields,
    ...aepsBase,
    amount,
    /** FACE = customer PID from UIDAI FaceRD (mobile); default fingerprint. */
    captureType: z.enum(["FINGER", "FACE"]).optional(),
    /** From /aeps/aadhaar-pay/otp — only when the provider asks for an OTP at this amount. */
    otpReferenceKey: z.string().min(1).max(200).optional(),
    otpTransactionId: z.string().min(1).max(200).optional(),
    otpTransactionToken: z.string().min(1).max(1000).optional(),
    geoLinkToken,
  })
  .superRefine(requireTxnProof);
