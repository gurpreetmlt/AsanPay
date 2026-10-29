import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  accounts,
  auditLogs,
  refreshTokens,
  transactions,
  userCommissionRates,
  userHierarchy,
  users,
  wallets,
} from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { invalidateAccount } from "../../core/ledger";
import type { AccountType } from "../../core/ledger";
import { HttpError } from "../../utils/httpError";
import { resolveTenantId } from "../fund-requests/tenant";
import { hierarchyAccountCode } from "../wallet/ledgerAccounts";
import { formatRupees } from "../limits/moneyLimits";
import type { UserRole } from "@asanpay/shared-types";

/**
 * Role change and account close for one agent (admin → agent → Services & limits).
 * Close is a soft close: login stops (users.is_active = false) but KYC, ledger and transaction
 * records stay — they must be kept for 5 years. Reopen undoes it.
 */

export const AGENT_ROLES = ["super_distributor", "distributor", "retailer"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  super_distributor: "Super Distributor",
  distributor: "Distributor",
  retailer: "Retailer",
};

/** Who an agent of each role may report to (admin can onboard retailers directly). */
const UPLINE_ROLES: Record<AgentRole, UserRole[]> = {
  super_distributor: ["admin"],
  distributor: ["super_distributor"],
  retailer: ["distributor", "admin"],
};

const ACCOUNT_TYPE: Record<AgentRole, AccountType> = {
  super_distributor: "sd",
  distributor: "distributor",
  retailer: "retailer",
};

const OPEN_TXN_STATUSES = ["initiated", "pending"] as const;

async function loadAgent(userId: string) {
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new HttpError(404, "Agent not found", "USER_NOT_FOUND");
  if (target.role === "admin") throw new HttpError(403, "Admin accounts cannot be changed here", "ADMIN_PROTECTED");
  return target;
}

async function assertNoDownline(userId: string, action: string) {
  const [child] = await db.select({ id: users.id }).from(users).where(eq(users.parentId, userId)).limit(1);
  if (child) {
    throw new HttpError(422, `Move this agent's downline to another upline before ${action}`, "HAS_DOWNLINE");
  }
}

async function assertNoOpenTxn(userId: string, action: string) {
  const [open] = await db
    .select({ txnRef: transactions.txnRef })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.status, [...OPEN_TXN_STATUSES])))
    .limit(1);
  if (open) {
    throw new HttpError(
      422,
      `Transaction ${open.txnRef} is still pending. Wait for it to finish before ${action}.`,
      "PENDING_TXN",
    );
  }
}

async function walletRows(userId: string) {
  return db
    .select({ walletType: wallets.walletType, balance: wallets.balance, holdBalance: wallets.holdBalance })
    .from(wallets)
    .where(eq(wallets.userId, userId));
}

const walletName = (t: string) => (t === "main" ? "Main" : t === "aeps" ? "AePS" : t);

/** GET /admin/users/:id/account-controls — what the role / close cards need. */
export async function getAccountControls(userId: string) {
  const target = await loadAgent(userId);
  const [[child], [open], [customRate], balances, [closeLog]] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.parentId, userId)).limit(1),
    db
      .select({ txnRef: transactions.txnRef })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), inArray(transactions.status, [...OPEN_TXN_STATUSES])))
      .limit(1),
    db
      .select({ id: userCommissionRates.id })
      .from(userCommissionRates)
      .where(and(eq(userCommissionRates.userId, userId), eq(userCommissionRates.isActive, true)))
      .limit(1),
    walletRows(userId),
    target.isActive
      ? Promise.resolve([] as { createdAt: Date; metadata: unknown }[])
      : db
          .select({ createdAt: auditLogs.createdAt, metadata: auditLogs.metadata })
          .from(auditLogs)
          .where(and(eq(auditLogs.entityId, userId), eq(auditLogs.action, "admin.account_close")))
          .orderBy(desc(auditLogs.createdAt))
          .limit(1),
  ]);
  const closeMeta = (closeLog?.metadata ?? {}) as { reason?: string };
  return {
    role: target.role,
    isActive: target.isActive,
    hasDownline: !!child,
    pendingTxnRef: open?.txnRef ?? null,
    hasCustomCommission: !!customRate,
    wallets: balances.map((w) => ({ walletType: w.walletType, balance: w.balance, holdBalance: w.holdBalance })),
    closedAt: closeLog ? closeLog.createdAt.toISOString() : null,
    closedReason: closeMeta.reason ?? null,
    uplineRoles: UPLINE_ROLES,
  };
}

