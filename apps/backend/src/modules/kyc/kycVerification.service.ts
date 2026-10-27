import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  kycVerifications,
  type KycVerificationDetails,
  type KycVerificationSlotState,
} from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import type { DocCheckSlot, StoredDocCheck } from "./docCheck/docCheck.service";

export const KYC_CHECK_STATUSES = ["pending", "verified", "failed", "retry_required", "manual_review"] as const;
export type KycCheckStatus = (typeof KYC_CHECK_STATUSES)[number];

export const KYC_CHECK_FIELDS = ["panNumber", "panImage", "aadhaarOtp", "aadhaarImage", "crossCheck"] as const;
export type KycCheckField = (typeof KYC_CHECK_FIELDS)[number];

export type KycStatusSource =
  | "pan_verify"
  | "aadhaar_otp"
  | "photo_check"
  | "submit"
  | "admin_decision"
  | "admin_reset";

/** Overall = worst: failed > retry_required > manual_review > pending > verified. */
const SEVERITY: Record<KycCheckStatus, number> = {
  verified: 0,
  pending: 1,
  manual_review: 2,
  retry_required: 3,
  failed: 4,
};

export function worstKycStatus(list: KycCheckStatus[]): KycCheckStatus {
  return list.reduce<KycCheckStatus>((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst), "verified");
}

const IDENTITY_CHECK_IDS = new Set(["name", "dob", "gender", "panNumber", "aadhaarNumber"]);

/** Photo `pass` → verified · `flag` → manual_review · quality fail → retry_required · other fail → failed. */
export function photoCheckStatus(check: StoredDocCheck): KycCheckStatus {
  if (check.status === "pass") return "verified";
  if (check.status === "flag") return "manual_review";
  return check.checks.some((c) => c.id === "quality" && c.status === "fail") ? "retry_required" : "failed";
}

function toSlotState(check: StoredDocCheck): KycVerificationSlotState {
  const status = photoCheckStatus(check);
  const identity = check.checks.filter((c) => IDENTITY_CHECK_IDS.has(c.id) && c.status !== "skip");
  const failed = identity.find((c) => c.status === "fail");
  const flagged = identity.find((c) => c.status === "flag");
  const crossCheck: KycCheckStatus | null = failed
    ? "failed"
    : flagged
      ? "manual_review"
      : identity.length
        ? "verified"
        : status === "manual_review"
          ? "manual_review"
          : null;
  const crossCheckMessage = (failed ?? flagged)?.detail;
  return {
    status,
    crossCheck,
    message: check.message,
    ...(crossCheckMessage ? { crossCheckMessage } : {}),
    checkedAt: check.checkedAt,
  };
}

type Slots = NonNullable<KycVerificationDetails["slots"]>;

function worstSlot(list: (KycVerificationSlotState | undefined)[], pick: (s: KycVerificationSlotState) => KycCheckStatus) {
  let worst: KycVerificationSlotState | undefined;
  for (const s of list) {
    if (s && (!worst || SEVERITY[pick(s)] > SEVERITY[pick(worst)])) worst = s;
  }
  return worst;
}

/** PAN↔Aadhaar cross-check needs the PAN photo and Aadhaar front; the back counts only when it had something to compare. */
function deriveFromSlots(slots: Slots) {
  const panImage = slots.panImage?.status ?? "pending";
  const aadhaarImage = worstKycStatus([
    slots.aadhaarFront?.status ?? "pending",
    slots.aadhaarBack?.status ?? "pending",
  ]);
  const crossSlots = [slots.panImage, slots.aadhaarFront];
  if (slots.aadhaarBack?.crossCheck) crossSlots.push(slots.aadhaarBack);
  const crossCheck = worstKycStatus(crossSlots.map((s) => s?.crossCheck ?? "pending"));

  const aadhaarWorst = worstSlot([slots.aadhaarFront, slots.aadhaarBack], (s) => s.status);
  const crossWorst = worstSlot(crossSlots, (s) => s.crossCheck ?? "pending");
  return {
    statuses: { panImage, aadhaarImage, crossCheck },
    reasons: {
      panImage: panImage === "verified" ? null : (slots.panImage?.message ?? null),
      aadhaarImage: aadhaarImage === "verified" ? null : (aadhaarWorst?.message ?? null),
      crossCheck: crossCheck === "verified" ? null : (crossWorst?.crossCheckMessage ?? null),
    } satisfies Partial<Record<KycCheckField, string | null>>,
  };
}

