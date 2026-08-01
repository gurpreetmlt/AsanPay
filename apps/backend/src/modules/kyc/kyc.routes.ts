import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { kycSubmitSchema } from "../auth/auth.validators";
import { submitKyc } from "./kyc.service";

export const kycRouter = Router();

kycRouter.use(requireAuth);

kycRouter.get("/ifsc/:code", async (req, res) => {
  const ifsc = String(req.params.code ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (ifsc.length !== 11) {
    throw new HttpError(400, "IFSC must be 11 characters", "INVALID_IFSC");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`https://ifsc.razorpay.com/${ifsc}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new HttpError(502, "IFSC lookup unavailable", "IFSC_UPSTREAM");
  }

  if (upstream.status === 404) {
    throw new HttpError(404, "IFSC not found", "IFSC_NOT_FOUND");
  }
  if (!upstream.ok) {
    throw new HttpError(502, "IFSC lookup failed", "IFSC_UPSTREAM");
  }

  const data = (await upstream.json()) as {
    BANK?: string;
    BRANCH?: string;
    CITY?: string;
    STATE?: string;
    ADDRESS?: string;
  };
  if (!data.BANK) {
    throw new HttpError(404, "IFSC not found", "IFSC_NOT_FOUND");
  }

  sendSuccess(res, {
    bank: (data.BANK || "").trim(),
    branch: (data.BRANCH || "").trim(),
    city: (data.CITY || "").trim(),
    state: (data.STATE || "").trim(),
    address: (data.ADDRESS || "").trim(),
  });
});

kycRouter.post("/submit", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = kycSubmitSchema.parse(req.body);
  const user = await submitKyc(req.auth.sub, input);
  sendSuccess(res, { user }, "KYC submitted successfully");
});
