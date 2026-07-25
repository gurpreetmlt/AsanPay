import type { CatalogService, CatalogCategory } from "@asanpay/shared-types";

export type { CatalogService };

export function flattenCatalogServices(categories: CatalogCategory[]): CatalogService[] {
  return categories.flatMap((c) => c.services);
}
