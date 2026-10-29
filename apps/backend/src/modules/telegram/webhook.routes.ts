import { Router } from "express";
import { clientIp } from "../../middleware/rateLimiter";
import { HttpError } from "../../utils/httpError";
import { sendSuccess } from "../../utils/apiResponse";
import { logger } from "../../utils/logger";
import { isTestCallbackBody } from "../webhookKeys/webhookKeys.helpers";
import { checkCallbackToken, isWebhookAuthConfigured, recordWebhookDelivery } from "../webhookKeys/webhookKeys.service";
import { telegramSendMessage } from "./client";
import { bindTelegramFromStartPayload } from "./link.service";

export const telegramWebhookRouter = Router();

async function assertWebhookAuth(headerToken: string | undefined, queryToken: unknown, ip: string | null): Promise<string> {
  if (!(await isWebhookAuthConfigured("telegram"))) {
    throw new HttpError(
      503,
      "Telegram webhook is not configured. Generate a Telegram key in Admin → Webhooks & keys.",
      "TELEGRAM_WEBHOOK_NOT_CONFIGURED",
    );
  }
  const got = headerToken?.trim() || (typeof queryToken === "string" ? queryToken : "");
  const keyId = await checkCallbackToken("telegram", got, ip);
  if (!keyId) {
    throw new HttpError(
      401,
      "Invalid Telegram webhook secret. X-Telegram-Bot-Api-Secret-Token must match an active Telegram key.",
      "TELEGRAM_WEBHOOK_UNAUTHORIZED",
    );
  }
  return keyId;
}

type TgUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
};

telegramWebhookRouter.post("/", async (req, res) => {
  const ip = clientIp(req);
  const keyId = await assertWebhookAuth(req.header("x-telegram-bot-api-secret-token"), req.query.token, ip);
  if (isTestCallbackBody(req.body)) {
    recordWebhookDelivery({ provider: "telegram", keyId, result: "test", httpStatus: 200, ip });
    res.status(200).json({ status: 1, message: "Test callback received" });
    return;
  }
  recordWebhookDelivery({ provider: "telegram", keyId, result: "ok", httpStatus: 200, ip });
  const update = (req.body ?? {}) as TgUpdate;
  const chatId = update.message?.chat?.id != null ? String(update.message.chat.id) : "";
  const text = (update.message?.text ?? "").trim();

  // Always 200 quickly for Telegram retries — business errors go as chat replies.
  if (!chatId) {
    sendSuccess(res, { ok: true });
    return;
  }

  try {
    if (text.startsWith("/start")) {
      const payload = text.replace(/^\/start\s*/i, "").trim();
      const reply = await bindTelegramFromStartPayload(chatId, payload || "help");
      await telegramSendMessage(chatId, reply);
    } else {
      await telegramSendMessage(
        chatId,
        "AsanPay OTP bot. To link: open the AsanPay app → Account → Link Telegram.",
      );
    }
  } catch (err) {
    logger.error({ err, chatId }, "Telegram webhook handler error");
    try {
      await telegramSendMessage(chatId, "Something went wrong. Try a new link from AsanPay Account.");
    } catch {
      /* ignore */
    }
  }

  sendSuccess(res, { ok: true });
});
