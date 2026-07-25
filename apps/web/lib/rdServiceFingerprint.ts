/**
 * Browser → local Mantra L1 RD Service (Windows).
 * Fast path: cached port → one CAPTURE. Slow full scan only on cache miss.
 */

const CACHE_KEY = "asanpay_rd_endpoint_v5";
const PORT_START = 11100;
const PORT_END = 11120;
const PRIORITY_PORTS = [11100, 11101, 11102, 11120, 11103];
const PROBE_MS = 600;
const CAPTURE_MS = 20000;
const QUICK_FAIL_MS = 1200;
const BATCH = 10;

type Scheme = "http" | "https";

export interface RdEndpoint {
  port: number;
  scheme: Scheme;
  capturePath: string;
  /** Friendly name from DeviceInfo mi= (e.g. Mantra MFS110) */
  deviceName?: string;
  serial?: string;
}

let lastLog: string[] = [];
/** In-memory for same page session — skip localStorage + probe */
let sessionEp: RdEndpoint | null = null;

function orderedPorts(): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const p of PRIORITY_PORTS) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  for (let p = PORT_START; p <= PORT_END; p++) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function xhrRequest(
  method: string,
  url: string,
  body: string | null,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader("Content-Type", "text/xml; charset=utf-8");
    xhr.setRequestHeader("Accept", "text/xml, application/xml, */*");
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText ?? "" });
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.ontimeout = () => reject(new Error("Timeout"));
    xhr.send(body);
  });
}

function loadCache(): RdEndpoint | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as RdEndpoint;
    if (
      typeof p.port === "number" &&
      (p.scheme === "http" || p.scheme === "https") &&
      typeof p.capturePath === "string"
    ) {
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveCache(ep: RdEndpoint) {
  sessionEp = ep;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(ep));
  } catch {
    /* ignore */
  }
}

function clearCache() {
  sessionEp = null;
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem("asanpay_rd_endpoint_v4");
    localStorage.removeItem("asanpay_rd_endpoint_v3");
    localStorage.removeItem("asanpay_rd_endpoint_v2");
    localStorage.removeItem("asanpay_rd_endpoint");
  } catch {
    /* ignore */
  }
}

/** Single cheap probe — alive if any response. */
async function isAlive(port: number, scheme: Scheme): Promise<boolean> {
  const url = `${scheme}://127.0.0.1:${port}/`;
  try {
    await xhrRequest("RDSERVICE", url, null, PROBE_MS);
    return true;
  } catch {
    try {
      await xhrRequest("GET", url, null, PROBE_MS);
      return true;
    } catch {
      return false;
    }
  }
}

/** Parse model from RD DeviceInfo / RDService XML — no serial in display name. */
export function parseDeviceInfo(xml: string): { deviceName: string; serial?: string } | null {
  if (!xml || !xml.includes("<")) return null;

  const mi =
    xml.match(/\bmi="([^"]+)"/i)?.[1]?.trim() ||
    xml.match(/<mi>([^<]+)<\/mi>/i)?.[1]?.trim() ||
    "";

  const infoAttr =
    xml.match(/\binfo="([^"]+)"/i)?.[1]?.trim() ||
    xml.match(/\brdsId="([^"]+)"/i)?.[1]?.trim() ||
    "";

  const dpId = xml.match(/\bdpId="([^"]+)"/i)?.[1] ?? "";
  const rdsId = xml.match(/\brdsId="([^"]+)"/i)?.[1] ?? "";
  const serial =
    xml.match(/\bserialNo="([^"]+)"/i)?.[1] ||
    xml.match(/Serial\s*No[:\s]+([A-Za-z0-9-]+)/i)?.[1];

  const blob = `${dpId} ${rdsId} ${infoAttr} ${mi} ${xml.slice(0, 500)}`.toLowerCase();

  let brand = "";
  if (blob.includes("mantra")) brand = "Mantra";
  else if (blob.includes("morpho") || blob.includes("idemia") || blob.includes("sagem")) brand = "Morpho";
  else if (blob.includes("startek") || blob.includes("acpl")) brand = "Startek";
  else if (blob.includes("evolute")) brand = "Evolute";
  else if (blob.includes("precision")) brand = "Precision";
  else if (blob.includes("visiontek") || blob.includes("linkwell") || blob.includes("vision"))
    brand = "VisionTek";

  // Model from mi=, or from info like "Mantra.MFS110..." / "MANTRA.MFS110.RDService"
  let model = mi;
  if (!model && infoAttr) {
    const fromInfo =
      infoAttr.match(/\b(MFS\d+|MSO\d+|MARC\s*\d+|FM\d+|PB\d+|V\d+)\b/i)?.[1] ||
      infoAttr.split(/[./_]/)[1];
    if (fromInfo && !/^android|windows|rdservice|l1|rd$/i.test(fromInfo)) {
      model = fromInfo.trim();
    }
  }
  if (!model && /mfs110/i.test(blob)) model = "MFS110";
  if (!model && /mfs100/i.test(blob)) model = "MFS100";
  if (!model && /marc\s*11/i.test(blob)) model = "Marc 11";

  if (!brand && model && /mfs|marc/i.test(model)) brand = "Mantra";
  if (!brand && !model) return null;

  // Level from XML / info (default L1 for UIDAI RD)
  const level = /\bl2\b/i.test(blob) ? "L2" : "L1";

  let deviceName: string;
  if (brand && model) {
    const modelClean = model.replace(/\s+/g, " ").trim();
    // Avoid "Mantra Mantra MFS110"
    const modelPart = modelClean.toLowerCase().startsWith(brand.toLowerCase())
      ? modelClean
      : modelClean;
    deviceName = `${brand} ${modelPart}`;
    if (!new RegExp(`\\b${level}\\b`, "i").test(deviceName)) {
      deviceName = `${deviceName} ${level}`;
    }
  } else if (brand) {
    deviceName = `${brand} ${level}`;
  } else {
    deviceName = `${model} ${level}`;
  }

  return {
    deviceName: deviceName.replace(/\s+/g, " ").trim(),
    serial: serial?.trim() || undefined,
  };
}

