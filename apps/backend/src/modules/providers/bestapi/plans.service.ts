import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import { mapVyaparOperatorCode } from "../vyaparapi/status";
import { bestApiConfigured, bestApiPost, type BestApiJson } from "./client";

/** Paths match BestAPI portal docs (Mobile/DTH Information · Sept 2026). */
const OPERATOR_PATH = "/api/gw/mobile/information/mobile-operators";
const PLANS_PATH = "/api/gw/mobile/information/mobile-plans";
const ROFFER_PATH = "/api/gw/mobile/information/roffer";
const DTH_PLAN_PATH = "/api/gw/dth-services/dth-plans/dth-plan";
const DTH_INFO_PATH = "/api/gw/dth/information/customer";

export type RechargePlanItem = {
  amount: string;
  title: string;
  description?: string;
  validity?: string;
  category?: string;
};

export type MobileRechargeInfo = {
  mobile: string;
  /** Which upstream filled operator/circle */
  operatorSource: "bestapi" | null;
  operatorCode: string | null;
  operatorName: string | null;
  circleCode: string | null;
  circleName: string | null;
  plans: RechargePlanItem[];
  offers: RechargePlanItem[];
  /** Which upstream filled plans/offers */
  plansSource: "bestapi" | null;
  warnings: string[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) lower.set(k.toLowerCase(), v);
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** Case-insensitive deep search for the first matching string/number field. */
function deepFindString(root: unknown, keys: string[]): string | null {
  const want = new Set(keys.map((k) => k.toLowerCase()));
  let found: string | null = null;

  function walk(node: unknown, depth: number): void {
    if (found || node == null || depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const rec = asRecord(node);
    if (!rec) return;
    for (const [k, v] of Object.entries(rec)) {
      if (want.has(k.toLowerCase())) {
        if (typeof v === "string" && v.trim()) {
          found = v.trim();
          return;
        }
        if (typeof v === "number" && Number.isFinite(v)) {
          found = String(v);
          return;
        }
      }
      walk(v, depth + 1);
    }
  }

  walk(root, 0);
  return found;
}

function firstDataObject(json: BestApiJson): Record<string, unknown> {
  // BestAPI often wraps: { success, data: { status, data: { operator... } } }
  let cur: Record<string, unknown> = json;
  for (let i = 0; i < 4; i++) {
    const inner = asRecord(cur.data);
    if (!inner) break;
    // Prefer the innermost object that already has operator fields
    if (
      pickString(inner, ["operator", "operatorCode", "opcord", "opcode", "circle", "circleCode"]) ||
      (asRecord(inner.data) &&
        pickString(asRecord(inner.data)!, [
          "operator",
          "operatorCode",
          "opcord",
          "opcode",
          "circle",
          "circleCode",
        ]))
    ) {
      const deeper = asRecord(inner.data);
      if (
        deeper &&
        pickString(deeper, ["operator", "operatorCode", "opcord", "opcode", "circle", "circleCode"])
      ) {
        return deeper;
      }
      return inner;
    }
    cur = inner;
  }

  const data = json.data;
  if (Array.isArray(data) && data[0]) {
    const row = asRecord(data[0]);
    if (row) return row;
  }
  const nested = asRecord(data);
  if (nested) return nested;
  const result = asRecord(json.result);
  if (result) return result;
  const response = asRecord(json.response);
  if (response) return response;
  const payload = asRecord(json.payload);
  if (payload) return payload;
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
  const amountRaw =
    pickString(row, [
      "amount",
      "rs",
      "price",
      "mrp",
      "recharge_amount",
      "rechargeAmount",
      "plan_amount",
      "planAmount",
      "planrs",
      "plan_rs",
      "Amount",
      "RS",
    ]) ?? null;
  if (!amountRaw) return null;
  const amount = amountRaw.replace(/[^\d.]/g, "");
  if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount)) return null;

  const title =
    pickString(row, [
      "title",
      "name",
      "plan_name",
      "planName",
      "type",
      "category",
      "pack",
      "plan_type",
      "planType",
      "offerName",
    ]) ?? `₹${amount}`;
  const description =
    pickString(row, [
      "description",
      "desc",
      "detail",
      "details",
      "benefit",
      "benefits",
      "data",
      "talkTime",
      "talktime",
      "Remark",
      "remark",
    ]) ?? undefined;
  const validity =
    pickString(row, ["validity", "valid", "days", "validityDays", "Validity"]) ?? undefined;
  const category =
    pickString(row, ["category", "type", "plan_type", "planType", "plan_name"]) ?? undefined;

  return { amount, title, description, validity, category };
}

