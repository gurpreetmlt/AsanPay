import { eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { bankNameChecks, tenants } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { env, isNobleConfigured } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { bestApiConfigured } from "../providers/bestapi/client";
import { resolveTenantId } from "../fund-requests/tenant";
import { asSettings } from "../tenants/tenantSettings.service";

/**
 * Every verification / lookup the platform buys from a provider, with the provider order and the
 * providers an admin switched off (Admin → Developer options → Providers → Verifications).
 * Stored in tenants.settings.verificationRouting; a check with no provider left is refused with
 * its own clear message.
 */

export const VERIFICATION_PROVIDERS = {
  bestapi: { name: "BestAPI", note: "Free first check" },
  noble_pennyless: { name: "Noble · pennyless", note: "Paid, no money sent" },
  noble_pennydrop: { name: "Noble · ₹1 penny drop", note: "Paid, sends ₹1 to the account" },
  vyaparapi: { name: "VyaparAPI", note: "Recharge number info" },
} as const;
export type VerificationProvider = keyof typeof VERIFICATION_PROVIDERS;

type CheckDef = {
  label: string;
  section: "kyc" | "bank" | "recharge";
  usedIn: string;
  providers: VerificationProvider[];
  /** Fixed order (cheapest first) — admin can switch steps off but not reorder. */
  fixedOrder: boolean;
  offMessage: string;
  /** Providers off until an admin turns them on. */
  defaultOff?: VerificationProvider[];
};

export const VERIFICATION_CHECKS = {
  pan_verify: {
    label: "PAN verification",
    section: "kyc",
    usedIn: "Agent signup KYC",
    providers: ["bestapi"],
    fixedOrder: true,
    offMessage: "PAN verification is turned off right now. Contact support.",
  },
  aadhaar_otp: {
    label: "Aadhaar OTP (e-KYC)",
    section: "kyc",
    usedIn: "Agent signup KYC",
    providers: ["bestapi"],
    fixedOrder: true,
    offMessage: "Aadhaar OTP verification is turned off right now. Contact support.",
  },
  bank_account: {
    label: "Bank account name check",
    section: "bank",
    usedIn: "DMT payee, settlement bank, company bank, signup bank",
    providers: ["bestapi", "noble_pennyless", "noble_pennydrop"],
    fixedOrder: true,
    offMessage: "Bank account verification is turned off right now. Contact support.",
  },
  mobile_operator: {
    label: "Mobile operator & circle",
    section: "recharge",
    usedIn: "Mobile recharge — detects operator from the number",
    providers: ["bestapi", "vyaparapi"],
    fixedOrder: false,
    offMessage: "Operator lookup is turned off right now. Select the operator manually.",
    defaultOff: ["vyaparapi"],
  },
  mobile_plans: {
    label: "Mobile plans",
    section: "recharge",
    usedIn: "Mobile recharge — plan list",
    providers: ["bestapi", "vyaparapi"],
    fixedOrder: false,
    offMessage: "Plan list is turned off right now. Enter the recharge amount manually.",
    defaultOff: ["vyaparapi"],
  },
  mobile_offers: {
    label: "Mobile special offers (R-offer)",
    section: "recharge",
    usedIn: "Mobile recharge — offers for this number",
    providers: ["bestapi", "vyaparapi"],
    fixedOrder: false,
    offMessage: "Special offers are turned off right now. Enter the recharge amount manually.",
    defaultOff: ["vyaparapi"],
  },
  dth_plans: {
    label: "DTH plans",
    section: "recharge",
    usedIn: "DTH recharge — plan list",
    providers: ["bestapi", "vyaparapi"],
    fixedOrder: false,
    offMessage: "DTH plan list is turned off right now. Enter the recharge amount manually.",
    defaultOff: ["vyaparapi"],
  },
  dth_info: {
    label: "DTH customer info",
    section: "recharge",
    usedIn: "DTH recharge — subscriber name, balance, due date",
    providers: ["bestapi", "vyaparapi"],
    fixedOrder: false,
    offMessage: "DTH customer info is turned off right now. You can still recharge with the subscriber number.",
    defaultOff: ["vyaparapi"],
  },
} as const satisfies Record<string, CheckDef>;
export type VerificationCheck = keyof typeof VERIFICATION_CHECKS;
export const VERIFICATION_CHECK_IDS = Object.keys(VERIFICATION_CHECKS) as [VerificationCheck, ...VerificationCheck[]];

type StoredRouting = Record<string, { order?: string[]; disabled?: string[] }>;
type ResolvedCheck = { order: VerificationProvider[]; disabled: VerificationProvider[] };

const CACHE_MS = 30_000;
let cache: { at: number; value: StoredRouting } | null = null;

async function storedRouting(): Promise<StoredRouting> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const tenantId = await resolveTenantId();
  const [row] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const raw = asSettings(row?.settings).verificationRouting;
  const value: StoredRouting = raw && typeof raw === "object" ? raw : {};
  cache = { at: Date.now(), value };
  return value;
}

