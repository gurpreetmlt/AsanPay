import { isNobleConfigured } from "../../../config/env";
import { HttpError } from "../../../utils/httpError";
import { firstResponseRow, nobleOk, nobleTxnId, resolveNobleAgentContext } from "./aepsOps";
import { assertNobleDmtOk, assertSixDigitOtp, loadRailFlowState, saveRailFlowState, nobleBeneList } from "./airtelDmt";
import { noblePost, type NobleApiResponse } from "./client";

/**
 * Jio Payments Bank DMT: remitter_login → (reg_send_otp → reg_verify_otp → register_ekyc) →
 * txn_send_otp → txn_verify_submit → txn_status. Every call carries the agent handle, terminal
 * (channel / OS / public IP) and a 4-decimal location; every documented field must be present.
 */
const BASE = "/api/v1.0/jio_dmt";
const RAIL = "jio";

export const JIO_DMT_MIN_AMOUNT = 100;
export const JIO_DMT_MAX_AMOUNT = 5000;

type JioFlowState = {
  remittanceUserId?: string;
  remitterName?: string;
  aadhaarNumber?: string;
  authorizationCode?: string;
  txnId?: string;
  txnAmount?: string;
};

type JioCommon = {
  uniqueAgentId: string;
  channel: "WEB" | "MOB";
  deviceOsType: "WINDOWS" | "ANDROID";
  latitude: string;
  longitude: string;
  publicIp: string;
};

export interface JioCallOpts {
  channel?: "WEB" | "MOB";
  latitude?: string;
  longitude?: string;
  endpointIp?: string;
}

async function common(retailerUserId: string, opts: JioCallOpts): Promise<JioCommon> {
  if (!isNobleConfigured()) {
    throw new HttpError(503, "Jio Payments Bank money transfer is not configured on the server. Contact support.", "NOBLE_NOT_CONFIGURED");
  }
  const ctx = await resolveNobleAgentContext({
    retailerUserId,
    endpointIp: opts.endpointIp,
    latitude: opts.latitude,
    longitude: opts.longitude,
  });
  if (!ctx.live) {
    throw new HttpError(
      422,
      "Complete AEPS agent onboarding before using Jio Payments Bank money transfer",
      "NOBLE_AGENT_REQUIRED",
    );
  }
  if (!ctx.latitude || !ctx.longitude) {
    throw new HttpError(
      422,
      "Shop location is missing on your account. Allow location access and try again, or contact support to update it.",
      "LOCATION_REQUIRED",
    );
  }
  const channel = opts.channel ?? "WEB";
  return {
    uniqueAgentId: ctx.uniqueAgentId,
    channel,
    deviceOsType: channel === "MOB" ? "ANDROID" : "WINDOWS",
    latitude: ctx.latitude,
    longitude: ctx.longitude,
    publicIp: ctx.endpointIp,
  };
}

/** The bank's agent-side refusals arrive before it is reached; say what the agent must do. */
const AGENT_ERRORS: [RegExp, string, string][] = [
  [/agent kyc is required/i, "Your Jio Payments Bank agent KYC is not complete. Contact support to finish it, then try again.", "JIO_DMT_AGENT_KYC"],
  [/agent onboarding is required/i, "Your agent account is not onboarded with Jio Payments Bank yet. Contact support.", "JIO_DMT_AGENT_ONBOARDING"],
  [/pending for approval at bank/i, "Your Jio Payments Bank agent approval is still pending. Try again after the bank approves it.", "JIO_DMT_AGENT_PENDING"],
  [/uniqueAgentId/i, "Your agent id is not valid for Jio Payments Bank. Contact support to refresh AEPS onboarding.", "JIO_DMT_AGENT_INVALID"],
];

function assertJioOk(httpStatus: number, json: NobleApiResponse, fallback: string): void {
  if (nobleOk(json, httpStatus)) return;
  const description = typeof json.description === "string" ? json.description : "";
  for (const [re, message, code] of AGENT_ERRORS) {
    if (re.test(description)) throw new HttpError(422, message, code);
  }
  if (json.statusCode === "AE0029") {
    throw new HttpError(503, "Jio Payments Bank money transfer is not enabled on the provider account yet. Contact support.", "JIO_DMT_NOT_ENABLED");
  }
  if (json.statusCode === "AE0028") {
    throw new HttpError(503, "The server is not whitelisted for Jio Payments Bank money transfer yet. Contact support.", "JIO_DMT_IP_BLOCKED");
  }
  assertNobleDmtOk(httpStatus, json, fallback);
}

export function assertJioDmtAmount(amount: string): void {
  const n = Number(amount);
  if (!/^\d+$/.test(amount) || n < JIO_DMT_MIN_AMOUNT || n > JIO_DMT_MAX_AMOUNT) {
    throw new HttpError(
      400,
      `Amount must be whole rupees between ₹${JIO_DMT_MIN_AMOUNT} and ₹${JIO_DMT_MAX_AMOUNT} per transfer on Jio Payments Bank. Split larger amounts into separate transfers.`,
      "JIO_DMT_AMOUNT_RANGE",
    );
  }
}

