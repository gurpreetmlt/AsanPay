"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  ChevronRight,
  Eye,
  HelpCircle,
  Layers,
  LayoutGrid,
  Pencil,
  Receipt,
  Search,
  TableProperties,
  type LucideIcon,
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { openBrandedPdf } from "@/lib/brandedExport";
import { getServiceIcon } from "@/lib/serviceIcons";
import { apiErrorMessage, downloadCsv } from "@/lib/taxCommissionUtils";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { downloadRateCardWorkbook, rateCardCsv, rateCardReport } from "../rateCard/rateCardTransfer";
import { ROLE_LABEL, SCHEME_ROLES, inr, pct, slabLabel, type RateCardData, type RoleSplit, type ServiceRow, type Slab } from "../rateCard/types";
import { CategoryBlock, ServiceTable, Chip, SlabHeaderRow, openBlockEdge } from "../rateCard/ui";

type ShowFilter = "all" | "loss" | "unset";

const ROW_BG = {
  even: "var(--admin-card)",
  odd: "rgba(42,92,221,0.035)",
  open: "rgba(42,92,221,0.10)",
  slabEven: "var(--admin-card)",
  slabOdd: "rgba(42,92,221,0.045)",
};

const hasLoss = (row: ServiceRow) => row.slabs.some((s) => s.underwater || s.missingRoles.length > 0);
const hasUnset = (row: ServiceRow) => row.slabs.some((s) => s.providerIncome == null);

function range(values: number[]): string {
  if (values.length === 0) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? inr(min) : `${inr(min)} – ${inr(max)}`;
}

function StatusPill({ row }: { row: ServiceRow }) {
  const losing = row.slabs.filter((s) => s.underwater).length;
  const unset = row.slabs.filter((s) => s.providerIncome == null).length;
  const zero = row.slabs.filter((s) => s.missingRoles.length > 0).length;
  if (losing) return <Chip tone="red">Loses on {losing} slab{losing === 1 ? "" : "s"}</Chip>;
  if (unset) return <Chip tone="amber">Rate not set{row.slabs.length > 1 ? ` (${unset})` : ""}</Chip>;
  if (zero) return <Chip tone="red">Role on ₹0{row.slabs.length > 1 ? ` (${zero})` : ""}</Chip>;
  return <Chip tone="green">OK</Chip>;
}

/** Net to wallet, with gross and TDS underneath. */
function RoleNet({ r }: { r: RoleSplit | undefined }) {
  if (!r) return <span>—</span>;
  const none = r.source === "none";
  return (
    <div className="text-right">
      <p className="font-bold tabular-nums" style={{ color: none ? B.danger : B.greenDark }}>
        {inr(r.net)}
      </p>
      <p className="text-[11px] tabular-nums" style={{ color: B.muted }}>
        {inr(r.gross)} − {inr(r.tds)}
      </p>
    </div>
  );
}

