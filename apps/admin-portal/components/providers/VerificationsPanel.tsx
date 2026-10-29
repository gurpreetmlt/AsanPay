"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpToLine, GripVertical, ListOrdered, Power, PowerOff, Search, X } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { Modal } from "@/components/ui/Modal";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";

type Section = "kyc" | "bank" | "service" | "recharge";
type ApiRow = {
  code: string;
  providerName: string;
  api: string;
  endpoints: string[];
  cost: string | null;
  position: number;
  enabled: boolean;
  configured: boolean;
  health: { total: number; ok: number } | null;
};
export type VerificationCheck = {
  check: string;
  label: string;
  section: Section;
  usedIn: string[];
  stepOrder: boolean;
  offMessage: string;
  offBehavior: "block" | "skip";
  on: boolean;
  apis: ApiRow[];
};

/** Wallet-charge route for paid bank checks (provider_services under VERIFICATION_RAILS). */
export type ChargeRoute = { providerName: string; isActive: boolean; onTurnOn: () => void } | null;

const SECTIONS: Array<{ id: Section; title: string; hint: string }> = [
  { id: "kyc", title: "Agent KYC", hint: "Runs when an agent signs up" },
  { id: "bank", title: "Bank account", hint: "Runs top to bottom (cheapest first by default) — stops at the first step that confirms the name" },
  { id: "service", title: "Service verifications", hint: "Identity checks inside AePS, DMT and UPI Cash Point" },
  { id: "recharge", title: "Recharge lookups", hint: "Primary runs first; if it fails or returns nothing, the fallback is tried" },
];

const PROVIDER_TONE: Record<string, { bg: string; fg: string }> = {
  BestAPI: { bg: "rgba(124,58,237,0.12)", fg: "#6D28D9" },
  Noble: { bg: "rgba(13,148,136,0.12)", fg: "#0F766E" },
  VyaparAPI: { bg: "rgba(234,88,12,0.12)", fg: "#C2410C" },
};

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

type Pending =
  | { kind: "toggle"; check: VerificationCheck; row: ApiRow; enable: boolean }
  | { kind: "primary"; check: VerificationCheck; row: ApiRow };

type BulkSkip = { check: string; provider: string; reason: string };
type BulkEffect = "change" | "already" | "keeps" | "stops" | "skipped";

const rowKey = (check: string, code: string) => `${check}:${code}`;

function orderLabel(stepOrder: boolean, index: number, total: number): string {
  if (total === 1) return "Only API";
  if (stepOrder) return `Step ${index + 1}`;
  if (index === 0) return "Primary";
  return total === 2 ? "Fallback" : `Fallback ${index}`;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

const EFFECT_PILL: Record<BulkEffect, { text: string; bg: string; fg: string }> = {
  change: { text: "Turns on", bg: "rgba(34,197,94,0.12)", fg: "#16a34a" },
  already: { text: "Already in this state — skipped", bg: B.secondary, fg: B.muted },
  keeps: { text: "Other APIs keep it working", bg: "rgba(34,197,94,0.12)", fg: "#16a34a" },
  stops: { text: "Whole check stops", bg: "rgba(239,68,68,0.12)", fg: "#dc2626" },
  skipped: { text: "Check is skipped in the flow", bg: "rgba(234,179,8,0.15)", fg: "#b45309" },
};

function ProviderBadge({ name }: { name: string }) {
  const t = PROVIDER_TONE[name] ?? { bg: B.secondary, fg: B.muted };
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: t.bg, color: t.fg }}>
      {name}
    </span>
  );
}

