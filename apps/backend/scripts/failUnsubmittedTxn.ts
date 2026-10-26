import "dotenv/config";
import { pgPool } from "../src/db/postgres";
import {
  checkUnsubmittedTxn,
  closeTxnRefundedByAdjustment,
  failUnsubmittedTxn,
} from "../src/modules/transactions/txn.service";

// Fails a stuck pending / initiated txn that never reached a provider and refunds the wallet
// through the normal settlement path (row lock + reversal + audit log). Refuses when a provider
// can still answer for the txn — use status recheck for those.
// Pre-ledger debits cannot be auto-reversed: refund them with an approved recon adjustment
// (Dr COMPANY_001, Cr the retailer account printed below), then close with --refund-adjustment.
// Dry run by default — pass --apply to write.
//
//   npx tsx scripts/failUnsubmittedTxn.ts --ref LKP20260801F7A0A83F
//   npx tsx scripts/failUnsubmittedTxn.ts --ref LKP20260801F7A0A83F --apply
//   npx tsx scripts/failUnsubmittedTxn.ts --ref LKP20260801F7A0A83F --refund-adjustment 12 --apply

const DEFAULT_REASON = "This transaction was never sent to the bank. The full amount has been refunded to your wallet.";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const ref = arg("ref")?.trim();
  const reason = arg("reason")?.trim() || DEFAULT_REASON;
  const adjustmentRaw = arg("refund-adjustment")?.trim();
  const apply = process.argv.includes("--apply");
  if (!ref) throw new Error('Usage: --ref <txnRef> [--refund-adjustment <id>] [--reason "..."] [--apply]');
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
      `holdForThisTxn=${check.heldForThisTxn}`,
      `retailerAccount=${check.agentAccountCode ?? "missing"}`,
    ].join(" "),
  );

  const manual = check.direction === "debit" && Number(check.refundAmount) > 0 && !check.hasDebitJournal;
  if (manual && adjustmentRaw === undefined) {
    const debitOk = !check.legacyReversed && check.legacyDebitAmount === check.refundAmount;
    console.log(
      debitOk
        ? `PLAN manual refund: recon adjustment amount=${check.refundAmount} debit=COMPANY_001 credit=${check.agentAccountCode ?? "missing"}, approved by a second admin, then re-run with --refund-adjustment <id> --apply`
        : "STOP: the wallet book does not show this exact debit (or it was already reversed). Do not refund.",
    );
    return;
  }
  console.log(
    adjustmentRaw !== undefined
      ? `${apply ? "CLOSE" : "PLAN close"} with recon adjustment ${adjustmentRaw} reason="${reason}"`
      : `${apply ? "FAIL" : "PLAN"} auto-reversal refund=${check.refundAmount} reason="${reason}"`,
  );

  if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply to settle.");
    return;
  }
  const settled =
    adjustmentRaw !== undefined
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
