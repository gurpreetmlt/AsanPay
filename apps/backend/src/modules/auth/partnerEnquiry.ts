import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { isMailerConfigured, sendMail } from "../../utils/mailer";
import { sendSuccess } from "../../utils/apiResponse";
import { logger } from "../../utils/logger";

const text = (msg: string, max: number) => z.string({ error: msg }).trim().min(1, msg).max(max);

export const partnerEnquirySchema = z.object({
  role: z.enum(["distributor", "super_distributor"], {
    error: "Select Distributor or Super Distributor",
  }),
  name: text("Enter your full name", 120),
  mobile: z
    .string({ error: "Enter a valid 10-digit mobile" })
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile"),
  email: z.string({ error: "Enter a valid email address" }).trim().email("Enter a valid email address").max(160),
  city: text("Enter your city", 80),
  state: text("Enter your state", 80),
  message: text("Tell us about your business (network size, area, current services)", 2000),
});

const ROLE_LABEL = { distributor: "Distributor", super_distributor: "Super Distributor" } as const;

export async function partnerEnquiry(req: Request, res: Response): Promise<void> {
  const input = partnerEnquirySchema.parse(req.body);
  const to = env.PARTNER_ENQUIRY_EMAIL ?? env.SMTP_USER;
  if (!to || !isMailerConfigured()) {
    throw new HttpError(
      503,
      "Enquiries cannot be sent right now. Please call or WhatsApp our support team.",
      "ENQUIRY_EMAIL_UNAVAILABLE",
    );
  }

  const role = ROLE_LABEL[input.role];
  const ok = await sendMail({
    to,
    subject: `New ${role} enquiry — ${input.name} (${input.city})`,
    text: [
      `New ${role} enquiry from the AsanPay signup page.`,
      ``,
      `Name: ${input.name}`,
      `Mobile: ${input.mobile}`,
      `Email: ${input.email}`,
      `City: ${input.city}`,
      `State: ${input.state}`,
      ``,
      `Message:`,
      input.message,
      ``,
      `IP: ${req.ip ?? "unknown"}`,
    ].join("\n"),
  });

  if (!ok) {
    throw new HttpError(
      502,
      "Your enquiry could not be sent. Please try again in a few minutes.",
      "ENQUIRY_SEND_FAILED",
    );
  }

  logger.info({ role: input.role, city: input.city }, "Partner enquiry sent");
  sendSuccess(res, { sent: true }, "Thank you. Our team will contact you soon.");
}
