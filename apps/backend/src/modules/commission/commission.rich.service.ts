import { and, desc, eq, gt, isNotNull, isNull, lte, or, sql, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import {
  commissionLedger,
  commissionRules,
  commissionSchemeImportBatches,
  commissionRateChangeEvents,
  commissionTaxMonthLocks,
  providers,
  services,
  userCommissionRates,
  users,
} from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { resolveTenantId } from "../fund-requests/tenant";
import {
  createCommissionRule,
  updateCommissionRule,
  isSchemeRole,
  validateRuleValue,
  normalizeAmountBound,
  listAdminTdsRegister,
  listAdminDmtGstRegister,
} from "./commission.service";
import { assertCommissionMonthUnlocked, recordRateChangeEvent, yearMonthIst } from "./commission.guards";

// ── helpers ─────────────────────────────────────────────────────────────────

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertYearMonth(raw: string | undefined, field = "month"): string {
  const v = raw?.trim();
  if (!v || !YEAR_MONTH_RE.test(v)) {
    throw new HttpError(400, `${field} must be in YYYY-MM format (e.g. 2026-10)`, "INVALID_MONTH");
  }
  return v;
}

function currentYearMonth(): string {
  return yearMonthIst(new Date());
}

function nextYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** IST month boundaries: [start, end). */
function monthRangeIst(ym: string): { start: Date; end: Date } {
  return {
    start: new Date(`${ym}-01T00:00:00+05:30`),
    end: new Date(`${nextYearMonth(ym)}-01T00:00:00+05:30`),
  };
}

function csvCell(value: unknown, opts?: { numeric?: boolean }): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  // Spreadsheet formula injection guard for text cells.
  if (!opts?.numeric && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(header: string[], rows: unknown[][], numericCols: number[] = []): string {
  const numeric = new Set(numericCols);
  const lines = [header.map((h) => csvCell(h)).join(",")];
  for (const row of rows) {
    lines.push(row.map((c, i) => csvCell(c, { numeric: numeric.has(i) })).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function todayYmdIst(): string {
  return `${currentYearMonth()}-${new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
  }).format(new Date())}`;
}

// ── TCR05: scheme export / import ───────────────────────────────────────────

export const SCHEME_CSV_HEADER = [
  "serviceCode",
  "role",
  "ruleType",
  "value",
  "minAmount",
  "maxAmount",
  "providerCode",
  "isActive",
] as const;

/** Currently effective rules (active or paused) as CSV — round-trips through the import endpoint. */
export async function exportCommissionRulesCsv(): Promise<{ filename: string; csv: string; rowCount: number }> {
  const now = new Date();
  const rows = await db
    .select({
      serviceCode: services.code,
      role: commissionRules.role,
      ruleType: commissionRules.ruleType,
      value: commissionRules.value,
      minAmount: commissionRules.minAmount,
      maxAmount: commissionRules.maxAmount,
      providerCode: providers.code,
      isActive: commissionRules.isActive,
    })
    .from(commissionRules)
    .innerJoin(services, eq(commissionRules.serviceId, services.id))
    .leftJoin(providers, eq(commissionRules.providerId, providers.id))
    .where(or(isNull(commissionRules.effectiveTo), gt(commissionRules.effectiveTo, now)))
    .orderBy(services.code, commissionRules.role, commissionRules.minAmount);

  const csv = toCsv(
    [...SCHEME_CSV_HEADER],
    rows.map((r) => [
      r.serviceCode,
      r.role,
      r.ruleType,
      String(r.value),
      r.minAmount != null ? String(r.minAmount) : "",
      r.maxAmount != null ? String(r.maxAmount) : "",
      r.providerCode ?? "",
      r.isActive ? "true" : "false",
    ]),
    [3, 4, 5],
  );
  return { filename: `commission-scheme-${todayYmdIst()}.csv`, csv, rowCount: rows.length };
}

export type SchemeImportRow = {
  serviceCode: string;
  role: string;
  ruleType: string;
  value: string | number;
  minAmount?: string | number | null;
  maxAmount?: string | number | null;
  providerCode?: string | null;
  isActive?: boolean;
};

type ImportRowResult = {
  row: number;
  serviceCode: string;
  role: string;
  action: "create" | "update" | "skip" | "error";
  message?: string;
};

function sameNumber(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}

/**
 * Match key = serviceCode + role + provider + min/max slab. Same key → update; new key → create.
 * Slab bounds are part of the key so multi-slab schemes do not overwrite each other.
 */
export async function importCommissionRules(
  adminId: string,
  input: { rows: SchemeImportRow[]; dryRun?: boolean; fileName?: string | null },
) {
  const dryRun = Boolean(input.dryRun);
  const tenantId = await resolveTenantId();
  const now = new Date();

  const serviceRows = await db.select({ id: services.id, code: services.code }).from(services);
  const serviceByCode = new Map(serviceRows.map((s) => [s.code.toLowerCase(), s.id]));
  const providerRows = await db.select({ id: providers.id, code: providers.code }).from(providers);
  const providerByCode = new Map(providerRows.map((p) => [p.code.toLowerCase(), p.id]));

  let lockedMessage: string | null = null;
  try {
    await assertCommissionMonthUnlocked([now]);
  } catch (err) {
    if (err instanceof HttpError) lockedMessage = err.message;
    else throw err;
  }
  if (lockedMessage && !dryRun) throw new HttpError(409, lockedMessage, "COMMISSION_MONTH_LOCKED");

  const results: ImportRowResult[] = [];
  const seenKeys = new Map<string, number>();
  const reason = `CSV import${input.fileName ? `: ${input.fileName}` : ""}`;

  for (let i = 0; i < input.rows.length; i++) {
    const raw = input.rows[i]!;
    const rowNo = i + 1;
    const serviceCode = String(raw.serviceCode ?? "").trim();
    const role = String(raw.role ?? "").trim();
    const fail = (message: string) =>
      results.push({ row: rowNo, serviceCode, role, action: "error", message });

    try {
      if (!serviceCode) throw new HttpError(400, "serviceCode is required");
      const serviceId = serviceByCode.get(serviceCode.toLowerCase());
      if (!serviceId) throw new HttpError(400, `serviceCode "${serviceCode}" does not match any service`);
      if (!isSchemeRole(role)) {
        throw new HttpError(400, "role must be retailer, distributor, or super_distributor");
      }
      const ruleType = String(raw.ruleType ?? "").trim();
      if (ruleType !== "flat" && ruleType !== "percentage") {
        throw new HttpError(400, "ruleType must be flat or percentage");
      }
      if (raw.value === undefined || raw.value === null || String(raw.value).trim() === "") {
        throw new HttpError(400, "value is required");
      }
      const value = validateRuleValue(ruleType, String(raw.value).trim());
      const minAmount = normalizeAmountBound(
        raw.minAmount === undefined || raw.minAmount === null ? null : String(raw.minAmount),
        "minAmount",
      );
      const maxAmount = normalizeAmountBound(
        raw.maxAmount === undefined || raw.maxAmount === null ? null : String(raw.maxAmount),
        "maxAmount",
      );
      if (minAmount != null && maxAmount != null && Number(minAmount) > Number(maxAmount)) {
        throw new HttpError(400, "minAmount cannot be greater than maxAmount");
      }
      const providerCode = String(raw.providerCode ?? "").trim();
      let providerId: string | null = null;
      if (providerCode) {
        providerId = providerByCode.get(providerCode.toLowerCase()) ?? null;
        if (!providerId) throw new HttpError(400, `providerCode "${providerCode}" does not match any provider`);
      }
      const isActive = raw.isActive !== false;

      const key = [serviceId, role, providerId ?? "-", minAmount ?? "-", maxAmount ?? "-"].join("|");
      const firstSeen = seenKeys.get(key);
      if (firstSeen !== undefined) {
        throw new HttpError(
          400,
          `Duplicate of row ${firstSeen}: same service, role, provider and slab appear twice in this file`,
        );
      }
      seenKeys.set(key, rowNo);

      const candidates = await db
        .select()
        .from(commissionRules)
        .where(
          and(
            eq(commissionRules.serviceId, serviceId),
            eq(commissionRules.role, role),
            providerId ? eq(commissionRules.providerId, providerId) : isNull(commissionRules.providerId),
            or(isNull(commissionRules.effectiveTo), gt(commissionRules.effectiveTo, now)),
          ),
        )
        .orderBy(desc(commissionRules.effectiveFrom));
      const existing = candidates.find(
        (c) =>
          sameNumber(c.minAmount != null ? String(c.minAmount) : null, minAmount) &&
          sameNumber(c.maxAmount != null ? String(c.maxAmount) : null, maxAmount),
      );

      if (existing) {
        const unchanged =
          existing.ruleType === ruleType &&
          Number(existing.value) === Number(value) &&
          existing.isActive === isActive;
        if (unchanged) {
          results.push({ row: rowNo, serviceCode, role, action: "skip", message: "No change" });
          continue;
        }
        if (!dryRun) {
          await updateCommissionRule(adminId, existing.id, { ruleType, value, isActive }, { reason });
        }
        results.push({ row: rowNo, serviceCode, role, action: "update" });
      } else {
        if (!dryRun) {
          await createCommissionRule(
            adminId,
            { serviceId, providerId, role, ruleType, value, minAmount, maxAmount, isActive },
            { reason },
          );
        }
        results.push({ row: rowNo, serviceCode, role, action: "create" });
      }
    } catch (err) {
      if (!(err instanceof HttpError)) {
        logger.error({ err, row: rowNo }, "commission scheme import row failed");
      }
      fail(err instanceof HttpError ? err.message : "Unexpected server error while processing this row");
    }
  }

  const count = (a: ImportRowResult["action"]) => results.filter((r) => r.action === a).length;
  const summary = {
    rowCount: input.rows.length,
    createdCount: count("create"),
    updatedCount: count("update"),
    skippedCount: count("skip"),
    errorCount: count("error"),
  };
  const errors = results
    .filter((r) => r.action === "error")
    .map((r) => ({ row: r.row, serviceCode: r.serviceCode, role: r.role, message: r.message }));

  let batchId: string | null = null;
  if (!dryRun && input.rows.length > 0) {
    const [batch] = await db
      .insert(commissionSchemeImportBatches)
      .values({
        tenantId,
        adminId,
        fileName: input.fileName?.trim().slice(0, 200) || null,
        rowCount: summary.rowCount,
        createdCount: summary.createdCount,
        updatedCount: summary.updatedCount,
        skippedCount: summary.skippedCount,
        errorCount: summary.errorCount,
        errors,
      })
      .returning({ id: commissionSchemeImportBatches.id });
    batchId = batch?.id ?? null;
    await insertAuditLog({
      userId: adminId,
      action: "admin.commission_scheme_import",
      entityType: "commission_scheme_import_batch",
      entityId: batchId,
      metadata: { ...summary, fileName: input.fileName ?? null },
    });
  }

  return { dryRun, batchId, lockedMessage, summary, results };
}

// ── TCR06: override inbox ───────────────────────────────────────────────────

export async function listCommissionOverrides(filters?: {
  q?: string;
  role?: string;
  expired?: "0" | "1" | "all";
  active?: "1" | "0" | "all";
  limit?: number;
  offset?: number;
}) {
  const now = new Date();
  const limit = Math.min(filters?.limit ?? 100, 500);
  const offset = filters?.offset ?? 0;
  const expired = filters?.expired ?? "0";
  const active = filters?.active ?? "1";
  const q = filters?.q?.trim();

  const conditions = [
    active === "1" ? eq(userCommissionRates.isActive, true) : undefined,
    active === "0" ? eq(userCommissionRates.isActive, false) : undefined,
    expired === "0"
      ? or(isNull(userCommissionRates.expiresAt), gt(userCommissionRates.expiresAt, now))
      : undefined,
    expired === "1"
      ? and(isNotNull(userCommissionRates.expiresAt), lte(userCommissionRates.expiresAt, now))
      : undefined,
    filters?.role && isSchemeRole(filters.role) ? eq(users.role, filters.role) : undefined,
    q
      ? or(
          ilike(users.name, `%${q}%`),
          ilike(users.uid, `%${q}%`),
          ilike(users.mobile, `%${q}%`),
          ilike(services.code, `%${q}%`),
          ilike(services.name, `%${q}%`),
        )
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));
  const where = conditions.length ? and(...conditions) : sql`true`;

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(userCommissionRates)
    .innerJoin(users, eq(userCommissionRates.userId, users.id))
    .innerJoin(services, eq(userCommissionRates.serviceId, services.id))
    .where(where);

  const rows = await db
    .select({
      id: userCommissionRates.id,
      userId: users.id,
      userName: users.name,
      userUid: users.uid,
      userMobile: users.mobile,
      userRole: users.role,
      serviceId: services.id,
      serviceCode: services.code,
      serviceName: services.name,
      ruleType: userCommissionRates.ruleType,
      value: userCommissionRates.value,
      expiresAt: userCommissionRates.expiresAt,
      isActive: userCommissionRates.isActive,
      updatedAt: userCommissionRates.updatedAt,
    })
    .from(userCommissionRates)
    .innerJoin(users, eq(userCommissionRates.userId, users.id))
    .innerJoin(services, eq(userCommissionRates.serviceId, services.id))
    .where(where)
    .orderBy(desc(userCommissionRates.updatedAt))
    .limit(limit)
    .offset(offset);

  return {
    total: totalRow?.total ?? 0,
    rows: rows.map((r) => ({
      ...r,
      value: String(r.value),
      isExpired: r.expiresAt ? r.expiresAt.getTime() <= now.getTime() : false,
      href: `/users/${r.userId}`,
    })),
  };
}

/** Soft-deactivate (default) or delete a per-agent override. */
export async function revertCommissionOverride(
  adminId: string,
  overrideId: string,
  opts?: { mode?: "deactivate" | "delete"; reason?: string },
) {
  const [existing] = await db
    .select()
    .from(userCommissionRates)
    .where(eq(userCommissionRates.id, overrideId))
    .limit(1);
  if (!existing) throw new HttpError(404, "Commission override not found", "OVERRIDE_NOT_FOUND");

  await assertCommissionMonthUnlocked([]);

  const mode = opts?.mode === "delete" ? "delete" : "deactivate";
  const snap = (r: typeof existing) => ({
    ruleType: r.ruleType,
    value: String(r.value),
    isActive: r.isActive,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  });

  if (mode === "delete") {
    await db.delete(userCommissionRates).where(eq(userCommissionRates.id, overrideId));
  } else {
    if (!existing.isActive) {
      throw new HttpError(409, "This override is already inactive", "OVERRIDE_ALREADY_INACTIVE");
    }
    await db
      .update(userCommissionRates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(userCommissionRates.id, overrideId));
  }

  await recordRateChangeEvent({
    adminId,
    entityType: "override",
    entityId: overrideId,
    userId: existing.userId,
    serviceId: existing.serviceId,
    before: snap(existing),
    after: mode === "delete" ? null : { ...snap(existing), isActive: false },
    reason: opts?.reason?.trim() || (mode === "delete" ? "Override reverted (deleted)" : "Override reverted"),
  });
  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_override_revert",
    entityType: "user_commission_rate",
    entityId: overrideId,
    metadata: { mode, userId: existing.userId, serviceId: existing.serviceId },
  });

  return { id: overrideId, mode, reverted: true };
}

// ── TCR08 / TCR11: PAN gaps ─────────────────────────────────────────────────

const noPan = sql`(${users.panNumberEncrypted} is null or btrim(${users.panNumberEncrypted}) = '')`;

export async function getPanGaps(monthRaw?: string) {
  const month = monthRaw ? assertYearMonth(monthRaw) : currentYearMonth();
  const { start, end } = monthRangeIst(month);

  const rows = await db
    .select({
      userId: users.id,
      uid: users.uid,
      name: users.name,
      mobile: users.mobile,
      role: users.role,
      kycStatus: users.kycStatus,
      tdsAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.tdsAmount}, 0)), 0)`,
      grossAmount: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), 0)`,
      creditCount: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .innerJoin(users, eq(commissionLedger.beneficiaryUserId, users.id))
    .where(
      and(
        isNull(commissionLedger.reversedAt),
        sql`coalesce(${commissionLedger.tdsAmount}, 0) > 0`,
        sql`${commissionLedger.createdAt} >= ${start}`,
        sql`${commissionLedger.createdAt} < ${end}`,
        noPan,
      ),
    )
    .groupBy(users.id, users.uid, users.name, users.mobile, users.role, users.kycStatus)
    .orderBy(desc(sql`sum(coalesce(${commissionLedger.tdsAmount}, 0))`));

  const totalTds = rows.reduce((a, r) => a + Number(r.tdsAmount), 0);
  return {
    month,
    summary: { agentCount: rows.length, totalTds: totalTds.toFixed(2) },
    rows: rows.map((r) => ({
      userId: r.userId,
      uid: r.uid,
      name: r.name,
      mobile: r.mobile,
      role: r.role,
      kycStatus: r.kycStatus,
      tdsAmount: Number(r.tdsAmount).toFixed(2),
      grossAmount: Number(r.grossAmount).toFixed(2),
      creditCount: r.creditCount,
      href: `/users/${r.userId}`,
    })),
  };
}

