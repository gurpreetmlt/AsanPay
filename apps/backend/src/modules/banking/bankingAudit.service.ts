import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import { auditLogs, users } from "../../db/postgres/schema";

/** Banking / recon actions shown on Bank & deposits → Audit trail. */
export const BANKING_AUDIT_ACTIONS = [
  "admin.bank_recon_link",
  "admin.bank_recon_unlink",
  "admin.bank_recon_ignore",
  "admin.bank_recon_unignore",
  "admin.bank_statement_delete",
  "admin.treasury_daily_close",
  "admin.treasury_daily_reopen",
] as const;

const ACTION_LABEL: Record<string, string> = {
  "admin.bank_recon_link": "Confirmed match",
  "admin.bank_recon_unlink": "Undid match",
  "admin.bank_recon_ignore": "Ignored statement line(s)",
  "admin.bank_recon_unignore": "Restored ignored line",
  "admin.bank_statement_delete": "Removed statement line",
  "admin.treasury_daily_close": "Closed business day",
  "admin.treasury_daily_reopen": "Reopened business day",
};

export function bankingAuditLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/^admin\./, "").replace(/_/g, " ");
}

export async function listBankingAuditTrail(params: {
  limit?: number;
  offset?: number;
  action?: string;
  entityId?: string;
}): Promise<{
  rows: Array<{
    id: string;
    action: string;
    label: string;
    entityType: string;
    entityId: string | null;
    why: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
    actorId: string | null;
    actorName: string | null;
    actorUid: string | null;
  }>;
  total: number;
}> {
  const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const actor = alias(users, "banking_audit_actor");

  const actionFilter =
    params.action && (BANKING_AUDIT_ACTIONS as readonly string[]).includes(params.action)
      ? [params.action]
      : [...BANKING_AUDIT_ACTIONS];

  const conditions = [inArray(auditLogs.action, actionFilter)];
  if (params.entityId?.trim()) {
    conditions.push(eq(auditLogs.entityId, params.entityId.trim()));
  }

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorId: auditLogs.userId,
      actorName: actor.name,
      actorUid: actor.uid,
    })
    .from(auditLogs)
    .leftJoin(actor, eq(auditLogs.userId, actor.id))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(...conditions));

  return {
    total: Number(total) || 0,
    rows: rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const why =
        typeof meta.why === "string" && meta.why.trim()
          ? meta.why.trim()
          : typeof meta.reason === "string" && meta.reason.trim()
            ? meta.reason.trim()
            : null;
      return {
        id: r.id,
        action: r.action,
        label: bankingAuditLabel(r.action),
        entityType: r.entityType,
        entityId: r.entityId,
        why,
        metadata: meta,
        createdAt: r.createdAt.toISOString(),
        actorId: r.actorId,
        actorName: r.actorName,
        actorUid: r.actorUid,
      };
    }),
  };
}
