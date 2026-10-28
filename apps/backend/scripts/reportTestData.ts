/**
 * READ-ONLY inventory of test / demo data sitting in the live database. Writes nothing.
 *
 *   sudo docker exec $API sh -c 'cd /app/apps/backend && npm run report:test-data'
 *
 * Sources it looks for:
 *   - verify:shim         → providers / categories / services with code SHIM%, users "[shim-done] …"
 *   - test world helper   → "test_mock" provider, "W Cat" categories, users "[torn-down] …"
 *   - seed:network        → demo hierarchy on mobiles 91111111xx / 92222222xx / 93333333xx
 *   - seed:txns           → transactions with idempotency_key "seed-%"
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";

const DEMO_MOBILE_RE = "^9(1111111|2222222|3333333)[0-9]{2}$";

async function rows<T extends Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> {
  const res = await db.execute<T>(q);
  return res.rows as T[];
}

function section(title: string) {
  console.log(`\n=== ${title} ${"=".repeat(Math.max(0, 66 - title.length))}`);
}

async function main() {
  section("Providers (all)");
  const providerRows = await rows<{
    code: string;
    name: string;
    is_active: boolean;
    routes: number;
  }>(sql`
    SELECT p.code, p.name, p.is_active,
      (SELECT COUNT(*)::int FROM provider_services ps WHERE ps.provider_id = p.id) AS routes
    FROM providers p ORDER BY p.code`);
  for (const p of providerRows) {
    const flag = /^shim/i.test(p.code) || p.code === "test_mock" ? "  <-- TEST" : "";
    console.log(`  ${p.code.padEnd(24)} active=${String(p.is_active).padEnd(5)} routes=${p.routes}  ${p.name}${flag}`);
  }

  section("Test catalog leftovers");
  const cats = await rows<{ code: string; name: string; is_active: boolean }>(sql`
    SELECT code, name, is_active FROM service_categories
    WHERE code ILIKE 'SHIM%' OR name = 'W Cat' ORDER BY code`);
  const svcs = await rows<{ code: string; name: string; is_active: boolean }>(sql`
    SELECT s.code, s.name, s.is_active FROM services s
    JOIN service_categories c ON c.id = s.category_id
    WHERE s.code ILIKE 'SHIM%' OR c.name = 'W Cat' ORDER BY s.code`);
  console.log(`  categories: ${cats.length}`);
  for (const c of cats) console.log(`    - ${c.code} (${c.name}, active=${c.is_active})`);
  console.log(`  services:   ${svcs.length}`);
  for (const s of svcs) console.log(`    - ${s.code} (${s.name}, active=${s.is_active})`);

  section("Test harness users ([shim-done] / [torn-down] / W …)");
  const harness = await rows<{ role: string; total: number; active: number; balance: string }>(sql`
    SELECT u.role, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE u.is_active)::int AS active,
      COALESCE(SUM(w.balance), 0)::text AS balance
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id AND w.wallet_type = 'main'
    WHERE u.name LIKE '[shim-done]%' OR u.name LIKE '[torn-down]%' OR u.name IN ('W Dist', 'W Retailer')
    GROUP BY u.role ORDER BY u.role`);
  if (harness.length === 0) console.log("  none");
  for (const h of harness) {
    console.log(`  ${h.role.padEnd(18)} total=${h.total} active=${h.active} main balance=₹${h.balance}`);
  }

  section("Demo network users (seed:network mobiles)");
  const demo = await rows<{
    mobile: string;
    uid: string;
    name: string;
    role: string;
    is_active: boolean;
    main: string;
    aeps: string;
    txns: number;
    settlements: number;
    downline_real: number;
  }>(sql`
    SELECT u.mobile, u.uid, u.name, u.role, u.is_active,
      COALESCE((SELECT balance FROM wallets WHERE user_id = u.id AND wallet_type = 'main'), 0)::text AS main,
      COALESCE((SELECT balance FROM wallets WHERE user_id = u.id AND wallet_type = 'aeps'), 0)::text AS aeps,
      (SELECT COUNT(*)::int FROM transactions t WHERE t.user_id = u.id) AS txns,
      (SELECT COUNT(*)::int FROM settlement_requests r WHERE r.user_id = u.id) AS settlements,
      (SELECT COUNT(*)::int FROM users c WHERE c.parent_id = u.id AND c.mobile !~ ${DEMO_MOBILE_RE}) AS downline_real
    FROM users u
    WHERE u.mobile ~ ${DEMO_MOBILE_RE}
    ORDER BY u.mobile`);
  let demoMain = 0;
  for (const d of demo) {
    demoMain += Number(d.main);
    const warn = d.downline_real > 0 ? `  !! ${d.downline_real} REAL agent(s) under this user` : "";
    console.log(
      `  ${d.mobile} ${d.uid.padEnd(12)} ${d.role.padEnd(17)} active=${String(d.is_active).padEnd(5)} ` +
        `main=₹${d.main} aeps=₹${d.aeps} txns=${d.txns} settlements=${d.settlements}  ${d.name}${warn}`,
    );
  }
  console.log(`  -> ${demo.length} demo users, total main balance ₹${demoMain.toFixed(2)}`);

  section("Seeded transactions (seed:txns)");
  const seededTxns = await rows<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM transactions WHERE idempotency_key LIKE 'seed-%'`);
  console.log(`  ${seededTxns[0]?.n ?? 0} rows with idempotency_key 'seed-%'`);

  section("Tenants");
  const tenants = await rows<{ code: string; is_active: boolean }>(sql`
    SELECT code, is_active FROM tenants ORDER BY code`);
  for (const t of tenants) console.log(`  ${t.code.padEnd(14)} active=${t.is_active}`);

  console.log("\nREAD-ONLY — nothing was changed.");
  await pgPool.end();
}

main().catch(async (err) => {
  console.error("report:test-data failed:", err);
  await pgPool.end().catch(() => {});
  process.exit(1);
});
