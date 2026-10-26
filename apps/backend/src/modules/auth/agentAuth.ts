import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { decryptPII } from "../../utils/aes";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { assertFreshBiometric } from "../transactions/biometricReplay";
import { resolveProvidersForService, callProvider } from "../providers/provider.router";

// Retailer-own-identity proof-of-presence, distinct from the customer's AEPS biometric.
// NPCI daily 2FA is based on the Indian calendar day, not a rolling-hour window.
function indiaDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface AgentAuthStatus {
  verifiedToday: boolean;
  lastVerifiedAt: Date | null;
  kycReady: boolean;
  /** Retailer's own KYC Aadhaar (signup) — clients auto-fill daily 2FA from this. */
  aadhaarNumber: string | null;
  providerMode: string;
  /** Always null — kept so older app builds that read it keep working. */
  outlet: null;
}

export async function getAgentAuthStatus(userId: string): Promise<AgentAuthStatus> {
  const [user] = await db
    .select({
      lastAgentAuthAt: users.lastAgentAuthAt,
      aadhaarNumberEncrypted: users.aadhaarNumberEncrypted,
    })
    .from(users)
    .where(eq(users.id, userId));
  const last = user?.lastAgentAuthAt ?? null;
  const localVerifiedToday = Boolean(last && indiaDayKey(last) === indiaDayKey(new Date()));

  let aadhaarNumber: string | null = null;
  if (user?.aadhaarNumberEncrypted) {
    try {
      const digits = decryptPII(user.aadhaarNumberEncrypted).replace(/\D/g, "");
      aadhaarNumber = /^\d{12}$/.test(digits) ? digits : null;
    } catch {
      aadhaarNumber = null;
    }
  }

  const base: AgentAuthStatus = {
    verifiedToday: localVerifiedToday,
    lastVerifiedAt: last,
    kycReady: Boolean(aadhaarNumber),
    aadhaarNumber,
    providerMode: env.AEPS_PROVIDER_MODE,
    outlet: null,
  };

  return base;
}

export async function assertAgentAuthFresh(userId: string): Promise<void> {
  const status = await getAgentAuthStatus(userId);
  if (!status.verifiedToday) {
    throw new HttpError(
      403,
      "Scan your fingerprint to start today's session before using this service.",
      "AGENT_AUTH_REQUIRED",
    );
  }
}

export interface AgentAuthInput {
  /** When omitted, the retailer's signup KYC Aadhaar is used. */
  aadhaarNumber?: string;
  biometricPayload: string;
  latitude?: string;
  longitude?: string;
  endpointIp?: string | null;
}

/**
 * Daily retailer 2FA before AEPS.
 * - Always: KYC Aadhaar match + fresh PID (replay guard)
 * - provider agentAuth succeeds → unlock day
 */
export async function verifyAndRecordAgentAuth(
  actor: { id: string },
  input: AgentAuthInput,
  context: { ipAddress: string | null; userAgent: string | null },
): Promise<{ verifiedAt: Date; providerMode: string; providerStatus: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!user || !user.isActive) throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  if (!user.aadhaarNumberEncrypted) {
    throw new HttpError(422, "Complete KYC (Aadhaar) before agent authentication", "KYC_AADHAAR_REQUIRED");
  }
  const kycAadhaar = decryptPII(user.aadhaarNumberEncrypted).replace(/\D/g, "");
  if (!/^\d{12}$/.test(kycAadhaar)) {
    throw new HttpError(422, "Complete KYC (Aadhaar) before agent authentication", "KYC_AADHAAR_REQUIRED");
  }
  const aadhaarNumber = (input.aadhaarNumber ?? kycAadhaar).replace(/\D/g, "");
  if (aadhaarNumber !== kycAadhaar) {
    throw new HttpError(
      422,
      "Entered Aadhaar does not match the retailer's KYC Aadhaar",
      "KYC_AADHAAR_MISMATCH",
    );
  }

  await assertFreshBiometric(input.biometricPayload);

  const routedProviders = await resolveProvidersForService("agent_auth");
  const result = await callProvider(
    routedProviders[0]!,
    "agent_auth",
    null,
    {
      aadhaarNumber,
      biometricPayload: input.biometricPayload,
      latitude: input.latitude,
      longitude: input.longitude,
    },
    (adapter) =>
      adapter.agentAuth({
        retailerUserId: actor.id,
        aadhaarNumber,
        biometricPayload: input.biometricPayload,
        latitude: input.latitude ?? user.outletLatitude ?? undefined,
        longitude: input.longitude ?? user.outletLongitude ?? undefined,
        outletId: user.nobleUniqueAgentId ?? undefined,
        endpointIp: input.endpointIp ?? context.ipAddress ?? undefined,
      }),
  );

  if (!result.success || result.status !== "success") {
    throw new HttpError(
      401,
      result.message || "Daily fingerprint verification failed at provider",
      "AGENT_AUTH_PROVIDER_FAILED",
    );
  }

  const verifiedAt = new Date();
  await db.update(users).set({ lastAgentAuthAt: verifiedAt, updatedAt: verifiedAt }).where(eq(users.id, actor.id));
  await insertAuditLog({
    userId: actor.id,
    action: "auth.agent_auth_verified",
    entityType: "user",
    entityId: actor.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      mode: env.AEPS_PROVIDER_MODE,
      provider: routedProviders[0]!.adapter.code,
      providerTxnId: result.providerTxnId,
    },
  });

  return {
    verifiedAt,
    providerMode: env.AEPS_PROVIDER_MODE,
    providerStatus: result.status,
  };
}
