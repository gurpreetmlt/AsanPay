"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Pencil, Percent, RotateCcw, Search, TableProperties } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { getServiceIcon } from "@/lib/serviceIcons";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { Modal } from "@/components/ui/Modal";
import { DateField, toYmd } from "@/components/ui/DateField";
import { SaveConfirmModal } from "@/components/commission/rateCard/SaveConfirmModal";
import { usePendingSave } from "@/components/commission/rateCard/usePendingSave";
import { Btn, CategoryHeaderRow, Chip, NumberField, SlabHeaderRow, SplitModeSwitch, openBlockEdge, type SplitMode } from "@/components/commission/rateCard/ui";
import {
  ROLE_LABEL,
  inr,
  pct,
  slabLabel,
  type PendingChange,
  type RateCardData,
  type SchemeRole,
  type ServiceRow,
  type Slab,
} from "@/components/commission/rateCard/types";

type AgentRate = {
  id: string;
  serviceId: string;
  minAmount: string | null;
  maxAmount: string | null;
  ruleType: "flat" | "percentage";
  value: string;
  sharePercent: string | null;
  isActive: boolean;
  expiresAt: string | null;
  updatedAt: string;
};

const ROW_BG = {
  even: "var(--admin-card)",
  odd: "rgba(42,92,221,0.035)",
  open: "rgba(42,92,221,0.10)",
  slabEven: "var(--admin-card)",
  slabOdd: "rgba(42,92,221,0.045)",
};

const toP = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100);
const rs = (p: number) => inr(p / 100);
const slabKey = (s: { minAmount: string | null; maxAmount: string | null }) => `${s.minAmount ?? ""}|${s.maxAmount ?? ""}`;
const sameBound = (a: string | null, b: string | null) => (a == null ? b == null : b != null && Number(a) === Number(b));
const isLive = (r: AgentRate) => r.isActive && (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now());

/** Rate shown for a slab: this slab's own row, else the agent's whole-service row. */
function rateFor(rates: AgentRate[], s: Slab): { rate: AgentRate; scope: "slab" | "service" } | null {
  const live = rates.filter(isLive);
  const own = live.find((r) => sameBound(r.minAmount, s.minAmount) && sameBound(r.maxAmount, s.maxAmount) && (r.minAmount != null || r.maxAmount != null));
  if (own) return { rate: own, scope: "slab" };
  const whole = live.find((r) => r.minAmount == null && r.maxAmount == null);
  return whole ? { rate: whole, scope: "service" } : null;
}

/** What the agent earns on this slab with `rate` (same rounding as the payout). */
function agentGrossPaise(s: Slab, rate: AgentRate | null, defaultPaise: number): number {
  if (!rate) return defaultPaise;
  if (rate.sharePercent != null) {
    const scaled = Math.round(Number(rate.sharePercent) * 10_000);
    const income = s.providerIncome != null ? toP(s.providerIncome) : 0;
    return income > 0 && scaled > 0 ? Math.floor((income * scaled + 500_000) / 1_000_000) : 0;
  }
  if (rate.ruleType === "flat") return toP(rate.value);
  // Older "% of txn amount" rows.
  return Math.floor((toP(s.sampleAmount) * Math.round(Number(rate.value) * 10_000)) / 1_000_000);
}

function rateLabel(rate: AgentRate): string {
  if (rate.sharePercent != null) return `${pct(rate.sharePercent)} share`;
  if (rate.ruleType === "flat") return `${inr(rate.value)} flat`;
  return `${pct(rate.value)} of amount (old)`;
}

type EditorState = { serviceId: string; slab: Slab };

