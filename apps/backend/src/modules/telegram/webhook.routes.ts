import { Router } from "express";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { sendSuccess } from "../../utils/apiResponse";
import { logger } from "../../utils/logger";
import { safeEqual } from "../../utils/safeEqual";
import { telegramSendMessage } from "./client";
import { bindTelegramFromStartPayload } from "./link.service";

export const telegramWebhookRouter = Router();

function assertWebhookAuth(headerToken: string | undefined, queryToken: unknown): void {
  const expected = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    throw new HttpError(
      503,
      "Telegram webhook is not configured. Set TELEGRAM_WEBHOOK_SECRET on the backend.",
      "TELEGRAM_WEBHOOK_NOT_CONFIGURED",
    );
  }
  const got = headerToken?.trim() || (typeof queryToken === "string" ? queryToken : "");
  if (!safeEqual(got, expected)) {
    throw new HttpError(
      401,
      "Invalid Telegram webhook secret. X-Telegram-Bot-Api-Secret-Token must match TELEGRAM_WEBHOOK_SECRET.",
      "TELEGRAM_WEBHOOK_UNAUTHORIZED",
    );
  }
}

type TgUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
};

telegramWebhookRouter.post("/", async (req, res) => {
  assertWebhookAuth(req.header("x-telegram-bot-api-secret-token"), req.query.token);
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
