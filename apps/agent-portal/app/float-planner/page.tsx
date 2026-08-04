"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { PiggyBank, Wallet, Users, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { extractApiError } from "@/lib/onboarding";
import { fetchApi } from "@/lib/api";
import { formatInr } from "@/lib/walletLabels";

interface FloatData {
  ownBalance: string;
  deployedFloat: string;
  totalFloat: string;
  downlineCount: number;
  commission: { today: string; week: string; month: string };
}

export default function FloatPlannerPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [data, setData] = useState<FloatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken || !user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchApi<FloatData>("/dashboard/float");
        if (alive) setData(res);
      } catch (err) {
        if (alive) toast.error(extractApiError(err, "Failed to load float data"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, user]);

  if (!hydrated || !accessToken || !user) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center gap-2">
          <PiggyBank size={20} style={{ color: B.blueLight }} />
          <h1 className="text-xl font-bold" style={{ color: B.blue }}>
            Float & Earnings
          </h1>
        </div>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          Cash you still hold plus cash already deployed into your network, and your commission
          earnings over time. This is a ledger read — not a projection or forecast.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={<Wallet size={18} />}
            label="Your Balance"
            value={loading ? "…" : formatInr(data?.ownBalance ?? "0")}
            accent={B.blue}
          />
          <StatCard
            icon={<Users size={18} />}
            label={`Deployed (${data?.downlineCount ?? 0} agents)`}
            value={loading ? "…" : formatInr(data?.deployedFloat ?? "0")}
            accent={B.green}
          />
          <StatCard
            icon={<PiggyBank size={18} />}
            label="Total Network Float"
            value={loading ? "…" : formatInr(data?.totalFloat ?? "0")}
            accent={B.blueLight}
          />
        </div>

        <div className="mt-5 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={16} style={{ color: B.green }} />
            <h3 className="text-sm font-bold" style={{ color: B.blue }}>Commission Earned</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Today" value={formatInr(data?.commission.today ?? "0")} />
            <MiniStat label="Last 7 Days" value={formatInr(data?.commission.week ?? "0")} />
            <MiniStat label="This Month" value={formatInr(data?.commission.month ?? "0")} highlight />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
      <div className="mb-2 flex items-center gap-2">
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: B.blue }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="rounded-xl border p-4 text-center"
      style={{ borderColor: highlight ? B.green : B.border, background: highlight ? `${B.green}08` : "white" }}
    >
      <div className="text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>{label}</div>
      <div className="mt-1 text-lg font-bold" style={{ color: highlight ? B.green : B.blue }}>{value}</div>
    </div>
  );
}
