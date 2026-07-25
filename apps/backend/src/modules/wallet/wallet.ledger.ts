import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import { wallets, walletLedgerGroups, walletLedgerEntries } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { toPaise, fromPaise } from "./decimal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;
type WalletRow = typeof wallets.$inferSelect;

async function lockWallet(tx: Tx, walletId: string): Promise<WalletRow> {
  const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for("update");
  if (!wallet) throw new HttpError(404, "Wallet not found", "WALLET_NOT_FOUND");
  return wallet;
}

async function applyLockedEntry(
  tx: Tx,
  wallet: WalletRow,
  groupId: string,
  entryType: "debit" | "credit",
  amount: string,
): Promise<void> {
  const currentPaise = toPaise(wallet.balance);
  const deltaPaise = toPaise(amount);
  const nextPaise = entryType === "credit" ? currentPaise + deltaPaise : currentPaise - deltaPaise;

  if (nextPaise < 0) {
    throw new HttpError(422, "Insufficient wallet balance", "INSUFFICIENT_BALANCE");
  }

  await tx
    .update(wallets)
    .set({ balance: fromPaise(nextPaise), version: wallet.version + 1, updatedAt: new Date() })
    .where(eq(wallets.id, wallet.id));

  await tx.insert(walletLedgerEntries).values({
    groupId,
    walletId: wallet.id,
    entryType,
    amount,
    balanceAfter: fromPaise(nextPaise),
  });
}

/**
 * Move `amount` between a wallet's available `balance` and its `holdBalance` bookkeeping field.
 * direction "hold" reserves amount (balance already moved out via a real transfer; this just
 * mirrors it for reporting), "release" clears it back to 0 once the txn resolves (success/failed).
 * Does not itself move money — call alongside transferBetweenWallets, in the same tx.
 */
export async function adjustWalletHold(
  tx: Tx,
  walletId: string,
  amount: string,
  direction: "hold" | "release",
): Promise<void> {
  const wallet = await lockWallet(tx, walletId);
  const currentPaise = toPaise(wallet.holdBalance);
  const deltaPaise = toPaise(amount);
  const nextPaise = direction === "hold" ? currentPaise + deltaPaise : currentPaise - deltaPaise;
  const clamped = Math.max(0, nextPaise);

  await tx
    .update(wallets)
    .set({ holdBalance: fromPaise(clamped), updatedAt: new Date() })
    .where(eq(wallets.id, walletId));
}

interface TransferParams {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  referenceType: string;
  referenceId?: string;
  description?: string;
}

async function doTransfer(tx: Tx, params: TransferParams): Promise<{ groupId: string }> {
  const { fromWalletId, toWalletId, amount, referenceType, referenceId, description } = params;
  const [firstId, secondId] = [fromWalletId, toWalletId].sort();
  const firstWallet = await lockWallet(tx, firstId as string);
  const secondWallet = await lockWallet(tx, secondId as string);

  const fromWallet = firstWallet.id === fromWalletId ? firstWallet : secondWallet;
  const toWallet = firstWallet.id === toWalletId ? firstWallet : secondWallet;

  const [group] = await tx
    .insert(walletLedgerGroups)
    .values({ referenceType, referenceId, description })
    .returning();
  if (!group) throw new HttpError(500, "Failed to create ledger group");

  await applyLockedEntry(tx, fromWallet, group.id, "debit", amount);
  await applyLockedEntry(tx, toWallet, group.id, "credit", amount);

  return { groupId: group.id };
}

// Moves money between two wallets as a single balanced journal entry (debit + credit,
// same group). Locks are always acquired in sorted-id order — independent of transfer
// direction — so two concurrent transfers between the same wallet pair can never deadlock.
//
// Pass `existingTx` to run inside a caller's transaction (e.g. so a transaction-status
// compare-and-swap and the money movement it authorizes commit or roll back together).
export async function transferBetweenWallets(
  params: TransferParams,
  existingTx?: Tx,
): Promise<{ groupId: string }> {
  if (params.fromWalletId === params.toWalletId) {
    throw new HttpError(422, "Cannot transfer a wallet to itself", "INVALID_TRANSFER");
  }
  if (existingTx) return doTransfer(existingTx, params);
  return db.transaction((tx) => doTransfer(tx, params));
}

interface FundParams {
  walletId: string;
  amount: string;
  referenceId?: string;
  description?: string;
}

async function doFund(tx: Tx, params: FundParams): Promise<{ groupId: string }> {
  const wallet = await lockWallet(tx, params.walletId);

  const [group] = await tx
    .insert(walletLedgerGroups)
    .values({ referenceType: "external_funding", referenceId: params.referenceId, description: params.description })
    .returning();
  if (!group) throw new HttpError(500, "Failed to create ledger group");

  await applyLockedEntry(tx, wallet, group.id, "credit", params.amount);

  return { groupId: group.id };
}

// Money entering the system from outside (e.g. a reconciled bank transfer into the admin's
// account). Intentionally single-sided — there is no internal counterparty wallet to debit;
// referenceType "external_funding" marks the exception to the usual balanced-group rule.
export async function fundWallet(params: FundParams, existingTx?: Tx): Promise<{ groupId: string }> {
  if (existingTx) return doFund(existingTx, params);
  return db.transaction((tx) => doFund(tx, params));
}
