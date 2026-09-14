import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";

const TG_API = "https://api.telegram.org";

export function telegramBotToken(): string {
  const t = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!t) {
    throw new HttpError(503, "Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN.", "TELEGRAM_NOT_CONFIGURED");
  }
  return t;
}

export function telegramBotUsername(): string {
  return env.TELEGRAM_BOT_USERNAME.replace(/^@/, "").trim() || "AsanPayAuthBot";
}

export async function telegramSendMessage(chatId: string, text: string): Promise<void> {
  const token = telegramBotToken();
  const url = `${TG_API}/bot${token}/sendMessage`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    logger.error({ err, chatId }, "Telegram sendMessage network error");
    throw new HttpError(502, "Could not send Telegram message. Try again.", "TELEGRAM_NETWORK");
  }
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || body.ok === false) {
    logger.warn({ chatId, httpStatus: res.status, description: body.description }, "Telegram sendMessage failed");
    throw new HttpError(
      502,
      "Telegram could not deliver the OTP. Re-link Telegram in Account and try again.",
      "TELEGRAM_SEND_FAILED",
    );
  }
}

export async function telegramSetWebhookIfConfigured(): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN?.trim()) return;
  const publicBase = env.TELEGRAM_WEBHOOK_PUBLIC_URL?.replace(/\/$/, "");
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!publicBase || !secret) {
    logger.info("Telegram webhook not auto-set (need TELEGRAM_WEBHOOK_PUBLIC_URL + TELEGRAM_WEBHOOK_SECRET)");
    return;
  }
  const hookUrl = `${publicBase}/api/webhooks/telegram?token=${encodeURIComponent(secret)}`;
  try {
    const res = await fetch(`${TG_API}/bot${env.TELEGRAM_BOT_TOKEN.trim()}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: hookUrl, allowed_updates: ["message"] }),
    });
    const json = (await res.json()) as { ok?: boolean; description?: string };
    logger.info({ ok: json.ok, description: json.description }, "Telegram setWebhook");
  } catch (err) {
    logger.error({ err }, "Telegram setWebhook failed");
  }
}
