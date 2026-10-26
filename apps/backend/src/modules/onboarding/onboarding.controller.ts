import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import {
  getNobleOnboardingPrefill,
  getNobleOnboardingStatus,
  nobleAgentOnboard,
  nobleAgentOnboardStatus,
  revealMyKycIdentity,
} from "./nobleOnboarding.service";
import {
  nobleAgentKyc,
  nobleApDaily2fa,
  nobleApKyc,
  nobleApLoadAgent,
  nobleLoadAgent,
} from "./nobleAepsSession.service";
import { kycDobSlashed } from "./nobleOnboarding.service";
import type {
  NobleAgentKycInput,
  NobleAgentOnboardInput,
  NobleAgentStatusInput,
  NobleAp2faInput,
  NobleApKycInput,
  NobleLoadAgentInput,
} from "./nobleOnboarding.validators";

/** Retired outlet / biometric-KYC endpoints — older app builds still call them. */
export async function retiredOutletOnboarding(_req: Request, _res: Response): Promise<void> {
  throw new HttpError(
    410,
    "Outlet registration is no longer required. Complete AEPS onboarding from the AEPS screen instead.",
    "OUTLET_ONBOARDING_RETIRED",
  );
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

export async function nobleApLoadAgentHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as NobleLoadAgentInput;
  sendSuccess(res, await nobleApLoadAgent(req.auth!.sub, { endpointIp: req.ip ?? undefined, channel: body.channel }));
}

export async function nobleApKycHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as NobleApKycInput;
  const dob = body.dob ?? (await kycDobSlashed(req.auth!.sub));
  sendSuccess(
    res,
    await nobleApKyc(req.auth!.sub, {
      biometricPayload: body.biometricPayload,
      dob,
      latitude: body.latitude != null ? String(body.latitude) : undefined,
      longitude: body.longitude != null ? String(body.longitude) : undefined,
      channel: body.channel,
      endpointIp: req.ip ?? undefined,
    }),
  );
}

export async function nobleAp2faHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as NobleAp2faInput;
  sendSuccess(
    res,
    await nobleApDaily2fa(req.auth!.sub, {
      biometricPayload: body.biometricPayload,
      latitude: body.latitude != null ? String(body.latitude) : undefined,
      longitude: body.longitude != null ? String(body.longitude) : undefined,
      channel: body.channel,
      endpointIp: req.ip ?? undefined,
    }),
    "Aadhaar Pay fingerprint verified for today",
  );
}
