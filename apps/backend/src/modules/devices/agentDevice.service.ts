/**
 * Registration and de-registration of the agent's UIDAI L1 biometric scanner.
 *
 * Self-service on purpose. A retailer whose scanner dies on a Sunday should be able to swap in
 * a new one and keep trading, not wait for their distributor to approve a ticket. The controls
 * are a concurrent cap, an OTP to the registered mobile, and a database constraint that stops
 * one physical device serving several agent IDs — see agentDevices.
 *
 * Rate of change is the signal, not the change itself. Every registration and de-registration
 * is kept, so how often an agent swaps can be read off the history later (task #15) without
 * this module having to judge it.
 */
import { randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { agentDevices, users } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { hashToken } from "../../utils/uid";
import { env, shouldExposeOtpInResponse, getTestOtpOverride } from "../../config/env";
import {
  MAX_OTP_ATTEMPTS,
  findLatestActiveOtp,
  incrementOtpAttempts,
  insertOtpRequest,
  markOtpConsumed,
} from "../../db/postgres/repositories/otpRequest";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";

const DEVICE_OTP_TTL_MS = 10 * 60 * 1000;

/** RD Service serials are printed in mixed case and often read back with spaces. */
function normaliseSerial(raw: string): string {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  if (s.length < 4) throw new HttpError(422, "Device serial is too short", "INVALID_SERIAL");
  return s;
}

function otpHashesEqual(storedHash: string, candidateOtp: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(candidateOtp), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface AgentDeviceRow {
  id: string;
  serial: string;
  vendor: string | null;
  model: string | null;
  rdLicenseExpiry: Date | null;
  registeredAt: Date;
}

export async function listActiveDevices(userId: string): Promise<AgentDeviceRow[]> {
  return db
    .select({
      id: agentDevices.id,
      serial: agentDevices.serial,
      vendor: agentDevices.vendor,
      model: agentDevices.model,
      rdLicenseExpiry: agentDevices.rdLicenseExpiry,
      registeredAt: agentDevices.registeredAt,
    })
    .from(agentDevices)
    .where(and(eq(agentDevices.userId, userId), isNull(agentDevices.deregisteredAt)))
    .orderBy(desc(agentDevices.registeredAt));
}

export async function requestDeviceOtp(userId: string): Promise<{
  expiresInSec: number;
  otp?: string;
}> {
  const [user] = await db
    .select({ mobile: users.mobile, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.isActive) {
    throw new HttpError(422, "Your account is inactive", "ACCOUNT_INACTIVE");
  }

  const override = getTestOtpOverride(user.mobile);
  const otp = override ?? String(randomInt(100000, 999999));
  await insertOtpRequest({
    mobile: user.mobile,
    otpHash: hashToken(otp),
    purpose: "device_register",
    expiresAt: new Date(Date.now() + DEVICE_OTP_TTL_MS),
    meta: { userId },
  });

  return {
    expiresInSec: Math.floor(DEVICE_OTP_TTL_MS / 1000),
    ...(shouldExposeOtpInResponse() || override ? { otp } : {}),
  };
}

async function consumeDeviceOtp(userId: string, otp: string): Promise<void> {
  const [user] = await db
    .select({ mobile: users.mobile })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  const active = await findLatestActiveOtp({ mobile: user.mobile, purpose: "device_register" });
  if (!active) {
    throw new HttpError(422, "OTP has expired or was not requested", "OTP_EXPIRED");
  }
  if (active.attempts >= MAX_OTP_ATTEMPTS) {
    throw new HttpError(422, "Too many incorrect OTP attempts. Request a new OTP.", "OTP_LOCKED");
  }
  if (!otpHashesEqual(active.otpHash, otp)) {
    await incrementOtpAttempts(active.id);
    throw new HttpError(422, "Incorrect OTP", "OTP_INVALID");
  }
  await markOtpConsumed(active.id);
}

export async function registerDevice(params: {
  userId: string;
  serial: string;
  vendor?: string;
  model?: string;
  rdLicenseExpiry?: Date | null;
  otp: string;
  ip?: string | null;
}): Promise<AgentDeviceRow> {
  const serial = normaliseSerial(params.serial);
  await consumeDeviceOtp(params.userId, params.otp);

  const active = await listActiveDevices(params.userId);
  if (active.some((d) => d.serial === serial)) {
    throw new HttpError(422, "This device is already registered to you", "DEVICE_ALREADY_YOURS");
  }
  if (active.length >= env.MAX_AGENT_DEVICES) {
    throw new HttpError(
      422,
      `You can keep ${env.MAX_AGENT_DEVICES} devices registered. De-register one first.`,
      "DEVICE_LIMIT_REACHED",
    );
  }

  let row;
  try {
    [row] = await db
      .insert(agentDevices)
      .values({
        userId: params.userId,
        serial,
        vendor: params.vendor ?? null,
        model: params.model ?? null,
        rdLicenseExpiry: params.rdLicenseExpiry ?? null,
        registeredIp: params.ip ?? null,
      })
      .returning({
        id: agentDevices.id,
        serial: agentDevices.serial,
        vendor: agentDevices.vendor,
        model: agentDevices.model,
        rdLicenseExpiry: agentDevices.rdLicenseExpiry,
        registeredAt: agentDevices.registeredAt,
      });
  } catch (err) {
    // The partial unique index fired: this serial is active under a different agent. That is the
    // device-sharing signal, so it is refused here and recorded for review rather than being
    // reported by a sweep hours later.
    if ((err as { code?: string }).code === "23505") {
      await insertAuditLog({
        userId: params.userId,
        action: "device.register_conflict",
        entityType: "agent_device",
        entityId: serial,
        ipAddress: params.ip ?? null,
        metadata: { serial, reason: "serial already active under another agent" },
      });
      throw new HttpError(
        422,
        "This device is already registered to another agent. Ask them to de-register it first.",
        "DEVICE_IN_USE",
      );
    }
    throw err;
  }

  if (!row) throw new HttpError(500, "Could not register device", "DEVICE_REGISTER_FAILED");

  await insertAuditLog({
    userId: params.userId,
    action: "device.register",
    entityType: "agent_device",
    entityId: row.id,
    ipAddress: params.ip ?? null,
    metadata: {
      serial,
      vendor: params.vendor ?? null,
      model: params.model ?? null,
      rdLicenseExpiry: params.rdLicenseExpiry?.toISOString() ?? null,
    },
  });

  return row;
}

export async function deregisterDevice(params: {
  userId: string;
  deviceId: string;
  reason?: string;
  actorId?: string;
}): Promise<{ id: string; serial: string }> {
  const [row] = await db
    .update(agentDevices)
    .set({
      deregisteredAt: new Date(),
      deregisteredBy: params.actorId ?? params.userId,
      deregisterReason: params.reason?.slice(0, 200) ?? null,
    })
    .where(
      and(
        eq(agentDevices.id, params.deviceId),
        eq(agentDevices.userId, params.userId),
        isNull(agentDevices.deregisteredAt),
      ),
    )
    .returning({ id: agentDevices.id, serial: agentDevices.serial });

  if (!row) throw new HttpError(404, "Device not found or already de-registered", "DEVICE_NOT_FOUND");

  await insertAuditLog({
    userId: params.actorId ?? params.userId,
    action: "device.deregister",
    entityType: "agent_device",
    entityId: row.id,
    metadata: { serial: row.serial, reason: params.reason ?? null },
  });

  return row;
}

/** Registrations and de-registrations, newest first — the raw material for change-rate rules. */
export async function deviceHistory(userId: string, limit = 50) {
  return db
    .select({
      id: agentDevices.id,
      serial: agentDevices.serial,
      vendor: agentDevices.vendor,
      registeredAt: agentDevices.registeredAt,
      deregisteredAt: agentDevices.deregisteredAt,
      deregisterReason: agentDevices.deregisterReason,
    })
    .from(agentDevices)
    .where(eq(agentDevices.userId, userId))
    .orderBy(desc(agentDevices.registeredAt))
    .limit(limit);
}

/** Active devices whose RD licence has expired or expires within `days`. */
export async function devicesNearingLicenseExpiry(userId: string, days = 15) {
  return db
    .select({
      id: agentDevices.id,
      serial: agentDevices.serial,
      rdLicenseExpiry: agentDevices.rdLicenseExpiry,
    })
    .from(agentDevices)
    .where(
      and(
        eq(agentDevices.userId, userId),
        isNull(agentDevices.deregisteredAt),
        sql`${agentDevices.rdLicenseExpiry} IS NOT NULL`,
        sql`${agentDevices.rdLicenseExpiry} < NOW() + (${days} || ' days')::interval`,
      ),
    );
}
