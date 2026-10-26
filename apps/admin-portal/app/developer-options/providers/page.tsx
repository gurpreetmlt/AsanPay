"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ChevronDown, Info, List } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Modal } from "@/components/ui/Modal";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
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

function errMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}

function rowKey(categoryId: string, providerId: string) {
  return `${categoryId}:${providerId}`;
}

export default function ProvidersPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [railInfo, setRailInfo] = useState<RailInfo | null>(null);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
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
    } catch {
      toast.error("Failed to load providers");
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
      toast.success(`${row.providerName}: ${isActive ? "Active" : "Disabled"}`);
    } catch (err) {
      setCategories(prev);
      toast.error(errMessage(err, "Toggle failed"));
    } finally {
      setBusyRow((prev2) => ({ ...prev2, [key]: false }));
    }
  }

  async function savePriority(categoryId: string, row: ProviderRow, priority: number) {
    if (Number.isNaN(priority) || priority < 0) return;
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
      toast.success("Priority saved");
    } catch (err) {
      toast.error(errMessage(err, "Save failed"));
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
      toast.success(`${row.providerName}: ${isActive ? "Active" : "Disabled"}`);
    } catch (err) {
      setCategories(prev);
      toast.error(errMessage(err, "Toggle failed"));
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
      toast.success(`${group.categoryName}: all providers disabled`);
    } catch (err) {
      toast.error(errMessage(err, "Disable-all failed"));
    } finally {
      setBusyGroup((prev) => ({ ...prev, [group.categoryId]: false }));
    }
  }

  const totalProviders = new Set(categories.flatMap((c) => c.providers.map((p) => p.providerId))).size;
  const activeCount = categories.reduce((n, c) => n + c.providers.filter((p) => p.isActive).length, 0);
  const totalCount = categories.reduce((n, c) => n + c.providers.length, 0);

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold" style={{ color: B.blue }}>
          Providers
        </h1>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          One row per rail (AEPS, DMT, BBPS, ...) — toggle, reorder priority, or disable a whole
          rail if its backend is down. Expand a rail to move one biller's provider individually.
        </p>

        {railInfo && (
          <div
            className="mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
          >
            <Info size={16} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold" style={{ color: B.blue }}>
                Nepal / Onboarding
              </span>{" "}
              — mode <code>{railInfo.mode}</code>, active provider{" "}
              <span className="font-medium" style={{ color: B.blue }}>
                {railInfo.activeProviderCode ?? "None — AePS is off"}
              </span>
              . {railInfo.note}
            </div>
          </div>
        )}

        <div
          className="mt-3 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
        >
          {loading
            ? "Loading…"
            : `${categories.length} rails · ${totalProviders} providers · ${activeCount}/${totalCount} mappings active`}
        </div>

        <div className="mt-4 space-y-3">
          {categories.map((group) => {
            const isOpen = !!expanded[group.categoryId];
            const servicesOpen = !!showServices[group.categoryId];
            const activeInGroup = group.providers.filter((p) => p.isActive).length;
            const groupHealthy = activeInGroup > 0;
            return (
              <div
                key={group.categoryId}
                className="overflow-hidden rounded-xl border"
                style={{ borderColor: B.border, background: B.card }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(group.categoryId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleExpand(group.categoryId);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      size={16}
                      className="transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : "none", color: B.muted }}
                    />
                    <span className="font-semibold" style={{ color: B.blue }}>
                      {group.categoryName}
                    </span>
                    <span className="text-xs" style={{ color: B.muted }}>
                      ({group.totalServices} services)
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: groupHealthy ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        color: groupHealthy ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {activeInGroup}/{group.providers.length} active
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busyGroup[group.categoryId] || activeInGroup === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDisableTarget(group);
                      setConfirmText("");
                    }}
                    className="rounded-lg border px-3 py-1 text-xs font-medium disabled:opacity-40"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    Disable all
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t" style={{ borderColor: B.border }}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left" style={{ color: B.muted }}>
                            <th className="px-4 py-2 font-medium">Provider</th>
                            <th className="px-4 py-2 font-medium">Health (24h)</th>
                            <th className="px-4 py-2 font-medium">Priority</th>
                            <th className="px-4 py-2 font-medium">Status (all billers)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.providers.map((p) => {
                            const key = rowKey(group.categoryId, p.providerId);
                            return (
                              <tr key={p.providerId} className="border-t" style={{ borderColor: B.border }}>
                                <td className="px-4 py-2">
                                  <div className="font-medium" style={{ color: B.blue }}>
                                    {p.providerName}
                                    {p.isPrimary && (
                                      <span className="ml-2 text-xs" style={{ color: B.muted }}>
                                        (primary)
                                      </span>
                                    )}
                                  </div>
                                  {!p.adapterRegistered && (
                                    <div className="text-xs" style={{ color: "#dc2626" }}>
                                      No adapter registered for &quot;{p.providerCode}&quot; — misconfigured
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2">
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
                                      {p.successRate}% ({p.totalCalls})
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    defaultValue={p.priority}
                                    disabled={busyRow[key]}
                                    onBlur={(e) => {
                                      const next = Number(e.target.value);
                                      if (next !== p.priority) void savePriority(group.categoryId, p, next);
                                    }}
                                    className="w-16 rounded-md border px-2 py-1 text-sm"
                                    style={{ borderColor: B.border, background: B.bg, color: B.blue }}
                                  />
                                </td>
                                <td className="px-4 py-2">
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

                    {group.services.length > 0 && (
                      <div className="border-t px-4 py-2" style={{ borderColor: B.border }}>
                        <button
                          type="button"
                          onClick={() => toggleShowServices(group.categoryId)}
                          className="flex items-center gap-1.5 text-xs font-medium"
                          style={{ color: B.blueLight }}
                        >
                          <List size={13} />
                          {servicesOpen ? "Hide" : "View"} {group.totalServices} individual services
                        </button>
                      </div>
                    )}

                    {servicesOpen && group.services.length > 0 && (
                      <div className="max-h-[420px] overflow-y-auto border-t" style={{ borderColor: B.border }}>
                        <table className="w-full text-sm">
                          <thead className="sticky top-0" style={{ background: B.card }}>
                            <tr className="text-left" style={{ color: B.muted }}>
                              <th className="px-4 py-2 font-medium">Service</th>
                              <th className="px-4 py-2 font-medium">Provider</th>
                              <th className="px-4 py-2 font-medium">Status</th>
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
                                    <td className="px-4 py-2">
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

          {!loading && categories.length === 0 && (
            <div className="rounded-xl border px-4 py-8 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
              No provider-service mappings yet. Run{" "}
              <code>npm run seed:providers -w @asanpay/backend</code> to see them here.
            </div>
          )}
        </div>
      </div>

      {confirmDisableTarget && (
        <Modal title="Confirm: Disable all providers" onClose={() => setConfirmDisableTarget(null)}>
          <div className="p-1">
            <p className="text-sm" style={{ color: B.muted }}>
              This will disable <strong style={{ color: B.blue }}>every</strong> provider for{" "}
              <strong style={{ color: B.blue }}>{confirmDisableTarget.categoryName}</strong> —{" "}
              {confirmDisableTarget.totalServices} services will stop resolving a provider and any
              new transaction will fail until re-enabled.
            </p>
            <p className="mt-3 text-sm font-medium" style={{ color: B.blue }}>
              Type <span className="font-mono">{confirmDisableTarget.categoryName}</span> to confirm
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: B.border, background: B.bg, color: B.blue }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDisableTarget(null)}
                className="rounded-lg border px-4 py-2 text-sm font-medium"
                style={{ borderColor: B.border, color: B.muted }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmText.trim() !== confirmDisableTarget.categoryName}
                onClick={async () => {
                  await disableAll(confirmDisableTarget);
                  setConfirmDisableTarget(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#dc2626" }}
              >
                Disable all
              </button>
            </div>
          </div>
        </Modal>
      )}

    </AdminShell>
  );
}
