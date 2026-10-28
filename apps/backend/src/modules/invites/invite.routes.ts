import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { signupMobileCheckLimiter } from "../../middleware/rateLimiter";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import {
  createInvite,
  createInviteSchema,
  listInvites,
  lookupInvite,
  resendInvite,
  revokeInvite,
} from "./invite.service";

export const inviteRouter = Router();

inviteRouter.get("/lookup/:token", signupMobileCheckLimiter, async (req, res) => {
  sendSuccess(res, await lookupInvite(String(req.params.token)));
});

const uplineOnly = [requireAuth, requireRole("admin", "super_distributor", "distributor")];

function inviterId(req: { auth?: { sub: string } }): string {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  return req.auth.sub;
}

inviteRouter.get("/", ...uplineOnly, async (req, res) => {
  sendSuccess(res, await listInvites(inviterId(req)));
});

inviteRouter.post("/", ...uplineOnly, async (req, res) => {
  const input = createInviteSchema.parse(req.body);
  const result = await createInvite(inviterId(req), input);
  sendSuccess(
    res,
    result,
    result.emailSent ? `Invite emailed to ${input.email}` : "Invite created — email could not be sent, share the link instead",
  );
});

inviteRouter.post("/:id/resend", ...uplineOnly, async (req, res) => {
  const result = await resendInvite(inviterId(req), String(req.params.id));
  sendSuccess(
    res,
    result,
    result.emailSent ? "New invite link emailed" : "New link created — email could not be sent, share the link instead",
  );
});

inviteRouter.delete("/:id", ...uplineOnly, async (req, res) => {
  sendSuccess(res, await revokeInvite(inviterId(req), String(req.params.id)), "Invite cancelled");
});
