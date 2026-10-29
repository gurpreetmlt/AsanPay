import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { env, isUsableNobleAgentId } from "../../config/env";
import { nobleLoadAgent } from "../onboarding/nobleAepsSession.service";
import { HttpError } from "../../utils/httpError";
import { decryptPII } from "../../utils/aes";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { assertFreshBiometric } from "../transactions/biometricReplay";
import { resolveProvidersForService, callProvider } from "../providers/provider.router";
import { assertVerificationOn } from "../verifications/verificationRouting.service";

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
  /** Last 4 digits of the retailer's KYC Aadhaar; the server uses the full number for 2FA. */
  aadhaarLastFour: string | null;
  /** Always null — the full number never leaves the server. Kept for older app builds. */
  aadhaarNumber: null;
  providerMode: string;
  /** Always null — kept so older app builds that read it keep working. */
  outlet: null;
}

/**
 * The provider owns the real daily 2FA. When our record says "done today" but the provider's
 * load_agent says daily2faRequired, our record is stale (different day reset, session expiry):
 * clear it so the 2FA screen shows and money endpoints block. Never loosens — a provider error
 * keeps our own record.
 */
async function providerStillNeeds2fa(userId: string, nobleUniqueAgentId: string | null): Promise<boolean> {
  if (env.AEPS_PROVIDER_MODE !== "noble" || !isUsableNobleAgentId(nobleUniqueAgentId)) return false;
  try {
    const load = await nobleLoadAgent(userId);
    return load.live && load.daily2faRequired;
  } catch {
    return false;
  }
}

export async function getAgentAuthStatus(
  userId: string,
  opts: { checkProvider?: boolean } = {},
): Promise<AgentAuthStatus> {
  const [user] = await db
    .select({
      lastAgentAuthAt: users.lastAgentAuthAt,
      aadhaarNumberEncrypted: users.aadhaarNumberEncrypted,
      nobleUniqueAgentId: users.nobleUniqueAgentId,
    })
    .from(users)
    .where(eq(users.id, userId));
  let last = user?.lastAgentAuthAt ?? null;
  let localVerifiedToday = Boolean(last && indiaDayKey(last) === indiaDayKey(new Date()));

  if (localVerifiedToday && opts.checkProvider && (await providerStillNeeds2fa(userId, user?.nobleUniqueAgentId ?? null))) {
    await db.update(users).set({ lastAgentAuthAt: null, updatedAt: new Date() }).where(eq(users.id, userId));
    last = null;
    localVerifiedToday = false;
  }

  let aadhaarLastFour: string | null = null;
  if (user?.aadhaarNumberEncrypted) {
    try {
      const digits = decryptPII(user.aadhaarNumberEncrypted).replace(/\D/g, "");
      aadhaarLastFour = /^\d{12}$/.test(digits) ? digits.slice(-4) : null;
    } catch {
      aadhaarLastFour = null;
    }
  }

  const base: AgentAuthStatus = {
    verifiedToday: localVerifiedToday,
    lastVerifiedAt: last,
    kycReady: Boolean(aadhaarLastFour),
    aadhaarLastFour,
    aadhaarNumber: null,
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
  captureType?: "FINGER" | "FACE";
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
  await assertVerificationOn("aeps_daily_2fa");

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
        captureType: input.captureType,
        latitude: input.latitude ?? user.outletLatitude ?? undefined,
        longitude: input.longitude ?? user.outletLongitude ?? undefined,
        outletId: user.nobleUniqueAgentId ?? undefined,
        endpointIp: input.endpointIp ?? context.ipAddress ?? undefined,
      }),
  );

  if (!result.success || result.status !== "success") {
    throw new HttpError(
      401,
      result.message ||
        (input.captureType === "FACE"
          ? "Daily face verification failed at provider"
          : "Daily fingerprint verification failed at provider"),
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
      captureType: input.captureType ?? "FINGER",
    },
  });

  return {
    verifiedAt,
    providerMode: env.AEPS_PROVIDER_MODE,
    providerStatus: result.status,
  };
}
