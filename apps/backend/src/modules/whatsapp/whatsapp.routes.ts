import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { defaultRecipient, sendWhatsAppText } from "./whatsapp.service";

export const whatsappRouter = Router();

const testMessageSchema = z.object({
  to: z
    .string()
    .trim()
    .min(1, "Enter a valid WhatsApp number with country code (e.g. 9198XXXXXXXX)")
    .optional(),
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(4096, "Message must be at most 4096 characters"),
});

whatsappRouter.post("/test-message", requireAuth, requireRole("admin"), async (req, res) => {
  const body = testMessageSchema.parse(req.body ?? {});
  const to = body.to || defaultRecipient();
  if (!to) {
    throw new HttpError(
      422,
      "Enter a WhatsApp recipient number in `to`, or set WHATSAPP_RECIPIENT_NUMBER on the backend.",
      "WHATSAPP_TO_REQUIRED",
    );
  }
  const result = await sendWhatsAppText(to, body.message);
  sendSuccess(res, result, "WhatsApp test message sent");
});