function resolveCheck(check: VerificationCheck, stored: StoredRouting): ResolvedCheck {
  const def: CheckDef = VERIFICATION_CHECKS[check];
  const s = stored[check];
  const known = (p: string): p is VerificationProvider => (def.providers as string[]).includes(p);
  const order = def.fixedOrder
    ? [...def.providers]
    : [...new Set([...(s?.order ?? []).filter(known), ...def.providers])];
  const disabled = s ? (s.disabled ?? []).filter(known) : [...(def.defaultOff ?? [])];
  return { order, disabled };
}

/** Providers to try for this check, in order. Empty = the check is off. */
export async function enabledProviders(check: VerificationCheck): Promise<VerificationProvider[]> {
  const { order, disabled } = resolveCheck(check, await storedRouting());
  return order.filter((p) => !disabled.includes(p));
}

export function verificationOffError(check: VerificationCheck): HttpError {
  return new HttpError(503, VERIFICATION_CHECKS[check].offMessage, "VERIFICATION_OFF");
}

export async function assertVerificationOn(check: VerificationCheck): Promise<void> {
  if ((await enabledProviders(check)).length === 0) throw verificationOffError(check);
}

/**
 * Try each enabled provider in order. A provider that throws (or returns an empty result while
 * another provider is left) falls through to the next one; the last error is what the agent sees.
 */
export async function runVerificationChain<T>(
  check: VerificationCheck,
  impls: Partial<Record<VerificationProvider, () => Promise<T>>>,
  isEmpty?: (result: T) => boolean,
): Promise<T> {
  const order = (await enabledProviders(check)).filter((p) => impls[p]);
  if (order.length === 0) throw verificationOffError(check);
  let lastErr: unknown = null;
  let lastEmpty: { value: T } | null = null;
  for (const provider of order) {
    try {
      const result = await impls[provider]!();
      if (isEmpty?.(result)) {
        lastEmpty = { value: result };
        continue;
      }
      return result;
    } catch (err) {
      lastErr = err;
      logger.warn({ check, provider, err: err instanceof Error ? err.message : String(err) }, "verification provider failed, trying next");
    }
  }
  if (lastEmpty) return lastEmpty.value;
  throw lastErr;
}

function providerConfigured(p: VerificationProvider): boolean {
  if (p === "bestapi") return bestApiConfigured();
  if (p === "noble_pennyless" || p === "noble_pennydrop") return isNobleConfigured();
  return Boolean(env.VYAPARAPI_BASE_URL);
}

const BANK_METHOD: Partial<Record<VerificationProvider, string>> = {
  bestapi: "bestapi",
  noble_pennyless: "pennyless",
  noble_pennydrop: "pennydrop",
};

