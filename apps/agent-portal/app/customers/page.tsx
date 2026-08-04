"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Phone } from "lucide-react";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { fetchApi } from "@/lib/api";
import { B, initials, roleFromUserRole } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import type { DownlineUser } from "@/lib/types";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

function formatInr(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function CustomersPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const role = roleFromUserRole(user?.role);
  const isRetailer = user?.role === "retailer";
  const [search, setSearch] = useState("");
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (user.role !== "retailer") {
      router.replace("/network");
    }
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    // Retailers only — upline roles redirect to /network. Customer CRM is placeholder.
    setLoading(false);
    setDownline([]);
  }, [accessToken]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return downline;
    return downline.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.mobile.includes(q) ||
        c.uid.toLowerCase().includes(q),
    );
  }, [downline, search]);

  if (!hydrated || !accessToken) return null;

  const active = downline.filter((d) => d.isActive).length;
  const kycDone = downline.filter((d) => d.kycStatus === "verified").length;
  const avgBal =
    downline.length === 0
      ? 0
      : downline.reduce((s, d) => s + (parseFloat(d.mainBalance) || 0), 0) / downline.length;

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              {isRetailer ? "Customers" : "Network"}
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              {isRetailer
                ? "End-customer list coming soon"
                : `Your downline as ${role.label}`}
            </p>
          </div>
        </div>

        {isRetailer ? (
          <div
            className="rounded-2xl border bg-white px-6 py-16 text-center"
            style={{ borderColor: B.border }}
          >
            <p className="text-lg font-semibold" style={{ color: B.blue }}>
              Customers coming soon
            </p>
            <p className="mt-2 text-sm" style={{ color: B.muted }}>
              Retailer end-customer CRM will appear here. Use Services to run transactions.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Total Partners", value: `${downline.length}`, col: B.blue },
                { label: "Active", value: `${active}`, col: B.green },
                { label: "KYC Verified", value: `${kycDone}`, col: B.blue },
                { label: "Avg. Balance", value: formatInr(avgBal), col: B.green },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
                    {s.label}
                  </div>
                  <div className="text-2xl font-bold" style={{ color: s.col }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
              <div className="relative max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: B.muted }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, mobile, or UID..."
                  className="w-full rounded-xl border py-2 pl-9 pr-4 text-sm focus:outline-none"
                  style={{ borderColor: B.border, background: B.secondary, color: B.blue }}
                />
              </div>
            </div>

            {loading ? (
              <p className="py-8 text-center text-sm" style={{ color: B.muted }}>
                Loading…
              </p>
            ) : shown.length === 0 ? (
              <p className="py-8 text-center text-sm" style={{ color: B.muted }}>
                No downline partners found
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
                <table className="w-full text-sm">
                  <thead style={{ background: B.secondary }}>
                    <tr>
                      {["Partner", "Mobile", "Role", "KYC", "Balance", "Status"].map((h) => (
                        <th
                          key={h}
                          className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${
                            h === "Balance" ? "text-right" : "text-left"
                          }`}
                          style={{ color: B.muted }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => (
                      <tr key={c.id} className="border-b hover:bg-secondary/30" style={{ borderColor: B.border }}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold text-white"
                              style={{ background: B.badgeGrad }}
                            >
                              {initials(c.name)}
                            </div>
                            <div>
                              <div className="font-bold" style={{ color: B.blue }}>
                                {c.name}
                              </div>
                              <div className="text-xs" style={{ color: B.muted }}>
                                {c.uid}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: B.muted }}>
                            <Phone size={10} /> {c.mobile}
                          </span>
                        </td>
                        <td className="px-5 py-3 capitalize" style={{ color: B.muted }}>
                          {c.role.replace(/_/g, " ")}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize"
                            style={
                              c.kycStatus === "verified"
                                ? { background: `${B.green}15`, color: B.green }
                                : { background: `${B.blue}12`, color: B.blue }
                            }
                          >
                            {c.kycStatus}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-bold" style={{ color: B.green }}>
                          {formatInr(c.mainBalance)}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={
                              c.isActive
                                ? { background: `${B.green}15`, color: B.green }
                                : { background: "#DC262615", color: "#DC2626" }
                            }
                          >
                            {c.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
