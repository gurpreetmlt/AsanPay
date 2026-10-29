import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { clientIp } from "../../middleware/rateLimiter";
import { requireRole } from "../../middleware/rbac.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { PASTED_SECRET_MAX, PASTED_SECRET_MIN, WEBHOOK_PROVIDERS } from "./webhookKeys.helpers";
import {
  createWebhookKey,
  disableWebhookKey,
  listKeyDeliveries,
  listRejectedDeliveries,
  listWebhookKeys,
  rejectionSummary,
  revealWebhookKey,
  rotateWebhookKey,
  sendTestCallback,
  type AdminContext,
} from "./webhookKeys.service";

export const webhookKeysAdminRouter = Router();

webhookKeysAdminRouter.use(requireAuth, requireRole("admin"));

const revealLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many key views. Wait 15 minutes and try again." },
  keyGenerator: (req) => `webhook-key-reveal:${req.auth?.sub ?? clientIp(req)}`,
  validate: { trustProxy: true, xForwardedForHeader: false },
});

const manageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many key changes. Wait 15 minutes and try again." },
  keyGenerator: (req) => `webhook-key-manage:${req.auth?.sub ?? clientIp(req)}`,
  validate: { trustProxy: true, xForwardedForHeader: false },
});

const testLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many test callbacks. Wait 10 minutes and try again." },
  keyGenerator: (req) => `webhook-key-test:${req.auth?.sub ?? clientIp(req)}`,
  validate: { trustProxy: true, xForwardedForHeader: false },
});

function adminId(req: Request): string {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  return req.auth.sub;
}

function context(req: Request): AdminContext {
  return { ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

const keyIdSchema = z.string().uuid("Webhook key id is not valid. Refresh the list and try again.");

const totpCodeSchema = z
  .string({ message: "Enter the 6-digit code from your authenticator app" })
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");

const providerSchema = z.enum(WEBHOOK_PROVIDERS, {
  message: "Select a provider: Noble, VyaparAPI, Telegram or WhatsApp",
});

const createSchema = z.object({
  provider: providerSchema,
  name: z
    .string({ message: "Enter a name / purpose for this key" })
    .trim()
    .min(2, "Name / purpose must be at least 2 characters")
    .max(120, "Name / purpose must be at most 120 characters"),
  notes: z.string().trim().max(300, "Notes must be at most 300 characters").optional().nullable(),
  services: z
    .array(z.string({ message: "Each service must be text" }), { message: "Services must be a list" })
    .min(1, "Select at least one service for this key")
    .max(10, "Select at most 10 services")
    .optional(),
  secret: z
    .string()
    .trim()
    .min(PASTED_SECRET_MIN, `Pasted key must be at least ${PASTED_SECRET_MIN} characters`)
    .max(PASTED_SECRET_MAX, `Pasted key must be at most ${PASTED_SECRET_MAX} characters`)
    .regex(/^\S+$/, "Pasted key must not contain spaces")
    .optional()
    .nullable(),
  totpCode: totpCodeSchema,
});

const limitSchema = z.coerce
  .number({ message: "limit must be a number" })
  .int("limit must be a whole number")
  .min(1, "limit must be at least 1")
  .max(100, "limit must be at most 100")
  .default(20);

webhookKeysAdminRouter.get("/", async (_req, res) => {
  sendSuccess(res, await listWebhookKeys());
});

webhookKeysAdminRouter.get("/deliveries", async (req, res) => {
  const { provider, limit } = z.object({ provider: providerSchema, limit: limitSchema }).parse(req.query);
  sendSuccess(res, await listRejectedDeliveries(provider, limit));
});

webhookKeysAdminRouter.get("/deliveries/summary", async (_req, res) => {
  sendSuccess(res, await rejectionSummary());
});

webhookKeysAdminRouter.post("/", manageLimiter, async (req, res) => {
  const body = createSchema.parse(req.body ?? {});
  sendSuccess(res, await createWebhookKey(adminId(req), body, context(req)), "Callback key created");
});

webhookKeysAdminRouter.get("/:id/deliveries", async (req, res) => {
  const id = keyIdSchema.parse(req.params.id);
  const { limit } = z.object({ limit: limitSchema }).parse(req.query);
  sendSuccess(res, await listKeyDeliveries(id, limit));
});

webhookKeysAdminRouter.post("/:id/reveal", revealLimiter, async (req, res) => {
  const id = keyIdSchema.parse(req.params.id);
  const { totpCode } = z.object({ totpCode: totpCodeSchema }).parse(req.body ?? {});
  sendSuccess(res, await revealWebhookKey(adminId(req), id, totpCode, context(req)));
});

webhookKeysAdminRouter.post("/:id/rotate", manageLimiter, async (req, res) => {
  const id = keyIdSchema.parse(req.params.id);
  const { totpCode } = z.object({ totpCode: totpCodeSchema }).parse(req.body ?? {});
  sendSuccess(
    res,
    await rotateWebhookKey(adminId(req), id, totpCode, context(req)),
    "New key created. The old key works for 24 hours.",
  );
});

webhookKeysAdminRouter.post("/:id/disable", manageLimiter, async (req, res) => {
  const id = keyIdSchema.parse(req.params.id);
  const body = z
    .object({
      reason: z
        .string({ message: "Enter a reason for disabling this key" })
        .trim()
        .min(3, "Reason must be at least 3 characters")
        .max(200, "Reason must be at most 200 characters"),
      totpCode: totpCodeSchema,
    })
    .parse(req.body ?? {});
  sendSuccess(res, await disableWebhookKey(adminId(req), id, body, context(req)), "Key disabled");
});

webhookKeysAdminRouter.post("/:id/test", testLimiter, async (req, res) => {
  const id = keyIdSchema.parse(req.params.id);
  sendSuccess(res, await sendTestCallback(adminId(req), id, context(req)));
});
