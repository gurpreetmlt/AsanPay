import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { KYC_STATUSES, TRANSACTION_STATUSES, USER_ROLES } from "@asanpay/shared-types";
import { paiseToRupees } from "../../core/money";
import { fetchProviderLiveBalance } from "../treasury/providerLiveBalance";
import {
  getAdminStats,
  getAdminAlerts,
  listAdminUsers,
  getAdminUserDetail,
  getAdminKycDocument,
  getAdminUserCommissions,
  upsertAdminUserCommissions,
  setUserActive,
  deleteAdminUser,
  reassignUserParent,
  reactivateAeps,
  setRestrictionLevel,
  listKycQueue,
  decideKyc,
  resetKyc,
  resendLoginEmail,
  listAdminTransactions,
  listCatalogAdmin,
  updateServiceSiteControl,
  listProvidersAdmin,
  updateProviderForCategory,
  updateProviderServiceRow,
  disableAllProvidersForCategory,
  getAepsDmtRailInfo,
  getNetworkTreeAdmin,
  listAuditLogsAdmin,
  getUserAncestorsAdmin,
  listReconciliationMismatches,
  listRiskAlerts,
  listRiskSignals,
  markRiskSignalReviewed,
} from "./admin.service";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get("/stats", async (_req, res) => {
  sendSuccess(res, await getAdminStats());
});

/** Live wallet balance held with the AEPS / DMT / recharge provider. */
adminRouter.get("/provider-wallet", async (_req, res) => {
  const live = await fetchProviderLiveBalance("noble");
  sendSuccess(res, {
    status: live.status,
    balance: live.status === "ok" ? paiseToRupees(live.balance) : null,
    message: live.status === "error" ? live.message : null,
    checkedAt: new Date().toISOString(),
  });
});

adminRouter.get("/alerts", async (_req, res) => {
  sendSuccess(res, await getAdminAlerts());
});

adminRouter.get("/dashboard", async (_req, res) => {
  const { getDashboardSummary } = await import("./dashboard.service");
  sendSuccess(res, await getDashboardSummary());
});

adminRouter.get("/users", async (req, res) => {
  const role = typeof req.query.role === "string" && (USER_ROLES as readonly string[]).includes(req.query.role)
    ? (req.query.role as (typeof USER_ROLES)[number])
    : undefined;
  const kycStatus =
    typeof req.query.kycStatus === "string" && (KYC_STATUSES as readonly string[]).includes(req.query.kycStatus)
      ? (req.query.kycStatus as (typeof KYC_STATUSES)[number])
      : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const users = await listAdminUsers({ role, kycStatus, q, limit, offset });
  sendSuccess(res, users);
});

adminRouter.get("/users/:id", async (req, res) => {
  const detail = await getAdminUserDetail(req.params.id);
  sendSuccess(res, detail);
});

adminRouter.get("/users/:id/kyc-documents/:docKey", async (req, res) => {
  const doc = await getAdminKycDocument(req.params.id, req.params.docKey);
  res.setHeader("Content-Type", doc.contentType);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(doc.buffer);
});

adminRouter.get("/users/:id/ancestors", async (req, res) => {
  sendSuccess(res, await getUserAncestorsAdmin(req.params.id));
});

adminRouter.get("/users/:id/commission-slabs", async (req, res) => {
  const { listAgentSlabRates } = await import("../commission/agentSlabRates.service");
  sendSuccess(res, await listAgentSlabRates(req.params.id));
});

adminRouter.post("/users/:id/commission-slabs", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { setAgentSlabRate } = await import("../commission/agentSlabRates.service");
  const body = z
    .object({
      serviceId: z.string().uuid(),
      minAmount: z.string().max(20).nullable().optional(),
      maxAmount: z.string().max(20).nullable().optional(),
      mode: z.enum(["share", "flat"]),
      value: z.string().min(1).max(20),
      expiresAt: z.string().max(40).nullable().optional(),
      reason: z.string().max(500).nullable().optional(),
    })
    .parse(req.body);
  sendSuccess(res, await setAgentSlabRate(req.auth.sub, req.params.id, body), "Custom commission saved");
});

adminRouter.delete("/users/:id/commission-slabs/:rateId", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { deleteAgentSlabRate } = await import("../commission/agentSlabRates.service");
  const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
  sendSuccess(res, await deleteAgentSlabRate(req.auth.sub, req.params.id, req.params.rateId, reason), "Custom commission removed");
});

adminRouter.get("/users/:id/commissions", async (req, res) => {
  sendSuccess(res, await getAdminUserCommissions(req.params.id));
});

adminRouter.put("/users/:id/commissions", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      rates: z
        .array(
          z.object({
            serviceId: z.string().uuid(),
            ruleType: z.enum(["flat", "percentage"]),
            value: z.string().max(20).optional().default(""),
            isActive: z.boolean().optional(),
            clear: z.boolean().optional(),
            expiresAt: z.string().max(40).nullable().optional(),
            reason: z.string().max(300).optional(),
          }),
        )
        .max(200),
    })
    .parse(req.body);
  const result = await upsertAdminUserCommissions(req.auth.sub, req.params.id, body.rates);
  sendSuccess(res, result, "Commission rates saved");
});

adminRouter.get("/users/:id/fund-request-context", async (req, res) => {
  const userId = String(req.params.id);
  if (!z.string().uuid().safeParse(userId).success) {
    throw new HttpError(422, "Agent id is invalid", "INVALID_ID");
  }
  const { getFundRequestPermissionContext } = await import("./admin.service");
  sendSuccess(res, await getFundRequestPermissionContext(userId));
});

adminRouter.patch("/users/:id/fund-requests", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const parsed = z
    .object({ enabled: z.boolean(), confirmUid: z.string().trim().max(40).optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(422, "Send enabled: true or false", "VALIDATION_ERROR");
  }
  const userId = String(req.params.id);
  if (!z.string().uuid().safeParse(userId).success) {
    throw new HttpError(422, "Agent id is invalid", "INVALID_ID");
  }
  const { setFundRequestEnabled } = await import("./admin.service");
  const result = await setFundRequestEnabled(req.auth.sub, userId, parsed.data.enabled, parsed.data.confirmUid);
  sendSuccess(res, result, parsed.data.enabled ? "Fund requests enabled" : "Fund requests disabled");
});

adminRouter.patch("/users/:id/active", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z.object({ isActive: z.boolean() }).parse(req.body);
  const result = await setUserActive(req.auth.sub, req.params.id, body.isActive);
  sendSuccess(res, result, body.isActive ? "User activated" : "User deactivated");
});

adminRouter.delete("/users/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const result = await deleteAdminUser(req.auth.sub, req.params.id);
  sendSuccess(res, result, "User deleted");
});

adminRouter.post("/users/:id/reassign", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      newParentId: z.string().uuid().optional(),
      newParentUid: z.string().min(4).max(20).optional(),
    })
    .refine((v) => Boolean(v.newParentId || v.newParentUid), {
      message: "newParentId or newParentUid is required",
    })
    .parse(req.body);

  const result = await reassignUserParent(req.auth.sub, req.params.id, body);
  sendSuccess(res, result, "Parent reassigned");
});

// The way out of an AePS block or dormancy. Without this the flags were set-only and the
// merchant stayed locked forever — see reactivateAeps().
adminRouter.post("/users/:id/aeps/reactivate", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z.object({ reason: z.string().trim().min(8).max(500) }).parse(req.body);
  const result = await reactivateAeps(req.auth.sub, req.params.id, body.reason);
  sendSuccess(res, result, "AePS reactivated");
});

