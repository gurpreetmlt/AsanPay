import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/postgres";
import { cmsBillerImports, cmsBillerRates, services as servicesTable, users } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import { resolveTenantId } from "../fund-requests/tenant";
import { recordRateChangeEvent } from "./commission.guards";
import { undoBlockReason } from "./rateCardImport.ops";

export const MAX_BILLER_ROWS = 5000;
const MAX_MICRO = 9_999_999_999; // numeric(10,6) → 9999.999999
const CASH_COLLECTION_CODE = "CASH_COLLECTION";

export type BillerType = "agent" | "customer" | "other";
type MarginKey = "companyMargin" | "retailerMargin" | "distributorMargin" | "superMargin";
const MARGINS: Array<{ key: MarginKey; label: string }> = [
  { key: "companyMargin", label: "Asanpay Company Margin" },
  { key: "retailerMargin", label: "Retailer Margin" },
  { key: "distributorMargin", label: "Distributor Margin" },
  { key: "superMargin", label: "Super Margin" },
];

export const billerRowSchema = z.object({
  row: z.number().int().min(1).max(1_000_000),
  billerId: z.string().max(100),
  billerName: z.string().max(500),
  companyMargin: z.string().max(40),
  retailerMargin: z.string().max(40),
  distributorMargin: z.string().max(40),
  superMargin: z.string().max(40),
});
export type BillerRowInput = z.infer<typeof billerRowSchema>;

type Rates = { billerName: string; companyMargin: string; retailerMargin: string; distributorMargin: string; superMargin: string };
type Saved = Rates & { billerId: string; isActive: boolean };
type UndoEntry = { billerId: string; before: (Rates & { isActive: boolean }) | null };

/** "AGENT" / "CUSTOMER" in the biller name (e.g. "DMI FINANCE CUSTOMER", "SATYA_AGENT"); the later word wins. */
export function billerTypeOf(name: string): BillerType {
  const upper = name.toUpperCase();
  const at = (word: string) => {
    const m = [...upper.matchAll(new RegExp(`(?:^|[^A-Z])${word}(?=[^A-Z]|$)`, "g"))];
    return m.length ? m[m.length - 1]!.index! : -1;
  };
  const agent = at("AGENT");
  const customer = at("CUSTOMER");
  if (agent < 0 && customer < 0) return "other";
  return agent > customer ? "agent" : "customer";
}

const toMicro = (v: string) => Math.round(Number(v) * 1e6);
const fromMicro = (m: number) => (m / 1e6).toFixed(6);
/** DB numeric → canonical 6-decimal string so file and saved values compare exactly. */
const canon = (v: string | number) => fromMicro(toMicro(String(v)));

function sameRates(a: Rates, b: Rates): boolean {
  return a.billerName === b.billerName && MARGINS.every(({ key }) => canon(a[key]) === canon(b[key]));
}

