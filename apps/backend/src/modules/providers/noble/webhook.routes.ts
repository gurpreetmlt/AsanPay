import { Router } from "express";
import { env } from "../../../config/env";
import { insertProviderLog } from "../../../db/postgres/repositories/providerLog";
import { nobleCallbackLimiter } from "../../../middleware/rateLimiter";
import { logger } from "../../../utils/logger";
import { isWebhookAuthConfigured, verifyWebhookToken } from "../../webhookKeys/webhookKeys.service";

export const nobleWebhookRouter = Router();

const TXN_REF_KEYS = [
  "clientRefId",
  "clientReferenceId",
  "partnerTxnId",
  "transactionId",
  "txnId",
  "orderId",
  "referenceId",
];

function pickTxnRef(payload: Record<string, unknown>): string | null {
  const sources: Record<string, unknown>[] = [payload];
  const data = payload.responseData ?? payload.data;
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    sources.push(data[0] as Record<string, unknown>);
  } else if (data && typeof data === "object") {
    sources.push(data as Record<string, unknown>);
  }
  for (const src of sources) {
    for (const key of TXN_REF_KEYS) {
      const value = src[key];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 40);
      if (typeof value === "number") return String(value).slice(0, 40);
    }
  }
  return null;
}

/**
 * Receive-only for now: every callback is stored in logs.provider_logs and acknowledged.
 * Transactions are still settled through the status-check APIs until the payload shape is confirmed.
 */
nobleWebhookRouter.post("/callback", nobleCallbackLimiter, async (req, res) => {
  if (!(await isWebhookAuthConfigured("noble"))) {
    if (env.NODE_ENV === "production") {
      res.status(503).json({
        status: 0,
        message: "AEPS provider callback is not configured. Generate a callback key in Admin → Webhooks & keys.",
      });
      return;
    }
  } else {
    const queryToken = typeof req.query.token === "string" ? req.query.token : "";
    const got = (req.header("x-callback-token") || queryToken).trim();
    if (!(await verifyWebhookToken("noble", got))) {
      logger.warn({ ip: req.ip, hasToken: Boolean(got) }, "AEPS provider callback rejected: bad token");
      res.status(401).json({
        status: 0,
        message: "Invalid callback token. Send the active callback key in the X-Callback-Token header or ?token=.",
      });
      return;
    }
  }

  const payload = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const { token: _token, ...safeQuery } = req.query as Record<string, unknown>;
  const txnRef = pickTxnRef(payload);

  logger.info(
    { txnRef, keys: Object.keys(payload).slice(0, 20), ip: req.ip },
    "AEPS provider callback received",
  );

  await insertProviderLog({
    txnRef,
    providerCode: "noble",
    operation: "callback",
    requestPayload: {
      body: payload,
      query: safeQuery,
      ip: req.ip ?? null,
      contentType: req.header("content-type") ?? null,
    },
    responsePayload: {},
    status: "received",
    durationMs: 0,
  }).catch((err: unknown) => logger.error({ err }, "failed to store AEPS provider callback"));

  res.status(200).json({ status: 1, statusCode: "SS0000", message: "Callback received" });
});