/** Distinct agents with TDS withheld in the month and no PAN — used by admin alerts (TCR11). */
export async function countPanGapsForMonth(monthRaw?: string): Promise<number> {
  const month = monthRaw ? assertYearMonth(monthRaw) : currentYearMonth();
  const { start, end } = monthRangeIst(month);
  const [row] = await db
    .select({ total: sql<number>`count(distinct ${commissionLedger.beneficiaryUserId})::int` })
    .from(commissionLedger)
    .innerJoin(users, eq(commissionLedger.beneficiaryUserId, users.id))
    .where(
      and(
        isNull(commissionLedger.reversedAt),
        sql`coalesce(${commissionLedger.tdsAmount}, 0) > 0`,
        sql`${commissionLedger.createdAt} >= ${start}`,
        sql`${commissionLedger.createdAt} < ${end}`,
        noPan,
      ),
    );
  return row?.total ?? 0;
}

// ── TCR07: CA month pack ────────────────────────────────────────────────────

async function collectPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = 500,
  maxPages = 20,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const chunk = await fetchPage(page * pageSize, pageSize);
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all;
}

export async function getCaMonthPack(monthRaw?: string) {
  const month = assertYearMonth(monthRaw);
  const { start, end } = monthRangeIst(month);
  const until = new Date(end.getTime() - 1);

  let tdsSummary = { totalGross: "0", totalTds: "0", totalNet: "0", count: 0 };
  const tdsRows = await collectPages(async (offset, limit) => {
    const res = await listAdminTdsRegister({ month, limit, offset });
    if (offset === 0) tdsSummary = res.summary;
    return res.rows;
  });

  let dmtSummary = { totalFee: "0", totalGst: "0", count: 0 };
  const dmtGstRows = await collectPages(async (offset, limit) => {
    const res = await listAdminDmtGstRegister({ since: start, until, limit, offset });
    if (offset === 0) dmtSummary = res.summary;
    return res.rows;
  });

  const panGaps = await getPanGaps(month);
  const lock = await getMonthLock(month);

  const tdsCsv = toCsv(
    ["month", "uid", "name", "mobile", "role", "grossAmount", "tdsAmount", "netAmount", "creditCount"],
    tdsRows.map((r) => [
      r.month,
      r.beneficiaryUid,
      r.beneficiaryName,
      r.beneficiaryMobile,
      r.role,
      r.grossAmount,
      r.tdsAmount,
      r.netAmount,
      r.creditCount,
    ]),
    [5, 6, 7, 8],
  );
  const dmtCsv = toCsv(
    ["date", "txnRef", "service", "agentUid", "agentName", "amount", "customerFee", "customerFeeGst", "status"],
    dmtGstRows.map((r) => [
      r.createdAt,
      r.txnRef,
      r.serviceName,
      r.agentUid,
      r.agentName,
      r.amount,
      r.customerFee,
      r.customerFeeGst,
      r.status,
    ]),
    [5, 6, 7],
  );

  return {
    month,
    generatedAt: new Date().toISOString(),
    locked: Boolean(lock && !lock.unlockedAt),
    summary: {
      tds: { ...tdsSummary, agentCount: new Set(tdsRows.map((r) => r.beneficiaryUserId)).size },
      dmtGst: dmtSummary,
      panGapAgents: panGaps.summary.agentCount,
      panGapTds: panGaps.summary.totalTds,
      truncated: tdsRows.length >= 10000 || dmtGstRows.length >= 10000,
    },
    tdsRows,
    dmtGstRows,
    panGapRows: panGaps.rows,
    files: {
      tds: { filename: `tds-register-${month}.csv`, csv: tdsCsv },
      dmtGst: { filename: `dmt-gst-register-${month}.csv`, csv: dmtCsv },
      summary: { filename: `ca-summary-${month}.json` },
      zip: { filename: `ca-pack-${month}.zip` },
    },
  };
}

