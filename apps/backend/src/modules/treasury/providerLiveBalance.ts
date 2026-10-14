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

function toPaise(raw: unknown, field: string): Paise {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) throw new HttpError(502, `Provider response is missing ${field}`, "BAD_PROVIDER_RESPONSE");
  return rupeesToPaise(s);
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
  return {
    balance: toPaise(json.partnerBalance, "partnerBalance"),
    hold: json.partnerHold != null && String(json.partnerHold).trim() !== ""
      ? toPaise(json.partnerHold, "partnerHold")
      : null,
  };
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
