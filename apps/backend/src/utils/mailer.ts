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

const BRAND = {
  blue: "#0B2A9A",
  blueLight: "#2A5CDD",
  green: "#12B76A",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#F3F6FC",
  white: "#FFFFFF",
} as const;

/** Shared HTML shell — table layout for Gmail/Outlook compatibility. */
function brandedEmailHtml(opts: {
  preheader: string;
  title: string;
  bodyHtml: string;
}): string {
  const { preheader, title, bodyHtml } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${BRAND.white};border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border}">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.blueLight} 0%,${BRAND.blue} 100%);padding:28px 32px">
              <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.white}">AsanPay</div>
              <div style="margin-top:4px;font-size:13px;color:rgba(255,255,255,0.85)">Payment Made Easy</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 28px;color:${BRAND.blue}">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid ${BRAND.border}">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted}">
                This message was sent by AsanPay. If you did not expect it, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${BRAND.blue}">Verify your email</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.55;color:${BRAND.muted}">
      Use this code to confirm your address. Invoices and statements will go here once verified.
    </p>
    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.06em">
      Verification code
    </p>
    <div style="text-align:center;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;padding:20px 16px;margin:0 0 16px">
      <span style="font-size:36px;font-weight:800;letter-spacing:0.28em;color:${BRAND.blueLight}">${otp}</span>
    </div>
    <p style="margin:0;font-size:13px;color:${BRAND.muted}">Expires in <strong style="color:${BRAND.blue}">${ttlMinutes} minutes</strong>.</p>
  `;

  return {
    to: "",
    subject: "Verify your AsanPay email",
    text,
    html: brandedEmailHtml({
      preheader: `Your AsanPay code is ${otp}. Expires in ${ttlMinutes} minutes.`,
      title: "Verify your AsanPay email",
      bodyHtml,
    }),
  };
}

/** Call after signup / first activation — wire from auth signup in a follow-up task. */
export function welcomeEmailTemplate(input: {
  name: string;
  roleLabel: string;
}): SendMailInput {
  const name = input.name.trim() || "there";
  const text = [
    `Welcome to AsanPay, ${name}!`,
    ``,
    `Your ${input.roleLabel} account is ready. Log in to complete onboarding,`,
    `verify your email, and start serving customers.`,
    ``,
    `— Team AsanPay`,
  ].join("\n");

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${BRAND.blue}">Welcome to AsanPay</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${BRAND.blue}">
      Hi ${escapeHtml(name)},
    </p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:${BRAND.muted}">
      Your <strong style="color:${BRAND.blue}">${escapeHtml(input.roleLabel)}</strong> account is ready.
      Complete onboarding, verify your email, and you are set to serve customers.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
      <tr>
        <td style="background:${BRAND.green};border-radius:10px;padding:12px 20px">
          <span style="font-size:14px;font-weight:700;color:${BRAND.white}">You are in — Payment Made Easy</span>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;line-height:1.55;color:${BRAND.muted}">
      Need help? Reply to this email or contact your upline distributor.
    </p>
  `;

  return {
    to: "",
    subject: "Welcome to AsanPay",
    text,
    html: brandedEmailHtml({
      preheader: `Welcome to AsanPay, ${name}. Your account is ready.`,
      title: "Welcome to AsanPay",
      bodyHtml,
    }),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