/** Validates file rows; every message names the sheet row and column. */
export function validateBillerRows(rows: BillerRowInput[]): { valid: Array<Rates & { billerId: string; row: number }>; issues: string[] } {
  const issues: string[] = [];
  const valid: Array<Rates & { billerId: string; row: number }> = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    const at = `Row ${r.row}`;
    const before = issues.length;
    const billerId = r.billerId.trim();
    const billerName = r.billerName.trim().replace(/\s+/g, " ");
    if (!billerId) issues.push(`${at} · Biller Id is empty`);
    else if (!/^\d+$/.test(billerId)) issues.push(`${at} · Biller Id must contain digits only (found "${billerId.slice(0, 30)}")`);
    else if (billerId.length > 20) issues.push(`${at} · Biller Id must be at most 20 digits`);
    else if (seen.has(billerId)) issues.push(`${at} · Biller Id ${billerId} is already on row ${seen.get(billerId)} — keep one row per biller`);
    if (!billerName) issues.push(`${at} · Biller Name is empty`);
    else if (billerName.length > 200) issues.push(`${at} · Biller Name must be at most 200 characters`);

    const micro = {} as Record<MarginKey, number>;
    for (const { key, label } of MARGINS) {
      const raw = r[key].trim();
      if (!raw) {
        issues.push(`${at} · ${label} is empty — enter 0 if nothing is paid`);
        continue;
      }
      if (!/^\d+(\.\d+)?$/.test(raw)) {
        issues.push(`${at} · ${label} must be a number of 0 or more (found "${raw.slice(0, 30)}")`);
        continue;
      }
      const m = toMicro(raw);
      if (m > MAX_MICRO) {
        issues.push(`${at} · ${label} must be below 10000`);
        continue;
      }
      micro[key] = m;
    }
    if (issues.length === before) {
      const split = micro.retailerMargin + micro.distributorMargin + micro.superMargin;
      if (split > micro.companyMargin) {
        issues.push(
          `${at} · Retailer + Distributor + Super margin (${Number(fromMicro(split))}) is more than the Asanpay Company Margin (${Number(
            fromMicro(micro.companyMargin),
          )})`,
        );
      }
    }
    if (billerId && /^\d+$/.test(billerId) && !seen.has(billerId)) seen.set(billerId, r.row);
    if (issues.length === before) {
      valid.push({
        row: r.row,
        billerId,
        billerName,
        companyMargin: fromMicro(micro.companyMargin),
        retailerMargin: fromMicro(micro.retailerMargin),
        distributorMargin: fromMicro(micro.distributorMargin),
        superMargin: fromMicro(micro.superMargin),
      });
    }
  }
  return { valid, issues };
}

type Executor = Pick<typeof db, "select">;

async function loadSaved(exec: Executor): Promise<Map<string, Saved>> {
  const rows = await exec
    .select({
      billerId: cmsBillerRates.billerId,
      billerName: cmsBillerRates.billerName,
      companyMargin: cmsBillerRates.companyMargin,
      retailerMargin: cmsBillerRates.retailerMargin,
      distributorMargin: cmsBillerRates.distributorMargin,
      superMargin: cmsBillerRates.superMargin,
      isActive: cmsBillerRates.isActive,
    })
    .from(cmsBillerRates);
  return new Map(rows.map((r) => [r.billerId, r]));
}

type PlanChange = { status: "new" | "changed" | "removed"; billerId: string; before: Saved | null; after: Rates | null };

function planImport(file: Array<Rates & { billerId: string }>, saved: Map<string, Saved>, removeMissing: boolean) {
  const changes: PlanChange[] = [];
  let unchanged = 0;
  const inFile = new Set<string>();
  for (const f of file) {
    inFile.add(f.billerId);
    const s = saved.get(f.billerId);
    const after: Rates = {
      billerName: f.billerName,
      companyMargin: f.companyMargin,
      retailerMargin: f.retailerMargin,
      distributorMargin: f.distributorMargin,
      superMargin: f.superMargin,
    };
    if (!s) changes.push({ status: "new", billerId: f.billerId, before: null, after });
    else if (!s.isActive || !sameRates(s, after)) changes.push({ status: "changed", billerId: f.billerId, before: s, after });
    else unchanged += 1;
  }
  const missing = [...saved.values()].filter((s) => s.isActive && !inFile.has(s.billerId));
  if (removeMissing) for (const s of missing) changes.push({ status: "removed", billerId: s.billerId, before: s, after: null });
  const count = (st: PlanChange["status"]) => changes.filter((c) => c.status === st).length;
  return { changes, counts: { new: count("new"), changed: count("changed"), removed: count("removed"), unchanged, missing: missing.length } };
}

const rateView = (r: Rates | null) =>
  r
    ? {
        billerName: r.billerName,
        companyMargin: canon(r.companyMargin),
        retailerMargin: canon(r.retailerMargin),
        distributorMargin: canon(r.distributorMargin),
        superMargin: canon(r.superMargin),
      }
    : null;

