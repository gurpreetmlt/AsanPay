import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { requireIdempotencyKey } from "../../middleware/idempotency.middleware";
import { validateBody } from "../../middleware/validate";
import { walletTxnLimiter } from "../../middleware/rateLimiter";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { paiseToRupees, rupeesToPaise } from "../../core/money";
import { resolveTenantId } from "../fund-requests/tenant";
import {
  confirmFloatTransfer,
  createFloatRoute,
  initiateFloatTransfer,
  listFloatRoutes,
  listFloatTransfers,
  listProvidersForFloat,
  setFloatRouteActive,
} from "./float.service";
import {
  confirmFloatTransferSchema,
  createFloatRouteSchema,
  initiateFloatTransferSchema,
} from "./float.validators";

export const floatRouter = Router();

floatRouter.use(requireAuth);
floatRouter.use(requireRole("admin"));

floatRouter.get("/routes", async (_req, res) => {
  const tenantId = await resolveTenantId();
  sendSuccess(res, await listFloatRoutes(tenantId));
});

floatRouter.get("/providers", async (_req, res) => {
  sendSuccess(res, await listProvidersForFloat());
});

floatRouter.post("/routes", validateBody(createFloatRouteSchema), async (req, res) => {
  const body = req.body as ReturnType<typeof createFloatRouteSchema.parse>;
  const tenantId = await resolveTenantId();
  const result = await createFloatRoute({
    tenantId,
    fromBankId: body.fromBankId,
    toProviderId: body.toProviderId,
    beneficiaryName: body.beneficiaryName,
    beneficiaryAccount: body.beneficiaryAccount,
    beneficiaryIfsc: body.beneficiaryIfsc,
    transferMode: body.transferMode,
    minAmount: body.minAmount,
    maxAmount: body.maxAmount,
    priority: body.priority,
  });
  sendSuccess(res, { routeId: String(result.routeId) }, "Float route created", 201);
});

floatRouter.patch("/routes/:id/active", async (req, res) => {
  const tenantId = await resolveTenantId();
  const isActive = req.body?.isActive === true || req.body?.isActive === "true";
  await setFloatRouteActive({
    tenantId,
    routeId: String(req.params.id),
    isActive,
  });
  sendSuccess(res, { isActive }, isActive ? "Float route activated" : "Float route deactivated");
});

floatRouter.get("/transfers", async (req, res) => {
  const tenantId = await resolveTenantId();
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  sendSuccess(res, await listFloatTransfers(tenantId, Number.isFinite(limit) ? limit : 50));
});

floatRouter.post(
  "/transfers",
  walletTxnLimiter,
  requireIdempotencyKey,
  validateBody(initiateFloatTransferSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof initiateFloatTransferSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await initiateFloatTransfer({
      tenantId,
      routeId: body.routeId,
      amount: rupeesToPaise(body.amount),
      adminId: req.auth.sub,
      bankUtr: body.bankUtr,
    });
    sendSuccess(
      res,
      {
        transferId: String(result.transferId),
        transitJournalId: String(result.transitJournalId),
        amount: paiseToRupees(rupeesToPaise(body.amount)),
      },
      "Float transfer initiated (in transit)",
      201,
    );
  },
);

floatRouter.post(
  "/transfers/:id/confirm",
  walletTxnLimiter,
  requireIdempotencyKey,
  validateBody(confirmFloatTransferSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as ReturnType<typeof confirmFloatTransferSchema.parse>;
    const tenantId = await resolveTenantId();
    const result = await confirmFloatTransfer({
      tenantId,
      transferId: String(req.params.id),
      adminId: req.auth.sub,
      bankUtr: body.bankUtr,
    });
    sendSuccess(
      res,
      { confirmJournalId: String(result.confirmJournalId) },
      "Float transfer confirmed",
    );
  },
);
