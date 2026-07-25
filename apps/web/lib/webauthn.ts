import { brand } from "./brand";

const STORAGE_KEY = "asanpay-web-biometric";

function getBrowserSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export type BiometricStore = {
  credentialId: string;
  refreshToken: string;
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
    const storage = getBrowserSessionStorage();
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BiometricStore) : null;
  } catch {
    return null;
  }
}

export function clearBiometricStore(): void {
  const storage = getBrowserSessionStorage();
  storage?.removeItem(STORAGE_KEY);
}

export function saveBiometricStore(data: BiometricStore): void {
  const storage = getBrowserSessionStorage();
  storage?.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Register platform authenticator (Touch ID / Windows Hello) and bind refresh token. */
export async function enableBiometricLogin(opts: {
  userId: string;
  userName: string;
  userLabel: string;
  refreshToken: string;
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
    refreshToken: opts.refreshToken,
    userLabel: opts.userLabel,
  });
}

/** Prompt biometrics then return stored refresh token for /auth/refresh. */
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