async function resolveUpline(target: typeof users.$inferSelect, newRole: AgentRole, query: string | null) {
  const allowed = UPLINE_ROLES[newRole];
  const allowedText = allowed.map((r) => ROLE_LABEL[r]).join(" or ");
  const q = query?.trim() ?? "";

  if (!q) {
    if (newRole === "super_distributor") {
      const [root] = await db
        .select()
        .from(users)
        .where(and(eq(users.role, "admin"), isNull(users.parentId), eq(users.isActive, true)))
        .limit(1);
      if (!root) throw new HttpError(500, "Root admin account not found", "ROOT_ADMIN_MISSING");
      return root;
    }
    if (target.parentId) {
      const [current] = await db.select().from(users).where(eq(users.id, target.parentId)).limit(1);
      if (current && current.isActive && allowed.includes(current.role)) return current;
    }
    throw new HttpError(
      422,
      `Enter the new upline's mobile or agent ID. A ${ROLE_LABEL[newRole]} must report to a ${allowedText}.`,
      "UPLINE_REQUIRED",
    );
  }

  const byMobile = /^\d{10}$/.test(q);
  const [upline] = await db
    .select()
    .from(users)
    .where(byMobile ? eq(users.mobile, q) : eq(users.uid, q.toUpperCase()))
    .limit(1);
  if (!upline) {
    throw new HttpError(404, `No account found for ${byMobile ? "mobile" : "agent ID"} ${q}. Check the number and try again.`, "UPLINE_NOT_FOUND");
  }
  if (upline.id === target.id) throw new HttpError(422, "An agent cannot be their own upline", "INVALID_UPLINE");
  if (!upline.isActive) throw new HttpError(422, `${upline.name} (${upline.uid}) is inactive. Pick an active upline.`, "UPLINE_INACTIVE");
  if (!allowed.includes(upline.role)) {
    throw new HttpError(
      422,
      `${upline.name} is a ${ROLE_LABEL[upline.role]}. A ${ROLE_LABEL[newRole]} must report to a ${allowedText}.`,
      "INVALID_HIERARCHY",
    );
  }
  return upline;
}

/** POST /admin/users/:id/role */
export async function changeAgentRole(
  adminId: string,
  userId: string,
  input: { newRole: AgentRole; upline: string | null; reason: string },
) {
  const target = await loadAgent(userId);
  const oldRole = target.role as AgentRole;
  const { newRole } = input;
  if (oldRole === newRole) throw new HttpError(422, `This agent is already a ${ROLE_LABEL[newRole]}`, "SAME_ROLE");
  if (!target.isActive) throw new HttpError(422, "This account is closed. Reopen it before changing the role.", "ACCOUNT_CLOSED");

  await assertNoDownline(userId, "changing the role");
  await assertNoOpenTxn(userId, "changing the role");

  const [customRate] = await db
    .select({ id: userCommissionRates.id })
    .from(userCommissionRates)
    .where(and(eq(userCommissionRates.userId, userId), eq(userCommissionRates.isActive, true)))
    .limit(1);
  if (customRate) {
    throw new HttpError(
      422,
      "Remove this agent's custom commission (Commission tab) before changing the role. Custom rates are set per role.",
      "CUSTOM_COMMISSION",
    );
  }

  for (const w of await walletRows(userId)) {
    if (Number(w.holdBalance) > 0) {
      throw new HttpError(
        422,
        `${walletName(w.walletType)} wallet has ${formatRupees(Number(w.holdBalance))} on hold. Wait for it to clear before changing the role.`,
        "WALLET_ON_HOLD",
      );
    }
    if (w.walletType === "aeps" && newRole !== "retailer" && Number(w.balance) > 0) {
      throw new HttpError(
        422,
        `AePS wallet still has ${formatRupees(Number(w.balance))}. Move it to Main or settle it first — only retailers have an AePS wallet.`,
        "AEPS_BALANCE_NOT_ZERO",
      );
    }
  }

  const upline = await resolveUpline(target, newRole, input.upline);
  const tenantId = await resolveTenantId();
  const oldCode = hierarchyAccountCode(oldRole, target.uid);
  const newCode = hierarchyAccountCode(newRole, target.uid);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ role: newRole, parentId: upline.id, updatedAt: new Date() }).where(eq(users.id, userId));

    // No downline, so the subtree is just this agent: drop old ancestor edges, add the new chain.
    await tx
      .delete(userHierarchy)
      .where(and(eq(userHierarchy.descendantId, userId), notInArray(userHierarchy.ancestorId, [userId])));
    const ancestors = await tx
      .select({ ancestorId: userHierarchy.ancestorId, depth: userHierarchy.depth })
      .from(userHierarchy)
      .where(eq(userHierarchy.descendantId, upline.id));
    if (ancestors.length === 0) throw new HttpError(500, "Hierarchy row missing for the new upline", "HIERARCHY_CORRUPT");
    await tx
      .insert(userHierarchy)
      .values(ancestors.map((a) => ({ ancestorId: a.ancestorId, descendantId: userId, depth: a.depth + 1 })));

    if (newRole === "retailer") {
      await tx.insert(wallets).values({ userId, walletType: "aeps" }).onConflictDoNothing();
    }

    // Ledger balance code carries the role prefix (RTL_/DIST_/SD_). Entries point at the account
    // id, so renaming keeps the balance and history on the same account.
    const [clash] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, newCode)))
      .limit(1);
    if (clash) throw new HttpError(409, `Ledger account ${newCode} already exists. Contact engineering before changing this role.`, "LEDGER_CODE_TAKEN");
    await tx
      .update(accounts)
      .set({ code: newCode, accountType: ACCOUNT_TYPE[newRole] })
      .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, oldCode)));

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  });
  invalidateAccount(tenantId, oldCode);
  invalidateAccount(tenantId, newCode);

  await insertAuditLog({
    userId: adminId,
    action: "admin.role_change",
    entityType: "user",
    entityId: userId,
    metadata: {
      uid: target.uid,
      fromRole: oldRole,
      toRole: newRole,
      previousParentId: target.parentId,
      newParentId: upline.id,
      newParentUid: upline.uid,
      reason: input.reason,
    },
  });

  return {
    id: userId,
    role: newRole,
    upline: { id: upline.id, uid: upline.uid, name: upline.name, role: upline.role },
  };
}

