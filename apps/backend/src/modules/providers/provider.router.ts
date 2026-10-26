import { and, eq, asc, desc } from "drizzle-orm";
import { db } from "../../db/postgres";
import { providers, providerServices, services } from "../../db/postgres/schema";
import { insertProviderLog } from "../../db/postgres/repositories/providerLog";
import { getAdapterByCode } from "./provider.registry";
import { aepsAdapterCode, isAepsRoutedService } from "./aepsMode";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";
import type { ProviderAdapter, ProviderOperation, ProviderResult } from "./types";

/**
 * A stub adapter fabricates "success" without a real rail, so settling money on its word would
 * mint float. Block stubs in production unless explicitly opted in (ALLOW_STUB_PROVIDERS) — pure
 * and env-injected so it's unit-testable without a DB.
 */
export function isStubBlocked(
  adapter: Pick<ProviderAdapter, "isStub">,
  nodeEnv: string,
  allowStub: boolean,
): boolean {
  return Boolean(adapter.isStub) && nodeEnv === "production" && !allowStub;
}

export interface RoutedProvider {
  adapter: ProviderAdapter;
  providerId: string;
  providerServiceCode: string;
}

/**
 * AEPS services honour AEPS_PROVIDER_MODE:
 * - noble → Noble adapter
 * - off → 503 (no AePS provider configured yet)
 */
async function resolveAepsProvider(serviceCode: string): Promise<RoutedProvider[]> {
  const code = aepsAdapterCode();
  if (!code) {
    throw new HttpError(
      503,
      "AePS is not live yet — no AePS provider is configured. Contact support.",
      "AEPS_NOT_CONFIGURED",
    );
  }
  const adapter = getAdapterByCode(code);
  if (!adapter) {
    throw new HttpError(503, `AEPS adapter "${code}" is not registered`, "NO_PROVIDER_AVAILABLE");
  }
  if (isStubBlocked(adapter, env.NODE_ENV, env.ALLOW_STUB_PROVIDERS)) {
    throw new HttpError(
      503,
      "Stub AEPS provider blocked in production — set AEPS_PROVIDER_MODE=noble (or ALLOW_STUB_PROVIDERS for staging)",
      "STUB_PROVIDER_BLOCKED",
    );
  }

  let [row] = await db
    .select({ id: providers.id, isActive: providers.isActive })
    .from(providers)
    .where(eq(providers.code, code));

  if (!row) {
    // Ensure a providers row exists so txn.providerId FK stays valid.
    const [created] = await db
      .insert(providers)
      .values({
        code,
        name: "Noble Web Studio",
      })
      .returning({ id: providers.id, isActive: providers.isActive });
    row = created!;
  }
  if (!row.isActive) {
    throw new HttpError(503, "AEPS provider is disabled", "NO_PROVIDER_AVAILABLE");
  }

  // agent_auth (daily 2FA) and bank-list directory reads have no service row / move no
  // money, so skip the service catalog gate for them.
  const skipServiceGate =
    serviceCode === "agent_auth" ||
    serviceCode === "aeps_bank_list" ||
    serviceCode === "dmt_bank_list" ||
    serviceCode === "dmt_remitter_profile" ||
    serviceCode === "dmt_remitter_register" ||
    serviceCode === "dmt_remitter_register_verify" ||
    serviceCode === "dmt_remitter_kyc" ||
    serviceCode === "dmt_add_beneficiary" ||
    serviceCode === "dmt_add_beneficiary_verify" ||
    serviceCode === "dmt_delete_beneficiary" ||
    serviceCode === "dmt_delete_beneficiary_verify" ||
    serviceCode === "dmt_txn_otp" ||
    serviceCode === "dmt_refund_otp" ||
    serviceCode === "dmt_refund";
  if (!skipServiceGate) {
    const [svc] = await db
      .select({ id: services.id, isActive: services.isActive })
      .from(services)
      .where(eq(services.code, serviceCode));
    if (!svc) throw new HttpError(404, "Service not found", "SERVICE_NOT_FOUND");
    if (!svc.isActive) throw new HttpError(503, "This service is currently disabled", "SERVICE_DISABLED");
  }

  logger.info(
    { serviceCode, mode: env.AEPS_PROVIDER_MODE, providerCode: code },
    "AEPS provider resolved by mode",
  );

  return [
    {
      adapter,
      providerId: row.id,
      providerServiceCode: `${code}:${serviceCode}`,
    },
  ];
}

