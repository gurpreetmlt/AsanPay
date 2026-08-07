import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import {
  listActiveDevices,
  requestDeviceOtp,
  registerDevice,
  deregisterDevice,
  deviceHistory,
  devicesNearingLicenseExpiry,
} from "./agentDevice.service";

export const agentDeviceRouter = Router();

agentDeviceRouter.use(requireAuth);

agentDeviceRouter.get("/", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  sendSuccess(res, await listActiveDevices(req.auth.sub));
});

agentDeviceRouter.get("/history", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  sendSuccess(res, await deviceHistory(req.auth.sub, limit));
});

/** Drives the in-app "your RD licence expires soon" notice — see agentDevice.service. */
agentDeviceRouter.get("/expiring", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const days = Math.min(Number(req.query.days) || 15, 90);
  sendSuccess(res, await devicesNearingLicenseExpiry(req.auth.sub, days));
});

agentDeviceRouter.post("/otp", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  sendSuccess(res, await requestDeviceOtp(req.auth.sub), "OTP sent to your registered mobile");
});

const registerBody = z.object({
  // Read from the RD Service INFO response by the client, not typed by the agent.
  serial: z.string().trim().min(4).max(80),
  vendor: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  rdLicenseExpiry: z.coerce.date().optional(),
  otp: z.string().regex(/^\d{6}$/),
});

agentDeviceRouter.post("/", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = registerBody.parse(req.body);
  const device = await registerDevice({
    userId: req.auth.sub,
    serial: body.serial,
    vendor: body.vendor,
    model: body.model,
    rdLicenseExpiry: body.rdLicenseExpiry ?? null,
    otp: body.otp,
    ip: req.ip ?? null,
  });
  sendSuccess(res, device, "Device registered", 201);
});

agentDeviceRouter.delete("/:id", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
  const result = await deregisterDevice({
    userId: req.auth.sub,
    deviceId: req.params.id,
    reason,
  });
  sendSuccess(res, result, "Device de-registered");
});
