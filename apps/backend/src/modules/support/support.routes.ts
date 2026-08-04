import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { createTicket, listMyTickets, listAllTickets, resolveTicket } from "./support.service";

export const supportRouter = Router();

const createSchema = z.object({
  subject: z.string().min(3).max(150),
  description: z.string().min(3).max(2000),
  transactionId: z.string().uuid().optional(),
});

supportRouter.post("/", requireAuth, async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = createSchema.parse(req.body);
  const ticket = await createTicket(req.auth.sub, body.subject, body.description, body.transactionId);
  sendSuccess(res, ticket, "Ticket raised");
});

supportRouter.get("/mine", requireAuth, async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  sendSuccess(res, await listMyTickets(req.auth.sub));
});

/** Platform care contacts (admin-managed) for agent Support page. */
supportRouter.get("/contacts", requireAuth, async (_req, res) => {
  const { getSupportContacts } = await import("../tenants/tenantSettings.service");
  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  sendSuccess(res, await getSupportContacts(tenantId));
});

supportRouter.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  const status = req.query.status as "open" | "resolved" | undefined;
  sendSuccess(res, await listAllTickets(status));
});

const resolveSchema = z.object({ resolutionNote: z.string().min(1).max(2000) });

supportRouter.patch("/:id/resolve", requireAuth, requireRole("admin"), async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = resolveSchema.parse(req.body);
  const ticket = await resolveTicket(req.auth.sub, req.auth.role, req.params.id as string, body.resolutionNote);
  sendSuccess(res, ticket, "Ticket resolved");
});
