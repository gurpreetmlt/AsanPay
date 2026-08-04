"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { LifeBuoy } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: "open" | "resolved";
  resolutionNote: string | null;
  createdAt: string;
  userName: string;
  userMobile: string;
  userUid: string;
}

export default function SupportTicketsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTickets(await fetchApi<Ticket[]>("/support", { status }));
    } catch {
      toast.error("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  async function resolve(t: Ticket) {
    const note = noteDrafts[t.id]?.trim();
    if (!note) {
      toast.error("Add a resolution note first");
      return;
    }
    setResolving(t.id);
    try {
      await api.patch(`/support/${t.id}/resolve`, { resolutionNote: note });
      toast.success("Ticket resolved");
      await load();
    } catch {
      toast.error("Failed to resolve ticket");
    } finally {
      setResolving(null);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2">
          <LifeBuoy size={20} style={{ color: B.blueLight }} />
          <h1 className="text-xl font-bold" style={{ color: B.blue }}>Support Tickets</h1>
        </div>

        <div className="mt-4 flex gap-2">
          {(["open", "resolved"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className="rounded-xl px-3 py-2 text-sm font-semibold capitalize"
              style={status === s ? { background: B.badgeGrad, color: "#fff" } : { background: B.secondary, color: B.blueMid }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {loading && <p className="py-8 text-center text-sm" style={{ color: B.muted }}>Loading…</p>}
          {!loading && tickets.length === 0 && (
            <div className="rounded-2xl border bg-white px-4 py-10 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
              No {status} tickets.
            </div>
          )}
          {!loading &&
            tickets.map((t) => (
              <div key={t.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold" style={{ color: B.blue }}>{t.subject}</span>
                  <span className="text-xs" style={{ color: B.muted }}>
                    {new Date(t.createdAt).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="text-xs" style={{ color: B.muted }}>
                  {t.userName} · {t.userMobile} · {t.userUid}
                </div>
                <p className="mt-2 text-sm" style={{ color: B.blueMid }}>{t.description}</p>

                {t.status === "resolved" ? (
                  <div className="mt-2 rounded-lg p-2 text-xs" style={{ background: "#DCFCE7", color: "#166534" }}>
                    <strong>Resolution:</strong> {t.resolutionNote}
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={noteDrafts[t.id] ?? ""}
                      onChange={(e) => setNoteDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                      placeholder="Resolution note…"
                      className="flex-1 rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: B.border }}
                    />
                    <button
                      type="button"
                      disabled={resolving === t.id}
                      onClick={() => void resolve(t)}
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: B.badgeGrad }}
                    >
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </AdminShell>
  );
}