export type KycVerificationPatch = Partial<Record<KycCheckField, KycCheckStatus>> & {
  /** Latest photo check per slot — recomputes pan_image / aadhaar_image / cross_check. */
  slots?: Partial<Record<DocCheckSlot, StoredDocCheck>>;
  /** Agent-facing reason per check; `null` clears it. */
  reasons?: Partial<Record<KycCheckField, string | null>>;
  aadhaarProviderRequestId?: string;
  /** `null` clears an earlier decision (new submission). */
  review?: { decision: "approved" | "rejected"; reason: string | null; adminId: string } | null;
  /** Admin reset: every check back to pending, details + decision cleared. */
  resetAll?: boolean;
};

type ChangeContext = { actorId: string; source: KycStatusSource; reason?: string | null };
type StatusChange = { field: KycCheckField | "overall"; from: KycCheckStatus; to: KycCheckStatus };

async function applyKycVerification(userId: string, patch: KycVerificationPatch): Promise<StatusChange[]> {
  return db.transaction(async (tx) => {
    await tx.insert(kycVerifications).values({ userId }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(kycVerifications)
      .where(eq(kycVerifications.userId, userId))
      .for("update");
    if (!row) return [];

    const next: Record<KycCheckField, KycCheckStatus> = {
      panNumber: patch.resetAll ? "pending" : row.panNumber,
      panImage: patch.resetAll ? "pending" : row.panImage,
      aadhaarOtp: patch.resetAll ? "pending" : row.aadhaarOtp,
      aadhaarImage: patch.resetAll ? "pending" : row.aadhaarImage,
      crossCheck: patch.resetAll ? "pending" : row.crossCheck,
    };
    const slots: Slots = patch.resetAll ? {} : { ...(row.details.slots ?? {}) };
    const reasons: NonNullable<KycVerificationDetails["reasons"]> = patch.resetAll
      ? {}
      : { ...(row.details.reasons ?? {}) };
    const setReason = (field: KycCheckField, value: string | null | undefined) => {
      if (value === undefined) return;
      if (value) reasons[field] = value;
      else delete reasons[field];
    };

    for (const field of KYC_CHECK_FIELDS) {
      const value = patch[field];
      if (value) next[field] = value;
    }
    if (patch.slots) {
      for (const [slot, check] of Object.entries(patch.slots) as [DocCheckSlot, StoredDocCheck | undefined][]) {
        if (check) slots[slot] = toSlotState(check);
      }
      const derived = deriveFromSlots(slots);
      Object.assign(next, derived.statuses);
      for (const [field, reason] of Object.entries(derived.reasons) as [KycCheckField, string | null][]) {
        setReason(field, reason);
      }
    }
    if (patch.reasons) {
      for (const [field, reason] of Object.entries(patch.reasons) as [KycCheckField, string | null][]) {
        setReason(field, reason);
      }
    }
    for (const field of KYC_CHECK_FIELDS) {
      if (next[field] === "verified") delete reasons[field];
    }

    const clearReview = patch.resetAll || patch.review === null;
    const review = patch.review
      ? {
          reviewDecision: patch.review.decision,
          reviewReason: patch.review.reason,
          reviewedBy: patch.review.adminId,
          reviewedAt: new Date(),
        }
      : clearReview
        ? { reviewDecision: null, reviewReason: null, reviewedBy: null, reviewedAt: null }
        : {
            reviewDecision: row.reviewDecision,
            reviewReason: row.reviewReason,
            reviewedBy: row.reviewedBy,
            reviewedAt: row.reviewedAt,
          };

    const overall: KycCheckStatus =
      review.reviewDecision === "approved"
        ? "verified"
        : review.reviewDecision === "rejected"
          ? "failed"
          : worstKycStatus(KYC_CHECK_FIELDS.map((f) => next[f]));

    await tx
      .update(kycVerifications)
      .set({
        ...next,
        overall,
        details: { slots, reasons },
        ...review,
        ...(patch.resetAll ? { aadhaarProviderRequestId: null } : {}),
        ...(patch.aadhaarProviderRequestId ? { aadhaarProviderRequestId: patch.aadhaarProviderRequestId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(kycVerifications.userId, userId));

    const changes: StatusChange[] = [];
    for (const field of KYC_CHECK_FIELDS) {
      if (row[field] !== next[field]) changes.push({ field, from: row[field], to: next[field] });
    }
    if (row.overall !== overall) changes.push({ field: "overall", from: row.overall, to: overall });
    return changes;
  });
}

/**
 * Updates the agent's KYC check statuses and writes a `kyc.status_changed` audit row when any
 * status moves. Never throws — `users.kyc_status` stays the gate; these statuses explain it.
 */
export async function recordKycVerification(
  userId: string,
  patch: KycVerificationPatch,
  ctx: ChangeContext,
): Promise<void> {
  try {
    const changes = await applyKycVerification(userId, patch);
    if (!changes.length) return;
    await insertAuditLog({
      userId: ctx.actorId,
      action: "kyc.status_changed",
      entityType: "user",
      entityId: userId,
      metadata: { source: ctx.source, changes, reason: ctx.reason ?? null },
    });
  } catch (err) {
    logger.warn({ userId, source: ctx.source, err: (err as Error).message }, "KYC verification status update failed");
  }
}

/** Maps a failed provider call to a check status by error code; unknown codes (outages) change nothing. */
export function statusForKycError(
  err: unknown,
  map: Record<string, KycCheckStatus>,
): { status: KycCheckStatus; message: string } | null {
  if (!(err instanceof HttpError) || !err.code) return null;
  const status = map[err.code];
  return status ? { status, message: err.message } : null;
}

export type KycVerificationView = Record<KycCheckField | "overall", KycCheckStatus> & {
  photos: Partial<Record<DocCheckSlot, { status: KycCheckStatus; message: string; checkedAt: string }>>;
  reasons: Partial<Record<KycCheckField, string>>;
  reviewDecision: "approved" | "rejected" | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  updatedAt: string | null;
};

/** Statuses only — never PAN / Aadhaar numbers or provider ids. */
export async function getKycVerificationView(userId: string): Promise<KycVerificationView> {
  const [row] = await db.select().from(kycVerifications).where(eq(kycVerifications.userId, userId)).limit(1);
  if (!row) {
    return {
      panNumber: "pending",
      panImage: "pending",
      aadhaarOtp: "pending",
      aadhaarImage: "pending",
      crossCheck: "pending",
      overall: "pending",
      photos: {},
      reasons: {},
      reviewDecision: null,
      reviewReason: null,
      reviewedAt: null,
      updatedAt: null,
    };
  }
  const photos: KycVerificationView["photos"] = {};
  for (const [slot, s] of Object.entries(row.details.slots ?? {}) as [DocCheckSlot, KycVerificationSlotState][]) {
    photos[slot] = { status: s.status, message: s.message, checkedAt: s.checkedAt };
  }
  return {
    panNumber: row.panNumber,
    panImage: row.panImage,
    aadhaarOtp: row.aadhaarOtp,
    aadhaarImage: row.aadhaarImage,
    crossCheck: row.crossCheck,
    overall: row.overall,
    photos,
    reasons: row.details.reasons ?? {},
    reviewDecision: row.reviewDecision ?? null,
    reviewReason: row.reviewReason ?? null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
