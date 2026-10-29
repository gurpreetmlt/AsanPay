import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "../../db/postgres";
import { nightServiceExceptions, tenants } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import { resolveTenantId } from "../fund-requests/tenant";
import { asSettings } from "../tenants/tenantSettings.service";
import { closedMessage, hmLabel, isInsideWindow, type NightWindow } from "./serviceWindow.math";
import { assertServiceNotBlocked } from "../agentControls/agentControls.service";

export { closedMessage, hmLabel, isInsideWindow, type NightWindow };

/**
 * Night service window: counter services (AePS, DMT, BBPS, recharge, CMS) close between `start` and
 * `end` IST every day; login, wallet, transfers, fund requests and settlements stay open. Admin can
 * keep a service group open at night for one agent (always, or until a time).
 */

export const SERVICE_GROUPS = ["aeps", "dmt", "bbps", "recharge", "cms"] as const;
export type ServiceGroup = (typeof SERVICE_GROUPS)[number];

export const SERVICE_GROUP_LABEL: Record<ServiceGroup, string> = {
  aeps: "AePS",
  dmt: "Money transfer (DMT)",
  bbps: "Bill payments (BBPS)",
  recharge: "Recharge",
  cms: "CMS",
};

const DEFAULT_WINDOW: NightWindow = { enabled: true, start: "00:00", end: "06:00" };
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CACHE_MS = 30_000;

let cache: { at: number; value: NightWindow } | null = null;

function normalize(raw: unknown): NightWindow {
  if (!raw || typeof raw !== "object") return DEFAULT_WINDOW;
  const r = raw as Partial<NightWindow>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_WINDOW.enabled,
    start: typeof r.start === "string" && HM.test(r.start) ? r.start : DEFAULT_WINDOW.start,
    end: typeof r.end === "string" && HM.test(r.end) ? r.end : DEFAULT_WINDOW.end,
  };
}

export async function getNightWindow(): Promise<NightWindow> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const tenantId = await resolveTenantId();
  const [row] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const value = normalize(asSettings(row?.settings).nightWindow);
  cache = { at: Date.now(), value };
  return value;
}

async function activeExceptionGroups(userId: string, now = new Date()): Promise<ServiceGroup[]> {
  const rows = await db
    .select({ group: nightServiceExceptions.serviceGroup })
    .from(nightServiceExceptions)
    .where(
      and(
        eq(nightServiceExceptions.userId, userId),
        or(isNull(nightServiceExceptions.until), gt(nightServiceExceptions.until, now)),
      ),
    );
  return rows.map((r) => r.group as ServiceGroup);
}

/** Throws a clear 423 when the group is closed for this agent right now (server clock, IST). */
export async function assertServiceOpen(userId: string, group: ServiceGroup): Promise<void> {
  const w = await getNightWindow();
  if (!isInsideWindow(w)) return;
  const open = await activeExceptionGroups(userId);
  if (open.includes(group)) return;
  throw new HttpError(423, closedMessage(w), "SERVICE_WINDOW_CLOSED");
}

/**
 * Route guard: `txnRouter.post("/aeps/withdraw", serviceWindowGuard("aeps"), …)`. Also rejects a
 * group the admin turned off for this agent — that wins over the night window.
 */
export function serviceWindowGuard(group: ServiceGroup) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    await assertServiceNotBlocked(req.auth.sub, group);
    await assertServiceOpen(req.auth.sub, group);
    next();
  };
}

/** GET /api/service-window — what the agent apps need for the banner and tile badges. */
export async function getMyServiceWindow(userId: string) {
  const w = await getNightWindow();
  const closedNow = isInsideWindow(w);
  return {
    ...w,
    startLabel: hmLabel(w.start),
    endLabel: hmLabel(w.end),
    closedNow,
    message: closedNow ? closedMessage(w) : null,
    openGroups: closedNow ? await activeExceptionGroups(userId) : [],
  };
}

/** PUT /admin/service-window */
export async function setNightWindow(adminId: string, input: NightWindow, reason: string) {
  if (!HM.test(input.start) || !HM.test(input.end)) {
    throw new HttpError(400, "Start and end must be times like 00:00 or 06:30", "INVALID_TIME");
  }
  if (input.start === input.end) {
    throw new HttpError(400, "Start and end cannot be the same time. Turn the window off instead.", "INVALID_TIME");
  }
  const tenantId = await resolveTenantId();
  const before = await getNightWindow();
  const next: NightWindow = { enabled: input.enabled, start: input.start, end: input.end };
  await db
    .update(tenants)
    .set({ settings: sql`${tenants.settings} || ${JSON.stringify({ nightWindow: next })}::jsonb` })
    .where(eq(tenants.id, tenantId));
  cache = null;
  await insertAuditLog({
    userId: adminId,
    action: "admin.night_window_update",
    entityType: "tenant",
    entityId: tenantId,
    metadata: { before, after: next, reason },
  });
  return next;
}

/** GET /admin/users/:id/night-access */
export async function listNightAccess(userId: string) {
  const rows = await db.select().from(nightServiceExceptions).where(eq(nightServiceExceptions.userId, userId));
  const now = Date.now();
  return SERVICE_GROUPS.map((group) => {
    const r = rows.find((x) => x.serviceGroup === group);
    const active = !!r && (!r.until || r.until.getTime() > now);
    return {
      group,
      label: SERVICE_GROUP_LABEL[group],
      active,
      mode: !r ? null : r.until ? ("until" as const) : ("always" as const),
      until: r?.until ? r.until.toISOString() : null,
      expired: !!r && !active,
      reason: r?.reason ?? null,
      updatedAt: r ? r.updatedAt.toISOString() : null,
    };
  });
}

/** PUT /admin/users/:id/night-access */
export async function setNightAccess(
  adminId: string,
  userId: string,
  input: { group: ServiceGroup; until: string | null; reason: string },
) {
  let until: Date | null = null;
  if (input.until) {
    until = new Date(input.until);
    if (Number.isNaN(until.getTime())) throw new HttpError(400, "Open until must be a valid date and time", "INVALID_DATE");
    if (until.getTime() <= Date.now()) throw new HttpError(400, "Open until must be in the future", "INVALID_DATE");
  }
  const now = new Date();
  await db
    .insert(nightServiceExceptions)
    .values({ userId, serviceGroup: input.group, until, reason: input.reason, createdBy: adminId, updatedAt: now })
    .onConflictDoUpdate({
      target: [nightServiceExceptions.userId, nightServiceExceptions.serviceGroup],
      set: { until, reason: input.reason, createdBy: adminId, updatedAt: now },
    });
  await insertAuditLog({
    userId: adminId,
    action: "admin.night_access_set",
    entityType: "user",
    entityId: userId,
    metadata: { group: input.group, until: until?.toISOString() ?? null, reason: input.reason },
  });
  return listNightAccess(userId);
}

/** DELETE /admin/users/:id/night-access/:group */
export async function clearNightAccess(adminId: string, userId: string, group: ServiceGroup, reason: string) {
  await db
    .delete(nightServiceExceptions)
    .where(and(eq(nightServiceExceptions.userId, userId), eq(nightServiceExceptions.serviceGroup, group)));
  await insertAuditLog({
    userId: adminId,
    action: "admin.night_access_clear",
    entityType: "user",
    entityId: userId,
    metadata: { group, reason },
  });
  return listNightAccess(userId);
}
