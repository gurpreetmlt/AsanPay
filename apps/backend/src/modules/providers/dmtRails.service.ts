import { eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { tenants, users } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import { resolveTenantId } from "../fund-requests/tenant";
import { asSettings } from "../tenants/tenantSettings.service";

/**
 * DMT bank rails the agent can pick on the money transfer screen, in admin priority order
 * (Admin → API Providers → DMT bank rails). `live: false` rails show as Coming soon; a `pilot`
 * rail has its flow built and is live only for the test retailers admin lists on the same card.
 */
export const DMT_RAILS = [
  { code: "airtel", name: "Airtel Payments Bank", shortName: "Airtel", live: true, pilot: false },
  { code: "jio", name: "Jio Payments Bank", shortName: "Jio", live: false, pilot: true },
  { code: "fino", name: "Fino Payments Bank", shortName: "Fino", live: false, pilot: false },
] as const;

export type DmtRailCode = (typeof DMT_RAILS)[number]["code"];

export const DMT_RAIL_CODES = DMT_RAILS.map((r) => r.code) as [DmtRailCode, ...DmtRailCode[]];

export function dmtRailName(code: unknown): string | null {
  return DMT_RAILS.find((r) => r.code === code)?.name ?? null;
}

export interface DmtRailRow {
  code: DmtRailCode;
  name: string;
  shortName: string;
  live: boolean;
  pilot: boolean;
  enabled: boolean;
  priority: number;
}

type Stored = { order?: string[]; disabled?: string[]; pilotMobiles?: string[] };

export interface DmtRailSettings {
  rails: DmtRailRow[];
  /** Retailer login mobiles that may use `pilot` rails before they go live for everyone. */
  pilotMobiles: string[];
}

const CACHE_MS = 30_000;
let cache: { at: number; value: DmtRailSettings } | null = null;

const MOBILE_RE = /^[6-9]\d{9}$/;

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

/** Every rail in priority order + the pilot retailer list (admin view). */
export async function getDmtRailSettings(): Promise<DmtRailSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const tenantId = await resolveTenantId();
  const [row] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const stored = (asSettings(row?.settings).dmtRails ?? {}) as Stored;
  const value: DmtRailSettings = {
    rails: build(stored),
    pilotMobiles: (stored.pilotMobiles ?? []).filter((m) => MOBILE_RE.test(m)),
  };
  cache = { at: Date.now(), value };
  return value;
}

export async function listDmtRails(): Promise<DmtRailRow[]> {
  return (await getDmtRailSettings()).rails;
}

async function isPilotRetailer(userId: string): Promise<boolean> {
  const pilots = (await getDmtRailSettings()).pilotMobiles;
  if (pilots.length === 0) return false;
  const [user] = await db.select({ mobile: users.mobile }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(user?.mobile && pilots.includes(user.mobile));
}

/** Rails the agent sees: switched-on only, priority order; pilot rails are live for pilot retailers. */
export async function listAgentDmtRails(userId: string): Promise<DmtRailRow[]> {
  const rails = (await listDmtRails()).filter((r) => r.enabled);
  if (!rails.some((r) => !r.live && DMT_RAILS.find((d) => d.code === r.code)?.pilot)) return rails;
  const pilot = await isPilotRetailer(userId);
  return rails.map((r) => (pilot && DMT_RAILS.find((d) => d.code === r.code)?.pilot ? { ...r, live: true } : r));
}

/** Every DMT call names its rail; refuse rails that are switched off or not live for this retailer. */
export async function assertDmtRailUsable(code: DmtRailCode, userId: string): Promise<void> {
  const rail = (await listDmtRails()).find((r) => r.code === code);
  if (!rail) throw new HttpError(422, `Unknown DMT rail "${code}"`, "DMT_RAIL_UNKNOWN");
  if (!rail.enabled) {
    throw new HttpError(
      422,
      `${rail.name} money transfer is switched off right now. Pick another bank above.`,
      "DMT_RAIL_OFF",
    );
  }
  if (rail.live) return;
  const def = DMT_RAILS.find((d) => d.code === code)!;
  if (def.pilot && (await isPilotRetailer(userId))) return;
  throw new HttpError(
    422,
    `${rail.name} money transfer is coming soon. Pick another bank above.`,
    "DMT_RAIL_COMING_SOON",
  );
}

export async function setDmtRails(
  adminId: string,
  input: { order: string[]; disabled: string[]; pilotMobiles?: string[] },
  reason: string,
): Promise<DmtRailSettings> {
  const badMobile = input.pilotMobiles?.find((m) => !MOBILE_RE.test(m));
  if (badMobile !== undefined) {
    throw new HttpError(422, `Test retailer mobile "${badMobile}" is not a valid 10-digit mobile`, "DMT_PILOT_MOBILE_INVALID");
  }
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
  const before = await getDmtRailSettings();
  const pilotMobiles = input.pilotMobiles ? [...new Set(input.pilotMobiles)] : before.pilotMobiles;
  const stored: Stored = {
    order: next.map((r) => r.code),
    disabled: next.filter((r) => !r.enabled).map((r) => r.code),
    pilotMobiles,
  };
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
      before: before.rails.map((r) => ({ code: r.code, enabled: r.enabled })),
      after: next.map((r) => ({ code: r.code, enabled: r.enabled })),
      pilotMobilesBefore: before.pilotMobiles,
      pilotMobilesAfter: pilotMobiles,
      reason,
    },
  });
  return { rails: next, pilotMobiles };
}
