import { z } from "zod";
import { AUTH_PORTALS, USER_ROLES } from "@asanpay/shared-types";

const mobileSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Must be a valid 10-digit Indian mobile number");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  mobile: mobileSchema,
  email: z.string().trim().toLowerCase().email().optional(),
  password: passwordSchema,
  role: z.enum(USER_ROLES),
  panNumber: z
    .string()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Must be a valid PAN")
    .optional(),
  aadhaarNumber: z
    .string()
    .regex(/^\d{12}$/, "Must be a valid 12-digit Aadhaar number")
    .optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

const deviceIdSchema = z.string().trim().min(8).max(100);
const deviceLabelSchema = z.string().trim().max(150).optional();

/** Agent: 10-digit mobile. Admin: username `admin` only (no OTP, no mobile login). */
export const loginSchema = z
  .object({
    mobile: z.string().trim().optional(),
    username: z.string().trim().optional(),
    password: z.string().min(1),
    portal: z.enum(AUTH_PORTALS).default("agent"),
    /** After password login, trust this browser/device for MPIN (same as OTP verify). */
    deviceId: deviceIdSchema.optional(),
    deviceLabel: deviceLabelSchema,
  })
  .superRefine((data, ctx) => {
    if (data.portal === "admin") {
      const id = (data.username ?? data.mobile ?? "").trim().toLowerCase();
      if (id !== "admin") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Admin login requires username `admin`",
          path: ["username"],
        });
      }
      return;
    }
    if (!data.mobile || !/^[6-9]\d{9}$/.test(data.mobile)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Must be a valid 10-digit Indian mobile number",
        path: ["mobile"],
      });
    }
  });
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

const AGENT_LOGIN_ROLES = ["retailer", "distributor", "super_distributor"] as const;

export const otpRequestSchema = z.object({
  mobile: mobileSchema,
  portal: z.enum(AUTH_PORTALS).default("agent"),
  /** UI "Continue as" — must match the account role when the number is registered. */
  role: z.enum(AGENT_LOGIN_ROLES).optional(),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  mobile: mobileSchema,
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  portal: z.enum(AUTH_PORTALS).default("agent"),
  role: z.enum(AGENT_LOGIN_ROLES).optional(),
  /** Trusts this device for MPIN-only login going forward — see auth.service.ts. Optional so an
   * older/unwired client still completes OTP login; it just won't get MPIN-only trust. */
  deviceId: deviceIdSchema.optional(),
  deviceLabel: deviceLabelSchema,
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const mpinLoginSchema = z.object({
  mobile: mobileSchema,
  mpin: z.string().regex(/^\d{4}$/, "MPIN must be 4 digits"),
  portal: z.enum(AUTH_PORTALS).default("agent"),
  role: z.enum(AGENT_LOGIN_ROLES).optional(),
  /** Server rejects with DEVICE_NOT_TRUSTED if this device hasn't completed OTP recently. */
  deviceId: deviceIdSchema,
});
export type MpinLoginInput = z.infer<typeof mpinLoginSchema>;

export const setLoginMpinSchema = z.object({
  mpin: z.string().regex(/^\d{4}$/, "MPIN must be 4 digits"),
  /** Required only when changing an existing MPIN. */
  currentMpin: z.string().regex(/^\d{4}$/).optional(),
});
export type SetLoginMpinInput = z.infer<typeof setLoginMpinSchema>;

export const emailVerifyRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
export type EmailVerifyRequestInput = z.infer<typeof emailVerifyRequestSchema>;

export const emailVerifyConfirmSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});
export type EmailVerifyConfirmInput = z.infer<typeof emailVerifyConfirmSchema>;

export const emailPreferencesSchema = z.object({
  emailMarketingOptIn: z.boolean(),
});
export type EmailPreferencesInput = z.infer<typeof emailPreferencesSchema>;

/** AePS favourite bank strip ids (web + mobile shared). */
export const aepsFavouriteBanksSchema = z.object({
  bankIds: z
    .array(z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/i, "Invalid bank id"))
    .max(20),
});
export type AepsFavouriteBanksInput = z.infer<typeof aepsFavouriteBanksSchema>;

/** Public self-signup under an upline (sponsor UID). Role = account being created. */
export const SIGNUP_CHILD_ROLES = [
  "super_distributor",
  "distributor",
  "retailer",
  /** Signup UI only — persists as `retailer` under root admin (no distributor). */
  "direct_retailer",
] as const;
export type SignupChildRole = (typeof SIGNUP_CHILD_ROLES)[number];

/** Sponsor roles that may appear in public signup search. */
export const SPONSOR_SEARCH_ROLES = ["admin", "super_distributor", "distributor"] as const;
export type SponsorSearchRole = (typeof SPONSOR_SEARCH_ROLES)[number];

export function signupNeedsSponsorUid(role: SignupChildRole): boolean {
  return role !== "super_distributor" && role !== "direct_retailer";
}


/** Browser geolocation strings stored on user.outlet_* for AEPS geofence. */
export const geoCoordSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine((v) => Number.isFinite(Number(v)), { message: "Invalid coordinate" });

