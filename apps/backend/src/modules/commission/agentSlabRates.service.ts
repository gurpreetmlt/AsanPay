import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/postgres";
import { services, userCommissionRates, users } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { assertCommissionMonthUnlocked, recordRateChangeEvent } from "./commission.guards";
import { isSchemeRole, normalizeAmountBound } from "./commission.service";

/**
 * Per-agent commission by slab (admin → agent → Commission). A row covers one service and optionally one
 * amount slab, and pays either a share of what the provider pays or a flat ₹. Payout picks the narrowest
 * matching slab row, then a whole-service row, before the role defaults (see findActiveOverride).
 */

export type AgentSlabRateInput = {
  serviceId: string;
  minAmount?: string | null;
  maxAmount?: string | null;
  /** share = % of what the provider pays; flat = ₹ per txn. */
  mode: "share" | "flat";
  value: string;
  expiresAt?: string | null;
  reason?: string | null;
};

const str = (v: string | number | null) => (v == null ? null : String(v));

function snapshot(r: typeof userCommissionRates.$inferSelect): Record<string, unknown> {
  return {
    serviceId: r.serviceId,
    minAmount: str(r.minAmount),
    maxAmount: str(r.maxAmount),
    ruleType: r.ruleType,
    value: String(r.value),
    sharePercent: str(r.sharePercent),
    isActive: r.isActive,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  };
}

function requireReason(reason: string | null | undefined): string {
  const r = reason?.trim() ?? "";
  if (r.length < 3) throw new HttpError(400, "Enter a reason for this change (at least 3 characters)", "REASON_REQUIRED");
  return r;
}

async function assertAgent(userId: string) {
  const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new HttpError(404, "Agent not found. Refresh the page.", "USER_NOT_FOUND");
  if (!isSchemeRole(user.role)) {
    throw new HttpError(400, "Custom commission is only for Retailers, Distributors and Super Distributors", "INVALID_TARGET");
  }
}

/** GET /admin/users/:id/commission-slabs — every custom rate row of the agent (slab and whole-service). */
export async function listAgentSlabRates(userId: string) {
  await assertAgent(userId);
  const rows = await db.select().from(userCommissionRates).where(eq(userCommissionRates.userId, userId));
  return rows.map((r) => ({
    id: r.id,
    serviceId: r.serviceId,
    minAmount: str(r.minAmount),
    maxAmount: str(r.maxAmount),
    ruleType: r.ruleType,
    value: String(r.value),
    sharePercent: str(r.sharePercent),
    isActive: r.isActive,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** POST /admin/users/:id/commission-slabs — create or replace the agent's rate for one service slab. */
export async function setAgentSlabRate(adminId: string, userId: string, input: AgentSlabRateInput) {
  const reason = requireReason(input.reason);
  await assertAgent(userId);
  const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.id, input.serviceId)).limit(1);
  if (!svc) throw new HttpError(400, "Service not found. Refresh the page.", "INVALID_SERVICE");

  const n = Number(input.value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "Commission must be 0 or more", "INVALID_VALUE");
  if (input.mode === "share" && n > 100) throw new HttpError(400, "Share must be from 0 to 100%", "INVALID_VALUE");
  const flatCap = env.MAX_FLAT_COMMISSION_RUPEES;
  if (input.mode === "flat" && n > flatCap) throw new HttpError(400, `Flat commission cannot exceed ₹${flatCap}`, "INVALID_VALUE");

  const minAmount = normalizeAmountBound(input.minAmount, "minAmount");
  const maxAmount = normalizeAmountBound(input.maxAmount, "maxAmount");
  if (minAmount != null && maxAmount != null && Number(minAmount) > Number(maxAmount)) {
    throw new HttpError(400, "Slab from cannot be more than Slab to", "INVALID_AMOUNT");
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt != null && String(input.expiresAt).trim() !== "") {
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new HttpError(400, "Valid until must be a valid date", "INVALID_DATE");
    if (expiresAt.getTime() <= Date.now()) throw new HttpError(400, "Valid until must be in the future", "INVALID_DATE");
  }
  await assertCommissionMonthUnlocked([]);

  const values =
    input.mode === "share"
      ? { ruleType: "percentage" as const, value: "0.0000", sharePercent: n.toFixed(4) }
      : { ruleType: "flat" as const, value: n.toFixed(4), sharePercent: null };

  const sameSlab = and(
    eq(userCommissionRates.userId, userId),
    eq(userCommissionRates.serviceId, input.serviceId),
    minAmount != null ? eq(userCommissionRates.minAmount, minAmount) : isNull(userCommissionRates.minAmount),
    maxAmount != null ? eq(userCommissionRates.maxAmount, maxAmount) : isNull(userCommissionRates.maxAmount),
  );
  const [existing] = await db.select().from(userCommissionRates).where(sameSlab).limit(1);

  const [saved] = existing
    ? await db
        .update(userCommissionRates)
        .set({ ...values, isActive: true, expiresAt, updatedAt: new Date() })
        .where(eq(userCommissionRates.id, existing.id))
        .returning()
    : await db
        .insert(userCommissionRates)
        .values({ userId, serviceId: input.serviceId, minAmount, maxAmount, ...values, isActive: true, expiresAt })
        .returning();
  if (!saved) throw new HttpError(500, "Custom commission was not saved. Try again.", "OVERRIDE_SAVE_FAILED");

  await recordRateChangeEvent({
    adminId,
    entityType: "override",
    entityId: saved.id,
    userId,
    serviceId: input.serviceId,
    before: existing ? snapshot(existing) : null,
    after: snapshot(saved),
    reason,
  });
  await insertAuditLog({
    userId: adminId,
    action: "admin.agent_slab_rate_set",
    entityType: "user_commission_rate",
    entityId: saved.id,
    metadata: { userId, serviceId: input.serviceId, minAmount, maxAmount, mode: input.mode, value: n },
  });
  return { id: saved.id, rate: snapshot(saved) };
}

/** DELETE /admin/users/:id/commission-slabs/:rateId — back to the role default for that slab. */
export async function deleteAgentSlabRate(adminId: string, userId: string, rateId: string, reasonRaw?: string | null) {
  const reason = requireReason(reasonRaw);
  const [existing] = await db
    .select()
    .from(userCommissionRates)
    .where(and(eq(userCommissionRates.id, rateId), eq(userCommissionRates.userId, userId)))
    .limit(1);
  if (!existing) throw new HttpError(404, "Custom commission not found. Refresh the page.", "OVERRIDE_NOT_FOUND");
  await assertCommissionMonthUnlocked([]);

  await db.delete(userCommissionRates).where(eq(userCommissionRates.id, rateId));
  await recordRateChangeEvent({
    adminId,
    entityType: "override",
    entityId: rateId,
    userId,
    serviceId: existing.serviceId,
    before: snapshot(existing),
    after: null,
    reason,
  });
  await insertAuditLog({
    userId: adminId,
    action: "admin.agent_slab_rate_delete",
    entityType: "user_commission_rate",
    entityId: rateId,
    metadata: { userId, serviceId: existing.serviceId },
  });
  return { id: rateId, deleted: true };
}
