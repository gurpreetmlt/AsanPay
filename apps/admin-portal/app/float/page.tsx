"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowLeftRight } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type Tab = "routes" | "transfers";

interface FloatRoute {
  id: string;
  fromBankId: string;
  bankName: string;
  bankLast4: string;
  toProviderId: string;
  providerCode: string;
  providerName: string;
  beneficiaryName: string;
  beneficiaryAccLast4: string;
  beneficiaryIfsc: string;
  transferMode: string;
  minAmount: string | null;
  maxAmount: string | null;
  priority: number;
  isActive: boolean;
}

interface FloatTransfer {
  id: string;
  routeId: string;
  amount: string;
  bankUtr: string | null;
  status: string;
  providerCode: string;
  providerName: string;
  bankName: string;
  initiatedAt: string;
  confirmedAt: string | null;
}

interface ProviderRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface BankAccount {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  purpose: string;
  isActive: boolean;
}

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

export default function AdminFloatPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [tab, setTab] = useState<Tab>("routes");
  const [routes, setRoutes] = useState<FloatRoute[]>([]);
  const [transfers, setTransfers] = useState<FloatTransfer[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fromBankId, setFromBankId] = useState("");
  const [toProviderId, setToProviderId] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryAccount, setBeneficiaryAccount] = useState("");
  const [beneficiaryIfsc, setBeneficiaryIfsc] = useState("");
  const [routeId, setRouteId] = useState("");
  const [amount, setAmount] = useState("");
  const [bankUtr, setBankUtr] = useState("");
  const initKey = useRef(createAttemptKeyHolder("float-init"));
  const confirmKey = useRef(createAttemptKeyHolder("float-confirm"));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, t, p, b] = await Promise.all([
        fetchApi<FloatRoute[]>("/float/routes"),
        fetchApi<FloatTransfer[]>("/float/transfers", { limit: "50" }),
        fetchApi<ProviderRow[]>("/float/providers"),
        fetchApi<BankAccount[]>("/banking/accounts", { purpose: "all" }),
      ]);
      setRoutes(r);
      setTransfers(t);
      setProviders(p);
      setBanks(b.filter((x) => x.isActive));
      setFromBankId((prev) => prev || b.find((x) => x.isActive)?.id || "");
      setToProviderId((prev) => prev || p[0]?.id || "");
      setRouteId((prev) => prev || r[0]?.id || "");
    } catch (err) {
      toast.error(errMessage(err, "Failed to load float data"));
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

  async function createRoute(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/float/routes", {
        fromBankId,
        toProviderId,
        beneficiaryName,
        beneficiaryAccount,
        beneficiaryIfsc,
      });
      toast.success("Float route created");
      setBeneficiaryName("");
      setBeneficiaryAccount("");
      setBeneficiaryIfsc("");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not create float route"));
    } finally {
      setSaving(false);
    }
  }

  async function initiate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(
        "/float/transfers",
        { routeId, amount, bankUtr: bankUtr || undefined },
        { headers: { "Idempotency-Key": initKey.current.get() } },
      );
      toast.success("Float transfer initiated — another admin must confirm");
      initKey.current.clear();
      setAmount("");
      setBankUtr("");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not initiate float transfer"));
    } finally {
      setSaving(false);
    }
  }

  async function confirm(id: string) {
    setSaving(true);
    try {
      await api.post(
        `/float/transfers/${id}/confirm`,
        {},
        { headers: { "Idempotency-Key": confirmKey.current.get() } },
      );
      toast.success("Float transfer confirmed");
      confirmKey.current.clear();
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not confirm float transfer"));
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
            style={{ background: B.badgeGrad }}
          >
            <ArrowLeftRight size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
              Float management
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              Bank → transit → provider float (maker-checker on confirm)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "routes" as const, label: "Routes" },
              { key: "transfers" as const, label: "Transfers" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="rounded-xl px-3 py-2 text-sm font-semibold"
              style={{
                background: tab === t.key ? B.badgeGrad : "#fff",
                color: tab === t.key ? "#fff" : B.muted,
                border: `1px solid ${B.border}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : tab === "routes" ? (
          <div className="space-y-5">
            <form
              onSubmit={createRoute}
              className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-2"
              style={{ borderColor: B.border }}
            >
              <h2 className="md:col-span-2 text-base font-bold" style={{ color: B.blue }}>
                New float route
              </h2>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={fromBankId}
                onChange={(e) => setFromBankId(e.target.value)}
                required
              >
                <option value="">Source bank</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} ···{b.accountNumberLast4} ({b.purpose})
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={toProviderId}
                onChange={(e) => setToProviderId(e.target.value)}
                required
              >
                <option value="">Provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="Beneficiary name"
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                required
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="Beneficiary account number"
                value={beneficiaryAccount}
                onChange={(e) => setBeneficiaryAccount(e.target.value)}
                required
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm uppercase"
                style={{ borderColor: B.border }}
                placeholder="IFSC"
                value={beneficiaryIfsc}
                onChange={(e) => setBeneficiaryIfsc(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white md:col-span-2"
                style={{ background: B.badgeGrad }}
              >
                Create route
              </button>
            </form>

            <div className="overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: B.border }}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ color: B.muted }}>
                    <th className="px-3 py-2 text-left font-medium">Bank</th>
                    <th className="px-3 py-2 text-left font-medium">Provider</th>
                    <th className="px-3 py-2 text-left font-medium">Beneficiary</th>
                    <th className="px-3 py-2 text-left font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: B.border }}>
                      <td className="px-3 py-2">
                        {r.bankName} ···{r.bankLast4}
                      </td>
                      <td className="px-3 py-2">
                        {r.providerName} ({r.providerCode})
                      </td>
                      <td className="px-3 py-2">
                        {r.beneficiaryName} ···{r.beneficiaryAccLast4} / {r.beneficiaryIfsc}
                      </td>
                      <td className="px-3 py-2">{r.isActive ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <form
              onSubmit={initiate}
              className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-3"
              style={{ borderColor: B.border }}
            >
              <h2 className="md:col-span-3 text-base font-bold" style={{ color: B.blue }}>
                Initiate transfer (maker)
              </h2>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                required
              >
                <option value="">Route</option>
                {routes
                  .filter((r) => r.isActive)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.bankName} → {r.providerCode}
                    </option>
                  ))}
              </select>
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="Amount (₹)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="Bank UTR (optional)"
                value={bankUtr}
                onChange={(e) => setBankUtr(e.target.value)}
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white md:col-span-3"
                style={{ background: B.badgeGrad }}
              >
                Initiate
              </button>
            </form>

            <div className="overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: B.border }}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ color: B.muted }}>
                    <th className="px-3 py-2 text-left font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Provider</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">When</th>
                    <th className="px-3 py-2 text-left font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => (
                    <tr key={t.id} className="border-t" style={{ borderColor: B.border }}>
                      <td className="px-3 py-2">₹{t.amount}</td>
                      <td className="px-3 py-2">
                        {t.providerName} ({t.providerCode})
                      </td>
                      <td className="px-3 py-2">{t.status}</td>
                      <td className="px-3 py-2">{new Date(t.initiatedAt).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        {(t.status === "in_transit" || t.status === "initiated") && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void confirm(t.id)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-white"
                            style={{ background: B.badgeGrad }}
                          >
                            Confirm
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
