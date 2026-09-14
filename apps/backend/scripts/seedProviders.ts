import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { providers, providerServices, serviceCategories, services } from "../src/db/postgres/schema";
import { env } from "../src/config/env";
import { aepsAdapterCode } from "../src/modules/providers/aepsMode";

// Registers the provider rows the Developer Options → Providers admin panel reads
// (apps/admin-portal/app/developer-options/providers) and seeds provider_services rows so
// transactions resolve a provider instead of 503 NO_PROVIDER_AVAILABLE.
//
// 2026-07-21: AEPS/DMT product operations were migrated OFF the single AEPS_PROVIDER_MODE env
// switch onto this table (see aepsMode.ts). To seed without silently changing live behaviour,
// this reads the CURRENT AEPS_PROVIDER_MODE and marks that adapter primary+active for every
// AEPS/DMT operation, with the other two present but inactive — admin can then flip via the
// panel. Nepal remittance + merchant onboarding/eKYC stay on the env switch (InstantPay-specific
// endpoints, no generic adapter method to route through yet) — not seeded here.
const PROVIDERS = [
  { code: "eko", name: "Eko (dummy AEPS)" },
  { code: "instantpay", name: "InstantPay" },
  { code: "paysprint", name: "PaySprint" },
  { code: "vyaparapi", name: "VyaparAPI" },
] as const;

/** BBPS catalog services VyaparAPI can recharge today (mobile + DTH). */
const VYAPARAPI_RECHARGE_SERVICE_CODES = ["MOBILE_PREPAID", "DTH"] as const;

// Hidden from the retailer-facing catalog (category isActive: false) — these are internal
// operation codes for provider routing, not customer-visible tiles.
const AEPS_CATEGORY = { code: "AEPS_RAIL", name: "Aadhaar Enabled Payment (AEPS)" };
const DMT_CATEGORY = { code: "DMT_RAIL", name: "DMT (Money Transfer)" };

const AEPS_OPERATIONS = [
  "aeps_balance_enquiry",
  "aeps_cash_withdrawal",
  "aeps_cash_deposit",
  "aeps_bank_list",
  "aeps_mini_statement",
  "aadhaar_pay",
  "agent_auth",
] as const;

const DMT_OPERATIONS = [
  "dmt_bank_list",
  "dmt_remitter_profile",
  "dmt_remitter_register",
  "dmt_remitter_register_verify",
  "dmt_remitter_kyc",
  "dmt_add_beneficiary",
  "dmt_add_beneficiary_verify",
  "dmt_delete_beneficiary",
  "dmt_delete_beneficiary_verify",
  "dmt_txn_otp",
  "dmt_refund_otp",
  "dmt_refund",
  "dmt", // DMT transfer (money-moving) — executeServiceTxn uses this fixed code
] as const;

async function upsertProviders() {
  const providerIds: Record<string, string> = {};
  for (const p of PROVIDERS) {
    const [existing] = await db.select().from(providers).where(eq(providers.code, p.code));
    if (existing) {
      providerIds[p.code] = existing.id;
      continue;
    }
    const [created] = await db.insert(providers).values({ code: p.code, name: p.name }).returning();
    providerIds[p.code] = created!.id;
    console.log(`Created provider: ${p.code}`);
  }
  return providerIds;
}

async function upsertHiddenCategory(cat: { code: string; name: string }, displayOrder: number) {
  const [existing] = await db.select().from(serviceCategories).where(eq(serviceCategories.code, cat.code));
  if (existing) return existing.id;
  const [created] = await db
    .insert(serviceCategories)
    .values({ code: cat.code, name: cat.name, isActive: false, displayOrder })
    .returning();
  console.log(`Created hidden category: ${cat.code}`);
  return created!.id;
}

/**
 * Create the service if missing; if it already exists under a DIFFERENT category (e.g. a stray
 * pre-existing "AEPS Rails (internal)" row from earlier work), move it under the canonical
 * category instead of leaving it split across two categories.
 */
async function upsertService(categoryId: string, code: string) {
  const [existing] = await db.select().from(services).where(eq(services.code, code));
  if (existing) {
    if (existing.categoryId !== categoryId) {
      await db.update(services).set({ categoryId }).where(eq(services.id, existing.id));
      console.log(`Moved service "${code}" to canonical category`);
    }
    return existing.id;
  }
  const [created] = await db
    .insert(services)
    .values({ categoryId, code, name: code, isActive: true })
    .returning();
  console.log(`Created service: ${code}`);
  return created!.id;
}

/** Delete any category left with zero services after the merge above — e.g. the stray one. */
async function cleanupEmptyCategories(canonicalCodes: string[]) {
  const cats = await db.select().from(serviceCategories);
  for (const cat of cats) {
    if (canonicalCodes.includes(cat.code)) continue;
    const remaining = await db.select({ id: services.id }).from(services).where(eq(services.categoryId, cat.id));
    if (remaining.length === 0) {
      // Only remove categories that look like stray AEPS/DMT leftovers, never touch unrelated ones.
      const looksLikeAepsDmtLeftover = /aeps|dmt/i.test(cat.code) || /aeps|dmt/i.test(cat.name);
      if (looksLikeAepsDmtLeftover) {
        await db.delete(serviceCategories).where(eq(serviceCategories.id, cat.id));
        console.log(`Removed empty stray category: ${cat.code} ("${cat.name}")`);
      }
    }
  }
}

