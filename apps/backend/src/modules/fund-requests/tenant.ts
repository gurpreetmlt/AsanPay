import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { tenants } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";

const LEGACY_TENANT_CODE = "ASANPAY";

let cachedTenantId: string | null = null;

/** Single-tenant resolution until JWT carries tenant_id. Matches wallet.ledger convention. */
export async function resolveTenantId(): Promise<string> {
  if (cachedTenantId) return cachedTenantId;

  const [row] = await db
    .select({ id: tenants.id, isActive: tenants.isActive })
    .from(tenants)
    .where(eq(tenants.code, LEGACY_TENANT_CODE))
    .limit(1);

  if (!row) {
    throw new HttpError(500, `Tenant ${LEGACY_TENANT_CODE} does not exist`, "TENANT_NOT_FOUND");
  }
  if (!row.isActive) {
    throw new HttpError(500, `Tenant ${LEGACY_TENANT_CODE} is inactive`, "TENANT_INACTIVE");
  }

  cachedTenantId = row.id;
  return cachedTenantId;
}
