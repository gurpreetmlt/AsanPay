"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AlertTriangle, Wallet, ShieldAlert, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { extractApiError } from "@/lib/onboarding";
import { fetchApi } from "@/lib/api";

interface DownlineItem {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
  isActive: boolean;
  mainBalance: string;
  kycStatus?: string;
}

interface NetworkData {
  downline: DownlineItem[];
}

/** Below this main-wallet balance, a retailer risks declining transactions at the counter. */
const LOW_BALANCE_THRESHOLD = 200;

type IssueType = "kyc_pending" | "low_balance" | "inactive";

interface Issue {
  type: IssueType;
  member: DownlineItem;
}

const ISSUE_META: Record<IssueType, { label: string; icon: typeof AlertTriangle; color: string }> = {
  kyc_pending: { label: "KYC Pending", icon: ShieldAlert, color: "#b45309" },
  low_balance: { label: "Low Balance", icon: Wallet, color: "#dc2626" },
  inactive: { label: "Inactive", icon: AlertTriangle, color: "#6b7280" },
};

export default function ActionQueuePage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<IssueType | "">("");

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken || !user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchApi<NetworkData>("/users/network");
        if (!alive) return;
        const next: Issue[] = [];
        for (const m of data.downline) {
          if (m.kycStatus && m.kycStatus !== "verified") next.push({ type: "kyc_pending", member: m });
          if (Number(m.mainBalance) < LOW_BALANCE_THRESHOLD) next.push({ type: "low_balance", member: m });
          if (!m.isActive) next.push({ type: "inactive", member: m });
        }
        setIssues(next);
      } catch (err) {
        if (alive) toast.error(extractApiError(err, "Failed to load action queue"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, user]);

  if (!hydrated || !accessToken || !user) return null;

  const filtered = filter ? issues.filter((i) => i.type === filter) : issues;
  const counts = {
    kyc_pending: issues.filter((i) => i.type === "kyc_pending").length,
    low_balance: issues.filter((i) => i.type === "low_balance").length,
    inactive: issues.filter((i) => i.type === "inactive").length,
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-bold" style={{ color: B.blue }}>
          Action Queue
        </h1>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          Today&apos;s follow-ups for your network — KYC pending, low balance, inactive accounts.
          Failed-transaction follow-up is a planned addition here.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("")}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={filter === "" ? { background: B.badgeGrad, color: "#fff" } : { background: B.secondary, color: B.blueMid }}
          >
            All ({issues.length})
          </button>
          {(Object.keys(ISSUE_META) as IssueType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className="rounded-xl px-3 py-2 text-sm font-semibold"
              style={filter === t ? { background: B.badgeGrad, color: "#fff" } : { background: B.secondary, color: B.blueMid }}
            >
              {ISSUE_META[t].label} ({counts[t]})
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {loading && (
            <p className="py-8 text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          )}
          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl border bg-white px-4 py-10 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
              Nothing needs attention right now 🎉
            </div>
          )}
          {!loading &&
            filtered.map((issue, i) => {
              const meta = ISSUE_META[issue.type];
              const Icon = meta.icon;
              return (
                <button
                  key={`${issue.type}-${issue.member.id}-${i}`}
                  type="button"
                  onClick={() => router.push("/network")}
                  className="flex w-full items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left transition hover:shadow-sm"
                  style={{ borderColor: B.border }}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `${meta.color}1a` }}
                  >
                    <Icon size={16} style={{ color: meta.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium" style={{ color: B.blue }}>
                      {issue.member.name}
                    </div>
                    <div className="text-xs" style={{ color: B.muted }}>
                      {issue.member.mobile} · {issue.member.uid}
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: `${meta.color}1a`, color: meta.color }}
                  >
                    {meta.label}
                    {issue.type === "low_balance" && ` · ₹${Number(issue.member.mainBalance).toFixed(0)}`}
                  </span>
                  <ArrowRight size={14} style={{ color: B.muted }} className="shrink-0" />
                </button>
              );
            })}
        </div>
      </div>
    </AppShell>
  );
}
