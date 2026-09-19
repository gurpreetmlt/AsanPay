import { Router } from "express";
import { z } from "zod";
import { env } from "../../../config/env";
import { requireAuth } from "../../../middleware/auth.middleware";
import { requireRole } from "../../../middleware/rbac.middleware";
import { sendSuccess } from "../../../utils/apiResponse";
import { HttpError } from "../../../utils/httpError";
import {
  getConversation,
  isCustomerWindowOpen,
  listConversations,
  listMessages,
  markConversationRead,
  replyToConversation,
  windowClosesAt,
} from "./support.service";

/**
 * Admin WhatsApp Support Inbox APIs.
 * Conversation routes 503 when WHATSAPP_SUPPORT_ENABLED is false.
 */
export const whatsappSupportRouter = Router();

function assertSupportEnabled(): void {
  if (!env.WHATSAPP_SUPPORT_ENABLED) {
    throw new HttpError(503, "WhatsApp Support is disabled", "WHATSAPP_SUPPORT_DISABLED");
  }
}

whatsappSupportRouter.get("/config", requireAuth, requireRole("admin"), (_req, res) => {
  sendSuccess(res, {
    enabled: env.WHATSAPP_SUPPORT_ENABLED,
    webhookConfigured: Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()),
    supportTemplateName: env.WHATSAPP_SUPPORT_TEMPLATE_NAME?.trim() || null,
    supportTemplateLanguage: env.WHATSAPP_SUPPORT_TEMPLATE_LANGUAGE || "en",
  });
});

whatsappSupportRouter.get("/conversations", requireAuth, requireRole("admin"), async (req, res) => {
  assertSupportEnabled();
  const limit = z.coerce.number().int().min(1).max(100).optional().parse(req.query.limit);
  sendSuccess(res, await listConversations(limit ?? 50));
});

whatsappSupportRouter.get(
  "/conversations/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    assertSupportEnabled();
    const id = z.string().uuid().parse(req.params.id);
    const conversation = await getConversation(id);
    if (!conversation) {
      throw new HttpError(404, "Conversation not found", "WHATSAPP_CONVERSATION_NOT_FOUND");
    }
    sendSuccess(res, {
      ...conversation,
      windowOpen: isCustomerWindowOpen(conversation.lastInboundAt),
      windowClosesAt: windowClosesAt(conversation.lastInboundAt)?.toISOString() ?? null,
    });
  },
);

whatsappSupportRouter.get(
  "/conversations/:id/messages",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    assertSupportEnabled();
    const id = z.string().uuid().parse(req.params.id);
    const conversation = await getConversation(id);
    if (!conversation) {
      throw new HttpError(404, "Conversation not found", "WHATSAPP_CONVERSATION_NOT_FOUND");
    }
    const limit = z.coerce.number().int().min(1).max(200).optional().parse(req.query.limit);
    const messages = await listMessages(id, limit ?? 100);
    await markConversationRead(id);
    sendSuccess(res, {
      conversation: {
        ...conversation,
        windowOpen: isCustomerWindowOpen(conversation.lastInboundAt),
        windowClosesAt: windowClosesAt(conversation.lastInboundAt)?.toISOString() ?? null,
      },
      messages,
    });
  },
);

const replySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(4096, "Message must be at most 4096 characters"),
  useTemplate: z.boolean().optional(),
  templateName: z.string().trim().min(1).max(120).optional(),
});

whatsappSupportRouter.post(
  "/conversations/:id/reply",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    assertSupportEnabled();
    const id = z.string().uuid().parse(req.params.id);
    const body = replySchema.parse(req.body ?? {});
    const result = await replyToConversation({
      conversationId: id,
      text: body.text,
      useTemplate: body.useTemplate,
      templateName: body.templateName,
    });
    sendSuccess(res, result, "Message sent");
  },
);