async function state(retailerUserId: string, mobile: string): Promise<JioFlowState> {
  return (await loadRailFlowState<JioFlowState>(RAIL, retailerUserId, mobile)) ?? {};
}

async function patchState(retailerUserId: string, mobile: string, patch: JioFlowState): Promise<JioFlowState> {
  const next = { ...(await state(retailerUserId, mobile)), ...patch };
  await saveRailFlowState(RAIL, retailerUserId, mobile, next);
  return next;
}

function joinName(row: Record<string, unknown>): string {
  return [row.firstName, row.middleName, row.lastName]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 50);
}

export interface JioRemitter {
  registered: boolean;
  remittanceUserId: string;
  firstName: string;
  lastName: string;
  limits: { dailyLimit: number; monthlyLimit: number; yearlyLimit: number };
  json: NobleApiResponse;
}

export async function jioRemitterLogin(
  retailerUserId: string,
  remitterMobile: string,
  opts: JioCallOpts,
): Promise<JioRemitter> {
  const base = await common(retailerUserId, opts);
  const { httpStatus, json } = await noblePost("dmt", `${BASE}/remitter_login`, { ...base, remitterMobile });
  assertJioOk(httpStatus, json, "Jio remitter lookup failed. Try again in a minute.");
  const row = firstResponseRow(json);
  const limitsRaw = (row.limits && typeof row.limits === "object" ? row.limits : {}) as Record<string, unknown>;
  const remitter: JioRemitter = {
    registered: row.registered === true,
    remittanceUserId: String(row.remittanceUserId ?? "").trim(),
    firstName: String(row.firstName ?? "").trim(),
    lastName: String(row.lastName ?? "").trim(),
    limits: {
      dailyLimit: Number(limitsRaw.dailyLimit) || 0,
      monthlyLimit: Number(limitsRaw.monthlyLimit) || 0,
      yearlyLimit: Number(limitsRaw.yearlyLimit) || 0,
    },
    json,
  };
  if (remitter.registered && remitter.remittanceUserId) {
    await patchState(retailerUserId, remitterMobile, {
      remittanceUserId: remitter.remittanceUserId,
      remitterName: joinName(row),
    });
  }
  return remitter;
}

export async function jioRegSendOtp(
  retailerUserId: string,
  remitterMobile: string,
  aadhaarNumber: string,
  opts: JioCallOpts,
): Promise<NobleApiResponse> {
  const base = await common(retailerUserId, opts);
  const { httpStatus, json } = await noblePost("dmt", `${BASE}/reg_send_otp`, { ...base, remitterMobile });
  assertJioOk(httpStatus, json, "Registration OTP could not be sent. Try again.");
  // register_ekyc needs the Aadhaar; the state row is encrypted and expires with the flow.
  await patchState(retailerUserId, remitterMobile, { aadhaarNumber, authorizationCode: "" });
  return json;
}

export async function jioRegVerifyOtp(
  retailerUserId: string,
  remitterMobile: string,
  otp: string,
  opts: JioCallOpts,
): Promise<NobleApiResponse> {
  assertSixDigitOtp(otp);
  const base = await common(retailerUserId, opts);
  const { httpStatus, json } = await noblePost("dmt", `${BASE}/reg_verify_otp`, { ...base, remitterMobile, otp });
  assertJioOk(httpStatus, json, "Registration OTP verification failed. Check the code and try again.");
  const authorizationCode = String(firstResponseRow(json).authorizationCode ?? "").trim();
  if (!authorizationCode) {
    throw new HttpError(502, "OTP was verified but the bank sent no authorization code. Tap Register to start again.", "JIO_DMT_AUTH_CODE_MISSING");
  }
  await patchState(retailerUserId, remitterMobile, { authorizationCode });
  return json;
}

export async function jioRegisterEkyc(
  retailerUserId: string,
  remitterMobile: string,
  input: { bioType: "0" | "2"; pidData: string },
  opts: JioCallOpts,
): Promise<{ json: NobleApiResponse; remittanceUserId: string; transactionId: string }> {
  const flow = await state(retailerUserId, remitterMobile);
  if (!flow.authorizationCode || !flow.aadhaarNumber) {
    throw new HttpError(
      422,
      "Registration OTP is not verified or has expired. Tap Register to send a new OTP.",
      "JIO_DMT_REG_NOT_VERIFIED",
    );
  }
  const base = await common(retailerUserId, opts);
  const transactionId = nobleTxnId("JKY");
  const { httpStatus, json } = await noblePost("dmt", `${BASE}/register_ekyc`, {
    ...base,
    remitterMobile,
    transactionId,
    authorizationCode: flow.authorizationCode,
    aadhaarNumber: flow.aadhaarNumber,
    occupationCode: "5",
    deviceId: "",
    deviceOsVer: "",
    deviceModel: "",
    bioType: input.bioType,
    pidData: input.pidData,
  });
  if (json.status === -1 && json.message === "Pending") {
    throw new HttpError(
      409,
      "Remitter registration is still processing at Jio Payments Bank. Search the remitter again in a minute.",
      "JIO_DMT_REG_PENDING",
    );
  }
  assertJioOk(httpStatus, json, "Remitter eKYC failed. Ask the remitter to scan the finger again.");
  const remittanceUserId = String(firstResponseRow(json).remittanceUserId ?? "").trim();
  await patchState(retailerUserId, remitterMobile, {
    ...(remittanceUserId ? { remittanceUserId } : {}),
    aadhaarNumber: "",
    authorizationCode: "",
  });
  return { json, remittanceUserId, transactionId };
}

