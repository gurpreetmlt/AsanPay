import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { env } from "./config/env";
import { pgPool } from "./db/postgres";
import { apiLimiter } from "./middleware/rateLimiter";
import { hardenRequest } from "./middleware/harden";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { redactUrlQuery } from "./utils/redact";
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
import { nobleRouter } from "./modules/providers/noble/noble.routes";
import { supportRouter } from "./modules/support/support.routes";
import { geoLinkRouter } from "./modules/geoLink/geoLink.routes";
import { linkedAccountsRouter } from "./modules/linkedAccounts/linkedAccounts.routes";
import { fundRequestRouter } from "./modules/fund-requests/fundRequest.routes";
import { bankingRouter } from "./modules/banking/banking.routes";
import { settlementRouter } from "./modules/settlements/settlement.routes";
import { floatRouter } from "./modules/float/float.routes";
import { promosRouter } from "./modules/promos/promos.routes";
import { vyaparapiWebhookRouter } from "./modules/providers/vyaparapi/webhook.routes";
import { nobleWebhookRouter } from "./modules/providers/noble/webhook.routes";
import { telegramWebhookRouter } from "./modules/telegram/webhook.routes";
import { whatsappRouter } from "./modules/whatsapp/whatsapp.routes";
import { whatsappWebhookRouter } from "./modules/whatsapp/support/webhook.routes";
import { whatsappSupportRouter } from "./modules/whatsapp/support/support.routes";
import { accountRouter } from "./modules/account/account.routes";

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
  // Body limits: 100kb by default. A prefix parser runs first and the default parser then skips the
  // already-parsed body, so only these paths accept more.
  // Base64 image / PDF payloads: KYC submit carries up to six ~2 MB data URLs; receipts/proofs ~4.5 MB.
  const largeJson = express.json({ limit: "12mb" });
  for (const prefix of [
    "/api/kyc",
    "/api/fund-requests",
    "/api/admin/bank-entries",
    "/api/admin/promos",
  ]) {
    app.use(prefix, largeJson);
  }
  // Bulk imports (bank statements up to 500 lines, commission rules up to 1000 rows) and profile photos (≤ 600 KB).
  const bulkJson = express.json({ limit: "2mb" });
  for (const prefix of ["/api/banking/statements", "/api/admin/commission/rules/import", "/api/account/photo"]) {
    app.use(prefix, bulkJson);
  }
  // Meta signs the exact bytes it sent, so keep them for X-Hub-Signature-256 verification.
  app.use(
    "/api/whatsapp/webhook",
    express.json({
      limit: "512kb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use("/api/webhooks/noble", express.json({ limit: "64kb" }), express.urlencoded({ extended: true, limit: "64kb" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));
  app.use(hardenRequest);
  // Same as morgan's "dev" / "combined" formats, but with credential-like query params redacted.
  morgan.token("safe-url", (req) => redactUrlQuery((req as express.Request).originalUrl || req.url || ""));
  app.use(
    morgan(
      env.NODE_ENV === "development"
        ? ":method :safe-url :status :response-time ms - :res[content-length]"
        : ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
    ),
  );
  app.use(apiLimiter);

  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", timestamp: new Date().toISOString() } });
  });

  // Readiness: the API is only useful when Postgres answers. /health stays a pure liveness check.
  app.get("/ready", async (_req, res) => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        pgPool.query("SELECT 1"),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Database check timed out after 3s")), 3000);
        }),
      ]);
      res.json({ ok: true });
    } catch (err) {
      res.status(503).json({
        ok: false,
        message: err instanceof Error && /timed out/.test(err.message)
          ? "Database did not answer within 3 seconds"
          : "Database is unreachable",
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // Only promo banners are public. KYC images (uploads/kyc) are served solely through the
  // authenticated /api/kyc/documents/:docKey (owner) and /api/admin/users/:id/kyc-documents/:docKey routes.
  app.use("/uploads/promos", express.static(path.join(process.cwd(), "uploads", "promos")));

  app.use("/api", accountRouter);
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
  app.use("/api/noble", nobleRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/geo-link", geoLinkRouter);
  app.use("/api/linked-accounts", linkedAccountsRouter);
  app.use("/api/fund-requests", fundRequestRouter);
  app.use("/api/banking", bankingRouter);
  app.use("/api/settlements", settlementRouter);
  app.use("/api/float", floatRouter);
  app.use("/api/promos", promosRouter);
  app.use("/api/webhooks/vyaparapi", vyaparapiWebhookRouter);
  app.use("/api/webhooks/noble", nobleWebhookRouter);
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
