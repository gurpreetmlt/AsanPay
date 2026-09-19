import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";

const GRAPH_HOST = "https://graph.facebook.com";
const TOKEN_LIKE = /EAA[A-Za-z0-9]+/g;

type MetaErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type MetaSendBody = {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string }>;
} & MetaErrorBody;

export type WhatsAppSendResult = {
  messageId: string | null;
  waId: string | null;
  httpStatus: number;
  graphVersion: string;
  meta: Record<string, unknown>;
};

function graphVersion(): string {
  const raw = (env.WHATSAPP_GRAPH_API_VERSION || "v26.0").trim();
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function whatsappCreds(): { token: string; phoneNumberId: string } {
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const missing: string[] = [];
  if (!token) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (missing.length) {
    throw new HttpError(
      503,
      `WhatsApp is not configured. Set ${missing.join(" and ")} on the backend.`,
      "WHATSAPP_NOT_CONFIGURED",
    );
  }
  return { token: token!, phoneNumberId: phoneNumberId! };
}

/** Digits with country code, no +. 10-digit Indian numbers get a 91 prefix. */
export function normalizeWhatsAppTo(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const withCc = digits.length === 10 ? `91${digits}` : digits;
  if (withCc.length < 11 || withCc.length > 15) {
    throw new HttpError(
      422,
      "Enter a valid WhatsApp number with country code (e.g. 9198XXXXXXXX)",
      "INVALID_WHATSAPP_TO",
    );
  }
  return withCc;
}

function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(TOKEN_LIKE, "[redacted]");
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (key.includes("token") || key.includes("authorization") || key.includes("secret")) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = redactSecrets(v);
    }
    return out;
  }
  return value;
}

function safeMetaJson(json: unknown): Record<string, unknown> {
  const redacted = redactSecrets(json);
  if (redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
    return redacted as Record<string, unknown>;
  }
  return { value: redacted };
}

function maskRecipient(to: string): string {
  if (to.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, to.length - 4))}${to.slice(-4)}`;
}

function metaUserMessage(json: MetaSendBody, httpStatus: number): string {
  const msg = json.error?.message?.trim() ?? "";
  const code = json.error?.code;
  // Meta often returns a bare "Authentication Error" for bad/expired tokens.
  if (/authentication error/i.test(msg) || code === 190 || httpStatus === 401) {
    return "WhatsApp login failed — access token is invalid or expired. Generate a new token in Meta Developer and update WHATSAPP_ACCESS_TOKEN in Coolify.";
  }
  if (code === 133010 || /not registered|phone number.*not/i.test(msg)) {
    return "WhatsApp phone number is not registered for Cloud API. Finish Meta production phone setup.";
  }
  if (code === 131030 || /recipient.*not in allowed|not in allowed list/i.test(msg)) {
    return "This mobile is not on the WhatsApp test allowlist. Add it in Meta Developer or publish the app for production.";
  }
  if (code === 131008 || /required parameter is missing/i.test(msg)) {
    return "WhatsApp OTP template needs the button parameter (body + Copy Code). Redeploy the latest backend or check the template in Meta.";
  }
  if (msg) return msg;
  return `WhatsApp Cloud API rejected the request (HTTP ${httpStatus}). Check Phone Number ID, recipient, and token scopes.`;
}

async function postWhatsAppMessage(
  toRaw: string,
  payload: Record<string, unknown>,
  kind: "text" | "template",
): Promise<WhatsAppSendResult> {
  const { token, phoneNumberId } = whatsappCreds();
  const to = normalizeWhatsAppTo(toRaw);
  const version = graphVersion();
  const url = `${GRAPH_HOST}/${version}/${encodeURIComponent(phoneNumberId)}/messages`;
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ...payload, to }),
    });
  } catch (err) {
    logger.error({ err, to: maskRecipient(to), kind }, "WhatsApp Cloud API network error");
    throw new HttpError(502, "Could not reach WhatsApp Cloud API. Try again.", "WHATSAPP_NETWORK");
  }

  const text = await res.text();
  let json: MetaSendBody = {};
  try {
    json = text ? (JSON.parse(text) as MetaSendBody) : {};
  } catch {
    json = { error: { message: text.slice(0, 300) } };
  }

  const safeMeta = safeMetaJson(json);
  const messageId = json.messages?.[0]?.id ?? null;
  const waId = json.contacts?.[0]?.wa_id ?? null;

  logger.info(
    {
      httpStatus: res.status,
      durationMs: Date.now() - started,
      graphVersion: version,
      phoneNumberId,
      to: maskRecipient(to),
      kind,
      messageId,
      waId,
      errorCode: json.error?.code,
      errorType: json.error?.type,
      errorSubcode: json.error?.error_subcode,
      fbtraceId: json.error?.fbtrace_id,
      meta: safeMeta,
    },
    "WhatsApp Cloud API response",
  );

  if (!res.ok || json.error) {
    throw new HttpError(502, metaUserMessage(json, res.status), "WHATSAPP_SEND_FAILED");
  }

  return {
    messageId,
    waId,
    httpStatus: res.status,
    graphVersion: version,
    meta: safeMeta,
  };
}

export async function sendWhatsAppText(toRaw: string, message: string): Promise<WhatsAppSendResult> {
  return postWhatsAppMessage(
    toRaw,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      type: "text",
      text: { preview_url: false, body: message },
    },
    "text",
  );
}

/** Send login/signup OTP to the user's own WhatsApp number (not a fixed env recipient). */
export async function sendWhatsAppOtp(
  mobile: string,
  otp: string,
  purpose: "login" | "signup",
): Promise<WhatsAppSendResult> {
  const template = env.WHATSAPP_OTP_TEMPLATE_NAME?.trim();
  if (template) {
    const language = (env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || "en").trim();
    // Auth / copy-code templates require OTP in body AND button (Meta error 131008 if button omitted).
    return postWhatsAppMessage(
      mobile,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        type: "template",
        template: {
          name: template,
          language: { code: language },
          components: [
            { type: "body", parameters: [{ type: "text", text: otp }] },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: otp }],
            },
          ],
        },
      },
      "template",
    );
  }

  const label = purpose === "signup" ? "signup" : "login";
  return sendWhatsAppText(
    mobile,
    `AsanPay ${label} OTP: ${otp}\nValid for 15 minutes. Do not share this code.`,
  );
}

export function defaultRecipient(): string | undefined {
  return env.WHATSAPP_RECIPIENT_NUMBER?.trim() || undefined;
}