async function fetchDeviceMeta(
  port: number,
  scheme: Scheme,
): Promise<{ deviceName?: string; serial?: string; capturePath: string }> {
  const base = `${scheme}://127.0.0.1:${port}`;
  const attempts: { method: string; path: string }[] = [
    { method: "DEVICEINFO", path: "/" },
    { method: "RDSERVICE", path: "/" },
    { method: "DEVICEINFO", path: "/rd/info" },
    { method: "GET", path: "/rd/info" },
  ];

  for (const a of attempts) {
    try {
      const res = await xhrRequest(a.method, `${base}${a.path}`, null, PROBE_MS + 400);
      const parsed = parseDeviceInfo(res.text);
      if (parsed) {
        return { ...parsed, capturePath: "/rd/capture" };
      }
    } catch {
      /* next */
    }
  }
  return { capturePath: "/rd/capture" };
}

/** Probe + read device name when RD is alive. */
async function probeAndDescribe(port: number, scheme: Scheme): Promise<RdEndpoint | null> {
  if (!(await isAlive(port, scheme))) return null;
  const meta = await fetchDeviceMeta(port, scheme);
  return {
    port,
    scheme,
    capturePath: meta.capturePath,
    deviceName: meta.deviceName,
    serial: meta.serial,
  };
}

async function discoverRdEndpoint(force = false): Promise<RdEndpoint | null> {
  lastLog = [];

  if (!force && sessionEp) {
    lastLog.push(`session ${sessionEp.deviceName || sessionEp.port}`);
    const weakName =
      !sessionEp.deviceName ||
      /^biometric(\s+l[12])?$/i.test(sessionEp.deviceName.trim());
    if (weakName) {
      const meta = await fetchDeviceMeta(sessionEp.port, sessionEp.scheme);
      if (meta.deviceName) {
        sessionEp = { ...sessionEp, ...meta };
        saveCache(sessionEp);
      }
    }
    return sessionEp;
  }

  const preferHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const schemes: Scheme[] = preferHttps ? ["https", "http"] : ["http", "https"];

  const cached = loadCache();
  if (!force && cached) {
    const live = await probeAndDescribe(cached.port, cached.scheme);
    if (live) {
      lastLog.push(`cached ${live.deviceName || live.port}`);
      saveCache(live);
      return live;
    }
    for (const scheme of schemes) {
      if (scheme === cached.scheme) continue;
      const live2 = await probeAndDescribe(cached.port, scheme);
      if (live2) {
        saveCache(live2);
        return live2;
      }
    }
    clearCache();
  }

  const ports = orderedPorts();
  for (let i = 0; i < ports.length; i += BATCH) {
    const batch = ports.slice(i, i + BATCH);
    // First find any alive port quickly, then fetch name for the first hit
    const aliveChecks = await Promise.all(
      batch.flatMap((port) =>
        schemes.map(async (scheme) => ((await isAlive(port, scheme)) ? { port, scheme } : null)),
      ),
    );
    const hit = aliveChecks.find((r): r is { port: number; scheme: Scheme } => r !== null);
    if (hit) {
      const ep = await probeAndDescribe(hit.port, hit.scheme);
      if (ep) {
        lastLog.push(`found ${ep.deviceName || `${ep.scheme}://${ep.port}`}`);
        saveCache(ep);
        return ep;
      }
    }
  }
  return null;
}

// Transaction OTP (₹5,000+ withdrawals) rides inside the PID: RD service embeds it when
// the Opts tag carries otp="......".
function otpAttr(otp?: string): string {
  return otp ? ` otp="${otp}"` : "";
}

function pidOptions(timeoutMs: number, otp?: string): string {
  // Single Mantra L1-friendly XML (avoid multi-variant loops before light-on)
  return `<PidOptions ver="1.0"><Opts fCount="1" fType="2" iCount="0" pCount="0" format="0" pidVer="2.0" timeout="${timeoutMs}"${otpAttr(otp)} posh="UNKNOWN" env="P"/></PidOptions>`;
}

function pidOptionsAlt(timeoutMs: number, otp?: string): string {
  return `<PidOptions ver="1.0"><Opts fCount="1" fType="0" iCount="0" pCount="0" format="0" pidVer="2.0" timeout="${timeoutMs}"${otpAttr(otp)} posh="UNKNOWN" env="P"/></PidOptions>`;
}

function extractErr(xml: string): string | null {
  const code = xml.match(/errCode="(-?\d+)"/);
  if (!code || code[1] === "0") return null;
  const info = xml.match(/errInfo="([^"]*)"/);
  return info?.[1] || `RD error ${code[1]}`;
}