// Resolves which providers can fulfil a service, in fail-over order
// (primary first, then priority). Reads provider_services fresh each call so
// an admin toggling a provider takes effect immediately.
export async function resolveProvidersForService(serviceCode: string): Promise<RoutedProvider[]> {
  if (isAepsRoutedService(serviceCode)) {
    return resolveAepsProvider(serviceCode);
  }

  const rows = await db
    .select({
      providerId: providers.id,
      providerCode: providers.code,
      providerActive: providers.isActive,
      providerServiceCode: providerServices.providerServiceCode,
      mappingActive: providerServices.isActive,
      isPrimary: providerServices.isPrimary,
      priority: providerServices.priority,
      serviceActive: services.isActive,
    })
    .from(providerServices)
    .innerJoin(providers, eq(providerServices.providerId, providers.id))
    .innerJoin(services, eq(providerServices.serviceId, services.id))
    .where(and(eq(services.code, serviceCode)))
    .orderBy(desc(providerServices.isPrimary), asc(providerServices.priority));

  const usable: RoutedProvider[] = [];
  for (const row of rows) {
    if (!row.serviceActive) {
      throw new HttpError(503, "This service is currently disabled", "SERVICE_DISABLED");
    }
    if (!row.providerActive || !row.mappingActive) continue;
    const adapter = getAdapterByCode(row.providerCode);
    if (!adapter) {
      logger.warn({ providerCode: row.providerCode }, "provider row exists but no adapter registered");
      continue;
    }
    if (isStubBlocked(adapter, env.NODE_ENV, env.ALLOW_STUB_PROVIDERS)) {
      // A mock in production would settle money with no real payout — refuse to route through it.
      logger.error(
        { providerCode: row.providerCode, serviceCode },
        "stub provider blocked in production — set ALLOW_STUB_PROVIDERS only in dev/staging",
      );
      continue;
    }
    usable.push({ adapter, providerId: row.providerId, providerServiceCode: row.providerServiceCode });
  }

  if (usable.length === 0) {
    throw new HttpError(503, "No provider available for this service", "NO_PROVIDER_AVAILABLE");
  }
  return usable;
}

// Wraps a single adapter call with timing + raw payload logging to Mongo.
// Redact anything biometric before it ever leaves the process boundary.
export async function callProvider<T extends Record<string, unknown>>(
  routed: RoutedProvider,
  operation: ProviderOperation,
  txnRef: string | null,
  requestPayload: Record<string, unknown>,
  invoke: (adapter: ProviderAdapter) => Promise<ProviderResult<T>>,
): Promise<ProviderResult<T>> {
  const startedAt = Date.now();
  const redactedRequest = { ...requestPayload };
  if ("biometricPayload" in redactedRequest) redactedRequest.biometricPayload = "[REDACTED]";
  if ("aadhaarNumber" in redactedRequest) redactedRequest.aadhaarNumber = "[REDACTED]";
  if ("accountNumber" in redactedRequest) redactedRequest.accountNumber = "[REDACTED]";
  if ("panNumber" in redactedRequest) redactedRequest.panNumber = "[REDACTED]";
  if ("otp" in redactedRequest) redactedRequest.otp = "[REDACTED]";

  let result: ProviderResult<T>;
  try {
    result = await invoke(routed.adapter);
  } catch (err) {
    // Network/unexpected errors are indistinguishable from timeouts money-wise:
    // the provider may or may not have processed it. Surface as pending, never failed.
    logger.error({ err, operation, provider: routed.adapter.code }, "provider call threw");
    const detail =
      err instanceof HttpError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    result = {
      success: false,
      status: "pending",
      providerTxnId: null,
      amount: null,
      message:
        detail.trim() ||
        "Provider unreachable — transaction pending, recheck status",
      data: {} as T,
      raw: { error: detail },
    };
  }

  insertProviderLog({
    txnRef,
    providerCode: routed.adapter.code,
    operation,
    requestPayload: redactedRequest,
    responsePayload: (result.raw ?? {}) as Record<string, unknown>,
    status: result.status,
    durationMs: Date.now() - startedAt,
  }).catch((err: unknown) => logger.error({ err }, "failed to write provider log"));

  return result;
}
