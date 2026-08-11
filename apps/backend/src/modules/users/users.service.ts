import { eq, and, inArray } from "drizzle-orm";
import { db } from "../../db/postgres";
import { accounts, users, wallets } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import type { UserRole } from "@asanpay/shared-types";

/** SD / Distributor may activate or deactivate only their direct children. */
const CAN_TOGGLE_CHILD: ReadonlySet<UserRole> = new Set(["super_distributor", "distributor"]);

export interface DownlineUserView {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
  kycStatus: string;
  isActive: boolean;
  mainBalance: string;
  /** AEPS / cash-in wallet; "0" if the user has no aeps wallet row yet. */
  aepsBalance: string;
  createdAt: Date;
  /** Real field-presence flags (not derived guesses) — drives the KYC completion assistant. */
  hasPan: boolean;
  hasAadhaar: boolean;
  hasOutlet: boolean;
  hasOutletGeo: boolean;
}

export interface UplineView {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
}

export interface NetworkResponse {
  role: UserRole;
  downline: DownlineUserView[];
  upline: UplineView | null;
}

export async function getDownline(actorId: string): Promise<DownlineUserView[]> {
  const rows = await db
    .select({
      id: users.id,
      uid: users.uid,
      name: users.name,
      mobile: users.mobile,
      role: users.role,
      kycStatus: users.kycStatus,
      isActive: users.isActive,
      mainBalance: wallets.balance,
      createdAt: users.createdAt,
      panNumberEncrypted: users.panNumberEncrypted,
      aadhaarNumberEncrypted: users.aadhaarNumberEncrypted,
      instantpayOutletId: users.instantpayOutletId,
      outletLatitude: users.outletLatitude,
    })
    .from(users)
    .innerJoin(wallets, and(eq(wallets.userId, users.id), eq(wallets.walletType, "main")))
    .where(eq(users.parentId, actorId));

  if (rows.length === 0) return [];

  const aepsRows = await db
    .select({ userId: wallets.userId, balance: wallets.balance })
    .from(wallets)
    .where(and(inArray(wallets.userId, rows.map((r) => r.id)), eq(wallets.walletType, "aeps")));
  const aepsByUser = new Map(aepsRows.map((r) => [r.userId, r.balance]));

  return rows.map((r) => ({
    id: r.id,
    uid: r.uid,
    name: r.name,
    mobile: r.mobile,
    role: r.role,
    kycStatus: r.kycStatus,
    isActive: r.isActive,
    mainBalance: r.mainBalance,
    createdAt: r.createdAt,
    aepsBalance: aepsByUser.get(r.id) ?? "0",
    hasPan: r.panNumberEncrypted !== null,
    hasAadhaar: r.aadhaarNumberEncrypted !== null,
    hasOutlet: r.instantpayOutletId !== null,
    hasOutletGeo: r.outletLatitude !== null,
  }));
}

export interface DownlineTreeNode extends DownlineUserView {
  children: DownlineTreeNode[];
  /** Admin network tree only — accounts.blockLogin (full freeze). */
  isFrozen?: boolean;
}

export interface NetworkTreeResponse {
  role: UserRole;
  downline: DownlineUserView[];
  tree: DownlineTreeNode[];
  upline: UplineView | null;
}

async function buildTree(parentId: string): Promise<DownlineTreeNode[]> {
  const children = await getDownline(parentId);
  const nodes: DownlineTreeNode[] = [];
  for (const child of children) {
    const grandChildren = await buildTree(child.id);
    nodes.push({ ...child, children: grandChildren });
  }
  return nodes;
}

