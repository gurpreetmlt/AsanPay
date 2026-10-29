import { desc, eq, sql } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db/postgres";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { users, webhookKeys } from "../../db/postgres/schema";
import { decryptPII, encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { verifyAdminStepUpTotp } from "../auth/auth.service";
import {
  ROTATION_GRACE_MS,
  buildCallbackUrl,
  callbackNote,
  generateWebhookSecret,
  isKeyUsable,
  maskSecret,
  maskedCallbackUrl,
  matchWebhookToken,
  secretLast4,
  type WebhookKeyCandidate,
  type WebhookKeySource,
  type WebhookProvider,
} from "./webhookKeys.helpers";

const CACHE_TTL_MS = 60_000;
const USAGE_WRITE_INTERVAL_MS = 60_000;
const ENV_KEY_ID = "env";

type ProviderKeys = { at: number; anyInDb: boolean; usable: WebhookKeyCandidate[] };

const keyCache = new Map<WebhookProvider, ProviderKeys>();
const lastUsageWriteAt = new Map<string, number>();
const pendingUses = new Map<string, number>();

export function invalidateWebhookKeyCache(): void {
  keyCache.clear();
}

function envSecret(provider: WebhookProvider): string | null {
  const raw =
    provider === "noble"
      ? env.NOBLE_CALLBACK_SECRET
      : provider === "vyaparapi"
        ? env.VYAPARAPI_CALLBACK_SECRET
        : provider === "telegram"
          ? env.TELEGRAM_WEBHOOK_SECRET
          : env.WHATSAPP_APP_SECRET;
  return raw?.trim() || null;
}

async function loadProviderKeys(provider: WebhookProvider): Promise<ProviderKeys> {
  const hit = keyCache.get(provider);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

  const rows = await db
    .select({
      id: webhookKeys.id,
      secretEncrypted: webhookKeys.secretEncrypted,
      status: webhookKeys.status,
      expiresAt: webhookKeys.expiresAt,
    })
    .from(webhookKeys)
    .where(eq(webhookKeys.provider, provider));

  const now = new Date();
  const usable: WebhookKeyCandidate[] = [];
  for (const row of rows) {
    if (!isKeyUsable(row, now)) continue;
    try {
      usable.push({ id: row.id, secret: decryptPII(row.secretEncrypted), status: row.status, expiresAt: row.expiresAt });
    } catch {
      logger.error({ keyId: row.id, provider }, "Webhook key could not be decrypted; skipping it");
    }
  }
  const entry: ProviderKeys = { at: Date.now(), anyInDb: rows.length > 0, usable };
  keyCache.set(provider, entry);
  return entry;
}

/** DB keys when the provider has any rows; otherwise (or when the DB read fails) the env secret. */
async function resolveKeys(provider: WebhookProvider): Promise<{ configured: boolean; candidates: WebhookKeyCandidate[] }> {
  const fallback = envSecret(provider);
  const envCandidates: WebhookKeyCandidate[] = fallback
    ? [{ id: ENV_KEY_ID, secret: fallback, status: "active", expiresAt: null }]
    : [];
  try {
    const keys = await loadProviderKeys(provider);
    if (keys.anyInDb) return { configured: true, candidates: keys.usable };
  } catch (err) {
    logger.error({ err, provider }, "Webhook keys could not be loaded; using the env secret only");
  }
  return { configured: envCandidates.length > 0, candidates: envCandidates };
}

/** True when callbacks for this provider are authenticated at all (any DB key, even disabled, or env). */
export async function isWebhookAuthConfigured(provider: WebhookProvider): Promise<boolean> {
  return (await resolveKeys(provider)).configured;
}

/** True when at least one key currently accepts callbacks. */
export async function hasWebhookSecret(provider: WebhookProvider): Promise<boolean> {
  return (await resolveKeys(provider)).candidates.length > 0;
}

/** Usable secrets for signature schemes (HMAC) where the caller must try each one. */
export async function getWebhookSecrets(provider: WebhookProvider): Promise<{ id: string; secret: string }[]> {
  const now = new Date();
  return (await resolveKeys(provider)).candidates
    .filter((c) => isKeyUsable(c, now))
    .map((c) => ({ id: c.id, secret: c.secret }));
}

export function recordWebhookKeyUse(keyId: string): void {
  if (keyId === ENV_KEY_ID) return;
  pendingUses.set(keyId, (pendingUses.get(keyId) ?? 0) + 1);
  const now = Date.now();
  if (now - (lastUsageWriteAt.get(keyId) ?? 0) < USAGE_WRITE_INTERVAL_MS) return;
  lastUsageWriteAt.set(keyId, now);
  const count = pendingUses.get(keyId) ?? 1;
  pendingUses.delete(keyId);
  void db
    .update(webhookKeys)
    .set({ lastUsedAt: new Date(now), useCount: sql`${webhookKeys.useCount} + ${count}` })
    .where(eq(webhookKeys.id, keyId))
    .catch((err: unknown) => logger.error({ err, keyId }, "Failed to record webhook key use"));
}

export async function verifyWebhookToken(provider: WebhookProvider, token: string | null | undefined): Promise<boolean> {
  const { candidates } = await resolveKeys(provider);
  const matched = matchWebhookToken(token, candidates);
  if (!matched) return false;
  recordWebhookKeyUse(matched);
  return true;
}

// ---------------------------------------------------------------------------
// Admin management
// ---------------------------------------------------------------------------

export interface AdminContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface WebhookKeyView {
  id: string;
  provider: string;
  name: string;
  notes: string | null;
  last4: string;
  maskedSecret: string;
  source: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  createdByName: string | null;
  lastUsedAt: string | null;
  useCount: number;
  disabledAt: string | null;
  callbackUrl: string | null;
  callbackNote: string | null;
}

function publicApiUrl(): string | undefined {
  return process.env.API_PUBLIC_URL;
}

type KeyRow = typeof webhookKeys.$inferSelect;

function toView(row: KeyRow, createdByName: string | null): WebhookKeyView {
  const provider = row.provider as WebhookProvider;
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    notes: row.notes,
    last4: row.secretLast4,
    maskedSecret: maskSecret(row.secretLast4),
    source: row.source,
    status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByName,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    useCount: row.useCount,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    callbackUrl: maskedCallbackUrl(provider, publicApiUrl(), row.secretLast4),
    callbackNote: callbackNote(provider),
  };
}

