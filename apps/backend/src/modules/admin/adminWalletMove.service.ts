import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { paiseToRupees, rupeesToPaise, type Paise } from "../../core/money";
import { HttpError } from "../../utils/httpError";
import { transferBetweenWallets } from "../wallet/wallet.ledger";
import { getTenantSettings } from "../tenants/tenantSettings.service";

/**
 * Admin moves money between an agent and their direct upline — never creates money:
 *   transfer: upline main wallet → agent main wallet  (same journal as an upline "Fund")
 *   reverse : agent main wallet → upline main wallet  (same journal as an upline "Reverse")
 * At or above the tenant's dual-approval limit a second admin must approve before it posts.
 */

export type MoveKind = "transfer" | "reverse";

type Party = { id: string; name: string; uid: string; role: string; balance: string; walletId: string };

async function loadParties(agentUserId: string): Promise<{ agent: Party; upline: Party | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(agentUserId)) throw new HttpError(400, "Invalid agent id", "INVALID_ID");
  const res = await db.execute<{
    id: string;
    name: string;
    uid: string;
    role: string;
    is_active: boolean;
    parent_id: string | null;
    wallet_id: string | null;
    balance: string | null;
  }>(sql`
    SELECT u.id::text, u.name, u.uid, u.role::text AS role, u.is_active, u.parent_id::text,
           w.id::text AS wallet_id, w.balance::text AS balance
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id AND w.wallet_type = 'main'
    WHERE u.id = ${agentUserId}
       OR u.id = (SELECT parent_id FROM users WHERE id = ${agentUserId})
  `);
  const agentRow = res.rows.find((r) => r.id === agentUserId);
  if (!agentRow) throw new HttpError(404, "Agent not found", "USER_NOT_FOUND");
  const toParty = (r: (typeof res.rows)[number]): Party => {
    if (!r.wallet_id) throw new HttpError(422, `${r.name} has no main wallet`, "WALLET_NOT_FOUND");
    return { id: r.id, name: r.name, uid: r.uid, role: r.role, balance: r.balance ?? "0", walletId: r.wallet_id };
  };
  const uplineRow = res.rows.find((r) => r.id === agentRow.parent_id);
  const validUpline =
    uplineRow &&
    ((agentRow.role === "retailer" && uplineRow.role === "distributor") ||
      (agentRow.role === "distributor" && uplineRow.role === "super_distributor"));
  return { agent: toParty(agentRow), upline: validUpline ? toParty(uplineRow) : null };
}

export async function getMoveContext(tenantId: string, agentUserId: string) {
  const { agent, upline } = await loadParties(agentUserId);
  const settings = await getTenantSettings(tenantId);
  return {
    agent: { id: agent.id, name: agent.name, uid: agent.uid, role: agent.role, balance: agent.balance },
    upline: upline
      ? { id: upline.id, name: upline.name, uid: upline.uid, role: upline.role, balance: upline.balance }
      : null,
    dualApprovalFrom: String(settings.fundApproveDualRupees),
  };
}

async function execute(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  kind: MoveKind,
  agent: Party,
  upline: Party,
  amount: Paise,
  reason: string,
): Promise<string> {
  const rupees = paiseToRupees(amount);
  const moved = await transferBetweenWallets(
    kind === "transfer"
      ? {
          fromWalletId: upline.walletId,
          toWalletId: agent.walletId,
          amount: rupees,
          referenceType: "downline_transfer",
          referenceId: agent.id,
          description: `Admin transfer from ${upline.name}: ${reason}`,
        }
      : {
          fromWalletId: agent.walletId,
          toWalletId: upline.walletId,
          amount: rupees,
          referenceType: "upline_pull",
          referenceId: agent.id,
          description: `Admin reverse to ${upline.name}: ${reason}`,
        },
    tx,
  );
  return moved.groupId;
}

function assertFunds(kind: MoveKind, agent: Party, upline: Party, amount: Paise) {
  const payer = kind === "transfer" ? upline : agent;
  if (rupeesToPaise(payer.balance) < amount) {
    throw new HttpError(
      422,
      `${payer.name}'s wallet has only ₹${payer.balance} — not enough to ${kind === "transfer" ? "transfer" : "reverse"} ₹${paiseToRupees(amount)}`,
      "INSUFFICIENT_BALANCE",
    );
  }
}

