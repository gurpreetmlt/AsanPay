import { and, eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { reconciliationExceptions } from "../../db/postgres/schema";
import { logger } from "../../utils/logger";

/**
 * Files (or refreshes) an open reconciliation exception so a human or a retry sweep can find it.
 * Never throws — callers are already on a failure path.
 */
export async function upsertReconException(input: {
  checkName: string;
  severity: "info" | "warn" | "critical";
  fingerprint: string;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    const { resolveTenantId } = await import("../fund-requests/tenant");
    const tenantId = await resolveTenantId();
    const [existing] = await db
      .select({ id: reconciliationExceptions.id, details: reconciliationExceptions.details })
      .from(reconciliationExceptions)
      .where(
        and(
          eq(reconciliationExceptions.tenantId, tenantId),
          eq(reconciliationExceptions.fingerprint, input.fingerprint),
          eq(reconciliationExceptions.status, "open"),
        ),
      )
      .limit(1);
    if (existing) {
      const prevAttempts = Number((existing.details as Record<string, unknown>)?.attempts ?? 1);
      await db
        .update(reconciliationExceptions)
        .set({
          details: { ...input.details, attempts: prevAttempts + 1 },
          severity: input.severity,
          lastSeenAt: new Date(),
        })
        .where(eq(reconciliationExceptions.id, existing.id));
      return;
    }
    await db.insert(reconciliationExceptions).values({
      tenantId,
      checkName: input.checkName,
      severity: input.severity,
      fingerprint: input.fingerprint,
      details: { ...input.details, attempts: 1 },
    });
  } catch (err) {
    logger.error({ err, fingerprint: input.fingerprint }, "could not file reconciliation exception");
  }
}