async function loadKey(id: string): Promise<KeyRow> {
  const [row] = await db.select().from(webhookKeys).where(eq(webhookKeys.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Webhook key not found. Refresh the list and try again.", "WEBHOOK_KEY_NOT_FOUND");
  return row;
}

async function audit(
  adminId: string,
  action: string,
  row: Pick<KeyRow, "id" | "provider" | "secretLast4">,
  ctx: AdminContext,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await insertAuditLog({
    userId: adminId,
    action,
    entityType: "webhook_key",
    entityId: row.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { provider: row.provider, keyId: row.id, last4: row.secretLast4, ...extra },
  });
}

export async function listWebhookKeys(): Promise<WebhookKeyView[]> {
  const rows = await db
    .select({ key: webhookKeys, createdByName: users.name })
    .from(webhookKeys)
    .leftJoin(users, eq(users.id, webhookKeys.createdBy))
    .orderBy(desc(webhookKeys.createdAt));
  return rows.map((r) => toView(r.key, r.createdByName ?? null));
}

export async function createWebhookKey(
  adminId: string,
  input: { provider: WebhookProvider; name: string; notes?: string | null; secret?: string | null },
  ctx: AdminContext,
): Promise<WebhookKeyView> {
  const pasted = input.secret?.trim() || null;
  const secret = pasted ?? generateWebhookSecret();
  const source: WebhookKeySource = pasted ? "pasted" : "generated";
  const [row] = await db
    .insert(webhookKeys)
    .values({
      provider: input.provider,
      name: input.name.trim(),
      notes: input.notes?.trim() || null,
      secretEncrypted: encryptPII(secret),
      secretLast4: secretLast4(secret),
      source,
      createdBy: adminId,
    })
    .returning();
  invalidateWebhookKeyCache();
  await audit(adminId, "admin.webhook_key_create", row!, ctx, { source });
  return toView(row!, null);
}

export async function revealWebhookKey(
  adminId: string,
  id: string,
  totpCode: string,
  ctx: AdminContext,
): Promise<{ secret: string; callbackUrl: string | null; callbackNote: string | null }> {
  const row = await loadKey(id);
  const check = await verifyAdminStepUpTotp(adminId, totpCode);
  if (check === "not_enabled") {
    throw new HttpError(
      403,
      "Turn on two-factor login in Admin → Security before viewing keys.",
      "ADMIN_TOTP_NOT_ENABLED",
    );
  }
  if (check === "incorrect") {
    await audit(adminId, "admin.webhook_key_reveal_failed", row, ctx);
    throw new HttpError(422, "Incorrect 6-digit code. Check your authenticator app and try again.", "TOTP_INCORRECT");
  }
  const secret = decryptPII(row.secretEncrypted);
  await audit(adminId, "admin.webhook_key_reveal", row, ctx);
  const provider = row.provider as WebhookProvider;
  return {
    secret,
    callbackUrl: buildCallbackUrl(provider, publicApiUrl(), secret),
    callbackNote: callbackNote(provider),
  };
}

export async function rotateWebhookKey(adminId: string, id: string, ctx: AdminContext): Promise<WebhookKeyView> {
  const secret = generateWebhookSecret();
  const created = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(webhookKeys).where(eq(webhookKeys.id, id)).for("update").limit(1);
    if (!old) throw new HttpError(404, "Webhook key not found. Refresh the list and try again.", "WEBHOOK_KEY_NOT_FOUND");
    if (old.status !== "active") {
      throw new HttpError(409, "This key is disabled. Generate a new callback key instead.", "WEBHOOK_KEY_DISABLED");
    }
    if (old.expiresAt) {
      throw new HttpError(
        409,
        "This key was already rotated. Rotate the newer key for this provider instead.",
        "WEBHOOK_KEY_ALREADY_ROTATED",
      );
    }
    await tx
      .update(webhookKeys)
      .set({ expiresAt: new Date(Date.now() + ROTATION_GRACE_MS) })
      .where(eq(webhookKeys.id, old.id));
    const [row] = await tx
      .insert(webhookKeys)
      .values({
        provider: old.provider,
        name: old.name,
        notes: old.notes,
        secretEncrypted: encryptPII(secret),
        secretLast4: secretLast4(secret),
        source: "generated",
        rotatedFromId: old.id,
        createdBy: adminId,
      })
      .returning();
    return { old, row: row! };
  });
  invalidateWebhookKeyCache();
  await audit(adminId, "admin.webhook_key_rotate", created.row, ctx, {
    rotatedFromId: created.old.id,
    oldLast4: created.old.secretLast4,
  });
  return toView(created.row, null);
}

export async function disableWebhookKey(
  adminId: string,
  id: string,
  reason: string | null,
  ctx: AdminContext,
): Promise<WebhookKeyView> {
  const row = await loadKey(id);
  if (row.status === "disabled") {
    throw new HttpError(409, "This key is already disabled.", "WEBHOOK_KEY_DISABLED");
  }
  const [updated] = await db
    .update(webhookKeys)
    .set({ status: "disabled", disabledAt: new Date() })
    .where(eq(webhookKeys.id, id))
    .returning();
  invalidateWebhookKeyCache();
  await audit(adminId, "admin.webhook_key_disable", row, ctx, reason ? { reason } : {});
  return toView(updated!, null);
}
