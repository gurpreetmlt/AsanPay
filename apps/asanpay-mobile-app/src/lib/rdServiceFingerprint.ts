import { NativeModules, Platform } from "react-native";

/**
 * Android L1 RD capture via UIDAI Intent API (in.gov.uidai.rdservice.fp.CAPTURE).
 * Package name is discovered at runtime — Mantra Play Store package ≠ hardcoded id.
 */

const CAPTURE_TIMEOUT_MS = 20000;
const DEFAULT_RD_PACKAGE = "com.mantra.mfs110.rdservice";

interface RdServiceNative {
  isPackageAvailable(rdPackage: string): Promise<boolean>;
  listRdPackages(): Promise<string[]>;
  captureFingerprint(rdPackage: string, pidOptions: string): Promise<string>;
}

const RdService = NativeModules.RdService as RdServiceNative | undefined;

let lastProbeLog: string[] = [];

// L1 RD services (Morpho/IDEMIA, Mantra MFS110) need fType="2" and reject extra blocks
// like <Demo> — strict parsers fail silently and capture never starts (no sensor light).
// otp: Transaction OTP for ₹5,000+ AEPS withdrawals — RD embeds it in the PID block.
function buildPidOptionsXml(timeoutMs: number, otp?: string): string {
  const otpAttr = otp ? ` otp="${otp}"` : "";
  return `<PidOptions ver="1.0"><Opts fCount="1" fType="2" iCount="0" iType="0" pCount="0" pType="0" format="0" pidVer="2.0" timeout="${timeoutMs}"${otpAttr} posh="UNKNOWN" env="P"/></PidOptions>`;
}

export function getRdServiceProbeLog(): string {
  return lastProbeLog.length ? lastProbeLog.join("\n") : "(no probe attempted yet)";
}

export async function clearRdServiceCache(): Promise<void> {
  /* no-op — kept for API compatibility */
}

export async function isRdServiceAvailable(rdPackage = DEFAULT_RD_PACKAGE): Promise<boolean> {
  if (Platform.OS !== "android" || !RdService) return false;
  try {
    return await RdService.isPackageAvailable(rdPackage);
  } catch {
    return false;
  }
}

export async function listInstalledRdPackages(): Promise<string[]> {
  if (Platform.OS !== "android" || !RdService) return [];
  try {
    return await RdService.listRdPackages();
  } catch {
    return [];
  }
}

export async function captureFingerprint(rdPackage = DEFAULT_RD_PACKAGE, otp?: string): Promise<string> {
  if (Platform.OS !== "android") {
    throw new Error("Biometric capture is only supported on Android");
  }
  if (!RdService) {
    throw new Error("RD Service native module missing. Rebuild the Android app.");
  }

  lastProbeLog = [];

  let installed: string[] = [];
  try {
    installed = await RdService.listRdPackages();
    lastProbeLog.push(
      installed.length
        ? `RD packages found: ${installed.join(", ")}`
        : "No RD packages via CAPTURE intent",
    );
  } catch (err) {
    lastProbeLog.push(`listRdPackages failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (installed.length === 0) {
    throw new Error(
      "No UIDAI fingerprint RD Service detected.\n" +
        "Mantra app install hone ke baad bhi ye aaye to RD app UIDAI CAPTURE intent expose nahi kar rahi.\n" +
        "Mac Terminal: adb shell pm list packages | grep -i mantra",
    );
  }

  const pidOptions = buildPidOptionsXml(CAPTURE_TIMEOUT_MS, otp);
  lastProbeLog.push(`Capture intent preferred=${rdPackage}`);

  try {
    const pidData = await RdService.captureFingerprint(rdPackage, pidOptions);
    lastProbeLog.push("Capture OK via UIDAI intent");
    return pidData;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    lastProbeLog.push(`Capture failed: ${code || msg}`);

    if (code === "RD_NOT_FOUND") {
      throw new Error(
        "No RD Service for fingerprint capture.\n" +
          `Installed packages checked: ${installed.join(", ") || "(none)"}`,
      );
    }
    if (code === "DEVICE_NOT_CONNECTED") {
      throw new Error("Scanner not connected. Open Mantra L1 RDService and confirm Device connected.");
    }
    if (code === "DEVICE_NOT_READY") {
      throw new Error("Scanner not ready. Open Mantra L1 RDService and wait until ready.");
    }
    if (code === "CAPTURE_CANCELLED") {
      throw new Error("Fingerprint capture cancelled. Place finger on scanner and try again.");
    }
    throw new Error(msg || "Fingerprint capture failed");
  }
}
