"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, ShieldCheck, LogOut, Bell, Menu, AlertTriangle } from "lucide-react";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { ThemeTabs } from "@/components/theme/ThemeTabs";
import { fetchApi } from "@/lib/api";

interface UnhealthyProvider {
  categoryName: string;
  providerName: string;
  successRate: number;
}

const HEALTH_POLL_MS = 60_000;
const HEALTH_ALERT_THRESHOLD = 60;

const QUICK_ROUTES = [
  { q: "dashboard", href: "/dashboard", label: "Dashboard" },
  { q: "users", href: "/users", label: "All Users" },
  { q: "super", href: "/users/super-distributors", label: "Super Distributors" },
  { q: "distributor", href: "/users/distributors", label: "Distributors" },
  { q: "retailer", href: "/users/retailers", label: "Retailers" },
  { q: "kyc", href: "/kyc", label: "KYC Queue" },
  { q: "transaction", href: "/transactions", label: "Transactions" },
  { q: "wallet", href: "/wallet", label: "Company balance" },
  { q: "balance", href: "/wallet", label: "Company balance" },
  { q: "fund", href: "/fund-requests", label: "Fund requests" },
  { q: "settlement", href: "/settlements", label: "Settlements" },
  { q: "banking", href: "/banking", label: "Banking" },
  { q: "bank", href: "/banking", label: "Banking" },
  { q: "treasury", href: "/wallet", label: "Company balance" },
  { q: "passbook", href: "/passbook", label: "Balance statement" },
  { q: "statement", href: "/passbook", label: "Balance statement" },
  { q: "reconcil", href: "/reconciliation", label: "Txn reconciliation" },
  { q: "recon adjust", href: "/recon-adjustments", label: "Recon adjustments" },
  { q: "adjustment", href: "/recon-adjustments", label: "Recon adjustments" },
  { q: "badge", href: "/site-control", label: "Service Badges" },
  { q: "commission", href: "/commission", label: "Commissions" },
  { q: "service charge", href: "/service-charges", label: "Service charges" },
  { q: "customer fee", href: "/service-charges", label: "Service charges" },
  { q: "site", href: "/site-control", label: "Service Badges" },
  { q: "platform", href: "/platform-settings", label: "Platform Settings" },
  { q: "care", href: "/platform-settings", label: "Platform Settings" },
  { q: "nodal", href: "/platform-settings", label: "Platform Settings" },
  { q: "whatsapp", href: "/platform-settings", label: "Platform Settings" },
  { q: "treasury", href: "/treasury-settings", label: "Treasury Settings" },
  { q: "dual", href: "/treasury-settings", label: "Treasury Settings" },
];

