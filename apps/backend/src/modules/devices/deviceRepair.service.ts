/**
 * Repair / RMA tickets for agent hardware — task #16.
 *
 * Deliberately kept separate from agentDevice.service.ts: registering and de-registering a
 * scanner is self-service and near-instant, but a repair ticket is a multi-day, admin-mediated
 * process with its own state machine. Mixing the two would make "serial changed because it
 * broke" indistinguishable from "serial changed because it moved to someone else" — exactly the
 * ambiguity task #15's change-frequency signal needs to avoid.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { deviceRepairRequests, agentDevices } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { deregisterDevice } from "./agentDevice.service";

export type DeviceRepairStatus = (typeof deviceRepairRequests.$inferSelect)["status"];

export async function createRepairRequest(params: {
  userId: string;
  agentDeviceId?: string;
  deviceType: string;
  serial: string;
  vendor?: string;
  model?: string;
  issueType: string;
  invoiceDate?: string;
  invoiceNumber?: string;
  remarks: string;
  photoUrls?: string[];
}) {
  if (params.agentDeviceId) {
    const [owned] = await db
      .select({ id: agentDevices.id })
      .from(agentDevices)
      .where(and(eq(agentDevices.id, params.agentDeviceId), eq(agentDevices.userId, params.userId)))
      .limit(1);
    if (!owned) {
      throw new HttpError(404, "Device not found on your account", "DEVICE_NOT_FOUND");
    }
  }

  const [row] = await db
    .insert(deviceRepairRequests)
    .values({
      userId: params.userId,
      agentDeviceId: params.agentDeviceId ?? null,
      deviceType: params.deviceType,
      serial: params.serial.trim().toUpperCase(),
      vendor: params.vendor ?? null,
      model: params.model ?? null,
      issueType: params.issueType,
      invoiceDate: params.invoiceDate ?? null,
      invoiceNumber: params.invoiceNumber ?? null,
      remarks: params.remarks,
      photoUrls: params.photoUrls ?? [],
    })
    .returning();

  if (!row) throw new HttpError(500, "Could not create repair request", "REPAIR_REQUEST_FAILED");

  await insertAuditLog({
    userId: params.userId,
    action: "device.repair_request",
    entityType: "device_repair_request",
    entityId: row.id,
    metadata: { serial: row.serial, issueType: params.issueType },
  });

  return row;
}

export async function listMyRepairRequests(userId: string, status?: DeviceRepairStatus) {
  const conditions = [eq(deviceRepairRequests.userId, userId)];
  if (status) conditions.push(eq(deviceRepairRequests.status, status));
  return db
    .select()
    .from(deviceRepairRequests)
    .where(and(...conditions))
    .orderBy(desc(deviceRepairRequests.submittedAt));
}

export async function listRepairQueue(status?: DeviceRepairStatus, limit = 100) {
  const conditions = status ? [eq(deviceRepairRequests.status, status)] : [];
  return db
    .select()
    .from(deviceRepairRequests)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(deviceRepairRequests.submittedAt))
    .limit(limit);
}

async function loadRequest(id: string) {
  const [row] = await db.select().from(deviceRepairRequests).where(eq(deviceRepairRequests.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Repair request not found", "REPAIR_REQUEST_NOT_FOUND");
  return row;
}

export async function issueRma(adminId: string, id: string, rmaNumber: string) {
  const req = await loadRequest(id);
  if (req.status !== "submitted") {
    throw new HttpError(422, `Cannot issue RMA on a ${req.status} request`, "INVALID_STATUS");
  }
  const [row] = await db
    .update(deviceRepairRequests)
    .set({ status: "rma_issued", rmaNumber: rmaNumber.trim(), reviewedBy: adminId })
    .where(eq(deviceRepairRequests.id, id))
    .returning();

  await insertAuditLog({
    userId: adminId,
    action: "device.repair_rma_issued",
    entityType: "device_repair_request",
    entityId: id,
    metadata: { rmaNumber: rmaNumber.trim() },
  });

  return row;
}

export async function markInRepair(adminId: string, id: string) {
  const req = await loadRequest(id);
  if (req.status !== "rma_issued") {
    throw new HttpError(422, `Cannot start repair on a ${req.status} request`, "INVALID_STATUS");
  }
  const [row] = await db
    .update(deviceRepairRequests)
    .set({ status: "in_repair", reviewedBy: adminId })
    .where(eq(deviceRepairRequests.id, id))
    .returning();
  return row;
}

/**
 * Close the ticket. When `replaced` is true and the original device was registered, the old
 * serial is de-registered with a reason tagged to this RMA — so agentDevices history reads
 * "replaced via repair", not "device swapped for no stated reason", which is what task #15's
 * change-frequency signal would otherwise see.
 *
 * Registering the replacement serial is NOT done here — that stays the agent's own self-service
 * OTP flow (agentDevice.service.registerDevice), same as any other new device.
 */
export async function resolveRepairRequest(params: {
  adminId: string;
  id: string;
  outcome: "resolved" | "rejected";
  resolutionNote: string;
  replaced?: boolean;
}) {
  const req = await loadRequest(params.id);
  if (req.status === "resolved" || req.status === "rejected") {
    throw new HttpError(422, `Request is already ${req.status}`, "ALREADY_CLOSED");
  }

  if (params.replaced && req.agentDeviceId) {
    await deregisterDevice({
      userId: req.userId,
      deviceId: req.agentDeviceId,
      reason: `Replaced via repair request ${req.id}`,
      actorId: params.adminId,
    });
  }

  const [row] = await db
    .update(deviceRepairRequests)
    .set({
      status: params.outcome,
      resolutionNote: params.resolutionNote,
      reviewedBy: params.adminId,
      resolvedAt: new Date(),
    })
    .where(eq(deviceRepairRequests.id, params.id))
    .returning();

  await insertAuditLog({
    userId: params.adminId,
    action: "device.repair_resolved",
    entityType: "device_repair_request",
    entityId: params.id,
    metadata: { outcome: params.outcome, replaced: Boolean(params.replaced) },
  });

  return row;
}
