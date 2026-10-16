import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { bankAccounts, bankEntryCategoryRules } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { normaliseUtr } from "../banking/banking.service";
import {
  BANK_ENTRY_CATEGORIES,
  isBankEntryCategory,
  type BankEntryCategory,
} from "./bankEntry.service";

export interface CategoryRuleRow {
  id: string;
  utrPrefix: string;
  category: BankEntryCategory;
  categoryLabel: string;
  bankAccountId: string | null;
  bankName: string | null;
  last4: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalisePrefix(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 2) {
    throw new HttpError(422, "UTR prefix must be at least 2 letters or digits", "INVALID_PREFIX");
  }
  if (cleaned.length > 32) {
    throw new HttpError(422, "UTR prefix must be at most 32 characters", "INVALID_PREFIX");
  }
  return cleaned;
}

function assertCategory(raw: string): BankEntryCategory {
  if (!isBankEntryCategory(raw)) {
    throw new HttpError(422, "Select a valid bank entry category", "INVALID_CATEGORY");
  }
  if (BANK_ENTRY_CATEGORIES[raw].direction === "none") {
    throw new HttpError(
      422,
      "This category has no company bank — it cannot be used in a UTR prefix rule",
      "BAD_CATEGORY",
    );
  }
  return raw;
}

