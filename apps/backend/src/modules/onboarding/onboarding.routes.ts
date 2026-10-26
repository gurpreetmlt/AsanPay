import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validateBody } from "../../middleware/validate";
import {
  nobleAgentKycSchema,
  nobleAgentOnboardSchema,
  nobleAgentStatusSchema,
  nobleAp2faSchema,
  nobleApKycSchema,
  nobleLoadAgentSchema,
} from "./nobleOnboarding.validators";
import {
  nobleAgentKycHandler,
  nobleAp2faHandler,
  nobleApKycHandler,
  nobleApLoadAgentHandler,
  nobleLoadAgentHandler,
  noblePrefill,
  nobleRevealIdentity,
  nobleSignup,
  nobleStatus,
  nobleStatusRecover,
  retiredOutletOnboarding,
} from "./onboarding.controller";

export const onboardingRouter = Router();

onboardingRouter.use(requireAuth);

onboardingRouter.all(["/instantpay", "/instantpay/*splat"], retiredOutletOnboarding);

// AEPS agent onboarding → uniqueAgentId (keys optional; mock when unset).
onboardingRouter.post(
  "/noble",
  requireRole("retailer"),
  validateBody(nobleAgentOnboardSchema),
  nobleSignup,
);
onboardingRouter.get("/noble/status", requireRole("retailer"), nobleStatus);
onboardingRouter.get("/noble/prefill", requireRole("retailer"), noblePrefill);
onboardingRouter.get("/noble/identity", requireRole("retailer"), nobleRevealIdentity);
onboardingRouter.post(
  "/noble/status",
  requireRole("retailer"),
  validateBody(nobleAgentStatusSchema),
  nobleStatusRecover,
);

// AEPS session gates (after uniqueAgentId is saved).
onboardingRouter.post(
  "/noble/aeps/load",
  requireRole("retailer"),
  validateBody(nobleLoadAgentSchema),
  nobleLoadAgentHandler,
);
onboardingRouter.post(
  "/noble/aeps/kyc",
  requireRole("retailer"),
  validateBody(nobleAgentKycSchema),
  nobleAgentKycHandler,
);

// Aadhaar Pay has its own merchant session: load → KYC (once) → daily 2FA, before /txn/aeps/aadhaar-pay.
onboardingRouter.post(
  "/noble/ap/load",
  requireRole("retailer"),
  validateBody(nobleLoadAgentSchema),
  nobleApLoadAgentHandler,
);
onboardingRouter.post("/noble/ap/kyc", requireRole("retailer"), validateBody(nobleApKycSchema), nobleApKycHandler);
onboardingRouter.post("/noble/ap/2fa", requireRole("retailer"), validateBody(nobleAp2faSchema), nobleAp2faHandler);
