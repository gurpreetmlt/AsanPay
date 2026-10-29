import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { clientIp } from "../../../middleware/rateLimiter";
import { HttpError } from "../../../utils/httpError";
import { sendSuccess } from "../../../utils/apiResponse";
import { settleTxnFromProviderCallback } from "../../transactions/txn.service";
import { isTestCallbackBody } from "../../webhookKeys/webhookKeys.helpers";
import {
  checkCallbackToken,
  isWebhookAuthConfigured,
  recordWebhookDelivery,
} from "../../webhookKeys/webhookKeys.service";
import { mapVyaparTxnStatus } from "./status";
import type { ProviderResult } from "../types";

export const vyaparapiWebhookRouter = Router();

const callbackSchema = z.object({
  tid: z.string().optional().default(""),
  partnerid: z.string().min(1, "partnerid is required"),
  liveid: z.string().optional().default(""),
  status: z.string().min(1, "status is required"),
  message: z.string().optional().default(""),
  token: z.string().optional(),
});

async function assertCallbackAuth(
  tokenFromQueryOrBody: string | undefined,
  headerToken: string | undefined,
  ip: string | null,
): Promise<string> {
  if (!(await isWebhookAuthConfigured("vyaparapi"))) {
    throw new HttpError(
      503,
      "VyaparAPI callback is not configured. Generate a callback key in Admin → Webhooks & keys.",
      "VYAPARAPI_CALLBACK_NOT_CONFIGURED",
    );
  }
  const got = (tokenFromQueryOrBody || headerToken || "").trim();
  const keyId = await checkCallbackToken("vyaparapi", got, ip);
  if (!keyId) {
    throw new HttpError(401, "Invalid VyaparAPI callback token", "VYAPARAPI_CALLBACK_UNAUTHORIZED");
  }
  return keyId;
}

function toProviderResult(payload: z.infer<typeof callbackSchema>): ProviderResult {
  const status = mapVyaparTxnStatus({
    httpStatus: 200,
    status: payload.status,
  });
  // Partner callback has no statusCode — SUCCESS means success (not 131 pending).
  const finalStatus =
    String(payload.status).toUpperCase() === "SUCCESS"
      ? "success"
      : status === "failed"
        ? "failed"
        : status;

  return {
    success: finalStatus === "success",
    status: finalStatus,
    providerTxnId: payload.tid.trim() || null,
    amount: null,
    message: payload.message,
    data: { liveid: payload.liveid, partnerid: payload.partnerid },
    raw: payload as unknown as Record<string, unknown>,
  };
}

async function handleCallback(req: {
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  header: (name: string) => string | undefined;
  ip: string | null;
}): Promise<{ test: true } | { txnRef: string; status: string }> {
  const merged = { ...req.query, ...req.body };
  const keyId = await assertCallbackAuth(
    typeof merged.token === "string" ? merged.token : undefined,
    req.header("x-vyapar-token") ?? req.header("x-callback-token"),
    req.ip,
  );

  if (isTestCallbackBody(req.body)) {
    recordWebhookDelivery({ provider: "vyaparapi", keyId, result: "test", httpStatus: 200, ip: req.ip });
    return { test: true };
  }

  const parsed = callbackSchema.safeParse(merged);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid callback payload";
    recordWebhookDelivery({ provider: "vyaparapi", keyId, result: "error", httpStatus: 400, ip: req.ip, note: msg });
    throw new HttpError(400, msg, "VYAPARAPI_CALLBACK_INVALID");
  }

  const txnRef = parsed.data.partnerid;
  try {
    const result = toProviderResult(parsed.data);
    const outcome = await settleTxnFromProviderCallback(txnRef, result);
    recordWebhookDelivery({ provider: "vyaparapi", keyId, result: "ok", httpStatus: 200, ip: req.ip, txnRef });
    return { txnRef: outcome.txn.txnRef, status: outcome.txn.status };
  } catch (err) {
    recordWebhookDelivery({
      provider: "vyaparapi",
      keyId,
      result: "error",
      httpStatus: err instanceof HttpError ? err.statusCode : 500,
      ip: req.ip,
      txnRef,
      note: err instanceof HttpError ? err.message : "Callback could not be processed",
    });
    throw err;
  }
}

async function respond(req: Request, res: Response, body: Record<string, unknown>): Promise<void> {
  const data = await handleCallback({
    query: req.query as Record<string, unknown>,
    body,
    header: (n) => req.header(n),
    ip: clientIp(req),
  });
  if ("test" in data) {
    res.status(200).json({ status: 1, message: "Test callback received" });
    return;
  }
  sendSuccess(res, data);
}

vyaparapiWebhookRouter.get("/callback", async (req, res) => {
  await respond(req, res, {});
});

vyaparapiWebhookRouter.post("/callback", async (req, res) => {
  await respond(req, res, (req.body ?? {}) as Record<string, unknown>);
});
