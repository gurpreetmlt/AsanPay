import { cacheGet, cacheSet } from "../cache/redis";
import { logger } from "./logger";

const LOOKUP_TIMEOUT_MS = 4000;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MEMORY_MAX = 2000;

/** IFSC prefix → bank name, used when the public IFSC directory is unreachable. */
const BANK_BY_PREFIX: Record<string, string> = {
  SBIN: "STATE BANK OF INDIA",
  HDFC: "HDFC BANK",
  ICIC: "ICICI BANK",
  UTIB: "AXIS BANK",
  PUNB: "PUNJAB NATIONAL BANK",
  BARB: "BANK OF BARODA",
  CNRB: "CANARA BANK",
  UBIN: "UNION BANK OF INDIA",
  IDIB: "INDIAN BANK",
  IOBA: "INDIAN OVERSEAS BANK",
  KKBK: "KOTAK MAHINDRA BANK",
  YESB: "YES BANK",
  FDRL: "FEDERAL BANK",
  INDB: "INDUSIND BANK",
  BKID: "BANK OF INDIA",
  CBIN: "CENTRAL BANK OF INDIA",
  MAHB: "BANK OF MAHARASHTRA",
  IDFB: "IDFC FIRST BANK",
  RATN: "RBL BANK",
  AIRP: "AIRTEL PAYMENTS BANK",
  PYTM: "PAYTM PAYMENTS BANK",
  FINO: "FINO PAYMENTS BANK",
  IPOS: "INDIA POST PAYMENTS BANK",
  UCBA: "UCO BANK",
  PSIB: "PUNJAB AND SIND BANK",
  ESFB: "EQUITAS SMALL FINANCE BANK",
  AUBL: "AU SMALL FINANCE BANK",
  UJVN: "UJJIVAN SMALL FINANCE BANK",
  JAKA: "JAMMU AND KASHMIR BANK",
  KARB: "KARNATAKA BANK",
  KVBL: "KARUR VYSYA BANK",
  SIBL: "SOUTH INDIAN BANK",
  TMBL: "TAMILNAD MERCANTILE BANK",
  CIUB: "CITY UNION BANK",
  DLXB: "DHANLAXMI BANK",
  DBSS: "DBS BANK INDIA",
  CITI: "CITIBANK",
  SCBL: "STANDARD CHARTERED BANK",
  HSBC: "HSBC",
};

const memory = new Map<string, string>();

function normalizeIfsc(ifsc: string): string {
  return ifsc.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Offline bank name from the IFSC prefix ("" when unknown). */
export function bankNameFromIfscPrefix(ifsc: string): string {
  return BANK_BY_PREFIX[normalizeIfsc(ifsc).slice(0, 4)] ?? "";
}

/**
 * Bank name for an IFSC: cache → public IFSC directory → prefix table.
 * Never throws; returns "" only when nothing is known.
 */
export async function lookupIfscBankName(ifsc: string): Promise<string> {
  const code = normalizeIfsc(ifsc);
  if (code.length !== 11) return bankNameFromIfscPrefix(code);

  const hit = memory.get(code);
  if (hit) return hit;

  const cacheKey = `ifsc:bank:${code}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    memory.set(code, cached);
    return cached;
  }

  let name = "";
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${code}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = (await res.json()) as { BANK?: string };
      name = (data.BANK ?? "").trim().toUpperCase();
    }
  } catch (err) {
    logger.warn({ err, ifscPrefix: code.slice(0, 4) }, "IFSC bank lookup failed");
  }

  if (!name) return bankNameFromIfscPrefix(code);

  if (memory.size >= MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(code, name);
  await cacheSet(cacheKey, name, CACHE_TTL_SECONDS);
  return name;
}
