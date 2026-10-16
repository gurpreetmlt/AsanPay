"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  BadgeIndianRupee,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Download,
  Landmark,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { PanMissingBanner } from "@/components/dashboard/PanMissingBanner";
import { MetricCard } from "@/components/reports/MetricCard";
import { ReportDateBar } from "@/components/reports/ReportDateBar";
import { ShareBar } from "@/components/reports/ShareBar";
import {
  buildShareSegments,
  downloadCsv,
  formatInr,
  formatPct,
  pctValue,
  shareColor,
  todayYmd,
  toNum,
} from "@/components/reports/reportUtils";
import { fetchApi } from "@/lib/api";
import { B, initials } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type EarningsSummary = {
  from: string;
  to: string;
  totalNet: string;
  totalGross: string;
  totalTds: string;
  creditCount: number;
  activeServices: number;
  activeDownline: number | null;
};

type ProductRow = {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  volume: string;
  netAmount: string;
  grossAmount: string;
  tdsAmount: string;
  creditCount: number;
};

type DownlineRow = {
  userId: string;
  name: string;
  uid: string;
  mobile: string;
  shopLabel: string;
  isActive: boolean;
  volume: string;
  netAmount: string;
  grossAmount: string;
  tdsAmount: string;
  creditCount: number;
};

type TxnRow = {
  id: string;
  netAmount: string;
  grossAmount: string;
  tdsAmount: string;
  txnRef: string;
  txnAmount: string;
  createdAt: string;
};

function TaxLines({ gross, tds, net }: { gross: string; tds: string; net: string }) {
  return (
    <p className="text-[11px] font-semibold" style={{ color: B.muted }}>
      Gross {formatInr(gross)} · TDS {formatInr(tds)} · Net {formatInr(net)}
    </p>
  );
}

export default function MyEarningsPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="px-4 py-8 text-sm" style={{ color: B.muted }}>
            Loading…
          </div>
        </AppShell>
      }
    >
      <MyEarningsInner />
    </Suspense>
  );
}

function MyEarningsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isPartner = user?.role === "super_distributor" || user?.role === "distributor";
  const isRetailer = user?.role === "retailer";
  const canView = isPartner || isRetailer;
  const downlineLabel = user?.role === "super_distributor" ? "Distributor-wise" : "Retailer-wise";

  const initialFrom = search.get("from") || todayYmd();
  const initialTo = search.get("to") || initialFrom;

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [mode, setMode] = useState<"product" | "downline">("product");
  const [q, setQ] = useState("");
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [downline, setDownline] = useState<DownlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDownline, setExpandedDownline] = useState<string | null>(null);
  const [downlineProducts, setDownlineProducts] = useState<ProductRow[]>([]);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [productTxns, setProductTxns] = useState<TxnRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (isRetailer) setMode("product");
  }, [isRetailer]);

  useEffect(() => {
    if (!accessToken || !canView) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const tasks: Promise<unknown>[] = [
          fetchApi<EarningsSummary>("/earnings/summary", { from, to }),
          fetchApi<{ products: ProductRow[] }>("/earnings/by-product", { from, to }),
        ];
        if (isPartner) {
          tasks.push(
            fetchApi<{ rows: DownlineRow[] }>("/earnings/by-downline", {
              from,
              to,
              ...(q.trim() ? { q: q.trim() } : {}),
            }),
          );
        }
        const [sum, prod, dl] = (await Promise.all(tasks)) as [
          EarningsSummary,
          { products: ProductRow[] },
          { rows: DownlineRow[] } | undefined,
        ];
        if (!alive) return;
        setSummary(sum);
        setProducts(prod.products);
        setDownline(dl?.rows ?? []);
        setExpandedDownline(null);
        setExpandedProduct(null);
        setDownlineProducts([]);
        setProductTxns([]);
      } catch (err) {
        toast.error(extractApiError(err, "Could not load earnings"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, canView, isPartner, from, to, q]);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => toNum(b.netAmount) - toNum(a.netAmount)),
    [products],
  );

  const totals = useMemo(() => {
    const volume = products.reduce((s, p) => s + toNum(p.volume), 0);
    const gross = products.reduce((s, p) => s + toNum(p.grossAmount), 0);
    const tds = products.reduce((s, p) => s + toNum(p.tdsAmount), 0);
    const net = products.reduce((s, p) => s + toNum(p.netAmount), 0);
    return { volume, gross, tds, net };
  }, [products]);

  const shareSegments = useMemo(
    () =>
      buildShareSegments(
        sortedProducts.map((p) => ({ key: p.serviceId, label: p.serviceName, value: toNum(p.netAmount) })),
      ),
    [sortedProducts],
  );

  function exportCsv() {
    if (sortedProducts.length === 0) {
      toast.error("No product earnings to download for this date range");
      return;
    }
    downloadCsv(
      `earnings-${from}_to_${to}.csv`,
      ["Product/Service", "Business Volume", "Gross", "TDS", "Net", "Contribution %"],
      [
        ...sortedProducts.map((p) => [
          p.serviceName,
          toNum(p.volume).toFixed(2),
          toNum(p.grossAmount).toFixed(2),
          toNum(p.tdsAmount).toFixed(2),
          toNum(p.netAmount).toFixed(2),
          pctValue(toNum(p.netAmount), totals.net).toFixed(1),
        ]),
        [
          "Total",
          totals.volume.toFixed(2),
          totals.gross.toFixed(2),
          totals.tds.toFixed(2),
          totals.net.toFixed(2),
          totals.net > 0 ? "100.0" : "0.0",
        ],
      ],
    );
  }

  async function toggleDownline(userId: string) {
    if (expandedDownline === userId) {
      setExpandedDownline(null);
      setDownlineProducts([]);
      setExpandedProduct(null);
      setProductTxns([]);
      return;
    }
    setExpandedDownline(userId);
    setExpandedProduct(null);
    setProductTxns([]);
    setDetailLoading(true);
    try {
      const res = await fetchApi<{ products: ProductRow[] }>("/earnings/by-product", {
        from,
        to,
        downlineUserId: userId,
      });
      setDownlineProducts(res.products);
    } catch (err) {
      toast.error(extractApiError(err, "Could not load breakdown"));
      setExpandedDownline(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleProduct(serviceId: string, downlineUserId?: string) {
    const key = downlineUserId ? `${downlineUserId}:${serviceId}` : serviceId;
    if (expandedProduct === key) {
      setExpandedProduct(null);
      setProductTxns([]);
      return;
    }
    setExpandedProduct(key);
    setProductTxns([]);
    setDetailLoading(true);
    try {
      const res = await fetchApi<{ rows: TxnRow[] }>("/earnings/product-txns", {
        from,
        to,
        serviceId,
        ...(downlineUserId ? { downlineUserId } : {}),
      });
      setProductTxns(res.rows);
    } catch (err) {
      toast.error(extractApiError(err, "Could not load transactions"));
      setExpandedProduct(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function renderTxns() {
    if (detailLoading && productTxns.length === 0) {
      return (
        <p className="py-2 text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      );
    }
    if (productTxns.length === 0) {
      return (
        <p className="py-2 text-sm" style={{ color: B.muted }}>
          No transactions
        </p>
      );
    }
    return productTxns.map((t) => (
      <div key={t.id} className="flex items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold" style={{ color: B.blue }}>
            {t.txnRef}
          </p>
          <TaxLines gross={t.grossAmount} tds={t.tdsAmount} net={t.netAmount} />
        </div>
        <p className="text-sm font-extrabold" style={{ color: B.green }}>
          +{formatInr(t.netAmount)}
        </p>
      </div>
    ));
  }

  /** Compact list used inside an expanded downline agent. */
  function renderProducts(rows: ProductRow[], downlineUserId: string) {
    if (rows.length === 0) {
      return (
        <p className="px-4 py-3 text-sm" style={{ color: B.muted }}>
          No product earnings
        </p>
      );
    }
    return rows.map((p) => {
      const key = `${downlineUserId}:${p.serviceId}`;
      const open = expandedProduct === key;
      return (
        <div key={key}>
          <button
            type="button"
            onClick={() => void toggleProduct(p.serviceId, downlineUserId)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            style={{ borderBottom: `1px solid ${B.border}` }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "#EEF2FF", color: B.blueLight }}
            >
              <TrendingUp size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                {p.serviceName}
              </p>
              <p className="text-xs" style={{ color: B.muted }}>
                Vol: {formatInr(p.volume)}
              </p>
              {open ? <TaxLines gross={p.grossAmount} tds={p.tdsAmount} net={p.netAmount} /> : null}
            </div>
            <div className="text-right">
              <p className="text-sm font-extrabold" style={{ color: B.green }}>
                +{formatInr(p.netAmount)}
              </p>
              <p className="text-[10px] font-extrabold tracking-wide" style={{ color: B.muted }}>
                EARNING
              </p>
            </div>
            {open ? (
              <ChevronDown size={16} style={{ color: B.muted }} />
            ) : (
              <ChevronRight size={16} style={{ color: B.muted }} />
            )}
          </button>
          {open ? (
            <div className="px-4 pb-3" style={{ background: B.secondary }}>
              {renderTxns()}
            </div>
          ) : null}
        </div>
      );
    });
  }

  if (!hydrated || !accessToken || !canView) return null;

  const showCards = !(loading && !summary);
  const th = "px-4 py-3 text-[11px] font-extrabold uppercase tracking-wide";

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ background: "#DCFCE7", color: B.green }}
          >
            <Wallet size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              My Earnings
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Commission credited to your wallet, product by product
            </p>
          </div>
        </div>

        <PanMissingBanner />

        <ReportDateBar
          from={from}
          to={to}
          loading={loading}
          onApply={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
          actions={
            <PrimaryButton
              type="button"
              variant="secondary"
              size="sm"
              className="!w-auto"
              onClick={exportCsv}
            >
              <Download size={14} className="mr-1.5" />
              Download Excel
            </PrimaryButton>
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Gross Earnings"
            value={showCards ? formatInr(summary?.totalGross ?? "0") : "…"}
            subtitle="Commission before TDS"
            icon={<TrendingUp size={18} />}
            accent={B.blueLight}
            tint="#EEF2FF"
          />
          <MetricCard
            label="Net Credit (post TDS)"
            value={showCards ? formatInr(summary?.totalNet ?? "0") : "…"}
            subtitle={`${summary?.creditCount ?? 0} commission credits`}
            icon={<BadgeIndianRupee size={18} />}
            accent={B.green}
            tint="#DCFCE7"
          />
          <MetricCard
            label="Business Turnover"
            value={showCards ? formatInr(totals.volume) : "…"}
            subtitle="Total volume across products"
            icon={<Landmark size={18} />}
            accent={B.blue}
            tint="#E8EEFB"
          />
          <MetricCard
            label="Earning Services"
            value={showCards ? String(summary?.activeServices ?? 0) : "…"}
            subtitle={`TDS Deducted ${formatInr(summary?.totalTds ?? "0")}`}
            icon={<Briefcase size={18} />}
            accent="#D97706"
            tint="#FEF3C7"
          />
        </div>

        {isPartner ? (
          <div className="flex gap-1 rounded-2xl border bg-white p-1" style={{ borderColor: B.border }}>
            {(
              [
                { id: "product", label: "Product-wise" },
                { id: "downline", label: downlineLabel },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className="flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition"
                style={{
                  background: mode === t.id ? B.blue : "transparent",
                  color: mode === t.id ? "#fff" : B.muted,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        {mode === "downline" && isPartner ? (
          <>
            <div
              className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5"
              style={{ borderColor: B.border }}
            >
              <Search size={16} style={{ color: B.muted }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, UID, mobile"
                className="w-full bg-transparent text-sm font-semibold outline-none"
                style={{ color: B.blue }}
              />
            </div>

            {loading && downline.length === 0 ? (
              <p className="text-sm" style={{ color: B.muted }}>
                Loading…
              </p>
            ) : downline.length === 0 ? (
              <div
                className="rounded-2xl border bg-white px-6 py-10 text-center"
                style={{ borderColor: B.border }}
              >
                <p className="text-base font-extrabold" style={{ color: B.blue }}>
                  No earnings in this range
                </p>
                <p className="mt-1 text-sm" style={{ color: B.muted }}>
                  Downline agents with commission credits will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
                {downline.map((d) => {
                  const open = expandedDownline === d.userId;
                  return (
                    <div key={d.userId}>
                      <button
                        type="button"
                        onClick={() => void toggleDownline(d.userId)}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                        style={{ borderBottom: `1px solid ${B.border}` }}
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
                          style={{ background: "#EEF2FF", color: B.blueLight }}
                        >
                          {initials(d.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                            {d.name}
                          </p>
                          <p className="truncate text-xs" style={{ color: B.muted }}>
                            {d.shopLabel} · {d.uid} · {d.mobile}
                          </p>
                          {open ? <TaxLines gross={d.grossAmount} tds={d.tdsAmount} net={d.netAmount} /> : null}
                        </div>
                        <p className="text-sm font-extrabold" style={{ color: B.green }}>
                          +{formatInr(d.netAmount)}
                        </p>
                        {open ? (
                          <ChevronDown size={16} style={{ color: B.muted }} />
                        ) : (
                          <ChevronRight size={16} style={{ color: B.muted }} />
                        )}
                      </button>
                      {open ? (
                        <div>
                          {detailLoading && downlineProducts.length === 0 ? (
                            <p className="px-4 py-3 text-sm" style={{ color: B.muted }}>
                              Loading…
                            </p>
                          ) : (
                            renderProducts(downlineProducts, d.userId)
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <ShareBar
              title="Share by Product (Net Earnings)"
              segments={shareSegments}
              emptyText="No product earnings in this date range"
            />

            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
              <div className="px-5 py-4" style={{ borderBottom: `1px solid ${B.border}` }}>
                <h2 className="text-sm font-extrabold" style={{ color: B.blue }}>
                  Product-wise Breakdown
                </h2>
                <p className="text-xs" style={{ color: B.muted }}>
                  Click a product to see the transactions behind it
                </p>
              </div>

              {loading && products.length === 0 ? (
                <p className="px-5 py-8 text-sm" style={{ color: B.muted }}>
                  Loading…
                </p>
              ) : sortedProducts.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-base font-extrabold" style={{ color: B.blue }}>
                    No earnings in this range
                  </p>
                  <p className="mt-1 text-sm" style={{ color: B.muted }}>
                    Successful transactions that credit commission will show here as net earnings.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr style={{ background: B.secondary, color: B.muted }}>
                        <th className={`${th} text-left`}>Product / Service</th>
                        <th className={`${th} text-right`}>Business Volume</th>
                        <th className={`${th} text-right`}>Gross</th>
                        <th className={`${th} text-right`}>TDS</th>
                        <th className={`${th} text-right`}>Net</th>
                        <th className={`${th} w-[200px] text-left`}>Contribution %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProducts.map((p, i) => {
                        const open = expandedProduct === p.serviceId;
                        const pct = pctValue(toNum(p.netAmount), totals.net);
                        return (
                          <Fragment key={p.serviceId}>
                            <tr
                              onClick={() => void toggleProduct(p.serviceId)}
                              className="cursor-pointer transition hover:bg-[#F8FAFF]"
                              style={{ borderTop: `1px solid ${B.border}` }}
                            >
                              <td className="px-4 py-3.5">
                                <span className="flex items-center gap-2.5">
                                  {open ? (
                                    <ChevronDown size={14} style={{ color: B.muted }} />
                                  ) : (
                                    <ChevronRight size={14} style={{ color: B.muted }} />
                                  )}
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: shareColor(i) }} />
                                  <span className="font-bold" style={{ color: B.blue }}>
                                    {p.serviceName}
                                  </span>
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold tabular-nums" style={{ color: B.blue }}>
                                {formatInr(p.volume)}
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold tabular-nums" style={{ color: B.blue }}>
                                {formatInr(p.grossAmount)}
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold tabular-nums" style={{ color: B.muted }}>
                                {formatInr(p.tdsAmount)}
                              </td>
                              <td className="px-4 py-3.5 text-right font-extrabold tabular-nums" style={{ color: B.green }}>
                                {formatInr(p.netAmount)}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className="h-2 flex-1 overflow-hidden rounded-full"
                                    style={{ background: B.secondary }}
                                  >
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${pct}%`, background: shareColor(i) }}
                                    />
                                  </div>
                                  <span
                                    className="w-12 text-right text-xs font-extrabold tabular-nums"
                                    style={{ color: B.blue }}
                                  >
                                    {formatPct(toNum(p.netAmount), totals.net)}
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {open ? (
                              <tr style={{ background: B.secondary }}>
                                <td colSpan={6} className="px-6 py-2">
                                  {renderTxns()}
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: B.secondary, borderTop: `1px solid ${B.border}` }}>
                        <td className="px-4 py-3.5 font-extrabold" style={{ color: B.blue }}>
                          Total
                        </td>
                        <td className="px-4 py-3.5 text-right font-extrabold tabular-nums" style={{ color: B.blue }}>
                          {formatInr(totals.volume)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-extrabold tabular-nums" style={{ color: B.blue }}>
                          {formatInr(totals.gross)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-extrabold tabular-nums" style={{ color: B.muted }}>
                          {formatInr(totals.tds)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-extrabold tabular-nums" style={{ color: B.green }}>
                          {formatInr(totals.net)}
                        </td>
                        <td className="px-4 py-3.5 text-xs font-extrabold" style={{ color: B.blue }}>
                          {totals.net > 0 ? "100.0%" : "0.0%"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
