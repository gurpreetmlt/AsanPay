import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "../../db/postgres";
import { commissionRateChangeEvents, commissionTaxMonthLocks } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { resolveTenantId } from "../fund-requests/tenant";

/** IST calendar month (YYYY-MM) for a timestamp. */
export function yearMonthIst(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

/**
 * TCR14 — block rate edits while the current month (or any supplied effective-from month) is locked.
 * Pass every date the change touches (effectiveFrom, existing effectiveFrom, ...).
 */
export async function assertCommissionMonthUnlocked(
  dates: Array<Date | null | undefined> = [],
): Promise<void> {
  const months = new Set<string>([yearMonthIst(new Date())]);
  for (const d of dates) {
    if (d && !Number.isNaN(d.getTime())) months.add(yearMonthIst(d));
  }
  const tenantId = await resolveTenantId();
  const locked = await db
    .select({ yearMonth: commissionTaxMonthLocks.yearMonth })
    .from(commissionTaxMonthLocks)
    .where(
      and(
        eq(commissionTaxMonthLocks.tenantId, tenantId),
        inArray(commissionTaxMonthLocks.yearMonth, [...months]),
        isNull(commissionTaxMonthLocks.unlockedAt),
      ),
    )
    .limit(1);
  if (locked[0]) {
    throw new HttpError(
      409,
      `Commission month ${locked[0].yearMonth} is locked for tax filing. Unlock it under Tax & Commission → Month locks before changing rates.`,
      "COMMISSION_MONTH_LOCKED",
    );
  }
}

export type RateChangeInput = {
  adminId: string;
  entityType: "rule" | "override" | "share" | "provider_income" | "tax_config" | "customer_fee" | "cms_billers";
  entityId: string;
  userId?: string | null;
  serviceId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
};

/** TCR12 — append a before/after row for a rule or override change. */
export async function recordRateChangeEvent(input: RateChangeInput): Promise<void> {
  const tenantId = await resolveTenantId();
  await db.insert(commissionRateChangeEvents).values({
    tenantId,
    adminId: input.adminId,
    entityType: input.entityType,
    entityId: input.entityId,
    userId: input.userId ?? null,
    serviceId: input.serviceId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason?.trim() || null,
  });
}
