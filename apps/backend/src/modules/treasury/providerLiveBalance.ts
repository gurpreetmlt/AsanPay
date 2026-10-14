import { rupeesToPaise, type Paise } from "../../core/money";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
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
  const balance = toPaise(pick(json, ["partnerbalance", "partner_balance", "balance", "wallet_balance"]));
  if (balance == null) {
    throw new HttpError(
      502,
      `VyaparAPI balance response has no partnerBalance field (fields received: ${keysOf(json)})`,
      "BAD_PROVIDER_RESPONSE",
    );
  }
  return { balance, hold: toPaise(pick(json, ["partnerhold", "partner_hold", "hold"])) };
}

// Keyed by providers.code. A provider without an entry shows ledger float only.
const FETCHERS: Record<string, Fetcher> = {
  vyaparapi: fetchVyaparApiBalance,
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