/** POST /admin/users/:id/close */
export async function closeAgentAccount(adminId: string, userId: string, input: { reason: string; confirmUid: string }) {
  const target = await loadAgent(userId);
  if (!target.isActive) throw new HttpError(422, "This account is already closed", "ALREADY_CLOSED");
  if (input.confirmUid.trim().toUpperCase() !== target.uid.toUpperCase()) {
    throw new HttpError(422, `Type the agent ID ${target.uid} to confirm`, "CONFIRM_MISMATCH");
  }
  await assertNoDownline(userId, "closing the account");
  await assertNoOpenTxn(userId, "closing the account");

  const nonZero = (await walletRows(userId)).filter((w) => Number(w.balance) > 0 || Number(w.holdBalance) > 0);
  if (nonZero.length > 0) {
    const parts = nonZero.map(
      (w) => `${walletName(w.walletType)} ${formatRupees(Number(w.balance) + Number(w.holdBalance))}`,
    );
    throw new HttpError(
      422,
      `Wallet balance must be ₹0 before closing (${parts.join(", ")}). Settle or move it first.`,
      "BALANCE_NOT_ZERO",
    );
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  });
  await insertAuditLog({
    userId: adminId,
    action: "admin.account_close",
    entityType: "user",
    entityId: userId,
    metadata: { uid: target.uid, role: target.role, reason: input.reason },
  });
  return { id: userId, isActive: false };
}

/** POST /admin/users/:id/reopen */
export async function reopenAgentAccount(adminId: string, userId: string, reason: string) {
  const target = await loadAgent(userId);
  if (target.isActive) throw new HttpError(422, "This account is already open", "ALREADY_OPEN");
  if (target.parentId) {
    const [parent] = await db
      .select({ isActive: users.isActive, name: users.name })
      .from(users)
      .where(eq(users.id, target.parentId))
      .limit(1);
    if (parent && !parent.isActive) {
      throw new HttpError(422, `Upline ${parent.name} is closed. Move this agent to an active upline first.`, "UPLINE_INACTIVE");
    }
  }
  await db.update(users).set({ isActive: true, updatedAt: new Date() }).where(eq(users.id, userId));
  await insertAuditLog({
    userId: adminId,
    action: "admin.account_reopen",
    entityType: "user",
    entityId: userId,
    metadata: { uid: target.uid, reason },
  });
  return { id: userId, isActive: true };
}
