import {
  pgTable,
  uuid,
  varchar,
  smallint,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const LOGIN_APPROVAL_STATUSES = ["pending", "approved", "denied", "expired"] as const;
export type LoginApprovalStatus = (typeof LOGIN_APPROVAL_STATUSES)[number];

/** ok ≤ 5 km · near ≤ 50 km · far > 50 km · unknown (no shop GPS / weak fix) · mock (fake GPS). */
export const LOGIN_LOCATION_STATUSES = ["ok", "near", "far", "unknown", "mock"] as const;
export type LoginLocationStatus = (typeof LOGIN_LOCATION_STATUSES)[number];

/**
 * Agent web sign-in waiting for the user's trusted phone. Password / OTP: the phone picks
 * `match_number` out of `match_choices`. QR: `user_id` stays null until a phone scans the code.
 * Every approve records the phone's GPS (distance to the registered shop) and IP. The browser
 * polls with a one-time secret (only its hash is stored); tokens are issued once, on the first
 * poll after approval.
 */
export const loginApprovals = pgTable(
  "login_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** pending | approved | denied | expired */
    status: varchar("status", { length: 10 }).notNull().default("pending"),
    matchNumber: smallint("match_number"),
    matchChoices: jsonb("match_choices").$type<number[]>(),
    /** e.g. "Chrome on macOS" — shown on the phone. */
    browser: varchar("browser", { length: 150 }),
    ip: varchar("ip", { length: 64 }),
    city: varchar("city", { length: 80 }),
    userAgent: varchar("user_agent", { length: 300 }),
    /** Browser device id (agent web localStorage) — trusted on approve. */
    deviceId: varchar("device_id", { length: 100 }),
    /** password | otp | qr */
    loginMethod: varchar("login_method", { length: 10 }).notNull(),
    pollTokenHash: varchar("poll_token_hash", { length: 64 }).notNull(),
    /** QR login: hash of the secret inside the QR. */
    qrSecretHash: varchar("qr_secret_hash", { length: 64 }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    phoneLatitude: varchar("phone_latitude", { length: 32 }),
    phoneLongitude: varchar("phone_longitude", { length: 32 }),
    phoneAccuracyM: integer("phone_accuracy_m"),
    phoneMock: boolean("phone_mock"),
    phoneIp: varchar("phone_ip", { length: 64 }),
    distanceKm: real("distance_km"),
    /** Phone and browser on the same public IP (same Wi-Fi). */
    sameNetwork: boolean("same_network"),
    locationStatus: varchar("location_status", { length: 10 }),
    /** Why it was denied: user | wrong_number | mock_location. */
    denyReason: varchar("deny_reason", { length: 20 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Phone that approved / denied. */
    decidedDeviceId: varchar("decided_device_id", { length: 100 }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("login_approvals_user_status_idx").on(table.userId, table.status, table.expiresAt)],
);
