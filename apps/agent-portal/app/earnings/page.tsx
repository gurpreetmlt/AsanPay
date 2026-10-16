"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { ChevronDown, ChevronRight, Search, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { fetchApi } from "@/lib/api";
import { B, initials } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type EarningsSummary = {
  from: string;
  to: string;
  totalNet: string;
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

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatInr(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function TaxLines({ gross, tds, net }: { gross: string; tds: string; net: string }) {
  return (
    <p className="text-[11px] font-semibold" style={{ color: B.muted }}>
      Gross {formatInr(gross)} · TDS {formatInr(tds)} · Net {formatInr(net)}
    </p>
  );
}

export default function MyEarningsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isPartner = user?.role === "super_distributor" || user?.role === "distributor";
  const downlineLabel = user?.role === "super_distributor" ? "Distributor-wise" : "Retailer-wise";

  const initialFrom = search.get("from") || todayYmd();
  const initialTo = search.get("to") || initialFrom;

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [mode, setMode] = useState<"product" | "downline">("downline");
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
    if (hydrated && user?.role === "retailer") router.replace("/dashboard");
  }, [hydrated, user?.role, router]);

  useEffect(() => {
    if (!accessToken || !isPartner) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [sum, prod, dl] = await Promise.all([
          fetchApi<EarningsSummary>("/earnings/summary", { from, to }),
          fetchApi<{ products: ProductRow[] }>("/earnings/by-product", { from, to }),
          fetchApi<{ rows: DownlineRow[] }>("/earnings/by-downline", {
            from,
            to,
            ...(q.trim() ? { q: q.trim() } : {}),
          }),
        ]);
        if (!alive) return;
        setSummary(sum);
        setProducts(prod.products);
        setDownline(dl.rows);
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
  }, [accessToken, isPartner, from, to, q]);

  const badge = useMemo(() => {
    if (mode === "downline" && summary?.activeDownline != null) {
      return `${summary.activeDownline} Active ${user?.role === "super_distributor" ? "Distributors" : "Retailers"}`;
    }
    return `${summary?.activeServices ?? 0} Active Services`;
  }, [mode, summary, user?.role]);

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

  function renderProducts(rows: ProductRow[], downlineUserId?: string) {
    if (rows.length === 0) {
      return (
        <p className="px-4 py-3 text-sm" style={{ color: B.muted }}>
          No product earnings
        </p>
      );
    }
    return rows.map((p) => {
      const key = downlineUserId ? `${downlineUserId}:${p.serviceId}` : p.serviceId;
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
            {open ? <ChevronDown size={16} style={{ color: B.muted }} /> : <ChevronRight size={16} style={{ color: B.muted }} />}
          </button>
          {open ? (
            <div className="px-4 pb-3" style={{ background: B.secondary }}>
              {detailLoading && productTxns.length === 0 ? (
                <p className="py-2 text-sm" style={{ color: B.muted }}>
                  Loading…
                </p>
              ) : productTxns.length === 0 ? (
                <p className="py-2 text-sm" style={{ color: B.muted }}>
                  No transactions
                </p>
              ) : (
                productTxns.map((t) => (
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
                ))
              )}
            </div>
          ) : null}
        </div>
      );
    });
  }

  if (!hydrated || !accessToken || !isPartner) return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[960px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            My Earnings
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Net commission credited to your wallet
          </p>
        </div>

        <div
          className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4"
          style={{ borderColor: B.border }}
        >
          <label className="flex flex-col gap-1 text-xs font-bold" style={{ color: B.muted }}>
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold" style={{ color: B.muted }}>
            To
            <input
              type="date"
              value={to}
              min={from}
              max={todayYmd()}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </label>
          <PrimaryButton
            type="button"
            variant="primary"
            size="sm"
            showArrow={false}
            className="!w-auto"
            onClick={() => {
              const t = todayYmd();
              setFrom(t);
              setTo(t);
            }}
          >
            Today
          </PrimaryButton>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: B.border }}>
          <div className="flex flex-wrap items-center gap-4">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "#DCFCE7", color: B.green }}
            >
              <TrendingUp size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold tracking-wide" style={{ color: B.muted }}>
                TOTAL EARNINGS
              </p>
              <p className="text-3xl font-extrabold" style={{ color: B.blue }}>
                {loading && !summary ? "…" : formatInr(summary?.totalNet ?? "0")}
              </p>
            </div>
            <span
              className="rounded-full px-3 py-1.5 text-xs font-bold"
              style={{ background: "#EEF2FF", color: B.blueLight }}
            >
              {badge}
            </span>
          </div>
        </div>

        <div className="flex gap-1 rounded-2xl border bg-white p-1" style={{ borderColor: B.border }}>
          <button
            type="button"
            onClick={() => setMode("downline")}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition"
            style={{
              background: mode === "downline" ? B.blue : "transparent",
              color: mode === "downline" ? "#fff" : B.muted,
            }}
          >
            {downlineLabel}
          </button>
          <button
            type="button"
            onClick={() => setMode("product")}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition"
            style={{
              background: mode === "product" ? B.blue : "transparent",
              color: mode === "product" ? "#fff" : B.muted,
            }}
          >
            Product-wise
          </button>
        </div>

        {mode === "downline" ? (
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
        ) : null}

        {mode === "downline" ? (
          loading && downline.length === 0 ? (
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
                        style={{ background: "#EDE9FE", color: "#6D28D9" }}
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
                        {open ? (
                          <TaxLines gross={d.grossAmount} tds={d.tdsAmount} net={d.netAmount} />
                        ) : null}
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
          )
        ) : loading && products.length === 0 ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : products.length === 0 ? (
          <div
            className="rounded-2xl border bg-white px-6 py-10 text-center"
            style={{ borderColor: B.border }}
          >
            <p className="text-base font-extrabold" style={{ color: B.blue }}>
              No earnings in this range
            </p>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              Successful transactions that credit commission will show here as net earnings.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
            {renderProducts(products)}
          </div>
        )}
      </div>
    </AppShell>
  );
}
