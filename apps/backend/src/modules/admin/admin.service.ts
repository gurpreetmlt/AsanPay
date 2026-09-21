import { and, count, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import {
  users,
  transactions,
  services,
  serviceCategories,
  wallets,
  walletLedgerEntries,
  walletLedgerGroups,
  walletIdempotency,
  userCommissionRates,
  userHierarchy,
  providers,
  providerServices,
  auditLogs,
  providerLogs,
  accounts,
  journals,
  supportTickets,
  fundRequests,
  fundRequestEvents,
  agentSettlementAccounts,
  settlementRequests,
  agentRiskSignals,
  floatTransfers,
  allocations,
  reconAdjustments,
  reconciliationExceptions,
  commissionLedger,
  otpRequests,
} from "../../db/postgres/schema";
import { listAdapterCodes } from "../providers/provider.registry";
import { aepsAdapterCode } from "../providers/aepsMode";
import { getAdminFullNetworkTree, getUserAncestors } from "../users/users.service";
import { HttpError } from "../../utils/httpError";
import { decryptPII } from "../../utils/aes";
import { env } from "../../config/env";
import { sendSlackAlert } from "../../utils/alert";
import {
  hasStoredKycPhoto,
  loadKycPhotoBytes,
  KYC_DOC_KEY_TO_SLOT,
} from "../kyc/kycDocuments.service";
import { kycDecisionEmailTemplate, notifyUserEmail } from "../../utils/mailer";
import { findLatestAuditLog, insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { resyncUidCounter } from "../../utils/uid";
import type { UserRole, KycStatus, TransactionStatus } from "@asanpay/shared-types";

/** Parent role required for each child role when admin moves someone in the tree. */
const REQUIRED_PARENT_ROLE: Record<UserRole, UserRole | null> = {
  admin: null,
  super_distributor: "admin",
  distributor: "super_distributor",
  retailer: "distributor",
};

function maskPan(pan: string) {
  if (pan.length < 6) return "••••••••••";
  return `${pan.slice(0, 5)}****${pan.slice(-1)}`;
}

function maskAadhaar(aadhaar: string) {
  const digits = aadhaar.replace(/\D/g, "");
  if (digits.length < 4) return "XXXX XXXX XXXX";
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function metaFileName(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function getAdminUserDetail(userId: string) {
  const parent = alias(users, "parent");
  const [row] = await db
    .select({
      id: users.id,
      uid: users.uid,
      name: users.name,
      mobile: users.mobile,
      email: users.email,
      role: users.role,
      kycStatus: users.kycStatus,
      isActive: users.isActive,
      parentId: users.parentId,
      panNumberEncrypted: users.panNumberEncrypted,
      aadhaarNumberEncrypted: users.aadhaarNumberEncrypted,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      parentUid: parent.uid,
      parentName: parent.name,
      parentRole: parent.role,
    })
    .from(users)
    .leftJoin(parent, eq(users.parentId, parent.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (row.role === "admin") throw new HttpError(400, "Cannot open admin as agent detail", "INVALID_TARGET");

  let panMasked: string | null = null;
  let aadhaarMasked: string | null = null;
  let panFull: string | null = null;
  let aadhaarFull: string | null = null;
  try {
    if (row.panNumberEncrypted) {
      panFull = decryptPII(row.panNumberEncrypted);
      panMasked = maskPan(panFull);
    }
    if (row.aadhaarNumberEncrypted) {
      aadhaarFull = decryptPII(row.aadhaarNumberEncrypted);
      aadhaarMasked = maskAadhaar(aadhaarFull);
    }
  } catch {
    panMasked = panMasked ?? "••••••••••";
    aadhaarMasked = aadhaarMasked ?? "XXXX XXXX XXXX";
  }

  const walletRows = await db
    .select({
      walletType: wallets.walletType,
      balance: wallets.balance,
    })
    .from(wallets)
    .where(eq(wallets.userId, userId));

  const kycAudit = await findLatestAuditLog({ userId: row.id, action: "kyc.submit" });

  // Full-freeze status, not isActive — see setRestrictionLevel(). isActive stays the
  // account-lifecycle flag (never onboarded / closed); this is the moderation lever now.
  const [frozenRow] = await db
    .select({ isFrozen: sql<boolean>`coalesce(bool_or(${accounts.blockLogin}), false)` })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const isFrozen = frozenRow?.isFrozen ?? false;

  const meta = (kycAudit?.metadata ?? {}) as Record<string, unknown>;

  const documents: Record<string, string> = {};
  const documentFiles: Record<string, string | null> = {
    panCard: metaFileName(meta, "panImageFileName"),
    aadhaarFront: metaFileName(meta, "aadhaarFrontFileName"),
    aadhaarBack: metaFileName(meta, "aadhaarBackFileName"),
    chequeOrPassbook: metaFileName(meta, "cancelledChequeFileName"),
    personalPhoto: metaFileName(meta, "personalPhotoFileName"),
    shopPhoto: metaFileName(meta, "shopPhotoFileName"),
  };

  const dataSlots: { docKey: string; slot: "panImage" | "aadhaarFront" | "aadhaarBack" | "cancelledCheque" | "personalPhoto" | "shopPhoto" }[] = [
    { docKey: "panCard", slot: "panImage" },
    { docKey: "aadhaarFront", slot: "aadhaarFront" },
    { docKey: "aadhaarBack", slot: "aadhaarBack" },
    { docKey: "chequeOrPassbook", slot: "cancelledCheque" },
    { docKey: "personalPhoto", slot: "personalPhoto" },
    { docKey: "shopPhoto", slot: "shopPhoto" },
  ];

  for (const s of dataSlots) {
    // Proxy URL (not embedded base64) — keeps user-detail JSON small; bytes via GET …/kyc-documents/:key
    if (hasStoredKycPhoto(meta, s.slot)) {
      documents[s.docKey] = `/admin/users/${userId}/kyc-documents/${s.docKey}`;
    }
  }

  // Filename / number-only slots — placeholder marker (UI shows stub card).
  const putStub = (docKey: string) => {
    if (!documents[docKey]) documents[docKey] = "stub";
  };
  if (panFull || documentFiles.panCard) putStub("panCard");
  if (aadhaarFull || documentFiles.aadhaarFront) putStub("aadhaarFront");
  if (documentFiles.aadhaarBack) putStub("aadhaarBack");
  if (documentFiles.chequeOrPassbook) putStub("chequeOrPassbook");
  if (documentFiles.personalPhoto) putStub("personalPhoto");
  if (documentFiles.shopPhoto) putStub("shopPhoto");

  const {
    panNumberEncrypted: _p,
    aadhaarNumberEncrypted: _a,
    parentUid: _pu,
    parentName: _pn,
    parentRole: _pr,
    ...safe
  } = row;

  return {
    ...safe,
    isFrozen,
    hasKycDocs: Boolean(panFull && aadhaarFull),
    kyc: {
      status: row.kycStatus,
      panMasked,
      aadhaarMasked,
      city: typeof meta.city === "string" ? meta.city : null,
      pincode: typeof meta.pincode === "string" ? meta.pincode : null,
      bankName: typeof meta.bankName === "string" ? meta.bankName : null,
      hasBank: Boolean(meta.hasBank),
      submittedAt: kycAudit?.createdAt ?? null,
    },
    documents,
    documentFiles,
    wallets: walletRows.map((w) => ({
      walletType: w.walletType,
      balance: String(w.balance),
    })),
    parent: row.parentId
      ? {
          id: row.parentId,
          uid: row.parentUid,
          name: row.parentName,
          role: row.parentRole,
        }
      : null,
  };
}

/** Stream KYC photo bytes for admin preview (auth required via admin router). */
export async function getAdminKycDocument(
  userId: string,
  docKey: string,
): Promise<{ contentType: string; buffer: Buffer }> {
  const slot = KYC_DOC_KEY_TO_SLOT[docKey];
  if (!slot) {
    throw new HttpError(404, "KYC document not found", "KYC_DOC_NOT_FOUND");
  }

  const [row] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || row.role === "admin") {
    throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  }

  const kycAudit = await findLatestAuditLog({ userId, action: "kyc.submit" });
  const meta = (kycAudit?.metadata ?? {}) as Record<string, unknown>;
  const loaded = await loadKycPhotoBytes(meta, slot);
  if (!loaded) {
    throw new HttpError(
      404,
      "Photo bytes not on file — agent must re-submit KYC with gallery upload",
      "KYC_PHOTO_MISSING",
    );
  }
  return loaded;
}

export async function getAdminStats() {
  const roleCounts = await db
    .select({ role: users.role, total: count() })
    .from(users)
    .groupBy(users.role);

  const kycCounts = await db
    .select({ status: users.kycStatus, total: count() })
    .from(users)
    .where(sql`${users.role} <> 'admin'`)
    .groupBy(users.kycStatus);

  const txnCounts = await db
    .select({ status: transactions.status, total: count() })
    .from(transactions)
    .groupBy(transactions.status);

  const roles: Record<string, number> = {};
  for (const r of roleCounts) roles[r.role] = Number(r.total);

  const kyc: Record<string, number> = {};
  for (const r of kycCounts) kyc[r.status] = Number(r.total);

  const txns: Record<string, number> = {};
  for (const r of txnCounts) txns[r.status] = Number(r.total);

  return {
    users: {
      super_distributor: roles.super_distributor ?? 0,
      distributor: roles.distributor ?? 0,
      retailer: roles.retailer ?? 0,
      admin: roles.admin ?? 0,
      total: Object.values(roles).reduce((a, b) => a + b, 0),
    },
    kyc: {
      pending: kyc.pending ?? 0,
      verified: kyc.verified ?? 0,
      rejected: kyc.rejected ?? 0,
    },
    transactions: {
      success: txns.success ?? 0,
      failed: txns.failed ?? 0,
      pending: (txns.pending ?? 0) + (txns.initiated ?? 0),
      total: Object.values(txns).reduce((a, b) => a + b, 0),
    },
  };
}

/** Sidebar badges + header notification cards for admin ops queue. */
export async function getAdminAlerts() {
  const pendingKycByRoleRows = await db
    .select({ role: users.role, total: count() })
    .from(users)
    .where(and(eq(users.kycStatus, "pending"), sql`${users.role} <> 'admin'`))
    .groupBy(users.role);

  const byRole = {
    super_distributor: 0,
    distributor: 0,
    retailer: 0,
  };
  for (const r of pendingKycByRoleRows) {
    if (r.role === "super_distributor" || r.role === "distributor" || r.role === "retailer") {
      byRole[r.role] = Number(r.total);
    }
  }
  const kycPending = byRole.super_distributor + byRole.distributor + byRole.retailer;

  const recentPendingKyc = await db
    .select({
      id: users.id,
      uid: users.uid,
      name: users.name,
      mobile: users.mobile,
      role: users.role,
      updatedAt: users.updatedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.kycStatus, "pending"), sql`${users.role} <> 'admin'`))
    .orderBy(desc(users.updatedAt))
    .limit(25);

  const [fundRow] = await db
    .select({ total: count() })
    .from(fundRequests)
    .where(sql`${fundRequests.status} IN ('submitted', 'pending_match')`);

  const [ticketRow] = await db
    .select({ total: count() })
    .from(supportTickets)
    .where(eq(supportTickets.status, "open"));

  const fundRequestsPending = Number(fundRow?.total ?? 0);
  const supportTicketsOpen = Number(ticketRow?.total ?? 0);

  const ROLE_LABEL: Record<string, string> = {
    retailer: "Retailer",
    distributor: "Distributor",
    super_distributor: "Super Distributor",
  };

  const notifications = [
    ...recentPendingKyc.map((u) => {
      const roleLabel = ROLE_LABEL[u.role] ?? u.role;
      return {
        id: `kyc:${u.id}`,
        type: "kyc_pending" as const,
        title: `New ${roleLabel.toLowerCase()} pending KYC`,
        body: `${u.name} · ${u.mobile} · ${u.uid}`,
        href: `/users/${u.id}`,
        createdAt:
          (u.updatedAt ?? u.createdAt) instanceof Date
            ? (u.updatedAt ?? u.createdAt)!.toISOString()
            : String(u.updatedAt ?? u.createdAt ?? new Date().toISOString()),
        meta: { role: u.role, userId: u.id },
      };
    }),
    ...(fundRequestsPending > 0
      ? [
          {
            id: "fund-requests",
            type: "fund_request" as const,
            title: "Fund requests awaiting review",
            body: `${fundRequestsPending} request${fundRequestsPending === 1 ? "" : "s"} need admin action`,
            href: "/fund-requests",
            createdAt: new Date().toISOString(),
            meta: { count: fundRequestsPending },
          },
        ]
      : []),
    ...(supportTicketsOpen > 0
      ? [
          {
            id: "support-tickets",
            type: "support_ticket" as const,
            title: "Open support tickets",
            body: `${supportTicketsOpen} ticket${supportTicketsOpen === 1 ? "" : "s"} still open`,
            href: "/support-tickets",
            createdAt: new Date().toISOString(),
            meta: { count: supportTicketsOpen },
          },
        ]
      : []),
  ];

  return {
    badges: {
      kycPending,
      kycPendingByRole: byRole,
      fundRequestsPending,
      supportTicketsOpen,
    },
    notifications,
  };
}

export async function listAdminUsers(opts: {
  role?: UserRole;
  kycStatus?: KycStatus;
  q?: string;
  limit: number;
  offset: number;
}) {
  const conditions = [sql`${users.role} <> 'admin'`];
  if (opts.role) conditions.push(eq(users.role, opts.role));
  if (opts.kycStatus) conditions.push(eq(users.kycStatus, opts.kycStatus));
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    conditions.push(
      or(ilike(users.name, q), ilike(users.mobile, q), ilike(users.uid, q), ilike(users.email, q))!,
    );
  }

  return db
    .select({
      id: users.id,
      uid: users.uid,
      name: users.name,
      email: users.email,
      mobile: users.mobile,
      role: users.role,
      kycStatus: users.kycStatus,
      isActive: users.isActive,
      // Full-freeze status, not isActive — see setRestrictionLevel(). isActive is the
      // account-lifecycle flag (never onboarded / closed), no longer the moderation lever.
      isFrozen: sql<boolean>`coalesce(bool_or(${accounts.blockLogin}), false)`,
      parentId: users.parentId,
      hasKycDocs: sql<boolean>`(${users.panNumberEncrypted} is not null and ${users.aadhaarNumberEncrypted} is not null)`,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(accounts, eq(accounts.userId, users.id))
    .where(and(...conditions))
    .groupBy(
      users.id,
      users.uid,
      users.name,
      users.email,
      users.mobile,
      users.role,
      users.kycStatus,
      users.isActive,
      users.parentId,
      users.panNumberEncrypted,
      users.aadhaarNumberEncrypted,
      users.createdAt,
    )
    .orderBy(desc(users.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

/**
 * @deprecated Thin alias kept for any external caller still hitting
 * PATCH /admin/users/:id/active. Routes through setRestrictionLevel() rather than writing
 * users.isActive directly — a straight deactivate used to kill login outright, which is the
 * one lever spec §6.4 reserves for confirmed fraud. Use setRestrictionLevel() ("freeze" / "none")
 * for any new caller.
 */
export async function setUserActive(adminId: string, userId: string, isActive: boolean) {
  const result = await setRestrictionLevel(
    adminId,
    userId,
    isActive ? "none" : "freeze",
    isActive ? "" : "Deactivated via legacy admin.user_deactivate path",
  );
  return { id: result.userId, uid: userId, isActive };
}

/**
 * Hard-delete an agent (not admin). Blocks if they still have downline.
 * Unlinks ledger accounts / journals; removes wallet books + related rows; then deletes the user
 * (cascade covers hierarchy, refresh tokens, devices, support tickets owned by them, wallets).
 */
export async function deleteAdminUser(adminId: string, userId: string) {
  if (userId === adminId) {
    throw new HttpError(403, "You cannot delete your own account", "CANNOT_SELF_DELETE");
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (target.role === "admin") {
    throw new HttpError(403, "Admin accounts cannot be deleted here", "ADMIN_PROTECTED");
  }

  const [child] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.parentId, userId))
    .limit(1);
  if (child) {
    throw new HttpError(
      422,
      "Reassign or delete this agent's downline before deleting them",
      "HAS_DOWNLINE",
    );
  }

  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ userId: null }).where(eq(accounts.userId, userId));
    await tx.update(accounts).set({ blockedBy: null }).where(eq(accounts.blockedBy, userId));
    await tx.update(journals).set({ performedBy: null }).where(eq(journals.performedBy, userId));
    await tx
      .update(supportTickets)
      .set({ resolvedBy: null })
      .where(eq(supportTickets.resolvedBy, userId));
    await tx
      .update(fundRequests)
      .set({ reviewedBy: null })
      .where(eq(fundRequests.reviewedBy, userId));
    await tx
      .update(fundRequestEvents)
      .set({ actorId: null })
      .where(eq(fundRequestEvents.actorId, userId));
    await tx
      .update(agentSettlementAccounts)
      .set({ approvedBy: null })
      .where(eq(agentSettlementAccounts.approvedBy, userId));
    await tx
      .update(reconciliationExceptions)
      .set({ closedBy: null })
      .where(eq(reconciliationExceptions.closedBy, userId));

    const userWallets = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.userId, userId));
    const walletIds = userWallets.map((w) => w.id);

    if (walletIds.length > 0) {
      const touched = await tx
        .select({ groupId: walletLedgerEntries.groupId })
        .from(walletLedgerEntries)
        .where(inArray(walletLedgerEntries.walletId, walletIds));
      const groupIds = [...new Set(touched.map((t) => t.groupId))];

      if (groupIds.length > 0) {
        await tx
          .delete(commissionLedger)
          .where(
            or(
              eq(commissionLedger.beneficiaryUserId, userId),
              inArray(commissionLedger.ledgerGroupId, groupIds),
            ),
          );
        await tx
          .delete(walletLedgerEntries)
          .where(inArray(walletLedgerEntries.groupId, groupIds));
        await tx.delete(walletLedgerGroups).where(inArray(walletLedgerGroups.id, groupIds));
      }

      await tx
        .delete(walletLedgerEntries)
        .where(inArray(walletLedgerEntries.walletId, walletIds));
    }

    await tx.delete(commissionLedger).where(eq(commissionLedger.beneficiaryUserId, userId));
    await tx.delete(walletIdempotency).where(eq(walletIdempotency.userId, userId));

    const frRows = await tx
      .select({ id: fundRequests.id })
      .from(fundRequests)
      .where(eq(fundRequests.requesterUserId, userId));
    if (frRows.length > 0) {
      await tx
        .delete(fundRequestEvents)
        .where(
          inArray(
            fundRequestEvents.fundRequestId,
            frRows.map((r) => r.id),
          ),
        );
      await tx.delete(fundRequests).where(eq(fundRequests.requesterUserId, userId));
    }

    await tx.delete(settlementRequests).where(eq(settlementRequests.userId, userId));
    await tx
      .delete(agentSettlementAccounts)
      .where(
        or(
          eq(agentSettlementAccounts.userId, userId),
          eq(agentSettlementAccounts.createdBy, userId),
        ),
      );

    await tx
      .delete(floatTransfers)
      .where(
        or(eq(floatTransfers.initiatedBy, userId), eq(floatTransfers.approvedBy, userId)),
      );
    await tx
      .delete(allocations)
      .where(or(eq(allocations.requestedBy, userId), eq(allocations.approvedBy, userId)));
    await tx
      .delete(reconAdjustments)
      .where(
        or(eq(reconAdjustments.requestedBy, userId), eq(reconAdjustments.approvedBy, userId)),
      );

    await tx.delete(transactions).where(eq(transactions.userId, userId));
    await tx.delete(otpRequests).where(eq(otpRequests.mobile, target.mobile));
    await tx.delete(users).where(eq(users.id, userId));
    // Dev-friendly: keep ASP* sequence tight after hard delete (no gaps from removed agents).
    await resyncUidCounter(target.role, tx);
  });

  await insertAuditLog({
    userId: adminId,
    action: "admin.user_delete",
    entityType: "user",
    entityId: userId,
    metadata: { uid: target.uid, mobile: target.mobile, role: target.role, name: target.name },
  });

  return { id: target.id, uid: target.uid, mobile: target.mobile };
}

/**
 * Re-admit a merchant to AePS after a block or dormancy.
 *
 * Every AePS gate in modules/aeps/compliance.ts was previously a one-way door: the EDD and
 * block flags were only ever set, and the dormancy anchor only advanced on a successful
 * transaction that a blocked merchant could not make. This is the exit — spec §6.4 requires
 * that a block never traps an agent.
 *
 * Gated on KYC being verified, because that is exactly what RBI's AePS Touchpoint Operator
 * Directions require before a dormant operator resumes: fresh KYC, not just an admin's say-so.
 * Also covers the merchant who changed their Aadhaar-linked mobile at UIDAI — re-verify, then
 * reactivate.
 */
export async function reactivateAeps(
  adminId: string,
  userId: string,
  reason: string,
): Promise<{ id: string; uid: string; clearedBlockReason: string | null; wasEddRequired: boolean }> {
  if (reason.trim().length < 8) {
    throw new HttpError(422, "A written reason is required", "REASON_REQUIRED");
  }

  const [target] = await db
    .select({
      id: users.id,
      uid: users.uid,
      kycStatus: users.kycStatus,
      aepsBlockReason: users.aepsBlockReason,
      aepsEddRequired: users.aepsEddRequired,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (target.kycStatus !== "verified") {
    throw new HttpError(
      422,
      "KYC must be re-verified before AePS can be reactivated",
      "KYC_NOT_VERIFIED",
    );
  }

  const now = new Date();
  await db
    .update(users)
    .set({
      aepsBlockReason: null,
      aepsEddRequired: false,
      aepsReactivatedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await insertAuditLog({
    userId: adminId,
    action: "admin.aeps_reactivate",
    entityType: "user",
    entityId: userId,
    metadata: {
      reason: reason.trim(),
      clearedBlockReason: target.aepsBlockReason,
      wasEddRequired: target.aepsEddRequired,
    },
  });

  return {
    id: target.id,
    uid: target.uid,
    clearedBlockReason: target.aepsBlockReason,
    wasEddRequired: target.aepsEddRequired,
  };
}

/**
 * Graded restriction, replacing the old all-or-nothing `users.is_active` switch.
 *
 *   soft   — AePS and money transfer off. Bill payments, recharge, balance, settlement,
 *            support and login all keep working. This is the default response to a suspicion.
 *   hard   — the above plus no top-ups. Money already earned can still be settled out.
 *   freeze — everything, including login. Confirmed fraud only, never automatic.
 *   none   — lift everything.
 *
 * Settlement stays open under soft and hard on purpose. Switching off an agent's services is a
 * commercial decision we are entitled to make; holding on to money they have already earned is
 * not, until fraud is established. Only `freeze` stops a payout, and it should carry a documented
 * case and a review date.
 */
export type RestrictionLevel = "none" | "soft" | "hard" | "freeze";

const RESTRICTION_FLAGS: Record<
  RestrictionLevel,
  { blockServices: boolean; blockTopup: boolean; blockSettlement: boolean; blockLogin: boolean }
> = {
  none: { blockServices: false, blockTopup: false, blockSettlement: false, blockLogin: false },
  soft: { blockServices: true, blockTopup: false, blockSettlement: false, blockLogin: false },
  hard: { blockServices: true, blockTopup: true, blockSettlement: false, blockLogin: false },
  freeze: { blockServices: true, blockTopup: true, blockSettlement: true, blockLogin: true },
};

export async function setRestrictionLevel(
  adminId: string,
  userId: string,
  level: RestrictionLevel,
  reason: string,
): Promise<{ userId: string; level: RestrictionLevel; accountsUpdated: number }> {
  if (level !== "none" && reason.trim().length < 8) {
    throw new HttpError(422, "A written reason is required", "REASON_REQUIRED");
  }

  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (target.role === "admin") {
    throw new HttpError(422, "Admins hold no wallet to restrict", "INVALID_TARGET");
  }

  const flags = RESTRICTION_FLAGS[level];
  const now = new Date();

  const updated = await db
    .update(accounts)
    .set({
      ...flags,
      blockReason: level === "none" ? null : reason.trim(),
      blockedBy: level === "none" ? null : adminId,
      blockedAt: level === "none" ? null : now,
    })
    .where(eq(accounts.userId, userId))
    .returning({ id: accounts.id });

  await insertAuditLog({
    userId: adminId,
    action: "admin.restriction_set",
    entityType: "user",
    entityId: userId,
    metadata: { level, reason: reason.trim(), accountsUpdated: updated.length },
  });

  return { userId, level, accountsUpdated: updated.length };
}

/**
 * Admin-only tree move: change a user's parent and rebuild the closure-table edges
 * for that user and their entire subtree. Wallet balances are unchanged.
 */
export async function reassignUserParent(
  adminId: string,
  userId: string,
  opts: { newParentId?: string; newParentUid?: string },
): Promise<{
  id: string;
  uid: string;
  parentId: string;
  previousParentId: string | null;
}> {
  let newParentId = opts.newParentId;
  if (!newParentId && opts.newParentUid) {
    const [byUid] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.uid, opts.newParentUid.toUpperCase()))
      .limit(1);
    if (!byUid) throw new HttpError(404, "New parent not found", "PARENT_NOT_FOUND");
    newParentId = byUid.id;
  }
  if (!newParentId) {
    throw new HttpError(422, "newParentId or newParentUid is required", "PARENT_REQUIRED");
  }

  if (userId === newParentId) {
    throw new HttpError(422, "A user cannot be their own parent", "INVALID_PARENT");
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (target.role === "admin") {
    throw new HttpError(403, "Admin accounts cannot be reassigned", "ADMIN_PROTECTED");
  }

  const requiredParentRole = REQUIRED_PARENT_ROLE[target.role];
  if (!requiredParentRole) {
    throw new HttpError(422, "This role cannot be reassigned", "INVALID_TARGET");
  }

  const [newParent] = await db.select().from(users).where(eq(users.id, newParentId)).limit(1);
  if (!newParent) throw new HttpError(404, "New parent not found", "PARENT_NOT_FOUND");
  if (!newParent.isActive) {
    throw new HttpError(422, "New parent account is inactive", "PARENT_INACTIVE");
  }
  if (newParent.role !== requiredParentRole) {
    throw new HttpError(
      422,
      `A ${target.role.replace(/_/g, " ")} must report to a ${requiredParentRole.replace(/_/g, " ")}`,
      "INVALID_HIERARCHY",
    );
  }

  if (target.parentId === newParentId) {
    throw new HttpError(422, "User already has this parent", "ALREADY_ASSIGNED");
  }

  // Cycle guard: new parent must not be inside the target's subtree.
  const [cycle] = await db
    .select({ depth: userHierarchy.depth })
    .from(userHierarchy)
    .where(and(eq(userHierarchy.ancestorId, userId), eq(userHierarchy.descendantId, newParentId)))
    .limit(1);
  if (cycle) {
    throw new HttpError(422, "Cannot move a user under their own downline", "HIERARCHY_CYCLE");
  }

  const previousParentId = target.parentId;

  await db.transaction(async (tx) => {
    const subtreeRows = await tx
      .select({
        descendantId: userHierarchy.descendantId,
        depth: userHierarchy.depth,
      })
      .from(userHierarchy)
      .where(eq(userHierarchy.ancestorId, userId));

    const subtreeIds = subtreeRows.map((r) => r.descendantId);
    if (subtreeIds.length === 0) {
      throw new HttpError(500, "Hierarchy row missing for user", "HIERARCHY_CORRUPT");
    }

    // Drop edges from outside ancestors into the moved subtree (keep intra-subtree edges).
    await tx
      .delete(userHierarchy)
      .where(
        and(inArray(userHierarchy.descendantId, subtreeIds), notInArray(userHierarchy.ancestorId, subtreeIds)),
      );

    await tx
      .update(users)
      .set({ parentId: newParentId, updatedAt: new Date() })
      .where(eq(users.id, userId));

    const newAncestors = await tx
      .select({
        ancestorId: userHierarchy.ancestorId,
        depth: userHierarchy.depth,
      })
      .from(userHierarchy)
      .where(eq(userHierarchy.descendantId, newParentId));

    if (newAncestors.length === 0) {
      throw new HttpError(500, "Hierarchy row missing for new parent", "HIERARCHY_CORRUPT");
    }

    const inserts: { ancestorId: string; descendantId: string; depth: number }[] = [];
    for (const anc of newAncestors) {
      for (const node of subtreeRows) {
        inserts.push({
          ancestorId: anc.ancestorId,
          descendantId: node.descendantId,
          depth: anc.depth + 1 + node.depth,
        });
      }
    }

    if (inserts.length > 0) {
      await tx.insert(userHierarchy).values(inserts);
    }
  });

  await insertAuditLog({
    userId: adminId,
    action: "admin.user_reassign_parent",
    entityType: "user",
    entityId: userId,
    metadata: {
      previousParentId,
      newParentId,
      targetUid: target.uid,
      newParentUid: newParent.uid,
    },
  });

  return {
    id: target.id,
    uid: target.uid,
    parentId: newParentId,
    previousParentId,
  };
}

export async function listKycQueue(opts: { status?: KycStatus; limit: number; offset: number }) {
  const status = opts.status ?? "pending";
  return db
    .select({
      id: users.id,
      uid: users.uid,
      name: users.name,
      mobile: users.mobile,
      role: users.role,
      kycStatus: users.kycStatus,
      hasKycDocs: sql<boolean>`(${users.panNumberEncrypted} is not null and ${users.aadhaarNumberEncrypted} is not null)`,
      updatedAt: users.updatedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.kycStatus, status), sql`${users.role} <> 'admin'`))
    .orderBy(desc(users.updatedAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function decideKyc(adminId: string, userId: string, decision: "verified" | "rejected") {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (user.role === "admin") throw new HttpError(400, "Cannot change admin KYC", "INVALID_TARGET");

  if (decision === "verified") {
    if (!user.panNumberEncrypted || !user.aadhaarNumberEncrypted) {
      throw new HttpError(
        422,
        "Cannot verify KYC without PAN and Aadhaar on file",
        "KYC_DOCS_REQUIRED",
      );
    }
  }

  const [updated] = await db
    .update(users)
    .set({ kycStatus: decision, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  await insertAuditLog({
    userId: adminId,
    action: decision === "verified" ? "kyc.approve" : "kyc.reject",
    entityType: "user",
    entityId: userId,
    metadata: { previous: user.kycStatus },
  });

  void sendSlackAlert("KYC status changed", "general", {
    retailerId: user.id,
    retailerName: user.name,
    previousStatus: user.kycStatus,
    newStatus: decision,
  });

  if (user.email && user.emailVerifiedAt) {
    notifyUserEmail(user.email, () =>
      kycDecisionEmailTemplate({ name: user.name, decision }),
    );
  }

  return {
    id: updated!.id,
    uid: updated!.uid,
    kycStatus: updated!.kycStatus,
  };
}

export async function listAdminTransactions(opts: {
  status?: TransactionStatus;
  userId?: string;
  limit: number;
  offset: number;
}) {
  const conditions = [];
  if (opts.status) conditions.push(eq(transactions.status, opts.status));
  if (opts.userId) conditions.push(eq(transactions.userId, opts.userId));

  return db
    .select({
      id: transactions.id,
      txnRef: transactions.txnRef,
      amount: transactions.amount,
      status: transactions.status,
      userId: transactions.userId,
      userName: users.name,
      userUid: users.uid,
      userRole: users.role,
      serviceName: services.name,
      serviceCode: services.code,
      createdAt: transactions.createdAt,
      completedAt: transactions.completedAt,
      failureReason: transactions.failureReason,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.userId, users.id))
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(transactions.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function listCatalogAdmin() {
  const harnessCodes = new Set(["SHIM_BANK", "SHIM_OTH", "SHIM_UNMAPPED"]);
  const categories = await db.select().from(serviceCategories).orderBy(serviceCategories.displayOrder);
  const allServices = await db.select().from(services).orderBy(services.displayOrder);
  return categories
    .filter((c) => !harnessCodes.has(c.code.toUpperCase()))
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      icon: c.icon,
      isActive: c.isActive,
      services: allServices
        .filter((s) => s.categoryId === c.id && !harnessCodes.has(s.code.toUpperCase()))
        .map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          badge: s.badge,
          isActive: s.isActive,
          displayOrder: s.displayOrder,
          minAmount: s.minAmount,
          maxAmount: s.maxAmount,
        })),
    }));
}

export async function updateServiceSiteControl(
  adminId: string,
  serviceId: string,
  patch: {
    badge?: string | null;
    isActive?: boolean;
    name?: string;
    minAmount?: string | null;
    maxAmount?: string | null;
  },
) {
  const [existing] = await db.select().from(services).where(eq(services.id, serviceId));
  if (!existing) throw new HttpError(404, "Service not found", "SERVICE_NOT_FOUND");

  // Policy Engine Lite (2026-07-21): these two fields are already enforced live in
  // executeServiceTxn (txn.service.ts) — this just exposes editing what was previously
  // DB-only. No new enforcement logic added, so no new money-path risk.
  const [updated] = await db
    .update(services)
    .set({
      badge: patch.badge === undefined ? existing.badge : patch.badge?.trim() || null,
      isActive: patch.isActive ?? existing.isActive,
      name: patch.name?.trim() || existing.name,
      minAmount: patch.minAmount === undefined ? existing.minAmount : patch.minAmount?.trim() || null,
      maxAmount: patch.maxAmount === undefined ? existing.maxAmount : patch.maxAmount?.trim() || null,
    })
    .where(eq(services.id, serviceId))
    .returning();

  await insertAuditLog({
    userId: adminId,
    action: "admin.catalog_service_update",
    entityType: "service",
    entityId: serviceId,
    metadata: patch as Record<string, unknown>,
  });

  return updated;
}

/** Virtual commission row id — not a real `services.id`; upsert fans out to all member codes. */
export const AEPS_COMMISSION_VIRTUAL_ID = "__AEPS_GROUP__";

/** Banking Services AEPS sub-ops → one shared commission control (Task 25). */
const AEPS_COMMISSION_GROUP_CODES = [
  "CASH_WITHDRAW",
  "MINI_STATEMENT",
  "CASH_DEPOSIT",
  "BALANCE_ENQUIRY",
] as const;

const AEPS_COMMISSION_GROUP_CODE_SET = new Set<string>(AEPS_COMMISSION_GROUP_CODES);

type CommissionServiceRowOut = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  hasOverride: boolean;
  ruleType: "flat" | "percentage";
  value: string;
  rateActive: boolean;
};

function mapCommissionServiceRow(
  s: { id: string; code: string; name: string; isActive: boolean },
  rate: { ruleType: "flat" | "percentage"; value: string; isActive: boolean } | undefined,
): CommissionServiceRowOut {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    isActive: s.isActive,
    hasOverride: Boolean(rate),
    ruleType: rate?.ruleType ?? "percentage",
    value: rate ? String(rate.value) : "",
    rateActive: rate?.isActive ?? true,
  };
}

/** Collapse AEPS sub-services into one virtual row; leave other services as-is (BBPS untouched). */
function foldAepsCommissionGroup(
  categoryServices: Array<{ id: string; code: string; name: string; isActive: boolean }>,
  rateByService: Map<string, { ruleType: "flat" | "percentage"; value: string; isActive: boolean }>,
): CommissionServiceRowOut[] {
  const aepsMembers = categoryServices.filter((s) => AEPS_COMMISSION_GROUP_CODE_SET.has(s.code));
  if (aepsMembers.length === 0) {
    return categoryServices.map((s) => mapCommissionServiceRow(s, rateByService.get(s.id)));
  }

  // Canonical display rate: CASH_WITHDRAW if present, else first member.
  const canonical = aepsMembers.find((s) => s.code === "CASH_WITHDRAW") ?? aepsMembers[0]!;
  const rate = rateByService.get(canonical.id);
  const hasAnyOverride = aepsMembers.some((s) => rateByService.has(s.id));
  const virtual: CommissionServiceRowOut = {
    id: AEPS_COMMISSION_VIRTUAL_ID,
    code: "AEPS",
    name: "AEPS",
    isActive: aepsMembers.some((s) => s.isActive),
    hasOverride: hasAnyOverride,
    ruleType: rate?.ruleType ?? "percentage",
    value: rate ? String(rate.value) : "",
    rateActive: rate?.isActive ?? true,
  };

  const out: CommissionServiceRowOut[] = [];
  let inserted = false;
  for (const s of categoryServices) {
    if (AEPS_COMMISSION_GROUP_CODE_SET.has(s.code)) {
      if (!inserted) {
        out.push(virtual);
        inserted = true;
      }
      continue;
    }
    out.push(mapCommissionServiceRow(s, rateByService.get(s.id)));
  }
  return out;
}

export async function getAdminUserCommissions(userId: string) {
  const [user] = await db
    .select({ id: users.id, role: users.role, name: users.name, uid: users.uid })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (user.role === "admin") throw new HttpError(400, "Cannot set commission for admin", "INVALID_TARGET");

  // Internal routing categories (AEPS_RAIL, DMT_RAIL — added 2026-07-21 so admin can pick a
  // provider per rail) are isActive:false specifically to stay out of anything customer/agent-
  // facing, including this commission editor: commission is set per catalog tile (e.g. "Money
  // Transfer", "Cash Withdraw" under Banking Services), not per internal operation code like
  // dmt_remitter_profile. AEPS catalog tiles are folded into one virtual "AEPS" row (Task 25).
  const categories = await db
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.isActive, true))
    .orderBy(serviceCategories.displayOrder);
  const allServices = await db.select().from(services).orderBy(services.displayOrder);
  const rates = await db
    .select()
    .from(userCommissionRates)
    .where(eq(userCommissionRates.userId, userId));
  const rateByService = new Map(rates.map((r) => [r.serviceId, r]));

  return {
    user: { id: user.id, name: user.name, uid: user.uid, role: user.role },
    categories: categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      services: foldAepsCommissionGroup(
        allServices.filter((s) => s.categoryId === c.id),
        rateByService,
      ),
    })),
  };
}

