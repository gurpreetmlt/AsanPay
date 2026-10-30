import { eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { tenants } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import { resolveTenantId } from "../fund-requests/tenant";
import { asSettings } from "../tenants/tenantSettings.service";

/**
 * DMT bank rails the agent can pick on the money transfer screen, in admin priority order
 * (Admin → API Providers → DMT bank rails). `live: false` rails show as Coming soon until their
 * provider flow is built.
 */
export const DMT_RAILS = [
  { code: "airtel", name: "Airtel Payments Bank", shortName: "Airtel", live: true },
  { code: "jio", name: "Jio Payments Bank", shortName: "Jio", live: false },
  { code: "fino", name: "Fino Payments Bank", shortName: "Fino", live: false },
] as const;

export type DmtRailCode = (typeof DMT_RAILS)[number]["code"];

export interface DmtRailRow {
  code: DmtRailCode;
  name: string;
  shortName: string;
  live: boolean;
  enabled: boolean;
  priority: number;
}

type Stored = { order?: string[]; disabled?: string[] };

const CACHE_MS = 30_000;
let cache: { at: number; value: DmtRailRow[] } | null = null;

const isRail = (code: string): code is DmtRailCode => DMT_RAILS.some((r) => r.code === code);

function build(stored: Stored): DmtRailRow[] {
  const order = (stored.order ?? []).filter(isRail);
  for (const r of DMT_RAILS) if (!order.includes(r.code)) order.push(r.code);
  const disabled = new Set((stored.disabled ?? []).filter(isRail));
  return order.map((code, i) => {
    const def = DMT_RAILS.find((r) => r.code === code)!;
    return { ...def, enabled: !disabled.has(code), priority: i + 1 };
  });
}

/** Every rail in priority order (admin view). */
export async function listDmtRails(): Promise<DmtRailRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const tenantId = await resolveTenantId();
  const [row] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const value = build((asSettings(row?.settings).dmtRails ?? {}) as Stored);
  cache = { at: Date.now(), value };
  return value;
}

/** Rails the agent sees: switched-on only, priority order. */
export async function listAgentDmtRails(): Promise<DmtRailRow[]> {
  return (await listDmtRails()).filter((r) => r.enabled);
}

export async function setDmtRails(
  adminId: string,
  input: { order: string[]; disabled: string[] },
  reason: string,
): Promise<DmtRailRow[]> {
  const unknown = [...input.order, ...input.disabled].find((c) => !isRail(c));
  if (unknown) throw new HttpError(422, `Unknown DMT rail "${unknown}"`, "DMT_RAIL_UNKNOWN");
  if (new Set(input.order).size !== input.order.length) {
    throw new HttpError(422, "Each DMT rail can appear only once in the priority order", "DMT_RAIL_DUPLICATE");
  }
  const next = build({ order: input.order, disabled: input.disabled });
  if (!next.some((r) => r.enabled && r.live)) {
    throw new HttpError(
      422,
      "Keep at least one working DMT rail switched on, or turn DMT off in the service controls instead",
      "DMT_RAIL_NONE_LIVE",
    );
  }
  const before = await listDmtRails();
  const stored: Stored = { order: next.map((r) => r.code), disabled: next.filter((r) => !r.enabled).map((r) => r.code) };
  const tenantId = await resolveTenantId();
  await db
    .update(tenants)
    .set({ settings: sql`${tenants.settings} || ${JSON.stringify({ dmtRails: stored })}::jsonb` })
    .where(eq(tenants.id, tenantId));
  cache = null;
  await insertAuditLog({
    userId: adminId,
    action: "admin.dmt_rails_update",
    entityType: "tenant",
    entityId: tenantId,
    metadata: {
      before: before.map((r) => ({ code: r.code, enabled: r.enabled })),
      after: next.map((r) => ({ code: r.code, enabled: r.enabled })),
      reason,
    },
  });
  return next;
}