function findRdata(root: unknown): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  function walk(node: unknown, depth: number): void {
    if (found || node == null || depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const rec = asRecord(node);
    if (!rec) return;
    for (const [k, v] of Object.entries(rec)) {
      if (k.toLowerCase() === "rdata") {
        const inner = asRecord(v);
        if (inner) {
          found = inner;
          return;
        }
      }
      walk(v, depth + 1);
    }
  }
  walk(root, 0);
  return found;
}

function extractPlanItems(json: BestApiJson): RechargePlanItem[] {
  const items: RechargePlanItem[] = [];
  const seen = new Set<string>();

  function addPlan(row: Record<string, unknown>, category?: string): void {
    const plan = normalizePlanRow(row);
    if (!plan) return;
    if (category) {
      plan.category = category;
      if (plan.title === `₹${plan.amount}`) plan.title = category;
    }
    const key = `${plan.amount}|${plan.title}|${plan.description ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(plan);
  }

  const rdata = findRdata(json);
  if (rdata) {
    for (const [category, arr] of Object.entries(rdata)) {
      if (!Array.isArray(arr)) continue;
      for (const raw of arr) {
        const row = asRecord(raw);
        if (row) addPlan(row, category);
      }
    }
    if (items.length > 0) return items.slice(0, 80);
  }

  for (const arr of collectArrays(json)) {
    for (const raw of arr) {
      const row = asRecord(raw);
      if (row) addPlan(row);
    }
  }

  return items.slice(0, 80);
}

type OperatorHit = {
  /** Vyapar recharge code (JIO, AT, …) */
  operatorCode: string | null;
  /** Raw BestAPI opcord if different from mapped code */
  bestOpcord: string | null;
  operatorName: string | null;
  circleCode: string | null;
  circleName: string | null;
};

function parseOperator(json: BestApiJson): OperatorHit {
  const row = firstDataObject(json);
  const operatorName =
    pickString(row, ["operator", "operatorName", "opname", "Operator", "operator_name"]) ??
    deepFindString(json, ["operator", "operatorName", "opname", "Operator", "operator_name"]);

  const rawCode =
    pickString(row, [
      "operatorCode",
      "operator_code",
      "opcord",
      "opcode",
      "op_code",
      "OperatorCode",
      "opCode",
      "OpCode",
      "code",
    ]) ??
    deepFindString(json, [
      "operatorCode",
      "operator_code",
      "opcord",
      "opcode",
      "op_code",
      "OperatorCode",
      "opCode",
      "OpCode",
    ]) ??
    operatorName ??
    null;

  const circleName =
    pickString(row, ["circleName", "circle_name", "CircleName"]) ??
    deepFindString(json, ["circleName", "circle_name", "CircleName"]);
  let circleCode =
    pickString(row, ["circleCode", "circle_code", "circlecode", "CircleCode", "ccode"]) ??
    deepFindString(json, ["circleCode", "circle_code", "circlecode", "CircleCode", "ccode"]);
  const circleRaw =
    pickString(row, ["circle", "Circle"]) ?? deepFindString(json, ["circle", "Circle"]);
  if (!circleCode && circleRaw && /^[A-Za-z0-9]{1,4}$/.test(circleRaw)) {
    circleCode = circleRaw;
  }

  return {
    bestOpcord: rawCode,
    operatorCode: rawCode ? mapVyaparOperatorCode(rawCode) : null,
    operatorName,
    circleCode,
    circleName: circleName ?? (circleRaw && !/^[0-9]{1,4}$/.test(circleRaw) ? circleRaw : null),
  };
}

export function padBestApiCircle(code: string): string {
  const t = code.trim();
  if (/^\d{1,2}$/.test(t)) return t.padStart(2, "0");
  return t;
}

function assertBestApiConfigured(): void {
  if (!bestApiConfigured()) {
    throw new HttpError(
      503,
      "Operator lookup is not configured. Set BESTAPI_API_KEY and BESTAPI_API_SECRET.",
      "BESTAPI_NOT_CONFIGURED",
    );
  }
}

function isBadGatewayPayload(sample: string): boolean {
  return sample.includes("Bad gateway") || sample.includes("<!DOCTYPE") || sample.includes("origin_bad_gateway");
}

export async function fetchMobilePlans(input: {
  mobile?: string;
  operatorCode: string;
  circleCode: string;
}): Promise<RechargePlanItem[]> {
  assertBestApiConfigured();
  const opcord = mapVyaparOperatorCode(input.operatorCode);
  const circle = padBestApiCircle(input.circleCode);
  const plansRes = await bestApiPost(PLANS_PATH, { opcord, circle });
  const sample = JSON.stringify(plansRes.json);
  if (plansRes.httpStatus >= 400 || isBadGatewayPayload(sample)) {
    throw new HttpError(
      502,
      "BestAPI plans are temporarily unavailable. Try again in a minute.",
      "BESTAPI_PLANS_UNAVAILABLE",
    );
  }
  const plans = extractPlanItems(plansRes.json);
  logger.info(
    { mobile: input.mobile || null, opcord, circle, count: plans.length },
    "BestAPI plans loaded",
  );
  return plans;
}

export async function fetchMobileOffers(input: {
  mobile: string;
  operatorCode: string;
  /** Kept for caller compat — Roffer docs do not send circle. */
  circleCode: string;
}): Promise<RechargePlanItem[]> {
  assertBestApiConfigured();
  void input.circleCode;
  const opcord = mapVyaparOperatorCode(input.operatorCode);
  const mobile = input.mobile.replace(/\D/g, "");
  // BestAPI Roffer docs: body only { opcord, mobile } — no circle, no status gate.
  const res = await bestApiPost(ROFFER_PATH, { opcord, mobile });
  const sample = JSON.stringify(res.json);
  if (isBadGatewayPayload(sample)) {
    throw new HttpError(
      502,
      "BestAPI offers are temporarily unavailable. Try again in a minute.",
      "BESTAPI_OFFERS_UNAVAILABLE",
    );
  }
  const offers = extractPlanItems(res.json);
  logger.info(
    { mobile, opcord, httpStatus: res.httpStatus, count: offers.length },
    "BestAPI offers loaded",
  );
  return offers;
}

/**
 * Mobile prepaid helper: operator + circle via BestAPI only.
 * Plans and offers load separately when the retailer opens those tabs.
 */
export async function lookupMobileRechargeInfo(mobile: string): Promise<MobileRechargeInfo> {
  assertBestApiConfigured();

  const warnings: string[] = [];
  let operatorSource: MobileRechargeInfo["operatorSource"] = null;
  let op: OperatorHit = {
    operatorCode: null,
    bestOpcord: null,
    operatorName: null,
    circleCode: null,
    circleName: null,
  };

  try {
    const opRes = await bestApiPost(OPERATOR_PATH, { mobile });
    logger.info(
      {
        mobile,
        httpStatus: opRes.httpStatus,
        sample: JSON.stringify(opRes.json).slice(0, 600),
      },
      "BestAPI operator raw",
    );

    if (opRes.httpStatus === 401 || opRes.httpStatus === 403) {
      warnings.push("BestAPI auth failed — check BESTAPI_API_KEY / BESTAPI_API_SECRET");
    } else if (opRes.httpStatus < 400) {
      op = parseOperator(opRes.json);
      if (op.operatorCode) operatorSource = "bestapi";
    } else {
      warnings.push("BestAPI operator lookup unavailable");
    }
  } catch (err) {
    logger.warn({ err, mobile }, "BestAPI operator call failed");
    warnings.push("BestAPI operator lookup unavailable");
  }

  if (!op.operatorCode) {
    throw new HttpError(
      422,
      "Could not detect operator for this mobile number. Select the operator manually.",
      "BESTAPI_OPERATOR_UNKNOWN",
    );
  }

  return {
    mobile,
    operatorSource,
    operatorCode: op.operatorCode,
    operatorName: op.operatorName,
    circleCode: op.circleCode,
    circleName: op.circleName,
    plans: [],
    offers: [],
    plansSource: null,
    warnings,
  };
}

function extractSummaryRows(json: BestApiJson): { label: string; value: string }[] {
  const row = firstDataObject(json);
  const skip = new Set([
    "status",
    "success",
    "message",
    "msg",
    "error",
    "data",
    "result",
    "rdata",
    "plans",
  ]);
  const out: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k.toLowerCase())) continue;
    if (typeof v === "string" && v.trim() && v.length <= 200) {
      out.push({ label: k, value: v.trim() });
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out.push({ label: k, value: String(v) });
    }
    if (out.length >= 20) break;
  }
  return out;
}

/** BestAPI DTH plan list for an operator (`opcord` only). */
export async function fetchDthPlans(operatorCode: string): Promise<RechargePlanItem[]> {
  assertBestApiConfigured();
  const opcord = mapVyaparOperatorCode(operatorCode);
  const res = await bestApiPost(DTH_PLAN_PATH, { opcord });
  const sample = JSON.stringify(res.json).slice(0, 800);
  if (res.httpStatus >= 400 || isBadGatewayPayload(sample)) {
    throw new HttpError(
      502,
      "DTH plans are temporarily unavailable. Try again in a minute.",
      "BESTAPI_DTH_PLANS_UNAVAILABLE",
    );
  }
  const plans = extractPlanItems(res.json);
  logger.info({ opcord, count: plans.length, httpStatus: res.httpStatus }, "BestAPI DTH plans loaded");
  return plans;
}

/** BestAPI DTH customer info for operator + subscriber number. */
export async function fetchDthInfo(input: {
  operatorCode: string;
  number: string;
}): Promise<{
  number: string;
  operatorCode: string;
  plans: RechargePlanItem[];
  summary: { label: string; value: string }[];
}> {
  assertBestApiConfigured();
  const opcord = mapVyaparOperatorCode(input.operatorCode);
  const number = input.number.replace(/\s+/g, "").trim();
  if (number.length < 8) {
    throw new HttpError(422, "Enter a valid DTH subscriber number", "INVALID_DTH_NUMBER");
  }
  const res = await bestApiPost(DTH_INFO_PATH, { opcord, number });
  const sample = JSON.stringify(res.json).slice(0, 800);
  if (res.httpStatus >= 400 || isBadGatewayPayload(sample)) {
    throw new HttpError(
      502,
      "DTH info is temporarily unavailable. Try again in a minute.",
      "BESTAPI_DTH_INFO_UNAVAILABLE",
    );
  }
  const plans = extractPlanItems(res.json);
  const summary = extractSummaryRows(res.json);
  logger.info(
    { opcord, numberLen: number.length, planCount: plans.length, summaryCount: summary.length },
    "BestAPI DTH info loaded",
  );
  return { number, operatorCode: opcord, plans, summary };
}