export async function upsertAdminUserCommissions(
  adminId: string,
  userId: string,
  rates: Array<{
    serviceId: string;
    ruleType: "flat" | "percentage";
    value: string;
    isActive?: boolean;
    clear?: boolean;
  }>,
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (user.role === "admin") throw new HttpError(400, "Cannot set commission for admin", "INVALID_TARGET");

  // Expand virtual AEPS row → all 4 underlying service ids (same rate / clear).
  const aepsRows = await db
    .select({ id: services.id, code: services.code })
    .from(services)
    .where(inArray(services.code, [...AEPS_COMMISSION_GROUP_CODES]));
  const aepsServiceIds = aepsRows.map((s) => s.id);

  const expandedRates: typeof rates = [];
  for (const rate of rates) {
    if (rate.serviceId === AEPS_COMMISSION_VIRTUAL_ID) {
      if (aepsServiceIds.length === 0) {
        throw new HttpError(400, "AEPS services not found in catalog", "INVALID_SERVICE");
      }
      for (const id of aepsServiceIds) {
        expandedRates.push({ ...rate, serviceId: id });
      }
      continue;
    }
    expandedRates.push(rate);
  }

  const serviceIds = expandedRates.map((r) => r.serviceId);
  if (serviceIds.length) {
    const found = await db.select({ id: services.id }).from(services);
    const valid = new Set(found.map((s) => s.id));
    for (const id of serviceIds) {
      if (!valid.has(id)) throw new HttpError(400, `Unknown service ${id}`, "INVALID_SERVICE");
    }
  }

  for (const rate of expandedRates) {
    if (rate.clear) {
      await db
        .delete(userCommissionRates)
        .where(
          and(eq(userCommissionRates.userId, userId), eq(userCommissionRates.serviceId, rate.serviceId)),
        );
      continue;
    }

    const valueNum = Number(rate.value);
    if (!Number.isFinite(valueNum) || valueNum < 0) {
      throw new HttpError(400, "Commission value must be a non-negative number", "INVALID_VALUE");
    }
    if (rate.ruleType === "percentage" && valueNum > 100) {
      throw new HttpError(400, "Percentage cannot exceed 100", "INVALID_VALUE");
    }
    // Flat rupee overrides: hard ceiling to prevent float drain from misconfig.
    const flatCap = env.MAX_FLAT_COMMISSION_RUPEES ?? 500;
    if (rate.ruleType === "flat" && valueNum > flatCap) {
      throw new HttpError(400, `Flat commission cannot exceed ₹${flatCap}`, "INVALID_VALUE");
    }

    const value = valueNum.toFixed(4);
    const isActive = rate.isActive !== false;
    const [existing] = await db
      .select({ id: userCommissionRates.id })
      .from(userCommissionRates)
      .where(
        and(eq(userCommissionRates.userId, userId), eq(userCommissionRates.serviceId, rate.serviceId)),
      )
      .limit(1);

    if (existing) {
      await db
        .update(userCommissionRates)
        .set({
          ruleType: rate.ruleType,
          value,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(userCommissionRates.id, existing.id));
    } else {
      await db.insert(userCommissionRates).values({
        userId,
        serviceId: rate.serviceId,
        ruleType: rate.ruleType,
        value,
        isActive,
      });
    }
  }

  await insertAuditLog({
    userId: adminId,
    action: "admin.user_commission_upsert",
    entityType: "user",
    entityId: userId,
    metadata: { count: expandedRates.length },
  });

  return getAdminUserCommissions(userId);
}

// ── Developer Options → Providers (Task 23A) ────────────────────────────────
// Grouped by CATEGORY (DMT, AEPS, BBPS, ...), not by individual catalog tile — every BBPS
// biller (Mobile Prepaid, DTH, Electricity, ...) shares one real-world API/provider, so listing
// 30 identical rows was noise. One row per category, one sub-row per distinct provider actually
// mapped underneath it; toggling/reordering acts on every service in that category at once via
// providerServiceIds. Toggling here only flips DB rows — resolveProvidersForService
// (provider.router.ts) reads them fresh on every call, so changes take effect immediately with
// no restart.
//
// AEPS + DMT (2026-07-21): migrated onto this table — see aepsMode.ts. They appear as normal
// category rows below (hidden from the retailer catalog via serviceCategories.isActive=false,
// but still listed here). Nepal remittance + merchant onboarding/eKYC still call
// InstantPay-specific endpoints directly (no generic adapter method to route through), so they
// stay on AEPS_PROVIDER_MODE — surfaced via the read-only getAepsDmtRailInfo() banner below so
// admin isn't left guessing why Nepal isn't in this list.
//
// Pinned display order (2026-07-21, user request): AEPS, then DMT, then everything else in
// catalog displayOrder. Deliberately NOT changing serviceCategories.displayOrder itself for
// BILL_PAYMENT_BBPS — that field also drives the retailer-facing tile grid ordering
// (catalog.service.ts), so this panel sorts independently instead of touching shared data.
const PINNED_CATEGORY_ORDER = ["AEPS_RAIL", "DMT_RAIL"];

export async function listProvidersAdmin() {
  const categories = await db.select().from(serviceCategories).orderBy(serviceCategories.displayOrder);
  const allServices = await db.select().from(services);
  const health = await getProviderHealthStats();
  const rows = await db
    .select({
      providerServiceId: providerServices.id,
      serviceId: providerServices.serviceId,
      providerId: providerServices.providerId,
      isPrimary: providerServices.isPrimary,
      priority: providerServices.priority,
      mappingActive: providerServices.isActive,
      providerCode: providers.code,
      providerName: providers.name,
      providerActive: providers.isActive,
    })
    .from(providerServices)
    .innerJoin(providers, eq(providerServices.providerId, providers.id))
    .orderBy(desc(providerServices.isPrimary), providerServices.priority);

  const registeredCodes = new Set(listAdapterCodes());

  const sortedCategories = [...categories].sort((a, b) => {
    const ai = PINNED_CATEGORY_ORDER.indexOf(a.code);
    const bi = PINNED_CATEGORY_ORDER.indexOf(b.code);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.displayOrder - b.displayOrder;
  });

  return sortedCategories
    .map((cat) => {
      const svcsInCat = allServices.filter((s) => s.categoryId === cat.id);
      const svcIdsInCat = new Set(svcsInCat.map((s) => s.id));
      const catRows = rows.filter((r) => svcIdsInCat.has(r.serviceId));

      const byProvider = new Map<
        string,
        {
          providerId: string;
          providerCode: string;
          providerName: string;
          isPrimary: boolean;
          priority: number;
          isActive: boolean;
          adapterRegistered: boolean;
          providerServiceIds: string[];
          serviceCount: number;
          successRate: number | null;
          totalCalls: number;
        }
      >();
      for (const r of catRows) {
        let g = byProvider.get(r.providerId);
        if (!g) {
          g = {
            providerId: r.providerId,
            providerCode: r.providerCode,
            providerName: r.providerName,
            isPrimary: r.isPrimary,
            priority: r.priority,
            isActive: r.mappingActive && r.providerActive,
            adapterRegistered: registeredCodes.has(r.providerCode),
            providerServiceIds: [],
            serviceCount: 0,
            successRate: health[r.providerCode]?.successRate ?? null,
            totalCalls: health[r.providerCode]?.totalCalls ?? 0,
          };
          byProvider.set(r.providerId, g);
        }
        g.providerServiceIds.push(r.providerServiceId);
        g.serviceCount++;
      }

      // Per-service breakdown — lets admin toggle ONE biller's provider independently
      // (e.g. move just "DTH" to PaySprint while the rest of BBPS stays on Eko).
      //
      // NOT for AEPS/DMT (2026-07-21, user-flagged risk): those are multi-step sequential
      // flows (remitter register → verify → KYC → beneficiary → transfer, all sharing a
      // provider-specific referenceKey/beneficiaryId across steps). Splitting individual steps
      // across different providers would break mid-flow — transaction failure or a stuck
      // refund, exactly the risk Part C's financial-safety rules exist to prevent. AEPS/DMT
      // only get the category-level bulk toggle above (whole rail moves together).
      const allowPerServiceToggle = cat.code !== "AEPS_RAIL" && cat.code !== "DMT_RAIL";
      const serviceRows = !allowPerServiceToggle
        ? []
        : svcsInCat
        .map((s) => ({
          serviceId: s.id,
          serviceCode: s.code,
          serviceName: s.name,
          providers: rows
            .filter((r) => r.serviceId === s.id)
            .map((r) => ({
              providerServiceId: r.providerServiceId,
              providerId: r.providerId,
              providerCode: r.providerCode,
              providerName: r.providerName,
              isPrimary: r.isPrimary,
              priority: r.priority,
              isActive: r.mappingActive && r.providerActive,
              adapterRegistered: registeredCodes.has(r.providerCode),
              successRate: health[r.providerCode]?.successRate ?? null,
            }))
            .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.priority - b.priority),
        }))
        .filter((s) => s.providers.length > 0);

      return {
        categoryId: cat.id,
        categoryCode: cat.code,
        categoryName: cat.name,
        totalServices: svcIdsInCat.size,
        providers: [...byProvider.values()].sort(
          (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.priority - b.priority,
        ),
        services: serviceRows,
      };
    })
    .filter((g) => g.providers.length > 0);
}

/** Update one provider_services row directly — one biller, one provider. */
export async function updateProviderServiceRow(
  adminId: string,
  providerServiceId: string,
  patch: { isActive?: boolean; priority?: number },
) {
  const [existing] = await db.select().from(providerServices).where(eq(providerServices.id, providerServiceId));
  if (!existing) throw new HttpError(404, "Provider-service mapping not found", "PROVIDER_SERVICE_NOT_FOUND");

  const [updated] = await db
    .update(providerServices)
    .set({
      isActive: patch.isActive ?? existing.isActive,
      priority: patch.priority ?? existing.priority,
    })
    .where(eq(providerServices.id, providerServiceId))
    .returning();

  await insertAuditLog({
    userId: adminId,
    action: "admin.provider_service_row_update",
    entityType: "provider_service",
    entityId: providerServiceId,
    metadata: patch as Record<string, unknown>,
  });

  return updated;
}

/** Update every provider_services row for one provider within one category in a single call. */
export async function updateProviderForCategory(
  adminId: string,
  categoryId: string,
  providerId: string,
  patch: { isActive?: boolean; priority?: number },
) {
  const rows = await db
    .select({ id: providerServices.id, isActive: providerServices.isActive, priority: providerServices.priority })
    .from(providerServices)
    .innerJoin(services, eq(providerServices.serviceId, services.id))
    .where(and(eq(services.categoryId, categoryId), eq(providerServices.providerId, providerId)));

  if (!rows.length) throw new HttpError(404, "Provider mapping not found for this category", "PROVIDER_SERVICE_NOT_FOUND");

  await db
    .update(providerServices)
    .set({
      isActive: patch.isActive ?? rows[0]!.isActive,
      priority: patch.priority ?? rows[0]!.priority,
    })
    .where(
      and(
        eq(providerServices.providerId, providerId),
        inArray(
          providerServices.id,
          rows.map((r) => r.id),
        ),
      ),
    );

  await insertAuditLog({
    userId: adminId,
    action: "admin.provider_category_update",
    entityType: "provider_service_category",
    entityId: `${categoryId}:${providerId}`,
    metadata: { ...patch, affectedRows: rows.length },
  });

  return { categoryId, providerId, affectedRows: rows.length, ...patch };
}

/** Bulk "disable all" for one category — e.g. when a whole rail's backend is down. */
export async function disableAllProvidersForCategory(adminId: string, categoryId: string) {
  const [cat] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, categoryId));
  if (!cat) throw new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND");

  const catServiceIds = await db.select({ id: services.id }).from(services).where(eq(services.categoryId, categoryId));
  if (catServiceIds.length) {
    await db
      .update(providerServices)
      .set({ isActive: false })
      .where(
        inArray(
          providerServices.serviceId,
          catServiceIds.map((s) => s.id),
        ),
      );
  }

  await insertAuditLog({
    userId: adminId,
    action: "admin.provider_category_disable_all",
    entityType: "service_category",
    entityId: categoryId,
    metadata: { categoryCode: cat.code },
  });

  return { categoryId, disabled: true };
}

