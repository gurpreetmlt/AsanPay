import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { otpRequestLimiter } from "../../middleware/rateLimiter";
import { validateBody } from "../../middleware/validate";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { kycSubmitSchema } from "../auth/auth.validators";
import {
  aadhaarOtpRequestSchema,
  aadhaarOtpVerifySchema,
  sendAadhaarKycOtp,
  verifyAadhaarKycOtp,
} from "./aadhaarOtp.service";
import { panVerifySchema, verifyPanKyc } from "./panVerify.service";
import { getMyKycDocument, getMyKycProfile, submitKyc } from "./kyc.service";
import { isKycDocSlot, saveKycDocumentDataUrl } from "./kycDocuments.service";
import { z } from "zod";

export const kycRouter = Router();

kycRouter.use(requireAuth);

kycRouter.get("/me", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const profile = await getMyKycProfile(req.auth.sub);
  sendSuccess(res, { profile });
});

kycRouter.post("/documents/upload", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = z
    .object({
      slot: z.string().trim(),
      dataUrl: z.string().min(32).max(2_000_000),
    })
    .parse(req.body);
  if (!isKycDocSlot(body.slot)) {
    throw new HttpError(422, "Invalid document slot", "INVALID_KYC_SLOT");
  }
  const saved = await saveKycDocumentDataUrl(req.auth.sub, body.slot, body.dataUrl);
  sendSuccess(res, { slot: body.slot, fileName: saved.fileName }, "Document uploaded");
});

kycRouter.get("/documents/:docKey", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const doc = await getMyKycDocument(req.auth.sub, String(req.params.docKey ?? ""));
  res.setHeader("Content-Type", doc.contentType);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(doc.buffer);
});

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

kycRouter.post(
  "/pan/verify",
  otpRequestLimiter,
  validateBody(panVerifySchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as { panNumber: string };
    const data = await verifyPanKyc(req.auth.sub, body.panNumber);
    sendSuccess(res, data, "PAN verified");
  },
);

kycRouter.post(
  "/aadhaar/otp/request",
  otpRequestLimiter,
  validateBody(aadhaarOtpRequestSchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as { aadhaarNumber: string };
    const data = await sendAadhaarKycOtp(req.auth.sub, body.aadhaarNumber);
    sendSuccess(res, data, data.message);
  },
);

kycRouter.post(
  "/aadhaar/otp/verify",
  validateBody(aadhaarOtpVerifySchema),
  async (req, res) => {
    if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    const body = req.body as { otp: string; requestId: string };
    const data = await verifyAadhaarKycOtp(req.auth.sub, body);
    sendSuccess(res, data, "Aadhaar verified");
  },
);

kycRouter.post("/submit", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = kycSubmitSchema.parse(req.body);
  const user = await submitKyc(req.auth.sub, input);
  sendSuccess(res, { user }, "KYC submitted successfully");
});