// ── TCR12: rate audit ───────────────────────────────────────────────────────

export async function listRateAudit(filters?: { limit?: number; entityType?: string; q?: string }) {
  const tenantId = await resolveTenantId();
  const limit = Math.min(filters?.limit ?? 100, 500);
  const adminUser = alias(users, "rate_audit_admin");
  const targetUser = alias(users, "rate_audit_target");
  const q = filters?.q?.trim();
  const entityType = ["rule", "override", "share", "provider_income"].includes(filters?.entityType ?? "")
    ? filters?.entityType
    : undefined;

  const conditions = [
    eq(commissionRateChangeEvents.tenantId, tenantId),
    entityType ? eq(commissionRateChangeEvents.entityType, entityType) : undefined,
    q
      ? or(
          ilike(adminUser.name, `%${q}%`),
          ilike(targetUser.name, `%${q}%`),
          ilike(targetUser.uid, `%${q}%`),
          ilike(targetUser.mobile, `%${q}%`),
          ilike(services.code, `%${q}%`),
          ilike(services.name, `%${q}%`),
          ilike(commissionRateChangeEvents.reason, `%${q}%`),
        )
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));

  const rows = await db
    .select({
      id: commissionRateChangeEvents.id,
      entityType: commissionRateChangeEvents.entityType,
      entityId: commissionRateChangeEvents.entityId,
      adminId: commissionRateChangeEvents.adminId,
      adminName: adminUser.name,
      userId: commissionRateChangeEvents.userId,
      userName: targetUser.name,
      userUid: targetUser.uid,
      userMobile: targetUser.mobile,
      serviceId: commissionRateChangeEvents.serviceId,
      serviceCode: services.code,
      serviceName: services.name,
      before: commissionRateChangeEvents.before,
      after: commissionRateChangeEvents.after,
      reason: commissionRateChangeEvents.reason,
      createdAt: commissionRateChangeEvents.createdAt,
    })
    .from(commissionRateChangeEvents)
    .leftJoin(adminUser, eq(commissionRateChangeEvents.adminId, adminUser.id))
    .leftJoin(targetUser, eq(commissionRateChangeEvents.userId, targetUser.id))
    .leftJoin(services, eq(commissionRateChangeEvents.serviceId, services.id))
    .where(and(...conditions))
    .orderBy(desc(commissionRateChangeEvents.createdAt))
    .limit(limit);

  return { rows };
}

