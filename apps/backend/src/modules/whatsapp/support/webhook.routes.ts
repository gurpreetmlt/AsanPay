import { Router } from "express";
import { env } from "../../../config/env";
import { logger } from "../../../utils/logger";
import { processWhatsAppWebhookPayload } from "./support.service";

/**
 * Meta Cloud API webhook — always mounted so verify works before support UI is on.
 * Ingest runs regardless of WHATSAPP_SUPPORT_ENABLED (OTP stays independent).
 * Admin Inbox APIs are gated separately.
 */
export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.get("/", (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");
  const expected = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();

  if (!expected) {
    res.status(503).send("WhatsApp webhook verify token is not configured");
    return;
  }
  if (mode === "subscribe" && token === expected && challenge) {
    res.status(200).type("text/plain").send(challenge);
    return;
  }
  res.status(403).send("Forbidden");
});

whatsappWebhookRouter.post("/", (req, res) => {
  // Ack immediately — Meta retries on slow/4xx/5xx.
  res.status(200).json({ success: true });

  void processWhatsAppWebhookPayload(req.body).catch((err) => {
    logger.error({ err }, "WhatsApp webhook processing failed");
  });
});
