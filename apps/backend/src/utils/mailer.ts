import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Built once on first send. Null when SMTP is not fully configured — callers get
 * `false` back rather than an exception, so a missing SMTP config degrades email
 * verification instead of breaking whatever flow tried to send.
 */
let transporter: Transporter | null | undefined;

export function isMailerConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (!isMailerConfigured()) {
    logger.warn("SMTP not configured — outbound email is disabled");
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 587 is STARTTLS (upgrade after connect); 465 is implicit TLS.
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

/** Returns false if the mail could not be sent. Never throws — email is never critical-path. */
export async function sendMail(input: SendMailInput): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) return false;
  try {
    await tx.sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return true;
  } catch (err) {
    // Address is logged for support; the OTP itself is never logged.
    logger.error({ err, to: input.to, subject: input.subject }, "Failed to send email");
    return false;
  }
}

export function emailVerificationTemplate(otp: string, ttlMinutes: number): SendMailInput {
  const text = [
    `Your AsanPay email verification code is ${otp}.`,
    ``,
    `It expires in ${ttlMinutes} minutes. Enter it on the AsanPay dashboard to`,
    `confirm this address so we can send your invoices and statements here.`,
    ``,
    `If you did not request this, you can ignore this email.`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e2a5a">
  <h2 style="margin:0 0 4px;font-size:20px">Verify your email</h2>
  <p style="margin:0 0 20px;color:#6b7280;font-size:14px">AsanPay &middot; Payment Made Easy</p>
  <p style="margin:0 0 8px;font-size:14px">Your verification code is</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0;color:#1d4ed8">${otp}</div>
  <p style="margin:0 0 20px;font-size:14px;color:#6b7280">Expires in ${ttlMinutes} minutes.</p>
  <p style="margin:0;font-size:13px;color:#6b7280">Once verified, we'll send your invoices and statements to this address. If you did not request this, you can ignore this email.</p>
</div>`;

  return { to: "", subject: "Verify your AsanPay email", text, html };
}
