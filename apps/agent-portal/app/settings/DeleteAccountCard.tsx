"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import type { ApiResponse } from "@asanpay/shared-types";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B } from "@/lib/brand";
import api from "@/lib/api";
import { extractApiError } from "@/lib/onboarding";

const REASON_MAX = 300;

const DELETION_FACTS = [
  "Your login, profile and saved devices are removed within 30 days.",
  "Transaction and KYC records are kept for 5 years as required by law, then deleted.",
  "Withdraw or settle your wallet balance before you send this request.",
];

type DeletionStatus = { status: "none" | "requested"; requestedAt: string | null };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [requestedAt, setRequestedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setReason("");
    setLoading(true);
    void api
      .get<ApiResponse<DeletionStatus>>("/account/deletion-request")
      .then(({ data }) => {
        if (alive) setRequestedAt(data.success && data.data.status === "requested" ? data.data.requestedAt : null);
      })
      .catch(() => {
        if (alive) setRequestedAt(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  async function submit() {
    if (submitting) return;
    if (reason.trim().length > REASON_MAX) {
      toast.error(`Reason must be ${REASON_MAX} characters or less`);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<ApiResponse<{ requestedAt: string }>>("/account/deletion-request", {
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (!data.success) throw new Error(data.message);
      setRequestedAt(data.data.requestedAt);
    } catch (err) {
      toast.error(
        extractApiError(err, "Could not send the deletion request. Check your internet connection and try again."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const close = () => setOpen(false);

  return (
    <div className="rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
      <h2 className="text-lg font-bold" style={{ color: B.blue }}>
        Delete account
      </h2>
      <p className="mb-4 mt-1 text-xs" style={{ color: B.muted }}>
        Request permanent deletion of your AsanPay account.{" "}
        <Link href="/account-deletion" className="font-semibold underline" style={{ color: B.blueLight }}>
          What is deleted and what is kept
        </Link>
      </p>
      <PrimaryButton type="button" variant="destructive" size="sm" className="!w-auto" onClick={() => setOpen(true)}>
        <Trash2 size={14} /> Delete account
      </PrimaryButton>

      {open && requestedAt ? (
        <Modal
          title="Deletion requested"
          subtitle="We will delete your account within 30 days"
          icon={<CheckCircle2 size={22} />}
          iconTone="green"
          onClose={close}
        >
          <div className="rounded-2xl border p-4" style={{ borderColor: "#BBF7D0", background: "#F0FDF4" }}>
            <div className="text-sm font-bold" style={{ color: B.greenDark }}>
              Request received on {formatDate(requestedAt)}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: B.greenDark }}>
              Our support team may call your registered mobile number to confirm. Transaction and KYC records are
              kept for 5 years as required by law.
            </p>
          </div>
          <PrimaryButton type="button" variant="primary" className="mt-5" onClick={close} showArrow={false}>
            Done
          </PrimaryButton>
        </Modal>
      ) : open ? (
        <Modal
          title="Delete account"
          subtitle="Request permanent deletion of your AsanPay account"
          icon={<Trash2 size={22} />}
          iconTone="red"
          onClose={close}
          closeDisabled={submitting}
        >
          {loading ? (
            <p className="py-6 text-center text-sm" style={{ color: B.muted }}>
              Checking your account…
            </p>
          ) : (
            <>
              <ul
                className="space-y-2.5 rounded-2xl border p-4"
                style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, #FFFFFF 100%)" }}
              >
                {DELETION_FACTS.map((fact) => (
                  <li key={fact} className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: B.blueMid }}>
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#DC2626" }} />
                    {fact}
                  </li>
                ))}
              </ul>

              <label className="mb-1 mt-4 block text-xs font-semibold" style={{ color: B.muted }}>
                Reason (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                rows={3}
                placeholder="Tell us why you are leaving"
                className="w-full resize-none rounded-xl border px-4 py-2.5 text-sm outline-none"
                style={{ borderColor: B.border, background: B.bg, color: B.blue }}
              />
              <div className="mt-1 text-right text-[11px]" style={{ color: B.muted }}>
                {reason.length}/{REASON_MAX} characters
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <PrimaryButton type="button" variant="secondary" onClick={close} disabled={submitting}>
                  Cancel
                </PrimaryButton>
                <PrimaryButton
                  type="button"
                  variant="destructive"
                  loading={submitting}
                  disabled={submitting}
                  onClick={() => void submit()}
                >
                  Request deletion
                </PrimaryButton>
              </div>
            </>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
