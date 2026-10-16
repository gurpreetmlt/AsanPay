import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  date,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { bankAccounts } from "./banking";

/** Per bank per day opening/closing snapshot locked when the business day is closed (TB15). */
export const bankDailyBalanceLocks = pgTable(
  "bank_daily_balance_locks",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    bankAccountId: bigint("bank_account_id", { mode: "bigint" })
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    businessDate: date("business_date").notNull(),
    /** Statement opening in paise (derived from first line balance_after ± amount). */
    statementOpening: bigint("statement_opening", { mode: "bigint" }),
    /** Statement closing in paise (last line balance_after). */
    statementClosing: bigint("statement_closing", { mode: "bigint" }),
    booksOpening: bigint("books_opening", { mode: "bigint" }).notNull(),
    booksClosing: bigint("books_closing", { mode: "bigint" }).notNull(),
    /** statement_closing − books_closing at lock time (null if no statement closing). */
    closingDiff: bigint("closing_diff", { mode: "bigint" }),
    lockedBy: uuid("locked_by").references(() => users.id, { onDelete: "set null" }),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bank_daily_balance_locks_bank_date_uidx").on(table.bankAccountId, table.businessDate),
    index("bank_daily_balance_locks_tenant_date_idx").on(table.tenantId, table.businessDate),
  ],
);
