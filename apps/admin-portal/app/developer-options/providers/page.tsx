"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ChevronDown,
  Fingerprint,
  Info,
  Landmark,
  List,
  Plug,
  PowerOff,
  Receipt,
  Send,
  ShieldCheck,
  Smartphone,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Modal } from "@/components/ui/Modal";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { VerificationsPanel, type VerificationCheck } from "@/components/providers/VerificationsPanel";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface ProviderRow {
  providerServiceId?: string; // present only inside per-service rows
  providerId: string;
  providerCode: string;
  providerName: string;
  isPrimary: boolean;
  priority: number;
  isActive: boolean;
  adapterRegistered: boolean;
  providerServiceIds?: string[]; // present only on category-level rollup rows
  serviceCount?: number;
  successRate?: number | null;
  totalCalls?: number;
}

interface ServiceRow {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  providers: ProviderRow[];
}

interface CategoryGroup {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  totalServices: number;
  providers: ProviderRow[];
  services: ServiceRow[];
}

interface RailInfo {
  mode: string;
  activeProviderCode: string | null;
  note: string;
}

interface ProvidersResponse {
  railInfo: RailInfo;
  categories: CategoryGroup[];
}

type Tab = "rails" | "verifications";

/** Charging route for paid bank checks — shown inside Verifications, not as a rail. */
const VERIFICATION_CATEGORY = "VERIFICATION_RAILS";

function errMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}

function rowKey(categoryId: string, providerId: string) {
  return `${categoryId}:${providerId}`;
}

function railIcon(code: string): LucideIcon {
  const c = code.toUpperCase();
  if (c.includes("AEPS")) return Fingerprint;
  if (c.includes("DMT") || c.includes("TRANSFER")) return Send;
  if (c.includes("BBPS") || c.includes("BILL")) return Receipt;
  if (c.includes("RECHARGE")) return Smartphone;
  if (c.includes("BANK")) return Landmark;
  return Plug;
}

function StatTile({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: B.border, background: B.card }}>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
          {label}
        </p>
        <p className="text-lg font-bold" style={{ color: B.blue }}>
          {value}
        </p>
        <p className="truncate text-[11px]" style={{ color: B.muted }} title={hint}>
          {hint}
        </p>
      </div>
    </div>
  );
}

function statusPill(active: number, total: number) {
  if (total > 0 && active === total) return { text: "All on", bg: "rgba(34,197,94,0.12)", fg: "#16a34a" };
  if (active === 0) return { text: "Off", bg: "rgba(239,68,68,0.12)", fg: "#dc2626" };
  return { text: `${active} of ${total} on`, bg: "rgba(234,179,8,0.15)", fg: "#b45309" };
}

