import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { resolveTenantId } from "../fund-requests/tenant";
import { raiseDispute, listMyDisputes, type DisputeStatus } from "./dispute.service";

export const disputeRouter = Router();

disputeRouter.use(requireAuth);

const STATUSES = ["raised", "under_review", "resolved", "rejected"] as const;
const CATEGORIES = [
  "customer_debited_no_service",
  "chargeback",
  "duplicate_charge",
  "wrong_amount",
  "other",
] as const;

const raiseBody = z.object({
  transactionId: z.string().uuid(),
  category: z.enum(CATEGORIES),
  description: z.string().trim().min(10).max(1000),
  evidenceUrls: z.array(z.string().url()).max(6).optional(),
});

disputeRouter.post("/", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = raiseBody.parse(req.body);
  const tenantId = await resolveTenantId();
  const row = await raiseDispute({ tenantId, raisedBy: req.auth.sub, ...body });
  sendSuccess(res, row, "Dispute raised", 201);
});

disputeRouter.get("/", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const status =
    typeof req.query.status === "string" && (STATUSES as readonly string[]).includes(req.query.status)
      ? (req.query.status as DisputeStatus)
      : undefined;
  sendSuccess(res, await listMyDisputes(req.auth.sub, status));
});
