import { and, desc, eq, inArray } from "drizzle-orm";
import { env } from "../../../config/env";
import { db } from "../../../db/postgres";
import {
  users,
  whatsappBroadcastRecipients,
  whatsappBroadcasts,
} from "../../../db/postgres/schema";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import { sendWhatsAppTemplateMessage } from "../whatsapp.service";
import { logOutboundWhatsAppMessage, normalizeWaId } from "./support.service";

const AGENT_ROLES = ["retailer", "distributor", "super_distributor"] as const;
export type BroadcastRole = (typeof AGENT_ROLES)[number];

const MAX_BROADCAST_RECIPIENTS = 500;
const SEND_GAP_MS = 250;

function assertRoles(roles: string[]): BroadcastRole[] {
  const unique = [...new Set(roles.map((r) => r.trim()).filter(Boolean))];
  if (!unique.length) {
    throw new HttpError(422, "Select at least one role for the audience", "BROADCAST_ROLES_REQUIRED");
  }
  for (const r of unique) {
    if (!AGENT_ROLES.includes(r as BroadcastRole)) {
      throw new HttpError(
        422,
        `Invalid role “${r}”. Allowed: retailer, distributor, super_distributor`,
        "BROADCAST_ROLE_INVALID",
      );
    }
  }
  return unique as BroadcastRole[];
}

export async function countBroadcastAudience(rolesRaw: string[]) {
  const roles = assertRoles(rolesRaw);
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), inArray(users.role, roles)));
  return { roles, count: rows.length, max: MAX_BROADCAST_RECIPIENTS };
}

