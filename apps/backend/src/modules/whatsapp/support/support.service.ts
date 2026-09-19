import { createHash } from "crypto";
import { desc, eq, sql } from "drizzle-orm";
import { env } from "../../../config/env";
import { db } from "../../../db/postgres";
import {
  users,
  whatsappConversations,
  whatsappMessages,
  whatsappWebhookEvents,
} from "../../../db/postgres/schema";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import { sendWhatsAppText, sendWhatsAppTemplateMessage } from "../whatsapp.service";

type MetaContact = { profile?: { name?: string }; wa_id?: string };
type MetaTextMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};
type MetaStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};
type MetaValue = {
  contacts?: MetaContact[];
  messages?: MetaTextMessage[];
  statuses?: MetaStatus[];
  metadata?: { display_phone_number?: string; phone_number_id?: string };
};

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Normalize to WhatsApp-style id: India mobiles → 91XXXXXXXXXX when 10 digits. */
export function normalizeWaId(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return d;
}

function previewOf(body: string | null | undefined, max = 120): string {
  const t = (body ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function extractBody(msg: MetaTextMessage): string {
  if (msg.type === "text" && msg.text?.body) return msg.text.body;
  if (msg.button?.text) return msg.button.text;
  if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title;
  if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title;
  if (msg.type && msg.type !== "text") return `[${msg.type}]`;
  return "";
}

async function findUserIdByWaId(waId: string): Promise<string | null> {
  const d = digitsOnly(waId);
  const local10 = d.length >= 10 ? d.slice(-10) : d;
  const row = await db.query.users.findFirst({
    where: eq(users.mobile, local10),
    columns: { id: true },
  });
  return row?.id ?? null;
}

async function upsertConversation(opts: {
  waId: string;
  profileName?: string | null;
  preview?: string | null;
  inbound?: boolean;
  bumpUnread?: boolean;
}): Promise<string> {
  const now = new Date();
  const existing = await db.query.whatsappConversations.findFirst({
    where: eq(whatsappConversations.waId, opts.waId),
    columns: { id: true, userId: true, unreadCount: true },
  });

  if (existing) {
    const userId = existing.userId ?? (await findUserIdByWaId(opts.waId));
    const patch: Partial<typeof whatsappConversations.$inferInsert> = {
      phoneDisplay: opts.waId,
      updatedAt: now,
      lastMessageAt: now,
    };
    if (opts.profileName) patch.profileName = opts.profileName;
    if (userId) patch.userId = userId;
    if (opts.inbound) patch.lastInboundAt = now;
    if (opts.preview != null) patch.lastMessagePreview = opts.preview;
    if (opts.bumpUnread) patch.unreadCount = (existing.unreadCount ?? 0) + 1;
    await db.update(whatsappConversations).set(patch).where(eq(whatsappConversations.id, existing.id));
    return existing.id;
  }

  const userId = await findUserIdByWaId(opts.waId);
  const [inserted] = await db
    .insert(whatsappConversations)
    .values({
      waId: opts.waId,
      phoneDisplay: opts.waId,
      profileName: opts.profileName || null,
      userId,
      lastMessageAt: now,
      lastInboundAt: opts.inbound ? now : null,
      lastMessagePreview: opts.preview ?? null,
      unreadCount: opts.bumpUnread ? 1 : 0,
      updatedAt: now,
    })
    .returning({ id: whatsappConversations.id });
  if (!inserted) {
    throw new Error("Failed to create WhatsApp conversation");
  }
  return inserted.id;
}

async function claimEventKey(eventKey: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    await db.insert(whatsappWebhookEvents).values({
      eventKey,
      payload,
      processedAt: new Date(),
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") return false;
    throw err;
  }
}

function mapStatus(raw: string | undefined): "sent" | "delivered" | "read" | "failed" | "pending" {
  switch ((raw ?? "").toLowerCase()) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

async function ingestInboundMessage(msg: MetaTextMessage, contactName?: string | null): Promise<void> {
  const from = msg.from?.trim();
  if (!from || !msg.id) return;
  const waId = normalizeWaId(from);
  const eventKey = `msg:${msg.id}`;
  const claimed = await claimEventKey(eventKey, msg as unknown as Record<string, unknown>);
  if (!claimed) return;

  const body = extractBody(msg);
  const conversationId = await upsertConversation({
    waId,
    profileName: contactName,
    preview: previewOf(body) || "[message]",
    inbound: true,
    bumpUnread: true,
  });

  const ts = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();
  await db.insert(whatsappMessages).values({
    conversationId,
    wamid: msg.id,
    direction: "inbound",
    messageType: msg.type || "text",
    body: body || null,
    status: "delivered",
    raw: msg as unknown as Record<string, unknown>,
    createdAt: Number.isNaN(ts.getTime()) ? new Date() : ts,
    statusAt: new Date(),
  });
}

async function ingestStatus(st: MetaStatus): Promise<void> {
  if (!st.id || !st.status) return;
  const eventKey = `status:${st.id}:${st.status}`;
  const claimed = await claimEventKey(eventKey, st as unknown as Record<string, unknown>);
  if (!claimed) return;

  const status = mapStatus(st.status);
  const statusAt = st.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date();
  const err = st.errors?.[0];

  await db
    .update(whatsappMessages)
    .set({
      status,
      statusAt: Number.isNaN(statusAt.getTime()) ? new Date() : statusAt,
      errorCode: err?.code != null ? String(err.code) : undefined,
      errorMessage: err?.message || err?.title || undefined,
    })
    .where(eq(whatsappMessages.wamid, st.id));
}

/** Process Meta Cloud API webhook body. Always safe to call; duplicates skipped. */
export async function processWhatsAppWebhookPayload(body: unknown): Promise<void> {
  const root = body as { object?: string; entry?: Array<{ changes?: Array<{ value?: MetaValue; field?: string }> }> };
  if (root?.object && root.object !== "whatsapp_business_account") {
    logger.info({ object: root.object }, "WhatsApp webhook ignored (not WABA)");
    return;
  }

  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const nameByWa = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nameByWa.set(normalizeWaId(c.wa_id), c.profile.name);
      }
      for (const msg of value.messages ?? []) {
        try {
          const name = msg.from ? nameByWa.get(normalizeWaId(msg.from)) : undefined;
          await ingestInboundMessage(msg, name);
        } catch (err) {
          logger.error({ err, wamid: msg.id }, "WhatsApp inbound ingest failed");
        }
      }
      for (const st of value.statuses ?? []) {
        try {
          await ingestStatus(st);
        } catch (err) {
          logger.error({ err, wamid: st.id }, "WhatsApp status ingest failed");
        }
      }
    }
  }
}

/** Log outbound OTP (or other) sends into inbox when support tables exist. Never throws to caller. */
export async function logOutboundWhatsAppMessage(opts: {
  toMobile: string;
  wamid?: string | null;
  body: string;
  messageType?: string;
  isOtp?: boolean;
}): Promise<void> {
  try {
    const waId = normalizeWaId(opts.toMobile);
    if (!waId) return;
    const conversationId = await upsertConversation({
      waId,
      preview: previewOf(opts.body) || (opts.isOtp ? "[OTP]" : "[outbound]"),
      inbound: false,
      bumpUnread: false,
    });

    if (opts.wamid) {
      const existing = await db.query.whatsappMessages.findFirst({
        where: eq(whatsappMessages.wamid, opts.wamid),
        columns: { id: true },
      });
      if (existing) return;
    }

    await db.insert(whatsappMessages).values({
      conversationId,
      wamid: opts.wamid || null,
      direction: "outbound",
      messageType: opts.messageType || (opts.isOtp ? "template" : "text"),
      body: opts.isOtp ? "AsanPay OTP sent" : opts.body,
      status: "sent",
      isOtp: opts.isOtp ?? false,
      statusAt: new Date(),
    });
  } catch (err) {
    logger.warn({ err }, "WhatsApp outbound log skipped");
  }
}

export async function listConversations(limit = 50) {
  const rows = await db
    .select({
      id: whatsappConversations.id,
      waId: whatsappConversations.waId,
      phoneDisplay: whatsappConversations.phoneDisplay,
      profileName: whatsappConversations.profileName,
      userId: whatsappConversations.userId,
      userName: users.name,
      userMobile: users.mobile,
      userRole: users.role,
      lastMessageAt: whatsappConversations.lastMessageAt,
      lastInboundAt: whatsappConversations.lastInboundAt,
      lastMessagePreview: whatsappConversations.lastMessagePreview,
      unreadCount: whatsappConversations.unreadCount,
    })
    .from(whatsappConversations)
    .leftJoin(users, eq(whatsappConversations.userId, users.id))
    .orderBy(desc(whatsappConversations.lastMessageAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows;
}

export async function listMessages(conversationId: string, limit = 100) {
  const rows = await db
    .select({
      id: whatsappMessages.id,
      conversationId: whatsappMessages.conversationId,
      wamid: whatsappMessages.wamid,
      direction: whatsappMessages.direction,
      messageType: whatsappMessages.messageType,
      body: whatsappMessages.body,
      status: whatsappMessages.status,
      errorCode: whatsappMessages.errorCode,
      errorMessage: whatsappMessages.errorMessage,
      isOtp: whatsappMessages.isOtp,
      createdAt: whatsappMessages.createdAt,
      statusAt: whatsappMessages.statusAt,
    })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.conversationId, conversationId))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.reverse();
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await db
    .update(whatsappConversations)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(eq(whatsappConversations.id, conversationId));
}

export async function getConversation(conversationId: string) {
  const [row] = await db
    .select({
      id: whatsappConversations.id,
      waId: whatsappConversations.waId,
      phoneDisplay: whatsappConversations.phoneDisplay,
      profileName: whatsappConversations.profileName,
      userId: whatsappConversations.userId,
      userName: users.name,
      userMobile: users.mobile,
      userRole: users.role,
      lastMessageAt: whatsappConversations.lastMessageAt,
      lastInboundAt: whatsappConversations.lastInboundAt,
      unreadCount: whatsappConversations.unreadCount,
    })
    .from(whatsappConversations)
    .leftJoin(users, eq(whatsappConversations.userId, users.id))
    .where(eq(whatsappConversations.id, conversationId))
    .limit(1);
  return row ?? null;
}

const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isCustomerWindowOpen(lastInboundAt: Date | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - lastInboundAt.getTime() < CUSTOMER_WINDOW_MS;
}

export function windowClosesAt(lastInboundAt: Date | null | undefined): Date | null {
  if (!lastInboundAt) return null;
  return new Date(lastInboundAt.getTime() + CUSTOMER_WINDOW_MS);
}

export async function replyToConversation(opts: {
  conversationId: string;
  text: string;
  /** Force approved template even inside 24h window. */
  useTemplate?: boolean;
  templateName?: string;
}): Promise<{
  message: {
    id: string;
    conversationId: string;
    wamid: string | null;
    direction: "outbound";
    messageType: string;
    body: string | null;
    status: string;
    isOtp: boolean;
    createdAt: Date;
  };
  usedTemplate: boolean;
  windowOpen: boolean;
}> {
  const text = opts.text.trim();
  if (!text) {
    throw new HttpError(422, "Message cannot be empty", "WHATSAPP_REPLY_EMPTY");
  }
  if (text.length > 4096) {
    throw new HttpError(422, "Message must be at most 4096 characters", "WHATSAPP_REPLY_TOO_LONG");
  }

  const conversation = await getConversation(opts.conversationId);
  if (!conversation) {
    throw new HttpError(404, "Conversation not found", "WHATSAPP_CONVERSATION_NOT_FOUND");
  }

  const windowOpen = isCustomerWindowOpen(conversation.lastInboundAt);
  const templateName =
    opts.templateName?.trim() || env.WHATSAPP_SUPPORT_TEMPLATE_NAME?.trim() || "";
  const wantTemplate = Boolean(opts.useTemplate) || !windowOpen;

  let result: { messageId: string | null };
  let usedTemplate = false;
  let messageType = "text";

  if (wantTemplate) {
    if (!templateName) {
      throw new HttpError(
        422,
        windowOpen
          ? "No support template configured. Set WHATSAPP_SUPPORT_TEMPLATE_NAME or send free text."
          : "Customer messaging window is closed (24 hours). Set WHATSAPP_SUPPORT_TEMPLATE_NAME to an approved template with one body variable, or wait until the customer messages you again.",
        "WHATSAPP_TEMPLATE_REQUIRED",
      );
    }
    result = await sendWhatsAppTemplateMessage(conversation.waId, {
      name: templateName,
      language: env.WHATSAPP_SUPPORT_TEMPLATE_LANGUAGE,
      bodyParams: [text],
    });
    usedTemplate = true;
    messageType = "template";
  } else {
    result = await sendWhatsAppText(conversation.waId, text);
  }

  const now = new Date();
  const preview = text.length > 120 ? `${text.slice(0, 119)}…` : text;
  await db
    .update(whatsappConversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: preview,
      updatedAt: now,
    })
    .where(eq(whatsappConversations.id, conversation.id));

  const [inserted] = await db
    .insert(whatsappMessages)
    .values({
      conversationId: conversation.id,
      wamid: result.messageId,
      direction: "outbound",
      messageType,
      body: text,
      status: "sent",
      isOtp: false,
      statusAt: now,
    })
    .returning({
      id: whatsappMessages.id,
      conversationId: whatsappMessages.conversationId,
      wamid: whatsappMessages.wamid,
      direction: whatsappMessages.direction,
      messageType: whatsappMessages.messageType,
      body: whatsappMessages.body,
      status: whatsappMessages.status,
      isOtp: whatsappMessages.isOtp,
      createdAt: whatsappMessages.createdAt,
    });

  if (!inserted) {
    throw new HttpError(500, "Failed to save outbound message", "WHATSAPP_REPLY_SAVE_FAILED");
  }

  return {
    message: {
      id: inserted.id,
      conversationId: inserted.conversationId,
      wamid: inserted.wamid,
      direction: "outbound",
      messageType: inserted.messageType,
      body: inserted.body,
      status: inserted.status,
      isOtp: inserted.isOtp,
      createdAt: inserted.createdAt,
    },
    usedTemplate,
    windowOpen,
  };
}

/** Stable key when Meta sends empty/odd payloads — avoid unique collisions across retries. */
export function hashPayloadKey(payload: unknown): string {
  const h = createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex").slice(0, 40);
  return `raw:${h}`;
}

export async function supportUnreadTotal(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${whatsappConversations.unreadCount}), 0)` })
    .from(whatsappConversations);
  return Number(row?.total ?? 0);
}