export async function listCategoryRules(tenantId: string): Promise<CategoryRuleRow[]> {
  const rows = await db.execute<{
    id: string;
    utr_prefix: string;
    category: string;
    bank_account_id: string | null;
    bank_name: string | null;
    last4: string | null;
    is_active: boolean;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>(sql`
    SELECT r.id::text, r.utr_prefix, r.category, r.bank_account_id::text,
           ba.bank_name, ba.account_number_last4 AS last4,
           r.is_active, r.note, r.created_at::text, r.updated_at::text
    FROM bank_entry_category_rules r
    LEFT JOIN bank_accounts ba ON ba.id = r.bank_account_id
    WHERE r.tenant_id = ${tenantId}
    ORDER BY length(r.utr_prefix) DESC, r.utr_prefix ASC, r.id DESC
  `);

  return rows.rows.map((r) => ({
    id: r.id,
    utrPrefix: r.utr_prefix,
    category: (isBankEntryCategory(r.category) ? r.category : "other_credit") as BankEntryCategory,
    categoryLabel: isBankEntryCategory(r.category)
      ? BANK_ENTRY_CATEGORIES[r.category].label
      : r.category,
    bankAccountId: r.bank_account_id,
    bankName: r.bank_name,
    last4: r.last4,
    isActive: Boolean(r.is_active),
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createCategoryRule(params: {
  tenantId: string;
  adminId: string;
  utrPrefix: string;
  category: string;
  bankAccountId?: string | null;
  note?: string | null;
}): Promise<CategoryRuleRow> {
  const prefix = normalisePrefix(params.utrPrefix);
  const category = assertCategory(params.category);
  let bankAccountId: bigint | null = null;
  if (params.bankAccountId) {
    if (!/^\d+$/.test(params.bankAccountId)) {
      throw new HttpError(422, "Select a valid company bank account", "INVALID_BANK");
    }
    const [ba] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, BigInt(params.bankAccountId)),
          eq(bankAccounts.tenantId, params.tenantId),
          sql`${bankAccounts.deletedAt} IS NULL`,
        ),
      )
      .limit(1);
    if (!ba) throw new HttpError(404, "Company bank account not found", "BANK_NOT_FOUND");
    bankAccountId = ba.id;
  }

  try {
    const [row] = await db
      .insert(bankEntryCategoryRules)
      .values({
        tenantId: params.tenantId,
        utrPrefix: prefix,
        category,
        bankAccountId,
        note: params.note?.trim() || null,
        createdBy: params.adminId,
      })
      .returning({ id: bankEntryCategoryRules.id });
    if (!row) throw new HttpError(500, "Could not save the rule", "SAVE_FAILED");
    await insertAuditLog({
      userId: params.adminId,
      action: "admin.bank_entry_rule_create",
      entityType: "bank_entry_category_rule",
      entityId: String(row.id),
      metadata: {
        utrPrefix: prefix,
        category,
        bankAccountId: bankAccountId ? String(bankAccountId) : null,
        why: `UTR prefix ${prefix} → ${BANK_ENTRY_CATEGORIES[category].label}`,
      },
    });
    const list = await listCategoryRules(params.tenantId);
    const created = list.find((r) => r.id === String(row.id));
    if (!created) throw new HttpError(500, "Rule saved but could not be reloaded", "SAVE_FAILED");
    return created;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("bank_entry_category_rules_global_uidx") || msg.includes("bank_entry_category_rules_bank_uidx")) {
      throw new HttpError(
        422,
        "A rule with this UTR prefix already exists for this bank scope. Edit or delete the existing rule.",
        "RULE_DUPLICATE",
      );
    }
    throw err;
  }
}

export async function updateCategoryRule(params: {
  tenantId: string;
  adminId: string;
  ruleId: string;
  category?: string;
  isActive?: boolean;
  note?: string | null;
}): Promise<CategoryRuleRow> {
  if (!/^\d+$/.test(params.ruleId)) throw new HttpError(422, "Rule id is invalid", "INVALID_ID");
  const patch: Partial<typeof bankEntryCategoryRules.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (params.category !== undefined) patch.category = assertCategory(params.category);
  if (params.isActive !== undefined) patch.isActive = params.isActive;
  if (params.note !== undefined) patch.note = params.note?.trim() || null;

  const updated = await db
    .update(bankEntryCategoryRules)
    .set(patch)
    .where(
      and(
        eq(bankEntryCategoryRules.id, BigInt(params.ruleId)),
        eq(bankEntryCategoryRules.tenantId, params.tenantId),
      ),
    )
    .returning({ id: bankEntryCategoryRules.id });
  if (!updated.length) throw new HttpError(404, "Category rule not found", "NOT_FOUND");

  await insertAuditLog({
    userId: params.adminId,
    action: "admin.bank_entry_rule_update",
    entityType: "bank_entry_category_rule",
    entityId: params.ruleId,
    metadata: {
      category: params.category,
      isActive: params.isActive,
      why: "Admin updated a UTR prefix → category rule",
    },
  });

  const list = await listCategoryRules(params.tenantId);
  const row = list.find((r) => r.id === params.ruleId);
  if (!row) throw new HttpError(404, "Category rule not found", "NOT_FOUND");
  return row;
}

export async function deleteCategoryRule(params: {
  tenantId: string;
  adminId: string;
  ruleId: string;
}): Promise<void> {
  if (!/^\d+$/.test(params.ruleId)) throw new HttpError(422, "Rule id is invalid", "INVALID_ID");
  const deleted = await db
    .delete(bankEntryCategoryRules)
    .where(
      and(
        eq(bankEntryCategoryRules.id, BigInt(params.ruleId)),
        eq(bankEntryCategoryRules.tenantId, params.tenantId),
      ),
    )
    .returning({ id: bankEntryCategoryRules.id, utrPrefix: bankEntryCategoryRules.utrPrefix });
  if (!deleted.length) throw new HttpError(404, "Category rule not found", "NOT_FOUND");
  await insertAuditLog({
    userId: params.adminId,
    action: "admin.bank_entry_rule_delete",
    entityType: "bank_entry_category_rule",
    entityId: params.ruleId,
    metadata: {
      utrPrefix: deleted[0]!.utrPrefix,
      why: `Removed UTR prefix rule ${deleted[0]!.utrPrefix}`,
    },
  });
}

/**
 * Longest matching active prefix wins. Bank-specific rules beat global when lengths are equal.
 */
export async function resolveCategoryFromUtr(params: {
  tenantId: string;
  utr: string | null | undefined;
  bankAccountId?: string | null;
}): Promise<{ category: BankEntryCategory; prefix: string; ruleId: string } | null> {
  const norm = normaliseUtr(params.utr);
  if (!norm) return null;

  const bankId = params.bankAccountId && /^\d+$/.test(params.bankAccountId) ? params.bankAccountId : null;
  const scope = bankId
    ? sql`(bank_account_id IS NULL OR bank_account_id = ${bankId}::bigint)`
    : sql`bank_account_id IS NULL`;
  const rows = await db.execute<{
    id: string;
    utr_prefix: string;
    category: string;
    bank_account_id: string | null;
  }>(sql`
    SELECT id::text, utr_prefix, category, bank_account_id::text
    FROM bank_entry_category_rules
    WHERE tenant_id = ${params.tenantId}
      AND is_active = true
      AND ${norm} LIKE utr_prefix || '%'
      AND ${scope}
    ORDER BY length(utr_prefix) DESC,
             CASE WHEN bank_account_id IS NOT NULL THEN 0 ELSE 1 END ASC
    LIMIT 1
  `);

  const hit = rows.rows[0];
  if (!hit || !isBankEntryCategory(hit.category)) return null;
  return { category: hit.category, prefix: hit.utr_prefix, ruleId: hit.id };
}

export async function resolveCategoriesForUtrs(params: {
  tenantId: string;
  bankAccountId?: string | null;
  items: Array<{ key: string; utr: string | null }>;
}): Promise<Array<{ key: string; category: BankEntryCategory | null; prefix: string | null; label: string | null }>> {
  const out: Array<{
    key: string;
    category: BankEntryCategory | null;
    prefix: string | null;
    label: string | null;
  }> = [];
  for (const item of params.items) {
    const hit = await resolveCategoryFromUtr({
      tenantId: params.tenantId,
      utr: item.utr,
      bankAccountId: params.bankAccountId,
    });
    out.push({
      key: item.key,
      category: hit?.category ?? null,
      prefix: hit?.prefix ?? null,
      label: hit ? BANK_ENTRY_CATEGORIES[hit.category].label : null,
    });
  }
  return out;
}

/** Fallback when Auto has no rule: other_credit / other_debit by statement side. */
export function fallbackCategoryForDirection(direction: "credit" | "debit"): BankEntryCategory {
  return direction === "credit" ? "other_credit" : "other_debit";
}
