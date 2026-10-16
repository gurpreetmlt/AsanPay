import {
  pgTable,
  bigserial,
  uuid,
  date,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/** Admin marks a business day closed after upload → recon → resolve. Close also locks per-bank balances (TB15). */
export const treasuryDailyCloses = pgTable(
  "treasury_daily_closes",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    businessDate: date("business_date").notNull(),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    uniqueIndex("treasury_daily_closes_tenant_date_uidx").on(table.tenantId, table.businessDate),
    index("treasury_daily_closes_tenant_closed_idx").on(table.tenantId, table.closedAt),
  ],
);
