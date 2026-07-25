import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import type { JwtAccessPayload, JwtRefreshPayload, UserRole } from "@asanpay/shared-types";

const HS256 = { algorithms: ["HS256"] as jwt.Algorithm[] };

export function signAccessToken(payload: { id: string; uid: string; role: UserRole }): string {
  const claims: JwtAccessPayload = { sub: payload.id, uid: payload.uid, role: payload.role, type: "access" };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, HS256) as JwtAccessPayload;
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = randomUUID();
  const claims: JwtRefreshPayload = { sub: userId, type: "refresh", jti };
  const token = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  });
  return { token, jti };
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, HS256) as JwtRefreshPayload;
}

/** Short-lived proof that txn PIN was verified — clients send this instead of re-sending the PIN. */
export function signTxnAuth(userId: string): string {
  return jwt.sign({ sub: userId, type: "txn_auth" }, env.JWT_ACCESS_SECRET, {
    expiresIn: "2m",
    algorithm: "HS256",
  });
}

export function verifyTxnAuth(token: string): { sub: string } {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, HS256) as { sub?: string; type?: string };
  if (payload.type !== "txn_auth" || !payload.sub) {
    throw new Error("invalid txn auth");
  }
  return { sub: payload.sub };
}