// Graded restriction. Prefer this over deactivating the account: soft and hard leave login,
// balance visibility, support and settlement working, which is what keeps a wrongly-suspected
// agent reachable instead of gone.
adminRouter.post("/users/:id/restrict", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      level: z.enum(["none", "soft", "hard", "freeze"]),
      reason: z.string().trim().max(500).default(""),
    })
    .parse(req.body);
  const result = await setRestrictionLevel(req.auth.sub, req.params.id, body.level, body.reason);
  sendSuccess(res, result, `Restriction set to ${body.level}`);
});

adminRouter.get("/kyc", async (req, res) => {
  const status =
    typeof req.query.status === "string" && (KYC_STATUSES as readonly string[]).includes(req.query.status)
      ? (req.query.status as (typeof KYC_STATUSES)[number])
      : "pending";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const flagged = req.query.flagged === "1" || req.query.flagged === "true";
  sendSuccess(res, await listKycQueue({ status, flagged, limit, offset }));
});

adminRouter.post("/kyc/:id/decide", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      decision: z.enum(["verified", "rejected"]),
      reason: z.string().trim().max(500, "Reason must be at most 500 characters").optional(),
    })
    .parse(req.body);
  const result = await decideKyc(req.auth.sub, req.params.id, body.decision, body.reason || null);
  const message =
    body.decision !== "verified"
      ? "KYC rejected"
      : result.loginEmail?.status === "failed"
        ? `KYC approved, but the login email failed: ${result.loginEmail.message}`
        : result.loginEmail?.status === "sent"
          ? "KYC approved — login details emailed to the agent"
          : "KYC approved";
  sendSuccess(res, result, message);
});

adminRouter.post("/users/:id/login-email/resend", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const result = await resendLoginEmail(req.auth.sub, req.params.id);
  if (result.status === "failed") {
    throw new HttpError(422, `Login email failed: ${result.message}`, "LOGIN_EMAIL_FAILED");
  }
  sendSuccess(res, result, "Login email sent — the earlier temporary password no longer works");
});

adminRouter.post("/kyc/:id/reset", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      reason: z.string().trim().min(8, "Reason must be at least 8 characters").max(500),
    })
    .parse(req.body);
  const result = await resetKyc(req.auth.sub, req.params.id, body.reason);
  sendSuccess(res, result, "KYC reset — the agent will be asked to submit KYC again");
});

adminRouter.get("/transactions", async (req, res) => {
  const status =
    typeof req.query.status === "string" &&
    (TRANSACTION_STATUSES as readonly string[]).includes(req.query.status)
      ? (req.query.status as (typeof TRANSACTION_STATUSES)[number])
      : undefined;
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  sendSuccess(res, await listAdminTransactions({ status, userId, limit, offset }));
});

adminRouter.get("/audit-logs", async (req, res) => {
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const result = await listAuditLogsAdmin({ action, userId, q, limit, offset });
  sendSuccess(res, result);
});

adminRouter.get("/reconciliation", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  sendSuccess(res, await listReconciliationMismatches({ limit, offset }));
});

adminRouter.get("/risk-alerts", async (req, res) => {
  const windowHours = Math.min(Number(req.query.windowHours) || 24, 168);
  const minFailures = Math.max(Number(req.query.minFailures) || 3, 1);
  sendSuccess(res, await listRiskAlerts({ windowHours, minFailures }));
});

// Task #15 — device and location signals. Log-only: listing here is the review surface, not a
// moderation queue. "Reviewed" just means a human looked at it, not that anything was actioned.
adminRouter.get("/risk-signals", async (req, res) => {
  const signalType = typeof req.query.signalType === "string" ? req.query.signalType : undefined;
  const unreviewedOnly = req.query.unreviewedOnly === "true";
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  sendSuccess(res, await listRiskSignals({ signalType, unreviewedOnly, limit }));
});

adminRouter.post("/risk-signals/:id/review", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  await markRiskSignalReviewed(req.auth.sub, req.params.id);
  sendSuccess(res, { id: req.params.id }, "Marked reviewed");
});

// Device repair / RMA queue (task #16).
adminRouter.get("/repair-requests", async (req, res) => {
  const { listRepairQueue } = await import("../devices/deviceRepair.service");
  const statuses = ["submitted", "rma_issued", "in_repair", "resolved", "rejected"] as const;
  const status =
    typeof req.query.status === "string" && (statuses as readonly string[]).includes(req.query.status)
      ? (req.query.status as (typeof statuses)[number])
      : undefined;
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  sendSuccess(res, await listRepairQueue(status, limit));
});

adminRouter.post("/repair-requests/:id/rma", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z.object({ rmaNumber: z.string().trim().min(1).max(60) }).parse(req.body);
  const { issueRma } = await import("../devices/deviceRepair.service");
  sendSuccess(res, await issueRma(req.auth.sub, req.params.id, body.rmaNumber), "RMA issued");
});

adminRouter.post("/repair-requests/:id/in-repair", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { markInRepair } = await import("../devices/deviceRepair.service");
  sendSuccess(res, await markInRepair(req.auth.sub, req.params.id), "Marked in repair");
});

adminRouter.post("/repair-requests/:id/resolve", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      outcome: z.enum(["resolved", "rejected"]),
      resolutionNote: z.string().trim().min(1).max(1000),
      replaced: z.boolean().optional(),
    })
    .parse(req.body);
  const { resolveRepairRequest } = await import("../devices/deviceRepair.service");
  const result = await resolveRepairRequest({
    adminId: req.auth.sub,
    id: req.params.id,
    ...body,
  });
  sendSuccess(res, result, `Request ${body.outcome}`);
});

// Disputes / chargebacks (task #11).
adminRouter.get("/disputes", async (req, res) => {
  const statuses = ["raised", "under_review", "resolved", "rejected"] as const;
  const status =
    typeof req.query.status === "string" && (statuses as readonly string[]).includes(req.query.status)
      ? (req.query.status as (typeof statuses)[number])
      : undefined;
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const { listDisputeQueue } = await import("../disputes/dispute.service");
  sendSuccess(res, await listDisputeQueue(status, limit));
});

adminRouter.post("/disputes/:id/review", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { markUnderReview } = await import("../disputes/dispute.service");
  sendSuccess(res, await markUnderReview(req.auth.sub, req.params.id), "Marked under review");
});

adminRouter.post("/disputes/:id/resolve", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      outcome: z.enum(["resolved", "rejected"]),
      resolutionNote: z.string().trim().min(1).max(1000),
      refund: z.boolean().optional(),
    })
    .parse(req.body);
  const { resolveDispute } = await import("../disputes/dispute.service");
  const result = await resolveDispute({ adminId: req.auth.sub, id: req.params.id, ...body });
  sendSuccess(res, result, `Dispute ${body.outcome}`);
});

adminRouter.get("/network-tree", async (_req, res) => {
  sendSuccess(res, await getNetworkTreeAdmin());
});

adminRouter.get("/catalog", async (_req, res) => {
  sendSuccess(res, await listCatalogAdmin());
});

adminRouter.patch("/catalog/services/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      badge: z.string().max(20).nullable().optional(),
      isActive: z.boolean().optional(),
      name: z.string().min(2).max(120).optional(),
      minAmount: z.string().max(20).nullable().optional(),
      maxAmount: z.string().max(20).nullable().optional(),
    })
    .parse(req.body);
  const updated = await updateServiceSiteControl(req.auth.sub, req.params.id, body);
  sendSuccess(res, updated, "Service updated");
});