/** Step 1 — mobile + location only (OTP before role / profile). */
export const signupRequestSchema = z
  .object({
    mobile: mobileSchema,
    portal: z.enum(AUTH_PORTALS).default("agent"),
    latitude: geoCoordSchema,
    longitude: geoCoordSchema,
  })
  .superRefine((data, ctx) => {
    const lat = Number(data.latitude);
    const lng = Number(data.longitude);
    if (lat < -90 || lat > 90) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid latitude", path: ["latitude"] });
    }
    if (lng < -180 || lng > 180) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid longitude", path: ["longitude"] });
    }
  });
export type SignupRequestInput = z.infer<typeof signupRequestSchema>;

/** Public sponsor name lookup by UID. */
export const sponsorUidParamSchema = z.object({
  uid: z.string().trim().min(6).max(20),
});
export type SponsorUidParam = z.infer<typeof sponsorUidParamSchema>;

/** Public sponsor search by upline mobile + expected parent role. */
export const sponsorMobileQuerySchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^\d{3,10}$/, "Enter at least 3 digits of mobile"),
  role: z.enum(SPONSOR_SEARCH_ROLES),
});
export type SponsorMobileQuery = z.infer<typeof sponsorMobileQuerySchema>;

/** Live check while typing signup mobile. */
export const signupMobileCheckSchema = z.object({
  mobile: mobileSchema,
});
export type SignupMobileCheckInput = z.infer<typeof signupMobileCheckSchema>;

/** Live check while typing email (after account exists). */
export const signupEmailCheckSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
});
export type SignupEmailCheckInput = z.infer<typeof signupEmailCheckSchema>;

/** Confirm mobile OTP — returns signupToken; account created on /signup/complete. */
export const signupVerifySchema = z.object({
  mobile: mobileSchema,
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  portal: z.enum(AUTH_PORTALS).default("agent"),
});
export type SignupVerifyInput = z.infer<typeof signupVerifySchema>;

/** After OTP — role, name, password, upline. */
export const signupCompleteSchema = z
  .object({
    signupToken: z.string().trim().min(20).max(200),
    name: z.string().trim().min(2).max(120),
    mobile: mobileSchema,
    sponsorUid: z.string().trim().min(6).max(20).optional(),
    role: z.enum(SIGNUP_CHILD_ROLES),
    password: passwordSchema.optional(),
    portal: z.enum(AUTH_PORTALS).default("agent"),
    latitude: geoCoordSchema,
    longitude: geoCoordSchema,
  })
  .superRefine((data, ctx) => {
    if (signupNeedsSponsorUid(data.role) && !data.sponsorUid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sponsor UID is required",
        path: ["sponsorUid"],
      });
    }
    const lat = Number(data.latitude);
    const lng = Number(data.longitude);
    if (lat < -90 || lat > 90) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid latitude", path: ["latitude"] });
    }
    if (lng < -180 || lng > 180) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid longitude", path: ["longitude"] });
    }
  });
export type SignupCompleteInput = z.infer<typeof signupCompleteSchema>;

export const kycSubmitSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  panNumber: z
    .string()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Must be a valid PAN"),
  aadhaarNumber: z
    .string()
    .regex(/^\d{12}$/, "Must be a valid 12-digit Aadhaar number"),
  email: z.string().trim().toLowerCase().email().optional(),
  address: z.string().trim().max(250).optional(),
  city: z.string().trim().max(80).optional(),
  pincode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  bankAccountName: z.string().trim().max(120).optional(),
  bankAccountNumber: z.string().trim().max(30).optional(),
  bankIfsc: z
    .string()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .optional(),
  bankName: z.string().trim().max(120).optional(),
  cancelledChequeFileName: z.string().trim().max(200).optional(),
  gender: z.string().trim().max(20).optional(),
  fatherName: z.string().trim().max(120).optional(),
  dob: z.string().trim().max(32).optional(),
  district: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  businessName: z.string().trim().max(160).optional(),
  businessType: z.string().trim().max(80).optional(),
  businessCategory: z.string().trim().max(80).optional(),
  monthlyTurnover: z.string().trim().max(40).optional(),
  businessProof: z.string().trim().max(80).optional(),
  businessAddress: z.string().trim().max(250).optional(),
  businessPincode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  businessDistrict: z.string().trim().max(80).optional(),
  businessState: z.string().trim().max(80).optional(),
  bankBranch: z.string().trim().max(120).optional(),
  panImageFileName: z.string().trim().max(200).optional(),
  aadhaarFrontFileName: z.string().trim().max(200).optional(),
  aadhaarBackFileName: z.string().trim().max(200).optional(),
  personalPhotoFileName: z.string().trim().max(200).optional(),
  shopPhotoFileName: z.string().trim().max(200).optional(),
  personalPhotoLatitude: geoCoordSchema.optional(),
  personalPhotoLongitude: geoCoordSchema.optional(),
  shopPhotoLatitude: geoCoordSchema.optional(),
  shopPhotoLongitude: geoCoordSchema.optional(),
  /** Signup / shop geo — updates outlet_latitude / outlet_longitude when provided. */
  latitude: geoCoordSchema.optional(),
  longitude: geoCoordSchema.optional(),
});
export type KycSubmitInput = z.infer<typeof kycSubmitSchema>;
