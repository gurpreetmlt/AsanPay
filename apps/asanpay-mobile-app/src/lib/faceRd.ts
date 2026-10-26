import { Linking, NativeModules, Platform } from "react-native";

/**
 * UIDAI Aadhaar FaceRD capture (in.gov.uidai.rdservice.face.CAPTURE on in.gov.uidai.facerd).
 * Returns the PID XML; the provider receives it with bioType "2" (FID).
 */

const FACE_RD_PACKAGE = "in.gov.uidai.facerd";

interface FaceRdNative {
  isFaceRdAvailable(): Promise<boolean>;
  captureFace(pidOptions: string): Promise<string>;
}

const RdService = NativeModules.RdService as FaceRdNative | undefined;

export type BiometricCaptureType = "FINGER" | "FACE";

export type FaceCaptureOptions = {
  /** Provider eKYC wadh — the face (third) part of `kycWadhValue`. Omit for plain authentication. */
  wadh?: string;
  /** Customer OTP when the provider asks for one; it rides inside the PID block. */
  otp?: string;
};

/** `kycWadhValue` is `finger~iris~face`; returns the part for the capture type ("" = not allowed). */
export function kycWadhFor(kycWadhValue: string | null | undefined, captureType: BiometricCaptureType): string {
  const parts = (kycWadhValue ?? "").split("~");
  return (captureType === "FACE" ? parts[2] : parts[0])?.trim() ?? "";
}

function xmlAttr(value: string | undefined): string {
  return (value ?? "").trim().replace(/[<>"&]/g, "");
}

function buildFacePidOptions(opts: FaceCaptureOptions): string {
  const txnId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return (
    `<PidOptions ver="1.0" env="P">` +
    `<Opts fCount="" fType="" iCount="" iType="" pCount="" pType="" format="" pidVer="2.0" timeout="" ` +
    `otp="${xmlAttr(opts.otp)}" wadh="${xmlAttr(opts.wadh)}" posh=""/>` +
    `<CustOpts><Param name="txnId" value="${txnId}"/><Param name="purpose" value="auth"/>` +
    `<Param name="language" value="en"/></CustOpts>` +
    `</PidOptions>`
  );
}

export async function isFaceRdInstalled(): Promise<boolean> {
  if (Platform.OS !== "android" || !RdService?.isFaceRdAvailable) return false;
  try {
    return await RdService.isFaceRdAvailable();
  } catch {
    return false;
  }
}

export async function openFaceRdInstall(): Promise<void> {
  try {
    await Linking.openURL(`market://details?id=${FACE_RD_PACKAGE}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${FACE_RD_PACKAGE}`);
  }
}

export async function captureFace(opts: FaceCaptureOptions = {}): Promise<string> {
  if (Platform.OS !== "android") throw new Error("Face authentication is only supported on Android");
  if (!RdService?.captureFace) throw new Error("Face capture is not available in this app build. Update the app.");

  let pid: string;
  try {
    pid = await RdService.captureFace(buildFacePidOptions(opts));
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (code === "FACE_RD_NOT_FOUND") {
      throw new Error("Install the Aadhaar FaceRD app from Play Store to use face authentication.");
    }
    if (code === "CAPTURE_CANCELLED") throw new Error("Face capture cancelled. Tap Face again and look at the camera.");
    throw new Error(err instanceof Error && err.message ? err.message : "Face capture failed. Try again.");
  }

  // FaceRD reports liveness / quality failures inside the PID block, not as an intent error.
  const resp = /<Resp\b[^>]*>/i.exec(pid)?.[0] ?? "";
  const errCode = /errCode="([^"]*)"/i.exec(resp)?.[1] ?? "";
  if (errCode && errCode !== "0") {
    const errInfo = /errInfo="([^"]*)"/i.exec(resp)?.[1] ?? "";
    throw new Error(
      `Face capture failed${errInfo ? `: ${errInfo}` : ""}. Use good light, remove glasses or mask, and try again.`,
    );
  }
  return pid;
}
