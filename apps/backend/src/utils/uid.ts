import { randomBytes, createHash } from "node:crypto";
import type { UserRole } from "@asanpay/shared-types";

const ROLE_PREFIX: Record<UserRole, string> = {
  admin: "AD",
  super_distributor: "MD",
  distributor: "DS",
  retailer: "RT",
};

// Business-facing user code, e.g. RT7K2F9QAB — not a secret, just a friendly public identifier.
export function generateUid(role: UserRole): string {
  const random = randomBytes(6).toString("hex").toUpperCase();
  return `${ROLE_PREFIX[role]}${random}`;
}

export function generateTxnRef(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = randomBytes(4).toString("hex").toUpperCase();
  return `LKP${date}${random}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
