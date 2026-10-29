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
 * Every verification / lookup API the platform buys from a provider, where it is used, the
 * provider order and the APIs an admin switched off (Admin → Developer options → Providers →
 * Verifications). Stored in tenants.settings.verificationRouting. A check with no API left on is
 * refused with its own message, or skipped when `offBehavior` is "skip".
 */

export const VERIFICATION_PROVIDERS = {
  bestapi: { name: "BestAPI" },
  noble: { name: "Noble" },
  noble_pennyless: { name: "Noble" },
  noble_pennydrop: { name: "Noble" },
  vyaparapi: { name: "VyaparAPI" },
} as const;
export type VerificationProvider = keyof typeof VERIFICATION_PROVIDERS;

type ApiDef = { provider: VerificationProvider; api: string; endpoints: string[]; cost?: string };

type CheckDef = {
  label: string;
  section: "kyc" | "bank" | "service" | "recharge";
  usedIn: string[];
  apis: ApiDef[];
  /** Fixed order (cheapest first) — admin can switch steps off but not reorder. */
  fixedOrder: boolean;
  offMessage: string;
  /** "skip" = the flow carries on without this check when it is off. */
  offBehavior?: "block" | "skip";
  /** APIs off until an admin turns them on. */
  defaultOff?: VerificationProvider[];
};

const RECHARGE_LOOKUP_DEFAULT_OFF: VerificationProvider[] = ["vyaparapi"];

