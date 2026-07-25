/**
 * Manual smoke test for the retailer alert system — fires one fake alert per type so you can
 * confirm each lands in the right Slack channel (critical vs general).
 *
 * Requires SLACK_WEBHOOK_CRITICAL / SLACK_WEBHOOK_GENERAL (or ALERT_WEBHOOK_URL fallback) set
 * in the environment this runs in. Writes real rows to alert_logs (by design — that's the audit
 * trail), so run this against a dev/staging DATABASE_URL, not production, unless you're fine
 * with a handful of test rows in that table.
 *
 * Run: npx tsx scripts/testAlerts.ts
 */
import { sendSlackAlert } from "../src/utils/alert";
import { pgPool } from "../src/db/postgres";

const FAKE_RETAILER = { retailerId: "00000000-0000-0000-0000-000000000000", retailerName: "Test Retailer" };

async function main() {
  console.log("Firing one alert per type (2s apart, to avoid tripping the debounce window)...\n");

  const cases: Array<[string, "critical" | "general", Record<string, unknown>]> = [
    ["Transaction failure", "critical", { ...FAKE_RETAILER, txnRef: "TEST-TXN-1", amount: "500.00", errorCode: "TXN_FAILED" }],
    ["Wallet balance mismatch found in daily reconciliation", "critical", { ...FAKE_RETAILER, txnRef: "TEST-TXN-2", dbStatusBefore: "pending", providerStatusNow: "success" }],
    ["Suspicious activity: rapid repeated transactions", "critical", { ...FAKE_RETAILER, txnCountInWindow: 7, windowMs: 120000 }],
    ["KYC issue blocked a live transaction", "critical", { ...FAKE_RETAILER, kycStatus: "rejected" }],
    ["Daily transaction limit exceeded", "general", { ...FAKE_RETAILER, todayTotal: "55000.00", dailyLimit: "50000.00" }],
    ["Retry succeeded after initial delay", "general", { ...FAKE_RETAILER, txnRef: "TEST-TXN-3", amount: "250.00" }],
    ["KYC status changed", "general", { ...FAKE_RETAILER, previousStatus: "pending", newStatus: "verified" }],
  ];

  for (const [alertType, severity, details] of cases) {
    console.log(`→ [${severity}] ${alertType}`);
    await sendSlackAlert(alertType, severity, details);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\nDone. Check both Slack channels — critical cases (4) in #critical, general cases (3) in #general.");
  await pgPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
