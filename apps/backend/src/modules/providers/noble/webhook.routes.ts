import { Router } from "express";
import { insertProviderLog } from "../../../db/postgres/repositories/providerLog";
import { logger } from "../../../utils/logger";

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
nobleWebhookRouter.post("/callback", async (req, res) => {
  const payload = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const txnRef = pickTxnRef(payload);

  logger.info(
    { txnRef, keys: Object.keys(payload).slice(0, 20), ip: req.ip },
    "Noble callback received",
  );

  await insertProviderLog({
    txnRef,
    providerCode: "noble",
    operation: "callback",
    requestPayload: {
      body: payload,
      query: req.query as Record<string, unknown>,
      ip: req.ip ?? null,
      contentType: req.header("content-type") ?? null,
    },
    responsePayload: {},
    status: "received",
    durationMs: 0,
  }).catch((err: unknown) => logger.error({ err }, "failed to store Noble callback"));

  res.status(200).json({ status: 1, statusCode: "SS0000", message: "Callback received" });
});
