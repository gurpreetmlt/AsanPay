"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AdminShell } from "@/components/layout/AdminShell";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface CatalogService {
  id: string;
  code: string;
  name: string;
  badge: string | null;
  isActive: boolean;
  displayOrder: number;
  minAmount: string | null;
  maxAmount: string | null;
}

interface CatalogCategory {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  isActive: boolean;
  services: CatalogService[];
}

interface ServiceDraft {
  badge: string;
  isActive: boolean;
  saving: boolean;
}

export default function SiteControlPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ServiceDraft>>({});
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState<Record<string, boolean>>({});
  // Policy Engine Lite (2026-07-21) — min/max transaction amount per service. Already enforced
  // live in executeServiceTxn; this is just the admin-editable surface for it. Independent of
  // the badge/isActive draft flow above so it can't accidentally interfere with that save path.
  const [limitDrafts, setLimitDrafts] = useState<Record<string, { min: string; max: string; saving: boolean }>>({});

  function limitFor(s: CatalogService) {
    return limitDrafts[s.id] ?? { min: s.minAmount ?? "", max: s.maxAmount ?? "", saving: false };
  }

  async function saveLimits(s: CatalogService, min: string, max: string) {
    setLimitDrafts((prev) => ({ ...prev, [s.id]: { min, max, saving: true } }));
    try {
      await api.patch(`/admin/catalog/services/${s.id}`, {
        minAmount: min.trim() || null,
        maxAmount: max.trim() || null,
      });
      setCategories((prev) =>
        prev.map((c) => ({
          ...c,
          services: c.services.map((svc) =>
            svc.id === s.id ? { ...svc, minAmount: min.trim() || null, maxAmount: max.trim() || null } : svc,
          ),
        })),
      );
      toast.success(`${s.name}: limits saved`);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Save failed";
      toast.error(message);
    } finally {
      setLimitDrafts((prev) => ({ ...prev, [s.id]: { min, max, saving: false } }));
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<CatalogCategory[]>("/admin/catalog");
      setCategories(data);
      const next: Record<string, ServiceDraft> = {};
      for (const c of data) {
        for (const s of c.services) {
          next[s.id] = { badge: s.badge ?? "", isActive: s.isActive, saving: false };
        }
      }
      setDrafts(next);
    } catch {
      toast.error("Failed to load catalog");
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

  function updateDraft(id: string, patch: Partial<ServiceDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function patchLocalService(id: string, patch: Partial<Pick<CatalogService, "badge" | "isActive">>) {
    setCategories((prev) =>
      prev.map((c) => ({
        ...c,
        services: c.services.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      })),
    );
  }

  /** Save badge text only (single Save button). */
  async function saveBadge(id: string) {
    const d = drafts[id];
    if (!d) return;
    updateDraft(id, { saving: true });
    try {
      const badge = d.badge.trim();
      await api.patch(`/admin/catalog/services/${id}`, {
        badge: badge.length ? badge : null,
        isActive: d.isActive,
      });
      patchLocalService(id, { badge: badge.length ? badge : null });
      toast.success("Badge saved");
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Save failed";
      toast.error(message);
    } finally {
      updateDraft(id, { saving: false });
    }
  }

  /** Toggle status — auto-saves immediately. */
  async function toggleActive(id: string, isActive: boolean) {
    const d = drafts[id];
    if (!d) return;
    const prevActive = d.isActive;
    updateDraft(id, { isActive, saving: true });
    try {
      const badge = d.badge.trim();
      await api.patch(`/admin/catalog/services/${id}`, {
        badge: badge.length ? badge : null,
        isActive,
      });
      patchLocalService(id, { isActive });
      toast.success(isActive ? "Service On" : "Service Off");
    } catch (err) {
      updateDraft(id, { isActive: prevActive });
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Toggle failed";
      toast.error(message);
    } finally {
      updateDraft(id, { saving: false });
    }
  }

  /** Clear one service badge — auto-saves. */
  async function clearServiceBadge(id: string) {
    const d = drafts[id];
    if (!d) return;
    const prevBadge = d.badge;
    updateDraft(id, { badge: "", saving: true });
    try {
      await api.patch(`/admin/catalog/services/${id}`, {
        badge: null,
        isActive: d.isActive,
      });
      patchLocalService(id, { badge: null });
      toast.success("Badge Off");
    } catch (err) {
      updateDraft(id, { badge: prevBadge });
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Clear failed";
      toast.error(message);
    } finally {
      updateDraft(id, { saving: false });
    }
  }

  async function clearCategoryBadges(cat: CatalogCategory) {
    if (cat.services.length === 0) return;
    const withBadge = cat.services.filter((s) => {
      const b = (drafts[s.id]?.badge ?? s.badge ?? "").trim();
      return b.length > 0;
    });
    if (withBadge.length === 0) {
      toast("No badges to clear");
      return;
    }

    setBulkBusy((prev) => ({ ...prev, [cat.id]: true }));
    const snapshot = withBadge.map((s) => ({
      id: s.id,
      isActive: drafts[s.id]?.isActive ?? s.isActive,
    }));

    setDrafts((prev) => {
      const next = { ...prev };
      for (const item of snapshot) {
        const cur = next[item.id];
        if (!cur) continue;
        next[item.id] = { ...cur, badge: "", saving: true };
      }
      return next;
    });

    const results = await Promise.allSettled(
      snapshot.map(async (item) => {
        await api.patch(`/admin/catalog/services/${item.id}`, {
          badge: null,
          isActive: item.isActive,
        });
        return item.id;
      }),
    );

    const okIds = new Set(
      results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value),
    );
    const failCount = results.length - okIds.size;

    setCategories((prev) =>
      prev.map((c) =>
        c.id !== cat.id
          ? c
          : {
              ...c,
              services: c.services.map((s) => (okIds.has(s.id) ? { ...s, badge: null } : s)),
            },
      ),
    );

    setDrafts((prev) => {
      const next = { ...prev };
      for (const item of snapshot) {
        const cur = next[item.id];
        if (!cur) continue;
        next[item.id] = {
          ...cur,
          badge: okIds.has(item.id) ? "" : cur.badge,
          saving: false,
        };
      }
      return next;
    });

    setBulkBusy((prev) => ({ ...prev, [cat.id]: false }));
    if (failCount === 0) toast.success(`${cat.name}: all badges Off`);
    else toast.error(`${failCount} badge(s) failed`);
  }

  async function setCategoryActive(cat: CatalogCategory, isActive: boolean) {
    if (cat.services.length === 0) return;
    setBulkBusy((prev) => ({ ...prev, [cat.id]: true }));

    const snapshot = cat.services.map((s) => {
      const d = drafts[s.id];
      const badgeRaw = (d?.badge ?? s.badge ?? "").trim();
      return { id: s.id, badge: badgeRaw.length ? badgeRaw : null };
    });

    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of cat.services) {
        const cur = next[s.id] ?? { badge: s.badge ?? "", isActive: s.isActive, saving: false };
        next[s.id] = { ...cur, isActive, saving: true };
      }
      return next;
    });

    const results = await Promise.allSettled(
      snapshot.map(async (item) => {
        await api.patch(`/admin/catalog/services/${item.id}`, {
          badge: item.badge,
          isActive,
        });
        return item.id;
      }),
    );

    const okIds = new Set(
      results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value),
    );
    const failCount = results.length - okIds.size;

    setCategories((prev) =>
      prev.map((c) =>
        c.id !== cat.id
          ? c
          : {
              ...c,
              services: c.services.map((s) => (okIds.has(s.id) ? { ...s, isActive } : s)),
            },
      ),
    );

    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of cat.services) {
        const cur = next[s.id];
        if (!cur) continue;
        next[s.id] = {
          ...cur,
          isActive: okIds.has(s.id) ? isActive : cur.isActive,
          saving: false,
        };
      }
      return next;
    });

    setBulkBusy((prev) => ({ ...prev, [cat.id]: false }));
    if (failCount === 0) toast.success(isActive ? `${cat.name}: all On` : `${cat.name}: all Off`);
    else toast.error(`${failCount} service(s) failed`);
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            Service Badges
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Toggle auto-saves. Badge text — edit then tap Save. Badge Off clears instantly.
          </p>
        </div>

        {loading && (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading catalog…
          </p>
        )}

        {!loading &&
          categories.map((cat) => {
            const busy = Boolean(bulkBusy[cat.id]);
            const anyOn = cat.services.some((s) => (drafts[s.id]?.isActive ?? s.isActive) === true);
            return (
              <section key={cat.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-semibold" style={{ color: B.blue }}>
                      {cat.name}
                    </h2>
                    <span className="font-mono text-xs" style={{ color: B.muted }}>
                      {cat.code}
                    </span>
                  </div>
                  {cat.services.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void clearCategoryBadges(cat)}
                        className="rounded-xl border-2 px-3.5 py-1.5 text-sm font-semibold disabled:opacity-50"
                        style={{ borderColor: B.border, color: B.muted, background: "var(--admin-card)" }}
                      >
                        Badges Off All
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setCategoryActive(cat, false)}
                        className="rounded-xl border-2 px-3.5 py-1.5 text-sm font-semibold disabled:opacity-50"
                        style={{ borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
                      >
                        {busy && anyOn ? "Saving…" : "Off All"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setCategoryActive(cat, true)}
                        className="rounded-xl px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: B.badgeGrad }}
                      >
                        {busy && !anyOn ? "Saving…" : "On All"}
                      </button>
                    </div>
                  ) : null}
                </div>

                {cat.services.length === 0 ? (
                  <p className="text-sm" style={{ color: B.muted }}>
                    No services
                  </p>
                ) : (
                  <div
                    className="overflow-hidden rounded-2xl border bg-[var(--admin-card)]"
                    style={{ borderColor: B.border }}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead>
                          <tr
                            className="border-b text-xs uppercase tracking-wider"
                            style={{
                              borderColor: B.border,
                              background: B.secondary,
                              color: B.muted,
                            }}
                          >
                            <th className="px-4 py-3 font-semibold">Service</th>
                            <th className="px-4 py-3 font-semibold">Code</th>
                            <th className="px-4 py-3 font-semibold">Badge</th>
                            <th className="px-4 py-3 font-semibold">Limits (₹)</th>
                            <th className="px-4 py-3 text-right font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cat.services.map((s) => {
                            const d =
                              drafts[s.id] ?? {
                                badge: s.badge ?? "",
                                isActive: s.isActive,
                                saving: false,
                              };
                            const badgeDirty = d.badge.trim() !== (s.badge ?? "").trim();
                            return (
                              <tr
                                key={s.id}
                                className="border-b last:border-0"
                                style={{ borderColor: B.border }}
                              >
                                <td className="px-4 py-3 font-medium" style={{ color: B.blue }}>
                                  {s.name}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs" style={{ color: B.muted }}>
                                  {s.code}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex max-w-[280px] items-center gap-2">
                                    <input
                                      value={d.badge}
                                      onChange={(e) => updateDraft(s.id, { badge: e.target.value })}
                                      onBlur={() => {
                                        if (badgeDirty && !d.saving && !busy) void saveBadge(s.id);
                                      }}
                                      placeholder="Flat 1%, NEW…"
                                      maxLength={20}
                                      disabled={d.saving || busy}
                                      className="w-full rounded-xl border-2 bg-[var(--admin-bg)] px-3 py-2 text-sm outline-none disabled:opacity-50"
                                      style={{ borderColor: B.border, color: B.blue }}
                                    />
                                    <button
                                      type="button"
                                      disabled={d.saving || busy || !d.badge.trim()}
                                      onClick={() => void clearServiceBadge(s.id)}
                                      className="shrink-0 rounded-lg border px-2.5 py-2 text-xs font-semibold disabled:opacity-40"
                                      style={{ borderColor: B.border, color: B.muted }}
                                      title="Clear badge"
                                    >
                                      Badge Off
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {(() => {
                                    const lim = limitFor(s);
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={lim.min}
                                          onChange={(e) =>
                                            setLimitDrafts((prev) => ({ ...prev, [s.id]: { ...lim, min: e.target.value } }))
                                          }
                                          onBlur={() => {
                                            if (lim.min !== (s.minAmount ?? "") || lim.max !== (s.maxAmount ?? "")) {
                                              void saveLimits(s, lim.min, lim.max);
                                            }
                                          }}
                                          placeholder="Min"
                                          disabled={lim.saving}
                                          className="w-16 rounded-lg border-2 bg-[var(--admin-bg)] px-2 py-1.5 text-xs outline-none disabled:opacity-50"
                                          style={{ borderColor: B.border, color: B.blue }}
                                        />
                                        <span className="text-xs" style={{ color: B.muted }}>
                                          –
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={lim.max}
                                          onChange={(e) =>
                                            setLimitDrafts((prev) => ({ ...prev, [s.id]: { ...lim, max: e.target.value } }))
                                          }
                                          onBlur={() => {
                                            if (lim.min !== (s.minAmount ?? "") || lim.max !== (s.maxAmount ?? "")) {
                                              void saveLimits(s, lim.min, lim.max);
                                            }
                                          }}
                                          placeholder="Max"
                                          disabled={lim.saving}
                                          className="w-16 rounded-lg border-2 bg-[var(--admin-bg)] px-2 py-1.5 text-xs outline-none disabled:opacity-50"
                                          style={{ borderColor: B.border, color: B.blue }}
                                        />
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-3">
                                    <div className="flex items-center gap-2">
                                      <ToggleSwitch
                                        checked={d.isActive}
                                        onChange={(next) => void toggleActive(s.id, next)}
                                        disabled={d.saving || busy}
                                        label={`${s.name} ${d.isActive ? "on" : "off"}`}
                                      />
                                      <span
                                        className="hidden text-xs font-semibold sm:inline"
                                        style={{ color: d.isActive ? B.green : B.muted }}
                                      >
                                        {d.isActive ? "On" : "Off"}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={d.saving || busy || !badgeDirty}
                                      onClick={() => void saveBadge(s.id)}
                                      className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                                      style={{ background: B.badgeGrad }}
                                    >
                                      {d.saving ? "…" : "Save"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
      </div>
    </AdminShell>
  );
}
