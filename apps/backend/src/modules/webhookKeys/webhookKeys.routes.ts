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
  listWebhookKeys,
  revealWebhookKey,
  rotateWebhookKey,
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

function adminId(req: Request): string {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  return req.auth.sub;
}

function context(req: Request): AdminContext {
  return { ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

const keyIdSchema = z.string().uuid("Webhook key id is not valid. Refresh the list and try again.");

const createSchema = z.object({
  provider: z.enum(WEBHOOK_PROVIDERS, {
    message: "Select a provider: Noble, VyaparAPI, Telegram or WhatsApp",
  }),
  name: z
    .string({ message: "Enter a name / purpose for this key" })
    .trim()
    .min(2, "Name / purpose must be at least 2 characters")
    .max(120, "Name / purpose must be at most 120 characters"),
  notes: z.string().trim().max(300, "Notes must be at most 300 characters").optional().nullable(),
  secret: z
    .string()
    .trim()
    .min(PASTED_SECRET_MIN, `Pasted key must be at least ${PASTED_SECRET_MIN} characters`)
    .max(PASTED_SECRET_MAX, `Pasted key must be at most ${PASTED_SECRET_MAX} characters`)
    .regex(/^\S+$/, "Pasted key must not contain spaces")
    .optional()
    .nullable(),
});

webhookKeysAdminRouter.get("/", async (_req, res) => {
  sendSuccess(res, await listWebhookKeys());
});

webhookKeysAdminRouter.post("/", async (req, res) => {
  const body = createSchema.parse(req.body ?? {});
  sendSuccess(res, await createWebhookKey(adminId(req), body, context(req)), "Callback key created");
});

webhookKeysAdminRouter.post("/:id/reveal", revealLimiter, async (req, res) => {
  const id = keyIdSchema.parse(req.params.id);
  const { totpCode } = z
    .object({
      totpCode: z
        .string({ message: "Enter the 6-digit code from your authenticator app" })
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
    })
    .parse(req.body ?? {});
  sendSuccess(res, await revealWebhookKey(adminId(req), id, totpCode, context(req)));
});

webhookKeysAdminRouter.post("/:id/rotate", async (req, res) => {
  const id = keyIdSchema.parse(req.params.id);
  sendSuccess(res, await rotateWebhookKey(adminId(req), id, context(req)), "New key created. The old key works for 24 hours.");
});

webhookKeysAdminRouter.post("/:id/disable", async (req, res) => {
  const id = keyIdSchema.parse(req.params.id);
  const { reason } = z
    .object({ reason: z.string().trim().max(300, "Reason must be at most 300 characters").optional().nullable() })
    .parse(req.body ?? {});
  sendSuccess(res, await disableWebhookKey(adminId(req), id, reason || null, context(req)), "Key disabled");
});
