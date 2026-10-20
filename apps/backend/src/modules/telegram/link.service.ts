import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../db/postgres";
import { telegramLinkTokens, users } from "../../db/postgres/schema";
import { env, getTestOtpOverride, getTestSignupOtpOverride } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { telegramBotUsername, telegramSendMessage } from "./client";
import { sendWhatsAppOtp } from "../whatsapp/whatsapp.service";

const LINK_TTL_MS = 15 * 60 * 1000;

export function otpDeliveryChannels(): string[] {
  return env.OTP_DELIVERY.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function wantsTelegramOtp(): boolean {
  return otpDeliveryChannels().includes("telegram");
}

type AuthOtpPurpose = "login" | "signup" | "password_reset";

function hasFixedOtp(mobile: string, purpose: AuthOtpPurpose): boolean {
  return purpose === "signup"
    ? Boolean(getTestSignupOtpOverride(mobile))
    : Boolean(getTestOtpOverride(mobile));
}

function authOtpLabel(purpose: AuthOtpPurpose): string {
  if (purpose === "signup") return "signup";
  if (purpose === "password_reset") return "password reset";
  return "login";
}

/**
 * Deliver login/signup/password-reset OTP. Recipient is the user's own mobile (WhatsApp) or linked Telegram.
 * Channel order follows OTP_DELIVERY (first match wins; telegram skips to next if not linked).
 * TEST_OTP_* overrides only fix the OTP digits — WhatsApp/Telegram still deliver when configured.
 */
export async function deliverAuthOtp(params: {
  mobile: string;
  otp: string;
  purpose: AuthOtpPurpose;
  telegramChatId?: string | null;
}): Promise<{ via: "whatsapp" | "telegram" | "none" }> {
  const channels = otpDeliveryChannels();
  const label = authOtpLabel(params.purpose);

  if (channels.length === 0) {
    logger.info({ purpose: params.purpose }, "OTP delivery skipped (OTP_DELIVERY empty)");
    return { via: "none" };
  }

  for (const ch of channels) {
    if (ch === "whatsapp") {
      await sendWhatsAppOtp(params.mobile, params.otp, params.purpose);
      return { via: "whatsapp" };
    }
    if (ch === "telegram") {
      if (params.telegramChatId) {
        await telegramSendMessage(
          params.telegramChatId,
          `AsanPay ${label} OTP: ${params.otp}\nValid for 15 minutes. Do not share this code.`,
        );
        return { via: "telegram" };
      }
      continue;
    }
    if (ch === "log") {
      logger.info({ purpose: params.purpose, mobile: params.mobile }, "OTP delivery=log (value not logged)");
      return { via: "none" };
    }
  }

  if (
    channels.includes("telegram") &&
    !params.telegramChatId &&
    (params.purpose === "login" || params.purpose === "password_reset")
  ) {
    if (!hasFixedOtp(params.mobile, params.purpose)) {
      throw new HttpError(
        422,
        params.purpose === "password_reset"
          ? "Telegram is not linked. Contact support to reset your password, or use WhatsApp OTP delivery."
          : "Telegram is not linked. Log in with password, then open Account → Link Telegram.",
        "TELEGRAM_NOT_LINKED",
      );
    }
  }

  return { via: "none" };
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

export async function getTelegramLinkStatus(userId: string): Promise<{ linked: boolean }> {
  const [row] = await db
    .select({ telegramChatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, userId));
  return { linked: Boolean(row?.telegramChatId) };
}