/**
 * Seed all 3 providers for one operation code, marking whichever matches the CURRENT
 * AEPS_PROVIDER_MODE as primary+active (preserves today's behaviour at migration time).
 */
async function seedOperationProviders(
  serviceId: string,
  serviceCode: string,
  providerIds: Record<string, string>,
  activeAdapterCode: string,
) {
  const order: (keyof typeof providerIds)[] = ["eko", "instantpay", "paysprint"];
  let created = 0;
  for (let i = 0; i < order.length; i++) {
    const code = order[i]!;
    const existing = await db
      .select()
      .from(providerServices)
      .where(eq(providerServices.serviceId, serviceId));
    if (existing.some((r) => r.providerId === providerIds[code])) continue;

    const isActive = code === activeAdapterCode;
    await db.insert(providerServices).values({
      serviceId,
      providerId: providerIds[code]!,
      providerServiceCode: `${code}:${serviceCode}`,
      isPrimary: isActive,
      priority: i,
      isActive,
    });
    created++;
  }
  return created;
}

async function main() {
  const providerIds = await upsertProviders();
  const activeAdapterCode = aepsAdapterCode();
  console.log(`Current AEPS_PROVIDER_MODE=${env.AEPS_PROVIDER_MODE} → seeding "${activeAdapterCode}" as active for AEPS/DMT`);

  // BBPS (existing — unchanged, single provider "eko" per category, no live mode to preserve)
  const [bbpsCategory] = await db
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.code, "BILL_PAYMENT_BBPS"));
  if (!bbpsCategory) {
    throw new Error('BILL_PAYMENT_BBPS category not found — run "npm run seed:catalog -w @asanpay/backend" first');
  }
  const bbpsServices = await db.select().from(services).where(eq(services.categoryId, bbpsCategory.id));
  let bbpsCreated = 0;
  for (const svc of bbpsServices) {
    const existing = await db.select().from(providerServices).where(eq(providerServices.serviceId, svc.id));
    if (existing.length) continue;
    await db.insert(providerServices).values({
      serviceId: svc.id,
      providerId: providerIds.eko!,
      providerServiceCode: `eko:${svc.code}`,
      isPrimary: true,
      priority: 0,
      isActive: true,
    });
    bbpsCreated++;
  }
  console.log(`BBPS: ${bbpsCreated} provider_services created (${bbpsServices.length} services total)`);

  // VyaparAPI on Mobile Prepaid + DTH (inactive by default — admin toggles live)
  let vyaparCreated = 0;
  for (const code of VYAPARAPI_RECHARGE_SERVICE_CODES) {
    const svc = bbpsServices.find((s) => s.code === code);
    if (!svc) {
      console.warn(`VyaparAPI seed skipped — service ${code} missing from catalog`);
      continue;
    }
    const existing = await db.select().from(providerServices).where(eq(providerServices.serviceId, svc.id));
    if (existing.some((r) => r.providerId === providerIds.vyaparapi)) continue;
    const maxPriority = existing.reduce((m, r) => Math.max(m, r.priority ?? 0), -1);
    await db.insert(providerServices).values({
      serviceId: svc.id,
      providerId: providerIds.vyaparapi!,
      providerServiceCode: `vyaparapi:${code}`,
      isPrimary: false,
      priority: maxPriority + 1,
      isActive: false,
    });
    vyaparCreated++;
  }
  console.log(`VyaparAPI: ${vyaparCreated} provider_services created for ${VYAPARAPI_RECHARGE_SERVICE_CODES.join(", ")}`);

  // AEPS + DMT (migrated 2026-07-21)
  const aepsCategoryId = await upsertHiddenCategory(AEPS_CATEGORY, 900);
  const dmtCategoryId = await upsertHiddenCategory(DMT_CATEGORY, 901);

  let aepsDmtCreated = 0;
  for (const code of AEPS_OPERATIONS) {
    const svcId = await upsertService(aepsCategoryId, code);
    aepsDmtCreated += await seedOperationProviders(svcId, code, providerIds, activeAdapterCode);
  }
  for (const code of DMT_OPERATIONS) {
    const svcId = await upsertService(dmtCategoryId, code);
    aepsDmtCreated += await seedOperationProviders(svcId, code, providerIds, activeAdapterCode);
  }
  console.log(
    `AEPS+DMT: ${aepsDmtCreated} provider_services created across ${AEPS_OPERATIONS.length + DMT_OPERATIONS.length} operations`,
  );

  await cleanupEmptyCategories([bbpsCategory.code, AEPS_CATEGORY.code, DMT_CATEGORY.code]);

  console.log("Providers seeded — check Developer Options → Providers in the admin panel.");
}

main()
  .catch((err) => {
    console.error("Seeding providers failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