export const billerImportSchema = z.object({
  fileName: z.string().trim().min(1, "File name is required").max(200),
  rows: z
    .array(billerRowSchema)
    .min(1, "The sheet has no biller rows")
    .max(MAX_BILLER_ROWS, `A biller sheet can have at most ${MAX_BILLER_ROWS} rows`),
  removeMissing: z.boolean().optional().default(false),
  dryRun: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
});
export type BillerImportInput = z.infer<typeof billerImportSchema>;

/** Dry run → preview of new / changed / removed billers; otherwise saves them in one transaction with undo data. */
export async function importCmsBillers(adminId: string, input: BillerImportInput) {
  const { valid, issues } = validateBillerRows(input.rows);
  if (input.dryRun) {
    const plan = planImport(valid, await loadSaved(db), input.removeMissing);
    return {
      saved: false as const,
      rowsRead: input.rows.length,
      issues: issues.slice(0, 500),
      issueCount: issues.length,
      counts: plan.counts,
      changes: plan.changes.map((c) => ({
        status: c.status,
        billerId: c.billerId,
        billerType: billerTypeOf(c.after?.billerName ?? c.before?.billerName ?? ""),
        reactivated: c.status === "changed" && c.before?.isActive === false,
        before: rateView(c.before),
        after: rateView(c.after),
      })),
    };
  }

  if (issues.length > 0) {
    throw new HttpError(400, `Fix the sheet before saving (${issues.length} error${issues.length === 1 ? "" : "s"}): ${issues[0]}`, "CMS_BILLER_ROW_INVALID");
  }
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 3) throw new HttpError(400, "Enter a reason for this upload (at least 3 characters)", "REASON_REQUIRED");

  const tenantId = await resolveTenantId();
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const saved = await loadSaved(tx);
    const plan = planImport(valid, saved, input.removeMissing);
    if (plan.changes.length === 0) {
      throw new HttpError(409, "Nothing to save — every biller in the sheet already matches the saved rates.", "CMS_BILLER_NO_CHANGES");
    }
    const undo: UndoEntry[] = plan.changes.map((c) => ({
      billerId: c.billerId,
      before: c.before
        ? {
            billerName: c.before.billerName,
            companyMargin: canon(c.before.companyMargin),
            retailerMargin: canon(c.before.retailerMargin),
            distributorMargin: canon(c.before.distributorMargin),
            superMargin: canon(c.before.superMargin),
            isActive: c.before.isActive,
          }
        : null,
    }));

    const inserts = plan.changes.filter((c) => c.status === "new" && c.after);
    for (let i = 0; i < inserts.length; i += 500) {
      await tx.insert(cmsBillerRates).values(
        inserts.slice(i, i + 500).map((c) => ({ billerId: c.billerId, ...c.after!, isActive: true, updatedBy: adminId, updatedAt: now })),
      );
    }
    for (const c of plan.changes) {
      if (c.status === "changed" && c.after) {
        await tx
          .update(cmsBillerRates)
          .set({ ...c.after, isActive: true, updatedBy: adminId, updatedAt: now })
          .where(eq(cmsBillerRates.billerId, c.billerId));
      }
    }
    const removed = plan.changes.filter((c) => c.status === "removed").map((c) => c.billerId);
    for (let i = 0; i < removed.length; i += 500) {
      await tx
        .update(cmsBillerRates)
        .set({ isActive: false, updatedBy: adminId, updatedAt: now })
        .where(inArray(cmsBillerRates.billerId, removed.slice(i, i + 500)));
    }

    const [row] = await tx
      .insert(cmsBillerImports)
      .values({
        tenantId,
        adminId,
        fileName: input.fileName.slice(0, 200),
        reason,
        newCount: plan.counts.new,
        changedCount: plan.counts.changed,
        removedCount: plan.counts.removed,
        undoPayload: undo,
        createdAt: now,
      })
      .returning({ id: cmsBillerImports.id });
    if (!row) throw new HttpError(500, "The biller upload could not be recorded. Nothing was saved — try again.", "CMS_BILLER_IMPORT_FAILED");
    const activeBefore = [...saved.values()].filter((s) => s.isActive).length;
    const activeAfter = activeBefore + plan.counts.new + plan.changes.filter((c) => c.status === "changed" && !c.before?.isActive).length - plan.counts.removed;
    return { id: row.id, counts: plan.counts, activeBefore, activeAfter };
  });

  await recordRateChangeEvent({
    adminId,
    entityType: "cms_billers",
    entityId: result.id,
    serviceId: await cashCollectionServiceId(),
    before: { billers: result.activeBefore },
    after: {
      billers: result.activeAfter,
      new: result.counts.new,
      changed: result.counts.changed,
      removed: result.counts.removed,
      fileName: input.fileName,
    },
    reason,
  });
  await insertAuditLog({
    userId: adminId,
    action: "admin.cms_biller_import",
    entityType: "cms_biller_import",
    entityId: result.id,
    metadata: { fileName: input.fileName, reason, ...result.counts },
  });
  return { saved: true as const, id: result.id, counts: result.counts };
}