export const VERIFICATION_CHECKS = {
  pan_verify: {
    label: "PAN verification",
    section: "kyc",
    usedIn: ["Agent signup → KYC step (web + app)"],
    apis: [{ provider: "bestapi", api: "PAN verify", endpoints: ["/api/gw/identity-verify/pan/pan-verify"] }],
    fixedOrder: true,
    offMessage: "PAN verification is turned off right now. Contact support.",
  },
  aadhaar_otp: {
    label: "Aadhaar OTP verification",
    section: "kyc",
    usedIn: ["Agent signup → KYC step (web + app) — send OTP and verify OTP"],
    apis: [
      {
        provider: "bestapi",
        api: "Aadhaar send OTP + verify OTP",
        endpoints: ["/api/gw/identity/verification/aadhar-send-otp", "/api/gw/identity/verification/aadhar-otp-verify"],
      },
    ],
    fixedOrder: true,
    offMessage: "Aadhaar OTP verification is turned off right now. Contact support.",
  },
  bank_account: {
    label: "Bank account name check",
    section: "bank",
    usedIn: [
      "DMT → add payee (agent pays)",
      "Settlement bank → add (agent pays)",
      "Agent signup → bank step (BestAPI only, free)",
      "Admin → settlement bank re-check",
      "Admin → company bank check",
    ],
    apis: [
      { provider: "bestapi", api: "Account verify (free)", endpoints: ["/api/gw/banking/verification/account"], cost: "Free" },
      {
        provider: "noble_pennyless",
        api: "Pennyless check",
        endpoints: ["/api/v1.0/verification/penniless", "/api/v1.0/verification/penny_status_check"],
        cost: "Paid · no money sent",
      },
      {
        provider: "noble_pennydrop",
        api: "₹1 penny drop",
        endpoints: ["/api/v1.0/verification/pennydrop", "/api/v1.0/verification/penny_status_check"],
        cost: "Paid · sends ₹1",
      },
    ],
    fixedOrder: true,
    offMessage: "Bank account verification is turned off right now. Contact support.",
  },
  aeps_daily_2fa: {
    label: "Daily agent biometric (2FA)",
    section: "service",
    usedIn: ["AePS", "Aadhaar Pay", "DMT — once a day before the first transaction"],
    apis: [{ provider: "noble", api: "Daily 2FA", endpoints: ["/v2.0/aeps/daily_2fa"] }],
    fixedOrder: true,
    offMessage: "Daily biometric verification is turned off right now. Contact support.",
  },
  dmt_remitter_otp: {
    label: "DMT remitter Aadhaar + OTP",
    section: "service",
    usedIn: ["DMT → register a new remitter"],
    apis: [
      {
        provider: "noble",
        api: "Aadhaar check, send OTP, verify OTP",
        endpoints: [
          "/api/v1.0/airtel_dmt/validate_aadhar",
          "/api/v1.0/airtel_dmt/sender_registration_otp",
          "/api/v1.0/airtel_dmt/sender_registration_validate_otp",
        ],
      },
    ],
    fixedOrder: true,
    offMessage: "New remitter registration is turned off right now. Contact support.",
  },
  dmt_remitter_ekyc: {
    label: "DMT remitter eKYC (biometric)",
    section: "service",
    usedIn: ["DMT → remitter eKYC after registration"],
    apis: [{ provider: "noble", api: "Remitter eKYC", endpoints: ["/api/v1.0/airtel_dmt/sender_registration_ekyc"] }],
    fixedOrder: true,
    offMessage: "Remitter eKYC is turned off right now. Contact support.",
  },
  upi_cash_point_kyc: {
    label: "UPI Cash Point agent KYC",
    section: "service",
    usedIn: ["UPI Cash Point → first-time agent biometric KYC"],
    apis: [{ provider: "noble", api: "UPI QR agent KYC", endpoints: ["/v2.0/aeps/upiqr_kyc"] }],
    fixedOrder: true,
    offMessage: "UPI Cash Point KYC is turned off right now. Contact support.",
  },
  mobile_operator: {
    label: "Mobile operator & circle",
    section: "recharge",
    usedIn: ["Mobile recharge → detect operator from the number (web + app)"],
    apis: [
      { provider: "bestapi", api: "Mobile operator", endpoints: ["/api/gw/mobile/information/mobile-operators"] },
      { provider: "vyaparapi", api: "Mobile operator circle", endpoints: ["/public/mobile"] },
    ],
    fixedOrder: false,
    offMessage: "Operator lookup is turned off right now. Select the operator manually.",
    defaultOff: RECHARGE_LOOKUP_DEFAULT_OFF,
  },
  mobile_plans: {
    label: "Mobile plans",
    section: "recharge",
    usedIn: ["Mobile recharge → plan list"],
    apis: [
      { provider: "bestapi", api: "Mobile plans", endpoints: ["/api/gw/mobile/information/mobile-plans"] },
      { provider: "vyaparapi", api: "Mobile plans", endpoints: ["/public/mobile/plans"] },
    ],
    fixedOrder: false,
    offMessage: "Plan list is turned off right now. Enter the recharge amount manually.",
    defaultOff: RECHARGE_LOOKUP_DEFAULT_OFF,
  },
  mobile_offers: {
    label: "Mobile special offers (R-offer)",
    section: "recharge",
    usedIn: ["Mobile recharge → offers for this number"],
    apis: [
      { provider: "bestapi", api: "R-offer", endpoints: ["/api/gw/mobile/information/roffer"] },
      { provider: "vyaparapi", api: "R-offer", endpoints: ["/public/mobile/roffer"] },
    ],
    fixedOrder: false,
    offMessage: "Special offers are turned off right now. Enter the recharge amount manually.",
    defaultOff: RECHARGE_LOOKUP_DEFAULT_OFF,
  },
  dth_plans: {
    label: "DTH plans",
    section: "recharge",
    usedIn: ["DTH recharge → plan list"],
    apis: [
      { provider: "bestapi", api: "DTH plans", endpoints: ["/api/gw/dth-services/dth-plans/dth-plan"] },
      { provider: "vyaparapi", api: "DTH plans", endpoints: ["/public/dth/plans"] },
    ],
    fixedOrder: false,
    offMessage: "DTH plan list is turned off right now. Enter the recharge amount manually.",
    defaultOff: RECHARGE_LOOKUP_DEFAULT_OFF,
  },
  dth_info: {
    label: "DTH customer info",
    section: "recharge",
    usedIn: ["DTH recharge → subscriber name, balance, due date"],
    apis: [
      { provider: "bestapi", api: "DTH customer info", endpoints: ["/api/gw/dth/information/customer"] },
      { provider: "vyaparapi", api: "DTH info", endpoints: ["/public/dth/info"] },
    ],
    fixedOrder: false,
    offMessage: "DTH customer info is turned off right now. You can still recharge with the subscriber number.",
    defaultOff: RECHARGE_LOOKUP_DEFAULT_OFF,
  },
  recharge_operator_check: {
    label: "Operator check before payment",
    section: "recharge",
    usedIn: ["Mobile recharge sent via Noble → confirms the number's operator before paying"],
    apis: [{ provider: "noble", api: "Operator & circle", endpoints: ["/v1.0/recharge/operator_and_circle"] }],
    fixedOrder: true,
    offMessage: "Skipped — the recharge uses the operator the agent picked.",
    offBehavior: "skip",
  },
} as const satisfies Record<string, CheckDef>;
export type VerificationCheck = keyof typeof VERIFICATION_CHECKS;
export const VERIFICATION_CHECK_IDS = Object.keys(VERIFICATION_CHECKS) as [VerificationCheck, ...VerificationCheck[]];

