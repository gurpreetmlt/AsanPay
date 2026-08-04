"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { LifeBuoy, Plus, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { extractApiError } from "@/lib/onboarding";
import api, { fetchApi } from "@/lib/api";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: "open" | "resolved";
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export default function SupportPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setTickets(await fetchApi<Ticket[]>("/support/mine"));
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load tickets"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function submit() {
    if (subject.trim().length < 3 || description.trim().length < 3) {
      toast.error("Please fill subject and description");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/support", { subject: subject.trim(), description: description.trim() });
      toast.success("Ticket raised");
      setSubject("");
      setDescription("");
      setShowForm(false);
      await load();
    } catch (err) {
      toast.error(extractApiError(err, "Failed to raise ticket"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LifeBuoy size={20} style={{ color: B.blueLight }} />
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>Support</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white"
            style={{ background: B.badgeGrad }}
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? "Cancel" : "New Ticket"}
          </button>
        </div>

        {showForm && (
          <div className="mt-4 rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
            <label className="text-xs font-semibold" style={{ color: B.muted }}>Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
              placeholder="Brief summary of the issue"
            />
            <label className="mt-3 block text-xs font-semibold" style={{ color: B.muted }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
              placeholder="Describe what happened, include transaction ref if relevant"
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="mt-3 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: B.badgeGrad }}
            >
              {submitting ? "Submitting…" : "Submit Ticket"}
            </button>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {loading && <p className="py-8 text-center text-sm" style={{ color: B.muted }}>Loading…</p>}
          {!loading && tickets.length === 0 && (
            <div className="rounded-2xl border bg-white px-4 py-10 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
              No tickets raised yet.
            </div>
          )}
          {!loading &&
            tickets.map((t) => (
              <div key={t.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold" style={{ color: B.blue }}>{t.subject}</span>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-bold capitalize"
                    style={t.status === "open" ? { background: "#FEF3C7", color: "#92400E" } : { background: "#DCFCE7", color: "#166534" }}
                  >
                    {t.status}
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: B.muted }}>{t.description}</p>
                {t.resolutionNote && (
                  <div className="mt-2 rounded-lg p-2 text-xs" style={{ background: B.secondary, color: B.blueMid }}>
                    <strong>Resolution:</strong> {t.resolutionNote}
                  </div>
                )}
                <p className="mt-2 text-[11px]" style={{ color: B.muted }}>
                  {new Date(t.createdAt).toLocaleString("en-IN")}
                </p>
              </div>
            ))}
        </div>
      </div>
    </AppShell>
  );
}
