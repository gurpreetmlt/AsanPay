import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { paiseToRupees } from "../../core/money";

export type ActivityChannel = "bank" | "agent" | "api";

export interface ActivityItem {
  id: string;
  channel: ActivityChannel;
  kind: string;
  title: string;
  subtitle: string | null;
  amount: string | null;
  direction: "CR" | "DR" | null;
  status: string | null;
  occurredAt: string;
  href: string | null;
}

const API_TXN_TYPES = [
  "DMT",
  "BBPS",
  "RECHARGE",
  "AEPS_DEPOSIT",
  "AEPS_WITHDRAWAL",
  "MICRO_ATM",
  "AADHAAR_PAY",
  "FLOAT_TRANSFER_INIT",
  "FLOAT_TRANSFER_CONFIRM",
] as const;

function labelTxn(txnType: string): string {
  return txnType
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function fundStatusLabel(status: string): string {
  const map: Record<string, string> = {
    submitted: "Submitted",
    pending_match: "Pending match",
    auto_matched: "Auto matched",
    amount_mismatch: "Amount differs",
    suspect: "Needs review",
    under_review: "Under review",
    credited: "Credited",
    rejected: "Rejected",
    cancelled: "Cancelled",
    voided: "Deleted",
  };
  return map[status] ?? status;
}

/**
 * Recent money movement across company bank, agent deposits, and API/provider rails.
 * One feed so admin can scan without jumping tabs.
 */
export async function listTreasuryActivity(params: {
  tenantId: string;
  channel?: ActivityChannel | "all";
  limit?: number;
}): Promise<ActivityItem[]> {
  const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
  const channel = params.channel ?? "all";
  const wantBank = channel === "all" || channel === "bank";
  const wantAgent = channel === "all" || channel === "agent";
  const wantApi = channel === "all" || channel === "api";

  const items: ActivityItem[] = [];

  if (wantBank) {
    try {
      const lines = await db.execute<{
        id: string;
        direction: string;
        amount: string;
        utr: string | null;
        narration: string | null;
        match_status: string;
        bank_name: string;
        last4: string;
        bank_account_id: string;
        txn_date: string;
        imported_at: string;
      }>(sql`
        SELECT l.id::text AS id, trim(l.direction)::text AS direction, l.amount::text AS amount, l.utr, l.narration,
               l.match_status::text AS match_status, ba.bank_name, ba.account_number_last4 AS last4,
               ba.id::text AS bank_account_id, l.txn_date::text AS txn_date, l.imported_at::text AS imported_at
        FROM bank_statement_lines l
        JOIN bank_accounts ba ON ba.id = l.bank_account_id
        WHERE l.tenant_id = ${params.tenantId}
        ORDER BY l.imported_at DESC, l.id DESC
        LIMIT ${limit}
      `);
      for (const r of lines.rows) {
        const dir = r.direction === "DR" ? "DR" : "CR";
        items.push({
          id: `stmt:${r.id}`,
          channel: "bank",
          kind: "statement_line",
          title: `${r.bank_name} ••${r.last4} · ${dir === "CR" ? "Credit" : "Debit"}`,
          subtitle: [r.utr ? `UTR ${r.utr}` : null, r.narration].filter(Boolean).join(" · ") || null,
          amount: paiseToRupees(BigInt(r.amount)),
          direction: dir,
          status: r.match_status === "suspense" ? "needs_review" : r.match_status,
          occurredAt: r.imported_at,
          href: `/treasury/bank?tab=reconciliation&bank=${r.bank_account_id}&from=${r.txn_date}&to=${r.txn_date}&line=${r.id}`,
        });
      }
    } catch (err) {
      console.error("[banking/activity] statement lines failed", err);
    }

    try {
      const entries = await db.execute<{
        id: string;
        category: string;
        direction: string;
        amount: string;
        utr: string | null;
        party_name: string | null;
        status: string;
        bank_name: string | null;
        last4: string | null;
        txn_date: string;
        requested_at: string;
      }>(sql`
        SELECT be.id::text AS id, be.category, be.direction, be.amount::text AS amount, be.utr,
               be.party_name, be.status::text AS status, ba.bank_name, ba.account_number_last4 AS last4,
               be.txn_date::text AS txn_date, be.requested_at::text AS requested_at
        FROM bank_entries be
        LEFT JOIN bank_accounts ba ON ba.id = be.bank_account_id
        WHERE be.tenant_id = ${params.tenantId} AND be.reversed_at IS NULL
        ORDER BY be.requested_at DESC, be.id DESC
        LIMIT ${limit}
      `);
      for (const r of entries.rows) {
        const bank = r.bank_name && r.last4 ? `${r.bank_name} ••${r.last4}` : "Bank entry";
        items.push({
          id: `be:${r.id}`,
          channel: "bank",
          kind: "bank_entry",
          title: `${bank} · ${r.category.replace(/_/g, " ")}`,
          subtitle: [r.party_name, r.utr ? `UTR ${r.utr}` : null].filter(Boolean).join(" · ") || null,
          amount: paiseToRupees(BigInt(r.amount)),
          direction: r.direction === "credit" ? "CR" : r.direction === "debit" ? "DR" : null,
          status: r.status,
          occurredAt: r.requested_at,
          href: `/treasury/bank?tab=bank-entries`,
        });
      }
    } catch (err) {
      console.error("[banking/activity] bank entries failed", err);
    }
  }

  if (wantAgent) {
    try {
      const frs = await db.execute<{
        id: string;
        amount: string;
        credited_amount: string | null;
        status: string;
        reference_number: string | null;
        agent_name: string;
        agent_mobile: string;
        bank_name: string;
        last4: string;
        submitted_at: string;
      }>(sql`
        SELECT fr.id::text AS id, fr.amount::text AS amount, fr.credited_amount::text AS credited_amount,
               fr.status::text AS status, fr.reference_number, u.name AS agent_name, u.mobile AS agent_mobile,
               ba.bank_name, ba.account_number_last4 AS last4, fr.submitted_at::text AS submitted_at
        FROM fund_requests fr
        JOIN users u ON u.id = fr.requester_user_id
        JOIN bank_accounts ba ON ba.id = fr.bank_account_id
        WHERE fr.tenant_id = ${params.tenantId}
        ORDER BY fr.submitted_at DESC, fr.id DESC
        LIMIT ${limit}
      `);
      for (const r of frs.rows) {
        const amt = r.credited_amount ?? r.amount;
        items.push({
          id: `fr:${r.id}`,
          channel: "agent",
          kind: "fund_request",
          title: `${r.agent_name} · deposit to ${r.bank_name} ••${r.last4}`,
          subtitle: [r.agent_mobile, r.reference_number ? `Ref ${r.reference_number}` : null]
            .filter(Boolean)
            .join(" · "),
          amount: paiseToRupees(BigInt(amt)),
          direction: "CR",
          status: fundStatusLabel(r.status),
          occurredAt: r.submitted_at,
          href: `/treasury/bank?tab=fund-requests`,
        });
      }
    } catch (err) {
      console.error("[banking/activity] fund requests failed", err);
    }
  }

  if (wantApi) {
    try {
      const journals = await db.execute<{
        id: string;
        txn_type: string;
        reference_id: string | null;
        reason: string | null;
        created_at: string;
        amount: string | null;
        provider_name: string | null;
        float_code: string | null;
      }>(sql`
        SELECT j.id::text AS id, j.txn_type, j.reference_id, j.reason, j.created_at::text AS created_at,
               float_leg.amount AS amount,
               float_leg.provider_name,
               float_leg.float_code
        FROM journals j
        LEFT JOIN LATERAL (
          SELECT le.amount::text AS amount,
                 a.code AS float_code,
                 (
                   SELECT p.name
                   FROM providers p
                   WHERE ('TREASURY_FLOAT_' || upper(regexp_replace(p.code, '[^A-Za-z0-9]+', '_', 'g'))) = a.code
                   LIMIT 1
                 ) AS provider_name
          FROM ledger_entries le
          JOIN accounts a ON a.id = le.account_id
          WHERE le.journal_id = j.id AND a.account_type = 'float'
          ORDER BY le.id
          LIMIT 1
        ) float_leg ON true
        WHERE j.tenant_id = ${params.tenantId}
          AND j.txn_type IN (
            'DMT','BBPS','RECHARGE','AEPS_DEPOSIT','AEPS_WITHDRAWAL',
            'MICRO_ATM','AADHAAR_PAY','FLOAT_TRANSFER_INIT','FLOAT_TRANSFER_CONFIRM'
          )
        ORDER BY j.created_at DESC, j.id DESC
        LIMIT ${limit}
      `);
      for (const r of journals.rows) {
        const isFloatIn = r.txn_type === "FLOAT_TRANSFER_CONFIRM" || r.txn_type === "AEPS_WITHDRAWAL";
        const provider =
          r.provider_name?.trim() ||
          (r.float_code?.startsWith("TREASURY_FLOAT_")
            ? r.float_code.replace(/^TREASURY_FLOAT_/, "").replace(/_/g, " ")
            : null);
        const service = labelTxn(r.txn_type);
        items.push({
          id: `j:${r.id}`,
          channel: "api",
          kind: "provider_journal",
          title: provider ? `${provider} · ${service}` : service,
          subtitle: [r.reference_id, r.reason].filter(Boolean).join(" · ") || null,
          amount: r.amount != null ? paiseToRupees(BigInt(r.amount)) : null,
          direction: isFloatIn ? "CR" : "DR",
          status: API_TXN_TYPES.includes(r.txn_type as (typeof API_TXN_TYPES)[number]) ? "posted" : r.txn_type,
          occurredAt: r.created_at,
          href: `/float`,
        });
      }
    } catch (err) {
      console.error("[banking/activity] provider journals failed", err);
    }
  }

  items.sort((a, b) => {
    const ta = Date.parse(a.occurredAt);
    const tb = Date.parse(b.occurredAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  return items.slice(0, limit);
}
