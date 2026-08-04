import type { Request, Response } from "express";
import {
  fundWalletSchema,
  transferWalletSchema,
  pullRequestSchema,
  pullConfirmSchema,
  ledgerQuerySchema,
} from "./wallet.validators";
import {
  getWalletBalances,
  transferToChild,
  adminFundOwnWallet,
  getWalletLedger,
  requestPullFromChild,
  confirmPullFromChild,
} from "./wallet.service";
import { assertTxnAuthorization } from "../auth/txnPin";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";

function requireActor(req: Request) {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  return { id: req.auth.sub, role: req.auth.role };
}

export async function getMyWallets(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const balances = await getWalletBalances(actor.id);
  sendSuccess(res, balances);
}

export async function fund(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const input = fundWalletSchema.parse(req.body);
  await assertTxnAuthorization(actor.id, { txnPin: input.txnPin, txnAuth: input.txnAuth });
  const result = await adminFundOwnWallet(
    actor,
    input.amount,
    input.description,
    input.idempotencyKey,
    input.targetUserId,
  );
  sendSuccess(res, result, "Balance funded successfully");
}

export async function transfer(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const input = transferWalletSchema.parse(req.body);
  await assertTxnAuthorization(actor.id, { txnPin: input.txnPin, txnAuth: input.txnAuth });
  const result = await transferToChild(
    actor,
    input.targetUserId,
    input.walletType,
    input.amount,
    input.description,
    input.idempotencyKey,
  );
  sendSuccess(res, result, "Transfer completed successfully");
}

export async function pullRequest(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const input = pullRequestSchema.parse(req.body);
  const result = await requestPullFromChild(actor, input.targetUserId, input.amount, input.walletType);
  sendSuccess(res, result, result.message);
}

export async function pullConfirm(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const input = pullConfirmSchema.parse(req.body);
  await assertTxnAuthorization(actor.id, { txnPin: input.txnPin, txnAuth: input.txnAuth });
  const result = await confirmPullFromChild(actor, {
    targetUserId: input.targetUserId,
    amount: input.amount,
    otp: input.otp,
    walletType: input.walletType,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
  });
  sendSuccess(res, result, "Funds collected successfully");
}

export async function ledger(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const { limit, offset } = ledgerQuerySchema.parse(req.query);
  const entries = await getWalletLedger(actor.id, { limit, offset });
  sendSuccess(res, entries);
}
