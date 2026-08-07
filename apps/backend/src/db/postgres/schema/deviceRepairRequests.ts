import { pgTable, pgEnum, uuid, varchar, text, date, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { agentDevices } from "./agentDevices";

export const deviceRepairStatusEnum = pgEnum("device_repair_status", [
  "submitted",
  "rma_issued",
  "in_repair",
  "resolved",
  "rejected",
]);

/**
 * Repair / RMA tickets for agent hardware — biometric scanners, MATM, printers. Kept separate
 * from agent_devices so "this device broke" and "this serial was swapped" are distinguishable
 * data: without it, the change-frequency signal in modules/risk/riskSignal.service.ts would
 * keep flagging an agent whose scanner genuinely failed.
 */
export const deviceRepairRequests = pgTable(
  "device_repair_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentDeviceId: uuid("agent_device_id").references(() => agentDevices.id, { onDelete: "set null" }),
    deviceType: varchar("device_type", { length: 40 }).notNull().default("biometric_machine"),
    serial: varchar("serial", { length: 80 }).notNull(),
    vendor: varchar("vendor", { length: 60 }),
    model: varchar("model", { length: 60 }),
    issueType: varchar("issue_type", { length: 60 }).notNull(),
    invoiceDate: date("invoice_date"),
    invoiceNumber: varchar("invoice_number", { length: 80 }),
    remarks: text("remarks").notNull(),
    /** Client-hosted URLs — no server-side upload exists in this codebase; see fund_requests.receiptUrl for the same convention. */
    photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default([]),
    status: deviceRepairStatusEnum("status").notNull().default("submitted"),
    rmaNumber: varchar("rma_number", { length: 60 }),
    resolutionNote: text("resolution_note"),
    replacedWithDeviceId: uuid("replaced_with_device_id").references(() => agentDevices.id, {
      onDelete: "set null",
    }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("device_repair_requests_user_idx").on(table.userId, table.submittedAt),
    index("device_repair_requests_status_idx").on(table.status, table.submittedAt),
  ],
);