/**
 * Read-only info for the AEPS/DMT rail — sourced from AEPS_PROVIDER_MODE, NOT provider_services.
 * Not toggleable from this panel (see module header comment for why).
 */
export function getAepsDmtRailInfo() {
  return {
    mode: env.AEPS_PROVIDER_MODE,
    activeProviderCode: aepsAdapterCode(),
    note: "Nepal remittance + merchant onboarding/eKYC still route via AEPS_PROVIDER_MODE (env) — InstantPay-specific, no generic adapter yet. AEPS/DMT transactions below are provider-agnostic and controlled by the rows underneath.",
  };
}

/** Full org tree (every Super Distributor root down) — Network Tree admin page. */
export async function getNetworkTreeAdmin() {
  return getAdminFullNetworkTree();
}

// ── Audit Log Viewer ─────────────────────────────────────────────────────────
export async function listAuditLogsAdmin(opts: {
  action?: string;
  userId?: string;
  q?: string;
  limit: number;
  offset: number;
}) {
  const conditions = [];
  if (opts.action) conditions.push(ilike(auditLogs.action, `%${opts.action}%`));
  if (opts.userId) conditions.push(eq(auditLogs.userId, opts.userId));

  const actorAlias = alias(users, "audit_actor");
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      actorId: auditLogs.userId,
      actorName: actorAlias.name,
      actorUid: actorAlias.uid,
    })
    .from(auditLogs)
    .leftJoin(actorAlias, eq(auditLogs.userId, actorAlias.id))
    .where(
      and(
        ...conditions,
        opts.q?.trim()
          ? or(ilike(actorAlias.name, `%${opts.q.trim()}%`), ilike(auditLogs.entityId, `%${opts.q.trim()}%`))
          : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(auditLogs)
    .where(and(...conditions));

  return { rows, total };
}

// ── Provider Health % (Developer Options → Providers) ────────────────────────
/** Success rate per provider over a rolling window — surfaces which provider is actually failing. */
export async function getProviderHealthStats(windowHours = 24) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const rows = await db
    .select({
      providerCode: providerLogs.providerCode,
      status: providerLogs.status,
      count: count(),
    })
    .from(providerLogs)
    .where(sql`${providerLogs.createdAt} >= ${since}`)
    .groupBy(providerLogs.providerCode, providerLogs.status);

  const byProvider = new Map<string, { total: number; success: number }>();
  for (const r of rows) {
    const entry = byProvider.get(r.providerCode) ?? { total: 0, success: 0 };
    entry.total += r.count;
    if (r.status === "success") entry.success += r.count;
    byProvider.set(r.providerCode, entry);
  }

  return Object.fromEntries(
    [...byProvider.entries()].map(([code, { total, success }]) => [
      code,
      { totalCalls: total, successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : null },
    ]),
  );
}

