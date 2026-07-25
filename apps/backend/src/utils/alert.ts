import { db } from "../db/postgres";
import { alertLogs } from "../db/postgres/schema";
import { env } from "../config/env";
import { logger } from "./logger";

export type AlertSeverity = "critical" | "general";

export interface AlertDetails {
  retailerId?: string;
  retailerName?: string;
  amount?: string;
  errorCode?: string;
  message?: string;
  [key: string]: unknown;
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: "🚨",
  general: "ℹ️",
};

// In-memory debounce — per process, resets on deploy. Good enough for "don't spam 50 alerts
// in a minute"; a multi-instance deployment would want this in Redis, but there's only one
// backend instance today (see docs/AGENT_PLAN.md deployment notes).
const lastSentAt = new Map<string, number>();

function shouldDebounce(alertType: string, retailerId: string | undefined): boolean {
  const key = `${alertType}:${retailerId ?? "system"}`;
  const now = Date.now();
  const last = lastSentAt.get(key);
  if (last != null && now - last < env.ALERT_DEBOUNCE_MS) return true;
  lastSentAt.set(key, now);
  return false;
}

function webhookFor(severity: AlertSeverity): string | undefined {
  return severity === "critical"
    ? env.SLACK_WEBHOOK_CRITICAL ?? env.ALERT_WEBHOOK_URL
    : env.SLACK_WEBHOOK_GENERAL ?? env.ALERT_WEBHOOK_URL;
}

function formatSlackMessage(alertType: string, severity: AlertSeverity, details: AlertDetails): string {
  const lines = [
    `${SEVERITY_EMOJI[severity]} *${alertType}* (${severity.toUpperCase()})`,
    `Time: ${new Date().toISOString()}`,
  ];
  if (details.retailerName || details.retailerId) {
    lines.push(`Retailer: ${details.retailerName ?? "unknown"} (${details.retailerId ?? "n/a"})`);
  }
  if (details.amount != null) lines.push(`Amount: ₹${details.amount}`);
  if (details.errorCode) lines.push(`Error code: ${details.errorCode}`);
  if (details.message) lines.push(`Message: ${details.message}`);
  const rest = Object.fromEntries(
    Object.entries(details).filter(([k]) => !["retailerId", "retailerName", "amount", "errorCode", "message"].includes(k)),
  );
  if (Object.keys(rest).length > 0) lines.push(`Details: \`\`\`${JSON.stringify(rest, null, 2)}\`\`\``);
  return lines.join("\n");
}

async function postToSlackWithRetry(url: string, text: string, retries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) return true;
      logger.error({ status: res.status, attempt }, "slack alert non-OK response");
    } catch (err) {
      logger.error({ err, attempt }, "slack alert delivery failed");
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
  }
  return false;
}

/**
 * Central retailer/ops alert entrypoint. Routes to the critical or general Slack webhook by
 * severity, retries the Slack POST (3x, exponential backoff), debounces repeat alerts for the
 * same (alertType, retailerId) within ALERT_DEBOUNCE_MS, and always writes an audit row —
 * independent of whether Slack delivery actually succeeded.
 */
export async function sendSlackAlert(
  alertType: string,
  severity: AlertSeverity,
  details: AlertDetails = {},
): Promise<void> {
  logger.error({ alertType, severity, ...details }, "retailer alert");

  if (shouldDebounce(alertType, details.retailerId)) {
    logger.info({ alertType, retailerId: details.retailerId }, "alert debounced (repeat within window)");
    return;
  }

  const webhookUrl = webhookFor(severity);
  let delivered = false;
  if (webhookUrl) {
    try {
      delivered = await postToSlackWithRetry(webhookUrl, formatSlackMessage(alertType, severity, details));
    } catch (err) {
      logger.error({ err, alertType }, "slack alert threw unexpectedly");
    }
  }

  try {
    await db.insert(alertLogs).values({
      alertType,
      severity,
      retailerId: details.retailerId ?? null,
      details,
      deliveredToSlack: delivered,
    });
  } catch (err) {
    // Audit-log failure must never take down the caller's actual transaction flow.
    logger.error({ err, alertType }, "failed to persist alert audit log");
  }
}

/** Back-compat wrapper for existing ops-only call sites (non-retailer-specific failures). */
export async function sendOpsAlert(title: string, details: Record<string, unknown>): Promise<void> {
  await sendSlackAlert(title, "critical", details);
}
