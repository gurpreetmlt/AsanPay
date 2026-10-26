import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Drives the tile grid in retailer-web/retailer-app: "Banking Services", "Recharges and Bills", etc.
export const serviceCategories = pgTable("service_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 100 }),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

// One row per tile: Cash Withdraw, Mobile Prepaid, DTH, Electricity, LIC, eChallan, etc.
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => serviceCategories.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 60 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    // SVG filename under apps/agent-portal/public/service-icons/, e.g. "Cash-Withdraw.svg"
    icon: varchar("icon", { length: 100 }),
    // Small display-only teaser shown on the tile itself, e.g. "Upto 2%", "Flat ₹1", "NEW".
    // Cosmetic — the real commission preview comes from commission_rules once that's wired up.
    badge: varchar("badge", { length: 20 }),
    minAmount: numeric("min_amount", { precision: 14, scale: 2 }),
    maxAmount: numeric("max_amount", { precision: 14, scale: 2 }),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [index("services_category_idx").on(table.categoryId)],
);

// Noble, VyaparAPI, etc. — the swappable side of the wrapper API architecture.
export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  baseUrl: text("base_url"),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  // Paise. Admin Treasury warns when this provider's float drops below it; NULL = no warning.
  lowBalanceThreshold: bigint("low_balance_threshold", { mode: "bigint" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Which provider(s) can fulfil a given internal service, and in what order to try them.
// This is the table the wrapper layer reads to route/fail-over between providers without
// any code change when you add or drop one.
export const providerServices = pgTable(
  "provider_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    providerServiceCode: varchar("provider_service_code", { length: 100 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [uniqueIndex("provider_services_service_provider_key").on(table.serviceId, table.providerId)],
);