export default function ProvidersPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [railInfo, setRailInfo] = useState<RailInfo | null>(null);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [verChecks, setVerChecks] = useState<VerificationCheck[]>([]);
  const [tab, setTab] = useState<Tab>(() =>
    typeof window !== "undefined" && window.location.hash === "#verifications" ? "verifications" : "rails",
  );
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showServices, setShowServices] = useState<Record<string, boolean>>({});
  const [busyRow, setBusyRow] = useState<Record<string, boolean>>({});
  const [busyGroup, setBusyGroup] = useState<Record<string, boolean>>({});
  const [confirmDisableTarget, setConfirmDisableTarget] = useState<CategoryGroup | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<ProvidersResponse>("/admin/providers");
      setRailInfo(data.railInfo);
      setCategories(data.categories);
    } catch (err) {
      toast.error(errMessage(err, "Providers did not load. Refresh the page."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  function switchTab(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", next === "verifications" ? "#verifications" : "#");
  }

  function toggleExpand(categoryId: string) {
    setExpanded((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  }

  function toggleShowServices(categoryId: string) {
    setShowServices((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  }

  // Category-level bulk toggle — every biller in the rail moves together.
  async function toggleRowActive(categoryId: string, row: ProviderRow, isActive: boolean) {
    const key = rowKey(categoryId, row.providerId);
    setBusyRow((prev) => ({ ...prev, [key]: true }));
    const prev = categories;
    setCategories((cs) =>
      cs.map((c) =>
        c.categoryId !== categoryId
          ? c
          : {
              ...c,
              providers: c.providers.map((p) => (p.providerId === row.providerId ? { ...p, isActive } : p)),
              services: c.services.map((s) => ({
                ...s,
                providers: s.providers.map((p) => (p.providerId === row.providerId ? { ...p, isActive } : p)),
              })),
            },
      ),
    );
    try {
      await api.patch(`/admin/providers/categories/${categoryId}/provider/${row.providerId}`, { isActive });
      toast.success(`${row.providerName} turned ${isActive ? "on" : "off"}`);
    } catch (err) {
      setCategories(prev);
      toast.error(errMessage(err, "The provider switch was not saved. Try again."));
    } finally {
      setBusyRow((prev2) => ({ ...prev2, [key]: false }));
    }
  }

  async function savePriority(categoryId: string, row: ProviderRow, priority: number) {
    if (Number.isNaN(priority) || priority < 0) {
      toast.error("Run order must be 0 or a positive whole number");
      return;
    }
    const key = rowKey(categoryId, row.providerId);
    setBusyRow((prev) => ({ ...prev, [key]: true }));
    try {
      await api.patch(`/admin/providers/categories/${categoryId}/provider/${row.providerId}`, { priority });
      setCategories((cs) =>
        cs.map((c) =>
          c.categoryId !== categoryId
            ? c
            : { ...c, providers: c.providers.map((p) => (p.providerId === row.providerId ? { ...p, priority } : p)) },
        ),
      );
      toast.success("Run order saved");
    } catch (err) {
      toast.error(errMessage(err, "Run order was not saved. Try again."));
    } finally {
      setBusyRow((prev) => ({ ...prev, [key]: false }));
    }
  }

  // Single-biller toggle — one service's provider, independent of the rest of the rail.
  async function toggleServiceRowActive(categoryId: string, serviceId: string, row: ProviderRow, isActive: boolean) {
    if (!row.providerServiceId) return;
    const key = `svc:${row.providerServiceId}`;
    setBusyRow((prev) => ({ ...prev, [key]: true }));
    const prev = categories;
    setCategories((cs) =>
      cs.map((c) =>
        c.categoryId !== categoryId
          ? c
          : {
              ...c,
              services: c.services.map((s) =>
                s.serviceId !== serviceId
                  ? s
                  : { ...s, providers: s.providers.map((p) => (p.providerId === row.providerId ? { ...p, isActive } : p)) },
              ),
            },
      ),
    );
    try {
      await api.patch(`/admin/providers/service/${row.providerServiceId}`, { isActive });
      toast.success(`${row.providerName} turned ${isActive ? "on" : "off"}`);
    } catch (err) {
      setCategories(prev);
      toast.error(errMessage(err, "The provider switch was not saved. Try again."));
    } finally {
      setBusyRow((prev2) => ({ ...prev2, [key]: false }));
    }
  }

  async function disableAll(group: CategoryGroup) {
    setBusyGroup((prev) => ({ ...prev, [group.categoryId]: true }));
    try {
      await api.post(`/admin/providers/categories/${group.categoryId}/disable-all`);
      setCategories((prev) =>
        prev.map((c) =>
          c.categoryId !== group.categoryId
            ? c
            : {
                ...c,
                providers: c.providers.map((p) => ({ ...p, isActive: false })),
                services: c.services.map((s) => ({
                  ...s,
                  providers: s.providers.map((p) => ({ ...p, isActive: false })),
                })),
              },
        ),
      );
      toast.success(`${group.categoryName}: every provider turned off`);
    } catch (err) {
      toast.error(errMessage(err, "The rail was not turned off. Try again."));
    } finally {
      setBusyGroup((prev) => ({ ...prev, [group.categoryId]: false }));
    }
  }

  const rails = categories.filter((c) => c.categoryCode !== VERIFICATION_CATEGORY);
  const verificationRail = categories.find((c) => c.categoryCode === VERIFICATION_CATEGORY);
  const chargeProvider = verificationRail?.providers[0];
  const chargeRoute =
    verificationRail && chargeProvider
      ? {
          providerName: chargeProvider.providerName,
          isActive: verificationRail.providers.some((p) => p.isActive),
          onTurnOn: () => void toggleRowActive(verificationRail.categoryId, chargeProvider, true),
        }
      : null;

  const totalProviders = new Set(rails.flatMap((c) => c.providers.map((p) => p.providerId))).size;
  const activeCount = rails.reduce((n, c) => n + c.providers.filter((p) => p.isActive).length, 0);
  const totalCount = rails.reduce((n, c) => n + c.providers.length, 0);
  const workingRails = rails.filter((c) => c.providers.some((p) => p.isActive)).length;
  const verOn = verChecks.filter((c) => c.on).length;
  const onVerLoaded = useCallback((list: VerificationCheck[]) => setVerChecks(list), []);

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold" style={{ color: B.blue }}>
          Providers &amp; routing
        </h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: B.muted }}>
          Choose which provider handles each service and each verification. When a provider&apos;s backend is down, turn it off
          here — agents get a clear message instead of a failed transaction.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={Workflow}
            label="Service rails"
            value={loading ? "…" : `${workingRails}/${rails.length} working`}
            hint="AePS, DMT, BBPS, banking…"
            tone={workingRails === rails.length ? "#16a34a" : "#dc2626"}
          />
          <StatTile
            icon={Plug}
            label="Provider switches"
            value={loading ? "…" : `${activeCount}/${totalCount} on`}
            hint={`${totalProviders} providers across all rails`}
            tone={B.blueLight}
          />
          <StatTile
            icon={ShieldCheck}
            label="Verifications"
            value={verChecks.length === 0 ? "…" : `${verOn}/${verChecks.length} on`}
            hint="KYC, bank account, AePS / DMT / UPI checks, recharge lookups"
            tone={verChecks.length > 0 && verOn === verChecks.length ? "#16a34a" : "#D97706"}
          />
          <StatTile
            icon={Fingerprint}
            label="AePS & onboarding"
            value={railInfo?.activeProviderCode ?? (railInfo ? "Off" : "…")}
            hint={railInfo ? `Mode ${railInfo.mode} · set by AEPS_PROVIDER_MODE` : ""}
            tone={railInfo?.activeProviderCode ? "#16a34a" : "#dc2626"}
          />
        </div>

        {railInfo?.note ? (
          <div
            className="mt-3 flex items-start gap-2 rounded-xl border px-4 py-2.5 text-xs"
            style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
          >
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>{railInfo.note}</span>
          </div>
        ) : null}

        <div className="mt-5 inline-flex rounded-xl border p-1" style={{ borderColor: B.border, background: B.secondary }} role="tablist">
          {(
            [
              ["rails", "Service rails", Workflow, rails.length],
              ["verifications", "Verifications", ShieldCheck, verChecks.length],
            ] as const
          ).map(([id, label, Icon, count]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(id)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition"
                style={active ? { background: B.card, color: B.blueLight, boxShadow: "0 1px 3px rgba(15,23,42,0.08)" } : { color: B.muted }}
              >
                <Icon size={15} />
                {label}
                {count > 0 ? (
                  <span className="rounded-full px-1.5 text-[11px]" style={{ background: active ? "rgba(42,92,221,0.12)" : B.card }}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className={tab === "verifications" ? "mt-4" : "hidden"}>
          <VerificationsPanel chargeRoute={chargeRoute} onLoaded={onVerLoaded} />
        </div>

        <div className={tab === "rails" ? "mt-4 space-y-3" : "hidden"}>
          <p className="text-xs" style={{ color: B.muted }}>
            One card per rail. Open a rail to switch a provider for every service in it, or open its service list to move a single
            biller. Lower run order is tried first.
          </p>

          {rails.map((group) => {
            const isOpen = !!expanded[group.categoryId];
            const servicesOpen = !!showServices[group.categoryId];
            const activeInGroup = group.providers.filter((p) => p.isActive).length;
            const pill = statusPill(activeInGroup, group.providers.length);
            const RailIcon = railIcon(group.categoryCode);
            return (
              <div
                key={group.categoryId}
                className="overflow-hidden rounded-2xl border"
                style={{ borderColor: activeInGroup === 0 ? "#FCA5A5" : B.border, background: B.card }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(group.categoryId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleExpand(group.categoryId);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={
                      activeInGroup === 0
                        ? { background: "rgba(220,38,38,0.12)", color: B.danger }
                        : { background: "rgba(42,92,221,0.10)", color: B.blueLight }
                    }
                  >
                    <RailIcon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" style={{ color: B.blue }}>
                        {group.categoryName}
                      </span>
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: pill.bg, color: pill.fg }}>
                        {pill.text}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: B.muted }}>
                      {group.totalServices} services · {group.providers.map((p) => p.providerName).join(", ") || "No provider"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyGroup[group.categoryId] || activeInGroup === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDisableTarget(group);
                      setConfirmText("");
                    }}
                    className="hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-[#FEF2F2] disabled:opacity-40 sm:flex"
                    style={{ borderColor: "#FCA5A5", color: B.danger }}
                  >
                    <PowerOff size={13} /> Turn off rail
                  </button>
                  <ChevronDown
                    size={18}
                    className="shrink-0 transition-transform"
                    style={{ transform: isOpen ? "rotate(180deg)" : "none", color: B.muted }}
                  />
                </div>

                {isOpen && (
                  <div className="border-t" style={{ borderColor: B.border }}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs" style={{ color: B.muted, background: B.secondary }}>
                            <th className="px-4 py-2 font-semibold">Provider</th>
                            <th className="px-4 py-2 font-semibold">Success (last 24h)</th>
                            <th className="px-4 py-2 font-semibold">Run order</th>
                            <th className="px-4 py-2 font-semibold">On for every service</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.providers.map((p) => {
                            const key = rowKey(group.categoryId, p.providerId);
                            return (
                              <tr key={p.providerId} className="border-t" style={{ borderColor: B.border }}>
                                <td className="px-4 py-2.5">
                                  <div className="font-medium" style={{ color: B.blue }}>
                                    {p.providerName}
                                    {p.isPrimary && (
                                      <span
                                        className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                                        style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                                      >
                                        Primary
                                      </span>
                                    )}
                                  </div>
                                  {!p.adapterRegistered && (
                                    <div className="text-xs" style={{ color: "#dc2626" }}>
                                      No adapter for &quot;{p.providerCode}&quot; on the backend — calls will fail
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {p.successRate === null || p.successRate === undefined ? (
                                    <span className="text-xs" style={{ color: B.muted }}>
                                      No calls yet
                                    </span>
                                  ) : (
                                    <span
                                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                                      style={{
                                        background:
                                          p.successRate >= 90
                                            ? "rgba(34,197,94,0.12)"
                                            : p.successRate >= 60
                                              ? "rgba(234,179,8,0.15)"
                                              : "rgba(239,68,68,0.12)",
                                        color: p.successRate >= 90 ? "#16a34a" : p.successRate >= 60 ? "#b45309" : "#dc2626",
                                      }}
                                    >
                                      {p.successRate}% of {p.totalCalls} calls
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <input
                                    type="number"
                                    min={0}
                                    defaultValue={p.priority}
                                    disabled={busyRow[key]}
                                    title="Lower number is tried first"
                                    onBlur={(e) => {
                                      const next = Number(e.target.value);
                                      if (next !== p.priority) void savePriority(group.categoryId, p, next);
                                    }}
                                    className="w-16 rounded-md border px-2 py-1 text-sm"
                                    style={{ borderColor: B.border, background: B.bg, color: B.blue }}
                                  />
                                </td>
                                <td className="px-4 py-2.5">
                                  <ToggleSwitch
                                    checked={p.isActive}
                                    disabled={busyRow[key]}
                                    onChange={(next) => void toggleRowActive(group.categoryId, p, next)}
                                    label={`${p.providerName} status`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t px-4 py-2" style={{ borderColor: B.border }}>
                      {group.services.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleShowServices(group.categoryId)}
                          className="flex items-center gap-1.5 text-xs font-semibold"
                          style={{ color: B.blueLight }}
                        >
                          <List size={13} />
                          {servicesOpen ? "Hide" : "Show"} the {group.totalServices} services one by one
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        disabled={busyGroup[group.categoryId] || activeInGroup === 0}
                        onClick={() => {
                          setConfirmDisableTarget(group);
                          setConfirmText("");
                        }}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold disabled:opacity-40 sm:hidden"
                        style={{ borderColor: "#FCA5A5", color: B.danger }}
                      >
                        <PowerOff size={13} /> Turn off rail
                      </button>
                    </div>

                    {servicesOpen && group.services.length > 0 && (
                      <div className="max-h-[420px] overflow-y-auto border-t" style={{ borderColor: B.border }}>
                        <table className="w-full text-sm">
                          <thead className="sticky top-0" style={{ background: B.secondary }}>
                            <tr className="text-left text-xs" style={{ color: B.muted }}>
                              <th className="px-4 py-2 font-semibold">Service</th>
                              <th className="px-4 py-2 font-semibold">Provider</th>
                              <th className="px-4 py-2 font-semibold">On</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.services.map((svc) =>
                              svc.providers.map((p, idx) => {
                                const key = `svc:${p.providerServiceId}`;
                                return (
                                  <tr key={p.providerServiceId} className="border-t" style={{ borderColor: B.border }}>
                                    {idx === 0 && (
                                      <td className="px-4 py-2 align-top font-medium" style={{ color: B.blue }} rowSpan={svc.providers.length}>
                                        {svc.serviceName}
                                      </td>
                                    )}
                                    <td className="px-4 py-2" style={{ color: B.blue }}>
                                      {p.providerName}
                                      {p.isPrimary && (
                                        <span className="ml-2 text-xs" style={{ color: B.muted }}>
                                          (primary)
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2">
                                      <ToggleSwitch
                                        checked={p.isActive}
                                        disabled={busyRow[key]}
                                        onChange={(next) => void toggleServiceRowActive(group.categoryId, svc.serviceId, p, next)}
                                        label={`${svc.serviceName} — ${p.providerName} status`}
                                      />
                                    </td>
                                  </tr>
                                );
                              }),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && rails.length === 0 && (
            <div className="rounded-xl border px-4 py-8 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
              No provider-service mappings yet. Run{" "}
              <code>npm run seed:providers -w @asanpay/backend</code> to see them here.
            </div>
          )}
        </div>
      </div>

      {confirmDisableTarget && (
        <Modal
          title={`Turn off ${confirmDisableTarget.categoryName}?`}
          eyebrow="Every provider in this rail"
          subtitle={`All ${confirmDisableTarget.totalServices} services stop until you turn a provider back on. New transactions fail with a clear message.`}
          onClose={() => setConfirmDisableTarget(null)}
          icon={<PowerOff size={22} />}
          iconTone="red"
        >
          <div className="space-y-3">
            <div className="rounded-2xl border p-3" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
              <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                Type <span className="font-mono" style={{ color: B.blue }}>{confirmDisableTarget.categoryName}</span> to confirm
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </label>
              {confirmText && confirmText.trim() !== confirmDisableTarget.categoryName ? (
                <p className="mt-1.5 text-[11px]" style={{ color: B.danger }}>
                  Does not match — type {confirmDisableTarget.categoryName} exactly
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDisableTarget(null)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
                style={{ borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={confirmText.trim() !== confirmDisableTarget.categoryName || busyGroup[confirmDisableTarget.categoryId]}
                onClick={async () => {
                  await disableAll(confirmDisableTarget);
                  setConfirmDisableTarget(null);
                }}
                className="admin-btn-danger rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Turn off rail
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}