async function cashCollectionServiceId(): Promise<string | null> {
  const [s] = await db.select({ id: servicesTable.id }).from(servicesTable).where(eq(servicesTable.code, CASH_COLLECTION_CODE)).limit(1);
  return s?.id ?? null;
}

/** Billers for the admin list (active only unless asked) plus the last 10 uploads with Undo state. */
export async function listCmsBillers(filters: { q?: string; type?: BillerType; includeInactive?: boolean }) {
  const rows = await db
    .select()
    .from(cmsBillerRates)
    .where(filters.includeInactive ? undefined : eq(cmsBillerRates.isActive, true))
    .orderBy(asc(cmsBillerRates.billerName));
  const q = filters.q?.trim().toLowerCase();
  const billers = rows
    .map((r) => {
      const keepsMicro =
        toMicro(r.companyMargin) - toMicro(r.retailerMargin) - toMicro(r.distributorMargin) - toMicro(r.superMargin);
      return {
        billerId: r.billerId,
        billerName: r.billerName,
        billerType: billerTypeOf(r.billerName),
        companyMargin: canon(r.companyMargin),
        retailerMargin: canon(r.retailerMargin),
        distributorMargin: canon(r.distributorMargin),
        superMargin: canon(r.superMargin),
        companyKeeps: fromMicro(keepsMicro),
        isActive: r.isActive,
        updatedAt: r.updatedAt.toISOString(),
      };
    })
    .filter((b) => (!q || b.billerId.includes(q) || b.billerName.toLowerCase().includes(q)) && (!filters.type || b.billerType === filters.type));

  const tenantId = await resolveTenantId();
  const imports = await db
    .select({
      id: cmsBillerImports.id,
      adminName: users.name,
      fileName: cmsBillerImports.fileName,
      reason: cmsBillerImports.reason,
      newCount: cmsBillerImports.newCount,
      changedCount: cmsBillerImports.changedCount,
      removedCount: cmsBillerImports.removedCount,
      createdAt: cmsBillerImports.createdAt,
      undoneAt: cmsBillerImports.undoneAt,
    })
    .from(cmsBillerImports)
    .leftJoin(users, eq(users.id, cmsBillerImports.adminId))
    .where(eq(cmsBillerImports.tenantId, tenantId))
    .orderBy(desc(cmsBillerImports.createdAt))
    .limit(10);
  const now = new Date();
  // Only the newest upload that is still in effect can be undone; older ones would overwrite it.
  const newestLive = imports.find((i) => !i.undoneAt)?.id ?? null;
  return {
    billers,
    imports: imports.map((i) => {
      const blocked =
        undoBlockReason(i, now)?.replace("Edit the rate card or import a corrected file instead.", "Upload a corrected biller sheet instead.") ??
        (i.id !== newestLive ? "A newer biller upload is in effect — undo that one first." : null);
      return {
        id: i.id,
        adminName: i.adminName ?? "Deleted admin",
        fileName: i.fileName,
        reason: i.reason,
        newCount: i.newCount,
        changedCount: i.changedCount,
        removedCount: i.removedCount,
        createdAt: i.createdAt.toISOString(),
        undoneAt: i.undoneAt ? i.undoneAt.toISOString() : null,
        canUndo: blocked === null,
        undoBlockedReason: blocked,
      };
    }),
  };
}