/** "Currently under" chain for the Move modal — same data whether opened from Table or Tree view. */
export async function getUserAncestorsAdmin(userId: string) {
  return getUserAncestors(userId);
}

// ── Reconciliation v1 ──────────────────────────────────────────────────────
// Flags transactions where our internal status disagrees with the provider's own last-logged
// response for the same txnRef — the exact "internal ledger vs provider" mismatch category from
// the roadmap. Read-only: never auto-resolves (Part C financial-safety rule).
export async function listReconciliationMismatches(opts: { limit: number; offset: number }) {
  const rows = await db.execute(sql`
    select t.id, t.txn_ref as "txnRef", t.status as "ourStatus", t.amount, t.created_at as "createdAt",
           u.name as "userName", u.uid as "userUid", s.name as "serviceName",
           pl.status as "providerStatus", pl.provider_code as "providerCode", pl.created_at as "providerLoggedAt"
    from transactions t
    inner join users u on u.id = t.user_id
    inner join services s on s.id = t.service_id
    left join lateral (
      select status, provider_code, created_at
      from provider_logs
      where txn_ref = t.txn_ref
      order by created_at desc
      limit 1
    ) pl on true
    where t.status in ('pending', 'initiated')
       or (pl.status is not null and pl.status <> t.status)
    order by t.created_at desc
    limit ${opts.limit} offset ${opts.offset}
  `);
  return rows.rows as unknown as Array<{
    id: string;
    txnRef: string;
    ourStatus: string;
    amount: string;
    createdAt: string;
    userName: string;
    userUid: string;
    serviceName: string;
    providerStatus: string | null;
    providerCode: string | null;
    providerLoggedAt: string | null;
  }>;
}

