import { bigint, pgTable, varchar } from "drizzle-orm/pg-core";

/**
 * Per-role sequential counters for public agent UIDs
 * (ASPRT100001, ASPD100001, ASPSD100001, ASPAD100001).
 */
export const uidCounters = pgTable("uid_counters", {
  role: varchar("role", { length: 32 }).primaryKey(),
  nextValue: bigint("next_value", { mode: "number" }).notNull(),
});