/** The OTP SMS quotes the amount, so the transfer must reuse this id and the same amount. */
export async function jioTxnSendOtp(
  retailerUserId: string,
  remitterMobile: string,
  amount: string,
  opts: JioCallOpts,
): Promise<{ json: NobleApiResponse; referenceKey: string; transactionId: string }> {
  assertJioDmtAmount(amount);
  const base = await common(retailerUserId, opts);
  const { httpStatus, json } = await noblePost("dmt", `${BASE}/txn_send_otp`, { ...base, remitterMobile, amount });
  assertJioOk(httpStatus, json, "Transfer OTP could not be sent. Try again.");
  const transactionId = nobleTxnId("JDM");
  await patchState(retailerUserId, remitterMobile, { txnId: transactionId, txnAmount: amount });
  return { json, referenceKey: `JIO~${transactionId}`, transactionId };
}

export async function jioTxnVerifySubmit(
  retailerUserId: string,
  input: {
    remitterMobile: string;
    accountNumber: string;
    ifsc: string;
    amount: string;
    mode: "imps" | "neft";
    otp: string;
    referenceKey: string;
  },
  opts: JioCallOpts,
): Promise<{ httpStatus: number; json: NobleApiResponse; transactionId: string }> {
  // Every refusal below is thrown before the provider call, so the held amount is released.
  assertJioDmtAmount(input.amount);
  assertSixDigitOtp(input.otp);
  if (input.mode !== "imps") {
    throw new HttpError(400, "Jio Payments Bank supports IMPS transfers only. Choose IMPS and try again.", "JIO_DMT_IMPS_ONLY");
  }
  const transactionId = (input.referenceKey.split("~")[1] ?? "").slice(0, 15);
  const flow = await state(retailerUserId, input.remitterMobile);
  if (!transactionId || flow.txnId !== transactionId) {
    throw new HttpError(
      422,
      "Transfer OTP session is invalid or expired. Request a new OTP and try again.",
      "NOBLE_DMT_TXN_OTP_SESSION",
    );
  }
  if (flow.txnAmount !== input.amount) {
    throw new HttpError(
      422,
      `The OTP was sent for ₹${flow.txnAmount}. Request a new OTP for ₹${input.amount} before sending.`,
      "JIO_DMT_AMOUNT_CHANGED",
    );
  }
  let remittanceUserId = flow.remittanceUserId;
  let remitterName = flow.remitterName;
  if (!remittanceUserId || !remitterName) {
    const remitter = await jioRemitterLogin(retailerUserId, input.remitterMobile, opts);
    if (!remitter.registered || !remitter.remittanceUserId) {
      throw new HttpError(422, "Remitter is not registered with Jio Payments Bank. Search the remitter again.", "JIO_DMT_REMITTER_MISSING");
    }
    remittanceUserId = remitter.remittanceUserId;
    remitterName = joinName(firstResponseRow(remitter.json));
  }
  const bene = (await nobleBeneList(input.remitterMobile).catch(() => [])).find(
    (b) => b.accountNumber === input.accountNumber && (!b.ifsc || b.ifsc === input.ifsc.toUpperCase()),
  );
  if (!bene?.name) {
    throw new HttpError(
      422,
      "Beneficiary not found for this remitter with this account number and IFSC. Search the remitter again and pick the beneficiary from the list.",
      "NOBLE_DMT_BENE_NOT_FOUND",
    );
  }
  const base = await common(retailerUserId, opts);
  // The OTP is single-use: clear it first so a retry cannot resubmit the same id.
  await patchState(retailerUserId, input.remitterMobile, { txnId: "", txnAmount: "" });
  const beneName = bene.name.slice(0, 50);
  const { httpStatus, json } = await noblePost("dmt", `${BASE}/txn_verify_submit`, {
    ...base,
    remitterMobile: input.remitterMobile,
    remittanceUserId,
    remitterName,
    beneName,
    beneAccountAlias: beneName,
    beneAccountNo: input.accountNumber,
    beneIfscCode: input.ifsc.toUpperCase(),
    amount: input.amount,
    transferMode: "IMPS",
    otp: input.otp,
    transactionId,
    deviceId: "",
    deviceOsVer: "",
    deviceModel: "",
  });
  return { httpStatus, json, transactionId };
}

export async function jioTxnStatus(
  remitterMobile: string,
  transactionId: string,
): Promise<{ httpStatus: number; json: NobleApiResponse }> {
  return noblePost("dmt", `${BASE}/txn_status`, { mobileNumber: remitterMobile, transactionId });
}
