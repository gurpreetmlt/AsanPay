import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db/postgres";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { users, webhookDeliveries, webhookKeys } from "../../db/postgres/schema";
import { sendSlackAlert } from "../../utils/alert";
import { decryptPII, encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { verifyAdminStepUpTotp } from "../auth/auth.service";
import {
  DELIVERY_KEEP_PER_PROVIDER,
  PROVIDER_LABELS,
  REJECT_ALERT_THRESHOLD,
  ROTATION_GRACE_MS,
  TEST_CALLBACK_SOURCE,
  WEBHOOK_PROVIDERS,
  WEBHOOK_SERVICES,
  buildCallbackUrl,
  buildProviderMessage,
  callbackNote,
  callbackPath,
  classifyDelivery,
  evaluateRejectAlert,
  generateWebhookSecret,
  isKeyUsable,
  isRejectedDelivery,
  maskSecret,
  maskedCallbackUrl,
  matchWebhookToken,
  normalizeBaseUrl,
  providerHealthStatus,
  secretLast4,
  serverEnvironment,
  validateServices,
  type DeliveryResult,
  type ProviderHealthStatus,
  type RejectEvent,
  type RotationGraceHours,
  type WebhookEnvironment,
  type WebhookKeyCandidate,
  type WebhookKeySource,
  type WebhookProvider,
} from "./webhookKeys.helpers";

const CACHE_TTL_MS = 60_000;
const USAGE_WRITE_INTERVAL_MS = 60_000;
const ENV_KEY_ID = "env";
const PRUNE_SAMPLE_RATE = 1 / 50;
const MAX_TRACKED_REJECTS = 1000;
const TEST_TIMEOUT_MS = 10_000;

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

/** Id of the key that matched (`"env"` for the env fallback secret), or null. */
export async function matchWebhookKey(provider: WebhookProvider, token: string | null | undefined): Promise<string | null> {
  const { candidates } = await resolveKeys(provider);
  const matched = matchWebhookToken(token, candidates);
  if (matched) recordWebhookKeyUse(matched);
  return matched;
}

export async function verifyWebhookToken(provider: WebhookProvider, token: string | null | undefined): Promise<boolean> {
  return (await matchWebhookKey(provider, token)) != null;
}

/** Same as matchWebhookKey, and logs a rejected delivery (bad_token / no_token) when nothing matched. */
export async function checkCallbackToken(
  provider: WebhookProvider,
  token: string | null | undefined,
  ip: string | null,
): Promise<string | null> {
  const matched = await matchWebhookKey(provider, token);
  if (!matched) {
    recordWebhookDelivery({ provider, keyId: null, result: classifyDelivery({ token, matchedKeyId: null }), httpStatus: 401, ip });
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Callback deliveries + wrong-key alert
// ---------------------------------------------------------------------------

const rejectEvents = new Map<WebhookProvider, RejectEvent[]>();
const lastRejectAlertAt = new Map<WebhookProvider, number>();

function trackRejection(provider: WebhookProvider, ip: string | null): void {
  const now = Date.now();
  const events = [...(rejectEvents.get(provider) ?? []), { at: now, ip }];
  const decision = evaluateRejectAlert(events, now, lastRejectAlertAt.get(provider) ?? null);
  rejectEvents.set(provider, decision.recent.slice(-MAX_TRACKED_REJECTS));
  if (!decision.send) return;
  lastRejectAlertAt.set(provider, now);
  void sendSlackAlert(`Webhook callbacks rejected for ${PROVIDER_LABELS[provider]}`, "critical", {
    provider,
    count: decision.count,
    windowMinutes: 10,
    topIps: decision.topIps.map((t) => `${t.ip} (${t.count})`).join(", "),
    message: `${decision.count} callbacks with a wrong or missing key in 10 minutes. Check Admin → Webhooks & keys.`,
  }).catch((err: unknown) => logger.error({ err, provider }, "Failed to send webhook rejection alert"));
}

async function pruneDeliveries(provider: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM webhook_deliveries
    WHERE provider = ${provider}
      AND created_at < (
        SELECT created_at FROM webhook_deliveries
        WHERE provider = ${provider}
        ORDER BY created_at DESC
        OFFSET ${DELIVERY_KEEP_PER_PROVIDER - 1} LIMIT 1
      )
  `);
}

export interface DeliveryInput {
  provider: WebhookProvider;
  keyId: string | null;
  result: DeliveryResult;
  httpStatus: number | null;
  ip: string | null;
  txnRef?: string | null;
  note?: string | null;
}

/** Fire-and-forget: a logging failure must never block or fail the callback itself. */
export function recordWebhookDelivery(input: DeliveryInput): void {
  try {
    if (isRejectedDelivery(input.result)) trackRejection(input.provider, input.ip);
    const keyId = input.keyId && input.keyId !== ENV_KEY_ID ? input.keyId : null;
    void (async () => {
      await db.insert(webhookDeliveries).values({
        provider: input.provider,
        keyId,
        result: input.result,
        httpStatus: input.httpStatus,
        ip: input.ip?.slice(0, 64) ?? null,
        txnRef: input.txnRef?.slice(0, 80) || null,
        note: input.note?.slice(0, 200) || null,
      });
      if (Math.random() < PRUNE_SAMPLE_RATE) await pruneDeliveries(input.provider);
    })().catch((err: unknown) => logger.error({ err, provider: input.provider }, "Failed to record webhook delivery"));
  } catch (err) {
    logger.error({ err, provider: input.provider }, "Failed to record webhook delivery");
  }
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
  vendorName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  environment: WebhookEnvironment;
  rotatedFromId: string | null;
  notes: string | null;
  services: string[];
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

/** Full secret details — only returned right after a 2FA check (create, rotate, reveal). */
export interface WebhookKeySecret {
  secret: string;
  callbackUrl: string | null;
  callbackNote: string | null;
  providerMessage: string;
}

function publicApiUrl(): string | undefined {
  return process.env.API_PUBLIC_URL;
}

export function thisServerEnvironment(): WebhookEnvironment {
  return serverEnvironment(env.NODE_ENV, process.env.AGENT_PORTAL_URL);
}

type KeyRow = typeof webhookKeys.$inferSelect;

function toView(row: KeyRow, createdByName: string | null): WebhookKeyView {
  const provider = row.provider as WebhookProvider;
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    vendorName: row.vendorName?.trim() || PROVIDER_LABELS[provider] || row.provider,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    environment: (row.environment as WebhookEnvironment | null) ?? thisServerEnvironment(),
    rotatedFromId: row.rotatedFromId,
    notes: row.notes,
    services: Array.isArray(row.services) ? row.services : [],
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

function secretDetails(row: KeyRow, secret: string): WebhookKeySecret {
  const provider = row.provider as WebhookProvider;
  return {
    secret,
    callbackUrl: buildCallbackUrl(provider, publicApiUrl(), secret),
    callbackNote: callbackNote(provider),
    providerMessage: buildProviderMessage({
      provider,
      services: Array.isArray(row.services) ? row.services : [],
      secret,
      base: publicApiUrl(),
    }),
  };
}

async function loadKey(id: string): Promise<KeyRow> {
  const [row] = await db.select().from(webhookKeys).where(eq(webhookKeys.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Webhook key not found. Refresh the list and try again.", "WEBHOOK_KEY_NOT_FOUND");
  return row;
}

type AuditTarget = { id: string | null; provider: string; secretLast4: string | null };

async function audit(
  adminId: string,
  action: string,
  row: AuditTarget,
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

async function requireStepUp(
  adminId: string,
  totpCode: string,
  ctx: AdminContext,
  failed: { action: string; target: AuditTarget },
  verb: "viewing" | "managing" = "managing",
): Promise<void> {
  const check = await verifyAdminStepUpTotp(adminId, totpCode);
  if (check === "not_enabled") {
    throw new HttpError(403, `Turn on two-factor login in Admin → Security before ${verb} keys.`, "ADMIN_TOTP_NOT_ENABLED");
  }
  if (check === "incorrect") {
    await audit(adminId, failed.action, failed.target, ctx);
    throw new HttpError(422, "Incorrect 6-digit code. Check your authenticator app and try again.", "TOTP_INCORRECT");
  }
}

export async function listWebhookKeys(): Promise<WebhookKeyView[]> {
  const rows = await db
    .select({ key: webhookKeys, createdByName: users.name })
    .from(webhookKeys)
    .leftJoin(users, eq(users.id, webhookKeys.createdBy))
    .orderBy(desc(webhookKeys.createdAt));
  return rows.map((r) => toView(r.key, r.createdByName ?? null));
}

function servicesOrThrow(provider: WebhookProvider, services: readonly string[] | null | undefined): string[] {
  const check = validateServices(provider, services ?? WEBHOOK_SERVICES[provider]);
  if (!check.ok) throw new HttpError(422, check.message, "WEBHOOK_SERVICES_INVALID");
  return check.services;
}

/** Who holds a key and how to reach them — never part of the secret, so no 2FA. */
export interface KeyDetailsInput {
  name?: string;
  vendorName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  environment?: WebhookEnvironment | null;
  notes?: string | null;
}

const clean = (v: string | null | undefined) => (v == null ? null : v.trim() || null);

function detailColumns(input: KeyDetailsInput) {
  const out: Partial<typeof webhookKeys.$inferInsert> = {};
  if (input.name !== undefined) out.name = input.name.trim();
  if (input.vendorName !== undefined) out.vendorName = clean(input.vendorName);
  if (input.contactName !== undefined) out.contactName = clean(input.contactName);
  if (input.contactEmail !== undefined) out.contactEmail = clean(input.contactEmail)?.toLowerCase() ?? null;
  if (input.contactPhone !== undefined) out.contactPhone = clean(input.contactPhone);
  if (input.environment !== undefined) out.environment = input.environment;
  if (input.notes !== undefined) out.notes = clean(input.notes);
  return out;
}

export async function updateWebhookKeyDetails(adminId: string, id: string, input: KeyDetailsInput, ctx: AdminContext) {
  const row = await loadKey(id);
  const set = detailColumns(input);
  if (Object.keys(set).length === 0) throw new HttpError(422, "Change at least one field before saving", "NOTHING_TO_SAVE");
  const [updated] = await db.update(webhookKeys).set(set).where(eq(webhookKeys.id, id)).returning();
  const before = Object.fromEntries(Object.keys(set).map((k) => [k, row[k as keyof KeyRow] ?? null]));
  await audit(adminId, "admin.webhook_key_details", row, ctx, { before, after: set });
  const [creator] = updated!.createdBy
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, updated!.createdBy)).limit(1)
    : [];
  return toView(updated!, creator?.name ?? null);
}

export async function createWebhookKey(
  adminId: string,
  input: {
    provider: WebhookProvider;
    name: string;
    notes?: string | null;
    secret?: string | null;
    services?: string[] | null;
    totpCode: string;
  } & KeyDetailsInput,
  ctx: AdminContext,
): Promise<{ key: WebhookKeyView } & WebhookKeySecret> {
  const services = servicesOrThrow(input.provider, input.services);
  await requireStepUp(adminId, input.totpCode, ctx, {
    action: "admin.webhook_key_create_failed",
    target: { id: null, provider: input.provider, secretLast4: null },
  });
  const pasted = input.secret?.trim() || null;
  const secret = pasted ?? generateWebhookSecret();
  const source: WebhookKeySource = pasted ? "pasted" : "generated";
  const [row] = await db
    .insert(webhookKeys)
    .values({
      provider: input.provider,
      ...detailColumns(input),
      name: input.name.trim(),
      notes: input.notes?.trim() || null,
      environment: input.environment ?? thisServerEnvironment(),
      services,
      secretEncrypted: encryptPII(secret),
      secretLast4: secretLast4(secret),
      source,
      createdBy: adminId,
    })
    .returning();
  invalidateWebhookKeyCache();
  await audit(adminId, "admin.webhook_key_create", row!, ctx, { source, services });
  return { key: toView(row!, null), ...secretDetails(row!, secret) };
}

export async function revealWebhookKey(
  adminId: string,
  id: string,
  totpCode: string,
  ctx: AdminContext,
): Promise<WebhookKeySecret> {
  const row = await loadKey(id);
  await requireStepUp(adminId, totpCode, ctx, { action: "admin.webhook_key_reveal_failed", target: row }, "viewing");
  const secret = decryptPII(row.secretEncrypted);
  await audit(adminId, "admin.webhook_key_reveal", row, ctx);
  return secretDetails(row, secret);
}

export async function rotateWebhookKey(
  adminId: string,
  id: string,
  totpCode: string,
  ctx: AdminContext,
  graceHours: RotationGraceHours = 24,
): Promise<{ key: WebhookKeyView } & WebhookKeySecret> {
  const current = await loadKey(id);
  await requireStepUp(adminId, totpCode, ctx, { action: "admin.webhook_key_rotate_failed", target: current });
  const secret = generateWebhookSecret();
  const created = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(webhookKeys).where(eq(webhookKeys.id, id)).for("update").limit(1);
    if (!old) throw new HttpError(404, "Webhook key not found. Refresh the list and try again.", "WEBHOOK_KEY_NOT_FOUND");
    if (old.status !== "active") {
      throw new HttpError(409, "This key is revoked. Generate a new callback key instead.", "WEBHOOK_KEY_DISABLED");
    }
    if (old.expiresAt) {
      throw new HttpError(
        409,
        "This key was already regenerated. Regenerate the newer key for this provider instead.",
        "WEBHOOK_KEY_ALREADY_ROTATED",
      );
    }
    await tx
      .update(webhookKeys)
      .set({ expiresAt: new Date(Date.now() + (graceHours * ROTATION_GRACE_MS) / 24) })
      .where(eq(webhookKeys.id, old.id));
    const [row] = await tx
      .insert(webhookKeys)
      .values({
        provider: old.provider,
        name: old.name,
        vendorName: old.vendorName,
        contactName: old.contactName,
        contactEmail: old.contactEmail,
        contactPhone: old.contactPhone,
        environment: old.environment,
        notes: old.notes,
        services: old.services,
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
    graceHours,
  });
  return { key: toView(created.row, null), ...secretDetails(created.row, secret) };
}

export async function disableWebhookKey(
  adminId: string,
  id: string,
  input: { reason: string; totpCode: string },
  ctx: AdminContext,
): Promise<WebhookKeyView> {
  const row = await loadKey(id);
  if (row.status === "disabled") {
    throw new HttpError(409, "This key is already revoked.", "WEBHOOK_KEY_DISABLED");
  }
  await requireStepUp(adminId, input.totpCode, ctx, { action: "admin.webhook_key_disable_failed", target: row });
  const [updated] = await db
    .update(webhookKeys)
    .set({ status: "disabled", disabledAt: new Date() })
    .where(eq(webhookKeys.id, id))
    .returning();
  invalidateWebhookKeyCache();
  await audit(adminId, "admin.webhook_key_disable", row, ctx, { reason: input.reason });
  return toView(updated!, null);
}

/**
 * Permanently removes a key. Callbacks using it stop at once; the audit log keeps the record
 * (name, provider, last 4) and the callback log rows stay, unlinked from the key.
 */
export async function deleteWebhookKey(
  adminId: string,
  id: string,
  input: { reason: string; totpCode: string },
  ctx: AdminContext,
): Promise<{ id: string }> {
  const row = await loadKey(id);
  if (isKeyUsable(row)) {
    throw new HttpError(
      409,
      "Revoke this key before deleting it. Revoke stops callbacks at once; delete then removes the record.",
      "WEBHOOK_KEY_STILL_ACTIVE",
    );
  }
  await requireStepUp(adminId, input.totpCode, ctx, { action: "admin.webhook_key_delete_failed", target: row });
  await db.delete(webhookKeys).where(eq(webhookKeys.id, id));
  invalidateWebhookKeyCache();
  await audit(adminId, "admin.webhook_key_delete", row, ctx, {
    reason: input.reason,
    name: row.name,
    wasStatus: row.status,
  });
  return { id };
}

// ---------------------------------------------------------------------------
// Test callback
// ---------------------------------------------------------------------------

export interface TestCallbackResult {
  ok: boolean;
  httpStatus: number | null;
  message: string;
}

function describeTestFailure(status: number): string {
  if (status === 401) return "The callback URL rejected this key (HTTP 401). Make sure the key is active and try again in 1 minute.";
  if (status === 503) return "The callback URL says callbacks are not configured (HTTP 503).";
  if (status === 429) return "The callback URL is rate limiting requests (HTTP 429). Wait a minute and try again.";
  return `The callback URL answered with HTTP ${status} instead of confirming the test.`;
}

async function postTestCallback(provider: WebhookProvider, secret: string): Promise<TestCallbackResult> {
  const path = callbackPath(provider)!;
  const base = normalizeBaseUrl(publicApiUrl());
  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-callback-token": secret },
      body: JSON.stringify({ test: true, source: TEST_CALLBACK_SOURCE, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      httpStatus: null,
      message: timedOut
        ? `No answer from ${base} within 10 seconds. Check API_PUBLIC_URL and that the server is reachable.`
        : `Could not reach ${base}. Check API_PUBLIC_URL and that the server is reachable.`,
    };
  }
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  const ok = res.status === 200 && body?.message === "Test callback received";
  return { ok, httpStatus: res.status, message: ok ? "Test callback received ✓" : describeTestFailure(res.status) };
}

export async function sendTestCallback(adminId: string, id: string, ctx: AdminContext): Promise<TestCallbackResult> {
  const row = await loadKey(id);
  if (!isKeyUsable(row)) {
    throw new HttpError(409, "This key is revoked or expired. Send a test with an active key.", "WEBHOOK_KEY_NOT_ACTIVE");
  }
  const provider = row.provider as WebhookProvider;
  const secret = decryptPII(row.secretEncrypted);
  let result: TestCallbackResult;
  if (callbackPath(provider)) {
    result = await postTestCallback(provider, secret);
  } else {
    const { candidates } = await resolveKeys(provider);
    const accepted = matchWebhookToken(secret, candidates) === row.id;
    result = {
      ok: accepted,
      httpStatus: null,
      message: accepted
        ? `Key is active and would be accepted. ${PROVIDER_LABELS[provider]} keys are checked locally only — no callback was sent.`
        : `This key would be rejected right now. ${PROVIDER_LABELS[provider]} keys are checked locally only — no callback was sent.`,
    };
    recordWebhookDelivery({
      provider,
      keyId: row.id,
      result: accepted ? "test" : "error",
      httpStatus: null,
      ip: ctx.ipAddress,
      note: "Local key check (no callback sent)",
    });
  }
  await audit(adminId, "admin.webhook_key_test", row, ctx, { ok: result.ok, httpStatus: result.httpStatus });
  return result;
}

// ---------------------------------------------------------------------------
// Delivery log (admin)
// ---------------------------------------------------------------------------

export interface DeliveryView {
  id: string;
  provider: string;
  keyId: string | null;
  result: string;
  httpStatus: number | null;
  ip: string | null;
  txnRef: string | null;
  note: string | null;
  createdAt: string;
}

function toDeliveryView(row: typeof webhookDeliveries.$inferSelect): DeliveryView {
  return {
    id: row.id,
    provider: row.provider,
    keyId: row.keyId,
    result: row.result,
    httpStatus: row.httpStatus,
    ip: row.ip,
    txnRef: row.txnRef,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

const REJECTED_RESULTS = ["bad_token", "no_token"];

export async function listKeyDeliveries(id: string, limit: number): Promise<DeliveryView[]> {
  await loadKey(id);
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.keyId, id))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
  return rows.map(toDeliveryView);
}

/** Rejected attempts (wrong or missing key) — these never match a key, so they are listed per provider. */
export async function listRejectedDeliveries(provider: WebhookProvider, limit: number): Promise<DeliveryView[]> {
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.provider, provider), inArray(webhookDeliveries.result, REJECTED_RESULTS)))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
  return rows.map(toDeliveryView);
}

export interface ProviderHealth {
  provider: WebhookProvider;
  label: string;
  status: ProviderHealthStatus;
  activeKeys: number;
  /** No key in the DB, but the server settings hold a secret. */
  usingServerSecret: boolean;
  acceptedLast24h: number;
  rejectedLast24h: number;
  rejectedLastHour: number;
  lastAcceptedAt: string | null;
  lastRejectedAt: string | null;
  lastRejectReason: string | null;
}

const REJECT_REASON: Record<string, string> = {
  bad_token: "Wrong key",
  no_token: "No key sent",
};

/** GET /admin/webhook-keys/overview — server environment + one health line per provider. */
export async function webhookOverview(): Promise<{ environment: WebhookEnvironment; providers: ProviderHealth[] }> {
  const [stats, lastRejects, keyRows] = await Promise.all([
    db
      .select({
        provider: webhookDeliveries.provider,
        accepted24h: sql<number>`count(*) filter (where ${webhookDeliveries.result} = 'ok' and ${webhookDeliveries.createdAt} > now() - interval '24 hours')::int`,
        rejected24h: sql<number>`count(*) filter (where ${inArray(webhookDeliveries.result, REJECTED_RESULTS)} and ${webhookDeliveries.createdAt} > now() - interval '24 hours')::int`,
        rejected1h: sql<number>`count(*) filter (where ${inArray(webhookDeliveries.result, REJECTED_RESULTS)} and ${webhookDeliveries.createdAt} > now() - interval '1 hour')::int`,
        lastOk: sql<string | null>`max(${webhookDeliveries.createdAt}) filter (where ${webhookDeliveries.result} = 'ok')`,
        lastRejected: sql<string | null>`max(${webhookDeliveries.createdAt}) filter (where ${inArray(webhookDeliveries.result, REJECTED_RESULTS)})`,
      })
      .from(webhookDeliveries)
      .groupBy(webhookDeliveries.provider),
    db
      .selectDistinctOn([webhookDeliveries.provider], { provider: webhookDeliveries.provider, result: webhookDeliveries.result })
      .from(webhookDeliveries)
      .where(inArray(webhookDeliveries.result, REJECTED_RESULTS))
      .orderBy(webhookDeliveries.provider, desc(webhookDeliveries.createdAt)),
    db
      .select({ provider: webhookKeys.provider, status: webhookKeys.status, expiresAt: webhookKeys.expiresAt })
      .from(webhookKeys),
  ]);
  const now = new Date();
  const providers = WEBHOOK_PROVIDERS.map((provider): ProviderHealth => {
    const s = stats.find((r) => r.provider === provider);
    const rows = keyRows.filter((k) => k.provider === provider);
    const activeKeys = rows.filter((k) => isKeyUsable(k, now)).length;
    const usingServerSecret = rows.length === 0 && Boolean(envSecret(provider));
    const lastAcceptedAt = s?.lastOk ? new Date(s.lastOk) : null;
    const rejectedLastHour = Number(s?.rejected1h ?? 0);
    const lastReject = lastRejects.find((r) => r.provider === provider)?.result ?? null;
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      status: providerHealthStatus({ hasKey: activeKeys > 0 || usingServerSecret, rejectedLastHour, lastAcceptedAt, now }),
      activeKeys,
      usingServerSecret,
      acceptedLast24h: Number(s?.accepted24h ?? 0),
      rejectedLast24h: Number(s?.rejected24h ?? 0),
      rejectedLastHour,
      lastAcceptedAt: lastAcceptedAt?.toISOString() ?? null,
      lastRejectedAt: s?.lastRejected ? new Date(s.lastRejected).toISOString() : null,
      lastRejectReason: lastReject ? (REJECT_REASON[lastReject] ?? lastReject) : null,
    };
  });
  return { environment: thisServerEnvironment(), providers };
}

export interface RejectionSummary {
  provider: WebhookProvider;
  rejectedLastHour: number;
  rejectedLast24h: number;
  lastRejectedAt: string | null;
  alert: boolean;
}

export async function rejectionSummary(): Promise<RejectionSummary[]> {
  const rows = await db
    .select({
      provider: webhookDeliveries.provider,
      lastHour: sql<number>`count(*) filter (where ${webhookDeliveries.createdAt} > now() - interval '1 hour')::int`,
      last24h: sql<number>`count(*)::int`,
      lastAt: sql<string | null>`max(${webhookDeliveries.createdAt})`,
    })
    .from(webhookDeliveries)
    .where(
      and(
        inArray(webhookDeliveries.result, REJECTED_RESULTS),
        gte(webhookDeliveries.createdAt, sql`now() - interval '24 hours'`),
      ),
    )
    .groupBy(webhookDeliveries.provider);
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return WEBHOOK_PROVIDERS.map((provider) => {
    const r = byProvider.get(provider);
    const lastHour = Number(r?.lastHour ?? 0);
    return {
      provider,
      rejectedLastHour: lastHour,
      rejectedLast24h: Number(r?.last24h ?? 0),
      lastRejectedAt: r?.lastAt ? new Date(r.lastAt).toISOString() : null,
      alert: lastHour >= REJECT_ALERT_THRESHOLD,
    };
  });
}
