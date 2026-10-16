import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { paiseToRupees } from "../../core/money";
import { HttpError } from "../../utils/httpError";
import { sendMail, isMailerConfigured } from "../../utils/mailer";
import { sendWhatsAppText } from "../whatsapp/whatsapp.service";
import { getDailyCloseStatus } from "./dailyClose.service";
import { getProviderLedgerStrip } from "../treasury/treasury.service";

export interface DailySummary {
  date: string;
  unmatchedCredits: number;
  pendingFundRequests: number;
  pendingBankEntries: number;
  statementCredits: string;
  statementDebits: string;
  creditedFundRequests: string;
  provider: {
    floatIn: string;
    floatOut: string;
    fees: string;
    walletImpact: string;
    netFloat: string;
    journalCount: number;
  };
  dailyClose: {
    closed: boolean;
    canClose: boolean;
    closedByName: string | null;
  };
  banks: { bankName: string; last4: string; uploaded: boolean }[];
  text: string;
  lines: { label: string; value: string }[];
}

function assertDate(raw: string): string {
  const date = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(422, "date must be YYYY-MM-DD", "INVALID_DATE");
  }
  return date;
}

export async function buildDailySummary(params: {
  tenantId: string;
  date: string;
}): Promise<DailySummary> {
  const date = assertDate(params.date);
  const close = await getDailyCloseStatus({ tenantId: params.tenantId, date });
  const provider = await getProviderLedgerStrip({ tenantId: params.tenantId, from: date, to: date });

  const money = await db.execute<{
    unmatched: string;
    pending_funds: string;
    pending_entries: string;
    stmt_cr: string;
    stmt_dr: string;
    credited: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM bank_statement_lines
        WHERE tenant_id = ${params.tenantId} AND txn_date = ${date}::date
          AND direction = 'CR' AND match_status = 'unmatched')::text AS unmatched,
      (SELECT COUNT(*) FROM fund_requests
        WHERE tenant_id = ${params.tenantId}
          AND (deposit_datetime AT TIME ZONE 'Asia/Kolkata')::date = ${date}::date
          AND status IN ('submitted','pending_match','auto_matched','amount_mismatch','suspect','under_review'))::text AS pending_funds,
      (SELECT COUNT(*) FROM bank_entries
        WHERE tenant_id = ${params.tenantId} AND txn_date = ${date}::date
          AND status = 'requested' AND reversed_at IS NULL)::text AS pending_entries,
      (SELECT COALESCE(SUM(amount), 0) FROM bank_statement_lines
        WHERE tenant_id = ${params.tenantId} AND txn_date = ${date}::date AND direction = 'CR')::text AS stmt_cr,
      (SELECT COALESCE(SUM(amount), 0) FROM bank_statement_lines
        WHERE tenant_id = ${params.tenantId} AND txn_date = ${date}::date AND direction = 'DR')::text AS stmt_dr,
      (SELECT COALESCE(SUM(COALESCE(credited_amount, amount)), 0) FROM fund_requests
        WHERE tenant_id = ${params.tenantId} AND status = 'credited'
          AND (credited_at AT TIME ZONE 'Asia/Kolkata')::date = ${date}::date)::text AS credited
  `);

  const m = money.rows[0] ?? {
    unmatched: "0",
    pending_funds: "0",
    pending_entries: "0",
    stmt_cr: "0",
    stmt_dr: "0",
    credited: "0",
  };

  const summary: DailySummary = {
    date,
    unmatchedCredits: Number(m.unmatched),
    pendingFundRequests: Number(m.pending_funds),
    pendingBankEntries: Number(m.pending_entries),
    statementCredits: paiseToRupees(BigInt(m.stmt_cr)),
    statementDebits: paiseToRupees(BigInt(m.stmt_dr)),
    creditedFundRequests: paiseToRupees(BigInt(m.credited)),
    provider: {
      floatIn: provider.floatIn,
      floatOut: provider.floatOut,
      fees: provider.fees,
      walletImpact: provider.walletImpact,
      netFloat: provider.netFloat,
      journalCount: provider.journalCount,
    },
    dailyClose: {
      closed: close.closed,
      canClose: close.canClose,
      closedByName: close.closedByName,
    },
    banks: close.banks.map((b) => ({
      bankName: b.bankName,
      last4: b.last4,
      uploaded: b.uploaded,
    })),
    text: "",
    lines: [],
  };

  const lines: { label: string; value: string }[] = [
    { label: "Date", value: date },
    { label: "Statement credits", value: `₹${summary.statementCredits}` },
    { label: "Statement debits", value: `₹${summary.statementDebits}` },
    { label: "Unmatched credits", value: String(summary.unmatchedCredits) },
    { label: "Pending fund requests", value: String(summary.pendingFundRequests) },
    { label: "Pending bank entries", value: String(summary.pendingBankEntries) },
    { label: "Agent credited", value: `₹${summary.creditedFundRequests}` },
    { label: "API float in", value: `₹${summary.provider.floatIn}` },
    { label: "API float out", value: `₹${summary.provider.floatOut}` },
    { label: "API fees", value: `₹${summary.provider.fees}` },
    { label: "Wallet impact", value: `₹${summary.provider.walletImpact}` },
    { label: "Daily close", value: summary.dailyClose.closed ? "Closed" : summary.dailyClose.canClose ? "Ready to close" : "Open" },
  ];
  for (const b of summary.banks) {
    lines.push({
      label: `${b.bankName} ••${b.last4}`,
      value: b.uploaded ? "Statement uploaded" : "Statement missing",
    });
  }

  const text = [
    `AsanPay daily treasury summary — ${date}`,
    "",
    ...lines.map((l) => `${l.label}: ${l.value}`),
    "",
    "Admin → Treasury → Bank & deposits → Daily close",
  ].join("\n");

  summary.lines = lines;
  summary.text = text;
  return summary;
}

export async function sendDailySummary(params: {
  tenantId: string;
  date: string;
  email?: string | null;
  whatsapp?: string | null;
}): Promise<{ emailSent: boolean; whatsappSent: boolean; summary: DailySummary }> {
  const summary = await buildDailySummary({ tenantId: params.tenantId, date: params.date });
  let emailSent = false;
  let whatsappSent = false;

  const email = params.email?.trim();
  if (email) {
    if (!isMailerConfigured()) {
      throw new HttpError(503, "Email is not configured on the backend (SMTP).", "MAILER_NOT_CONFIGURED");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(422, "Enter a valid email address", "INVALID_EMAIL");
    }
    emailSent = await sendMail({
      to: email,
      subject: `AsanPay daily treasury summary — ${summary.date}`,
      text: summary.text,
      html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap">${summary.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>`,
    });
    if (!emailSent) {
      throw new HttpError(502, "Could not send the daily summary email", "EMAIL_SEND_FAILED");
    }
  }

  const mobile = params.whatsapp?.trim().replace(/\D/g, "");
  if (mobile) {
    if (mobile.length !== 10) {
      throw new HttpError(422, "Enter a valid 10-digit WhatsApp mobile", "INVALID_MOBILE");
    }
    await sendWhatsAppText(mobile, summary.text.slice(0, 3500));
    whatsappSent = true;
  }

  if (!email && !mobile) {
    throw new HttpError(422, "Enter an email and/or a 10-digit WhatsApp mobile", "NO_CHANNEL");
  }

  return { emailSent, whatsappSent, summary };
}
