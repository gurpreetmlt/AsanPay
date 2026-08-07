import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import {
  createRepairRequest,
  listMyRepairRequests,
  type DeviceRepairStatus,
} from "./deviceRepair.service";

export const deviceRepairRouter = Router();

deviceRepairRouter.use(requireAuth);

const STATUSES = ["submitted", "rma_issued", "in_repair", "resolved", "rejected"] as const;

const createBody = z.object({
  agentDeviceId: z.string().uuid().optional(),
  deviceType: z.string().trim().max(40).default("biometric_machine"),
  serial: z.string().trim().min(4).max(80),
  vendor: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  issueType: z.string().trim().min(1).max(60),
  invoiceDate: z.string().trim().max(20).optional(),
  invoiceNumber: z.string().trim().max(80).optional(),
  remarks: z.string().trim().min(1).max(1000),
  photoUrls: z.array(z.string().url()).max(6).optional(),
});

deviceRepairRouter.post("/", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = createBody.parse(req.body);
  const row = await createRepairRequest({ userId: req.auth.sub, ...body });
  sendSuccess(res, row, "Repair request submitted", 201);
});

deviceRepairRouter.get("/", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const status =
    typeof req.query.status === "string" && (STATUSES as readonly string[]).includes(req.query.status)
      ? (req.query.status as DeviceRepairStatus)
      : undefined;
  sendSuccess(res, await listMyRepairRequests(req.auth.sub, status));
});