const undoEntrySchema = z.object({
  billerId: z.string().max(20),
  before: z
    .object({
      billerName: z.string().max(200),
      companyMargin: z.string(),
      retailerMargin: z.string(),
      distributorMargin: z.string(),
      superMargin: z.string(),
      isActive: z.boolean(),
    })
    .nullable(),
});

/** Puts back every biller the upload touched (new ones are deleted). Once, within 24 h, newest upload first. */
export async function undoCmsBillerImport(adminId: string, id: string) {
  const tenantId = await resolveTenantId();
  const [imp] = await db
    .select()
    .from(cmsBillerImports)
    .where(and(eq(cmsBillerImports.id, id), eq(cmsBillerImports.tenantId, tenantId)))
    .limit(1);
  if (!imp) throw new HttpError(404, "Biller upload not found. Refresh the biller list.", "CMS_BILLER_IMPORT_NOT_FOUND");
  const now = new Date();
  const blocked = undoBlockReason(imp, now);
  if (blocked) {
    throw new HttpError(409, blocked.replace("Edit the rate card or import a corrected file instead.", "Upload a corrected biller sheet instead."), "IMPORT_UNDO_NOT_ALLOWED");
  }
  const [newer] = await db
    .select({ createdAt: cmsBillerImports.createdAt })
    .from(cmsBillerImports)
    .where(and(eq(cmsBillerImports.tenantId, tenantId), gt(cmsBillerImports.createdAt, imp.createdAt), isNull(cmsBillerImports.undoneAt)))
    .limit(1);
  if (newer) {
    throw new HttpError(
      409,
      `A newer biller upload (${newer.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}) is in effect. Undo that one first.`,
      "IMPORT_UNDO_NEWER_CHANGES",
    );
  }
  const entries = z.array(undoEntrySchema).parse(imp.undoPayload ?? []);
  const reason = `Undo of biller upload "${imp.fileName.slice(0, 120)}" (ref ${imp.id.slice(0, 8)})`;

  const restored = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(cmsBillerImports)
      .set({ undoneAt: now, undoneBy: adminId })
      .where(and(eq(cmsBillerImports.id, id), isNull(cmsBillerImports.undoneAt)))
      .returning({ id: cmsBillerImports.id });
    if (!claimed) throw new HttpError(409, "This upload was already undone.", "IMPORT_UNDO_NOT_ALLOWED");
    const added = entries.filter((e) => e.before === null).map((e) => e.billerId);
    for (let i = 0; i < added.length; i += 500) {
      await tx.delete(cmsBillerRates).where(inArray(cmsBillerRates.billerId, added.slice(i, i + 500)));
    }
    for (const e of entries) {
      if (!e.before) continue;
      await tx
        .update(cmsBillerRates)
        .set({ ...e.before, updatedBy: adminId, updatedAt: now })
        .where(eq(cmsBillerRates.billerId, e.billerId));
    }
    return entries.length;
  });

  await recordRateChangeEvent({
    adminId,
    entityType: "cms_billers",
    entityId: id,
    serviceId: await cashCollectionServiceId(),
    before: { new: imp.newCount, changed: imp.changedCount, removed: imp.removedCount, fileName: imp.fileName },
    after: { restored },
    reason,
  });
  await insertAuditLog({
    userId: adminId,
    action: "admin.cms_biller_import_undo",
    entityType: "cms_biller_import",
    entityId: id,
    metadata: { fileName: imp.fileName, restored },
  });
  return { id, restored };
}