// ── TCR13: commission vs wallet recon ───────────────────────────────────────

function parseYmdRange(from?: string, to?: string): { start: Date; end: Date; from: string; to: string } {
  const today = todayYmdIst();
  const fromYmd = from?.trim() || `${currentYearMonth()}-01`;
  const toYmd = to?.trim() || today;
  if (!YMD_RE.test(fromYmd)) throw new HttpError(400, "from must be a date in YYYY-MM-DD format", "INVALID_DATE");
  if (!YMD_RE.test(toYmd)) throw new HttpError(400, "to must be a date in YYYY-MM-DD format", "INVALID_DATE");
  const start = new Date(`${fromYmd}T00:00:00+05:30`);
  const end = new Date(`${toYmd}T23:59:59.999+05:30`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new HttpError(400, "from and to must be valid dates", "INVALID_DATE");
  }
  if (start > end) throw new HttpError(400, "from must be on or before to", "INVALID_DATE");
  return { start, end, from: fromYmd, to: toYmd };
}

type ReconGapRow = {
  commissionLedgerId: string;
  transactionId: string;
  txnRef: string | null;
  beneficiaryUserId: string;
  beneficiaryUid: string | null;
  beneficiaryName: string | null;
  ledgerNet: string;
  walletCredit: string;
  ledgerGroupId: string | null;
  reversedAt: string | null;
  createdAt: string;
};

