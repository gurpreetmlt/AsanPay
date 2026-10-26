import "dotenv/config";
import { pgPool } from "../src/db/postgres";
import { checkUnsubmittedTxn, failUnsubmittedTxn } from "../src/modules/transactions/txn.service";

// Fails a stuck pending / initiated txn that never reached a provider and refunds the wallet
// through the normal settlement path (row lock + reversal + audit log). Refuses when a provider
// can still answer for the txn — use status recheck for those.
// Dry run by default — pass --apply to write.
//
//   npx tsx scripts/failUnsubmittedTxn.ts --ref LKP20260801F7A0A83F
//   npx tsx scripts/failUnsubmittedTxn.ts --ref LKP20260801F7A0A83F --apply

const DEFAULT_REASON = "This transaction was never sent to the bank. The full amount has been refunded to your wallet.";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const ref = arg("ref")?.trim();
  const reason = arg("reason")?.trim() || DEFAULT_REASON;
  const apply = process.argv.includes("--apply");
  if (!ref) throw new Error('Usage: --ref <txnRef> [--reason "..."] [--apply]');

  const check = await checkUnsubmittedTxn(ref);
  const { txn } = check;
  console.log(
    [
      `txn=${txn.txnRef}`,
      `service=${check.serviceCode}`,
      `status=${txn.status}`,
      `amount=${txn.amount}`,
      `fee=${txn.customerFee ?? "0"}`,
      `feeGst=${txn.customerFeeGst ?? "0"}`,
      `wallet=${check.walletType}`,
      `direction=${check.direction}`,
      `provider=${txn.providerId ? "retired" : "none"}`,
      `created=${txn.createdAt.toISOString()}`,
    ].join(" "),
  );
  console.log(`${apply ? "FAIL" : "PLAN"} refund=${check.refundAmount} reason="${reason}"`);

  if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply to settle.");
    return;
  }
  const settled = await failUnsubmittedTxn(ref, reason);
  console.log(`Applied: ${settled.txnRef} -> ${settled.status}`);
}

main()
  .catch((err) => {
    console.error("failUnsubmittedTxn failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
