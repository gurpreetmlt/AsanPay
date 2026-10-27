import { pgTable, uuid, varchar, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { kycCheckStatusEnum } from "./enums";
import { users } from "./users";

export type KycVerificationSlotState = {
  status: (typeof kycCheckStatusEnum.enumValues)[number];
  crossCheck: (typeof kycCheckStatusEnum.enumValues)[number] | null;
  message: string;
  crossCheckMessage?: string;
  checkedAt: string;
};

/** Per-photo results + the agent-facing reason behind each non-verified check. No raw PAN / Aadhaar. */
export type KycVerificationDetails = {
  slots?: Partial<Record<"panImage" | "aadhaarFront" | "aadhaarBack", KycVerificationSlotState>>;
  reasons?: Partial<Record<"panNumber" | "panImage" | "aadhaarOtp" | "aadhaarImage" | "crossCheck", string>>;
};

/**
 * One row per agent. `overall` = admin decision when there is one, otherwise the worst of the five
 * checks. History lives in `audit_logs` (`kyc.status_changed`).
 */
export const kycVerifications = pgTable("kyc_verifications", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  panNumber: kycCheckStatusEnum("pan_number").notNull().default("pending"),
  panImage: kycCheckStatusEnum("pan_image").notNull().default("pending"),
  aadhaarOtp: kycCheckStatusEnum("aadhaar_otp").notNull().default("pending"),
  aadhaarImage: kycCheckStatusEnum("aadhaar_image").notNull().default("pending"),
  crossCheck: kycCheckStatusEnum("cross_check").notNull().default("pending"),
  overall: kycCheckStatusEnum("overall").notNull().default("pending"),
  aadhaarProviderRequestId: varchar("aadhaar_provider_request_id", { length: 128 }),
  details: jsonb("details").$type<KycVerificationDetails>().notNull().default({}),
  reviewDecision: varchar("review_decision", { length: 10 }).$type<"approved" | "rejected">(),
  reviewReason: text("review_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
