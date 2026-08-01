import { Router } from "express";
import { z } from "zod";
import { getDownline, getNetwork, setDirectChildActive } from "./users.service";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";

export const usersRouter = Router();

usersRouter.get("/downline", requireAuth, async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const downline = await getDownline(req.auth.sub);
  sendSuccess(res, downline);
});

usersRouter.get("/network", requireAuth, async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const network = await getNetwork(req.auth.sub, req.auth.role);
  sendSuccess(res, network);
});

usersRouter.patch(
  "/:id/active",
  requireAuth,
  requireRole("master_distributor", "distributor"),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = z.object({ isActive: z.boolean() }).parse(req.body);
    const result = await setDirectChildActive(
      req.auth.sub,
      req.auth.role,
      req.params.id as string,
      body.isActive,
    );
    sendSuccess(res, result, body.isActive ? "User activated" : "User deactivated");
  },
);
