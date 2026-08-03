/**
 * Create one float account per active provider — `TREASURY_FLOAT_<CODE>`.
 *
 * The flow matrix routes every service debit as `retailer -> float` (Dr RTL / Cr FLOAT), so a
 * DMT, BBPS, recharge or AePS deposit needs a real float account to net against. Until these
 * exist there is nothing on the credit side of a service journal and the cut-over cannot post
 * one. This is pure provisioning: it creates accounts and balance rows, and posts NO journals,
 * so it moves no money and is safe to run on production at any time.
 *
 * Idempotent — `ensureTreasuryAccount` is ON CONFLICT DO NOTHING. Run it again whenever a
 * provider is added; ops registering a provider is the intended long-term trigger, this script
 * just backfills the ones that already exist.
 *
 * DRY RUN BY DEFAULT.
 *
 *   npm run provision:float              # report what would be created
 *   npm run provision:float -- --apply   # create them
 */
import { eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { providers, tenants } from "../src/db/postgres/schema";
import { clearAccountCache } from "../src/core/ledger";
import { ensureTreasuryAccount } from "../src/modules/wallet/ledgerAccounts";

const APPLY = process.argv.includes("--apply");

/**
 * Provider codes are free-form varchar. An account code is a stable identifier that appears in
 * journals forever and is matched by ops by eye, so normalise rather than trusting the input:
 * upper-case, and anything that is not A-Z/0-9 becomes an underscore.
 */
function floatCodeFor(providerCode: string): string {
  return `TREASURY_FLOAT_${providerCode.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

async function main() {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.code, "ASANPAY")).limit(1);
  if (!tenant) throw new Error("Tenant ASANPAY not found — run migrations first.");

  const active = await db
    .select({ code: providers.code, name: providers.name })
    .from(providers)
    .where(eq(providers.isActive, true));

  if (active.length === 0) {
    console.log("No active providers. Nothing to provision.");
    await pgPool.end();
    return;
  }

  // Two providers whose codes differ only by punctuation would collide onto one account code
  // and silently share a float. Fail rather than merge two providers' money.
  const seen = new Map<string, string>();
  for (const p of active) {
    const code = floatCodeFor(p.code);
    const clash = seen.get(code);
    if (clash) {
      throw new Error(
        `Providers '${clash}' and '${p.code}' both map to ${code}. Rename one before running.`,
      );
    }
    seen.set(code, p.code);
  }

  console.log(`Tenant ${tenant.code} — ${active.length} active provider(s)\n`);
  for (const p of active) {
    console.log(`  ${p.code.padEnd(20)} -> ${floatCodeFor(p.code)}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to create these accounts.");
    await pgPool.end();
    return;
  }

  await db.transaction(async (tx) => {
    for (const p of active) {
      await ensureTreasuryAccount(tx, {
        tenantId: tenant.id,
        code: floatCodeFor(p.code),
        name: `Float — ${p.name}`,
        type: "float",
      });
    }
  });

  clearAccountCache();
  console.log(`\nProvisioned ${active.length} float account(s). No journals posted.`);
  await pgPool.end();
}

main().catch(async (err) => {
  console.error("Float provisioning failed:", err);
  process.exit(1);
});