export function VerificationsPanel({
  chargeRoute,
  onLoaded,
}: {
  chargeRoute: ChargeRoute;
  onLoaded?: (checks: VerificationCheck[]) => void;
}) {
  const [checks, setChecks] = useState<VerificationCheck[] | null>(null);
  const [provider, setProvider] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState<{ enable: boolean } | null>(null);
  const [orderSection, setOrderSection] = useState<Section | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const dragFrom = useRef<{ check: string; index: number } | null>(null);

  const apply = useCallback(
    (list: VerificationCheck[]) => {
      setChecks(list);
      onLoaded?.(list);
    },
    [onLoaded],
  );

  const load = useCallback(async () => {
    try {
      apply(await fetchApi<VerificationCheck[]>("/admin/verifications"));
    } catch (err) {
      toast.error(errMsg(err, "Verifications did not load. Refresh the page."));
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const reasonError = reason.trim().length < 3 ? "Enter a reason (at least 3 characters)" : null;
  const turnsCheckOff =
    pending?.kind === "toggle" && !pending.enable && pending.check.apis.filter((a) => a.enabled).length === 1;

  async function save() {
    if (!pending || reasonError) return;
    setBusy(true);
    try {
      const res =
        pending.kind === "toggle"
          ? await api.put<{ data: VerificationCheck[]; message?: string }>(
              `/admin/verifications/${pending.check.check}/providers/${pending.row.code}`,
              { enabled: pending.enable, reason: reason.trim() },
            )
          : await api.put<{ data: VerificationCheck[]; message?: string }>(`/admin/verifications/${pending.check.check}/primary`, {
              provider: pending.row.code,
              reason: reason.trim(),
            });
      apply(res.data.data);
      toast.success(res.data.message ?? "Saved");
      setPending(null);
    } catch (err) {
      toast.error(errMsg(err, "The change was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!checks) {
    return (
      <p className="py-6 text-sm" style={{ color: B.muted }}>
        Loading verifications…
      </p>
    );
  }

  const allApis = checks.flatMap((c) => c.apis);
  const providers = [...new Set(allApis.map((a) => a.providerName))];
  const q = query.trim().toLowerCase();
  const matches = (c: VerificationCheck, a: ApiRow) =>
    (provider === "all" || a.providerName === provider) &&
    (!q ||
      c.label.toLowerCase().includes(q) ||
      a.api.toLowerCase().includes(q) ||
      a.endpoints.some((e) => e.toLowerCase().includes(q)) ||
      c.usedIn.some((u) => u.toLowerCase().includes(q)));

  const visible = SECTIONS.flatMap((s) =>
    checks
      .filter((c) => c.section === s.id)
      .flatMap((c) => c.apis.filter((a) => matches(c, a)).map((a) => ({ c, a, key: rowKey(c.check, a.code) }))),
  );
  const picked = visible.filter((v) => selected.has(v.key));
  const allPicked = visible.length > 0 && picked.length === visible.length;
  const togglePickAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const v of visible) {
        if (allPicked) next.delete(v.key);
        else next.add(v.key);
      }
      return next;
    });
  const togglePick = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const bulkGroups = (() => {
    if (!bulk) return [];
    const byCheck = new Map<string, { c: VerificationCheck; rows: ApiRow[] }>();
    for (const { c, a } of picked) {
      const g = byCheck.get(c.check) ?? { c, rows: [] };
      g.rows.push(a);
      byCheck.set(c.check, g);
    }
    return [...byCheck.values()].map(({ c, rows }) => {
      const changing = rows.filter((a) => a.enabled !== bulk.enable);
      const pickedCodes = new Set(rows.map((a) => a.code));
      let effect: BulkEffect;
      if (changing.length === 0) effect = "already";
      else if (bulk.enable) effect = "change";
      else if (c.apis.some((a) => a.enabled && !pickedCodes.has(a.code))) effect = "keeps";
      else effect = c.offBehavior === "skip" ? "skipped" : "stops";
      return { c, rows, changing, effect };
    });
  })();
  const bulkChangeCount = bulkGroups.reduce((n, g) => n + g.changing.length, 0);
  const bulkStops = bulkGroups.filter((g) => g.effect === "stops" || g.effect === "skipped");

  async function saveBulk() {
    if (!bulk || reasonError || bulkChangeCount === 0) return;
    setBusy(true);
    try {
      const res = await api.post<{ data: { checks: VerificationCheck[]; skipped: BulkSkip[] }; message?: string }>(
        "/admin/verifications/bulk-toggle",
        { items: picked.map(({ c, a }) => ({ check: c.check, provider: a.code })), enabled: bulk.enable, reason: reason.trim() },
      );
      const list = res.data.data.checks;
      apply(list);
      toast.success(res.data.message ?? "Saved");
      const skipped = res.data.data.skipped;
      if (skipped.length > 0) {
        const describe = (s: BulkSkip) => {
          const c = list.find((x) => x.check === s.check);
          const a = c?.apis.find((x) => x.code === s.provider);
          return `${c?.label ?? s.check} · ${a?.providerName ?? s.provider}: ${s.reason}`;
        };
        toast(`Skipped ${skipped.length}: ${skipped.slice(0, 3).map(describe).join("; ")}${skipped.length > 3 ? "…" : ""}`, {
          duration: 7000,
        });
      }
      setBulk(null);
      setSelected(new Set());
    } catch (err) {
      toast.error(errMsg(err, "The selected APIs were not changed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const orderable = (s: Section) => checks.some((c) => c.section === s && c.apis.length > 1);
  const orderChecks = orderSection ? checks.filter((c) => c.section === orderSection && c.apis.length > 1) : [];
  const orderChanged = orderChecks.filter((c) => (draft[c.check] ?? []).join() !== c.apis.map((a) => a.code).join());
  const moveInDraft = (check: string, from: number, to: number) =>
    setDraft((d) => ({ ...d, [check]: moveItem(d[check] ?? [], from, to) }));

  function openOrder(section: Section) {
    setReason("");
    setDraft(
      Object.fromEntries(
        checks!.filter((c) => c.section === section && c.apis.length > 1).map((c) => [c.check, c.apis.map((a) => a.code)]),
      ),
    );
    setOrderSection(section);
  }

  async function saveOrder() {
    if (!orderSection || reasonError || orderChanged.length === 0) return;
    setBusy(true);
    try {
      const res = await api.put<{ data: VerificationCheck[]; message?: string }>("/admin/verifications/order", {
        orders: orderChanged.map((c) => ({ check: c.check, order: draft[c.check] })),
        reason: reason.trim(),
      });
      apply(res.data.data);
      toast.success(res.data.message ?? "Order saved");
      setOrderSection(null);
    } catch (err) {
      toast.error(errMsg(err, "The order was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const reasonBlock = (
    <div className="rounded-2xl border p-3" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
      <label className="block text-xs font-semibold" style={{ color: B.muted }}>
        Reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Provider is down since 10 AM"
          className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
          style={{ borderColor: B.border, color: B.blue }}
        />
      </label>
      <p className="mt-1.5 text-[11px]" style={{ color: reason && reasonError ? B.danger : B.muted }}>
        {reason && reasonError ? reasonError : "Saved in the audit log with your name"}
      </p>
    </div>
  );

  const chip = (id: string, label: string, total: number, on: number) => {
    const active = provider === id;
    const tone = PROVIDER_TONE[id];
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setProvider(id);
          setSelected(new Set());
        }}
        className="flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition"
        style={{
          borderColor: active ? (tone?.fg ?? B.blueLight) : B.border,
          background: active ? (tone?.bg ?? "rgba(42,92,221,0.08)") : B.card,
        }}
      >
        <span className="text-sm font-bold" style={{ color: tone?.fg ?? B.blue }}>
          {label}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: B.muted }}>
          {total} APIs · {on} on
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {chip("all", "All providers", allApis.length, allApis.filter((a) => a.enabled).length)}
          {providers.map((p) => {
            const list = allApis.filter((a) => a.providerName === p);
            return chip(p, p, list.length, list.filter((a) => a.enabled).length);
          })}
        </div>
        <label className="relative w-full lg:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: B.muted }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search API, screen or endpoint"
            className="w-full rounded-xl border bg-[var(--admin-bg)] py-2 pl-9 pr-8 text-sm outline-none"
            style={{ borderColor: B.border, color: B.blue }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
              style={{ color: B.muted }}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          ) : null}
        </label>
      </div>

      {picked.length > 0 ? (
        <div
          className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-2.5 shadow-sm"
          style={{ borderColor: B.blueLight, background: B.card }}
        >
          <span className="text-sm font-bold" style={{ color: B.blue }}>
            {picked.length} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReason("");
                setBulk({ enable: true });
              }}
              className="admin-btn-success flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <Power size={14} /> Turn on
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReason("");
                setBulk({ enable: false });
              }}
              className="admin-btn-danger flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <PowerOff size={14} /> Turn off
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(new Set())}
              className="rounded-xl border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              style={{ borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: B.border, background: B.card }}>
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: B.muted, background: B.secondary }}>
              <th className="w-10 py-2.5 pl-4 pr-0">
                <input
                  type="checkbox"
                  aria-label="Select all visible verification APIs"
                  checked={allPicked}
                  disabled={visible.length === 0}
                  ref={(el) => {
                    if (el) el.indeterminate = picked.length > 0 && !allPicked;
                  }}
                  onChange={togglePickAll}
                  className="h-4 w-4 cursor-pointer"
                  style={{ accentColor: B.blueLight }}
                />
              </th>
              <th className="w-[22%] px-4 py-2.5 font-semibold">Verification</th>
              <th className="w-[26%] px-4 py-2.5 font-semibold">Provider · API</th>
              <th className="w-[26%] px-4 py-2.5 font-semibold">Used in</th>
              <th className="px-4 py-2.5 font-semibold">Order</th>
              <th className="px-4 py-2.5 text-right font-semibold">On / off</th>
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section) => {
              const rows = checks
                .filter((c) => c.section === section.id)
                .map((c) => ({ c, apis: c.apis.filter((a) => matches(c, a)) }))
                .filter((x) => x.apis.length > 0);
              if (rows.length === 0) return null;
              return (
                <Fragment key={section.id}>
                  <tr style={{ background: "linear-gradient(90deg, #EEF2FF 0%, var(--admin-card) 80%)" }}>
                    <td colSpan={6} className="border-t px-4 py-2" style={{ borderColor: B.border }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-bold" style={{ color: B.blue }}>
                            {section.title}
                          </span>
                          <span className="ml-2 text-[11px]" style={{ color: B.muted }}>
                            {section.hint}
                          </span>
                        </div>
                        {orderable(section.id) ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openOrder(section.id)}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition hover:bg-[rgba(42,92,221,0.08)] disabled:opacity-50"
                            style={{ color: B.blueLight }}
                          >
                            <ListOrdered size={13} /> Edit order
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {rows.map(({ c, apis }) =>
                    apis.map((a, i) => (
                      <tr
                        key={rowKey(c.check, a.code)}
                        className="border-t align-top"
                        style={{
                          borderColor: B.border,
                          background: selected.has(rowKey(c.check, a.code)) ? "rgba(42,92,221,0.05)" : undefined,
                        }}
                      >
                        <td className="w-10 py-3 pl-4 pr-0">
                          <input
                            type="checkbox"
                            aria-label={`Select ${a.providerName} ${a.api} for ${c.label}`}
                            checked={selected.has(rowKey(c.check, a.code))}
                            onChange={() => togglePick(rowKey(c.check, a.code))}
                            className="mt-0.5 h-4 w-4 cursor-pointer"
                            style={{ accentColor: B.blueLight }}
                          />
                        </td>
                        {i === 0 ? (
                          <td className="px-4 py-3" rowSpan={apis.length}>
                            <p className="font-semibold" style={{ color: B.blue }}>
                              {c.label}
                            </p>
                            <span
                              className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                              style={
                                c.on
                                  ? { background: "rgba(34,197,94,0.12)", color: "#16a34a" }
                                  : c.offBehavior === "skip"
                                    ? { background: "rgba(234,179,8,0.15)", color: "#b45309" }
                                    : { background: "rgba(239,68,68,0.12)", color: "#dc2626" }
                              }
                            >
                              {c.on ? "On" : c.offBehavior === "skip" ? "Skipped" : "Off"}
                            </span>
                            {!c.on ? (
                              <p className="mt-1 text-[11px]" style={{ color: c.offBehavior === "skip" ? "#b45309" : "#B91C1C" }}>
                                {c.offBehavior === "skip" ? c.offMessage : `Agents see: “${c.offMessage}”`}
                              </p>
                            ) : null}
                            {c.section === "bank" && chargeRoute ? (
                              <p className="mt-2 text-[11px]" style={{ color: chargeRoute.isActive ? B.muted : "#B91C1C" }}>
                                Wallet charge route: <strong>{chargeRoute.providerName}</strong> ·{" "}
                                {chargeRoute.isActive ? "active" : "off — paid checks fail"}
                                {!chargeRoute.isActive ? (
                                  <button
                                    type="button"
                                    onClick={chargeRoute.onTurnOn}
                                    className="admin-btn-success ml-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                                  >
                                    Turn on
                                  </button>
                                ) : null}
                              </p>
                            ) : null}
                          </td>
                        ) : null}

                        <td className="px-4 py-3" style={{ opacity: a.enabled ? 1 : 0.6 }}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <ProviderBadge name={a.providerName} />
                            <span className="font-medium" style={{ color: B.blue }}>
                              {a.api}
                            </span>
                          </div>
                          {a.endpoints.map((e) => (
                            <p key={e} className="mt-0.5 truncate font-mono text-[10px]" style={{ color: B.muted }} title={e}>
                              {e}
                            </p>
                          ))}
                          <p className="mt-0.5 text-[11px]" style={{ color: B.muted }}>
                            {[a.cost, a.health ? `24h: ${a.health.total === 0 ? "no checks" : `${a.health.ok}/${a.health.total} confirmed`}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {!a.configured ? (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#B45309" }}>
                              <AlertTriangle size={12} /> Keys not set on the backend — calls will fail
                            </p>
                          ) : null}
                        </td>

                        {i === 0 ? (
                          <td className="px-4 py-3" rowSpan={apis.length}>
                            <div className="flex flex-wrap gap-1">
                              {c.usedIn.map((u) => (
                                <span
                                  key={u}
                                  className="rounded-lg border px-2 py-0.5 text-[11px]"
                                  style={{ borderColor: B.border, color: B.blue, background: B.secondary }}
                                >
                                  {u}
                                </span>
                              ))}
                            </div>
                          </td>
                        ) : null}

                        <td className="px-4 py-3">
                          {c.apis.length === 1 ? (
                            <span className="text-[11px]" style={{ color: B.muted }}>
                              Only API
                            </span>
                          ) : c.stepOrder ? (
                            <span className="text-xs font-semibold" style={{ color: B.blue }}>
                              {orderLabel(true, a.position - 1, c.apis.length)}
                            </span>
                          ) : a.position === 1 ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                              style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                            >
                              Primary
                            </span>
                          ) : (
                            <div className="flex flex-col items-start gap-1">
                              <span className="text-[11px] font-semibold" style={{ color: B.muted }}>
                                {orderLabel(false, a.position - 1, c.apis.length)}
                              </span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setReason("");
                                  setPending({ kind: "primary", check: c, row: a });
                                }}
                                className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold transition hover:bg-[rgba(42,92,221,0.08)] disabled:opacity-50"
                                style={{ color: B.blueLight }}
                              >
                                <ArrowUpToLine size={12} /> Make primary
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <ToggleSwitch
                              checked={a.enabled}
                              disabled={busy}
                              label={`${a.providerName} ${a.api} for ${c.label}`}
                              onChange={(on) => {
                                setReason("");
                                setPending({ kind: "toggle", check: c, row: a, enable: on });
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    )),
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {checks.every((c) => c.apis.every((a) => !matches(c, a))) ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
            No verification API matches this filter.
          </p>
        ) : null}
      </div>

      {pending ? (
        <Modal
          title={
            pending.kind === "primary"
              ? `Run ${pending.row.providerName} first?`
              : `${pending.enable ? "Turn on" : "Turn off"} ${pending.row.providerName} · ${pending.row.api}?`
          }
          eyebrow={pending.check.label}
          subtitle={
            pending.kind === "primary"
              ? "It becomes the primary API; the others are tried only if it fails."
              : pending.enable
                ? "This API is used again right away."
                : turnsCheckOff
                  ? pending.check.offBehavior === "skip"
                    ? "This is the only API — the check is skipped while it is off."
                    : "This is the last API that is on — the whole check stops."
                  : "The other APIs that are on keep this check working."
          }
          icon={pending.kind === "primary" ? <ArrowUpToLine size={22} /> : pending.enable ? <Power size={22} /> : <PowerOff size={22} />}
          iconTone={
            pending.kind === "primary" ? "blue" : pending.enable ? "green" : turnsCheckOff && pending.check.offBehavior === "block" ? "red" : "amber"
          }
          onClose={() => {
            if (!busy) setPending(null);
          }}
        >
          <div className="space-y-3">
            {turnsCheckOff ? (
              <div
                className="rounded-2xl border px-3 py-2 text-xs"
                style={
                  pending.check.offBehavior === "skip"
                    ? { borderColor: "#FCD34D", background: "#FFFBEB", color: "#B45309" }
                    : { borderColor: "#FCA5A5", background: "#FEF2F2", color: "#B91C1C" }
                }
              >
                {pending.check.offBehavior === "skip" ? pending.check.offMessage : `Agents will see: “${pending.check.offMessage}”`}
                <span className="mt-1 block" style={{ color: B.muted }}>
                  Affects: {pending.check.usedIn.join(" · ")}
                </span>
              </div>
            ) : null}
            {reasonBlock}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy || !!reasonError}
                onClick={() => void save()}
                className={`${
                  pending.kind === "primary" ? "admin-btn-primary" : pending.enable ? "admin-btn-success" : "admin-btn-danger"
                } rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50`}
              >
                {busy ? "Saving…" : pending.kind === "primary" ? "Make primary" : pending.enable ? "Turn on" : "Turn off"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {bulk ? (
        <Modal
          title={`${bulk.enable ? "Turn on" : "Turn off"} ${picked.length} selected API${picked.length === 1 ? "" : "s"}?`}
          eyebrow="Bulk change"
          subtitle={
            bulkChangeCount === 0
              ? `Every selected API is already ${bulk.enable ? "on" : "off"} — nothing to change.`
              : `${bulkChangeCount} will change${picked.length > bulkChangeCount ? ` · ${picked.length - bulkChangeCount} already ${bulk.enable ? "on" : "off"} and skipped` : ""}.`
          }
          icon={bulk.enable ? <Power size={22} /> : <PowerOff size={22} />}
          iconTone={bulk.enable ? "green" : bulkStops.some((g) => g.effect === "stops") ? "red" : "amber"}
          wide={bulkGroups.length > 3}
          onClose={() => {
            if (!busy) setBulk(null);
          }}
        >
          <div className="space-y-3">
            {!bulk.enable && bulkStops.length > 0 ? (
              <div className="rounded-2xl border px-3 py-2 text-xs" style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: "#B91C1C" }}>
                <p className="font-semibold">These screens are affected once the APIs are off:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {bulkStops.map((g) => (
                    <li key={g.c.check}>
                      <strong>{g.c.label}</strong> — {g.c.usedIn.join(" · ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className={`grid gap-2 ${bulkGroups.length > 3 ? "sm:grid-cols-2" : ""}`}>
              {bulkGroups.map((g, idx) => {
                const pill = EFFECT_PILL[g.effect];
                return (
                  <div
                    key={g.c.check}
                    className="la-check-row flex h-full flex-col rounded-2xl border p-3"
                    style={{ borderColor: B.border, background: B.card, animationDelay: `${idx * 120}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: B.blue }}>
                        {g.c.label}
                      </p>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: pill.bg, color: pill.fg }}>
                        {pill.text}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {g.rows.map((a) => (
                        <span
                          key={a.code}
                          className="flex items-center gap-1 text-[11px]"
                          style={{ color: a.enabled === bulk.enable ? B.muted : B.blue, opacity: a.enabled === bulk.enable ? 0.7 : 1 }}
                        >
                          <ProviderBadge name={a.providerName} /> {a.api}
                          {a.enabled === bulk.enable ? ` (already ${bulk.enable ? "on" : "off"})` : ""}
                        </span>
                      ))}
                    </div>
                    {g.effect === "stops" || g.effect === "skipped" ? (
                      <p className="mt-auto pt-2 text-[11px]" style={{ color: g.effect === "stops" ? "#B91C1C" : "#B45309" }}>
                        {g.effect === "stops" ? `Agents will see: “${g.c.offMessage}”` : g.c.offMessage}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {reasonBlock}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setBulk(null)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy || !!reasonError || bulkChangeCount === 0}
                onClick={() => void saveBulk()}
                className={`${bulk.enable ? "admin-btn-success" : "admin-btn-danger"} rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50`}
              >
                {busy ? "Saving…" : `${bulk.enable ? "Turn on" : "Turn off"} ${bulkChangeCount}`}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {orderSection ? (
        <Modal
          title={`Edit order · ${SECTIONS.find((s) => s.id === orderSection)?.title ?? ""}`}
          eyebrow="Priority order"
          subtitle={SECTIONS.find((s) => s.id === orderSection)?.hint}
          icon={<ListOrdered size={22} />}
          iconTone="blue"
          wide={orderChecks.length > 1}
          onClose={() => {
            if (!busy) setOrderSection(null);
          }}
        >
          <div className="space-y-3">
            <div className={`grid gap-2 ${orderChecks.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {orderChecks.map((c) => {
                const codes = draft[c.check] ?? c.apis.map((a) => a.code);
                const changed = orderChanged.includes(c);
                return (
                  <div
                    key={c.check}
                    className="flex h-full flex-col rounded-2xl border p-3"
                    style={{
                      borderColor: changed ? B.blueLight : B.border,
                      background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: B.blue }}>
                        {c.label}
                      </p>
                      {changed ? (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}>
                          Changed
                        </span>
                      ) : null}
                    </div>
                    <ol className="mt-2 space-y-1.5">
                      {codes.map((code, idx) => {
                        const a = c.apis.find((x) => x.code === code)!;
                        return (
                          <li
                            key={code}
                            draggable={!busy}
                            onDragStart={() => {
                              dragFrom.current = { check: c.check, index: idx };
                            }}
                            onDragOver={(e) => {
                              if (dragFrom.current?.check === c.check) e.preventDefault();
                            }}
                            onDrop={() => {
                              const from = dragFrom.current;
                              dragFrom.current = null;
                              if (from?.check === c.check) moveInDraft(c.check, from.index, idx);
                            }}
                            className="flex items-center gap-2 rounded-xl border px-2 py-1.5"
                            style={{ borderColor: B.border, background: B.card, opacity: a.enabled ? 1 : 0.6 }}
                          >
                            <GripVertical size={14} className="shrink-0 cursor-grab" style={{ color: B.muted }} aria-hidden />
                            <span className="w-16 shrink-0 text-[11px] font-bold" style={{ color: B.blueLight }}>
                              {orderLabel(c.stepOrder, idx, codes.length)}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs" style={{ color: B.blue }}>
                              <ProviderBadge name={a.providerName} />
                              <span className="truncate">{a.api}</span>
                              {!a.enabled ? (
                                <span className="text-[10px]" style={{ color: B.muted }}>
                                  (off)
                                </span>
                              ) : null}
                            </span>
                            <button
                              type="button"
                              disabled={busy || idx === 0}
                              onClick={() => moveInDraft(c.check, idx, idx - 1)}
                              className="rounded-md p-1 transition hover:bg-[rgba(42,92,221,0.08)] disabled:opacity-30"
                              style={{ color: B.blueLight }}
                              aria-label={`Move ${a.providerName} ${a.api} up`}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              disabled={busy || idx === codes.length - 1}
                              onClick={() => moveInDraft(c.check, idx, idx + 1)}
                              className="rounded-md p-1 transition hover:bg-[rgba(42,92,221,0.08)] disabled:opacity-30"
                              style={{ color: B.blueLight }}
                              aria-label={`Move ${a.providerName} ${a.api} down`}
                            >
                              <ArrowDown size={14} />
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
            </div>
            <p className="rounded-xl px-3 py-2 text-[11px]" style={{ background: B.secondary, color: B.muted }}>
              {orderChanged.length === 0
                ? "Move an API up or down to change the order. APIs that are off keep their place but are not called."
                : `${orderChanged.length} verification${orderChanged.length === 1 ? "" : "s"} will use the new order within 30 seconds of saving.`}
            </p>
            {reasonBlock}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOrderSection(null)}
                className="admin-btn-danger rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !!reasonError || orderChanged.length === 0}
                onClick={() => void saveOrder()}
                className="admin-btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save order"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
