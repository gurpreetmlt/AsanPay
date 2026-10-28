import { createHmac } from "node:crypto";
import { Router, type Request } from "express";
import { env } from "../../../config/env";
import { logger } from "../../../utils/logger";
import { safeEqual } from "../../../utils/safeEqual";
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
  if (mode === "subscribe" && safeEqual(token, expected) && challenge) {
    res.status(200).type("text/plain").send(challenge);
    return;
  }
  res.status(403).send("Forbidden");
});

/** Meta signs the exact bytes it sent: `X-Hub-Signature-256: sha256=<hex HMAC of raw body>`. */
function isValidMetaSignature(rawBody: Buffer | undefined, header: string | undefined, secret: string): boolean {
  if (!rawBody || !header) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(header.trim());
  if (!match) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(match[1]!.toLowerCase(), expected);
}

whatsappWebhookRouter.post("/", (req, res) => {
  const secret = env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) {
    if (env.NODE_ENV === "production") {
      res.status(503).json({
        success: false,
        message: "WhatsApp webhook is not configured. Set WHATSAPP_APP_SECRET on the backend to accept events.",
        code: "WHATSAPP_WEBHOOK_NOT_CONFIGURED",
      });
      return;
    }
  } else {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!isValidMetaSignature(rawBody, req.header("x-hub-signature-256"), secret)) {
      logger.warn({ ip: req.ip, hasSignature: Boolean(req.header("x-hub-signature-256")) }, "WhatsApp webhook signature rejected");
      res.status(401).json({
        success: false,
        message: "Invalid X-Hub-Signature-256. Check WHATSAPP_APP_SECRET matches the Meta app secret.",
        code: "WHATSAPP_WEBHOOK_UNAUTHORIZED",
      });
      return;
    }
  }

  // Ack immediately — Meta retries on slow/4xx/5xx.
  res.status(200).json({ success: true });

  void processWhatsAppWebhookPayload(req.body).catch((err) => {
    logger.error({ err }, "WhatsApp webhook processing failed");
  });
});
