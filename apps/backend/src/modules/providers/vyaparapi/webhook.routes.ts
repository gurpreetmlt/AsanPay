import { Router } from "express";
import { z } from "zod";
import { env } from "../../../config/env";
import { HttpError } from "../../../utils/httpError";
import { sendSuccess } from "../../../utils/apiResponse";
import { settleTxnFromProviderCallback } from "../../transactions/txn.service";
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

function assertCallbackAuth(tokenFromQueryOrBody: string | undefined, headerToken: string | undefined): void {
  const expected = env.VYAPARAPI_CALLBACK_SECRET?.trim();
  if (!expected) {
    throw new HttpError(
      503,
      "VyaparAPI callback is not configured. Set VYAPARAPI_CALLBACK_SECRET on the backend.",
      "VYAPARAPI_CALLBACK_NOT_CONFIGURED",
    );
  }
  const got = (tokenFromQueryOrBody || headerToken || "").trim();
  if (got !== expected) {
    throw new HttpError(401, "Invalid VyaparAPI callback token", "VYAPARAPI_CALLBACK_UNAUTHORIZED");
  }
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
}): Promise<{ txnRef: string; status: string }> {
  const merged = { ...req.query, ...req.body };
  const parsed = callbackSchema.safeParse(merged);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid callback payload";
    throw new HttpError(400, msg, "VYAPARAPI_CALLBACK_INVALID");
  }

  assertCallbackAuth(parsed.data.token, req.header("x-vyapar-token") ?? req.header("x-callback-token"));

  const result = toProviderResult(parsed.data);
  const outcome = await settleTxnFromProviderCallback(parsed.data.partnerid, result);
  return { txnRef: outcome.txn.txnRef, status: outcome.txn.status };
}

vyaparapiWebhookRouter.get("/callback", async (req, res) => {
  const data = await handleCallback({
    query: req.query as Record<string, unknown>,
    body: {},
    header: (n) => req.header(n),
  });
  sendSuccess(res, data);
});

vyaparapiWebhookRouter.post("/callback", async (req, res) => {
  const data = await handleCallback({
    query: req.query as Record<string, unknown>,
    body: (req.body ?? {}) as Record<string, unknown>,
    header: (n) => req.header(n),
  });
  sendSuccess(res, data);
});
