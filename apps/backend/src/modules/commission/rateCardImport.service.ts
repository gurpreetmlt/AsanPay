import { and, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import {
  commissionRateChangeEvents,
  commissionShares,
  providerPayoutRules,
  rateCardImports,
  services as servicesTable,
  users,
} from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { resolveTenantId } from "../fund-requests/tenant";
import { normalizeAmountBound } from "./commission.service";
import { endCommissionShare, endProviderIncomeRule, setCommissionShare, setProviderIncomeRule } from "./rateCard.service";
import {
  importChangeSchema,
  undoBlockReason,
  undoOpOf,
  undoReasonOf,
  type ImportChange,
  type UndoOp,
} from "./rateCardImport.ops";

export type ImportServiceSummary = { serviceId: string; serviceName: string; providerName: string; changes: number };

export async function recordRateCardImport(
  adminId: string,
  input: {
    fileName: string;
    reason?: string | null;
    services: ImportServiceSummary[];
    changes: ImportChange[];
    inverseChanges: ImportChange[];
  },
) {
  if (input.changes.length === 0) {
    throw new HttpError(400, "Nothing was imported — record an import only after at least one change saved", "IMPORT_EMPTY");
  }
  // Fail now (not at undo time) when a restore step could never be replayed.
  input.inverseChanges.forEach(undoOpOf);
  const tenantId = await resolveTenantId();
  const [row] = await db
    .insert(rateCardImports)
    .values({
      tenantId,
      adminId,
      fileName: input.fileName.trim().slice(0, 200) || "rate-card",
      reason: input.reason?.trim() || null,
      services: input.services,
      changeCount: input.changes.length,
      inverseChanges: input.inverseChanges,
    })
    .returning({ id: rateCardImports.id, createdAt: rateCardImports.createdAt });
  if (!row) throw new HttpError(500, "The import was saved but could not be added to Import history", "IMPORT_RECORD_FAILED");

  await insertAuditLog({
    userId: adminId,
    action: "admin.rate_card_import",
    entityType: "rate_card_import",
    entityId: row.id,
    metadata: {
      fileName: input.fileName,
      changeCount: input.changes.length,
      restoreCount: input.inverseChanges.length,
      services: input.services.map((s) => s.serviceName),
      reason: input.reason ?? null,
    },
  });
  return { id: row.id, createdAt: row.createdAt.toISOString() };
}

/** Last 20 imports, newest first, with whether Undo is still allowed. */
export async function listRateCardImports() {
  const tenantId = await resolveTenantId();
  const rows = await db
    .select({
      id: rateCardImports.id,
      adminName: users.name,
      fileName: rateCardImports.fileName,
      reason: rateCardImports.reason,
      services: rateCardImports.services,
      changeCount: rateCardImports.changeCount,
      inverseChanges: rateCardImports.inverseChanges,
      createdAt: rateCardImports.createdAt,
      undoneAt: rateCardImports.undoneAt,
    })
    .from(rateCardImports)
    .leftJoin(users, eq(users.id, rateCardImports.adminId))
    .where(eq(rateCardImports.tenantId, tenantId))
    .orderBy(desc(rateCardImports.createdAt))
    .limit(20);
  const now = new Date();
  return rows.map((r) => {
    const blocked = undoBlockReason(r, now);
    return {
      id: r.id,
      adminName: r.adminName ?? "Deleted admin",
      fileName: r.fileName,
      reason: r.reason,
      services: (r.services ?? []) as ImportServiceSummary[],
      changeCount: r.changeCount,
      restoreCount: Array.isArray(r.inverseChanges) ? r.inverseChanges.length : 0,
      createdAt: r.createdAt.toISOString(),
      undoneAt: r.undoneAt ? r.undoneAt.toISOString() : null,
      canUndo: blocked === null,
      undoBlockedReason: blocked,
    };
  });
}

const boundEq = (col: AnyPgColumn, raw: string | null | undefined, field: "minAmount" | "maxAmount") => {
  const v = normalizeAmountBound(raw, field);
  return v != null ? eq(col, v) : isNull(col);
};

/** Replays one restore write; returns false when there was nothing left to end. */
async function replay(adminId: string, op: UndoOp, reason: string): Promise<boolean> {
  switch (op.kind) {
    case "set_income":
      await setProviderIncomeRule(adminId, { ...op.body, reason });
      return true;
    case "set_share":
      await setCommissionShare(adminId, { ...op.body, reason });
      return true;
    case "end_income":
    case "end_share":
      try {
        if (op.kind === "end_income") await endProviderIncomeRule(adminId, op.id, reason);
        else await endCommissionShare(adminId, op.id, reason);
        return true;
      } catch (err) {
        if (err instanceof HttpError && (err.statusCode === 404 || err.statusCode === 409)) return false;
        throw err;
      }
    case "end_income_scope": {
      const s = op.scope;
      const live = await db
        .select({ id: providerPayoutRules.id })
        .from(providerPayoutRules)
        .where(
          and(
            eq(providerPayoutRules.serviceId, s.serviceId),
            s.providerId ? eq(providerPayoutRules.providerId, s.providerId) : isNull(providerPayoutRules.providerId),
            boundEq(providerPayoutRules.minAmount, s.minAmount, "minAmount"),
            boundEq(providerPayoutRules.maxAmount, s.maxAmount, "maxAmount"),
            eq(providerPayoutRules.isActive, true),
            isNull(providerPayoutRules.effectiveTo),
          ),
        );
      for (const r of live) await endProviderIncomeRule(adminId, r.id, reason);
      return live.length > 0;
    }
    case "end_share_scope": {
      const s = op.scope;
      const live = await db
        .select({ id: commissionShares.id })
        .from(commissionShares)
        .where(
          and(
            eq(commissionShares.serviceId, s.serviceId),
            s.providerId ? eq(commissionShares.providerId, s.providerId) : isNull(commissionShares.providerId),
            eq(commissionShares.role, s.role),
            boundEq(commissionShares.minAmount, s.minAmount, "minAmount"),
            boundEq(commissionShares.maxAmount, s.maxAmount, "maxAmount"),
            eq(commissionShares.isActive, true),
            isNull(commissionShares.effectiveTo),
          ),
        );
      for (const r of live) await endCommissionShare(adminId, r.id, reason);
      return live.length > 0;
    }
  }
}

/**
 * Restores the rates an import replaced, through the same rate-card writes as a manual edit (reason + rate audit).
 * Refused after 24 h, a second time, or when any of its services changed after the import.
 */
export async function undoRateCardImport(adminId: string, id: string) {
  const tenantId = await resolveTenantId();
  const [row] = await db
    .select()
    .from(rateCardImports)
    .where(and(eq(rateCardImports.id, id), eq(rateCardImports.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Import not found. Refresh Import history.", "IMPORT_NOT_FOUND");
  const now = new Date();
  const blocked = undoBlockReason(row, now);
  if (blocked) throw new HttpError(409, blocked, "IMPORT_UNDO_NOT_ALLOWED");

  const steps = (Array.isArray(row.inverseChanges) ? row.inverseChanges : []).map((c) => importChangeSchema.parse(c));
  const ops = steps.map(undoOpOf);
  const reason = undoReasonOf(row);
  const summary = (row.services ?? []) as ImportServiceSummary[];
  const serviceIds = [...new Set(summary.map((s) => s.serviceId))];

  if (serviceIds.length > 0) {
    const [newer] = await db
      .select({ createdAt: commissionRateChangeEvents.createdAt, serviceName: servicesTable.name })
      .from(commissionRateChangeEvents)
      .leftJoin(servicesTable, eq(servicesTable.id, commissionRateChangeEvents.serviceId))
      .where(
        and(
          eq(commissionRateChangeEvents.tenantId, tenantId),
          inArray(commissionRateChangeEvents.serviceId, serviceIds),
          gt(commissionRateChangeEvents.createdAt, row.createdAt),
          or(isNull(commissionRateChangeEvents.reason), ne(commissionRateChangeEvents.reason, reason)),
        ),
      )
      .orderBy(desc(commissionRateChangeEvents.createdAt))
      .limit(1);
    if (newer) {
      throw new HttpError(
        409,
        `${newer.serviceName ?? "A service in this import"} rates changed after this import (${newer.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}). Undo would overwrite those newer changes — undo the newer import first or edit the rate card.`,
        "IMPORT_UNDO_NEWER_CHANGES",
      );
    }
  }

  const [claimed] = await db
    .update(rateCardImports)
    .set({ undoneAt: now, undoneBy: adminId })
    .where(and(eq(rateCardImports.id, id), isNull(rateCardImports.undoneAt)))
    .returning({ id: rateCardImports.id });
  if (!claimed) throw new HttpError(409, "This import was already undone.", "IMPORT_UNDO_NOT_ALLOWED");

  let done = 0;
  let skipped = 0;
  try {
    for (const op of ops) {
      if (!(await replay(adminId, op, reason))) skipped += 1;
      done += 1;
    }
  } catch (err) {
    // Re-open the import so Undo can be pressed again; finished steps are safe to replay.
    await db.update(rateCardImports).set({ undoneAt: null, undoneBy: null }).where(eq(rateCardImports.id, id));
    const step = steps[done];
    const message = err instanceof Error ? err.message : "Unexpected error";
    throw new HttpError(
      err instanceof HttpError ? err.statusCode : 500,
      `Undo stopped at step ${done + 1} of ${ops.length}${step ? ` (${step.label})` : ""}: ${message}. ${done} restore${
        done === 1 ? "" : "s"
      } saved — press Undo again to finish.`,
      "IMPORT_UNDO_FAILED",
    );
  }

  await insertAuditLog({
    userId: adminId,
    action: "admin.rate_card_import_undo",
    entityType: "rate_card_import",
    entityId: id,
    metadata: { fileName: row.fileName, restored: done - skipped, skipped, services: summary.map((s) => s.serviceName) },
  });
  return { id, restored: done - skipped, skipped };
}
