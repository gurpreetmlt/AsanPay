import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import { mapVyaparOperatorCode } from "../vyaparapi/status";
import { bestApiConfigured, bestApiPost, type BestApiJson } from "./client";

const OPERATOR_PATH = "/api/gw/mobile-services/mobile-plans/mobile-operator-apis";
const PLANS_PATH = "/api/gw/mobile-services/mobile-plans/mobile-plans-apis";
const ROFFER_PATH = "/api/gw/mobile-services/mobile-plans/mobile-roffer-apis";

export type RechargePlanItem = {
  amount: string;
  title: string;
  description?: string;
  validity?: string;
  category?: string;
};

export type MobileRechargeInfo = {
  mobile: string;
  operatorCode: string | null;
  operatorName: string | null;
  circleCode: string | null;
  circleName: string | null;
  plans: RechargePlanItem[];
  offers: RechargePlanItem[];
  warnings: string[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function firstDataObject(json: BestApiJson): Record<string, unknown> {
  const data = json.data;
  if (Array.isArray(data) && data[0]) {
    const row = asRecord(data[0]);
    if (row) return row;
  }
  const nested = asRecord(data);
  if (nested) return nested;
  const result = asRecord(json.result);
  if (result) return result;
  return json;
}

function collectArrays(root: unknown, out: unknown[][] = [], depth = 0): unknown[][] {
  if (depth > 6 || root == null) return out;
  if (Array.isArray(root)) {
    if (root.length > 0 && typeof root[0] === "object") out.push(root);
    for (const item of root) collectArrays(item, out, depth + 1);
    return out;
  }
  const rec = asRecord(root);
  if (!rec) return out;
  for (const v of Object.values(rec)) collectArrays(v, out, depth + 1);
  return out;
}

function normalizePlanRow(row: Record<string, unknown>): RechargePlanItem | null {
  const amount =
    pickString(row, [
      "amount",
      "rs",
      "price",
      "mrp",
      "recharge_amount",
      "rechargeAmount",
      "plan_amount",
      "planAmount",
    ]) ?? null;
  if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount)) return null;

  const title =
    pickString(row, ["title", "name", "plan_name", "planName", "type", "category", "pack"]) ??
    `₹${amount}`;
  const description =
    pickString(row, ["description", "desc", "detail", "details", "benefit", "benefits", "data"]) ??
    undefined;
  const validity = pickString(row, ["validity", "valid", "days", "validityDays"]) ?? undefined;
  const category = pickString(row, ["category", "type", "plan_type", "planType"]) ?? undefined;

  return { amount, title, description, validity, category };
}

function extractPlanItems(json: BestApiJson): RechargePlanItem[] {
  const arrays = collectArrays(json);
  const items: RechargePlanItem[] = [];
  const seen = new Set<string>();

  for (const arr of arrays) {
    for (const raw of arr) {
      const row = asRecord(raw);
      if (!row) continue;
      const plan = normalizePlanRow(row);
      if (!plan) continue;
      const key = `${plan.amount}|${plan.title}|${plan.description ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(plan);
    }
  }

  return items.slice(0, 80);
}

function parseOperator(json: BestApiJson): {
  operatorCode: string | null;
  operatorName: string | null;
  circleCode: string | null;
  circleName: string | null;
} {
  const row = firstDataObject(json);
  const operatorName =
    pickString(row, ["operator", "operatorName", "opname", "Operator", "operator_name"]) ?? null;
  const rawCode =
    pickString(row, [
      "operatorCode",
      "operator_code",
      "opcord",
      "opcode",
      "op_code",
      "OperatorCode",
      "code",
    ]) ??
    operatorName ??
    null;
  const circleName = pickString(row, ["circle", "circleName", "circle_name", "Circle"]) ?? null;
  const circleCode =
    pickString(row, ["circleCode", "circle_code", "circlecode", "CircleCode"]) ?? null;

  return {
    operatorCode: rawCode ? mapVyaparOperatorCode(rawCode) : null,
    operatorName,
    circleCode,
    circleName,
  };
}

function assertBestApiOk(httpStatus: number, json: BestApiJson, label: string): void {
  if (httpStatus === 401 || httpStatus === 403) {
    throw new HttpError(
      502,
      "BestAPI rejected the API key/secret. Check Coolify BESTAPI_API_KEY and BESTAPI_API_SECRET.",
      "BESTAPI_UNAUTHORIZED",
    );
  }
  if (httpStatus >= 500) {
    throw new HttpError(502, `BestAPI ${label} is temporarily unavailable. Try again.`, "BESTAPI_UPSTREAM");
  }
  const status = json.status ?? json.Status ?? json.success;
  if (status === false || status === "false" || status === "ERROR" || status === "FAILED") {
    const msg =
      pickString(json, ["message", "Message", "error", "Error", "msg"]) ??
      `BestAPI ${label} failed`;
    throw new HttpError(422, msg, "BESTAPI_LOOKUP_FAILED");
  }
}

/**
 * Mobile prepaid helper: operator auto-detect + plans + roffer via BestAPI.
 * Soft-fails plans/offers so operator still returns when offer APIs are empty/broken.
 */
export async function lookupMobileRechargeInfo(mobile: string): Promise<MobileRechargeInfo> {
  if (!bestApiConfigured()) {
    throw new HttpError(
      503,
      "BestAPI is not configured. Set BESTAPI_API_KEY and BESTAPI_API_SECRET.",
      "BESTAPI_NOT_CONFIGURED",
    );
  }

  const warnings: string[] = [];
  const opRes = await bestApiPost(OPERATOR_PATH, { mobile });
  assertBestApiOk(opRes.httpStatus, opRes.json, "operator lookup");
  const op = parseOperator(opRes.json);

  if (!op.operatorCode) {
    logger.warn({ mobile, jsonKeys: Object.keys(opRes.json) }, "BestAPI operator response missing code");
    throw new HttpError(
      422,
      "Could not detect operator for this mobile number. Select the operator manually.",
      "BESTAPI_OPERATOR_UNKNOWN",
    );
  }

  let plans: RechargePlanItem[] = [];
  let offers: RechargePlanItem[] = [];

  try {
    // Docs say no params; also send known filters many gateways accept.
    const plansRes = await bestApiPost(PLANS_PATH, {
      mobile,
      opcord: op.operatorCode,
      operator: op.operatorCode,
      circle: op.circleCode ?? undefined,
    });
    if (plansRes.httpStatus < 400) {
      plans = extractPlanItems(plansRes.json);
    } else {
      warnings.push("Plans are temporarily unavailable");
    }
  } catch (err) {
    logger.warn({ err, mobile }, "BestAPI plans failed");
    warnings.push("Plans are temporarily unavailable");
  }

  try {
    const rofferRes = await bestApiPost(ROFFER_PATH, {
      opcord: op.operatorCode,
      mobile,
    });
    if (rofferRes.httpStatus < 400) {
      offers = extractPlanItems(rofferRes.json);
    } else {
      warnings.push("Offers are temporarily unavailable");
    }
  } catch (err) {
    logger.warn({ err, mobile }, "BestAPI roffer failed");
    warnings.push("Offers are temporarily unavailable");
  }

  return {
    mobile,
    operatorCode: op.operatorCode,
    operatorName: op.operatorName,
    circleCode: op.circleCode,
    circleName: op.circleName,
    plans,
    offers,
    warnings,
  };
}
