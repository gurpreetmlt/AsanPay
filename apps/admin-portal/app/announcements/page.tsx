"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Megaphone } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { ConfirmModal, type ConfirmTone } from "@/components/ui/ConfirmModal";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type PendingConfirm = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone: ConfirmTone;
  action: () => void | Promise<void>;
};

/**
 * Composer for POST /admin/emails/product-update (modules/notifications/userEmail.service.ts).
 * Was fully built on the backend with zero frontend consumer anywhere in the three apps —
 * this is that missing UI. Sends to every user with a verified, opted-in email address
 * (users.emailMarketingOptIn) — irreversible and reaches the whole base at once, so it goes
 * behind an explicit confirmation naming the action, same pattern as freeze/refund elsewhere
 * in this portal.
 */
export default function AnnouncementsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  if (hydrated && !accessToken) {
    router.replace("/login");
    return null;
  }
  if (!hydrated || !accessToken) return null;

  async function executeSend() {
    setSending(true);
    try {
      const { data } = await api.post<{ data: { sent: number } }>("/admin/emails/product-update", {
        subject: subject.trim(),
        headline: headline.trim(),
        body: body.trim(),
      });
      toast.success(`Sent to ${data.data.sent} users`);
      setSubject("");
      setHeadline("");
      setBody("");
      setPendingConfirm(null);
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Could not send announcement",
      );
    } finally {
      setSending(false);
    }
  }

  function send() {
    if (subject.trim().length < 3 || headline.trim().length < 3 || body.trim().length < 10) {
      toast.error("Fill subject, headline and body first");
      return;
    }
    setPendingConfirm({
      title: "Send announcement email?",
      message:
        "This emails every opted-in, verified user on the platform right now. This cannot be undone.",
      confirmLabel: "Send email",
      tone: "info",
      action: () => void executeSend(),
    });
  }

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-2xl space-y-5 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
            style={{ background: B.badgeGrad }}
          >
            <Megaphone size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              Announcements
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              Email every opted-in, verified user. Rare use — this is not a support channel.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: B.blue }}>
              Subject line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={160}
              placeholder="New: Instant AePS settlement is live"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: B.blue }}>
              Headline
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={160}
              placeholder="Shown at the top of the email"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: B.blue }}>
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              maxLength={5000}
              placeholder="Full announcement text…"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </div>
          <button
            type="button"
            disabled={sending}
            onClick={() => void send()}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: B.badgeGrad }}
          >
            {sending ? "Sending…" : "Send to all opted-in users"}
          </button>
        </div>
      </div>

      {pendingConfirm ? (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          tone={pendingConfirm.tone}
          busy={sending}
          onConfirm={() => void pendingConfirm.action()}
          onClose={() => {
            if (!sending) setPendingConfirm(null);
          }}
        />
      ) : null}
    </AdminShell>
  );
}