function AgentSlabModal({
  row,
  slab,
  role,
  agentName,
  current,
  onClose,
  onSave,
}: {
  row: ServiceRow;
  slab: Slab;
  role: SchemeRole;
  agentName: string;
  current: { rate: AgentRate; scope: "slab" | "service" } | null;
  onClose: () => void;
  onSave: (body: Record<string, unknown>, detail: string, warnings: string[]) => void;
}) {
  const start = current?.rate;
  const [mode, setMode] = useState<SplitMode>(start && start.sharePercent == null && start.ruleType === "flat" ? "flat" : "percent");
  const [value, setValue] = useState(() =>
    start ? String(Number(start.sharePercent ?? start.value)) : "",
  );
  const [wholeService, setWholeService] = useState(current?.scope === "service");
  const [validUntil, setValidUntil] = useState(start?.expiresAt ? start.expiresAt.slice(0, 10) : "");
  const [openedAt] = useState(() => Date.now());

  const defaultGross = toP(slab.roles.find((r) => r.role === role)?.gross);
  const v = value.trim();
  const n = Number(v);
  const error =
    v === ""
      ? "Enter the agent's commission"
      : !Number.isFinite(n) || n < 0
        ? "Commission must be 0 or more"
        : mode === "percent" && n > 100
          ? "Share must be from 0 to 100%"
          : mode === "flat" && n > 500
            ? "Flat commission cannot be more than ₹500"
            : validUntil && new Date(`${validUntil}T23:59:59`).getTime() <= openedAt
              ? "Valid until must be a future date"
              : null;
  const draft: AgentRate | null = error
    ? null
    : {
        id: "draft",
        serviceId: row.serviceId,
        minAmount: null,
        maxAmount: null,
        ruleType: mode === "flat" ? "flat" : "percentage",
        value: mode === "flat" ? v : "0",
        sharePercent: mode === "percent" ? v : null,
        isActive: true,
        expiresAt: null,
        updatedAt: "",
      };
  const agentGross = draft ? agentGrossPaise(slab, draft, defaultGross) : defaultGross;
  const diff = agentGross - defaultGross;
  const tdsScaled = row.tax.tdsApplies ? Math.round(Number(row.tax.tdsPercent) * 10_000) : 0;
  const tds = agentGross > 0 && tdsScaled > 0 ? Math.floor((agentGross * tdsScaled) / 1_000_000) : 0;
  const keepsBefore = toP(slab.companyKeeps);
  const keepsAfter = keepsBefore - diff;
  const range = wholeService ? "every slab" : slabLabel(slab.minAmount, slab.maxAmount);

  return (
    <Modal
      title="Custom commission"
      eyebrow={`${agentName} · ${row.serviceName}`}
      subtitle={`${ROLE_LABEL[role]} default on ${slabLabel(slab.minAmount, slab.maxAmount)}: ${rs(defaultGross)}. Set what this agent gets instead.`}
      icon={<Percent size={22} />}
      iconTone="blue"
      onClose={onClose}
      wide
    >
      <div className="rounded-2xl border p-4" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="text-xs">
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="font-semibold" style={{ color: B.muted }}>
                {agentName}
              </span>
              <SplitModeSwitch label="Agent" mode={mode} onChange={setMode} />
            </div>
            <NumberField
              label=""
              value={value}
              onChange={setValue}
              suffix={mode === "percent" ? "%" : undefined}
              prefix={mode === "flat" ? "₹" : undefined}
              placeholder={mode === "percent" ? "e.g. 90" : "e.g. 5"}
              error={value !== "" ? error : null}
            />
            <p className="mt-1 text-[11px]" style={{ color: B.muted }}>
              {mode === "percent" ? "% of what the provider pays" : "₹ per transaction"}
            </p>
          </div>
          <div className="text-xs">
            <span className="mb-1 flex items-center justify-between font-semibold" style={{ color: B.muted }}>
              Valid until (optional)
              {validUntil ? (
                <button type="button" onClick={() => setValidUntil("")} className="text-[11px] font-bold" style={{ color: B.danger }}>
                  Clear
                </button>
              ) : null}
            </span>
            <DateField value={validUntil} onChange={setValidUntil} min={toYmd(new Date(openedAt + 86_400_000))} fullWidth />
            <span className="mt-1 block text-[11px]" style={{ color: B.muted }}>
              Blank = until you change it
            </span>
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
            <input type="checkbox" checked={wholeService} onChange={(e) => setWholeService(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="block font-semibold" style={{ color: B.blue }}>
                Apply to every slab
              </span>
              <span style={{ color: B.muted }}>A slab with its own custom rate keeps it.</span>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border" style={{ borderColor: B.border }}>
        <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ background: "var(--admin-secondary)", color: B.blueLight }}>
          Live calculation · txn of {inr(slab.sampleAmount)}
        </div>
        {[
          ["Provider pays", slab.providerIncome != null ? inr(slab.providerIncome) : "Not set"],
          [`${ROLE_LABEL[role]} default`, rs(defaultGross)],
          [`${agentName} gets`, rs(agentGross)],
          [`TDS ${row.tax.tdsApplies ? pct(row.tax.tdsPercent) : "off"}`, `− ${rs(tds)}`],
          ["Net to wallet", rs(agentGross - tds)],
        ].map(([k, val]) => (
          <div key={k} className="flex items-center justify-between border-t px-4 py-1.5 text-xs" style={{ borderColor: B.border }}>
            <span style={{ color: B.muted }}>{k}</span>
            <span className="font-semibold tabular-nums" style={{ color: B.blue }}>
              {val}
            </span>
          </div>
        ))}
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs font-bold tabular-nums"
          style={{
            borderColor: B.border,
            background: keepsAfter < 0 ? "#FEF2F2" : "rgba(18,183,106,0.08)",
            color: keepsAfter < 0 ? B.danger : B.greenDark,
          }}
        >
          <span>
            {diff === 0 ? "Same as default" : diff > 0 ? `+${rs(diff)} to this agent` : `${rs(-diff)} less to this agent`}
          </span>
          <span>
            Company keeps {rs(keepsBefore)} → {keepsAfter < 0 ? `loses ${rs(-keepsAfter)}` : rs(keepsAfter)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Btn variant="destructive" onClick={onClose}>
          Cancel
        </Btn>
        <Btn
          variant="primary"
          disabled={Boolean(error)}
          onClick={() =>
            onSave(
              {
                serviceId: row.serviceId,
                minAmount: wholeService ? null : slab.minAmount,
                maxAmount: wholeService ? null : slab.maxAmount,
                mode: mode === "percent" ? "share" : "flat",
                value: v,
                expiresAt: validUntil ? new Date(`${validUntil}T23:59:59+05:30`).toISOString() : null,
              },
              `${range}: ${mode === "percent" ? `${pct(v)} of provider pays` : `${inr(v)} flat`}${validUntil ? ` · until ${validUntil}` : ""}`,
              keepsAfter < 0 ? [`On ${inr(slab.sampleAmount)} the company would lose ${rs(-keepsAfter)} per txn.`] : [],
            )
          }
        >
          Save
        </Btn>
      </div>
    </Modal>
  );
}

/** Rate-card style per-agent commission: defaults for the agent's role, with slab-level custom rates on top. */
export function AgentRateCard({ userId, role, agentName }: { userId: string; role: string; agentName: string }) {
  const [data, setData] = useState<RateCardData | null>(null);
  const [rates, setRates] = useState<AgentRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const { saveReq, setSaveReq, saving, runSave } = usePendingSave(() => {
    setVersion((n) => n + 1);
    setEditor(null);
  });

  const load = useCallback(async () => {
    try {
      const [card, list] = await Promise.all([
        fetchApi<RateCardData>("/admin/rate-card"),
        fetchApi<AgentRate[]>(`/admin/users/${userId}/commission-slabs`),
      ]);
      setData(card);
      setRates(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Could not load this agent's commission. Refresh the page."));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const schemeRole = (["retailer", "distributor", "super_distributor"] as const).find((r) => r === role) ?? null;
  const ratesByService = useMemo(() => {
    const m = new Map<string, AgentRate[]>();
    for (const r of rates) m.set(r.serviceId, [...(m.get(r.serviceId) ?? []), r]);
    return m;
  }, [rates]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Array<{ category: string; rows: ServiceRow[] }> = [];
    for (const s of data?.services ?? []) {
      if (q && !`${s.serviceName} ${s.serviceCode} ${s.categoryName}`.toLowerCase().includes(q)) continue;
      const last = out[out.length - 1];
      if (last && last.category === s.categoryName) last.rows.push(s);
      else out.push({ category: s.categoryName, rows: [s] });
    }
    return out;
  }, [data, query]);

  if (!schemeRole) {
    return (
      <p className="rounded-2xl border p-6 text-sm" style={{ borderColor: B.border, color: B.muted }}>
        Custom commission is only for Retailers, Distributors and Super Distributors.
      </p>
    );
  }

  const customCount = rates.filter(isLive).length;
  const editorRow = editor ? data?.services.find((s) => s.serviceId === editor.serviceId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4" style={{ borderColor: B.border, background: B.card }}>
        <div>
          <p className="flex items-center gap-2 text-lg font-bold" style={{ color: B.blue }}>
            <Percent size={18} style={{ color: B.blueLight }} /> Custom commission for {agentName}
          </p>
          <p className="text-xs" style={{ color: B.muted }}>
            Defaults come from the Rate card for {ROLE_LABEL[schemeRole]}. Set a slab here to give this agent more (or less); the
            company keeps the difference.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={customCount ? "green" : "muted"}>{customCount ? `${customCount} custom rate${customCount === 1 ? "" : "s"}` : "All default"}</Chip>
          <label className="flex items-center gap-2 rounded-xl border px-3 py-1.5" style={{ borderColor: B.border }}>
            <Search size={14} style={{ color: B.muted }} />
            <input className="w-44 bg-transparent text-sm outline-none" placeholder="Search service" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <Link
            href="/tax-commission/rate-card"
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold"
            style={{ borderColor: B.border, color: B.blueLight }}
          >
            <TableProperties size={14} /> Rate card
          </Link>
        </div>
      </div>

      <section className="min-w-0 overflow-hidden rounded-2xl border" style={{ borderColor: B.border, background: B.card }}>
        {loadError ? (
          <p className="px-4 py-8 text-sm font-semibold" style={{ color: B.danger }}>
            {loadError}
          </p>
        ) : loading && !data ? (
          <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
            Loading commission…
          </p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
            No service matches “{query}”.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <tbody>
                {groups.map((g, gi) => (
                  <Fragment key={g.category}>
                    <CategoryHeaderRow label={g.category} count={g.rows.length} colSpan={6} spaced={gi > 0} />
                    {g.rows.map((row, i) => {
                      const open = expanded === row.serviceId;
                      const Icon = getServiceIcon(row.serviceCode);
                      const own = (ratesByService.get(row.serviceId) ?? []).filter(isLive);
                      const whole = own.find((r) => r.minAmount == null && r.maxAmount == null);
                      return (
                        <Fragment key={row.serviceId}>
                          <tr
                            className="cursor-pointer border-t transition hover:brightness-[0.98]"
                            style={{
                              borderColor: B.border,
                              background: open ? ROW_BG.open : i % 2 ? ROW_BG.odd : ROW_BG.even,
                              boxShadow: open ? openBlockEdge("top") : undefined,
                            }}
                            onClick={() => setExpanded((cur) => (cur === row.serviceId ? null : row.serviceId))}
                            aria-expanded={open}
                          >
                            <td className="px-4 py-2.5 align-top" colSpan={5}>
                              <div className="flex items-start gap-2">
                                <ChevronRight
                                  size={16}
                                  className={`mt-1 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                                  style={{ color: open ? B.blueLight : B.muted }}
                                />
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}>
                                  <Icon size={17} />
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold" style={{ color: B.blue }}>
                                    {row.serviceName}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: B.muted }}>
                                    <span>{row.slabs.length === 1 ? "1 slab" : `${row.slabs.length} slabs`}</span>
                                    {own.length ? <Chip tone="green">Custom · {own.length}</Chip> : <Chip tone="muted">Default</Chip>}
                                    {whole ? <Chip tone="blue">Every slab: {rateLabel(whole)}</Chip> : null}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                              {whole ? (
                                <button
                                  type="button"
                                  title="Remove the every-slab custom rate"
                                  aria-label="Remove the every-slab custom rate"
                                  onClick={() =>
                                    setSaveReq({
                                      title: `Reset ${row.serviceName} to default`,
                                      changes: [
                                        {
                                          label: `${agentName} · ${row.serviceName}`,
                                          detail: `Every slab: ${rateLabel(whole)} → ${ROLE_LABEL[schemeRole]} default`,
                                          method: "delete",
                                          url: `/admin/users/${userId}/commission-slabs/${whole.id}`,
                                          body: {},
                                        },
                                      ],
                                      warnings: [],
                                    })
                                  }
                                  className="rounded-lg p-1.5 transition hover:bg-red-50"
                                  style={{ color: B.danger }}
                                >
                                  <RotateCcw size={14} />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                          {open ? (
                            <SlabHeaderRow
                              cells={[
                                { label: "Slab" },
                                { label: "Provider pays" },
                                { label: `${ROLE_LABEL[schemeRole]} default` },
                                { label: "This agent" },
                                { label: "Company keeps" },
                                { label: "Actions" },
                              ]}
                            />
                          ) : null}
                          {open
                            ? row.slabs.map((s, si) => {
                                const cur = rateFor(own, s);
                                const def = toP(s.roles.find((r) => r.role === schemeRole)?.gross);
                                const gets = agentGrossPaise(s, cur?.rate ?? null, def);
                                const keeps = toP(s.companyKeeps) + def - gets;
                                return (
                                  <tr
                                    key={slabKey(s)}
                                    className="rc-slab-in cursor-pointer border-t transition hover:brightness-[0.97]"
                                    style={{
                                      borderColor: B.border,
                                      background: si % 2 ? ROW_BG.slabOdd : ROW_BG.slabEven,
                                      boxShadow: openBlockEdge(si === row.slabs.length - 1 ? "bottom" : "middle"),
                                      animationDelay: `${Math.min(si, 12) * 18}ms`,
                                    }}
                                    onClick={() => setEditor({ serviceId: row.serviceId, slab: s })}
                                    title="Set this agent's commission for this slab"
                                  >
                                    <td className="py-2 pl-[4.25rem] pr-3 text-xs" style={{ color: B.muted }}>
                                      {slabLabel(s.minAmount, s.maxAmount)} · on {inr(s.sampleAmount)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: B.blue }}>
                                      {s.providerIncome != null ? inr(s.providerIncome) : <Chip tone="amber">Not set</Chip>}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: B.muted }}>
                                      {rs(def)}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <p className="font-bold tabular-nums" style={{ color: cur ? B.greenDark : B.blue }}>
                                        {rs(gets)}
                                        {cur && gets !== def ? (
                                          <span className="ml-1 text-[11px]" style={{ color: gets > def ? B.greenDark : B.danger }}>
                                            ({gets > def ? "+" : "−"}
                                            {rs(Math.abs(gets - def))})
                                          </span>
                                        ) : null}
                                      </p>
                                      <p className="text-[11px]" style={{ color: B.muted }}>
                                        {cur ? `${rateLabel(cur.rate)}${cur.scope === "service" ? " · every slab" : " · slab"}` : "Default"}
                                      </p>
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: keeps < 0 ? B.danger : B.greenDark }}>
                                      {keeps < 0 ? `Loses ${rs(-keeps)}` : rs(keeps)}
                                    </td>
                                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex justify-end gap-0.5">
                                        <button
                                          type="button"
                                          title="Set custom commission"
                                          aria-label="Set custom commission"
                                          onClick={() => setEditor({ serviceId: row.serviceId, slab: s })}
                                          className="rounded-lg p-1.5 transition hover:bg-[rgba(42,92,221,0.10)]"
                                          style={{ color: B.blueLight }}
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        {cur?.scope === "slab" ? (
                                          <button
                                            type="button"
                                            title="Reset this slab to default"
                                            aria-label="Reset this slab to default"
                                            onClick={() =>
                                              setSaveReq({
                                                title: `Reset slab · ${row.serviceName}`,
                                                changes: [
                                                  {
                                                    label: `${agentName} · ${row.serviceName}`,
                                                    detail: `${slabLabel(s.minAmount, s.maxAmount)}: ${rateLabel(cur.rate)} → default`,
                                                    method: "delete",
                                                    url: `/admin/users/${userId}/commission-slabs/${cur.rate.id}`,
                                                    body: {},
                                                  },
                                                ],
                                                warnings: [],
                                              })
                                            }
                                            className="rounded-lg p-1.5 transition hover:bg-red-50"
                                            style={{ color: B.danger }}
                                          >
                                            <RotateCcw size={14} />
                                          </button>
                                        ) : null}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            : null}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editor && editorRow ? (
        <AgentSlabModal
          key={`${editor.serviceId}-${slabKey(editor.slab)}`}
          row={editorRow}
          slab={editor.slab}
          role={schemeRole}
          agentName={agentName}
          current={rateFor((ratesByService.get(editorRow.serviceId) ?? []).filter(isLive), editor.slab)}
          onClose={() => setEditor(null)}
          onSave={(body, detail, warnings) => {
            const change: PendingChange = {
              label: `${agentName} · ${editorRow.serviceName}`,
              detail,
              method: "post",
              url: `/admin/users/${userId}/commission-slabs`,
              body,
            };
            setSaveReq({ title: `Custom commission · ${editorRow.serviceName}`, changes: [change], warnings });
          }}
        />
      ) : null}

      {saveReq ? (
        <SaveConfirmModal
          title={saveReq.title}
          changes={saveReq.changes}
          warnings={saveReq.warnings}
          busy={saving}
          onConfirm={(reason) => void runSave(reason)}
          onClose={() => setSaveReq(null)}
        />
      ) : null}
    </div>
  );
}
