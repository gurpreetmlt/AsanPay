import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse";
import {
  signupMinKyc,
  getOnboardingStatus,
  biometricKycStatus,
  submitBiometricKyc,
  mobileChangeInitiate,
  mobileChangeVerify,
  merchantList,
} from "./onboarding.service";
import type {
  BioKycStatusInput,
  BioKycSubmitInput,
  MerchantListInput,
  MinKycSignupInput,
  MobileChangeInitiateInput,
  MobileChangeVerifyInput,
} from "./onboarding.validators";
import {
  getNobleOnboardingPrefill,
  getNobleOnboardingStatus,
  nobleAgentOnboard,
  nobleAgentOnboardStatus,
  revealMyKycIdentity,
} from "./nobleOnboarding.service";
import { nobleAgentKyc, nobleLoadAgent } from "./nobleAepsSession.service";
import type {
  NobleAgentKycInput,
  NobleAgentOnboardInput,
  NobleAgentStatusInput,
  NobleLoadAgentInput,
} from "./nobleOnboarding.validators";

export async function instantpaySignup(req: Request, res: Response): Promise<void> {
  const body = req.body as MinKycSignupInput;
  const profile = await signupMinKyc(req.auth!.sub, body, req.ip ?? "127.0.0.1");
  sendSuccess(res, profile);
}

export async function instantpayStatus(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await getOnboardingStatus(req.auth!.sub));
}

export async function instantpayBioKycStatus(req: Request, res: Response): Promise<void> {
  const body = req.body as BioKycStatusInput;
  sendSuccess(res, await biometricKycStatus(req.auth!.sub, body.spKey, req.ip ?? "127.0.0.1"));
}

export async function instantpayBioKycSubmit(req: Request, res: Response): Promise<void> {
  const body = req.body as BioKycSubmitInput;
  sendSuccess(res, await submitBiometricKyc(req.auth!.sub, body, req.ip ?? "127.0.0.1"));
}

export async function instantpayMobileChangeInitiate(req: Request, res: Response): Promise<void> {
  const body = req.body as MobileChangeInitiateInput;
  sendSuccess(res, await mobileChangeInitiate(req.auth!.sub, body, req.ip ?? "127.0.0.1"));
}

export async function instantpayMobileChangeVerify(req: Request, res: Response): Promise<void> {
  const body = req.body as MobileChangeVerifyInput;
  sendSuccess(res, await mobileChangeVerify(req.auth!.sub, body, req.ip ?? "127.0.0.1"));
}

export async function instantpayMerchantList(req: Request, res: Response): Promise<void> {
  const body = req.body as MerchantListInput;
  sendSuccess(res, await merchantList(body, req.ip ?? "127.0.0.1"));
}

export async function nobleSignup(req: Request, res: Response): Promise<void> {
  const body = req.body as NobleAgentOnboardInput;
  const profile = await nobleAgentOnboard(req.auth!.sub, body, req.ip ?? "127.0.0.1");
  sendSuccess(res, profile);
}

export async function noblePrefill(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await getNobleOnboardingPrefill(req.auth!.sub));
}

export async function nobleRevealIdentity(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  sendSuccess(res, await revealMyKycIdentity(req.auth!.sub, req.ip ?? null));
}

export async function nobleStatus(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await getNobleOnboardingStatus(req.auth!.sub));
}

export async function nobleStatusRecover(req: Request, res: Response): Promise<void> {
  const body = req.body as NobleAgentStatusInput;
  sendSuccess(res, await nobleAgentOnboardStatus(req.auth!.sub, body));
}

export async function nobleLoadAgentHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as NobleLoadAgentInput;
  sendSuccess(
    res,
    await nobleLoadAgent(req.auth!.sub, {
      endpointIp: req.ip ?? undefined,
      channel: body.channel,
    }),
  );
}

export async function nobleAgentKycHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as NobleAgentKycInput;
  sendSuccess(
    res,
    await nobleAgentKyc(req.auth!.sub, {
      biometricPayload: body.biometricPayload,
      latitude: body.latitude != null ? String(body.latitude) : undefined,
      longitude: body.longitude != null ? String(body.longitude) : undefined,
      businessNature: body.businessNature,
      annualIncome: body.annualIncome,
      channel: body.channel,
      endpointIp: req.ip ?? undefined,
    }),
  );
}