/** Read-only view of what the company gets and what each role earns per slab, after TDS. */
export function CommissionOverviewScreen() {
  const [data, setData] = useState<RateCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [show, setShow] = useState<ShowFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchApi<RateCardData>("/admin/rate-card"));
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Could not load the commission overview. Check your connection and refresh."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const services = useMemo(() => data?.services ?? [], [data]);
  const categories = useMemo(() => [...new Set(services.map((s) => s.categoryName))], [services]);
  const lossCount = services.filter(hasLoss).length;
  const unsetCount = services.filter(hasUnset).length;
  const slabCount = services.reduce((n, s) => n + s.slabs.length, 0);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Array<{ category: string; rows: ServiceRow[] }> = [];
    for (const s of services) {
      if (q && !`${s.serviceName} ${s.serviceCode} ${s.categoryName}`.toLowerCase().includes(q)) continue;
      if (category && s.categoryName !== category) continue;
      if (show === "loss" && !hasLoss(s)) continue;
      if (show === "unset" && !hasUnset(s)) continue;
      const last = out[out.length - 1];
      if (last && last.category === s.categoryName) last.rows.push(s);
      else out.push({ category: s.categoryName, rows: [s] });
    }
    return out;
  }, [services, query, category, show]);
  const visibleCount = groups.reduce((n, g) => n + g.rows.length, 0);

  const kpis: Array<{ label: string; value: string | number; hint: string; icon: LucideIcon; tone: string; filter: ShowFilter | null; href?: string }> = [
    { label: "Services", value: services.length, hint: "Show every service", icon: LayoutGrid, tone: B.blueLight, filter: "all" },
    { label: "Slabs", value: slabCount, hint: "Across all services", icon: Layers, tone: B.blue, filter: null },
    { label: "Loss or role ₹0", value: lossCount, hint: "Click to show them", icon: AlertTriangle, tone: B.danger, filter: "loss" },
    { label: "Rate not set", value: unsetCount, hint: "Provider pays missing", icon: HelpCircle, tone: "#B45309", filter: "unset" },
    {
      label: "Agent TDS",
      value: data?.tenantTax.tdsApplies ? pct(data.tenantTax.tdsPercent) : "Off",
      hint: "Edit in Tax settings",
      icon: Receipt,
      tone: B.greenDark,
      filter: null,
      href: "/tax-commission/tax",
    },
  ];

  const tdsLabel = data?.tenantTax.tdsApplies ? `TDS ${pct(data.tenantTax.tdsPercent)}` : "TDS off";

  function slabRow(row: ServiceRow, s: Slab, i: number) {
    const tdsTotal = s.roles.reduce((n, r) => n + Number(r.tds), 0);
    return (
      <tr
        key={`${s.minAmount ?? ""}|${s.maxAmount ?? ""}`}
        className="rc-slab-in border-t"
        style={{
          borderColor: B.border,
          background: i % 2 ? ROW_BG.slabOdd : ROW_BG.slabEven,
          boxShadow: openBlockEdge(i === row.slabs.length - 1 ? "bottom" : "middle"),
          animationDelay: `${Math.min(i, 12) * 18}ms`,
        }}
      >
        <td className="py-2 pl-[4.25rem] pr-3 text-xs" style={{ color: B.muted }}>
          {slabLabel(s.minAmount, s.maxAmount)}
          <span className="block text-[11px]">on {inr(s.sampleAmount)}</span>
        </td>
        <td className="px-3 py-2 text-right">
          {s.providerIncome != null ? (
            <span className="font-semibold tabular-nums" style={{ color: B.blue }}>
              {inr(s.providerIncome)}
            </span>
          ) : (
            <Chip tone="amber">Not set</Chip>
          )}
        </td>
        {SCHEME_ROLES.map((role) => (
          <td key={role} className="px-3 py-2">
            <RoleNet r={s.roles.find((x) => x.role === role)} />
          </td>
        ))}
        <td className="px-3 py-2 text-right tabular-nums" style={{ color: B.muted }}>
          {inr(tdsTotal)}
        </td>
        <td className="px-3 py-2 text-right">
          <span className="font-bold tabular-nums" style={{ color: s.underwater ? B.danger : B.greenDark }}>
            {s.underwater ? `Loses ${inr(Math.abs(Number(s.companyKeeps)))}` : inr(s.companyKeeps)}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: B.badgeGrad }}>
            <Eye size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Commission overview
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              Read only — what the company gets on each slab, what each role takes home after TDS, and what the company keeps.
            </p>
          </div>
        </div>
        <Link
          href="/tax-commission/rate-card"
          className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition hover:brightness-105"
          style={{ borderColor: B.border, background: "var(--admin-card)", color: B.blueLight }}
        >
          <TableProperties size={15} /> Change rates in Rate card
        </Link>
      </div>

      {data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k) => {
            const active = k.filter !== null && k.filter === show && !category && !query;
            const body = (
              <>
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                  <k.icon size={14} style={{ color: k.tone }} /> {k.label}
                </span>
                <span className="mt-1 block text-2xl font-bold tabular-nums" style={{ color: k.tone }}>
                  {k.value}
                </span>
                <span className="block text-[11px]" style={{ color: B.muted }}>
                  {k.hint}
                </span>
              </>
            );
            const cls = "rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-px hover:shadow-sm";
            const style = {
              borderColor: active ? k.tone : B.border,
              background: active ? `color-mix(in srgb, ${k.tone} 8%, var(--admin-card))` : "var(--admin-card)",
            };
            return k.href ? (
              <Link key={k.label} href={k.href} className={cls} style={style}>
                {body}
              </Link>
            ) : (
              <button
                key={k.label}
                type="button"
                className={cls}
                style={style}
                onClick={() => {
                  setShow(k.filter ?? "all");
                  setCategory("");
                  setQuery("");
                }}
              >
                {body}
              </button>
            );
          })}
        </div>
      ) : null}

      <section className="min-w-0 rounded-2xl border" style={{ borderColor: B.border, background: B.card }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: B.border }}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold" style={{ color: B.blue }}>
              Services {data ? `(${visibleCount} of ${services.length})` : ""}
            </p>
            <select
              aria-label="Filter by category"
              className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
              style={{ borderColor: B.border, background: "var(--admin-card)", color: B.blue }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
              style={{
                borderColor: show === "all" ? B.border : "#FCA5A5",
                background: "var(--admin-card)",
                color: show === "all" ? B.blue : B.danger,
              }}
              value={show}
              onChange={(e) => setShow(e.target.value as ShowFilter)}
            >
              <option value="all">All services</option>
              <option value="loss">Loss or role on ₹0 ({lossCount})</option>
              <option value="unset">Provider pays not set ({unsetCount})</option>
            </select>
            {category || show !== "all" || query ? (
              <button
                type="button"
                className="text-xs font-bold hover:underline"
                style={{ color: B.blueLight }}
                onClick={() => {
                  setCategory("");
                  setShow("all");
                  setQuery("");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border px-3 py-1.5" style={{ borderColor: B.border }}>
              <Search size={14} style={{ color: B.muted }} />
              <input
                className="w-48 bg-transparent text-sm outline-none"
                placeholder="Search service"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <ExportMenu
              disabled={!data || services.length === 0}
              onPdf={() => {
                if (data && !openBrandedPdf(rateCardReport(data, "All providers"))) {
                  toast.error("Allow pop-ups for this site to export the PDF");
                }
              }}
              onExcel={() => data && downloadRateCardWorkbook(data, "All providers")}
              onCsv={() => data && downloadCsv(`commission-overview-${new Date().toISOString().slice(0, 10)}.csv`, rateCardCsv(data))}
            />
          </div>
        </div>

        {loadError ? (
          <p className="px-4 py-8 text-sm font-semibold" style={{ color: B.danger }}>
            {loadError}
          </p>
        ) : loading && !data ? (
          <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
            Loading commission overview…
          </p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
            {query || category || show !== "all"
              ? "No service matches these filters. Clear the filters to see every service."
              : "No active services."}
          </p>
        ) : (
          <div className="max-xl:overflow-x-auto">
            <div className="min-w-[980px]">
                {groups.map((g, gi) => (
                  <CategoryBlock key={g.category} label={g.category} count={g.rows.length} spaced={gi > 0}>
                    {g.rows.map((row, i) => {
                      const open = expanded === row.serviceId;
                      const Icon = getServiceIcon(row.serviceCode);
                      const incomes = row.slabs.filter((s) => s.providerIncome != null).map((s) => Number(s.providerIncome));
                      const keeps = row.slabs.map((s) => Number(s.companyKeeps));
                      return (
                        <ServiceTable key={row.serviceId} widths={["", "12%", "12%", "12%", "12%", "10%", "12%"]} open={open} head={<>
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
                            <td className="px-4 py-2.5 align-top">
                              <div className="flex items-start gap-2">
                                <ChevronRight
                                  size={16}
                                  className={`mt-1 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                                  style={{ color: open ? B.blueLight : B.muted }}
                                />
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                                  style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                                >
                                  <Icon size={17} />
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold" style={{ color: B.blue }}>
                                    {row.serviceName}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: B.muted }}>
                                    <span>{row.slabs.length === 1 ? "1 slab" : `${row.slabs.length} slabs`}</span>
                                    <StatusPill row={row} />
                                    <Link
                                      href={`/tax-commission/rate-card?q=${encodeURIComponent(row.serviceName)}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
                                      style={{ color: B.blueLight }}
                                    >
                                      <Pencil size={11} /> Edit in Rate card
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums" style={{ color: B.blue }}>
                              <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
                                Provider pays
                              </span>
                              {range(incomes)}
                            </td>
                            <td colSpan={4} className="px-3 py-2.5 text-right text-[11px]" style={{ color: B.muted }}>
                              {open ? "" : "Open to see each slab"}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: row.slabs.some((s) => s.underwater) ? B.danger : B.greenDark }}>
                              <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
                                Company keeps
                              </span>
                              {range(keeps)}
                            </td>
                          </tr>
                          {open ? (
                            <SlabHeaderRow
                              cells={[
                                { label: "Slab" },
                                { label: "Provider pays" },
                                ...SCHEME_ROLES.map((r) => ({
                                  label: `${ROLE_LABEL[r]} net`,
                                  title: `Net to wallet after ${tdsLabel} (gross − TDS below)`,
                                })),
                                { label: "TDS held" },
                                { label: "Company keeps" },
                              ]}
                            />
                          ) : null}
</>}>
                          {open ? row.slabs.map((s, si) => slabRow(row, s, si)) : null}
                        </ServiceTable>
                      );
                    })}
                  </CategoryBlock>
                ))}
              </div>
          </div>
        )}
        <p className="border-t px-4 py-2 text-[11px]" style={{ borderColor: B.border, color: B.muted }}>
          Per transaction on each slab&apos;s example amount. Role cells show net to wallet, with gross − TDS ({tdsLabel}) under it.
          Company keeps = provider pays + customer fee − role gross. Nothing on this page can be changed — use the Rate card.
        </p>
      </section>
    </div>
  );
}
