import { pgTable, uuid, varchar, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Service groups an admin turned off for one agent (admin → agent → Services & limits).
 * A row means blocked; turning the service back on deletes the row (the audit log keeps history).
 */
export const agentServiceBlocks = pgTable(
  "agent_service_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** aeps | dmt | bbps | recharge | cms | upi_cash_point */
    serviceGroup: varchar("service_group", { length: 20 }).notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_service_blocks_user_group_key").on(t.userId, t.serviceGroup)],
);

/**
 * Per-agent transaction limits for one service group, in rupees. Null column = platform default.
 * Counted against success + pending + initiated transactions (IST day / IST month).
 */
export const agentTxnLimits = pgTable(
  "agent_txn_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceGroup: varchar("service_group", { length: 20 }).notNull(),
    perTxnRupees: numeric("per_txn_rupees", { precision: 14, scale: 2 }),
    dailyRupees: numeric("daily_rupees", { precision: 14, scale: 2 }),
    monthlyRupees: numeric("monthly_rupees", { precision: 14, scale: 2 }),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_txn_limits_user_group_key").on(t.userId, t.serviceGroup)],
);
