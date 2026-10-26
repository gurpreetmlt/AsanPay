import "dotenv/config";
import { pgPool } from "../src/db/postgres";
import {
  checkUnsubmittedTxn,
  closeTxnNeverCharged,
  closeTxnRefundedByAdjustment,
  failUnsubmittedTxn,
} from "../src/modules/transactions/txn.service";

// Fails a stuck pending / initiated txn that never reached a provider and refunds the wallet
// through the normal settlement path (row lock + reversal + audit log). Refuses when a provider
// can still answer for the txn — use status recheck for those.
// Pre-ledger debits cannot be auto-reversed: refund them with an approved recon adjustment
// (Dr COMPANY_001, Cr the retailer account printed below), then close with --refund-adjustment.
// A txn that never took any money is closed with --never-charged (no money moves).
// Dry run by default — pass --apply to write.
//
//   npx tsx scripts/failUnsubmittedTxn.ts --ref LKP20260801F7A0A83F
//   npx tsx scripts/failUnsubmittedTxn.ts --ref LKP20260801F7A0A83F --apply
//   npx tsx scripts/failUnsubmittedTxn.ts --ref LKP20260801F7A0A83F --refund-adjustment 12 --apply
//   npx tsx scripts/failUnsubmittedTxn.ts --ref LKP20260801F7A0A83F --never-charged --apply

const DEFAULT_REASON = "This transaction was never sent to the bank. The full amount has been refunded to your wallet.";
const NEVER_CHARGED_REASON = "This transaction was never processed. No money was taken from your wallet.";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const ref = arg("ref")?.trim();
  const neverCharged = process.argv.includes("--never-charged");
  const reason = arg("reason")?.trim() || (neverCharged ? NEVER_CHARGED_REASON : DEFAULT_REASON);
  const adjustmentRaw = arg("refund-adjustment")?.trim();
  const apply = process.argv.includes("--apply");
  if (!ref) {
    throw new Error('Usage: --ref <txnRef> [--refund-adjustment <id> | --never-charged] [--reason "..."] [--apply]');
  }
  if (neverCharged && adjustmentRaw !== undefined) {
    throw new Error("Use either --never-charged or --refund-adjustment, not both");
  }
  if (adjustmentRaw !== undefined && !/^\d+$/.test(adjustmentRaw)) {
    throw new Error("--refund-adjustment must be the numeric recon adjustment id");
  }

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
  console.log(
    [
      `refund=${check.refundAmount}`,
      `ledgerDebit=${check.hasDebitJournal ? "yes" : "no"}`,
      `walletBookDebit=${check.legacyDebitAmount}`,
      `walletBookReversed=${check.legacyReversed ? "yes" : "no"}`,
      `walletBookLines=${check.walletBookEntries}`,
      `holdForThisTxn=${check.heldForThisTxn}`,
      `retailerAccount=${check.agentAccountCode ?? "missing"}`,
    ].join(" "),
  );

  const charged =
    check.hasDebitJournal || check.walletBookEntries > 0 || Number(check.heldForThisTxn) > 0;
  const manual = check.direction === "debit" && Number(check.refundAmount) > 0 && !check.hasDebitJournal;
  if (manual && adjustmentRaw === undefined && !neverCharged) {
    const debitOk = !check.legacyReversed && check.legacyDebitAmount === check.refundAmount;
    console.log(
      !charged
        ? "PLAN close without refund: no money was ever taken for this transaction. Re-run with --never-charged --apply"
        : debitOk
          ? `PLAN manual refund: recon adjustment amount=${check.refundAmount} debit=COMPANY_001 credit=${check.agentAccountCode ?? "missing"}, approved by a second admin, then re-run with --refund-adjustment <id> --apply`
          : "STOP: the wallet book shows a partial or reversed debit for this transaction. Do not refund or close it — check manually.",
    );
    return;
  }
  console.log(
    neverCharged
      ? `${apply ? "CLOSE" : "PLAN close"} without refund (nothing was charged) reason="${reason}"`
      : adjustmentRaw !== undefined
        ? `${apply ? "CLOSE" : "PLAN close"} with recon adjustment ${adjustmentRaw} reason="${reason}"`
        : `${apply ? "FAIL" : "PLAN"} auto-reversal refund=${check.refundAmount} reason="${reason}"`,
  );

  if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply to settle.");
    return;
  }
  const settled = neverCharged
    ? await closeTxnNeverCharged(ref, reason)
    : adjustmentRaw !== undefined
      ? await closeTxnRefundedByAdjustment(ref, BigInt(adjustmentRaw), reason)
      : await failUnsubmittedTxn(ref, reason);
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
