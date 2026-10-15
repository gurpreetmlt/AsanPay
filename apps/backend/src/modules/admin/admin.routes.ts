import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { KYC_STATUSES, TRANSACTION_STATUSES, USER_ROLES } from "@asanpay/shared-types";
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

adminRouter.get("/alerts", async (_req, res) => {
  sendSuccess(res, await getAdminAlerts());
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
  res.setHeader("Cache-Control", "private, max-age=120");
  res.send(doc.buffer);
});

adminRouter.get("/users/:id/ancestors", async (req, res) => {
  sendSuccess(res, await getUserAncestorsAdmin(req.params.id));
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
  sendSuccess(res, await listKycQueue({ status, limit, offset }));
});

adminRouter.post("/kyc/:id/decide", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z.object({ decision: z.enum(["verified", "rejected"]) }).parse(req.body);
  const result = await decideKyc(req.auth.sub, req.params.id, body.decision);
  sendSuccess(res, result, body.decision === "verified" ? "KYC approved" : "KYC rejected");
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
const serviceChargeBody = z.object({
  serviceId: z.string().uuid(),
  providerId: z.string().uuid().nullable().optional(),
  /** null / omitted on create defaults to null = all roles; UI usually sends retailer */
  role: schemeRoleEnum.nullable().optional(),
  ruleType: ruleTypeEnum,
  value: z.string().min(1).max(20),
  minAmount: z.string().max(20).nullable().optional(),
  maxAmount: z.string().max(20).nullable().optional(),
  effectiveFrom: z.string().max(40).nullable().optional(),
  effectiveTo: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});

adminRouter.get("/service-charges", async (req, res) => {
  const { listServiceCharges } = await import("../service-charges/serviceCharge.service");
  const serviceId = typeof req.query.serviceId === "string" ? req.query.serviceId : undefined;
  const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
  sendSuccess(res, await listServiceCharges({ serviceId, activeOnly }));
});

adminRouter.post("/service-charges", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { createServiceCharge } = await import("../service-charges/serviceCharge.service");
  const body = serviceChargeBody.parse(req.body);
  const created = await createServiceCharge(req.auth.sub, body);
  sendSuccess(res, created, "Service charge created");
});

adminRouter.patch("/service-charges/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { updateServiceCharge } = await import("../service-charges/serviceCharge.service");
  const body = serviceChargeBody.partial().parse(req.body);
  const updated = await updateServiceCharge(req.auth.sub, req.params.id, body);
  sendSuccess(res, updated, "Service charge updated");
});

adminRouter.delete("/service-charges/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { deleteServiceCharge } = await import("../service-charges/serviceCharge.service");
  const result = await deleteServiceCharge(req.auth.sub, req.params.id);
  sendSuccess(res, result, "Service charge deleted");
});

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
    })
    .parse(req.body);
  sendSuccess(res, await previewCommissionSplit(body));
});

adminRouter.get("/commission/payouts", async (req, res) => {
  const { listAdminCommissionPayouts } = await import("../commission/commission.service");
  const role =
    typeof req.query.role === "string" && schemeRoleEnum.safeParse(req.query.role).success
      ? (req.query.role as z.infer<typeof schemeRoleEnum>)
      : undefined;
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
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  sendSuccess(res, await listAdminCommissionPayouts({ role, since, until, q, limit, offset }));
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
  if (!isBankEntryCategory(parsed.data.category)) {
    throw new HttpError(422, "Select a valid category", "INVALID_CATEGORY");
  }
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const results = await createBankEntriesFromLines({
    tenantId,
    requestedBy: req.auth.sub,
    bankAccountId: parsed.data.bankAccountId,
    category: parsed.data.category,
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
  const tenantId = await resolveTenantId();
  sendSuccess(res, await getTenantSettings(tenantId));
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
    })
    .parse(req.body);
  const { patchTenantSettings } = await import("../tenants/tenantSettings.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  sendSuccess(res, await patchTenantSettings(tenantId, body), "Settings saved");
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