// ── Risk / anomaly insights v1 ──────────────────────────────────────────────
// Real, threshold-based (not a fabricated score — see docs/ROADMAP.md note on why trust/risk
// *scores* are deferred until there's enough live volume to calibrate them meaningfully).
// Flags: users with repeated failed transactions in a rolling window.
export async function listRiskAlerts(opts: { windowHours: number; minFailures: number }) {
  const since = new Date(Date.now() - opts.windowHours * 60 * 60 * 1000);
  const rows = await db
    .select({
      userId: transactions.userId,
      userName: users.name,
      userUid: users.uid,
      userMobile: users.mobile,
      failCount: count(),
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.userId, users.id))
    .where(and(eq(transactions.status, "failed"), sql`${transactions.createdAt} >= ${since}`))
    .groupBy(transactions.userId, users.name, users.uid, users.mobile)
    .having(sql`count(*) >= ${opts.minFailures}`)
    .orderBy(desc(count()));

  return rows;
}

/**
 * Device and location findings from task #15 — mock location, low-accuracy, missing GPS,
 * out-of-zone, device-change frequency, RD licence expiry. All log-only: nothing here has ever
 * blocked a transaction or a device. This is the surface for the "collect a month, then set
 * thresholds" review the feature was built for.
 */
export async function listRiskSignals(opts: {
  signalType?: string;
  unreviewedOnly?: boolean;
  limit: number;
}) {
  const conditions = [];
  if (opts.signalType) conditions.push(eq(agentRiskSignals.signalType, opts.signalType));
  if (opts.unreviewedOnly) conditions.push(isNull(agentRiskSignals.reviewedAt));

  return db
    .select({
      id: agentRiskSignals.id,
      userId: agentRiskSignals.userId,
      userName: users.name,
      userUid: users.uid,
      signalType: agentRiskSignals.signalType,
      severity: agentRiskSignals.severity,
      details: agentRiskSignals.details,
      reviewedAt: agentRiskSignals.reviewedAt,
      createdAt: agentRiskSignals.createdAt,
    })
    .from(agentRiskSignals)
    .innerJoin(users, eq(agentRiskSignals.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(agentRiskSignals.createdAt))
    .limit(opts.limit);
}

export async function markRiskSignalReviewed(
  adminId: string,
  signalId: string,
): Promise<void> {
  const [updated] = await db
    .update(agentRiskSignals)
    .set({ reviewedAt: new Date(), reviewedBy: adminId })
    .where(eq(agentRiskSignals.id, signalId))
    .returning({ id: agentRiskSignals.id });
  if (!updated) throw new HttpError(404, "Risk signal not found", "RISK_SIGNAL_NOT_FOUND");
}
