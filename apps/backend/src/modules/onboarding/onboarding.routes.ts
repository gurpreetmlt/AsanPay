import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validateBody } from "../../middleware/validate";
import {
  bioKycStatusSchema,
  bioKycSubmitSchema,
  merchantListSchema,
  minKycSignupSchema,
  mobileChangeInitiateSchema,
  mobileChangeVerifySchema,
} from "./onboarding.validators";
import {
  nobleAgentKycSchema,
  nobleAgentOnboardSchema,
  nobleAgentStatusSchema,
  nobleLoadAgentSchema,
} from "./nobleOnboarding.validators";
import {
  instantpayBioKycStatus,
  instantpayBioKycSubmit,
  instantpayMerchantList,
  instantpayMobileChangeInitiate,
  instantpayMobileChangeVerify,
  instantpaySignup,
  instantpayStatus,
  nobleAgentKycHandler,
  nobleLoadAgentHandler,
  nobleSignup,
  nobleStatus,
  nobleStatusRecover,
} from "./onboarding.controller";

export const onboardingRouter = Router();

onboardingRouter.use(requireAuth);

// Retailer registers/updates THEIR OWN outlet on InstantPay (min-KYC signup).
onboardingRouter.post(
  "/instantpay",
  requireRole("retailer"),
  validateBody(minKycSignupSchema),
  instantpaySignup,
);
onboardingRouter.get("/instantpay/status", requireRole("retailer"), instantpayStatus);

// Bank-side biometric eKYC status per rail (DMI = DMT, WAP = AePS). Poll while
// PENDING/APPROVAL_PENDING; APPROVED = outlet can transact on that rail.
onboardingRouter.post(
  "/instantpay/bio-kyc-status",
  requireRole("retailer"),
  validateBody(bioKycStatusSchema),
  instantpayBioKycStatus,
);

// Merchant's own Aadhaar fingerprint eKYC (capture with pidOptionWadh from status API).
onboardingRouter.post(
  "/instantpay/bio-kyc",
  requireRole("retailer"),
  validateBody(bioKycSubmitSchema),
  instantpayBioKycSubmit,
);

// Outlet mobile change — initiate sends OTPs to both existing and new numbers.
onboardingRouter.post(
  "/instantpay/mobile-change",
  requireRole("retailer"),
  validateBody(mobileChangeInitiateSchema),
  instantpayMobileChangeInitiate,
);
onboardingRouter.post(
  "/instantpay/mobile-change/verify",
  requireRole("retailer"),
  validateBody(mobileChangeVerifySchema),
  instantpayMobileChangeVerify,
);

// Partner-wide onboarded-merchant directory (wapStatus = bank AePS enablement). Admin only.
onboardingRouter.post(
  "/instantpay/merchants",
  requireRole("admin"),
  validateBody(merchantListSchema),
  instantpayMerchantList,
);

// Noble Web Studio AEPS agent onboarding → uniqueAgentId (keys optional; mock when unset).
onboardingRouter.post(
  "/noble",
  requireRole("retailer"),
  validateBody(nobleAgentOnboardSchema),
  nobleSignup,
);
onboardingRouter.get("/noble/status", requireRole("retailer"), nobleStatus);
onboardingRouter.post(
  "/noble/status",
  requireRole("retailer"),
  validateBody(nobleAgentStatusSchema),
  nobleStatusRecover,
);

// Noble AEPS session gates (after uniqueAgentId is saved).
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
