import { brand } from "./brand";

const STORAGE_KEY = "asanpay-web-biometric";

// localStorage (not sessionStorage) so biometric login survives an app/process restart —
// see the matching note in lib/store.ts. Required for the mobile WebView, which the OS kills
// and restarts far more often than a desktop browser tab closes.
function getBiometricStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// No refresh token here on purpose — the real session lives entirely in the httpOnly cookies
// set by /api/proxy. This store is only a local "biometric unlock is set up" marker plus the
// WebAuthn credential to assert against; it carries nothing an attacker could replay as a session.
export type BiometricStore = {
  credentialId: string;
  userLabel: string;
};

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

export function isWebAuthnAvailable(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

export function getBiometricStore(): BiometricStore | null {
  try {
    const storage = getBiometricStorage();
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BiometricStore) : null;
  } catch {
    return null;
  }
}

export function clearBiometricStore(): void {
  const storage = getBiometricStorage();
  storage?.removeItem(STORAGE_KEY);
}

export function saveBiometricStore(data: BiometricStore): void {
  const storage = getBiometricStorage();
  storage?.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Register platform authenticator (Touch ID / Windows Hello) and bind refresh token. */
export async function enableBiometricLogin(opts: {
  userId: string;
  userName: string;
  userLabel: string;
}): Promise<void> {
  if (!isWebAuthnAvailable()) throw new Error("Biometric login not supported on this device/browser");

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = new TextEncoder().encode(opts.userId);

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: brand.name, id: window.location.hostname },
      user: {
        id: userId,
        name: opts.userName,
        displayName: opts.userLabel,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("Biometric setup cancelled");

  saveBiometricStore({
    credentialId: bufToB64(cred.rawId),
    userLabel: opts.userLabel,
  });
}

/** Prompt biometrics to gate access — the session itself comes from the httpOnly cookies. */
export async function authenticateBiometric(): Promise<BiometricStore> {
  const stored = getBiometricStore();
  if (!stored) throw new Error("Enable biometric login from Settings after PIN setup");
  if (!isWebAuthnAvailable()) throw new Error("Biometric login not supported");

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          type: "public-key",
          id: b64ToBuf(stored.credentialId),
        },
      ],
      userVerification: "required",
      timeout: 60000,
    },
  });

  if (!assertion) throw new Error("Biometric cancelled");
  return stored;
}