export async function listBroadcasts(limit = 30) {
  return db
    .select({
      id: whatsappBroadcasts.id,
      templateName: whatsappBroadcasts.templateName,
      templateLanguage: whatsappBroadcasts.templateLanguage,
      bodyText: whatsappBroadcasts.bodyText,
      roles: whatsappBroadcasts.roles,
      status: whatsappBroadcasts.status,
      totalCount: whatsappBroadcasts.totalCount,
      sentCount: whatsappBroadcasts.sentCount,
      failedCount: whatsappBroadcasts.failedCount,
      startedAt: whatsappBroadcasts.startedAt,
      completedAt: whatsappBroadcasts.completedAt,
      createdAt: whatsappBroadcasts.createdAt,
    })
    .from(whatsappBroadcasts)
    .orderBy(desc(whatsappBroadcasts.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getBroadcast(broadcastId: string) {
  const [broadcast] = await db
    .select()
    .from(whatsappBroadcasts)
    .where(eq(whatsappBroadcasts.id, broadcastId))
    .limit(1);
  if (!broadcast) return null;

  const recipients = await db
    .select({
      id: whatsappBroadcastRecipients.id,
      userId: whatsappBroadcastRecipients.userId,
      mobile: whatsappBroadcastRecipients.mobile,
      waId: whatsappBroadcastRecipients.waId,
      status: whatsappBroadcastRecipients.status,
      wamid: whatsappBroadcastRecipients.wamid,
      errorMessage: whatsappBroadcastRecipients.errorMessage,
      sentAt: whatsappBroadcastRecipients.sentAt,
      userName: users.name,
      userRole: users.role,
    })
    .from(whatsappBroadcastRecipients)
    .leftJoin(users, eq(whatsappBroadcastRecipients.userId, users.id))
    .where(eq(whatsappBroadcastRecipients.broadcastId, broadcastId))
    .orderBy(desc(whatsappBroadcastRecipients.sentAt), whatsappBroadcastRecipients.mobile);

  return { broadcast, recipients };
}

export async function createBroadcast(opts: {
  createdBy: string;
  roles: string[];
  bodyText: string;
  templateName?: string;
}): Promise<{ id: string; totalCount: number }> {
  const roles = assertRoles(opts.roles);
  const bodyText = opts.bodyText.trim();
  if (!bodyText) {
    throw new HttpError(422, "Broadcast message text cannot be empty", "BROADCAST_BODY_EMPTY");
  }
  if (bodyText.length > 1024) {
    throw new HttpError(
      422,
      "Broadcast message text must be at most 1024 characters",
      "BROADCAST_BODY_TOO_LONG",
    );
  }

  const templateName =
    opts.templateName?.trim() || env.WHATSAPP_SUPPORT_TEMPLATE_NAME?.trim() || "";
  if (!templateName) {
    throw new HttpError(
      422,
      "Set WHATSAPP_SUPPORT_TEMPLATE_NAME to an approved template, or pass templateName",
      "BROADCAST_TEMPLATE_REQUIRED",
    );
  }
  const templateLanguage = env.WHATSAPP_SUPPORT_TEMPLATE_LANGUAGE || "en";

  const agents = await db
    .select({
      id: users.id,
      mobile: users.mobile,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.isActive, true), inArray(users.role, roles)));

  if (!agents.length) {
    throw new HttpError(
      422,
      "No active agents match the selected roles",
      "BROADCAST_AUDIENCE_EMPTY",
    );
  }
  if (agents.length > MAX_BROADCAST_RECIPIENTS) {
    throw new HttpError(
      422,
      `Audience is ${agents.length} agents. Max per broadcast is ${MAX_BROADCAST_RECIPIENTS}. Narrow the roles or send in batches.`,
      "BROADCAST_AUDIENCE_TOO_LARGE",
    );
  }

  const [broadcast] = await db
    .insert(whatsappBroadcasts)
    .values({
      createdBy: opts.createdBy,
      templateName,
      templateLanguage,
      bodyText,
      roles,
      status: "queued",
      totalCount: agents.length,
    })
    .returning({ id: whatsappBroadcasts.id });

  if (!broadcast) {
    throw new HttpError(500, "Failed to create broadcast", "BROADCAST_CREATE_FAILED");
  }

  await db.insert(whatsappBroadcastRecipients).values(
    agents.map((a) => ({
      broadcastId: broadcast.id,
      userId: a.id,
      mobile: a.mobile,
      waId: normalizeWaId(a.mobile),
      status: "pending" as const,
    })),
  );

  void processBroadcast(broadcast.id).catch((err) => {
    logger.error({ err, broadcastId: broadcast.id }, "WhatsApp broadcast processing failed");
  });

  return { id: broadcast.id, totalCount: agents.length };
}

async function processBroadcast(broadcastId: string): Promise<void> {
  const [broadcast] = await db
    .select()
    .from(whatsappBroadcasts)
    .where(eq(whatsappBroadcasts.id, broadcastId))
    .limit(1);
  if (!broadcast || broadcast.status === "completed" || broadcast.status === "cancelled") return;

  await db
    .update(whatsappBroadcasts)
    .set({ status: "sending", startedAt: new Date() })
    .where(eq(whatsappBroadcasts.id, broadcastId));

  const pending = await db
    .select()
    .from(whatsappBroadcastRecipients)
    .where(
      and(
        eq(whatsappBroadcastRecipients.broadcastId, broadcastId),
        eq(whatsappBroadcastRecipients.status, "pending"),
      ),
    );

  let sentCount = broadcast.sentCount;
  let failedCount = broadcast.failedCount;

  for (const row of pending) {
    try {
      const result = await sendWhatsAppTemplateMessage(row.waId, {
        name: broadcast.templateName,
        language: broadcast.templateLanguage,
        bodyParams: [broadcast.bodyText],
      });
      await db
        .update(whatsappBroadcastRecipients)
        .set({
          status: "sent",
          wamid: result.messageId,
          sentAt: new Date(),
          errorMessage: null,
        })
        .where(eq(whatsappBroadcastRecipients.id, row.id));
      sentCount += 1;
      void logOutboundWhatsAppMessage({
        toMobile: row.waId,
        wamid: result.messageId,
        body: broadcast.bodyText,
        messageType: "template",
        isOtp: false,
      });
    } catch (err) {
      const message =
        err instanceof HttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to send WhatsApp message";
      await db
        .update(whatsappBroadcastRecipients)
        .set({
          status: "failed",
          errorMessage: message.slice(0, 500),
          sentAt: new Date(),
        })
        .where(eq(whatsappBroadcastRecipients.id, row.id));
      failedCount += 1;
      logger.warn(
        { broadcastId, recipientId: row.id, mobile: row.mobile.slice(-4), message },
        "WhatsApp broadcast recipient failed",
      );
    }

    await db
      .update(whatsappBroadcasts)
      .set({ sentCount, failedCount })
      .where(eq(whatsappBroadcasts.id, broadcastId));

    await new Promise((r) => setTimeout(r, SEND_GAP_MS));
  }

  await db
    .update(whatsappBroadcasts)
    .set({
      status: "completed",
      sentCount,
      failedCount,
      completedAt: new Date(),
    })
    .where(eq(whatsappBroadcasts.id, broadcastId));
}
