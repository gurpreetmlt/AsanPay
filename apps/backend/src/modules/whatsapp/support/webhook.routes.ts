import { createHmac } from "node:crypto";
import { Router, type Request } from "express";
import { env } from "../../../config/env";
import { logger } from "../../../utils/logger";
import { safeEqual } from "../../../utils/safeEqual";
import { getWebhookSecrets, isWebhookAuthConfigured, recordWebhookKeyUse } from "../../webhookKeys/webhookKeys.service";
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

whatsappWebhookRouter.post("/", async (req, res) => {
  if (!(await isWebhookAuthConfigured("whatsapp"))) {
    if (env.NODE_ENV === "production") {
      res.status(503).json({
        success: false,
        message: "WhatsApp webhook is not configured. Add the Meta App Secret in Admin → Webhooks & keys to accept events.",
        code: "WHATSAPP_WEBHOOK_NOT_CONFIGURED",
      });
      return;
    }
  } else {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = req.header("x-hub-signature-256");
    let matchedId: string | null = null;
    for (const { id, secret } of await getWebhookSecrets("whatsapp")) {
      if (isValidMetaSignature(rawBody, signature, secret) && matchedId == null) matchedId = id;
    }
    if (matchedId == null) {
      logger.warn({ ip: req.ip, hasSignature: Boolean(signature) }, "WhatsApp webhook signature rejected");
      res.status(401).json({
        success: false,
        message: "Invalid X-Hub-Signature-256. Check the WhatsApp key in Admin → Webhooks & keys matches the Meta app secret.",
        code: "WHATSAPP_WEBHOOK_UNAUTHORIZED",
      });
      return;
    }
    recordWebhookKeyUse(matchedId);
  }

  // Ack immediately — Meta retries on slow/4xx/5xx.
  res.status(200).json({ success: true });

  void processWhatsAppWebhookPayload(req.body).catch((err) => {
    logger.error({ err }, "WhatsApp webhook processing failed");
  });
});
