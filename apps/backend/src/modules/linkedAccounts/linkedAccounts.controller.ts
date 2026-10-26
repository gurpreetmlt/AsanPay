import type { Request, Response } from "express";
import { ROLE_LABELS } from "@asanpay/shared-types";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import {
  linkStartSchema,
  linkVerifySchema,
  switchOtpSchema,
  switchSchema,
  unlinkParamSchema,
} from "./linkedAccounts.validators";
import {
  checkLink,
  listLinkedAccounts,
  requestSwitchOtp,
  startLink,
  switchAccount,
  unlinkAccount,
  verifyLink,
} from "./linkedAccounts.service";

function callerId(req: Request): string {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  return req.auth.sub;
}

function context(req: Request) {
  return { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

export async function list(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await listLinkedAccounts(callerId(req)), "OK");
}

export async function linkCheck(req: Request, res: Response): Promise<void> {
  const input = linkStartSchema.parse(req.body);
  sendSuccess(res, await checkLink(callerId(req), input, context(req)), "OK");
}

export async function linkStart(req: Request, res: Response): Promise<void> {
  const input = linkStartSchema.parse(req.body);
  const result = await startLink(callerId(req), input, context(req));
  sendSuccess(res, result, result.message);
}

export async function linkVerify(req: Request, res: Response): Promise<void> {
  const input = linkVerifySchema.parse(req.body);
  sendSuccess(res, await verifyLink(callerId(req), input, context(req)), "Accounts linked");
}

export async function switchOtp(req: Request, res: Response): Promise<void> {
  const input = switchOtpSchema.parse(req.body);
  const result = await requestSwitchOtp(callerId(req), input, context(req));
  sendSuccess(res, result, result.message);
}

export async function switchTo(req: Request, res: Response): Promise<void> {
  const input = switchSchema.parse(req.body);
  const result = await switchAccount(callerId(req), input, context(req));
  sendSuccess(res, result, `You are now using your ${ROLE_LABELS[result.user.role]} account`);
}

export async function unlink(req: Request, res: Response): Promise<void> {
  const { userId } = unlinkParamSchema.parse(req.params);
  sendSuccess(res, await unlinkAccount(callerId(req), userId, context(req)), "Account unlinked");
}
