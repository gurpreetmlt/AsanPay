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
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
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
  blueDeep: "#071E6E",
  green: "#12B76A",
  amber: "#B45309",
  muted: "#64748B",
  border: "#E2E8F0",
  bg: "#EEF2FF",
  white: "#FFFFFF",
  ink: "#0F172A",
} as const;

const SITE_URL = "https://asanpay.in";
const AGENT_URL = "https://dev.asanpay.in";

/** Shared HTML shell — table layout for Gmail/Outlook compatibility. */
function brandedEmailHtml(opts: {
  preheader: string;
  title: string;
  bodyHtml: string;
  /** Optional accent under the header (e.g. security = amber bar). */
  accent?: "blue" | "green" | "amber";
}): string {
  const { preheader, title, bodyHtml } = opts;
  const accent =
    opts.accent === "green" ? BRAND.green : opts.accent === "amber" ? "#F59E0B" : BRAND.blueLight;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;font-family:Georgia,'Times New Roman',serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};padding:40px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
          <tr>
            <td align="center" style="padding:0 0 20px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
              <span style="display:inline-block;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.blue}">AsanPay</span>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.white};border-radius:20px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 12px 40px rgba(11,42,154,0.08)">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:${BRAND.blueDeep};padding:28px 32px 24px">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="52" valign="middle">
                          <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(145deg,${BRAND.blueLight},${BRAND.blue});text-align:center;line-height:44px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:20px;font-weight:800;color:${BRAND.white}">A</div>
                        </td>
                        <td valign="middle" style="padding-left:14px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
                          <div style="font-size:20px;font-weight:800;letter-spacing:-0.03em;color:${BRAND.white}">AsanPay</div>
                          <div style="margin-top:3px;font-size:12px;font-weight:500;color:rgba(255,255,255,0.72)">Payment Made Easy</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="height:4px;line-height:4px;font-size:0;background:${accent}">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:36px 32px 28px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${BRAND.ink}">
                    ${bodyHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};border-radius:14px">
                      <tr>
                        <td style="padding:16px 18px">
                          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:${BRAND.blue}">Need the dashboard?</p>
                          <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted}">
                            Open <a href="${AGENT_URL}" style="color:${BRAND.blueLight};font-weight:600;text-decoration:none">${AGENT_URL.replace("https://", "")}</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px;border-top:1px solid ${BRAND.border};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
                    <p style="margin:18px 0 0;font-size:11px;line-height:1.6;color:${BRAND.muted}">
                      Sent by AsanPay · <a href="${SITE_URL}" style="color:${BRAND.blueLight};text-decoration:none">${SITE_URL.replace("https://", "")}</a><br />
                      If you did not expect this email, you can ignore it safely.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function otpDigitBoxes(otp: string): string {
  const digits = otp.replace(/\D/g, "").slice(0, 6).split("");
  while (digits.length < 6) digits.push("·");
  const cells = digits
    .map(
      (d) =>
        `<td align="center" style="padding:0 4px">
          <div style="width:42px;height:52px;border-radius:12px;border:1px solid ${BRAND.border};background:${BRAND.bg};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:24px;font-weight:800;line-height:52px;color:${BRAND.blue}">${d}</div>
        </td>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${cells}</tr></table>`;
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
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.blueLight}">Email verification</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">Confirm your email</h1>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${BRAND.muted}">
      Enter this 6-digit code in AsanPay. Once verified, invoices and statements go to this address.
    </p>
    ${otpDigitBoxes(otp)}
    <p style="margin:24px 0 0;text-align:center;font-size:13px;color:${BRAND.muted}">
      Expires in <strong style="color:${BRAND.blue}">${ttlMinutes} minutes</strong> · Never share this code
    </p>
  `;

  return {
    to: "",
    subject: "Verify your AsanPay email",
    text,
    html: brandedEmailHtml({
      preheader: `Your AsanPay code is ${otp}. Expires in ${ttlMinutes} minutes.`,
      title: "Verify your AsanPay email",
      bodyHtml,
      accent: "blue",
    }),
  };
}

export function welcomeEmailTemplate(input: {
  name: string;
  roleLabel: string;
}): SendMailInput {
  const name = input.name.trim() || "there";
  const text = [
    `Welcome to AsanPay, ${name}!`,
    ``,
    `Your ${input.roleLabel} account is ready. Log in to complete onboarding`,
    `and start serving customers.`,
    ``,
    `— Team AsanPay`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.green}">Welcome</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">You're in, ${escapeHtml(name)}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${BRAND.muted}">
      Your email is verified and your <strong style="color:${BRAND.blue}">${escapeHtml(input.roleLabel)}</strong> account is ready.
      Finish onboarding and start serving customers.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px">
      <tr>
        <td style="background:${BRAND.green};border-radius:12px;padding:14px 22px">
          <a href="${AGENT_URL}" style="font-size:14px;font-weight:700;color:${BRAND.white};text-decoration:none">Open AsanPay dashboard</a>
        </td>
      </tr>
    </table>
  `;

  return {
    to: "",
    subject: "Welcome to AsanPay",
    text,
    html: brandedEmailHtml({
      preheader: `Welcome to AsanPay, ${name}. Your account is ready.`,
      title: "Welcome to AsanPay",
      bodyHtml,
      accent: "green",
    }),
  };
}

