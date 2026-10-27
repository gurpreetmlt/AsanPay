"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronDown,
  ShieldCheck,
  LogOut,
  Bell,
  Menu,
  AlertTriangle,
  UserCheck,
  IndianRupee,
  LifeBuoy,
} from "lucide-react";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { ThemeTabs } from "@/components/theme/ThemeTabs";
import { fetchApi } from "@/lib/api";
import {
  useAdminAlerts,
  type AdminAlertNotification,
} from "@/components/layout/AdminAlertsProvider";
import { AlertCountBadge } from "@/components/layout/AlertCountBadge";

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
  { q: "fund", href: "/treasury/bank?tab=fund-requests", label: "Fund requests" },
  { q: "settlement", href: "/settlements", label: "Agent bank accounts" },
  { q: "agent bank", href: "/settlements", label: "Agent bank accounts" },
  { q: "deposit", href: "/treasury/bank", label: "Bank & deposits" },
  { q: "bank", href: "/treasury/bank", label: "Bank & deposits" },
  { q: "banking", href: "/treasury/bank?tab=bank-accounts", label: "Bank accounts" },
  { q: "treasury", href: "/treasury", label: "Treasury" },
  { q: "bank entries", href: "/treasury/bank?tab=bank-entries", label: "Bank entries" },
  { q: "capital", href: "/treasury/bank?tab=bank-entries", label: "Bank entries" },
  { q: "reconciliation", href: "/treasury/bank?tab=reconciliation", label: "Bank reconciliation" },
  { q: "statement", href: "/treasury/bank?tab=reconciliation", label: "Bank reconciliation" },
  { q: "van", href: "/treasury/bank?tab=virtual-accounts", label: "Virtual accounts" },
  { q: "passbook", href: "/passbook", label: "Balance statement" },
  { q: "statement", href: "/passbook", label: "Balance statement" },
  { q: "reconcil", href: "/reconciliation", label: "Txn reconciliation" },
  { q: "recon adjust", href: "/recon-adjustments", label: "Recon adjustments" },
  { q: "adjustment", href: "/recon-adjustments", label: "Recon adjustments" },
  { q: "badge", href: "/site-control", label: "Services & badges" },
  { q: "service", href: "/site-control", label: "Services & badges" },
  { q: "provider", href: "/developer-options/providers", label: "Providers & routing" },
  { q: "routing", href: "/developer-options/providers", label: "Providers & routing" },
  { q: "stuck", href: "/recovery-workbench", label: "Stuck & recovery" },
  { q: "promo", href: "/promotions", label: "Promotions" },
  { q: "announcement", href: "/announcements", label: "Announcements" },
  { q: "audit", href: "/audit-logs", label: "Audit log" },
  { q: "safety", href: "/developer-options/safety", label: "Safety" },
  { q: "rate card", href: "/tax-commission/rate-card", label: "Rate card" },
  { q: "share", href: "/tax-commission/rate-card", label: "Rate card (share %)" },
  { q: "provider income", href: "/tax-commission/rate-card", label: "Rate card (provider income)" },
  { q: "commission", href: "/tax-commission/rate-card", label: "Commission · Rate card" },
  { q: "payout", href: "/tax-commission/payouts", label: "Commission payouts" },
  { q: "underwater", href: "/tax-commission/rate-card?view=loss", label: "Rate card · Loss & missing" },
  { q: "loss", href: "/tax-commission/rate-card?view=loss", label: "Rate card · Loss & missing" },
  { q: "tax", href: "/tax-commission/tax", label: "Tax settings" },
  { q: "gst", href: "/tax-commission/tax", label: "Tax settings" },
  { q: "tds", href: "/tax-commission/registers", label: "Tax registers" },
  { q: "register", href: "/tax-commission/registers", label: "Tax registers" },
  { q: "schemes", href: "/tax-commission/schemes", label: "Schemes (advanced)" },
  { q: "what-if", href: "/tax-commission/rate-card", label: "Rate card · Preview" },
  { q: "ca pack", href: "/tax-commission/ca-pack", label: "CA month pack" },
  { q: "pan", href: "/tax-commission/pan-gaps", label: "PAN gaps" },
  { q: "rate audit", href: "/tax-commission/rate-audit", label: "Rate history" },
  { q: "rate history", href: "/tax-commission/rate-audit", label: "Rate history" },
  { q: "commission recon", href: "/tax-commission/recon", label: "Commission check" },
  { q: "commission check", href: "/tax-commission/recon", label: "Commission check" },
  { q: "month lock", href: "/tax-commission/month-lock", label: "Month lock" },
  { q: "override", href: "/tax-commission/overrides", label: "Agent custom rates" },
  { q: "custom rate", href: "/tax-commission/overrides", label: "Agent custom rates" },
  { q: "calculator", href: "/tax-commission/rate-card", label: "Rate card · Preview" },
  { q: "service charge", href: "/service-charges", label: "Customer fees" },
  { q: "customer fee", href: "/service-charges", label: "Customer fees" },
  { q: "support", href: "/support-tickets", label: "Support tickets" },
  { q: "ticket", href: "/support-tickets", label: "Support tickets" },
  { q: "dispute", href: "/disputes", label: "Disputes" },
  { q: "risk", href: "/risk-alerts", label: "Risk alerts" },
  { q: "recovery", href: "/recovery-workbench", label: "Stuck & recovery" },
  { q: "device", href: "/device-repairs", label: "Device repairs" },
  { q: "site", href: "/site-control", label: "Services & badges" },
  { q: "platform", href: "/platform-settings", label: "Support contacts" },
  { q: "contact", href: "/platform-settings", label: "Support contacts" },
  { q: "care", href: "/platform-settings", label: "Support contacts" },
  { q: "nodal", href: "/platform-settings", label: "Support contacts" },
  { q: "whatsapp", href: "/whatsapp", label: "WhatsApp inbox" },
  { q: "whatsapp", href: "/platform-settings", label: "Support contacts" },
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