adminRouter.get("/providers", async (_req, res) => {
  sendSuccess(res, { railInfo: getAepsDmtRailInfo(), categories: await listProvidersAdmin() });
});

adminRouter.patch("/providers/categories/:categoryId/provider/:providerId", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      isActive: z.boolean().optional(),
      priority: z.number().int().min(0).max(100).optional(),
    })
    .parse(req.body);
  const updated = await updateProviderForCategory(
    req.auth.sub,
    req.params.categoryId,
    req.params.providerId,
    body,
  );
  sendSuccess(res, updated, "Provider updated");
});

adminRouter.post("/providers/categories/:categoryId/disable-all", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const result = await disableAllProvidersForCategory(req.auth.sub, req.params.categoryId);
  sendSuccess(res, result, "All providers disabled for this category");
});

adminRouter.patch("/providers/service/:providerServiceId", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      isActive: z.boolean().optional(),
      priority: z.number().int().min(0).max(100).optional(),
    })
    .parse(req.body);
  const updated = await updateProviderServiceRow(req.auth.sub, req.params.providerServiceId, body);
  sendSuccess(res, updated, "Provider updated");
});

adminRouter.post("/emails/product-update", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      subject: z.string().trim().min(3).max(160),
      headline: z.string().trim().min(3).max(160),
      body: z.string().trim().min(10).max(5000),
    })
    .parse(req.body);
  const { broadcastProductUpdate } = await import("../notifications/userEmail.service");
  const result = await broadcastProductUpdate(body);
  sendSuccess(res, result, `Product update queued for ${result.sent} opted-in users`);
});

// ── Commission schemes (role-default slabs) ─────────────────────────────────
const schemeRoleEnum = z.enum(["retailer", "distributor", "super_distributor"]);
const ruleTypeEnum = z.enum(["flat", "percentage"]);

const commissionRuleBody = z.object({
  serviceId: z.string().uuid(),
  providerId: z.string().uuid().nullable().optional(),
  role: schemeRoleEnum,
  ruleType: ruleTypeEnum,
  value: z.string().min(1).max(20),
  minAmount: z.string().max(20).nullable().optional(),
  maxAmount: z.string().max(20).nullable().optional(),
  effectiveFrom: z.string().max(40).nullable().optional(),
  effectiveTo: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});

adminRouter.get("/commission/rules", async (req, res) => {
  const {
    listCommissionRules,
  } = await import("../commission/commission.service");
  const serviceId = typeof req.query.serviceId === "string" ? req.query.serviceId : undefined;
  const role =
    typeof req.query.role === "string" && schemeRoleEnum.safeParse(req.query.role).success
      ? (req.query.role as z.infer<typeof schemeRoleEnum>)
      : undefined;
  const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
  sendSuccess(res, await listCommissionRules({ serviceId, role, activeOnly }));
});

// ── Customer fee schedule (service_charges) ─────────────────────────────────
// Writes go through the versioned /rate-card/customer-fee API (reason + rate audit).
adminRouter.get("/service-charges", async (req, res) => {
  const { listServiceCharges } = await import("../service-charges/serviceCharge.service");
  const serviceId = typeof req.query.serviceId === "string" ? req.query.serviceId : undefined;
  const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
  sendSuccess(res, await listServiceCharges({ serviceId, activeOnly }));
});

const customerFeeWriteGone = () => {
  throw new HttpError(
    410,
    "Customer fees are now saved with a reason from Commission → Customer fees or the Rate card. Refresh the page and try again.",
    "CUSTOMER_FEE_API_MOVED",
  );
};
adminRouter.post("/service-charges", customerFeeWriteGone);
adminRouter.patch("/service-charges/:id", customerFeeWriteGone);
adminRouter.delete("/service-charges/:id", customerFeeWriteGone);

adminRouter.post("/commission/rules", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { createCommissionRule } = await import("../commission/commission.service");
  const body = commissionRuleBody.parse(req.body);
  const created = await createCommissionRule(req.auth.sub, body);
  sendSuccess(res, created, "Commission rule created");
});

adminRouter.patch("/commission/rules/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { updateCommissionRule } = await import("../commission/commission.service");
  const body = commissionRuleBody.partial().parse(req.body);
  const updated = await updateCommissionRule(req.auth.sub, req.params.id, body);
  sendSuccess(res, updated, "Commission rule updated");
});

adminRouter.delete("/commission/rules/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { deleteCommissionRule } = await import("../commission/commission.service");
  const result = await deleteCommissionRule(req.auth.sub, req.params.id);
  sendSuccess(res, result, "Commission rule deleted");
});

adminRouter.post("/commission/preview", async (req, res) => {
  const { previewCommissionSplit } = await import("../commission/commission.service");
  const body = z
    .object({
      serviceId: z.string().uuid(),
      amount: z.string().min(1).max(20),
      providerId: z.string().uuid().nullable().optional(),
      providerPool: z.string().min(1).max(20).nullable().optional(),
    })
    .parse(req.body);
  sendSuccess(res, await previewCommissionSplit(body));
});

// ── Rate card (provider income + share %) ────────────────────────────────────
adminRouter.get("/rate-card", async (req, res) => {
  const { getRateCard } = await import("../commission/rateCard.service");
  const providerId = z
    .string()
    .uuid("Provider id must be a valid id")
    .optional()
    .parse(typeof req.query.providerId === "string" && req.query.providerId ? req.query.providerId : undefined);
  sendSuccess(res, await getRateCard({ providerId }));
});

