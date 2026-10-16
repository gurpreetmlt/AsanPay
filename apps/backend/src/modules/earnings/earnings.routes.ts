import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import {
  getMyEarningsSummary,
  listMyEarnings,
  listMyEarningsByProduct,
} from "../commission/commission.service";

export const earningsRouter = Router();

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

const rangeSchema = z
  .object({
    from: ymd.optional(),
    to: ymd.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "From date must be on or before To date",
    path: ["from"],
  });

const listSchema = z
  .object({
    from: ymd.optional(),
    to: ymd.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "From date must be on or before To date",
    path: ["from"],
  });

const agentRoles = ["super_distributor", "distributor", "retailer"] as const;

earningsRouter.use(requireAuth, requireRole(...agentRoles));

earningsRouter.get("/summary", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const q = rangeSchema.parse(req.query);
  const data = await getMyEarningsSummary(req.auth.sub, req.auth.role, q.from, q.to);
  sendSuccess(res, data);
});

earningsRouter.get("/", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const q = listSchema.parse(req.query);
  const rows = await listMyEarnings(req.auth.sub, q);
  sendSuccess(res, { rows });
});

earningsRouter.get("/by-product", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const q = rangeSchema.parse(req.query);
  const products = await listMyEarningsByProduct(req.auth.sub, q.from, q.to);
  sendSuccess(res, { products });
});