export async function requestWalletMove(params: {
  tenantId: string;
  adminId: string;
  kind: MoveKind;
  agentUserId: string;
  amount: string;
  reason: string;
}): Promise<{ id: string; status: "done" | "requested" }> {
  const reason = params.reason.trim();
  if (reason.length < 5) throw new HttpError(422, "Reason must be at least 5 characters", "REASON_REQUIRED");
  let amount: Paise;
  try {
    amount = rupeesToPaise(params.amount);
  } catch {
    throw new HttpError(422, "Enter a valid amount, e.g. 500 or 500.50", "INVALID_AMOUNT");
  }
  if (amount <= 0n) throw new HttpError(422, "Amount must be greater than zero", "INVALID_AMOUNT");

  const { agent, upline } = await loadParties(params.agentUserId);
  if (!upline) {
    throw new HttpError(
      422,
      "This agent has no Super Distributor / Distributor upline wallet. Super Distributors are funded through fund requests.",
      "NO_UPLINE",
    );
  }
  assertFunds(params.kind, agent, upline, amount);

  const settings = await getTenantSettings(params.tenantId);
  const needsChecker = amount >= BigInt(Math.round(settings.fundApproveDualRupees * 100));

  const result = await db.transaction(async (tx) => {
    const groupId = needsChecker ? null : await execute(tx, params.kind, agent, upline, amount, reason);
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO admin_wallet_moves
        (tenant_id, kind, agent_user_id, upline_user_id, amount, reason, status, requested_by,
         decided_by, decided_at, ledger_group_id)
      VALUES (${params.tenantId}, ${params.kind}, ${agent.id}, ${upline.id}, ${amount.toString()}, ${reason},
              ${needsChecker ? "requested" : "done"}, ${params.adminId},
              ${needsChecker ? null : params.adminId}, ${needsChecker ? null : new Date().toISOString()}, ${groupId})
      RETURNING id::text
    `);
    return { id: ins.rows[0]!.id, status: needsChecker ? ("requested" as const) : ("done" as const) };
  });

  await insertAuditLog({
    userId: params.adminId,
    action: `admin.wallet_${params.kind}_${result.status}`,
    entityType: "user",
    entityId: agent.id,
    metadata: { moveId: result.id, amount: paiseToRupees(amount), uplineId: upline.id, reason },
  });
  return result;
}

export async function decideWalletMove(params: {
  tenantId: string;
  adminId: string;
  moveId: string;
  approve: boolean;
  note?: string;
}): Promise<{ status: "done" | "rejected" }> {
  const status = await db.transaction(async (tx) => {
    const res = await tx.execute<{
      kind: MoveKind;
      agent_user_id: string;
      amount: string;
      reason: string;
      status: string;
      requested_by: string;
    }>(sql`
      SELECT kind, agent_user_id::text, amount::text, reason, status, requested_by::text
      FROM admin_wallet_moves
      WHERE id = ${params.moveId} AND tenant_id = ${params.tenantId}
      FOR UPDATE
    `);
    const move = res.rows[0];
    if (!move) throw new HttpError(404, "Wallet move not found", "NOT_FOUND");
    if (move.status !== "requested") throw new HttpError(422, `This move is already ${move.status}`, "ALREADY_DECIDED");
    if (move.requested_by === params.adminId) {
      throw new HttpError(403, "A second admin must approve or reject this — you created it", "MAKER_IS_CHECKER");
    }

    let groupId: string | null = null;
    if (params.approve) {
      const { agent, upline } = await loadParties(move.agent_user_id);
      if (!upline) throw new HttpError(422, "The agent no longer has an upline wallet", "NO_UPLINE");
      const amount = BigInt(move.amount) as Paise;
      assertFunds(move.kind, agent, upline, amount);
      groupId = await execute(tx, move.kind, agent, upline, amount, move.reason);
    }
    const next = params.approve ? "done" : "rejected";
    await tx.execute(sql`
      UPDATE admin_wallet_moves
      SET status = ${next}, decided_by = ${params.adminId}, decided_at = now(),
          decision_note = ${params.note?.trim() || null}, ledger_group_id = ${groupId}
      WHERE id = ${params.moveId}
    `);
    return next;
  });

  await insertAuditLog({
    userId: params.adminId,
    action: `admin.wallet_move_${status}`,
    entityType: "admin_wallet_move",
    entityId: params.moveId,
    metadata: { note: params.note ?? null },
  });
  return { status };
}

export async function listWalletMoves(tenantId: string, status?: string) {
  const res = await db.execute<{
    id: string;
    kind: MoveKind;
    amount: string;
    reason: string;
    status: string;
    created_at: string;
    decided_at: string | null;
    decision_note: string | null;
    agent_name: string;
    agent_uid: string;
    upline_name: string;
    requested_by: string;
    requested_by_name: string | null;
    decided_by_name: string | null;
  }>(sql`
    SELECT m.id::text, m.kind, m.amount::text, m.reason, m.status, m.created_at::text, m.decided_at::text,
           m.decision_note, a.name AS agent_name, a.uid AS agent_uid, p.name AS upline_name,
           m.requested_by::text, r.name AS requested_by_name, d.name AS decided_by_name
    FROM admin_wallet_moves m
    JOIN users a ON a.id = m.agent_user_id
    JOIN users p ON p.id = m.upline_user_id
    LEFT JOIN users r ON r.id = m.requested_by
    LEFT JOIN users d ON d.id = m.decided_by
    WHERE m.tenant_id = ${tenantId} ${status ? sql`AND m.status = ${status}` : sql``}
    ORDER BY m.created_at DESC
    LIMIT 50
  `);
  return res.rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: paiseToRupees(BigInt(r.amount) as Paise),
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    agent: { name: r.agent_name, uid: r.agent_uid },
    uplineName: r.upline_name,
    requestedById: r.requested_by,
    requestedBy: r.requested_by_name,
    decidedBy: r.decided_by_name,
  }));
}
