import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { providers, providerServices, services } from "../src/db/postgres/schema";

// Makes one provider the primary (and active) route for a group of services.
// Dry run by default — pass --apply to write.
//
//   npx tsx scripts/switchRailProvider.ts --to noble --scope aeps,dmt,recharge
//   npx tsx scripts/switchRailProvider.ts --to noble --scope dmt --apply
//
// Run `npm run seed:providers` first so the target provider has a row for every service.

const SCOPES: Record<string, readonly string[]> = {
  aeps: [
    "aeps_balance_enquiry",
    "aeps_cash_withdrawal",
    "aeps_cash_deposit",
    "aeps_bank_list",
    "aeps_mini_statement",
    "aadhaar_pay",
  ],
  dmt: [
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
    "dmt",
  ],
  recharge: ["MOBILE_PREPAID", "DTH"],
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const target = arg("to")?.trim();
  const scopeNames = (arg("scope") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const apply = process.argv.includes("--apply");

  if (!target || scopeNames.length === 0) {
    throw new Error("Usage: --to <providerCode> --scope aeps,dmt,recharge [--apply]");
  }
  const unknown = scopeNames.filter((s) => !SCOPES[s]);
  if (unknown.length) throw new Error(`Unknown scope: ${unknown.join(", ")}. Use: ${Object.keys(SCOPES).join(", ")}`);

  const [provider] = await db.select().from(providers).where(eq(providers.code, target));
  if (!provider) throw new Error(`Provider "${target}" not found — run npm run seed:providers first`);

  const codes = scopeNames.flatMap((s) => SCOPES[s]!);
  let ready = 0;
  let missing = 0;

  for (const code of codes) {
    const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.code, code));
    if (!svc) {
      console.log(`SKIP ${code}: service missing`);
      missing++;
      continue;
    }
    const rows = await db
      .select({
        id: providerServices.id,
        providerId: providerServices.providerId,
        isPrimary: providerServices.isPrimary,
        isActive: providerServices.isActive,
        providerCode: providers.code,
      })
      .from(providerServices)
      .innerJoin(providers, eq(providerServices.providerId, providers.id))
      .where(eq(providerServices.serviceId, svc.id));

    const current = rows.find((r) => r.isPrimary && r.isActive)?.providerCode ?? "none";
    const targetRow = rows.find((r) => r.providerId === provider.id);
    if (!targetRow) {
      console.log(`SKIP ${code}: no ${target} row — run npm run seed:providers first`);
      missing++;
      continue;
    }
    console.log(`${apply ? "SET " : "PLAN"} ${code}: ${current} -> ${target}`);
    ready++;

    if (apply) {
      await db.transaction(async (tx) => {
        await tx.update(providerServices).set({ isPrimary: false }).where(eq(providerServices.serviceId, svc.id));
        await tx
          .update(providerServices)
          .set({ isPrimary: true, isActive: true })
          .where(and(eq(providerServices.id, targetRow.id), eq(providerServices.serviceId, svc.id)));
      });
    }
  }

  if (apply && !provider.isActive) {
    await db.update(providers).set({ isActive: true }).where(eq(providers.id, provider.id));
    console.log(`Provider ${target} marked active`);
  }

  console.log(
    `${apply ? "Applied" : "Dry run"}: ${ready} service(s) ${apply ? "switched" : "ready"}, ${missing} skipped.` +
      (apply ? "" : " Re-run with --apply to write."),
  );
}

main()
  .catch((err) => {
    console.error("switchRailProvider failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
