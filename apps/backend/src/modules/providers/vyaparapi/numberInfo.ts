import { env } from "../../../config/env";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import {
  extractPlanItems,
  extractSummaryRows,
  parseOperator,
  type OperatorHit,
  type RechargePlanItem,
} from "../bestapi/plans.service";
import { mapVyaparOperatorCode } from "./status";
import { vyaparGet, type VyaparApiJson } from "./client";

/**
 * VyaparAPI number-info lookups (operator & circle, plans, offers, DTH info) — VyaparAPI/API.md §7.
 * Used as a second provider behind BestAPI for recharge lookups; routing lives in
 * verifications/rechargeLookups.ts.
 */

const LOOKUP_TIMEOUT_MS = 12_000;

async function lookup(path: string, query: Record<string, string | undefined>, what: string): Promise<VyaparApiJson> {
  const { httpStatus, json } = await vyaparGet(
    path,
    { ...query, api_key: env.VYAPARAPI_API_KEY?.trim() || undefined },
    { timeoutMs: LOOKUP_TIMEOUT_MS },
  );
  const failed = httpStatus >= 400 || json.status === false || String(json.status).toUpperCase() === "FAILED";
  if (failed) {
    logger.warn({ path, httpStatus, statusCode: json.statusCode }, "VyaparAPI lookup failed");
    throw new HttpError(502, `VyaparAPI ${what} is unavailable right now. Try again in a minute.`, "VYAPARAPI_LOOKUP_FAILED");
  }
  return json;
}

/** Circle codes from BestAPI are numeric; VyaparAPI wants its own (MUM, DEL…) — send only those. */
function vyaparCircle(code: string | null | undefined): string | undefined {
  const c = code?.trim() ?? "";
  return /^[A-Za-z]{2,4}$/.test(c) ? c.toUpperCase() : undefined;
}

export async function vyaparMobileOperator(mobile: string): Promise<OperatorHit> {
  const json = await lookup("/public/mobile", { number: mobile }, "operator lookup");
  const hit = parseOperator(json);
  if (!hit.operatorCode) {
    throw new HttpError(422, "Could not detect operator for this mobile number. Select the operator manually.", "VYAPARAPI_OPERATOR_UNKNOWN");
  }
  return hit;
}

export async function vyaparMobilePlans(input: { operatorCode: string; circleCode: string }): Promise<RechargePlanItem[]> {
  const json = await lookup(
    "/public/mobile/plans",
    { operator_code: mapVyaparOperatorCode(input.operatorCode), circle_code: vyaparCircle(input.circleCode) },
    "plans",
  );
  return extractPlanItems(json);
}

export async function vyaparMobileOffers(input: { operatorCode: string; mobile: string }): Promise<RechargePlanItem[]> {
  const json = await lookup(
    "/public/mobile/roffer",
    { operator_code: mapVyaparOperatorCode(input.operatorCode), mobile: input.mobile.replace(/\D/g, "") },
    "offers",
  );
  return extractPlanItems(json);
}

export async function vyaparDthPlans(operatorCode: string): Promise<RechargePlanItem[]> {
  const json = await lookup("/public/dth/plans", { operator_code: mapVyaparOperatorCode(operatorCode) }, "DTH plans");
  return extractPlanItems(json);
}

export async function vyaparDthInfo(input: { operatorCode: string; number: string }) {
  const operatorCode = mapVyaparOperatorCode(input.operatorCode);
  const json = await lookup("/public/dth/info", { operator_code: operatorCode, mobile: input.number }, "DTH customer info");
  return { number: input.number, operatorCode, plans: extractPlanItems(json), summary: extractSummaryRows(json) };
}
