import { z } from "zod";

const mobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile");

const mpinSchema = z.string().regex(/^\d{4}$/, "MPIN must be 4 digits");
const otpSchema = z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits");
const userIdSchema = z.string().uuid("Select a linked account");

export const linkStartSchema = z.object({ mobile: mobileSchema });
export type LinkStartInput = z.infer<typeof linkStartSchema>;

export const linkVerifySchema = z.object({
  mobile: mobileSchema,
  otp: otpSchema,
  mpin: mpinSchema,
});
export type LinkVerifyInput = z.infer<typeof linkVerifySchema>;

export const switchOtpSchema = z.object({ targetUserId: userIdSchema });
export type SwitchOtpInput = z.infer<typeof switchOtpSchema>;

export const switchSchema = z.object({
  targetUserId: userIdSchema,
  mpin: mpinSchema,
  /** Required when the target's last OTP verify is older than 24 h. */
  otp: otpSchema.optional(),
  /** Current session's refresh token — revoked on success. */
  refreshToken: z.string().min(1).max(2000).optional(),
  acceptedPolicyVersion: z.string().trim().max(40).optional(),
  policyChannel: z.enum(["web", "app"]).optional(),
  /** App only: trust this device for the target so Welcome-back MPIN works after restart. */
  deviceId: z.string().trim().min(8).max(100).optional(),
  deviceLabel: z.string().trim().max(150).optional(),
});
export type SwitchInput = z.infer<typeof switchSchema>;

export const unlinkParamSchema = z.object({ userId: userIdSchema });

export const unlinkQuerySchema = z.object({
  scope: z.enum(["one", "all"], { message: "Unlink scope must be one or all" }).optional().default("one"),
});
