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
  listMyEarningsByDownline,
  listMyEarningsProductTxns,
} from "../commission/commission.service";

export const earningsRouter = Router();

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

const rangeRefine = <T extends { from?: string; to?: string }>(q: T) =>
  !q.from || !q.to || q.from <= q.to;

const rangeSchema = z
  .object({
    from: ymd.optional(),
    to: ymd.optional(),
  })
  .refine(rangeRefine, { message: "From date must be on or before To date", path: ["from"] });

const listSchema = z
  .object({
    from: ymd.optional(),
    to: ymd.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(rangeRefine, { message: "From date must be on or before To date", path: ["from"] });

const downlineSchema = z
  .object({
    from: ymd.optional(),
    to: ymd.optional(),
    q: z.string().trim().max(80).optional(),
  })
  .refine(rangeRefine, { message: "From date must be on or before To date", path: ["from"] });

const productSchema = z
  .object({
    from: ymd.optional(),
    to: ymd.optional(),
    downlineUserId: z.string().uuid().optional(),
  })
  .refine(rangeRefine, { message: "From date must be on or before To date", path: ["from"] });

const productTxnsSchema = z
  .object({
    from: ymd.optional(),
    to: ymd.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    serviceId: z.string().uuid("Enter a valid service id"),
    downlineUserId: z.string().uuid().optional(),
  })
  .refine(rangeRefine, { message: "From date must be on or before To date", path: ["from"] });

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
  const q = productSchema.parse(req.query);
  const products = await listMyEarningsByProduct(req.auth.sub, q.from, q.to, {
    downlineUserId: q.downlineUserId,
    role: req.auth.role,
  });
  sendSuccess(res, { products });
});

earningsRouter.get("/by-downline", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const q = downlineSchema.parse(req.query);
  const rows = await listMyEarningsByDownline(req.auth.sub, req.auth.role, q.from, q.to, q.q);
  sendSuccess(res, { rows });
});

earningsRouter.get("/product-txns", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const q = productTxnsSchema.parse(req.query);
  const rows = await listMyEarningsProductTxns(req.auth.sub, q.serviceId, {
    from: q.from,
    to: q.to,
    limit: q.limit,
    offset: q.offset,
    downlineUserId: q.downlineUserId,
    role: req.auth.role,
  });
  sendSuccess(res, { rows });
});
