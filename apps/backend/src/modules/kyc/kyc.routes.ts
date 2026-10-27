import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { kycDocCheckLimiter, otpRequestLimiter } from "../../middleware/rateLimiter";
import { validateBody } from "../../middleware/validate";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { homeLocationSchema, kycSubmitSchema } from "../auth/auth.validators";
import {
  aadhaarOtpRequestSchema,
  aadhaarOtpVerifySchema,
  sendAadhaarKycOtp,
  verifyAadhaarKycOtp,
} from "./aadhaarOtp.service";
import { panVerifySchema, verifyPanKyc } from "./panVerify.service";
import { autoCropKycPhoto, getMyKycDocument, getMyKycProfile, saveHomeLocation, submitKyc } from "./kyc.service";
import { isKycDocSlot, saveKycDocumentDataUrl } from "./kycDocuments.service";
import { checkKycDocument, DOC_CHECK_SLOTS, toStoredDocCheck } from "./docCheck/docCheck.service";
import { recordKycVerification } from "./kycVerification.service";
import { z } from "zod";

export const kycRouter = Router();

kycRouter.use(requireAuth);

kycRouter.get("/me", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const profile = await getMyKycProfile(req.auth.sub);
  sendSuccess(res, { profile });
});

kycRouter.post("/home-location", validateBody(homeLocationSchema), async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const data = await saveHomeLocation(req.auth.sub, req.body);
  sendSuccess(res, data, "Home location saved");
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

const docCheckSchema = z.object({
  slot: z.enum(DOC_CHECK_SLOTS, {
    message: "Document must be one of: PAN card, Aadhaar front, Aadhaar back",
  }),
  dataUrl: z.string().min(32, "Choose a photo to check").max(2_100_000, "Image must be under 1.5 MB"),
  /** What the agent entered — compared with what is printed on the card. */
  dob: z.string().trim().max(20).optional(),
  gender: z.string().trim().max(20).optional(),
  /** PAN typed in the form; "" = not typed yet. Omitted by older apps. */
  pan: z
    .string()
    .trim()
    .regex(/^([A-Za-z]{5}\d{4}[A-Za-z])?$/, "PAN must be 10 characters like ABCDE1234F")
    .optional(),
  /** Last 4 digits only — the full Aadhaar number never travels with a photo check. "" = not typed yet. */
  aadhaarLast4: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "Aadhaar last 4 must be 4 digits")
    .optional(),
  /** Newly picked photo: crop + straighten the card first, check the crop, return it as `croppedDataUrl`. */
  autoCrop: z.boolean().optional(),
});

/** Auto-crop gets this long inside a check call; slower → the photo is checked as picked. */
const CHECK_AUTO_CROP_MS = 10_000;

kycRouter.post("/documents/check", kycDocCheckLimiter, validateBody(docCheckSchema), async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = req.body as z.infer<typeof docCheckSchema>;
  const cropStarted = Date.now();
  const crop = body.autoCrop ? await autoCropKycPhoto(body.dataUrl, CHECK_AUTO_CROP_MS) : null;
  const cropMs = crop ? Date.now() - cropStarted : undefined;
  const croppedDataUrl = crop?.detected ? crop.dataUrl : null;
  const result = await checkKycDocument(
    req.auth.sub,
    body.slot,
    croppedDataUrl ?? body.dataUrl,
    {
      dob: body.dob,
      gender: body.gender,
      aadhaarLast4: body.aadhaarLast4,
      pan: body.pan,
    },
    { cropMs },
  );
  await recordKycVerification(
    req.auth.sub,
    { slots: { [body.slot]: toStoredDocCheck(result) } },
    { actorId: req.auth.sub, source: "photo_check" },
  );
  sendSuccess(
    res,
    body.autoCrop ? { ...result, croppedDataUrl, cardDetected: Boolean(croppedDataUrl) } : result,
    result.message,
  );
});

kycRouter.get("/documents/:docKey", async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const doc = await getMyKycDocument(req.auth.sub, String(req.params.docKey ?? ""));
  res.setHeader("Content-Type", doc.contentType);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(doc.buffer);
});

const signupBankCheckSchema = z.object({
  accountNumber: z.string().trim().regex(/^\d{6,18}$/, "Account number must be 6–18 digits"),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid 11-character IFSC (e.g. SBIN0001234)"),
});

/** Signup bank step: free BestAPI check only — never pennyless / penny drop, never charged. */
kycRouter.post("/bank-check", kycDocCheckLimiter, validateBody(signupBankCheckSchema), async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const body = req.body as z.infer<typeof signupBankCheckSchema>;
  const { verifyBankAccount } = await import("../transactions/bankNameCheck.service");
  const v = await verifyBankAccount({
    userId: req.auth.sub,
    accountNumber: body.accountNumber,
    ifsc: body.ifsc,
    purpose: "signup_bank",
    bestApiOnly: true,
  });
  sendSuccess(res, { status: v.status, bankName: v.bankName, cached: v.cached, message: v.message }, v.message);
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
    const body = req.body as { otp: string; requestId?: string };
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
