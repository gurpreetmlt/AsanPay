import { pgTable, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * One login session per provider, shared by every process (API, Jobs, scripts). Providers cap
 * logins per day, so a token must be reused across restarts instead of re-logging in.
 */
export const providerSessions = pgTable("provider_sessions", {
  providerCode: varchar("provider_code", { length: 40 }).primaryKey(),
  /** encryptPII output — never store the raw token. */
  tokenEncrypted: text("token_encrypted").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  obtainedAt: timestamp("obtained_at", { withTimezone: true }).notNull().defaultNow(),
  /** api | jobs | script */
  obtainedBy: varchar("obtained_by", { length: 20 }).notNull(),
  /** IST day (YYYY-MM-DD) that loginCount belongs to. */
  loginCountDay: varchar("login_count_day", { length: 10 }),
  loginCount: integer("login_count").notNull().default(0),
});
