import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../db/postgres";
import { telegramLinkTokens, users } from "../../db/postgres/schema";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { telegramBotUsername, telegramSendMessage } from "./client";

const LINK_TTL_MS = 15 * 60 * 1000;

export function otpDeliveryChannels(): string[] {
  return env.OTP_DELIVERY.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function wantsTelegramOtp(): boolean {
  return otpDeliveryChannels().includes("telegram");
}

export async function createTelegramLinkDeepLink(userId: string): Promise<{
  deepLink: string;
  expiresInSeconds: number;
}> {
  if (!env.TELEGRAM_BOT_TOKEN?.trim()) {
    throw new HttpError(503, "Telegram bot is not configured", "TELEGRAM_NOT_CONFIGURED");
  }
  const token = randomBytes(16).toString("hex"); // 32 chars — fits Telegram start payload
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await db.insert(telegramLinkTokens).values({ token, userId, expiresAt });
  const deepLink = `https://t.me/${telegramBotUsername()}?start=link_${token}`;
  return { deepLink, expiresInSeconds: LINK_TTL_MS / 1000 };
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await db.update(users).set({ telegramChatId: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

/** Handle /start link_<token> from Telegram webhook. */
export async function bindTelegramFromStartPayload(
  chatId: string,
  startPayload: string,
): Promise<string> {
  const raw = startPayload.trim();
  if (!raw.startsWith("link_")) {
    return "Open AsanPay → Account → Link Telegram, then use the link from the app.";
  }
  const token = raw.slice("link_".length);
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    return "Invalid link. Open AsanPay → Account → Link Telegram for a new link.";
  }

  const [row] = await db
    .select()
    .from(telegramLinkTokens)
    .where(and(eq(telegramLinkTokens.token, token), gt(telegramLinkTokens.expiresAt, new Date())));
  if (!row) {
    return "This link has expired. Open AsanPay → Account → Link Telegram for a new link.";
  }

  // Free this chat from any other user, then bind.
  await db
    .update(users)
    .set({ telegramChatId: null, updatedAt: new Date() })
    .where(eq(users.telegramChatId, chatId));
  await db
    .update(users)
    .set({ telegramChatId: chatId, updatedAt: new Date() })
    .where(eq(users.id, row.userId));
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.token, token));

  logger.info({ userId: row.userId, chatId }, "Telegram linked");
  return "AsanPay linked. You will receive login OTPs here. You can close this chat.";
}

/**
 * Deliver login OTP. Returns whether Telegram was used.
 * Throws TELEGRAM_NOT_LINKED when telegram channel is required and chat id missing.
 */
export async function deliverLoginOtp(params: {
  userId: string;
  mobile: string;
  otp: string;
  telegramChatId: string | null;
}): Promise<{ viaTelegram: boolean }> {
  const channels = otpDeliveryChannels();
  const preferTelegram = channels.includes("telegram");

  if (preferTelegram && params.telegramChatId) {
    await telegramSendMessage(
      params.telegramChatId,
      `AsanPay login OTP: ${params.otp}\nValid for 15 minutes. Do not share this code.`,
    );
    return { viaTelegram: true };
  }

  if (preferTelegram && !params.telegramChatId) {
    // Still allow test overrides / expose path for listed numbers — caller handles expose.
    const hasTestOverride = Boolean(
      env.TEST_OTP_OVERRIDES &&
        (env.TEST_OTP_OVERRIDES.includes("*:") || env.TEST_OTP_OVERRIDES.includes(params.mobile)),
    );
    if (!hasTestOverride) {
      throw new HttpError(
        422,
        "Telegram is not linked. Log in with password, then open Account → Link Telegram.",
        "TELEGRAM_NOT_LINKED",
      );
    }
  }

  return { viaTelegram: false };
}

export async function getTelegramLinkStatus(userId: string): Promise<{ linked: boolean }> {
  const [row] = await db
    .select({ telegramChatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, userId));
  return { linked: Boolean(row?.telegramChatId) };
}
