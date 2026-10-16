import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db/postgres";
import { paiseToRupees, rupeesToPaise, type Paise } from "../../core/money";
import { normaliseUtr } from "./banking.service";

export type SearchHitKind = "statement" | "fund_request" | "bank_entry" | "agent";

export interface SearchHit {
  id: string;
  kind: SearchHitKind;
  title: string;
  subtitle: string | null;
  amount: string | null;
  status: string | null;
  href: string;
}

function looksLikeAmount(q: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(q) && Number(q) > 0;
}

/**
 * Global treasury search: UTR, amount, agent name, mobile.
 * Hits deep-link into Bank & deposits tabs (or agent profile).
 */
export async function searchTreasury(params: {
  tenantId: string;
  q: string;
  limit?: number;
}): Promise<{ q: string; hits: SearchHit[] }> {
  const raw = params.q.trim();
  if (raw.length < 2) return { q: raw, hits: [] };
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 50);
  const per = Math.max(8, Math.ceil(limit / 3));
  const hits: SearchHit[] = [];

  const digits = raw.replace(/\D/g, "");
  const utrNorm = normaliseUtr(raw);
  let amountPaise: Paise | null = null;
  if (looksLikeAmount(raw.replace(/,/g, ""))) {
    try {
      amountPaise = rupeesToPaise(raw.replace(/,/g, ""));
    } catch {
      amountPaise = null;
    }
  }
  const mobile = digits.length === 10 ? digits : null;
  const safeLike = `%${raw.replace(/[%_\\]/g, "")}%`;

  const stmtConds: SQL[] = [];
  if (utrNorm) {
    stmtConds.push(sql`(l.utr_norm = ${utrNorm} OR l.utr_norm LIKE ${utrNorm + "%"})`);
  }
  if (amountPaise !== null) {
    stmtConds.push(sql`l.amount = ${String(amountPaise)}::bigint`);
  }
  if (!utrNorm && amountPaise === null) {
    stmtConds.push(sql`(l.utr ILIKE ${safeLike} OR COALESCE(l.narration, '') ILIKE ${safeLike})`);
  }
  if (stmtConds.length) {
    try {
      const where = sql.join(stmtConds, sql` OR `);
      const lines = await db.execute<{
        id: string;
        amount: string;
        utr: string | null;
        direction: string;
        match_status: string;
        bank_name: string;
        last4: string;
        bank_account_id: string;
        txn_date: string;
        narration: string | null;
      }>(sql`
        SELECT l.id::text, l.amount::text, l.utr, trim(l.direction)::text AS direction,
               l.match_status::text, ba.bank_name, ba.account_number_last4 AS last4,
               ba.id::text AS bank_account_id, l.txn_date::text, l.narration
        FROM bank_statement_lines l
        JOIN bank_accounts ba ON ba.id = l.bank_account_id
        WHERE l.tenant_id = ${params.tenantId} AND (${where})
        ORDER BY l.txn_date DESC, l.id DESC
        LIMIT ${per}
      `);
      for (const r of lines.rows) {
        hits.push({
          id: `stmt:${r.id}`,
          kind: "statement",
          title: `${r.direction === "DR" ? "Debit" : "Credit"} · ${r.bank_name} ••${r.last4}`,
          subtitle: [r.utr ? `UTR ${r.utr}` : null, r.narration?.slice(0, 80) || null, r.txn_date]
            .filter(Boolean)
            .join(" · "),
          amount: paiseToRupees(BigInt(r.amount) as Paise),
          status: r.match_status.replace(/_/g, " "),
          href: `/treasury/bank?tab=reconciliation&bank=${r.bank_account_id}&from=${r.txn_date}&to=${r.txn_date}&line=${r.id}`,
        });
      }
    } catch {
      /* ignore */
    }
  }

  const frConds: SQL[] = [];
  if (utrNorm) {
    frConds.push(sql`(fr.reference_norm = ${utrNorm} OR fr.reference_norm LIKE ${utrNorm + "%"})`);
  }
  if (amountPaise !== null) {
    frConds.push(sql`fr.amount = ${String(amountPaise)}::bigint`);
  }
  if (mobile) {
    frConds.push(sql`u.mobile = ${mobile}`);
  }
  frConds.push(
    sql`(u.name ILIKE ${safeLike} OR u.uid ILIKE ${safeLike} OR COALESCE(fr.reference, '') ILIKE ${safeLike})`,
  );
  try {
    const where = sql.join(frConds, sql` OR `);
    const frs = await db.execute<{
      id: string;
      amount: string;
      status: string;
      reference: string | null;
      agent_name: string;
      agent_mobile: string;
      agent_uid: string;
      deposit_date: string;
    }>(sql`
      SELECT fr.id::text, fr.amount::text, fr.status::text, fr.reference,
             u.name AS agent_name, u.mobile AS agent_mobile, u.uid AS agent_uid,
             (fr.deposit_datetime AT TIME ZONE 'Asia/Kolkata')::date::text AS deposit_date
      FROM fund_requests fr
      JOIN users u ON u.id = fr.requester_user_id
      WHERE fr.tenant_id = ${params.tenantId} AND (${where})
      ORDER BY fr.created_at DESC
      LIMIT ${per}
    `);
    for (const r of frs.rows) {
      hits.push({
        id: `fr:${r.id}`,
        kind: "fund_request",
        title: `Fund request · ${r.agent_name}`,
        subtitle: [r.agent_uid, r.agent_mobile, r.reference ? `UTR ${r.reference}` : null, r.deposit_date]
          .filter(Boolean)
          .join(" · "),
        amount: paiseToRupees(BigInt(r.amount) as Paise),
        status: r.status.replace(/_/g, " "),
        href: `/treasury/bank?tab=fund-requests`,
      });
    }
  } catch {
    /* ignore */
  }

  const beConds: SQL[] = [];
  if (utrNorm) {
    beConds.push(
      sql`(regexp_replace(upper(COALESCE(be.utr, '')), '[^A-Z0-9]', '', 'g') = ${utrNorm}
           OR regexp_replace(upper(COALESCE(be.utr, '')), '[^A-Z0-9]', '', 'g') LIKE ${utrNorm + "%"})`,
    );
  }
  if (amountPaise !== null) {
    beConds.push(sql`be.amount = ${String(amountPaise)}::bigint`);
  }
  beConds.push(
    sql`(COALESCE(be.party_name, '') ILIKE ${safeLike}
         OR COALESCE(be.utr, '') ILIKE ${safeLike}
         OR COALESCE(be.narration, '') ILIKE ${safeLike})`,
  );
  try {
    const where = sql.join(beConds, sql` OR `);
    const bes = await db.execute<{
      id: string;
      amount: string;
      status: string;
      category: string;
      utr: string | null;
      party_name: string | null;
      txn_date: string;
      bank_name: string | null;
      last4: string | null;
    }>(sql`
      SELECT be.id::text, be.amount::text, be.status::text, be.category, be.utr, be.party_name,
             be.txn_date::text, ba.bank_name, ba.account_number_last4 AS last4
      FROM bank_entries be
      LEFT JOIN bank_accounts ba ON ba.id = be.bank_account_id
      WHERE be.tenant_id = ${params.tenantId}
        AND be.reversed_at IS NULL
        AND (${where})
      ORDER BY be.txn_date DESC, be.id DESC
      LIMIT ${per}
    `);
    for (const r of bes.rows) {
      hits.push({
        id: `be:${r.id}`,
        kind: "bank_entry",
        title: `Bank entry · ${r.category.replace(/_/g, " ")}`,
        subtitle: [
          r.bank_name ? `${r.bank_name} ••${r.last4}` : null,
          r.party_name,
          r.utr ? `UTR ${r.utr}` : null,
          r.txn_date,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: paiseToRupees(BigInt(r.amount) as Paise),
        status: r.status.replace(/_/g, " "),
        href: `/treasury/bank?tab=bank-entries`,
      });
    }
  } catch {
    /* ignore */
  }

  // Agents when query looks like a person / mobile
  if (mobile || (!amountPaise && raw.length >= 2)) {
    try {
      const agentConds: SQL[] = [
        sql`name ILIKE ${safeLike}`,
        sql`uid ILIKE ${safeLike}`,
      ];
      if (mobile) agentConds.push(sql`mobile = ${mobile}`);
      else if (digits.length >= 4) agentConds.push(sql`mobile LIKE ${"%" + digits + "%"}`);
      const where = sql.join(agentConds, sql` OR `);
      const agents = await db.execute<{
        id: string;
        name: string;
        mobile: string;
        uid: string;
        role: string;
      }>(sql`
        SELECT id::text, name, mobile, uid, role::text
        FROM users
        WHERE tenant_id = ${params.tenantId}
          AND role IN ('super_distributor', 'distributor', 'retailer')
          AND (${where})
        ORDER BY name ASC
        LIMIT ${Math.min(per, 10)}
      `);
      for (const r of agents.rows) {
        hits.push({
          id: `agent:${r.id}`,
          kind: "agent",
          title: r.name,
          subtitle: `${r.role.replace(/_/g, " ")} · ${r.uid} · ${r.mobile}`,
          amount: null,
          status: null,
          href: `/users/${r.id}`,
        });
      }
    } catch {
      /* ignore */
    }
  }

  hits.sort((a, b) => {
    const score = (h: SearchHit) => {
      let s = 0;
      const blob = `${h.title} ${h.subtitle ?? ""}`.toUpperCase();
      if (utrNorm && blob.includes(utrNorm)) s += 3;
      if (amountPaise && h.amount === paiseToRupees(amountPaise)) s += 2;
      if (h.kind === "fund_request") s += 1;
      return s;
    };
    return score(b) - score(a);
  });

  return { q: raw, hits: hits.slice(0, limit) };
}
