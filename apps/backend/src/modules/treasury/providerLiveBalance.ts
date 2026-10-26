import { isNobleConfigured } from "../../config/env";
import { rupeesToPaise, type Paise } from "../../core/money";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { nobleGet } from "../providers/noble/client";
import { vyaparApiKey, vyaparGet } from "../providers/vyaparapi/client";

export interface LiveBalance {
  balance: Paise;
  hold: Paise | null;
}

export type LiveBalanceResult =
  | { status: "ok"; balance: Paise; hold: Paise | null }
  | { status: "unsupported" }
  | { status: "error"; message: string };

type Fetcher = () => Promise<LiveBalance>;

function toPaise(raw: unknown): Paise | null {
  const s = raw == null ? "" : String(raw).trim().replace(/,/g, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return rupeesToPaise(s);
}

/** Case-insensitive lookup on the top level and one nested `data` object. */
function pick(json: Record<string, unknown>, names: readonly string[]): unknown {
  const nested = json.data && typeof json.data === "object" ? (json.data as Record<string, unknown>) : null;
  for (const obj of nested ? [json, nested] : [json]) {
    for (const [k, v] of Object.entries(obj)) {
      if (names.includes(k.toLowerCase())) return v;
    }
  }
  return undefined;
}

function keysOf(json: Record<string, unknown>): string {
  const top = Object.keys(json);
  const nested =
    json.data && typeof json.data === "object" ? Object.keys(json.data as object).map((k) => `data.${k}`) : [];
  return [...top, ...nested].slice(0, 12).join(", ") || "none";
}

async function fetchVyaparApiBalance(): Promise<LiveBalance> {
  const { httpStatus, json } = await vyaparGet(
    "/public/balance",
    { api_key: vyaparApiKey() },
    { timeoutMs: 8_000 },
  );
  const ok = json.status === true || json.status === "true";
  if (httpStatus >= 400 || !ok) {
    throw new HttpError(
      502,
      `VyaparAPI balance request failed (HTTP ${httpStatus})${json.message ? `: ${String(json.message).slice(0, 120)}` : ""}`,
      "PROVIDER_BALANCE_FAILED",
    );
  }
  // Live API returns `buyer_wallet` (= Partner Wallet in their portal); docs still show partnerBalance.
  const buyer = pick(json, ["buyer_wallet"]);
  if (buyer && typeof buyer === "object") {
    const wallet = buyer as Record<string, unknown>;
    const balance = toPaise(pick(wallet, ["balance", "amount", "wallet_balance", "current_balance"]));
    if (balance == null) {
      throw new HttpError(
        502,
        `VyaparAPI buyer_wallet has no balance field (fields received: ${keysOf(wallet)})`,
        "BAD_PROVIDER_RESPONSE",
      );
    }
    return { balance, hold: toPaise(pick(wallet, ["hold", "hold_balance", "holdbalance"])) };
  }

  const balance =
    toPaise(buyer) ?? toPaise(pick(json, ["partnerbalance", "partner_balance", "balance", "wallet_balance"]));
  if (balance == null) {
    throw new HttpError(
      502,
      `VyaparAPI balance response has no buyer_wallet / partnerBalance (fields received: ${keysOf(json)})`,
      "BAD_PROVIDER_RESPONSE",
    );
  }
  return {
    balance,
    hold: toPaise(pick(json, ["buyer_hold", "buyer_wallet_hold", "partnerhold", "partner_hold", "hold"])),
  };
}

async function fetchNobleBalance(): Promise<LiveBalance> {
  if (!isNobleConfigured()) {
    throw new HttpError(503, "AEPS / DMT provider keys are not set on the server", "NOBLE_NOT_CONFIGURED");
  }
  const { httpStatus, json } = await nobleGet("service", "/api/v1.0/common/balance_check");
  if (httpStatus >= 400 || json.status !== 1) {
    const detail = (typeof json.description === "string" && json.description) || json.message;
    throw new HttpError(
      502,
      `Provider balance request failed (HTTP ${httpStatus})${detail ? `: ${String(detail).slice(0, 120)}` : ""}`,
      "PROVIDER_BALANCE_FAILED",
    );
  }
  const row = Array.isArray(json.responseData) ? json.responseData[0] : null;
  const balance =
    row && typeof row === "object" ? toPaise(pick(row as Record<string, unknown>, ["accountbalance", "balance"])) : null;
  if (balance == null) {
    throw new HttpError(
      502,
      `Provider balance response has no accountBalance (fields received: ${row && typeof row === "object" ? keysOf(row as Record<string, unknown>) : "none"})`,
      "BAD_PROVIDER_RESPONSE",
    );
  }
  return { balance, hold: null };
}

// Keyed by providers.code. A provider without an entry shows ledger float only.
const FETCHERS: Record<string, Fetcher> = {
  vyaparapi: fetchVyaparApiBalance,
  noble: fetchNobleBalance,
};

export function supportsLiveBalance(providerCode: string): boolean {
  return providerCode.toLowerCase() in FETCHERS;
}

export async function fetchProviderLiveBalance(providerCode: string): Promise<LiveBalanceResult> {
  const fetcher = FETCHERS[providerCode.toLowerCase()];
  if (!fetcher) return { status: "unsupported" };
  try {
    const live = await fetcher();
    return { status: "ok", balance: live.balance, hold: live.hold };
  } catch (err) {
    logger.warn({ err, providerCode }, "Provider live balance fetch failed");
    const message =
      err instanceof HttpError ? err.message : "Could not reach the provider balance API";
    return { status: "error", message };
  }
}
