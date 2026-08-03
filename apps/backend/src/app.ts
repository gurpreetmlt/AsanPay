import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { apiLimiter } from "./middleware/rateLimiter";
import { hardenRequest } from "./middleware/harden";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { walletRouter } from "./modules/wallet/wallet.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { usersRouter } from "./modules/users/users.routes";
import { txnRouter } from "./modules/transactions/txn.routes";
import { kycRouter } from "./modules/kyc/kyc.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { onboardingRouter } from "./modules/onboarding/onboarding.routes";
import { supportRouter } from "./modules/support/support.routes";
import { fundRequestRouter } from "./modules/fund-requests/fundRequest.routes";
import { bankingRouter } from "./modules/banking/banking.routes";
import { settlementRouter } from "./modules/settlements/settlement.routes";
import { floatRouter } from "./modules/float/float.routes";

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
          imgSrc: ["'self'", "data:"],
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
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(hardenRequest);
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
  app.use(apiLimiter);

  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", timestamp: new Date().toISOString() } });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/txn", txnRouter);
  app.use("/api/kyc", kycRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/onboarding", onboardingRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/fund-requests", fundRequestRouter);
  app.use("/api/banking", bankingRouter);
  app.use("/api/settlements", settlementRouter);
  app.use("/api/float", floatRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
