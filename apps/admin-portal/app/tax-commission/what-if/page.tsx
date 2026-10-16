"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Calculator } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type SchemeRole = "retailer" | "distributor" | "super_distributor";
type RuleType = "flat" | "percentage";

const ROLE_LABEL: Record<SchemeRole, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  super_distributor: "Super Distributor",
};

type CatalogService = { id: string; code: string; name: string; isActive: boolean };
type CatalogCategory = {
  id: string;
  name: string;
  isActive: boolean;
  services: CatalogService[];
};

type PreviewSplit = {
  role: SchemeRole;
  ruleId: string | null;
  ruleType: RuleType | null;
  value: string | null;
  payout: string;
  gross?: string;
  tds?: string;
  net?: string;
  matched: boolean;
};

type PreviewResult = {
  serviceId: string;
  amount: string;
  tax?: {
    tdsApplies: boolean;
    tdsPercent: string;
    gstOnFeeApplies: boolean;
    gstOnFeePercent: string;
  };
  splits: PreviewSplit[];
  totalPayout: string;
  totalGross?: string;
  underwater?: {
    providerPool: string;
    totalGross: string;
    shortfall: string;
    isUnderwater: boolean;
  } | null;
};

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

export default function TaxCommissionWhatIfPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [serviceId, setServiceId] = useState("");
  const [amount, setAmount] = useState("1000");
  const [providerPool, setProviderPool] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const serviceOptions = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const cat of catalog) {
      if (!cat.isActive) continue;
      for (const s of cat.services) {
        if (!s.isActive) continue;
        out.push({ id: s.id, label: `${cat.name} · ${s.name}` });
      }
    }
    return out;
  }, [catalog]);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const cats = await fetchApi<CatalogCategory[]>("/admin/catalog");
      setCatalog(cats);
      setServiceId((prev) => {
        if (prev) return prev;
        for (const c of cats) {
          if (!c.isActive) continue;
          const first = c.services.find((s) => s.isActive);
          if (first) return first.id;
        }
        return "";
      });
    } catch (err) {
      toast.error(errMessage(err, "Failed to load services"));
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void loadCatalog();
  }, [hydrated, accessToken, loadCatalog]);

  async function runCalculate() {
    if (!serviceId) {
      toast.error("Select a service");
      return;
    }
    if (!amount.trim() || Number(amount) <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    setCalculating(true);
    try {
      const result = await api
        .post("/admin/commission/preview", {
          serviceId,
          amount: amount.trim(),
          ...(providerPool.trim() ? { providerPool: providerPool.trim() } : {}),
        })
        .then((r) => {
          if (!r.data.success) throw new Error(r.data.message || "Calculate failed");
          return r.data.data as PreviewResult;
        });
      setPreview(result);
    } catch (err) {
      toast.error(errMessage(err, "Calculate failed"));
    } finally {
      setCalculating(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  const totalTds =
    preview?.splits.reduce((sum, s) => sum + Number(s.tds ?? 0), 0).toFixed(2) ?? null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="taxCommission" />

        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
            style={{ background: B.badgeGrad }}
          >
            <Calculator size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              What-if calculator
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              Amount + service → Gross / TDS / Net by role (role-default schemes; ignores per-agent
              overrides).
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <div className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Inputs
            </h2>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Service
              </span>
              <select
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border }}
                value={serviceId}
                disabled={loadingCatalog}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">{loadingCatalog ? "Loading…" : "Select service"}</option>
                {serviceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Amount (₹)
              </span>
              <input
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border }}
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setPreview(null);
                }}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Provider pool ₹ (optional)
              </span>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={providerPool}
                onChange={(e) => {
                  setProviderPool(e.target.value);
                  setPreview(null);
                }}
                placeholder="e.g. 12.50"
              />
              <span className="mt-1 block text-xs" style={{ color: B.muted }}>
                If set, shows underwater warning when scheme gross exceeds the pool.
              </span>
            </label>

            <button
              type="button"
              onClick={() => void runCalculate()}
              disabled={calculating || loadingCatalog}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {calculating ? "Calculating…" : "Calculate"}
            </button>
          </div>

          <div className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Result by role
            </h2>

            {!preview ? (
              <p className="text-sm" style={{ color: B.muted }}>
                Enter amount and service, then tap Calculate to see Gross, TDS, and Net for each role.
              </p>
            ) : (
              <div className="space-y-4">
                {preview.tax ? (
                  <p className="text-xs font-semibold" style={{ color: B.muted }}>
                    Tax: TDS {preview.tax.tdsApplies ? `${preview.tax.tdsPercent}%` : "off"}
                    {preview.tax.gstOnFeeApplies
                      ? ` · Fee GST ${preview.tax.gstOnFeePercent}%`
                      : " · Fee GST off"}
                    {" · "}Txn ₹{preview.amount}
                  </p>
                ) : null}

                {preview.underwater?.isUnderwater ? (
                  <div
                    className="rounded-xl border px-3 py-2 text-xs font-semibold"
                    style={{ borderColor: "#FDBA74", background: "#FFF7ED", color: "#C2410C" }}
                  >
                    Underwater: scheme gross ₹{preview.underwater.totalGross} exceeds provider pool ₹
                    {preview.underwater.providerPool} by ₹{preview.underwater.shortfall}.
                  </div>
                ) : preview.underwater ? (
                  <p className="text-xs font-semibold" style={{ color: "#15803D" }}>
                    Pool OK: gross ₹{preview.underwater.totalGross} ≤ provider pool ₹
                    {preview.underwater.providerPool}.
                  </p>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: B.border, color: B.muted }}>
                        <th className="py-2 pr-3 font-bold">Role</th>
                        <th className="py-2 pr-3 font-bold">Rule</th>
                        <th className="py-2 pr-3 font-bold text-right">Gross</th>
                        <th className="py-2 pr-3 font-bold text-right">TDS</th>
                        <th className="py-2 font-bold text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.splits.map((s) => (
                        <tr key={s.role} className="border-b last:border-0" style={{ borderColor: B.border }}>
                          <td className="py-3 pr-3 font-semibold" style={{ color: B.blue }}>
                            {ROLE_LABEL[s.role]}
                          </td>
                          <td className="py-3 pr-3" style={{ color: B.muted }}>
                            {s.matched
                              ? s.ruleType === "flat"
                                ? `Flat ₹${s.value}`
                                : `${s.value}%`
                              : "No rule"}
                          </td>
                          <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                            ₹{s.matched ? (s.gross ?? "0.00") : "0.00"}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums" style={{ color: B.muted }}>
                            ₹{s.matched ? (s.tds ?? "0.00") : "0.00"}
                          </td>
                          <td className="py-3 text-right font-bold tabular-nums" style={{ color: B.blue }}>
                            ₹{s.matched ? (s.net ?? s.payout) : "0.00"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-bold" style={{ borderColor: B.border, color: B.blue }}>
                        <td className="pt-3 pr-3" colSpan={2}>
                          Totals
                        </td>
                        <td className="pt-3 pr-3 text-right tabular-nums">
                          ₹{preview.totalGross ?? "0.00"}
                        </td>
                        <td className="pt-3 pr-3 text-right tabular-nums" style={{ color: B.muted }}>
                          ₹{totalTds ?? "0.00"}
                        </td>
                        <td className="pt-3 text-right tabular-nums">₹{preview.totalPayout}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
