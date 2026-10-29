import { Router } from "express";
import { sendSuccess } from "../../utils/apiResponse";
import { getNobleSessionInfo } from "../providers/noble/client";

/** Mounted inside adminRouter, which already enforces admin auth. */
export const adminProviderSessionRouter = Router();

/** Shared provider login session: expiry, who logged in, and logins used today (no token). */
adminProviderSessionRouter.get("/providers/noble/session", async (_req, res) => {
  sendSuccess(res, await getNobleSessionInfo());
});
