import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const RISK_SIGNAL_TYPES = [
  "mock_location",
  "low_accuracy_ignored",
  "gps_missing",
  "ip_geo_mismatch",
  "out_of_zone",
  "device_change_flag",
  "device_change_investigate",
  "rd_license_expiring",
  "txn_velocity_spike",
  /** Signup shop GPS is far from the typed shop pincode. */
  "shop_far_from_pincode",
  /** Phone that captured a signup location used a foreign IP or a proxy / VPN. */
  "possible_vpn",
  /** App reported a rooted / jailbroken phone while capturing a signup location. */
  "rooted_device",
] as const;
export type RiskSignalType = (typeof RISK_SIGNAL_TYPES)[number];

export const RISK_SIGNAL_SEVERITIES = ["info", "warn", "critical"] as const;
export type RiskSignalSeverity = (typeof RISK_SIGNAL_SEVERITIES)[number];

/**
 * Log-only device and location findings — task #15. Nothing that writes here may also block a
 * transaction; every threshold is unproven until there is a month of real volume to calibrate
 * against. See modules/risk/riskSignal.service.ts for the evaluators.
 */
export const agentRiskSignals = pgTable(
  "agent_risk_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signalType: varchar("signal_type", { length: 40 }).notNull(),
    severity: varchar("severity", { length: 10 }).notNull().default("info"),
    referenceId: varchar("reference_id", { length: 80 }),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_risk_signals_user_idx").on(table.userId, table.createdAt),
    index("agent_risk_signals_type_idx").on(table.signalType, table.createdAt),
    index("agent_risk_signals_unreviewed_idx")
      .on(table.createdAt)
      .where(sql`${table.reviewedAt} IS NULL`),
  ],
);