type StoredRouting = Record<string, { order?: string[]; disabled?: string[] }>;
type ResolvedCheck = { order: VerificationProvider[]; disabled: VerificationProvider[] };

const CACHE_MS = 30_000;
let cache: { at: number; value: StoredRouting } | null = null;

function def(check: VerificationCheck): CheckDef {
  return VERIFICATION_CHECKS[check];
}

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
  const d = def(check);
  const all = d.apis.map((a) => a.provider);
  const s = stored[check];
  const known = (p: string): p is VerificationProvider => (all as string[]).includes(p);
  const order = d.fixedOrder ? [...all] : [...new Set([...(s?.order ?? []).filter(known), ...all])];
  const disabled = s ? (s.disabled ?? []).filter(known) : [...(d.defaultOff ?? [])];
  return { order, disabled };
}

/** Providers to try for this check, in order. Empty = the check is off. */
export async function enabledProviders(check: VerificationCheck): Promise<VerificationProvider[]> {
  const { order, disabled } = resolveCheck(check, await storedRouting());
  return order.filter((p) => !disabled.includes(p));
}

export async function isVerificationOn(check: VerificationCheck): Promise<boolean> {
  return (await enabledProviders(check)).length > 0;
}

export function verificationOffError(check: VerificationCheck): HttpError {
  return new HttpError(503, def(check).offMessage, "VERIFICATION_OFF");
}

export async function assertVerificationOn(check: VerificationCheck): Promise<void> {
  if (!(await isVerificationOn(check))) throw verificationOffError(check);
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
  if (p === "vyaparapi") return Boolean(env.VYAPARAPI_BASE_URL);
  return isNobleConfigured();
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
    const d = def(check);
    const { order, disabled } = resolveCheck(check, stored);
    const apis = order.map((p, i) => {
      const a = d.apis.find((x) => x.provider === p)!;
      const stat = d.section === "bank" ? bankStats.find((s) => s.method === BANK_METHOD[p]) : undefined;
      return {
        code: p,
        providerName: VERIFICATION_PROVIDERS[p].name,
        api: a.api,
        endpoints: a.endpoints,
        cost: a.cost ?? null,
        position: i + 1,
        enabled: !disabled.includes(p),
        configured: providerConfigured(p),
        health: d.section === "bank" ? { total: stat?.total ?? 0, ok: stat?.verified ?? 0 } : null,
      };
    });
    return {
      check,
      label: d.label,
      section: d.section,
      usedIn: d.usedIn,
      fixedOrder: d.fixedOrder,
      offMessage: d.offMessage,
      offBehavior: d.offBehavior ?? "block",
      on: apis.some((a) => a.enabled),
      apis,
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

function assertApiForCheck(check: VerificationCheck, provider: VerificationProvider) {
  const d = def(check);
  if (!d.apis.some((a) => a.provider === provider)) {
    throw new HttpError(422, `${VERIFICATION_PROVIDERS[provider].name} has no API for ${d.label}`, "PROVIDER_NOT_FOR_CHECK");
  }
}

/** PUT /admin/verifications/:check/providers/:provider */
export async function setVerificationProvider(
  adminId: string,
  check: VerificationCheck,
  provider: VerificationProvider,
  enabled: boolean,
  reason: string,
) {
  assertApiForCheck(check, provider);
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
  const d = def(check);
  if (d.fixedOrder) throw new HttpError(422, `${d.label} runs in a fixed order`, "ORDER_FIXED");
  assertApiForCheck(check, provider);
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