adminRouter.post("/rate-card/preview", async (req, res) => {
  const { previewRateCard } = await import("../commission/rateCard.service");
  const draftNumber = z.string().trim().max(20).regex(/^(\d+(\.\d{1,4})?)?$/, "Enter a number like 80 or 12.5");
  const draftBound = draftNumber.nullable().optional();
  const ruleType = z.enum(["flat", "percentage"]);
  const role = z.enum(["retailer", "distributor", "super_distributor"]);
  const body = z
    .object({
      serviceId: z.string().uuid(),
      amount: z.string().min(1).max(20),
      providerId: z.string().uuid().nullable().optional(),
      draft: z
        .object({
          shares: z.partialRecord(role, draftNumber).optional(),
          flats: z.partialRecord(role, draftNumber).optional(),
          endIncomeIds: z.array(z.string().uuid()).max(50).optional(),
          addIncome: z
            .array(
              z.object({
                providerId: z.string().uuid().nullable(),
                ruleType,
                value: draftNumber.min(1),
                capAmount: draftBound,
                minAmount: draftBound,
                maxAmount: draftBound,
                replacesId: z.string().uuid().nullable().optional(),
              }),
            )
            .max(50)
            .optional(),
          endFeeIds: z.array(z.string().uuid()).max(50).optional(),
          addFees: z
            .array(
              z.object({
                providerId: z.string().uuid().nullable(),
                role: role.nullable(),
                ruleType,
                value: draftNumber.min(1),
                minAmount: draftBound,
                maxAmount: draftBound,
                replacesId: z.string().uuid().nullable().optional(),
              }),
            )
            .max(20)
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .parse(req.body);
  sendSuccess(res, await previewRateCard(body));
});

adminRouter.post("/rate-card/shares", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { setCommissionShare } = await import("../commission/rateCard.service");
  const body = z
    .object({
      serviceId: z.string().uuid(),
      providerId: z.string().uuid().nullable().optional(),
      role: schemeRoleEnum,
      sharePercent: z.string().min(1).max(20),
      minAmount: z.string().max(20).nullable().optional(),
      maxAmount: z.string().max(20).nullable().optional(),
      flatAmount: z.string().max(20).nullable().optional(),
      effectiveFrom: z.string().max(40).nullable().optional(),
      reason: z.string().max(500).nullable().optional(),
    })
    .parse(req.body);
  sendSuccess(res, await setCommissionShare(req.auth.sub, body), "Share saved");
});

adminRouter.delete("/rate-card/shares/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { endCommissionShare } = await import("../commission/rateCard.service");
  const { reason } = z.object({ reason: z.string().max(500).nullable().optional() }).parse(req.body ?? {});
  sendSuccess(res, await endCommissionShare(req.auth.sub, req.params.id, reason), "Share ended");
});

adminRouter.post("/rate-card/provider-income", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { setProviderIncomeRule } = await import("../commission/rateCard.service");
  const body = z
    .object({
      serviceId: z.string().uuid(),
      providerId: z.string().uuid().nullable().optional(),
      ruleType: ruleTypeEnum,
      value: z.string().min(1).max(20),
      capAmount: z.string().max(20).nullable().optional(),
      minAmount: z.string().max(20).nullable().optional(),
      maxAmount: z.string().max(20).nullable().optional(),
      effectiveFrom: z.string().max(40).nullable().optional(),
      reason: z.string().max(500).nullable().optional(),
    })
    .parse(req.body);
  sendSuccess(res, await setProviderIncomeRule(req.auth.sub, body), "Provider income saved");
});

adminRouter.delete("/rate-card/provider-income/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { endProviderIncomeRule } = await import("../commission/rateCard.service");
  const { reason } = z.object({ reason: z.string().max(500).nullable().optional() }).parse(req.body ?? {});
  sendSuccess(res, await endProviderIncomeRule(req.auth.sub, req.params.id, reason), "Provider income ended");
});

adminRouter.post("/rate-card/customer-fee", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { setCustomerFeeRule } = await import("../commission/rateCard.service");
  const body = z
    .object({
      serviceId: z.string().uuid(),
      providerId: z.string().uuid().nullable().optional(),
      role: schemeRoleEnum.nullable().optional(),
      ruleType: ruleTypeEnum,
      value: z.string().min(1, "Enter the customer fee").max(20),
      minAmount: z.string().max(20).nullable().optional(),
      maxAmount: z.string().max(20).nullable().optional(),
      effectiveFrom: z.string().max(40).nullable().optional(),
      reason: z.string().max(500).nullable().optional(),
    })
    .parse(req.body);
  sendSuccess(res, await setCustomerFeeRule(req.auth.sub, body), "Customer fee saved");
});

adminRouter.delete("/rate-card/customer-fee/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { endCustomerFeeRule } = await import("../commission/rateCard.service");
  const { reason } = z.object({ reason: z.string().max(500).nullable().optional() }).parse(req.body ?? {});
  sendSuccess(res, await endCustomerFeeRule(req.auth.sub, req.params.id, reason), "Customer fee ended");
});

const pctString = (label: string) =>
  z.string({ error: `${label} is required` }).min(1, `${label} is required`).max(20);

adminRouter.post("/rate-card/tax", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { setTaxConfig } = await import("../commission/tax.service");
  const body = z
    .object({
      serviceId: z.string().uuid("Service id must be a valid id").nullable(),
      tdsApplies: z.boolean(),
      tdsPercent: pctString("Agent TDS %"),
      gstOnFeeApplies: z.boolean(),
      gstOnFeePercent: pctString("GST on fee %"),
      gstOnFeeInclusive: z.boolean(),
      providerOutputGstPercent: z.string().max(20).nullable().optional(),
      providerTdsPercent: z.string().max(20).nullable().optional(),
      effectiveFrom: z.string().max(40).nullable().optional(),
      reason: z.string().max(500).nullable().optional(),
    })
    .parse(req.body);
  sendSuccess(res, await setTaxConfig(req.auth.sub, body), "Tax settings saved");
});

adminRouter.delete("/rate-card/tax/:serviceId", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { resetServiceTax } = await import("../commission/tax.service");
  const serviceId = z.string().uuid("Service id must be a valid id").parse(req.params.serviceId);
  const { reason } = z.object({ reason: z.string().max(500).nullable().optional() }).parse(req.body ?? {});
  sendSuccess(res, await resetServiceTax(req.auth.sub, serviceId, reason), "Service now uses the default tax");
});

adminRouter.get("/commission/tax-config", async (_req, res) => {
  const { listTaxConfigs } = await import("../commission/tax.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  sendSuccess(res, await listTaxConfigs(tenantId));
});

adminRouter.patch("/commission/tax-config/:id", () => {
  throw new HttpError(
    410,
    "Tax is now saved with a reason from Tax → Tax settings. Refresh the page and try again.",
    "TAX_CONFIG_API_MOVED",
  );
});

adminRouter.get("/commission/underwater-report", async (req, res) => {
  const { listAdminUnderwaterReport } = await import("../commission/commission.service");
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const providerPoolPercent =
    typeof req.query.providerPoolPercent === "string" ? req.query.providerPoolPercent : undefined;
  if (!providerPoolPercent?.trim()) {
    throw new HttpError(
      400,
      "Provider pool percent is required (0–100, same idea as scheme preview pool)",
      "PROVIDER_POOL_PERCENT_REQUIRED",
    );
  }
  const probeAmount = typeof req.query.probeAmount === "string" ? req.query.probeAmount : undefined;
  const txnLimit = Math.min(Number(req.query.limit) || 50, 100);
  sendSuccess(
    res,
    await listAdminUnderwaterReport({ date, providerPoolPercent, probeAmount, txnLimit }),
  );
});

adminRouter.get("/commission/payouts", async (req, res) => {
  const { listAdminCommissionPayouts } = await import("../commission/commission.service");
  const role =
    typeof req.query.role === "string" && schemeRoleEnum.safeParse(req.query.role).success
      ? (req.query.role as z.infer<typeof schemeRoleEnum>)
      : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const clawbackRaw = typeof req.query.clawback === "string" ? req.query.clawback : undefined;
  const clawback =
    clawbackRaw === "clawed" || clawbackRaw === "all" || clawbackRaw === "active"
      ? clawbackRaw
      : undefined;
  const sinceRaw = typeof req.query.since === "string" ? req.query.since : undefined;
  const untilRaw = typeof req.query.until === "string" ? req.query.until : undefined;
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  const until = untilRaw ? new Date(untilRaw) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    throw new HttpError(400, "since must be a valid date", "INVALID_DATE");
  }
  if (until && Number.isNaN(until.getTime())) {
    throw new HttpError(400, "until must be a valid date", "INVALID_DATE");
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  sendSuccess(res, await listAdminCommissionPayouts({ role, since, until, q, clawback, limit, offset }));
});

adminRouter.get("/commission/tax-registers/tds", async (req, res) => {
  const { listAdminTdsRegister } = await import("../commission/commission.service");
  const role =
    typeof req.query.role === "string" && schemeRoleEnum.safeParse(req.query.role).success
      ? (req.query.role as z.infer<typeof schemeRoleEnum>)
      : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const clawbackRaw = typeof req.query.clawback === "string" ? req.query.clawback : undefined;
  const clawback =
    clawbackRaw === "clawed" || clawbackRaw === "all" || clawbackRaw === "active"
      ? clawbackRaw
      : undefined;
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    throw new HttpError(400, "month must be YYYY-MM", "INVALID_MONTH");
  }
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  sendSuccess(res, await listAdminTdsRegister({ month, role, q, clawback, limit, offset }));
});

