import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { deletePushToken, upsertPushToken } from "./push.service";

export const pushRouter = Router();

pushRouter.use(requireAuth);

const deviceIdField = z
  .string({ error: "Device id is required" })
  .trim()
  .min(4, "Device id must be at least 4 characters")
  .max(80, "Device id must be at most 80 characters");

const tokenBody = z.object({
  deviceId: deviceIdField,
  token: z
    .string({ error: "Push token is required" })
    .trim()
    .min(20, "Push token looks too short — reopen the app to get a new one")
    .max(4096, "Push token is too long"),
  platform: z.enum(["android", "ios"], { error: "Platform must be android or ios" }),
});

pushRouter.post("/token", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = tokenBody.parse(req.body);
  await upsertPushToken({ userId: req.auth.sub, ...body });
  sendSuccess(res, { registered: true }, "Push token saved");
});

pushRouter.delete("/token", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { deviceId } = z.object({ deviceId: deviceIdField }).parse(req.body ?? {});
  await deletePushToken(req.auth.sub, deviceId);
  sendSuccess(res, { removed: true }, "Push token removed");
});
