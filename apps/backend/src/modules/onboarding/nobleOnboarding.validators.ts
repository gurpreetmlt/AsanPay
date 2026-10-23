import { z } from "zod";

const lettersSpaces = (label: string, max: number) =>
  z
    .string()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`)
    .regex(/^[A-Za-z ]+$/, `${label} may only contain letters and spaces`);

/** AEPS agent_onboarding body (AsanPay → backend). */
export const nobleAgentOnboardSchema = z.object({
  channel: z.enum(["APP", "WEB"]).default("APP"),
  firstName: lettersSpaces("First name", 50),
  middleName: z
    .string()
    .max(50)
    .regex(/^[A-Za-z ]*$/, "Middle name may only contain letters and spaces")
    .optional()
    .default(""),
  lastName: z
    .string()
    .max(50)
    .regex(/^[A-Za-z ]*$/, "Last name may only contain letters and spaces")
    .optional()
    .default(""),
  mobileNumber: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile"),
  email: z.string().email("Enter a valid email").max(150),
  /** Empty = use the PAN / Aadhaar on file from KYC (always preferred when present). */
  panNumber: z
    .union([z.literal(""), z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN (e.g. ABCDE1234F)")])
    .optional()
    .default(""),
  aadhaarNumber: z
    .union([z.literal(""), z.string().regex(/^\d{12}$/, "Aadhaar must be 12 digits")])
    .optional()
    .default(""),
  /** DD-MM-YYYY (provider sample) or DD/MM/YYYY */
  dob: z
    .string()
    .regex(/^\d{2}[-/]\d{2}[-/]\d{4}$/, "Date of birth must be DD-MM-YYYY or DD/MM/YYYY"),
  /** Optional; defaults to AP + last 8 digits of mobile (max 10). */
  agentCode: z
    .string()
    .regex(/^[A-Za-z0-9]{1,10}$/, "Agent code must be 1–10 alphanumeric characters")
    .optional(),
  agentAddress: z.string().min(5, "Agent address is required").max(250),
  agentStateCode: z.string().regex(/^[A-Z]{2}$/, "Agent state code must be 2 letters (e.g. RJ)"),
  agentCity: lettersSpaces("Agent city", 80),
  agentPinCode: z.string().regex(/^\d{6}$/, "Agent PIN must be 6 digits"),
  agentBankName: z.string().min(2, "Bank name is required").max(100),
  /** Empty = keep the bank account from KYC. */
  agentBankAccountNumber: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(/^\d+$/, "Bank account must be numeric")
        .min(5, "Bank account number must be 5–30 digits")
        .max(30, "Bank account number must be 5–30 digits"),
    ])
    .optional()
    .default(""),
  agentBankIFSC: z
    .string()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC (e.g. ICIC0000012)"),
  shopName: z.string().min(2, "Shop name is required").max(100),
  shopAddress: z.string().min(5, "Shop address must be at least 5 characters").max(250),
  shopStateCode: z.string().regex(/^[A-Z]{2}$/, "Shop state code must be 2 letters (e.g. RJ)"),
  shopCity: lettersSpaces("Shop city", 80),
  shopPinCode: z.string().regex(/^\d{6}$/, "Shop PIN must be 6 digits"),
  shopLatitude: z.coerce.number().min(-90).max(90),
  shopLongitude: z.coerce.number().min(-180).max(180),
  isPhysicalVerified: z.enum(["YES", "NO"]).default("YES"),
});

export type NobleAgentOnboardInput = z.infer<typeof nobleAgentOnboardSchema>;

export const nobleAgentStatusSchema = z.object({
  agentCode: z
    .string()
    .regex(/^[A-Za-z0-9]{1,10}$/, "Agent code must be 1–10 alphanumeric characters")
    .optional(),
  panNumber: z
    .string()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN (e.g. ABCDE1234F)")
    .optional(),
});

export type NobleAgentStatusInput = z.infer<typeof nobleAgentStatusSchema>;

export const nobleLoadAgentSchema = z.object({
  channel: z.enum(["APP", "WEB"]).optional().default("APP"),
});

export type NobleLoadAgentInput = z.infer<typeof nobleLoadAgentSchema>;

export const nobleAgentKycSchema = z.object({
  biometricPayload: z.string().min(20, "Biometric PID data is required"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  businessNature: z.string().min(2).max(80).optional(),
  annualIncome: z.string().min(1).max(20).optional(),
  channel: z.enum(["APP", "WEB"]).optional().default("APP"),
});

export type NobleAgentKycInput = z.infer<typeof nobleAgentKycSchema>;