adminRouter.get("/commission/tax-registers/dmt-gst", async (req, res) => {
  const { listAdminDmtGstRegister } = await import("../commission/commission.service");
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const sinceRaw = typeof req.query.since === "string" ? req.query.since : undefined;
  const untilRaw = typeof req.query.until === "string" ? req.query.until : undefined;
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  const until = untilRaw ? new Date(untilRaw) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    throw new HttpError(400, "since must be a valid date", "INVALID_DATE");
  }
  if (until && Number.isNaN(until.getTime())) {
    throw new HttpError(400, "until must be a valid date", "INVALID_DATE");
  }
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  sendSuccess(res, await listAdminDmtGstRegister({ since, until, q, limit, offset }));
});

/** TC15 — store raw provider commission JSON until parse rules are confirmed. */
adminRouter.post("/commission/provider-ingest", async (req, res) => {
  const { storeProviderCommissionIngest } = await import("../commission/commission.service");
  const body = req.body as {
    providerCode?: string;
    payload?: unknown;
    externalRef?: string;
    parseNote?: string;
  };
  if (!body.providerCode?.trim()) {
    throw new HttpError(400, "Provider code is required", "PROVIDER_CODE_REQUIRED");
  }
  sendSuccess(
    res,
    await storeProviderCommissionIngest({
      providerCode: body.providerCode,
      payload: body.payload,
      externalRef: body.externalRef,
      parseNote: body.parseNote,
    }),
    "Provider commission payload stored",
  );
});

/** TC18 — claw back commission after refund (also auto-runs on dispute refund). */
adminRouter.post("/commission/clawback/:transactionId", async (req, res) => {
  const { clawbackCommissionForTxn } = await import("../commission/commission.service");
  const transactionId = req.params.transactionId;
  if (!transactionId) {
    throw new HttpError(400, "Transaction id is required", "TRANSACTION_ID_REQUIRED");
  }
  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : undefined;
  sendSuccess(
    res,
    await clawbackCommissionForTxn(transactionId, {
      performedBy: req.auth?.sub,
      reason,
    }),
    "Commission clawback completed",
  );
});

// ── Tax & Commission rich (TCR05–TCR14) ─────────────────────────────────────
const schemeImportBody = z.object({
  rows: z
    .array(
      z.object({
        serviceCode: z.string().min(1).max(60),
        role: z.string().min(1).max(30),
        ruleType: z.string().min(1).max(20),
        value: z.union([z.string().max(20), z.number()]),
        minAmount: z.union([z.string().max(20), z.number()]).nullable().optional(),
        maxAmount: z.union([z.string().max(20), z.number()]).nullable().optional(),
        providerCode: z.string().max(40).nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .min(1, "Add at least one row to import")
    .max(1000, "Import is limited to 1000 rows per request"),
  dryRun: z.boolean().optional(),
  fileName: z.string().max(200).nullable().optional(),
});

adminRouter.get("/commission/rules/export", async (_req, res) => {
  const { exportCommissionRulesCsv } = await import("../commission/commission.rich.service");
  sendSuccess(res, await exportCommissionRulesCsv());
});

adminRouter.post("/commission/rules/import", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { importCommissionRules } = await import("../commission/commission.rich.service");
  const body = schemeImportBody.parse(req.body);
  const result = await importCommissionRules(req.auth.sub, body);
  sendSuccess(res, result, body.dryRun ? "Import preview ready" : "Commission scheme import finished");
});

adminRouter.get("/commission/overrides", async (req, res) => {
  const { listCommissionOverrides } = await import("../commission/commission.rich.service");
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const role = typeof req.query.role === "string" ? req.query.role : undefined;
  const expiredRaw = req.query.expired;
  const expired = expiredRaw === "1" || expiredRaw === "all" || expiredRaw === "0" ? expiredRaw : undefined;
  const activeRaw = req.query.active;
  const active = activeRaw === "0" || activeRaw === "all" || activeRaw === "1" ? activeRaw : undefined;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  sendSuccess(res, await listCommissionOverrides({ q, role, expired, active, limit, offset }));
});

adminRouter.post("/commission/overrides/:id/revert", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    throw new HttpError(400, "Override id must be a valid UUID", "INVALID_ID");
  }
  const body = z
    .object({
      mode: z.enum(["deactivate", "delete"]).optional(),
      reason: z.string().max(300).optional(),
    })
    .parse(req.body ?? {});
  const { revertCommissionOverride } = await import("../commission/commission.rich.service");
  sendSuccess(res, await revertCommissionOverride(req.auth.sub, id, body), "Override reverted");
});

adminRouter.get("/commission/ca-month-pack", async (req, res) => {
  const { getCaMonthPack } = await import("../commission/commission.rich.service");
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  sendSuccess(res, await getCaMonthPack(month));
});

adminRouter.get("/commission/pan-gaps", async (req, res) => {
  const { getPanGaps } = await import("../commission/commission.rich.service");
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  sendSuccess(res, await getPanGaps(month));
});

adminRouter.get("/commission/rate-audit", async (req, res) => {
  const { listRateAudit } = await import("../commission/commission.rich.service");
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  sendSuccess(res, await listRateAudit({ limit, entityType, q }));
});

adminRouter.get("/commission/recon", async (req, res) => {
  const { getCommissionRecon } = await import("../commission/commission.rich.service");
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  sendSuccess(res, await getCommissionRecon(from, to));
});

adminRouter.get("/commission/month-locks", async (_req, res) => {
  const { listMonthLocks } = await import("../commission/commission.rich.service");
  sendSuccess(res, await listMonthLocks());
});

adminRouter.post("/commission/month-locks", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z.object({ yearMonth: z.string().max(7) }).parse(req.body);
  const { lockCommissionMonth } = await import("../commission/commission.rich.service");
  sendSuccess(res, await lockCommissionMonth(req.auth.sub, body.yearMonth), "Commission month locked");
});

adminRouter.post("/commission/month-locks/:yearMonth/unlock", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
  const { unlockCommissionMonth } = await import("../commission/commission.rich.service");
  sendSuccess(
    res,
    await unlockCommissionMonth(req.auth.sub, String(req.params.yearMonth), body.reason),
    "Commission month unlocked",
  );
});

adminRouter.get("/ledger/health", async (_req, res) => {
  const { getLedgerHealthReport } = await import("../reconciliation/reports");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  sendSuccess(res, await getLedgerHealthReport(tenantId));
});

// Treasury assets vs what the hierarchy is owed. Rupee strings so the portal renders them
// without ever putting paise through a JS number.
adminRouter.get("/treasury/summary", async (_req, res) => {
  const { getTreasurySummary } = await import("../reconciliation/checks");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const { paiseToRupees } = await import("../../core/money");
  const tenantId = await resolveTenantId();
  const s = await getTreasurySummary(tenantId);
  sendSuccess(res, {
    bank: paiseToRupees(s.bank),
    transit: paiseToRupees(s.transit),
    float: paiseToRupees(s.float),
    totalAssets: paiseToRupees(s.totalAssets),
    companyBalance: paiseToRupees(s.companyBalance),
    downlineLiability: paiseToRupees(s.downlineLiability),
    solvent: s.solvent,
  });
});

