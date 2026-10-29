"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  Banknote,
  Check,
  ChevronDown,
  Fingerprint,
  Landmark,
  LayoutGrid,
  Loader2,
  Power,
  PowerOff,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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

interface Draft {
  badge: string;
  min: string;
  max: string;
}

type RowState = { state: "saving" } | { state: "saved" } | { state: "error"; message: string };
type Filter = "all" | "on" | "off" | "badge";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "on", label: "On" },
  { id: "off", label: "Off" },
  { id: "badge", label: "With badge" },
];

const AMOUNT = /^\d+(\.\d{1,2})?$/;

function categoryIcon(code: string): LucideIcon {
  const c = code.toUpperCase();
  if (c.includes("AEPS") || c.includes("BANKING")) return Fingerprint;
  if (c.includes("DMT") || c.includes("TRANSFER")) return Send;
  if (c.includes("BBPS") || c.includes("BILL")) return Receipt;
  if (c.includes("RECHARGE")) return Smartphone;
  if (c.includes("INSURANCE")) return ShieldCheck;
  if (c.includes("CASH") || c.includes("CMS")) return Banknote;
  if (c.includes("BANK")) return Landmark;
  return LayoutGrid;
}

function errMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}

/** Field-specific problem with a min/max pair, or null when it can be saved. */
function limitProblem(min: string, max: string): string | null {
  const a = min.trim();
  const b = max.trim();
  if (a && !AMOUNT.test(a)) return "Min must be an amount like 100 or 99.50";
  if (b && !AMOUNT.test(b)) return "Max must be an amount like 5000 or 2500.50";
  if (a && b && Number(a) > Number(b)) return "Min cannot be more than Max";
  return null;
}