function notifIcon(type: AdminAlertNotification["type"]) {
  if (type === "kyc_pending") return UserCheck;
  if (type === "fund_request") return IndianRupee;
  if (type === "pan_gap") return AlertTriangle;
  return LifeBuoy;
}

function formatRelativeTime(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function AdminHeader({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { badges, notifications, refresh } = useAdminAlerts();

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
        categories: {
          categoryName: string;
          providers: { providerName: string; isActive: boolean; successRate: number | null }[];
        }[];
      }>("/admin/providers");
      const alerts: UnhealthyProvider[] = [];
      for (const cat of data.categories) {
        for (const p of cat.providers) {
          if (p.isActive && p.successRate !== null && p.successRate < HEALTH_ALERT_THRESHOLD) {
            alerts.push({
              categoryName: cat.categoryName,
              providerName: p.providerName,
              successRate: p.successRate,
            });
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

  const qTrim = query.trim();
  const matches = qTrim
    ? [
        {
          href: `/users?q=${encodeURIComponent(qTrim)}`,
          label: `Search agents: ${qTrim}`,
          q: "uid mobile name email agents users",
        },
        ...QUICK_ROUTES.filter(
          (r, i, all) =>
            (r.q.includes(qTrim.toLowerCase()) || r.label.toLowerCase().includes(qTrim.toLowerCase())) &&
            all.findIndex(
              (o) =>
                o.href === r.href &&
                (o.q.includes(qTrim.toLowerCase()) || o.label.toLowerCase().includes(qTrim.toLowerCase())),
            ) === i,
        ),
      ]
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

  const bellCount =
    badges.kycPending +
    badges.fundRequestsPending +
    badges.supportTicketsOpen +
    (badges.settlementBanksPending ?? 0) +
    unhealthy.length;

  return (
    <header
      className="sticky top-0 z-30 flex flex-shrink-0 items-center gap-3 border-b px-4 md:gap-4 md:px-6"
      style={{ height: 68, borderColor: border, background: headerBg }}
    >
      {onOpenMobileNav ? (
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="icon-tooltip flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:hidden"
          style={{ background: searchBg, color: textMuted }}
          aria-label="Open menu"
          data-tooltip="Open menu"
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
            placeholder="Search pages · UID, mobile, name…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: textPrimary }}
          />
        </div>
        {searchOpen && matches.length > 0 ? (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border shadow-lg"
            style={{ borderColor: border, background: headerBg }}
          >
            <p
              className="px-4 pt-2.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: textMuted }}
            >
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
                  e.currentTarget.style.background = `${B.blueLight}12`;
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
            onClick={() => {
              setNotifOpen((v) => !v);
              if (!notifOpen) void refresh();
            }}
            className="icon-tooltip relative flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: searchBg }}
            aria-label="Notifications"
            data-tooltip="Notifications"
          >
            <Bell size={17} style={{ color: textPrimary }} />
            {bellCount > 0 ? (
              <span className="pointer-events-none absolute -right-1 -top-1 flex">
                <AlertCountBadge count={bellCount} />
              </span>
            ) : (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: B.green }} />
            )}
          </button>

          {notifOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,24rem)] overflow-hidden rounded-2xl border shadow-xl"
              style={{ borderColor: border, background: headerBg }}
            >
              <div
                className="flex items-center justify-between border-b px-4 py-3"
                style={{ borderColor: border }}
              >
                <div>
                  <p className="text-sm font-bold" style={{ color: textPrimary }}>
                    Notifications
                  </p>
                  <p className="text-[11px]" style={{ color: textMuted }}>
                    Pending KYC, funds, banks and tickets
                  </p>
                </div>
                {bellCount > 0 ? <AlertCountBadge count={bellCount} /> : null}
              </div>

              <div className="max-h-[min(70vh,28rem)] space-y-2 overflow-y-auto p-3">
                {notifications.length === 0 && unhealthy.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm" style={{ color: textMuted }}>
                    No pending alerts
                  </p>
                ) : null}

                {notifications.map((n) => {
                  const Icon = notifIcon(n.type);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onMouseDown={() => {
                        setNotifOpen(false);
                        router.push(n.href);
                      }}
                      className="flex w-full gap-3 rounded-xl border p-3 text-left transition hover:opacity-95"
                      style={{
                        borderColor: border,
                        background: "var(--admin-bg)",
                      }}
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background:
                            n.type === "kyc_pending"
                              ? "rgba(220,38,38,0.12)"
                              : n.type === "fund_request" || n.type === "pan_gap"
                                ? "rgba(217,119,6,0.14)"
                                : "rgba(42,92,221,0.12)",
                          color:
                            n.type === "kyc_pending"
                              ? "#DC2626"
                              : n.type === "fund_request" || n.type === "pan_gap"
                                ? "#D97706"
                                : B.blueLight,
                        }}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-snug" style={{ color: textPrimary }}>
                            {n.title}
                          </p>
                          <span className="shrink-0 text-[10px] font-medium" style={{ color: textMuted }}>
                            {formatRelativeTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-snug" style={{ color: textMuted }}>
                          {n.body}
                        </p>
                        {n.type === "kyc_pending" ? (
                          <span
                            className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: "rgba(220,38,38,0.12)", color: "#DC2626" }}
                          >
                            Pending KYC
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}

                {unhealthy.map((u, i) => (
                  <button
                    key={`health-${i}`}
                    type="button"
                    onMouseDown={() => {
                      setNotifOpen(false);
                      router.push("/developer-options/providers");
                    }}
                    className="flex w-full gap-3 rounded-xl border p-3 text-left"
                    style={{ borderColor: border, background: "var(--admin-bg)" }}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: "rgba(220,38,38,0.12)", color: "#DC2626" }}
                    >
                      <AlertTriangle size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>
                        Provider health alert
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: textMuted }}>
                        {u.providerName} — {u.categoryName} · {u.successRate}% success
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {badges.kycPending > 0 ? (
                <div className="border-t p-3" style={{ borderColor: border }}>
                  <button
                    type="button"
                    onMouseDown={() => {
                      setNotifOpen(false);
                      router.push("/kyc");
                    }}
                    className="admin-btn-primary w-full rounded-xl py-2.5 text-sm font-semibold"
                  >
                    Open KYC Queue ({badges.kycPending})
                  </button>
                </div>
              ) : null}
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