adminRouter.get("/treasury/breakdown", async (_req, res) => {
  const { getTreasuryBreakdown } = await import("../treasury/treasury.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  sendSuccess(res, await getTreasuryBreakdown(tenantId));
});

/** Provider / API ledger In·Out·Fees·wallet impact — not bank statement CR/DR. */
adminRouter.get("/treasury/provider-ledger", async (req, res) => {
  const { getProviderLedgerStrip } = await import("../treasury/treasury.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const istToday = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : istToday;
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : istToday;
  sendSuccess(res, await getProviderLedgerStrip({ tenantId, from, to }));
});

adminRouter.get("/treasury/banks/:id/details", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const raw = String(req.params.id);
  if (!/^\d+$/.test(raw)) throw new HttpError(422, "Bank account id is invalid", "INVALID_ID");
  const { getTreasuryBankDetails } = await import("../treasury/treasury.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  sendSuccess(
    res,
    await getTreasuryBankDetails({ tenantId, bankAccountId: BigInt(raw), adminId: req.auth.sub }),
  );
});

const providerThresholdBody = z.object({
  lowBalanceThreshold: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\d+(\.\d{1,2})?)?$/, "Low balance limit must be a rupee amount, e.g. 10000")
    .nullable(),
});

adminRouter.patch("/treasury/providers/:id/threshold", async (req, res) => {
  const parsed = providerThresholdBody.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(422, parsed.error.issues[0]?.message ?? "Low balance limit is invalid", "VALIDATION_ERROR");
  }
  const providerId = String(req.params.id);
  if (!z.string().uuid().safeParse(providerId).success) {
    throw new HttpError(422, "Provider id is invalid", "INVALID_ID");
  }
  const { setProviderLowBalanceThreshold } = await import("../treasury/treasury.service");
  const { rupeesToPaise } = await import("../../core/money");
  const raw = parsed.data.lowBalanceThreshold;
  const result = await setProviderLowBalanceThreshold({
    providerId,
    threshold: raw ? rupeesToPaise(raw) : null,
  });
  sendSuccess(
    res,
    result,
    result.lowBalanceThreshold ? "Low balance limit saved" : "Low balance limit removed",
  );
});

// ── Bank entries register (maker-checker) ────────────────────────────────────
const bankEntryBody = z.object({
  category: z.string().trim().min(1, "Select a category"),
  bankAccountId: z
    .string()
    .trim()
    .regex(/^\d+$/, "Select a company bank account")
    .nullable()
    .optional(),
  providerId: z.string().uuid("Select an API provider").nullable().optional(),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a rupee amount, e.g. 4990 or 4990.50"),
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the transaction date"),
  mode: z.enum(["upi", "imps", "neft", "rtgs", "cheque", "cash", "other"], {
    message: "Select the payment mode",
  }),
  utr: z
    .string()
    .trim()
    .max(40, "UTR / reference must be 40 characters or fewer")
    .regex(/^[A-Za-z0-9]*$/, "UTR / reference can contain only letters and numbers")
    .nullable()
    .optional(),
  partyName: z.string().trim().max(120, "Name must be 120 characters or fewer").nullable().optional(),
  partyIfsc: z
    .string()
    .trim()
    .regex(/^([A-Za-z]{4}0[A-Za-z0-9]{6})?$/, "Enter a valid 11-character IFSC, e.g. HDFC0001344")
    .nullable()
    .optional(),
  partyAccountLast4: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "Enter only the last 4 digits of the account number")
    .nullable()
    .optional(),
  narration: z.string().trim().max(500, "Narration must be 500 characters or fewer").nullable().optional(),
  attachmentName: z.string().trim().max(160).nullable().optional(),
  attachmentDataUrl: z.string().max(4_500_000, "Proof file must be 3 MB or smaller").nullable().optional(),
});

function bankEntryIdParam(raw: unknown): bigint {
  const s = String(raw);
  if (!/^\d+$/.test(s)) throw new HttpError(422, "Bank entry id is invalid", "INVALID_ID");
  return BigInt(s);
}

adminRouter.get("/bank-entries/categories", async (_req, res) => {
  const { listBankEntryCategories } = await import("../treasury/bankEntry.service");
  sendSuccess(res, listBankEntryCategories());
});

adminRouter.get("/bank-entries/approval-policy", async (_req, res) => {
  const { canSelfApproveBankEntries } = await import("../treasury/bankEntry.service");
  sendSuccess(res, { canSelfApprove: await canSelfApproveBankEntries() });
});

adminRouter.get("/bank-entries", async (req, res) => {
  const { listBankEntries } = await import("../treasury/bankEntry.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const q = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);
  const statusRaw = q("status");
  const status =
    statusRaw === "requested" || statusRaw === "approved" || statusRaw === "rejected" ? statusRaw : undefined;
  const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  sendSuccess(
    res,
    await listBankEntries({
      tenantId,
      status,
      from: isDate(q("from")),
      to: isDate(q("to")),
      limit: Number(q("limit")) || 100,
    }),
  );
});

adminRouter.get("/bank-entries/:id/attachment", async (req, res) => {
  const { getBankEntryAttachment } = await import("../treasury/bankEntry.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  sendSuccess(res, await getBankEntryAttachment(tenantId, bankEntryIdParam(req.params.id)));
});

adminRouter.post("/bank-entries", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const parsed = bankEntryBody.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(422, parsed.error.issues[0]?.message ?? "Bank entry is invalid", "VALIDATION_ERROR");
  }
  const body = parsed.data;
  const { requestBankEntry, isBankEntryCategory } = await import("../treasury/bankEntry.service");
  if (!isBankEntryCategory(body.category)) {
    throw new HttpError(422, "Select a valid category", "INVALID_CATEGORY");
  }
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const { rupeesToPaise } = await import("../../core/money");
  const tenantId = await resolveTenantId();
  const result = await requestBankEntry({
    tenantId,
    requestedBy: req.auth.sub,
    category: body.category,
    bankAccountId: body.bankAccountId || null,
    providerId: body.providerId || null,
    amount: rupeesToPaise(body.amount),
    txnDate: body.txnDate,
    mode: body.mode,
    utr: body.utr || null,
    partyName: body.partyName || null,
    partyIfsc: body.partyIfsc || null,
    partyAccountLast4: body.partyAccountLast4 || null,
    narration: body.narration || null,
    attachmentName: body.attachmentName || null,
    attachmentDataUrl: body.attachmentDataUrl || null,
  });
  sendSuccess(res, result, "Bank entry saved — approve it to post to the ledger");
});

adminRouter.post("/bank-entries/bulk", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const parsed = z
    .object({
      bankAccountId: z.string().regex(/^\d+$/, "Select the company bank account"),
      category: z.string().min(1, "Select a category"),
      providerId: z.string().trim().max(64).nullable().optional(),
      lineIds: z
        .array(z.string().regex(/^\d+$/, "Statement line id is invalid"))
        .min(1, "Select at least one statement line")
        .max(50, "Select at most 50 lines at a time"),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(422, parsed.error.issues[0]?.message ?? "Bulk entry is invalid", "VALIDATION_ERROR");
  }
  const { createBankEntriesFromLines, isBankEntryCategory } = await import("../treasury/bankEntry.service");
  const categoryRaw = parsed.data.category;
  if (categoryRaw !== "auto" && !isBankEntryCategory(categoryRaw)) {
    throw new HttpError(422, "Select a valid category", "INVALID_CATEGORY");
  }
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const results = await createBankEntriesFromLines({
    tenantId,
    requestedBy: req.auth.sub,
    bankAccountId: parsed.data.bankAccountId,
    category: categoryRaw === "auto" ? "auto" : categoryRaw,
    providerId: parsed.data.providerId || null,
    lineIds: [...new Set(parsed.data.lineIds)],
  });
  const created = results.filter((r) => r.entryId).length;
  sendSuccess(
    res,
    results,
    `${created} of ${results.length} entries created — add any missing receipts, then approve`,
  );
});