function StatTile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: B.border, background: B.card }}>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
      >
        <Icon size={18} />
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
          {label}
        </p>
        <p className="text-lg font-bold" style={{ color: B.blue }}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function SiteControlPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmOff, setConfirmOff] = useState<CatalogCategory | null>(null);
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<CatalogCategory[]>("/admin/catalog");
      setCategories(data);
      const next: Record<string, Draft> = {};
      for (const c of data) {
        for (const s of c.services) next[s.id] = { badge: s.badge ?? "", min: s.minAmount ?? "", max: s.maxAmount ?? "" };
      }
      setDrafts(next);
    } catch (err) {
      toast.error(errMessage(err, "Services did not load. Refresh the page."));
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

  useEffect(() => {
    const timers = savedTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  function markRow(id: string, state: RowState | null) {
    clearTimeout(savedTimers.current[id]);
    setRowState((prev) => {
      const next = { ...prev };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });
    if (state?.state === "saved") {
      savedTimers.current[id] = setTimeout(() => markRow(id, null), 2000);
    }
  }

  function patchService(id: string, patch: Partial<CatalogService>) {
    setCategories((prev) =>
      prev.map((c) => ({ ...c, services: c.services.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
    );
  }

  function draftFor(s: CatalogService): Draft {
    return drafts[s.id] ?? { badge: s.badge ?? "", min: s.minAmount ?? "", max: s.maxAmount ?? "" };
  }

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { badge: "", min: "", max: "" }), ...patch } }));
  }

  async function patch(s: CatalogService, body: Record<string, unknown>, local: Partial<CatalogService>, okToast?: string) {
    markRow(s.id, { state: "saving" });
    try {
      await api.patch(`/admin/catalog/services/${s.id}`, body);
      patchService(s.id, local);
      markRow(s.id, { state: "saved" });
      if (okToast) toast.success(okToast);
      return true;
    } catch (err) {
      const message = errMessage(err, `${s.name} was not saved. Try again.`);
      markRow(s.id, { state: "error", message });
      toast.error(message);
      return false;
    }
  }

  async function toggleActive(s: CatalogService, isActive: boolean) {
    patchService(s.id, { isActive });
    const ok = await patch(
      s,
      { isActive, badge: s.badge },
      { isActive },
      `${s.name} turned ${isActive ? "on" : "off"} for agents`,
    );
    if (!ok) patchService(s.id, { isActive: !isActive });
  }

  async function saveBadge(s: CatalogService) {
    const badge = draftFor(s).badge.trim();
    if (badge === (s.badge ?? "").trim()) return;
    await patch(s, { badge: badge || null, isActive: s.isActive }, { badge: badge || null });
  }

  async function clearBadge(s: CatalogService) {
    setDraft(s.id, { badge: "" });
    if (!s.badge) return;
    const ok = await patch(s, { badge: null, isActive: s.isActive }, { badge: null });
    if (!ok) setDraft(s.id, { badge: s.badge });
  }

  async function saveLimits(s: CatalogService) {
    const d = draftFor(s);
    if (d.min.trim() === (s.minAmount ?? "") && d.max.trim() === (s.maxAmount ?? "")) return;
    const problem = limitProblem(d.min, d.max);
    if (problem) {
      markRow(s.id, { state: "error", message: problem });
      return;
    }
    await patch(
      s,
      { minAmount: d.min.trim() || null, maxAmount: d.max.trim() || null },
      { minAmount: d.min.trim() || null, maxAmount: d.max.trim() || null },
    );
  }

  async function bulk(cat: CatalogCategory, mode: "on" | "off" | "clearBadges") {
    const targets =
      mode === "clearBadges" ? cat.services.filter((s) => (s.badge ?? "").trim()) : cat.services.filter((s) => s.isActive !== (mode === "on"));
    if (targets.length === 0) {
      toast(mode === "clearBadges" ? "No badges to clear in this category" : `Every service is already ${mode}`);
      return;
    }
    setBulkBusy((prev) => ({ ...prev, [cat.id]: true }));
    const results = await Promise.allSettled(
      targets.map((s) =>
        api.patch(
          `/admin/catalog/services/${s.id}`,
          mode === "clearBadges" ? { badge: null, isActive: s.isActive } : { badge: s.badge, isActive: mode === "on" },
        ),
      ),
    );
    const okIds = new Set(targets.filter((_, i) => results[i]!.status === "fulfilled").map((s) => s.id));
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== cat.id
          ? c
          : {
              ...c,
              services: c.services.map((s) =>
                !okIds.has(s.id) ? s : mode === "clearBadges" ? { ...s, badge: null } : { ...s, isActive: mode === "on" },
              ),
            },
      ),
    );
    if (mode === "clearBadges") {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of okIds) if (next[id]) next[id] = { ...next[id], badge: "" };
        return next;
      });
    }
    setBulkBusy((prev) => ({ ...prev, [cat.id]: false }));
    const failed = targets.length - okIds.size;
    if (failed === 0) {
      toast.success(
        mode === "clearBadges" ? `${cat.name}: badges cleared` : `${cat.name}: ${okIds.size} services turned ${mode}`,
      );
    } else {
      toast.error(`${failed} of ${targets.length} services in ${cat.name} were not saved. Try again.`);
    }
  }

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      categories.map((cat) => ({
        cat,
        services: cat.services.filter((s) => {
          if (q && !s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q)) return false;
          if (filter === "on") return s.isActive;
          if (filter === "off") return !s.isActive;
          if (filter === "badge") return Boolean((s.badge ?? "").trim());
          return true;
        }),
      })),
    [categories, q, filter],
  );

  const all = categories.flatMap((c) => c.services);
  const onCount = all.filter((s) => s.isActive).length;
  const badgeCount = all.filter((s) => (s.badge ?? "").trim()).length;
  const narrowed = q !== "" || filter !== "all";

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            Services &amp; badges
          </h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: B.muted }}>
            Choose which services agents can see and use, add a short badge on the tile (e.g. NEW, Flat 1%), and set the
            amount range per transaction. Every change saves automatically.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile icon={Power} label="Services on" value={loading ? "…" : `${onCount} of ${all.length}`} tone="#16a34a" />
          <StatTile icon={Tag} label="With a badge" value={loading ? "…" : String(badgeCount)} tone="#D97706" />
          <StatTile icon={LayoutGrid} label="Categories" value={loading ? "…" : String(categories.length)} tone={B.blueLight} />
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center" style={{ borderColor: B.border, background: B.card }}>
          <label className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: B.muted }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a service by name or code"
              className="w-full rounded-xl border bg-[var(--admin-bg)] py-2 pl-9 pr-9 text-sm outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1"
                style={{ color: B.muted }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
          <div className="inline-flex rounded-xl border p-1" style={{ borderColor: B.border, background: B.secondary }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                style={filter === f.id ? { background: B.card, color: B.blueLight, boxShadow: "0 1px 3px rgba(15,23,42,0.08)" } : { color: B.muted }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading services…
          </p>
        ) : null}

        {!loading &&
          visible.map(({ cat, services }) => {
            if (narrowed && services.length === 0) return null;
            const busy = Boolean(bulkBusy[cat.id]);
            const catOn = cat.services.filter((s) => s.isActive).length;
            const isOpen = narrowed || !!open[cat.id];
            const Icon = categoryIcon(cat.code);
            const pill =
              catOn === cat.services.length
                ? { text: "All on", bg: "rgba(34,197,94,0.12)", fg: "#16a34a" }
                : catOn === 0
                  ? { text: "All off", bg: "rgba(239,68,68,0.12)", fg: "#dc2626" }
                  : { text: `${catOn} of ${cat.services.length} on`, bg: "rgba(234,179,8,0.15)", fg: "#b45309" };
            return (
              <section key={cat.id} className="overflow-hidden rounded-2xl border" style={{ borderColor: B.border, background: B.card }}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpen((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={catOn === 0 ? { background: "rgba(220,38,38,0.12)", color: B.danger } : { background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold" style={{ color: B.blue }}>
                          {cat.name}
                        </span>
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: pill.bg, color: pill.fg }}>
                          {pill.text}
                        </span>
                      </span>
                      <span className="block text-xs" style={{ color: B.muted }}>
                        {cat.services.length} services
                        {narrowed ? ` · ${services.length} match` : ""}
                      </span>
                    </span>
                    <ChevronDown
                      size={18}
                      className="ml-auto shrink-0 transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : "none", color: B.muted }}
                    />
                  </button>
                  {cat.services.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void bulk(cat, "clearBadges")}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        style={{ borderColor: B.border, color: B.muted, background: B.card }}
                      >
                        <Tag size={13} /> Clear badges
                      </button>
                      <button
                        type="button"
                        disabled={busy || catOn === 0}
                        onClick={() => setConfirmOff(cat)}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-[#FEF2F2] disabled:opacity-40"
                        style={{ borderColor: "#FCA5A5", color: B.danger }}
                      >
                        <PowerOff size={13} /> Turn all off
                      </button>
                      <button
                        type="button"
                        disabled={busy || catOn === cat.services.length}
                        onClick={() => void bulk(cat, "on")}
                        className="admin-btn-success flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                      >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} Turn all on
                      </button>
                    </div>
                  ) : null}
                </div>

                {isOpen ? (
                  <div className="border-t" style={{ borderColor: B.border }}>
                    {services.length === 0 ? (
                      <p className="px-4 py-4 text-sm" style={{ color: B.muted }}>
                        No services in this category.
                      </p>
                    ) : (
                      <>
                        <div
                          className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_96px] gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide md:grid"
                          style={{ color: B.muted, background: B.secondary }}
                        >
                          <span>Service</span>
                          <span>Badge on the tile</span>
                          <span>Amount per transaction (₹)</span>
                          <span className="text-right">Status</span>
                        </div>
                        {services.map((s) => {
                          const d = draftFor(s);
                          const st = rowState[s.id];
                          const badgePreview = d.badge.trim();
                          const limitErr = limitProblem(d.min, d.max);
                          return (
                            <div
                              key={s.id}
                              className="grid gap-3 border-t px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_96px] md:items-center md:gap-4"
                              style={{ borderColor: B.border, opacity: s.isActive ? 1 : 0.7 }}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <ToggleSwitch
                                  checked={s.isActive}
                                  onChange={(next) => void toggleActive(s, next)}
                                  disabled={busy || st?.state === "saving"}
                                  label={`${s.name} ${s.isActive ? "on" : "off"}`}
                                />
                                <div className="min-w-0">
                                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold" style={{ color: B.blue }}>
                                    <span className="truncate">{s.name}</span>
                                    {badgePreview ? (
                                      <span
                                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase"
                                        style={{ background: "#FEF3C7", color: "#B45309" }}
                                        title="How the badge looks on the agent tile"
                                      >
                                        {badgePreview}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="truncate font-mono text-[11px]" style={{ color: B.muted }}>
                                    {s.code}
                                  </p>
                                </div>
                              </div>

                              <div className="relative">
                                <input
                                  value={d.badge}
                                  onChange={(e) => setDraft(s.id, { badge: e.target.value })}
                                  onBlur={() => void saveBadge(s)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                  }}
                                  placeholder="No badge — type e.g. NEW"
                                  maxLength={20}
                                  disabled={busy}
                                  aria-label={`${s.name} badge`}
                                  className="w-full rounded-xl border bg-[var(--admin-bg)] py-2 pl-3 pr-8 text-sm outline-none disabled:opacity-50"
                                  style={{ borderColor: B.border, color: B.blue }}
                                />
                                {d.badge ? (
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => void clearBadge(s)}
                                    disabled={busy}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 hover:bg-[#FEF2F2]"
                                    style={{ color: B.danger }}
                                    title="Remove badge"
                                    aria-label={`Remove ${s.name} badge`}
                                  >
                                    <X size={14} />
                                  </button>
                                ) : null}
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  {(["min", "max"] as const).map((k, i) => (
                                    <div key={k} className="flex flex-1 items-center gap-2">
                                      {i === 1 ? (
                                        <span className="text-xs" style={{ color: B.muted }}>
                                          to
                                        </span>
                                      ) : null}
                                      <input
                                        inputMode="decimal"
                                        value={d[k]}
                                        onChange={(e) => setDraft(s.id, { [k]: e.target.value.replace(/[^\d.]/g, "") })}
                                        onBlur={() => void saveLimits(s)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        }}
                                        placeholder={k === "min" ? "Min" : "Max"}
                                        aria-label={`${s.name} ${k === "min" ? "minimum" : "maximum"} amount`}
                                        disabled={busy}
                                        className="w-full min-w-0 rounded-xl border bg-[var(--admin-bg)] px-3 py-2 text-sm tabular-nums outline-none disabled:opacity-50"
                                        style={{ borderColor: limitErr ? B.danger : B.border, color: B.blue }}
                                      />
                                    </div>
                                  ))}
                                </div>
                                {limitErr ? (
                                  <p className="mt-1 text-[11px] font-semibold" style={{ color: B.danger }}>
                                    {limitErr}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex items-center justify-between gap-2 md:justify-end">
                                <span className="text-xs font-semibold md:hidden" style={{ color: s.isActive ? "#16a34a" : B.muted }}>
                                  {s.isActive ? "On for agents" : "Off for agents"}
                                </span>
                                {st?.state === "saving" ? (
                                  <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: B.muted }}>
                                    <Loader2 size={12} className="animate-spin" /> Saving…
                                  </span>
                                ) : st?.state === "saved" ? (
                                  <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#16a34a" }}>
                                    <Check size={12} /> Saved
                                  </span>
                                ) : st?.state === "error" ? (
                                  <span className="text-[11px] font-semibold" style={{ color: B.danger }} title={st.message}>
                                    Not saved
                                  </span>
                                ) : (
                                  <span
                                    className="hidden rounded-full px-2 py-0.5 text-[11px] font-bold md:inline"
                                    style={s.isActive ? { background: "rgba(34,197,94,0.12)", color: "#16a34a" } : { background: B.secondary, color: B.muted }}
                                  >
                                    {s.isActive ? "On" : "Off"}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}

        {!loading && narrowed && visible.every((v) => v.services.length === 0) ? (
          <div className="rounded-2xl border px-4 py-8 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
            No service matches “{query || FILTERS.find((f) => f.id === filter)?.label}”.{" "}
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="font-semibold"
              style={{ color: B.blueLight }}
            >
              Show all services
            </button>
          </div>
        ) : null}
      </div>

      {confirmOff ? (
        <ConfirmModal
          title={`Turn off every ${confirmOff.name} service?`}
          message={`${confirmOff.services.filter((s) => s.isActive).length} services disappear from agent web and app until you turn them on again.`}
          confirmLabel="Turn all off"
          tone="danger"
          busy={Boolean(bulkBusy[confirmOff.id])}
          onConfirm={async () => {
            await bulk(confirmOff, "off");
            setConfirmOff(null);
          }}
          onClose={() => {
            if (!bulkBusy[confirmOff.id]) setConfirmOff(null);
          }}
        />
      ) : null}
    </AdminShell>
  );
}
