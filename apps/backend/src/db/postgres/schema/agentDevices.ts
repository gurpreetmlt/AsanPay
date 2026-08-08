import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/**
 * The UIDAI L1 biometric scanner an agent transacts with — distinct from `devices`, which is
 * the phone running the app.
 *
 * Serial and licence expiry come from the RD Service INFO call, not from the agent. See
 * docs/DEVICE_REQUIREMENTS.md for the capture contract.
 *
 * Rows are soft-deleted: `deregistered_at` is set, never a DELETE. Two things depend on that
 * history — how often an agent swaps devices, and whether a serial that reappears under a new
 * agent is a hand-over or a device being shared.
 */
export const agentDevices = pgTable(
  "agent_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Uppercased, whitespace stripped, exactly as reported by the RD Service. */
    serial: varchar("serial", { length: 80 }).notNull(),
    vendor: varchar("vendor", { length: 60 }),
    model: varchar("model", { length: 60 }),
    /** RD licence expiry. Alerted 15 days out — an expired licence looks like a dead scanner. */
    rdLicenseExpiry: timestamp("rd_license_expiry", { withTimezone: true }),
    /** Purchase paperwork, captured once at registration so it's on hand for a later repair/RMA claim. */
    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    invoiceNumber: varchar("invoice_number", { length: 60 }),
    remarks: varchar("remarks", { length: 300 }),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    registeredIp: varchar("registered_ip", { length: 45 }),
    deregisteredAt: timestamp("deregistered_at", { withTimezone: true }),
    deregisteredBy: uuid("deregistered_by").references(() => users.id, { onDelete: "set null" }),
    deregisterReason: varchar("deregister_reason", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One serial, one active agent. A database constraint rather than a scheduled check, so the
    // second agent's registration fails as it happens.
    uniqueIndex("agent_devices_active_serial_uidx")
      .on(table.serial)
      .where(sql`${table.deregisteredAt} IS NULL`),
    index("agent_devices_user_idx").on(table.userId, table.registeredAt),
    index("agent_devices_expiry_idx")
      .on(table.rdLicenseExpiry)
      .where(sql`${table.deregisteredAt} IS NULL`),
  ],
);