/** UTR prefix → category rules (TB16). */
adminRouter.get("/bank-entry-rules", async (_req, res) => {
  const { listCategoryRules } = await import("../treasury/bankEntryRules.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  sendSuccess(res, await listCategoryRules(await resolveTenantId()));
});

adminRouter.post("/bank-entry-rules/resolve", async (req, res) => {
  const body = z
    .object({
      bankAccountId: z.string().regex(/^\d+$/).nullable().optional(),
      items: z
        .array(
          z.object({
            key: z.string().min(1).max(64),
            utr: z.string().nullable(),
          }),
        )
        .min(1)
        .max(50),
    })
    .parse(req.body);
  const { resolveCategoriesForUtrs } = await import("../treasury/bankEntryRules.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  sendSuccess(
    res,
    await resolveCategoriesForUtrs({
      tenantId: await resolveTenantId(),
      bankAccountId: body.bankAccountId ?? null,
      items: body.items,
    }),
  );
});

adminRouter.post("/bank-entry-rules", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      utrPrefix: z.string().trim().min(2, "UTR prefix must be at least 2 characters").max(40),
      category: z.string().min(1, "Select a category"),
      bankAccountId: z.string().regex(/^\d+$/).nullable().optional(),
      note: z.string().trim().max(500).nullable().optional(),
    })
    .parse(req.body);
  const { createCategoryRule } = await import("../treasury/bankEntryRules.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  sendSuccess(
    res,
    await createCategoryRule({
      tenantId: await resolveTenantId(),
      adminId: req.auth.sub,
      utrPrefix: body.utrPrefix,
      category: body.category,
      bankAccountId: body.bankAccountId ?? null,
      note: body.note,
    }),
    "Category rule saved",
  );
});

adminRouter.patch("/bank-entry-rules/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      category: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
      note: z.string().trim().max(500).nullable().optional(),
    })
    .parse(req.body);
  const { updateCategoryRule } = await import("../treasury/bankEntryRules.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  sendSuccess(
    res,
    await updateCategoryRule({
      tenantId: await resolveTenantId(),
      adminId: req.auth.sub,
      ruleId: String(req.params.id || ""),
      category: body.category,
      isActive: body.isActive,
      note: body.note,
    }),
    "Category rule updated",
  );
});

adminRouter.delete("/bank-entry-rules/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { deleteCategoryRule } = await import("../treasury/bankEntryRules.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  await deleteCategoryRule({
    tenantId: await resolveTenantId(),
    adminId: req.auth.sub,
    ruleId: String(req.params.id || ""),
  });
  sendSuccess(res, { ok: true }, "Category rule removed");
});

adminRouter.post("/bank-entries/:id/receipt", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const parsed = z
    .object({
      attachmentName: z.string().trim().min(1).max(160),
      attachmentDataUrl: z.string().min(1, "Choose a receipt file").max(4_500_000, "Proof file must be 3 MB or smaller"),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(422, parsed.error.issues[0]?.message ?? "Receipt is invalid", "VALIDATION_ERROR");
  }
  const { attachBankEntryReceipt } = await import("../treasury/bankEntry.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  await attachBankEntryReceipt({
    tenantId,
    entryId: bankEntryIdParam(req.params.id),
    adminId: req.auth.sub,
    ...parsed.data,
  });
  sendSuccess(res, { ok: true }, "Receipt added");
});

adminRouter.post("/bank-entries/:id/approve", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { approveBankEntry } = await import("../treasury/bankEntry.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const result = await approveBankEntry({
    tenantId,
    entryId: bankEntryIdParam(req.params.id),
    approvedBy: req.auth.sub,
  });
  sendSuccess(res, result, "Bank entry approved and posted to the ledger");
});

adminRouter.post("/bank-entries/:id/reject", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const note = z.object({ note: z.string().trim().min(3, "Rejection note must be at least 3 characters") }).safeParse(req.body);
  if (!note.success) {
    throw new HttpError(422, note.error.issues[0]?.message ?? "Rejection note is required", "VALIDATION_ERROR");
  }
  const { rejectBankEntry } = await import("../treasury/bankEntry.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  await rejectBankEntry({
    tenantId,
    entryId: bankEntryIdParam(req.params.id),
    rejectedBy: req.auth.sub,
    note: note.data.note,
  });
  sendSuccess(res, { ok: true }, "Bank entry rejected");
});

adminRouter.post("/bank-entries/:id/reverse", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      reason: z.string().trim().min(5, "Reason must be at least 5 characters (e.g. Wrong bank account)"),
      moveToBankAccountId: z.string().trim().nullable().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    throw new HttpError(422, body.error.issues[0]?.message ?? "Reason is required", "VALIDATION_ERROR");
  }
  const { reverseBankEntry } = await import("../treasury/bankEntry.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const result = await reverseBankEntry({
    tenantId,
    entryId: bankEntryIdParam(req.params.id),
    adminId: req.auth.sub,
    reason: body.data.reason,
    moveToBankAccountId: body.data.moveToBankAccountId || null,
  });
  sendSuccess(
    res,
    result,
    result.newEntryId
      ? `Entry reversed. New entry #${result.newEntryId} created on the other bank — approve it to post.`
      : "Bank entry reversed",
  );
});

adminRouter.post("/ledger/recon/run", async (_req, res) => {
  const { runAndPersistReconciliation } = await import("../reconciliation/reports");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  sendSuccess(res, await runAndPersistReconciliation(tenantId), "Reconciliation checks completed");
});

adminRouter.get("/ledger/exceptions", async (req, res) => {
  const { listOpenReconExceptions } = await import("../reconciliation/reports");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  sendSuccess(res, await listOpenReconExceptions(tenantId, limit));
});

// ── Spec §9.2: RECON_ADJUSTMENT maker-checker ────────────────────────────────
const reconAdjustmentBody = z.object({
  amount: z.string().min(1).max(20),
  debitCode: z.string().trim().min(2).max(64),
  creditCode: z.string().trim().min(2).max(64),
  reason: z.string().trim().min(8).max(2000),
});