function displayName(raw?: string | null) {
  return raw ?? "Admin";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AdminHeader({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unhealthy, setUnhealthy] = useState<UnhealthyProvider[]>([]);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const checkHealth = useCallback(async () => {
    try {
      const data = await fetchApi<{
        categories: { categoryName: string; providers: { providerName: string; isActive: boolean; successRate: number | null }[] }[];
      }>("/admin/providers");
      const alerts: UnhealthyProvider[] = [];
      for (const cat of data.categories) {
        for (const p of cat.providers) {
          if (p.isActive && p.successRate !== null && p.successRate < HEALTH_ALERT_THRESHOLD) {
            alerts.push({ categoryName: cat.categoryName, providerName: p.providerName, successRate: p.successRate });
          }
        }
      }
      setUnhealthy(alerts);
    } catch {
      // Silent — this is a background health check, not a user-triggered action.
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const t = setInterval(() => void checkHealth(), HEALTH_POLL_MS);
    return () => clearInterval(t);
  }, [checkHealth]);

  const name = displayName(user?.name);
  const av = initials(name);

  const matches = query.trim()
    ? QUICK_ROUTES.filter(
        (r) =>
          r.q.includes(query.toLowerCase()) ||
          r.label.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
      if (!notifRef.current?.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handleLogout() {
    setProfileOpen(false);
    const { logoutEverywhere } = await import("@/lib/logout");
    await logoutEverywhere();
    window.location.href = "/login";
  }

  const headerBg = "var(--admin-card)";
  const textPrimary = "var(--admin-text)";
  const textMuted = "var(--admin-muted)";
  const searchBg = "var(--admin-bg)";
  const border = "var(--admin-border)";

  return (
    <header
      className="sticky top-0 z-30 flex flex-shrink-0 items-center gap-3 border-b px-4 md:gap-4 md:px-6"
      style={{ height: 68, borderColor: border, background: headerBg }}
    >
      {onOpenMobileNav ? (
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:hidden"
          style={{ background: searchBg, color: textMuted }}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
      ) : null}

      <div className="relative hidden max-w-[400px] flex-1 md:block">
        <div className="flex items-center gap-3 rounded-xl px-4 py-2" style={{ background: searchBg }}>
          <Search size={15} style={{ color: textMuted }} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder="Search pages, users…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: textPrimary }}
          />
        </div>
        {searchOpen && matches.length > 0 ? (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border shadow-lg"
            style={{ borderColor: border, background: headerBg }}
          >
            <p className="px-4 pt-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
              Pages
            </p>
            {matches.map((m) => (
              <button
                key={m.href}
                type="button"
                onMouseDown={() => router.push(m.href)}
                className="block w-full px-4 py-2.5 text-left text-sm"
                style={{ color: textPrimary }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${B.blue}12`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <span className="hidden h-2 w-2 animate-pulse rounded-full sm:block" style={{ background: B.green }} />
        <span className="hidden text-xs sm:inline" style={{ color: textMuted }}>
          Live
        </span>

        <ThemeTabs />

        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: searchBg }}
            aria-label="Notifications"
          >
            <Bell size={17} style={{ color: textPrimary }} />
          </button>
          {unhealthy.length > 0 ? (
            <span
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: "#dc2626" }}
            >
              {unhealthy.length}
            </span>
          ) : (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: B.green }} />
          )}

          {notifOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border shadow-lg"
              style={{ borderColor: border, background: headerBg }}
            >
              <p className="border-b px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: border, color: textMuted }}>
                Provider Health Alerts
              </p>
              {unhealthy.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm" style={{ color: textMuted }}>
                  All providers healthy
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {unhealthy.map((u, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={() => {
                        setNotifOpen(false);
                        router.push("/developer-options/providers");
                      }}
                      className="flex w-full items-start gap-2 border-b px-4 py-2.5 text-left last:border-0"
                      style={{ borderColor: border }}
                    >
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "#dc2626" }} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium" style={{ color: textPrimary }}>
                          {u.providerName} — {u.categoryName}
                        </div>
                        <div className="text-xs" style={{ color: textMuted }}>
                          Success rate {u.successRate}% (below {HEALTH_ALERT_THRESHOLD}%)
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative border-l pl-2 md:pl-3" style={{ borderColor: border }} ref={profileRef}>
          <button type="button" onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white"
              style={{ background: B.badgeGrad }}
            >
              {av}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-bold" style={{ color: textPrimary }}>
                {name}
              </div>
              <div className="text-xs" style={{ color: textMuted }}>
                Platform Admin
              </div>
            </div>
            <ChevronDown
              className={`hidden h-4 w-4 transition sm:block ${profileOpen ? "rotate-180" : ""}`}
              style={{ color: textMuted }}
            />
          </button>

          {profileOpen ? (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border shadow-lg"
              style={{ borderColor: border, background: headerBg }}
            >
              <div className="border-b px-4 py-3" style={{ borderColor: border }}>
                <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: textPrimary }}>
                  <ShieldCheck size={14} style={{ color: B.blueLight }} />
                  {name}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px]" style={{ color: textMuted }}>
                  {user?.uid}
                </p>
              </div>
              <div className="p-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-500 transition hover:bg-red-500/15"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
