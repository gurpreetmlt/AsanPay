import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import { mapVyaparOperatorCode } from "../vyaparapi/status";
import { bestApiConfigured, bestApiPost, bestApiRequest, type BestApiJson } from "./client";

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

/**
 * Mobile prepaid helper: operator + plans + roffer via BestAPI only.
 * Recharge debit stays on VyaparAPI.
 */
export async function lookupMobileRechargeInfo(mobile: string): Promise<MobileRechargeInfo> {
  if (!bestApiConfigured()) {
    throw new HttpError(
      503,
      "Operator lookup is not configured. Set BESTAPI_API_KEY and BESTAPI_API_SECRET.",
      "BESTAPI_NOT_CONFIGURED",
    );
  }

  const warnings: string[] = [];
  let operatorSource: MobileRechargeInfo["operatorSource"] = null;
  let plansSource: MobileRechargeInfo["plansSource"] = null;
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

  let plans: RechargePlanItem[] = [];
  let offers: RechargePlanItem[] = [];
  const opcord = op.bestOpcord || op.operatorCode;

  if (bestApiConfigured()) {
    const circleCode = op.circleCode ?? undefined;
    // Partner contract: query params operator_code + circle_code (not JSON body).
    const planQuery =
      op.operatorCode && circleCode
        ? { operator_code: op.operatorCode, circle_code: circleCode }
        : op.operatorCode
          ? { operator_code: op.operatorCode }
          : null;

    if (planQuery) {
      const planCalls: Array<{ method: "GET" | "POST" }> = [{ method: "GET" }, { method: "POST" }];
      for (const call of planCalls) {
        if (plans.length > 0) break;
        try {
          const plansRes = await bestApiRequest(call.method, PLANS_PATH, {
            query: planQuery,
            body: call.method === "POST" ? {} : undefined,
          });
          if (plansRes.httpStatus >= 400) continue;
          const sample = JSON.stringify(plansRes.json);
          if (sample.includes("Bad gateway") || sample.includes("<!DOCTYPE")) continue;
          plans = extractPlanItems(plansRes.json);
          if (plans.length === 0) {
            logger.info(
              { mobile, method: call.method, query: planQuery, sample: sample.slice(0, 600) },
              "BestAPI plans empty/unparsed",
            );
          } else {
            plansSource = "bestapi";
            logger.info(
              { mobile, method: call.method, query: planQuery, count: plans.length },
              "BestAPI plans loaded",
            );
          }
        } catch (err) {
          logger.warn({ err, mobile, method: call.method, query: planQuery }, "BestAPI plans failed");
        }
      }
    }
    if (plans.length === 0) warnings.push("BestAPI plans unavailable");

    try {
      const rofferRes = await bestApiPost(ROFFER_PATH, {
        opcord: op.operatorCode,
        circleCode,
        mobile,
      });
      if (rofferRes.httpStatus < 400) {
        offers = extractPlanItems(rofferRes.json);
        if (offers.length === 0) {
          const alt = await bestApiPost(ROFFER_PATH, {
            opcord,
            opcode: opcord,
            operator: op.operatorCode,
            circleCode,
            mobile,
          });
          if (alt.httpStatus < 400) offers = extractPlanItems(alt.json);
        }
        if (offers.length === 0) {
          logger.info(
            { mobile, sample: JSON.stringify(rofferRes.json).slice(0, 600) },
            "BestAPI roffer empty/unparsed",
          );
        } else if (!plansSource) {
          plansSource = "bestapi";
        }
      }
    } catch (err) {
      logger.warn({ err, mobile }, "BestAPI roffer failed");
    }
  }

  if (plans.length === 0 && offers.length === 0) {
    warnings.push("No plans/offers returned. Enter amount manually.");
  }

  return {
    mobile,
    operatorSource,
    operatorCode: op.operatorCode,
    operatorName: op.operatorName,
    circleCode: op.circleCode,
    circleName: op.circleName,
    plans,
    offers,
    plansSource,
    warnings,
  };
}
