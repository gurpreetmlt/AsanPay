import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { env } from "./config/env";
import { apiLimiter } from "./middleware/rateLimiter";
import { hardenRequest } from "./middleware/harden";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { walletRouter } from "./modules/wallet/wallet.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { usersRouter } from "./modules/users/users.routes";
import { inviteRouter } from "./modules/invites/invite.routes";
import { txnRouter } from "./modules/transactions/txn.routes";
import { kycRouter } from "./modules/kyc/kyc.routes";
import { agentDeviceRouter } from "./modules/devices/agentDevice.routes";
import { deviceRepairRouter } from "./modules/devices/deviceRepair.routes";
import { disputeRouter } from "./modules/disputes/dispute.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { earningsRouter } from "./modules/earnings/earnings.routes";
import { onboardingRouter } from "./modules/onboarding/onboarding.routes";
import { supportRouter } from "./modules/support/support.routes";
import { fundRequestRouter } from "./modules/fund-requests/fundRequest.routes";
import { bankingRouter } from "./modules/banking/banking.routes";
import { settlementRouter } from "./modules/settlements/settlement.routes";
import { floatRouter } from "./modules/float/float.routes";
import { promosRouter } from "./modules/promos/promos.routes";
import { vyaparapiWebhookRouter } from "./modules/providers/vyaparapi/webhook.routes";
import { telegramWebhookRouter } from "./modules/telegram/webhook.routes";
import { whatsappRouter } from "./modules/whatsapp/whatsapp.routes";
import { whatsappWebhookRouter } from "./modules/whatsapp/support/webhook.routes";
import { whatsappSupportRouter } from "./modules/whatsapp/support/support.routes";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:", "http:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
  // CORS_ORIGIN is a comma-separated list — multiple web portals (retailer/partner/admin/web)
  // each run on their own subdomain and all need to call this one backend.
  const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      // Preview/dev tooling assigns whatever port is free, so in development we allow any
      // localhost origin rather than a single hardcoded port. Production checks against the list.
      origin:
        env.NODE_ENV === "development"
          ? /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/
          : (origin, callback) => {
              // No Origin header (server-to-server, mobile app, curl) — allow.
              if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
              callback(null, false);
            },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(hardenRequest);
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
  app.use(apiLimiter);

  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", timestamp: new Date().toISOString() } });
  });

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.use("/api/auth", authRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/invites", inviteRouter);
  app.use("/api/txn", txnRouter);
  app.use("/api/kyc", kycRouter);
  app.use("/api/devices", agentDeviceRouter);
  app.use("/api/device-repair-requests", deviceRepairRouter);
  app.use("/api/disputes", disputeRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/earnings", earningsRouter);
  app.use("/api/onboarding", onboardingRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/fund-requests", fundRequestRouter);
  app.use("/api/banking", bankingRouter);
  app.use("/api/settlements", settlementRouter);
  app.use("/api/float", floatRouter);
  app.use("/api/promos", promosRouter);
  app.use("/api/webhooks/vyaparapi", vyaparapiWebhookRouter);
  app.use("/api/webhooks/telegram", telegramWebhookRouter);
  app.use("/api/whatsapp/webhook", whatsappWebhookRouter);
  app.use("/api/whatsapp", whatsappRouter);
  // Support APIs always registered; conversation routes 503 when flag is off.
  // Config endpoint stays reachable so Admin can hide/show the nav.
  app.use("/api/whatsapp/support", whatsappSupportRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
