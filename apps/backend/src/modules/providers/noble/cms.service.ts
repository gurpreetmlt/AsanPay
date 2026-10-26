import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../../db/postgres";
import { cmsTransactions, users } from "../../../db/postgres/schema";
import { HttpError } from "../../../utils/httpError";
import { isNobleConfigured } from "../../../config/env";
import { firstResponseRow, nobleOk, nobleTxnId } from "./aepsOps";
import { noblePost } from "./client";

/** Providers shown as cards on the Cash Management page. Add one entry per new CMS provider. */
export const CMS_PROVIDERS = [
  {
    code: "airtel",
    name: "Airtel CMS",
    description: "Securely collect loan EMI and bill payments in cash",
    accent: "#E40000",
  },
] as const;

export type CmsProviderCode = (typeof CMS_PROVIDERS)[number]["code"];
export type CmsStatus = "initiated" | "pending" | "success" | "failed";

export async function nobleCmsStart(input: { merchantId: string; transactionId?: string }) {
  if (!isNobleConfigured()) {
    throw new HttpError(
      503,
      "AEPS provider is not configured on the server. Contact support.",
      "NOBLE_NOT_CONFIGURED",
    );
  }
  const merchantId = input.merchantId.replace(/\D/g, "").slice(0, 10);
  if (!/^\d{1,10}$/.test(merchantId)) {
    throw new HttpError(400, "Enter a valid merchant id (up to 10 digits)", "NOBLE_CMS_MERCHANT_INVALID");
  }
  const transactionId = (input.transactionId || nobleTxnId("NCMS")).slice(0, 25);
  if (transactionId.length < 12) {
    throw new HttpError(400, "CMS transaction id must be 12–25 characters", "NOBLE_CMS_TXN_ID_INVALID");
  }

  const { httpStatus, json } = await noblePost("cms", "/api/v1.0/airtel_cms/start", {
    merchantId,
    transactionId,
  });
  if (!nobleOk(json, httpStatus)) {
    throw new HttpError(
      502,
      (typeof json.description === "string" && json.description) || "CMS start failed",
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_CMS_START_FAILED",
    );
  }
  const row = firstResponseRow(json);
  const redirectionUrl = String(row.redirectionUrl ?? "");
  if (!redirectionUrl) {
    throw new HttpError(502, "CMS start succeeded but redirection URL is missing", "NOBLE_CMS_NO_URL");
  }
  return { transactionId, merchantId, redirectionUrl, raw: row };
}

export async function nobleCmsStatus(transactionId: string) {
  if (!isNobleConfigured()) {
    throw new HttpError(
      503,
      "AEPS provider is not configured on the server. Contact support.",
      "NOBLE_NOT_CONFIGURED",
    );
  }
  const id = transactionId.trim();
  if (id.length < 12 || id.length > 25) {
    throw new HttpError(400, "CMS transaction id must be 12–25 characters", "NOBLE_CMS_TXN_ID_INVALID");
  }
  const { httpStatus, json } = await noblePost("cms", "/api/v1.0/airtel_cms/status_check", {
    transactionId: id,
  });
  if (!nobleOk(json, httpStatus) && json.status !== 1) {
    throw new HttpError(
      502,
      (typeof json.description === "string" && json.description) || "CMS status failed",
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_CMS_STATUS_FAILED",
    );
  }
  const row = firstResponseRow(json);
  return {
    transactionId: id,
    tranStatus: String(row.tranStatus ?? ""),
    amount: String(row.amount ?? ""),
    utr: String(row.utr ?? ""),
    billerName: String(row.billerName ?? ""),
    raw: row,
  };
}

function mapTranStatus(tranStatus: string): CmsStatus {
  const s = tranStatus.trim().toLowerCase();
  if (!s) return "pending";
  if (s.includes("success") || s === "completed") return "success";
  if (s.includes("fail") || s.includes("reject") || s.includes("cancel")) return "failed";
  return "pending";
}

function publicRow(r: typeof cmsTransactions.$inferSelect) {
  const provider = CMS_PROVIDERS.find((p) => p.code === r.provider);
  return {
    id: r.id,
    provider: r.provider,
    providerName: provider?.name ?? r.provider,
    transactionId: r.transactionId,
    status: r.status as CmsStatus,
    providerStatus: r.providerStatus,
    amount: r.amount,
    utr: r.utr,
    billerName: r.billerName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type CmsTxnRow = ReturnType<typeof publicRow>;

/** Starts a collection for the retailer; merchant id is the retailer's registered mobile. */
export async function startCashCollection(userId: string, provider: CmsProviderCode) {
  if (!CMS_PROVIDERS.some((p) => p.code === provider)) {
    throw new HttpError(400, "This cash collection provider is not available", "CMS_PROVIDER_UNKNOWN");
  }
  const [user] = await db.select({ mobile: users.mobile }).from(users).where(eq(users.id, userId)).limit(1);
  const merchantId = (user?.mobile ?? "").replace(/\D/g, "").slice(-10);
  if (merchantId.length !== 10) {
    throw new HttpError(
      400,
      "Your account has no valid 10-digit mobile. Contact support to update it.",
      "CMS_MERCHANT_MOBILE_MISSING",
    );
  }

  const started = await nobleCmsStart({ merchantId });
  const [row] = await db
    .insert(cmsTransactions)
    .values({
      userId,
      provider,
      transactionId: started.transactionId,
      merchantId: started.merchantId,
      status: "initiated",
      raw: started.raw,
    })
    .returning();
  return { ...publicRow(row!), redirectionUrl: started.redirectionUrl };
}

export async function checkCashCollection(userId: string, transactionId: string) {
  const [existing] = await db
    .select()
    .from(cmsTransactions)
    .where(and(eq(cmsTransactions.userId, userId), eq(cmsTransactions.transactionId, transactionId.trim())))
    .limit(1);
  if (!existing) {
    throw new HttpError(404, "Cash collection not found for this account", "CMS_TXN_NOT_FOUND");
  }
  if (existing.status === "success" || existing.status === "failed") return publicRow(existing);

  const st = await nobleCmsStatus(existing.transactionId);
  const amount = /^\d+(\.\d+)?$/.test(st.amount) ? st.amount : null;
  const [updated] = await db
    .update(cmsTransactions)
    .set({
      status: mapTranStatus(st.tranStatus),
      providerStatus: st.tranStatus.slice(0, 40) || null,
      amount: amount ?? existing.amount,
      utr: st.utr.slice(0, 40) || existing.utr,
      billerName: st.billerName.slice(0, 120) || existing.billerName,
      raw: st.raw,
      updatedAt: new Date(),
    })
    .where(eq(cmsTransactions.id, existing.id))
    .returning();
  return publicRow(updated!);
}

/** from / to are IST calendar days (YYYY-MM-DD), inclusive. */
export async function listCashCollections(userId: string, from: string, to: string) {
  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(`${to}T23:59:59.999+05:30`);
  const rows = await db
    .select()
    .from(cmsTransactions)
    .where(
      and(
        eq(cmsTransactions.userId, userId),
        gte(cmsTransactions.createdAt, start),
        lte(cmsTransactions.createdAt, end),
      ),
    )
    .orderBy(desc(cmsTransactions.createdAt))
    .limit(500);
  return rows.map(publicRow);
}