/** Admin-only: full org tree from every root (Super Distributor) down — used by Network Tree page. */
export async function getAdminFullNetworkTree(): Promise<DownlineTreeNode[]> {
  const roots = await db
    .select({
      id: users.id,
      uid: users.uid,
      name: users.name,
      mobile: users.mobile,
      role: users.role,
      kycStatus: users.kycStatus,
      isActive: users.isActive,
      mainBalance: wallets.balance,
      createdAt: users.createdAt,
      panNumberEncrypted: users.panNumberEncrypted,
      aadhaarNumberEncrypted: users.aadhaarNumberEncrypted,
      instantpayOutletId: users.instantpayOutletId,
      outletLatitude: users.outletLatitude,
    })
    .from(users)
    .innerJoin(wallets, and(eq(wallets.userId, users.id), eq(wallets.walletType, "main")))
    .where(eq(users.role, "super_distributor"));

  const aepsRows = roots.length
    ? await db
        .select({ userId: wallets.userId, balance: wallets.balance })
        .from(wallets)
        .where(and(inArray(wallets.userId, roots.map((r) => r.id)), eq(wallets.walletType, "aeps")))
    : [];
  const aepsByUser = new Map(aepsRows.map((r) => [r.userId, r.balance]));

  const nodes: DownlineTreeNode[] = [];
  for (const root of roots) {
    const children = await buildTree(root.id);
    nodes.push({
      id: root.id,
      uid: root.uid,
      name: root.name,
      mobile: root.mobile,
      role: root.role,
      kycStatus: root.kycStatus,
      isActive: root.isActive,
      mainBalance: root.mainBalance,
      createdAt: root.createdAt,
      aepsBalance: aepsByUser.get(root.id) ?? "0",
      hasPan: root.panNumberEncrypted !== null,
      hasAadhaar: root.aadhaarNumberEncrypted !== null,
      hasOutlet: root.instantpayOutletId !== null,
      hasOutletGeo: root.outletLatitude !== null,
      children,
    });
  }

  // Annotate freeze status for admin tree quick actions (View / Freeze / Move).
  const ids: string[] = [];
  const walk = (list: DownlineTreeNode[]) => {
    for (const n of list) {
      ids.push(n.id);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  const frozen = new Set<string>();
  if (ids.length) {
    const frozenRows = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(and(inArray(accounts.userId, ids), eq(accounts.blockLogin, true)));
    for (const r of frozenRows) {
      if (r.userId) frozen.add(r.userId);
    }
  }
  const annotate = (list: DownlineTreeNode[]): DownlineTreeNode[] =>
    list.map((n) => ({
      ...n,
      isFrozen: frozen.has(n.id),
      children: annotate(n.children),
    }));
  return annotate(nodes);
}

export async function getNetwork(actorId: string, actorRole: UserRole): Promise<NetworkTreeResponse> {
  const downline = actorRole !== "retailer" ? await getDownline(actorId) : [];
  const tree = actorRole !== "retailer" ? await buildTree(actorId) : [];

  let upline: UplineView | null = null;
  if (actorRole === "retailer" || actorRole === "distributor") {
    const [actor] = await db.select({ parentId: users.parentId }).from(users).where(eq(users.id, actorId)).limit(1);
    if (actor?.parentId) {
      const [parent] = await db
        .select({
          id: users.id,
          name: users.name,
          mobile: users.mobile,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, actor.parentId))
        .limit(1);
      if (parent) upline = parent;
    }
  }

  return { role: actorRole, downline, tree, upline };
}

export async function setDirectChildActive(
  actorId: string,
  actorRole: UserRole,
  childId: string,
  isActive: boolean,
): Promise<{ id: string; uid: string; isActive: boolean }> {
  if (!CAN_TOGGLE_CHILD.has(actorRole)) {
    throw new HttpError(403, "Only Super Distributors and Distributors can change child status", "FORBIDDEN");
  }
  if (childId === actorId) {
    throw new HttpError(403, "You cannot change your own active status", "CANNOT_SELF_DEACTIVATE");
  }

  const [target] = await db.select().from(users).where(eq(users.id, childId)).limit(1);
  if (!target) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (target.parentId !== actorId) {
    throw new HttpError(403, "You can only activate or deactivate users you directly onboarded", "NOT_YOUR_DOWNLINE");
  }

  const [row] = await db
    .update(users)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(users.id, childId))
    .returning({ id: users.id, uid: users.uid, isActive: users.isActive });
  if (!row) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  await insertAuditLog({
    userId: actorId,
    action: isActive ? "users.child_activate" : "users.child_deactivate",
    entityType: "user",
    entityId: childId,
    metadata: { childUid: row.uid },
  });

  return row;
}

export interface AncestorInfo {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
}

/** Walk parentId up to the root — immediate parent first. Used by the Move modal's "Currently under" chain. */
export async function getUserAncestors(userId: string): Promise<AncestorInfo[]> {
  const chain: AncestorInfo[] = [];
  let currentId: string | null = userId;
  // Hierarchy is at most 3 deep (retailer -> distributor -> super_distributor) — cap iterations
  // defensively so a bad parentId chain can't loop forever.
  for (let i = 0; i < 6 && currentId; i++) {
    const [row] = await db
      .select({ id: users.id, uid: users.uid, name: users.name, mobile: users.mobile, role: users.role, parentId: users.parentId })
      .from(users)
      .where(eq(users.id, currentId));
    if (!row?.parentId) break;
    const [parent] = await db
      .select({ id: users.id, uid: users.uid, name: users.name, mobile: users.mobile, role: users.role })
      .from(users)
      .where(eq(users.id, row.parentId));
    if (!parent) break;
    chain.push(parent);
    currentId = parent.id;
  }
  return chain;
}