function isSuccessPid(text: string): boolean {
  return text.includes("<PidData") && (text.includes('errCode="0"') || !extractErr(text));
}

async function captureOnce(
  url: string,
  body: string,
  timeoutMs: number,
): Promise<{ ok: true; xml: string } | { ok: false; detail: string; fatal?: boolean }> {
  try {
    const res = await xhrRequest("CAPTURE", url, body, timeoutMs);
    const text = res.text;
    const err = extractErr(text);
    if (err) {
      const fatal =
        /finger|timeout|not connected|device|busy|cancel/i.test(err) ||
        text.includes('errCode="700"');
      return { ok: false, detail: err, fatal };
    }
    if (isSuccessPid(text) || (text.includes("<PidData") && text.includes("<Data"))) {
      return { ok: true, xml: text };
    }
    if (text.includes("<PidData")) return { ok: true, xml: text };
    return { ok: false, detail: `Unexpected response from ${url}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, detail: `${url}: ${msg}` };
  }
}

async function captureOn(ep: RdEndpoint, otp?: string): Promise<string> {
  const base = `${ep.scheme}://127.0.0.1:${ep.port}`;
  const opts = pidOptions(CAPTURE_MS, otp);

  // 1) Best path first — full timeout (this is when red light should turn on)
  const primary = `${base}${ep.capturePath || "/rd/capture"}`;
  lastLog.push(`CAPTURE ${primary}`);
  let r = await captureOnce(primary, opts, CAPTURE_MS + 3000);
  if (r.ok) {
    saveCache(ep);
    return r.xml;
  }
  if (r.fatal) throw new Error(r.detail);
  lastLog.push(r.detail);

  // 2) Quick fallbacks only (short timeout — don't wait 20s each)
  const fallbacks = [`${base}/`, `${base}/rd/capture`, `${base}/capture`].filter(
    (u) => u !== primary,
  );
  for (const url of fallbacks) {
    lastLog.push(`quick CAPTURE ${url}`);
    r = await captureOnce(url, opts, QUICK_FAIL_MS);
    if (r.ok) {
      const path = url.slice(base.length) || "/";
      saveCache({ ...ep, capturePath: path });
      return r.xml;
    }
    if (r.fatal) throw new Error(r.detail);
    // If quick timeout but might be waiting for finger — retry once with full timeout
    if (r.detail.includes("Timeout") && url === `${base}/`) {
      lastLog.push(`full CAPTURE ${url}`);
      r = await captureOnce(url, opts, CAPTURE_MS + 3000);
      if (r.ok) {
        saveCache({ ...ep, capturePath: "/" });
        return r.xml;
      }
      if (r.fatal || r.detail) throw new Error(r.ok ? "" : r.detail);
    }
  }

  // 3) Alt PidOptions only if RD said invalid options
  const needAlt = lastLog.some((l) => /invalid|100/i.test(l));
  if (needAlt) {
    const alt = pidOptionsAlt(CAPTURE_MS, otp);
    r = await captureOnce(primary, alt, CAPTURE_MS + 3000);
    if (r.ok) return r.xml;
    if (r.detail) throw new Error(r.detail);
  }

  throw new Error(r.detail || "Scanner did not return fingerprint data");
}

export function getRdProbeLog(): string {
  return lastLog.length ? lastLog.join("\n") : "(no probe yet)";
}

export function getCachedRdEndpoint(): RdEndpoint | null {
  return sessionEp ?? loadCache();
}

/** Warm discovery while user fills the form — call on AePS page mount. */
export async function warmRdService(force = false): Promise<RdEndpoint | null> {
  if (typeof window === "undefined") return null;
  if (force) clearCache();
  return discoverRdEndpoint(force);
}

/** Display label: full device name only — never serial. */
export function formatRdDeviceLabel(ep: RdEndpoint): string {
  return ep.deviceName?.trim() || "Biometric device connected";
}

export async function captureFingerprintWeb(otp?: string): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Fingerprint capture only works in the browser");
  }

  const ep = await discoverRdEndpoint(false);
  if (!ep) {
    throw new Error(
      `Mantra RD not found (ports ${PORT_START}–${PORT_END}). Open Mantra L1 RDService on this PC.`,
    );
  }

  try {
    return await captureOn(ep, otp);
  } catch (first) {
    // One rescan if cache was stale
    clearCache();
    const ep2 = await discoverRdEndpoint(true);
    if (!ep2) throw first;
    return await captureOn(ep2, otp);
  }
}
