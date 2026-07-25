import { env } from "../config/env";
import { logger } from "./logger";

/** Fire-and-forget ops alert (Slack/Teams incoming-webhook compatible). No-op if ALERT_WEBHOOK_URL unset. */
export async function sendOpsAlert(title: string, details: Record<string, unknown>): Promise<void> {
  logger.error({ title, ...details }, "ops alert");
  if (!env.ALERT_WEBHOOK_URL) return;

  try {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `*${title}*\n\`\`\`${JSON.stringify(details, null, 2)}\`\`\`` }),
    });
  } catch (err) {
    logger.error({ err, title }, "ops alert webhook delivery failed");
  }
}