export function kycSubmittedEmailTemplate(input: { name: string }): SendMailInput {
  const name = input.name.trim() || "there";
  const text = [
    `Hi ${name},`,
    ``,
    `We received your KYC documents. Our team will review them shortly.`,
    `You will get another email when the status changes.`,
    ``,
    `— Team AsanPay`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.blueLight}">KYC</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">Documents received</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.muted}">
      We have your KYC details. Our team will review them shortly — you will get another email when the status changes.
    </p>
  `;

  return {
    to: "",
    subject: "AsanPay KYC received",
    text,
    html: brandedEmailHtml({
      preheader: "We received your KYC — review is in progress.",
      title: "AsanPay KYC received",
      bodyHtml,
      accent: "blue",
    }),
  };
}

export function kycDecisionEmailTemplate(input: {
  name: string;
  decision: "verified" | "rejected";
}): SendMailInput {
  const name = input.name.trim() || "there";
  const approved = input.decision === "verified";
  const text = approved
    ? [
        `Hi ${name},`,
        ``,
        `Your KYC has been approved. You can now use full transaction limits on AsanPay.`,
        ``,
        `— Team AsanPay`,
      ].join("\n")
    : [
        `Hi ${name},`,
        ``,
        `Your KYC could not be approved. Please review your documents and submit again from the AsanPay dashboard.`,
        ``,
        `— Team AsanPay`,
      ].join("\n");

  const bodyHtml = approved
    ? `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.green}">KYC</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">You're verified</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${BRAND.muted}">
      Your KYC is approved. Full transaction limits are now available on your account.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:${BRAND.green};border-radius:12px;padding:12px 18px">
          <span style="font-size:13px;font-weight:700;color:${BRAND.white}">Status: Verified</span>
        </td>
      </tr>
    </table>
  `
    : `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.amber}">KYC</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">Needs attention</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.muted}">
      Your KYC could not be approved. Please review your documents and submit again from the AsanPay dashboard.
    </p>
  `;

  return {
    to: "",
    subject: approved ? "AsanPay KYC approved" : "AsanPay KYC update",
    text,
    html: brandedEmailHtml({
      preheader: approved ? "Your KYC is approved." : "Your KYC needs attention.",
      title: approved ? "AsanPay KYC approved" : "AsanPay KYC update",
      bodyHtml,
      accent: approved ? "green" : "amber",
    }),
  };
}

export function statementEmailTemplate(input: {
  name: string;
  period: "daily" | "monthly";
  from: Date;
  to: Date;
  txnCount: number;
  successCount: number;
  volumeRs: string;
}): SendMailInput {
  const name = input.name.trim() || "there";
  const label = input.period === "daily" ? "Daily" : "Monthly";
  const range = `${input.from.toISOString().slice(0, 10)} → ${input.to.toISOString().slice(0, 10)}`;
  const text = [
    `Hi ${name},`,
    ``,
    `Your AsanPay ${label.toLowerCase()} statement (${range}):`,
    `Transactions: ${input.txnCount}`,
    `Successful: ${input.successCount}`,
    `Success volume: ₹${input.volumeRs}`,
    ``,
    `— Team AsanPay`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.blueLight}">Statement</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">${label} summary</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 20px;font-size:14px;color:${BRAND.muted}">Period <strong style="color:${BRAND.blue}">${escapeHtml(range)}</strong></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden">
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.muted}">Transactions</td>
        <td style="padding:14px 16px;border-bottom:1px solid ${BRAND.border};font-size:15px;font-weight:800;color:${BRAND.blueDeep};text-align:right">${input.txnCount}</td>
      </tr>
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.muted}">Successful</td>
        <td style="padding:14px 16px;border-bottom:1px solid ${BRAND.border};font-size:15px;font-weight:800;color:${BRAND.blueDeep};text-align:right">${input.successCount}</td>
      </tr>
      <tr>
        <td style="padding:14px 16px;background:${BRAND.bg};font-size:14px;color:${BRAND.muted}">Success volume</td>
        <td style="padding:14px 16px;background:${BRAND.bg};font-size:16px;font-weight:800;color:${BRAND.blue};text-align:right">₹${escapeHtml(input.volumeRs)}</td>
      </tr>
    </table>
  `;

  return {
    to: "",
    subject: `AsanPay ${label.toLowerCase()} statement`,
    text,
    html: brandedEmailHtml({
      preheader: `${label} statement: ${input.successCount} successful txns, ₹${input.volumeRs}`,
      title: `AsanPay ${label.toLowerCase()} statement`,
      bodyHtml,
      accent: "blue",
    }),
  };
}