/** GET /admin/verifications */
export async function listVerificationChecks() {
  const stored = await storedRouting();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const bankStats = await db
    .select({
      method: bankNameChecks.method,
      total: sql<number>`count(*)::int`,
      verified: sql<number>`count(*) filter (where ${bankNameChecks.status} = 'verified')::int`,
    })
    .from(bankNameChecks)
    .where(gte(bankNameChecks.createdAt, since))
    .groupBy(bankNameChecks.method);

  return VERIFICATION_CHECK_IDS.map((check) => {
    const def: CheckDef = VERIFICATION_CHECKS[check];
    const { order, disabled } = resolveCheck(check, stored);
    const providers = order.map((p, i) => {
      const stat = def.section === "bank" ? bankStats.find((s) => s.method === BANK_METHOD[p]) : undefined;
      return {
        code: p,
        name: VERIFICATION_PROVIDERS[p].name,
        note: VERIFICATION_PROVIDERS[p].note,
        position: i + 1,
        enabled: !disabled.includes(p),
        configured: providerConfigured(p),
        health: def.section === "bank" ? { total: stat?.total ?? 0, ok: stat?.verified ?? 0 } : null,
      };
    });
    return {
      check,
      label: def.label,
      section: def.section,
      usedIn: def.usedIn,
      fixedOrder: def.fixedOrder,
      offMessage: def.offMessage,
      on: providers.some((p) => p.enabled),
      providers,
    };
  });
}

async function saveCheck(check: VerificationCheck, next: ResolvedCheck) {
  const tenantId = await resolveTenantId();
  const stored = { ...(await storedRouting()), [check]: { order: next.order, disabled: next.disabled } };
  await db
    .update(tenants)
    .set({ settings: sql`${tenants.settings} || ${JSON.stringify({ verificationRouting: stored })}::jsonb` })
    .where(eq(tenants.id, tenantId));
  cache = null;
}

/** PUT /admin/verifications/:check/providers/:provider */
export async function setVerificationProvider(
  adminId: string,
  check: VerificationCheck,
  provider: VerificationProvider,
  enabled: boolean,
  reason: string,
) {
  const def: CheckDef = VERIFICATION_CHECKS[check];
  if (!def.providers.includes(provider)) {
    throw new HttpError(422, `${VERIFICATION_PROVIDERS[provider].name} is not a provider for ${def.label}`, "PROVIDER_NOT_FOR_CHECK");
  }
  const before = resolveCheck(check, await storedRouting());
  const disabled = enabled ? before.disabled.filter((p) => p !== provider) : [...new Set([...before.disabled, provider])];
  await saveCheck(check, { order: before.order, disabled });
  await insertAuditLog({
    userId: adminId,
    action: enabled ? "admin.verification_provider_on" : "admin.verification_provider_off",
    entityType: "verification",
    entityId: check,
    metadata: { check, provider, reason, checkOn: before.order.some((p) => !disabled.includes(p)) },
  });
  return listVerificationChecks();
}

/** PUT /admin/verifications/:check/primary — move one provider to the front. */
export async function setVerificationPrimary(adminId: string, check: VerificationCheck, provider: VerificationProvider, reason: string) {
  const def: CheckDef = VERIFICATION_CHECKS[check];
  if (def.fixedOrder) throw new HttpError(422, `${def.label} runs in a fixed order (cheapest first)`, "ORDER_FIXED");
  if (!def.providers.includes(provider)) {
    throw new HttpError(422, `${VERIFICATION_PROVIDERS[provider].name} is not a provider for ${def.label}`, "PROVIDER_NOT_FOR_CHECK");
  }
  const before = resolveCheck(check, await storedRouting());
  const order = [provider, ...before.order.filter((p) => p !== provider)];
  await saveCheck(check, { order, disabled: before.disabled });
  await insertAuditLog({
    userId: adminId,
    action: "admin.verification_primary",
    entityType: "verification",
    entityId: check,
    metadata: { check, before: before.order, after: order, reason },
  });
  return listVerificationChecks();
}
