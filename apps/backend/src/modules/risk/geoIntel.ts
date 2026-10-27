/**
 * Free location lookups for signup risk flags. Every function returns null on any failure —
 * a lookup outage must never block or slow down signup.
 */
import { isIP } from "node:net";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

const LOOKUP_TIMEOUT_MS = 4000;
const PINCODE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PINCODE_MISS_TTL_MS = 60 * 60 * 1000;

type LatLng = { lat: number; lng: number };

const pincodeCache = new Map<string, { value: LatLng | null; expiresAt: number }>();

/** Approximate centre of an Indian pincode via OpenStreetMap Nominatim (usage policy: real User-Agent, ≤1 req/s, cache). */
export async function pincodeCentroid(pincode: string): Promise<LatLng | null> {
  if (!/^\d{6}$/.test(pincode)) return null;
  const cached = pincodeCache.get(pincode);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: LatLng | null = null;
  let failed = false;
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${pincode}&countrycodes=in&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": `AsanPay-KYC/1.0 (+${env.AGENT_PORTAL_URL})`, Accept: "application/json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) {
      failed = true;
    } else {
      const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
      const lat = Number(rows[0]?.lat);
      const lng = Number(rows[0]?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) value = { lat, lng };
    }
  } catch (err) {
    failed = true;
    logger.warn({ pincode, err: (err as Error).message }, "pincode lookup failed");
  }
  // Outages are not cached so the next submit can try again.
  if (!failed) {
    pincodeCache.set(pincode, {
      value,
      expiresAt: Date.now() + (value ? PINCODE_CACHE_TTL_MS : PINCODE_MISS_TTL_MS),
    });
  }
  return value;
}

function isPublicIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/, "");
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number) as [number, number];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (isIP(v) === 6) {
    const lower = v.toLowerCase();
    return !(lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80"));
  }
  return false;
}

type CountryReader = { get(ip: string): { country?: { iso_code?: string } } | null };
let readerPromise: Promise<CountryReader | null> | null = null;

function geoliteReader(): Promise<CountryReader | null> {
  if (!env.GEOLITE2_DB_PATH) return Promise.resolve(null);
  readerPromise ??= (async () => {
    try {
      // Optional dependency: a missing package or .mmdb file just disables the lookup.
      const pkg = "maxmind";
      const mod = (await import(pkg)) as { default?: { open(path: string): Promise<CountryReader> }; open?(path: string): Promise<CountryReader> };
      const open = mod.default?.open ?? mod.open;
      if (!open) return null;
      return await open(env.GEOLITE2_DB_PATH!);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "GeoLite2 database could not be opened");
      return null;
    }
  })();
  return readerPromise;
}

export interface IpIntel {
  /** ISO country code, when known. */
  country: string | null;
  /** True when ip-api.com marks the IP as a proxy / VPN / hosting network. */
  proxy: boolean;
  sources: string[];
}

/** Country (GeoLite2) + proxy (ip-api.com, env-gated). Null for private IPs or when nothing is configured. */
export async function lookupIpIntel(ip: string | null | undefined): Promise<IpIntel | null> {
  if (!ip || !isPublicIp(ip)) return null;
  const clean = ip.replace(/^::ffff:/, "");
  const intel: IpIntel = { country: null, proxy: false, sources: [] };

  const reader = await geoliteReader();
  if (reader) {
    try {
      const hit = reader.get(clean);
      if (hit?.country?.iso_code) {
        intel.country = hit.country.iso_code;
        intel.sources.push("geolite2");
      }
    } catch {
      /* unreadable entry — treat as unknown */
    }
  }

  if (env.IP_PROXY_CHECK_ENABLED) {
    try {
      // Free tier is HTTP only (no key).
      const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,countryCode,proxy,hosting`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (res.ok) {
        const body = (await res.json()) as { status?: string; countryCode?: string; proxy?: boolean; hosting?: boolean };
        if (body.status === "success") {
          intel.proxy = Boolean(body.proxy || body.hosting);
          intel.country ??= body.countryCode ?? null;
          intel.sources.push("ip-api");
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "ip proxy lookup failed");
    }
  }

  return intel.sources.length ? intel : null;
}
