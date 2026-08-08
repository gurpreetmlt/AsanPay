import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { KYC_STATUSES, TRANSACTION_STATUSES, USER_ROLES } from "@asanpay/shared-types";
import {
  getAdminStats,
  listAdminUsers,
  getAdminUserDetail,
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