export async function getCommissionRecon(fromRaw?: string, toRaw?: string) {
  const { start, end, from, to } = parseYmdRange(fromRaw, toRaw);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // One row per commission_ledger line with the wallet credit actually posted to the beneficiary
  // in its ledger group. Active + clawed-back rows are both included; clawed rows are labelled.
  const base = sql`
    select cl.id, cl.transaction_id, t.txn_ref, cl.beneficiary_user_id, u.uid as beneficiary_uid,
           u.name as beneficiary_name, cl.amount as ledger_net, cl.gross_amount, cl.tds_amount,
           cl.ledger_group_id, cl.reversed_at, cl.created_at,
           coalesce(sum(wle.amount) filter (
             where wle.entry_type = 'credit' and w.user_id = cl.beneficiary_user_id
           ), 0) as wallet_credit
    from commission_ledger cl
    join users u on u.id = cl.beneficiary_user_id
    join transactions t on t.id = cl.transaction_id
    left join wallet_ledger_entries wle on wle.group_id = cl.ledger_group_id
    left join wallets w on w.id = wle.wallet_id
    where cl.created_at >= ${startIso}::timestamptz and cl.created_at <= ${endIso}::timestamptz
    group by cl.id, u.id, t.id
  `;

  const summaryRes = await db.execute<{
    ledger_rows: string;
    active_net: string;
    active_gross: string;
    active_tds: string;
    clawed_net: string;
    wallet_credit: string;
    mismatch_rows: string;
  }>(sql`
    with base as (${base})
    select count(*)::text as ledger_rows,
           coalesce(sum(ledger_net) filter (where reversed_at is null), 0)::text as active_net,
           coalesce(sum(coalesce(gross_amount, ledger_net)) filter (where reversed_at is null), 0)::text as active_gross,
           coalesce(sum(coalesce(tds_amount, 0)) filter (where reversed_at is null), 0)::text as active_tds,
           coalesce(sum(ledger_net) filter (where reversed_at is not null), 0)::text as clawed_net,
           coalesce(sum(wallet_credit), 0)::text as wallet_credit,
           count(*) filter (where wallet_credit <> ledger_net)::text as mismatch_rows
    from base
  `);
  const s = summaryRes.rows[0];

  const gapRes = await db.execute<{
    id: string;
    transaction_id: string;
    txn_ref: string | null;
    beneficiary_user_id: string;
    beneficiary_uid: string | null;
    beneficiary_name: string | null;
    ledger_net: string;
    wallet_credit: string;
    ledger_group_id: string | null;
    reversed_at: string | null;
    created_at: string;
  }>(sql`
    with base as (${base})
    select * from base
    where wallet_credit <> ledger_net
    order by created_at desc
    limit 200
  `);

  // Wallet-side commission groups with no commission_ledger row at all (payout without ledger).
  const orphanRes = await db.execute<{
    group_id: string;
    reference_id: string | null;
    description: string | null;
    created_at: string;
    credit_total: string;
  }>(sql`
    select g.id as group_id, g.reference_id::text, g.description, g.created_at,
           coalesce(sum(wle.amount) filter (where wle.entry_type = 'credit'), 0)::text as credit_total
    from wallet_ledger_groups g
    left join wallet_ledger_entries wle on wle.group_id = g.id
    where g.reference_type = 'commission'
      and g.created_at >= ${startIso}::timestamptz and g.created_at <= ${endIso}::timestamptz
      and not exists (select 1 from commission_ledger cl where cl.ledger_group_id = g.id)
    group by g.id
    order by g.created_at desc
    limit 200
  `);
  const orphanTotal = orphanRes.rows.reduce((a, r) => a + Number(r.credit_total), 0);

  const gaps: Array<ReconGapRow & { kind: string; note: string }> = gapRes.rows.map((r) => {
    const credit = Number(r.wallet_credit);
    const net = Number(r.ledger_net);
    let kind = "amount_mismatch";
    let note = `Ledger net ₹${net.toFixed(2)} vs wallet credit ₹${credit.toFixed(2)}`;
    if (!r.ledger_group_id) {
      kind = "missing_wallet_link";
      note = "Commission ledger row has no wallet ledger group";
    } else if (credit === 0) {
      kind = "missing_wallet_credit";
      note = "No wallet credit found for this commission payout";
    }
    return {
      commissionLedgerId: r.id,
      transactionId: r.transaction_id,
      txnRef: r.txn_ref,
      beneficiaryUserId: r.beneficiary_user_id,
      beneficiaryUid: r.beneficiary_uid,
      beneficiaryName: r.beneficiary_name,
      ledgerNet: String(r.ledger_net),
      walletCredit: String(r.wallet_credit),
      ledgerGroupId: r.ledger_group_id,
      reversedAt: r.reversed_at,
      createdAt: r.created_at,
      kind,
      note,
    };
  });

  const walletCredit = Number(s?.wallet_credit ?? 0);
  const activeNet = Number(s?.active_net ?? 0);
  const clawedNet = Number(s?.clawed_net ?? 0);
  return {
    from,
    to,
    summary: {
      ledgerRows: Number(s?.ledger_rows ?? 0),
      ledgerActiveGross: Number(s?.active_gross ?? 0).toFixed(2),
      ledgerActiveTds: Number(s?.active_tds ?? 0).toFixed(2),
      ledgerActiveNet: activeNet.toFixed(2),
      ledgerClawedBackNet: clawedNet.toFixed(2),
      walletCommissionCredits: walletCredit.toFixed(2),
      // Wallet credits should equal ledger net (active + clawed back — clawback reverses in a separate group).
      difference: (walletCredit - activeNet - clawedNet).toFixed(2),
      mismatchRows: Number(s?.mismatch_rows ?? 0),
      walletWithoutLedgerGroups: orphanRes.rows.length,
      walletWithoutLedgerTotal: orphanTotal.toFixed(2),
      balanced: Number(s?.mismatch_rows ?? 0) === 0 && orphanRes.rows.length === 0,
    },
    gaps,
    walletWithoutLedger: orphanRes.rows.map((r) => ({
      ledgerGroupId: r.group_id,
      transactionId: r.reference_id,
      description: r.description,
      createdAt: r.created_at,
      creditTotal: String(r.credit_total),
    })),
    gapsTruncated: gaps.length >= 200 || orphanRes.rows.length >= 200,
  };
}

