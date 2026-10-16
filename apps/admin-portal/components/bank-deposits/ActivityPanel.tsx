"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Landmark, Smartphone, Server } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

type Channel = "all" | "bank" | "agent" | "api";

interface ActivityItem {
  id: string;
  channel: "bank" | "agent" | "api";
  kind: string;
  title: string;
  subtitle: string | null;
  amount: string | null;
  direction: "CR" | "DR" | null;
  status: string | null;
  occurredAt: string;
  href: string | null;
}

const FILTERS: { key: Channel; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Bank, agent and API together" },
  { key: "bank", label: "Bank", hint: "Statement lines and bank entries" },
  { key: "agent", label: "Agent", hint: "Fund request deposits" },
  { key: "api", label: "API", hint: "Provider / float journals" },
];

const CHANNEL_META: Record<
  "bank" | "agent" | "api",
  { label: string; color: string; bg: string; icon: typeof Landmark }
> = {
  bank: { label: "Bank", color: "#1D4ED8", bg: "#DBEAFE", icon: Landmark },
  agent: { label: "Agent", color: "#15803D", bg: "#DCFCE7", icon: Smartphone },
  api: { label: "API", color: "#7C3AED", bg: "#EDE9FE", icon: Server },
};

function inr(amount: string | null, direction: "CR" | "DR" | null) {
  if (amount === null) return "—";
  const n = Number(amount);
  const text = `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (direction === "CR") return `+${text}`;
  if (direction === "DR") return `-${text}`;
  return text;
}

function when(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(raw: string | null) {
  if (!raw) return null;
  const map: Record<string, string> = {
    unmatched: "Unmatched",
    matched: "Matched",
    needs_review: "Needs review",
    suspense: "Needs review",
    ignored: "Skipped",
    requested: "Requested",
    approved: "Approved",
    rejected: "Rejected",
    posted: "Posted",
  };
  return map[raw] ?? raw.replace(/_/g, " ");
}

export function ActivityPanel() {
  const [channel, setChannel] = useState<Channel>("all");
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<ActivityItem[]>("/banking/activity", { channel, limit: 50 });
      setItems(data);
    } catch (err) {
      const ax = err as { message?: string };
      setError(ax?.message || "Could not load activity");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Activity
          </h2>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Recent bank, agent and API money in one list. Filter to focus on one rail.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg px-3 py-1.5 text-xs font-bold transition hover:bg-[#EEF3FF]"
          style={{ color: B.blueLight }}
        >
          Refresh
        </button>
      </div>

      <div className="inline-flex flex-wrap gap-1.5 rounded-xl p-1" style={{ background: "#F1F5F9" }}>
        {FILTERS.map((f) => {
          const active = channel === f.key;
          return (
            <button
              key={f.key}
              type="button"
              title={f.hint}
              onClick={() => setChannel(f.key)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold transition"
              style={{
                background: active ? B.badgeGrad : "transparent",
                color: active ? "#fff" : B.muted,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading activity…
        </p>
      ) : error ? (
        <p className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "#FECACA", color: B.danger, background: "#FEF2F2" }}>
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border px-4 py-8 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
          No activity for this filter yet.
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          {items.map((item) => {
            const meta = CHANNEL_META[item.channel];
            const Icon = meta.icon;
            const status = statusLabel(item.status);
            const amountColor =
              item.direction === "CR" ? "#15803D" : item.direction === "DR" ? B.danger : B.blue;
            const body = (
              <div className="flex items-start gap-3 px-4 py-3 transition hover:bg-[#F8FAFC]">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: meta.color, background: meta.bg }}
                    >
                      {meta.label}
                    </span>
                    {status ? (
                      <span className="text-[11px] font-medium" style={{ color: B.muted }}>
                        {status}
                      </span>
                    ) : null}
                    <span className="text-[11px]" style={{ color: B.muted }}>
                      {when(item.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm font-semibold" style={{ color: B.blue }}>
                    {item.title}
                  </p>
                  {item.subtitle ? (
                    <p className="truncate text-xs" style={{ color: B.muted }} title={item.subtitle}>
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums" style={{ color: amountColor }}>
                  {inr(item.amount, item.direction)}
                </p>
              </div>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className="block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