export function commissionCreditEmailTemplate(input: {
  name: string;
  amount: string;
  txnRef: string;
}): SendMailInput {
  const name = input.name.trim() || "there";
  const text = [
    `Hi ${name},`,
    ``,
    `Commission of ₹${input.amount} was credited for transaction ${input.txnRef}.`,
    ``,
    `— Team AsanPay`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.green}">Settlement</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">Commission credited</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <div style="margin:0 0 16px;padding:20px;border-radius:14px;background:${BRAND.bg};border:1px solid ${BRAND.border};text-align:center">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted}">Amount</div>
      <div style="margin-top:6px;font-size:32px;font-weight:800;color:${BRAND.green}">₹${escapeHtml(input.amount)}</div>
    </div>
    <p style="margin:0;font-size:13px;color:${BRAND.muted}">Reference: <strong style="color:${BRAND.blue}">${escapeHtml(input.txnRef)}</strong></p>
  `;

  return {
    to: "",
    subject: "AsanPay commission credited",
    text,
    html: brandedEmailHtml({
      preheader: `₹${input.amount} commission credited.`,
      title: "AsanPay commission credited",
      bodyHtml,
      accent: "green",
    }),
  };
}

export function vanDepositCreditEmailTemplate(input: {
  name: string;
  amount: string;
  bankTxnId: string;
}): SendMailInput {
  const name = input.name.trim() || "there";
  const text = [
    `Hi ${name},`,
    ``,
    `₹${input.amount} was credited to your AsanPay balance from a virtual account deposit.`,
    `Bank reference: ${input.bankTxnId}`,
    ``,
    `— Team AsanPay`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.green}">Balance</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">Deposit credited</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <div style="margin:0 0 16px;padding:20px;border-radius:14px;background:${BRAND.bg};border:1px solid ${BRAND.border};text-align:center">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted}">Amount</div>
      <div style="margin-top:6px;font-size:32px;font-weight:800;color:${BRAND.green}">₹${escapeHtml(input.amount)}</div>
    </div>
    <p style="margin:0;font-size:13px;color:${BRAND.muted}">Bank reference: <strong style="color:${BRAND.blue}">${escapeHtml(input.bankTxnId)}</strong></p>
  `;

  return {
    to: "",
    subject: "AsanPay deposit credited",
    text,
    html: brandedEmailHtml({
      preheader: `₹${input.amount} deposited to your balance.`,
      title: "AsanPay deposit credited",
      bodyHtml,
      accent: "green",
    }),
  };
}