// ── TCR14: month locks ──────────────────────────────────────────────────────

async function getMonthLock(yearMonth: string) {
  const tenantId = await resolveTenantId();
  const [row] = await db
    .select()
    .from(commissionTaxMonthLocks)
    .where(and(eq(commissionTaxMonthLocks.tenantId, tenantId), eq(commissionTaxMonthLocks.yearMonth, yearMonth)))
    .limit(1);
  return row ?? null;
}

export async function listMonthLocks() {
  const tenantId = await resolveTenantId();
  const lockedByUser = alias(users, "month_lock_admin");
  const rows = await db
    .select({
      id: commissionTaxMonthLocks.id,
      yearMonth: commissionTaxMonthLocks.yearMonth,
      lockedAt: commissionTaxMonthLocks.lockedAt,
      lockedBy: commissionTaxMonthLocks.lockedBy,
      lockedByName: lockedByUser.name,
      unlockedAt: commissionTaxMonthLocks.unlockedAt,
      unlockReason: commissionTaxMonthLocks.unlockReason,
    })
    .from(commissionTaxMonthLocks)
    .leftJoin(lockedByUser, eq(commissionTaxMonthLocks.lockedBy, lockedByUser.id))
    .where(eq(commissionTaxMonthLocks.tenantId, tenantId))
    .orderBy(desc(commissionTaxMonthLocks.yearMonth));
  return {
    currentMonth: currentYearMonth(),
    rows: rows.map((r) => ({ ...r, isLocked: r.unlockedAt === null })),
  };
}

