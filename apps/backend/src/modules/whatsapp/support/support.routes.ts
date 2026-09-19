import { Router } from "express";
import { z } from "zod";
import { env } from "../../../config/env";
import { requireAuth } from "../../../middleware/auth.middleware";
import { requireRole } from "../../../middleware/rbac.middleware";
import { sendSuccess } from "../../../utils/apiResponse";
import { HttpError } from "../../../utils/httpError";
import {
  getConversation,
  listConversations,
  listMessages,
  markConversationRead,
} from "./support.service";

/**
 * Admin WhatsApp Support Inbox APIs.
 * Mount only when WHATSAPP_SUPPORT_ENABLED=true (see app.ts).
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
    sendSuccess(res, conversation);
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
    sendSuccess(res, { conversation, messages });
  },
);
