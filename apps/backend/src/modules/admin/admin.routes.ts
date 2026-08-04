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
  reassignUserParent,
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
const schemeRoleEnum = z.enum(["retailer", "distributor", "master_distributor"]);
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

/** Customer fee schedule (service_charges). Read-only in this task — admin UI / write later. */
adminRouter.get("/service-charges", async (req, res) => {
  const { listServiceCharges } = await import("../service-charges/serviceCharge.service");
  const serviceId = typeof req.query.serviceId === "string" ? req.query.serviceId : undefined;
  const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
  sendSuccess(res, await listServiceCharges({ serviceId, activeOnly }));
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
    })
    .parse(req.body);
  const { patchTenantSettings } = await import("../tenants/tenantSettings.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  sendSuccess(res, await patchTenantSettings(tenantId, body), "Settings saved");
});