export async function lockCommissionMonth(adminId: string, monthRaw: string | undefined) {
  const yearMonth = assertYearMonth(monthRaw, "yearMonth");
  if (yearMonth > currentYearMonth()) {
    throw new HttpError(400, "yearMonth cannot be in the future — lock the current or a past month", "INVALID_MONTH");
  }
  const tenantId = await resolveTenantId();
  const existing = await getMonthLock(yearMonth);
  if (existing && !existing.unlockedAt) {
    throw new HttpError(409, `Commission month ${yearMonth} is already locked`, "MONTH_ALREADY_LOCKED");
  }

  const now = new Date();
  let row;
  if (existing) {
    [row] = await db
      .update(commissionTaxMonthLocks)
      .set({ lockedAt: now, lockedBy: adminId, unlockedAt: null, unlockReason: null })
      .where(eq(commissionTaxMonthLocks.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(commissionTaxMonthLocks)
      .values({ tenantId, yearMonth, lockedAt: now, lockedBy: adminId })
      .returning();
  }

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_month_lock",
    entityType: "commission_tax_month_lock",
    entityId: row?.id ?? null,
    metadata: { yearMonth },
  });
  return row;
}

export async function unlockCommissionMonth(adminId: string, monthRaw: string | undefined, reason: string | undefined) {
  const yearMonth = assertYearMonth(monthRaw, "yearMonth");
  const note = reason?.trim() ?? "";
  if (note.length < 5) {
    throw new HttpError(400, "Unlock reason is required (at least 5 characters)", "UNLOCK_REASON_REQUIRED");
  }
  const existing = await getMonthLock(yearMonth);
  if (!existing) throw new HttpError(404, `Commission month ${yearMonth} is not locked`, "MONTH_LOCK_NOT_FOUND");
  if (existing.unlockedAt) {
    throw new HttpError(409, `Commission month ${yearMonth} is already unlocked`, "MONTH_ALREADY_UNLOCKED");
  }

  const [row] = await db
    .update(commissionTaxMonthLocks)
    .set({ unlockedAt: new Date(), unlockReason: note })
    .where(eq(commissionTaxMonthLocks.id, existing.id))
    .returning();

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_month_unlock",
    entityType: "commission_tax_month_lock",
    entityId: existing.id,
    metadata: { yearMonth, reason: note },
  });
  return row;
}
