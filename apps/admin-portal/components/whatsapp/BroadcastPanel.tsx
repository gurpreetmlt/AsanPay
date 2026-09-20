"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

type Role = "retailer" | "distributor" | "super_distributor";

interface SupportConfig {
  supportTemplateName: string | null;
  supportTemplateLanguage: string;
}

interface BroadcastRow {
  id: string;
  templateName: string;
  bodyText: string;
  roles: string[];
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
}

interface BroadcastDetail {
  broadcast: BroadcastRow & {
    templateLanguage: string;
    startedAt: string | null;
  };
  recipients: Array<{
    id: string;
    mobile: string;
    waId: string;
    status: string;
    errorMessage: string | null;
    sentAt: string | null;
    userName: string | null;
    userRole: string | null;
  }>;
}

const ROLE_OPTIONS: { id: Role; label: string }[] = [
  { id: "retailer", label: "Retailers" },
  { id: "distributor", label: "Distributors" },
  { id: "super_distributor", label: "Super Distributors" },
];

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function apiErrorMessage(err: unknown): string {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message || ax.message || "Request failed";
}

export function WhatsAppBroadcastPanel({ config }: { config: SupportConfig }) {
  const [roles, setRoles] = useState<Role[]>(["retailer"]);
  const [bodyText, setBodyText] = useState("");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [maxAudience, setMaxAudience] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [list, setList] = useState<BroadcastRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BroadcastDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      setList(await fetchApi<BroadcastRow[]>("/whatsapp/support/broadcasts"));
    } catch {
      toast.error("Failed to load broadcasts");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!roles.length) {
      setAudienceCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchApi<{ count: number; max: number }>(
          "/whatsapp/support/broadcasts/audience-count",
          { roles: roles.join(",") },
        );
        if (!cancelled) {
          setAudienceCount(data.count);
          setMaxAudience(data.max);
        }
      } catch {
        if (!cancelled) setAudienceCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roles]);

  async function openDetail(id: string) {
    setSelectedId(id);
    try {
      setDetail(await fetchApi<BroadcastDetail>(`/whatsapp/support/broadcasts/${id}`));
    } catch {
      toast.error("Failed to load broadcast details");
    }
  }

  async function refreshDetail() {
    if (!selectedId) return;
    try {
      setDetail(await fetchApi<BroadcastDetail>(`/whatsapp/support/broadcasts/${selectedId}`));
      await loadList();
    } catch {
      toast.error("Failed to refresh broadcast");
    }
  }

  function toggleRole(role: Role) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function submitBroadcast() {
    if (!config.supportTemplateName) {
      toast.error("Set WHATSAPP_SUPPORT_TEMPLATE_NAME in Coolify first");
      return;
    }
    if (!roles.length) {
      toast.error("Select at least one role");
      return;
    }
    if (!bodyText.trim()) {
      toast.error("Broadcast message text cannot be empty");
      return;
    }
    if (audienceCount != null && audienceCount > maxAudience) {
      toast.error(`Audience exceeds max of ${maxAudience}. Narrow the roles.`);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<{
        success: boolean;
        message?: string;
        data: { id: string; totalCount: number };
      }>("/whatsapp/support/broadcasts", {
        roles,
        bodyText: bodyText.trim(),
      });
      if (!data.success) throw new Error(data.message || "Failed to queue broadcast");
      toast.success(`Broadcast queued for ${data.data.totalCount} agents`);
      setBodyText("");
      await loadList();
      await openDetail(data.data.id);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const templateName = config.supportTemplateName || "(not configured)";

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4 overflow-y-auto rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
        <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: B.muted }}>
          New broadcast
        </h2>
        <p className="text-sm" style={{ color: B.blueMid }}>
          Sends approved template <strong>{templateName}</strong> to active agents. Body variable{" "}
          {"{{1}}"} = your text below. Max {maxAudience} recipients per run.
        </p>

        <div>
          <div className="mb-2 text-xs font-semibold" style={{ color: B.muted }}>
            Audience roles
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((r) => {
              const on = roles.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRole(r.id)}
                  className="rounded-full border px-3 py-1.5 text-sm font-medium"
                  style={{
                    borderColor: on ? B.blue : B.border,
                    background: on ? "rgba(42,92,221,0.1)" : "transparent",
                    color: on ? B.blue : B.blueMid,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs" style={{ color: B.muted }}>
            {audienceCount == null
              ? "Counting audience…"
              : `Audience: ${audienceCount} active agent${audienceCount === 1 ? "" : "s"}`}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: B.muted }}>
            Template body text ({"{{1}}"})
          </label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={3}
            maxLength={1024}
            placeholder="e.g. Please complete KYC before Friday."
            className="w-full rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: B.border }}
          />
        </div>

        <button
          type="button"
          disabled={submitting || !roles.length || !bodyText.trim() || !config.supportTemplateName}
          onClick={() => void submitBroadcast()}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: B.green }}
        >
          {submitting ? "Queuing…" : "Send broadcast"}
        </button>
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
        <div
          className="flex items-center justify-between border-b px-4 py-2"
          style={{ borderColor: B.border }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: B.muted }}>
            Recent broadcasts
          </h2>
          <button
            type="button"
            onClick={() => void (selectedId ? refreshDetail() : loadList())}
            className="text-xs font-medium"
            style={{ color: B.blueMid }}
          >
            Refresh
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-full overflow-y-auto border-r md:w-2/5" style={{ borderColor: B.border }}>
            {loadingList && (
              <p className="p-3 text-sm" style={{ color: B.muted }}>
                Loading…
              </p>
            )}
            {!loadingList && list.length === 0 && (
              <p className="p-3 text-sm" style={{ color: B.muted }}>
                No broadcasts yet.
              </p>
            )}
            {list.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => void openDetail(b.id)}
                className="block w-full border-b px-3 py-3 text-left"
                style={{
                  borderColor: B.border,
                  background: selectedId === b.id ? "rgba(42,92,221,0.08)" : "transparent",
                }}
              >
                <div className="flex justify-between gap-2 text-sm font-semibold" style={{ color: B.blue }}>
                  <span className="truncate">{b.bodyText}</span>
                  <span className="shrink-0 text-[11px] font-medium capitalize" style={{ color: B.muted }}>
                    {b.status}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: B.muted }}>
                  {b.sentCount}/{b.totalCount} sent · {b.failedCount} failed · {formatWhen(b.createdAt)}
                </div>
              </button>
            ))}
          </div>
          <div className="hidden min-w-0 flex-1 overflow-y-auto p-3 md:block">
            {!detail && (
              <p className="text-sm" style={{ color: B.muted }}>
                Select a broadcast to see per-recipient status.
              </p>
            )}
            {detail && (
              <div className="space-y-3">
                <div>
                  <div className="font-semibold" style={{ color: B.blue }}>
                    {detail.broadcast.bodyText}
                  </div>
                  <div className="text-xs" style={{ color: B.muted }}>
                    {detail.broadcast.templateName} · {detail.broadcast.status} ·{" "}
                    {detail.broadcast.sentCount} sent / {detail.broadcast.failedCount} failed /{" "}
                    {detail.broadcast.totalCount} total
                  </div>
                </div>
                <div className="space-y-1">
                  {detail.recipients.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border px-2 py-1.5 text-xs"
                      style={{ borderColor: B.border }}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium" style={{ color: B.blue }}>
                          {r.userName || r.mobile} · {r.mobile}
                        </span>
                        <span className="capitalize" style={{ color: B.muted }}>
                          {r.status}
                        </span>
                      </div>
                      {r.errorMessage && (
                        <div className="mt-0.5" style={{ color: "#B91C1C" }}>
                          {r.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
