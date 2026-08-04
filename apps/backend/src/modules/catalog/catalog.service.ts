import { eq, asc } from "drizzle-orm";
import type { CatalogCategory } from "@asanpay/shared-types";
import { db } from "../../db/postgres";
import { serviceCategories, services } from "../../db/postgres/schema";

export type CatalogCategoryView = CatalogCategory;

/** Fixed harness codes owned by verify:shim — not product rails. */
const HARNESS_CODES = new Set(["SHIM_BANK", "SHIM_OTH", "SHIM_UNMAPPED"]);

/** Product-hidden (duplicate Agent Collection / SHG / empty More category shell). */
const HIDDEN_SERVICE_CODES = new Set([
  "AGENT_COLLECTION",
  "SHG_WITHDRAW_CASH",
  "SHG_DEPOSIT_CASH",
]);
const HIDDEN_CATEGORY_CODES = new Set(["SHG_SERVICES"]);

/**
 * Test / ledger-harness artefacts must never appear to agents.
 * Provider rail is chosen at runtime via adapters (AEPS_PROVIDER_MODE etc.) — not via
 * catalog tiles named after a specific third party.
 */
function isHarnessCatalogCode(code: string): boolean {
  return HARNESS_CODES.has(code.toUpperCase());
}

function isHiddenCatalogCode(code: string): boolean {
  return HIDDEN_SERVICE_CODES.has(code) || HIDDEN_CATEGORY_CODES.has(code);
}

export async function getCatalog(): Promise<CatalogCategoryView[]> {
  const categories = await db
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.isActive, true))
    .orderBy(asc(serviceCategories.displayOrder));

  const allServices = await db
    .select({
      id: services.id,
      code: services.code,
      name: services.name,
      badge: services.badge,
      icon: services.icon,
      categoryId: services.categoryId,
    })
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.displayOrder));

  return categories
    .filter((category) => !isHarnessCatalogCode(category.code) && !isHiddenCatalogCode(category.code))
    .map((category) => ({
      id: category.id,
      code: category.code,
      name: category.name,
      icon: category.icon,
      services: allServices
        .filter(
          (service) =>
            service.categoryId === category.id &&
            !isHarnessCatalogCode(service.code) &&
            !HIDDEN_SERVICE_CODES.has(service.code),
        )
        .map(({ id, code, name, badge, icon }) => ({ id, code, name, badge, icon })),
    }))
    .filter((category) => category.services.length > 0);
}