adminRouter.get("/recon-adjustments", async (req, res) => {
  const { listReconAdjustments } = await import("../reconciliation/reconAdjustment.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
  const status =
    statusRaw === "requested" || statusRaw === "approved" || statusRaw === "rejected"
      ? statusRaw
      : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  sendSuccess(res, await listReconAdjustments({ tenantId, status, limit }));
});

adminRouter.get("/recon-adjustments/account-codes", async (req, res) => {
  const { listLedgerAccountCodes } = await import("../reconciliation/reconAdjustment.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  sendSuccess(res, await listLedgerAccountCodes(tenantId, limit));
});

adminRouter.post("/recon-adjustments", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = reconAdjustmentBody.parse(req.body);
  const { requestReconAdjustment } = await import("../reconciliation/reconAdjustment.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const { rupeesToPaise } = await import("../../core/money");
  let amountPaise: bigint;
  try {
    amountPaise = rupeesToPaise(body.amount);
  } catch {
    throw new HttpError(400, "Amount must be a valid positive rupee amount", "INVALID_AMOUNT");
  }
  if (amountPaise <= 0n) {
    throw new HttpError(400, "Amount must be greater than zero", "INVALID_AMOUNT");
  }
  const tenantId = await resolveTenantId();
  const created = await requestReconAdjustment({
    tenantId,
    amount: amountPaise,
    debitCode: body.debitCode,
    creditCode: body.creditCode,
    reason: body.reason,
    requestedBy: req.auth.sub,
  });
  sendSuccess(res, created, "Recon adjustment requested — awaiting checker approval", 201);
});

adminRouter.post("/recon-adjustments/:id/approve", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const note = typeof req.body?.note === "string" ? req.body.note : undefined;
  const { approveReconAdjustment } = await import("../reconciliation/reconAdjustment.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  let adjustmentId: bigint;
  try {
    adjustmentId = BigInt(req.params.id);
  } catch {
    throw new HttpError(400, "Invalid adjustment id", "INVALID_ID");
  }
  const result = await approveReconAdjustment({
    tenantId,
    adjustmentId,
    approvedBy: req.auth.sub,
    note,
  });
  sendSuccess(res, result, "Recon adjustment approved and posted");
});

adminRouter.post("/recon-adjustments/:id/reject", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const note = z.string().trim().min(3).max(2000).parse(req.body?.note);
  const { rejectReconAdjustment } = await import("../reconciliation/reconAdjustment.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  let adjustmentId: bigint;
  try {
    adjustmentId = BigInt(req.params.id);
  } catch {
    throw new HttpError(400, "Invalid adjustment id", "INVALID_ID");
  }
  await rejectReconAdjustment({
    tenantId,
    adjustmentId,
    rejectedBy: req.auth.sub,
    note,
  });
  sendSuccess(res, { id: req.params.id, rejected: true }, "Recon adjustment rejected");
});

adminRouter.get("/tenant-settings", async (_req, res) => {
  const { getTenantSettings } = await import("../tenants/tenantSettings.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const { env } = await import("../../config/env");
  const tenantId = await resolveTenantId();
  sendSuccess(res, {
    ...(await getTenantSettings(tenantId)),
    bankCheckProviderCosts: { pennyless: env.BANK_NAME_CHECK_COST, pennyDrop: env.BANK_PENNY_DROP_COST },
  });
});

adminRouter.patch("/tenant-settings", async (req, res) => {
  const body = z
    .object({
      fundApproveDualRupees: z.coerce.number().int().positive().max(1_000_000_000).optional(),
      settlementChargeRupees: z.coerce.number().int().min(0).max(10_000).optional(),
      supportPhone: z.string().max(40).optional(),
      supportEmail: z.string().max(150).optional(),
      supportWhatsapp: z.string().max(20).optional(),
      supportWebsite: z.string().max(200).optional(),
      nodalEmail: z.string().max(150).optional(),
      nodalPhone: z.string().max(40).optional(),
      nodalAddress: z.string().max(500).optional(),
      allowCompanyBankDelete: z.boolean().optional(),
      bankCheckPriceRupees: z.coerce.number({ error: "Bank check price must be a number" }).optional(),
      bankCheckPennyDropPriceRupees: z
        .coerce.number({ error: "Bank check price with ₹1 penny drop must be a number" })
        .optional(),
    })
    .parse(req.body);
  const { patchTenantSettings } = await import("../tenants/tenantSettings.service");
  const { parseGeofencePatch } = await import("../tenants/geofenceSettings");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const geofence = req.body?.geofence !== undefined ? parseGeofencePatch(req.body.geofence) : undefined;
  const tenantId = await resolveTenantId();
  sendSuccess(
    res,
    await patchTenantSettings(
      tenantId,
      { ...body, ...(geofence ? { geofence } : {}) },
      req.auth ? { id: req.auth.sub, ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null } : undefined,
    ),
    "Settings saved",
  );
});

adminRouter.get("/promos", async (req, res) => {
  const placement = z
    .enum(["dashboard", "login"])
    .optional()
    .parse(typeof req.query.placement === "string" ? req.query.placement : undefined);
  const { listPromoSlides, clientPromoImageUrl } = await import("../tenants/promo.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const slides = await listPromoSlides(tenantId, placement);
  sendSuccess(
    res,
    slides.map((s) => ({ ...s, imageUrl: clientPromoImageUrl(s) })),
  );
});

adminRouter.put("/promos", async (req, res) => {
  const body = z
    .object({
      placement: z.enum(["dashboard", "login"]),
      slides: z.array(z.record(z.string(), z.unknown())).max(8),
    })
    .parse(req.body);
  const { replacePromoSlides, clientPromoImageUrl } = await import("../tenants/promo.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const slides = await replacePromoSlides(tenantId, body.placement, body.slides);
  sendSuccess(
    res,
    slides.map((s) => ({ ...s, imageUrl: clientPromoImageUrl(s) })),
    "Promotions saved",
  );
});

adminRouter.post("/promos/upload", async (req, res) => {
  const body = z.object({ dataUrl: z.string().min(32).max(2_200_000) }).parse(req.body);
  const { savePromoUpload } = await import("../tenants/promo.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const saved = await savePromoUpload(tenantId, body.dataUrl);
  sendSuccess(res, { imageUrl: saved.imageUrl, path: saved.imageUrl }, "Image uploaded");
});

const walletMoveBody = z.object({
  kind: z.enum(["transfer", "reverse"], { message: "Choose Transfer or Reverse" }),
  amount: z.string().trim().min(1, "Enter an amount"),
  reason: z.string().trim().min(5, "Reason must be at least 5 characters"),
});

adminRouter.get("/agents/:id/wallet-move-context", async (req, res) => {
  const { getMoveContext } = await import("./adminWalletMove.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  sendSuccess(res, await getMoveContext(await resolveTenantId(), String(req.params.id)));
});

adminRouter.post("/agents/:id/wallet-move", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = walletMoveBody.parse(req.body);
  const { requestWalletMove } = await import("./adminWalletMove.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const result = await requestWalletMove({
    tenantId: await resolveTenantId(),
    adminId: req.auth.sub,
    agentUserId: String(req.params.id),
    ...body,
  });
  sendSuccess(
    res,
    result,
    result.status === "done"
      ? body.kind === "transfer"
        ? "Transfer done"
        : "Reverse done"
      : "Sent for second admin approval",
  );
});

adminRouter.get("/wallet-moves", async (req, res) => {
  const { listWalletMoves } = await import("./adminWalletMove.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  sendSuccess(res, await listWalletMoves(await resolveTenantId(), status));
});

adminRouter.post("/wallet-moves/:id/:decision", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const decision = String(req.params.decision);
  if (decision !== "approve" && decision !== "reject") {
    throw new HttpError(404, "Unknown action — use approve or reject", "NOT_FOUND");
  }
  if (!/^\d+$/.test(String(req.params.id))) throw new HttpError(400, "Invalid wallet move id", "INVALID_ID");
  const { decideWalletMove } = await import("./adminWalletMove.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const result = await decideWalletMove({
    tenantId: await resolveTenantId(),
    adminId: req.auth.sub,
    moveId: String(req.params.id),
    approve: decision === "approve",
    note: typeof req.body?.note === "string" ? req.body.note : undefined,
  });
  sendSuccess(res, result, result.status === "done" ? "Approved and posted" : "Rejected");
});