export function securityPinChangedEmailTemplate(input: {
  name: string;
  kind: "mpin" | "password";
}): SendMailInput {
  const name = input.name.trim() || "there";
  const label = input.kind === "mpin" ? "login MPIN" : "password";
  const text = [
    `Hi ${name},`,
    ``,
    `Your AsanPay ${label} was changed. If this was not you, contact support immediately.`,
    ``,
    `— Team AsanPay`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.amber}">Security</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">${escapeHtml(label)} changed</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.muted}">
      Your AsanPay <strong style="color:${BRAND.blue}">${escapeHtml(label)}</strong> was changed.
      If this was not you, secure your account and contact support immediately.
    </p>
  `;

  return {
    to: "",
    subject: `AsanPay ${label} changed`,
    text,
    html: brandedEmailHtml({
      preheader: `Your ${label} was changed.`,
      title: `AsanPay ${label} changed`,
      bodyHtml,
      accent: "amber",
    }),
  };
}

export function largeDebitAlertEmailTemplate(input: {
  name: string;
  amount: string;
  targetName: string;
  thresholdRs: number;
}): SendMailInput {
  const name = input.name.trim() || "there";
  const text = [
    `Hi ${name},`,
    ``,
    `A balance transfer of ₹${input.amount} to ${input.targetName} was completed`,
    `(alert threshold ₹${input.thresholdRs}).`,
    ``,
    `If this was not you, contact support immediately.`,
    ``,
    `— Team AsanPay`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.amber}">Fraud watch</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">Large balance debit</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <div style="margin:0 0 16px;padding:18px;border-radius:14px;background:${BRAND.bg};border:1px solid ${BRAND.border}">
      <p style="margin:0 0 8px;font-size:14px;color:${BRAND.muted}">Amount <strong style="color:${BRAND.blueDeep};font-size:20px">₹${escapeHtml(input.amount)}</strong></p>
      <p style="margin:0;font-size:14px;color:${BRAND.muted}">To <strong style="color:${BRAND.blue}">${escapeHtml(input.targetName)}</strong></p>
    </div>
    <p style="margin:0;font-size:13px;color:${BRAND.muted}">
      Alert threshold ₹${input.thresholdRs}. If this was not you, contact support immediately.
    </p>
  `;

  return {
    to: "",
    subject: "AsanPay large balance debit alert",
    text,
    html: brandedEmailHtml({
      preheader: `₹${input.amount} transferred to ${input.targetName}.`,
      title: "AsanPay large balance debit alert",
      bodyHtml,
      accent: "amber",
    }),
  };
}

export function deviceNewLoginEmailTemplate(input: {
  name: string;
  deviceLabel: string;
  ipAddress: string | null;
}): SendMailInput {
  const name = input.name.trim() || "there";
  const text = [
    `Hi ${name},`,
    ``,
    `A new device signed in to your AsanPay account: ${input.deviceLabel}.`,
    input.ipAddress ? `IP: ${input.ipAddress}` : "",
    ``,
    `If this was not you, revoke devices from Settings and change your MPIN.`,
    ``,
    `— Team AsanPay`,
  ]
    .filter(Boolean)
    .join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.amber}">Security</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">New device login</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <div style="margin:0 0 16px;padding:18px;border-radius:14px;background:${BRAND.bg};border:1px solid ${BRAND.border}">
      <p style="margin:0 0 6px;font-size:14px;color:${BRAND.muted}">Device</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:${BRAND.blueDeep}">${escapeHtml(input.deviceLabel)}</p>
      ${
        input.ipAddress
          ? `<p style="margin:10px 0 0;font-size:13px;color:${BRAND.muted}">IP ${escapeHtml(input.ipAddress)}</p>`
          : ""
      }
    </div>
    <p style="margin:0;font-size:13px;color:${BRAND.muted}">
      If this was not you, revoke devices from Settings and change your MPIN.
    </p>
  `;

  return {
    to: "",
    subject: "AsanPay new device login",
    text,
    html: brandedEmailHtml({
      preheader: `New device: ${input.deviceLabel}`,
      title: "AsanPay new device login",
      bodyHtml,
      accent: "amber",
    }),
  };
}

export function productUpdateEmailTemplate(input: {
  name: string;
  subject: string;
  headline: string;
  body: string;
}): SendMailInput {
  const name = input.name.trim() || "there";
  const text = [`Hi ${name},`, ``, input.headline, ``, input.body, ``, `— Team AsanPay`].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.blueLight}">Product update</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.blueDeep}">${escapeHtml(input.headline)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted}">Hi ${escapeHtml(name)},</p>
    <p style="margin:0;font-size:15px;line-height:1.65;color:${BRAND.muted};white-space:pre-wrap">${escapeHtml(input.body)}</p>
  `;

  return {
    to: "",
    subject: input.subject,
    text,
    html: brandedEmailHtml({
      preheader: input.headline,
      title: input.subject,
      bodyHtml,
      accent: "blue",
    }),
  };
}

/** Fire-and-forget notify — never throws; skips when SMTP or address missing. */
export function notifyUserEmail(to: string | null | undefined, build: () => SendMailInput): void {
  if (!to || !isMailerConfigured()) return;
  const payload = build();
  void sendMail({ ...payload, to }).then((ok) => {
    if (!ok) logger.warn({ to, subject: payload.subject }, "User notification email failed");
  });
}

export function agentRoleLabel(role: string): string {
  switch (role) {
    case "super_distributor":
      return "Super Distributor";
    case "distributor":
      return "Distributor";
    case "retailer":
      return "Retailer";
    default:
      return "Agent";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
