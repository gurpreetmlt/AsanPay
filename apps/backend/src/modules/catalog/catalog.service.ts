import { eq, asc } from "drizzle-orm";
import type { CatalogCategory } from "@asanpay/shared-types";
import { db } from "../../db/postgres";
import { serviceCategories, services } from "../../db/postgres/schema";

export type CatalogCategoryView = CatalogCategory;

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

  return categories.map((category) => ({
    id: category.id,
    code: category.code,
    name: category.name,
    icon: category.icon,
    services: allServices
      .filter((service) => service.categoryId === category.id)
      .map(({ id, code, name, badge, icon }) => ({ id, code, name, badge, icon })),
  }));
}
