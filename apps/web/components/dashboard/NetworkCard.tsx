"use client";

import { useEffect, useState } from "react";
import { Users, ArrowUpRight, UserCheck } from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchApi } from "@/lib/api";
import { B, initials } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { extractApiError } from "@/lib/onboarding";
import type { UserRole } from "@asanpay/shared-types";

interface DownlineItem {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface UplineItem {
  id: string;
  name: string;
  mobile: string;
  role: string;
}

interface NetworkData {
  role: UserRole;
  downline: DownlineItem[];
  upline: UplineItem | null;
}

const ROLE_UI: Record<string, { downlineTitle: string; emptyMsg: string }> = {
  master_distributor: { downlineTitle: "Your Distributors", emptyMsg: "No distributors yet" },
  distributor: { downlineTitle: "Your Retailers", emptyMsg: "No retailers yet" },
  retailer: { downlineTitle: "Your Network", emptyMsg: "" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function roleLabel(role: string) {
  if (role === "master_distributor") return "Super Distributor";
  if (role === "distributor") return "Distributor";
  if (role === "retailer") return "Retailer";
  return role;
}

export function NetworkCard() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchApi<NetworkData>("/users/network");
        if (alive) setData(res);
      } catch (err) {
        if (alive) toast.error(extractApiError(err, "Failed to load network"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [accessToken, user]);

  if (!user || user.role === "admin") return null;

  const ui = ROLE_UI[user.role] ?? ROLE_UI.retailer;

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
        <div className="flex items-center gap-2">
          <Users size={18} style={{ color: B.blue }} />
          <h2 className="font-bold" style={{ color: B.blue }}>{ui.downlineTitle}</h2>
        </div>
        <p className="mt-4 py-6 text-center text-sm" style={{ color: B.muted }}>Loading…</p>
      </div>
    );
  }

  if (user.role === "retailer") {
    return (
      <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
        <div className="mb-4 flex items-center gap-2">
          <ArrowUpRight size={18} style={{ color: B.blue }} />
          <h2 className="font-bold" style={{ color: B.blue }}>Your Network</h2>
        </div>
        {data?.upline ? (
          <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: B.secondary }}>
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: B.blue }}
            >
              {initials(data.upline.name)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: B.blue }}>{data.upline.name}</p>
              <p className="text-xs" style={{ color: B.muted }}>{data.upline.mobile}</p>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ background: B.blueLight }}
            >
              {roleLabel(data.upline.role)}
            </span>
          </div>
        ) : (
          <p className="py-4 text-center text-sm" style={{ color: B.muted }}>
            No upline info available
          </p>
        )}
      </div>
    );
  }

  const count = data?.downline.length ?? 0;

  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={18} style={{ color: B.blue }} />
          <h2 className="font-bold" style={{ color: B.blue }}>{ui.downlineTitle}</h2>
        </div>
        {count > 0 && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
            style={{ background: B.green }}
          >
            {count} {user.role === "master_distributor" ? "Distributor" : "Retailer"}{count > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center py-8">
          <UserCheck size={32} style={{ color: B.muted }} className="mb-2 opacity-40" />
          <p className="text-sm" style={{ color: B.muted }}>{ui.emptyMsg}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data!.downline.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-opacity-80"
              style={{ background: B.secondary }}
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: B.blue }}
              >
                {initials(member.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                  {member.name}
                </p>
                <p className="text-xs" style={{ color: B.muted }}>{member.mobile}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: member.isActive ? B.green : "#94a3b8" }}
                />
                <span className="text-xs" style={{ color: B.muted }}>
                  {formatDate(member.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
