"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Plus, RefreshCcw } from "lucide-react";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface SettlementBank {
  id: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
  isActive: boolean;
  verified: boolean;
  effectiveFrom: string;
}

interface SettlementRequest {
  requestId: string;
  amount: string;
  netAmount: string;
  mode: string;
  status: string;
  bankUtr: string | null;
  failureReason: string | null;
  requestedAt: string;
  completedAt: string | null;
}

function formatInr(amount: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `₹${amount}`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function SettlementsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);

  const [banks, setBanks] = useState<SettlementBank[]>([]);
  const [requests, setRequests] = useState<SettlementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBankForm, setShowBankForm] = useState(false);
  const [showSettleForm, setShowSettleForm] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [holderName, setHolderName] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"imps" | "neft" | "rtgs">("imps");
  const [saving, setSaving] = useState(false);
  const settleKey = useRef(createAttemptKeyHolder("settle-req"));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([
        fetchApi<SettlementBank[]>("/settlements/banks"),
        fetchApi<SettlementRequest[]>("/settlements/requests"),
      ]);
      setBanks(b);
      setRequests(r);
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load settlements"));
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
    if (role === "admin") {
      router.replace("/dashboard");
      return;
    }
    void load();
  }, [hydrated, accessToken, role, router, load]);

  async function registerBank(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/settlements/banks", {
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        holderName: holderName.trim(),
      });
      toast.success("Bank submitted — awaiting admin verification");
      setShowBankForm(false);
      setAccountNumber("");
      setIfsc("");
      setHolderName("");
      await load();
    } catch (err) {
      toast.error(extractApiError(err, "Could not register bank"));
    } finally {
      setSaving(false);
    }
  }

  async function submitSettlement(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(
        "/settlements/requests",
        { amount: amount.trim(), mode },
        { headers: { "Idempotency-Key": settleKey.current.get() } },
      );
      toast.success("Settlement requested — balance debited pending payout");
      settleKey.current.clear();
      setShowSettleForm(false);
      setAmount("");
      await load();
    } catch (err) {
      toast.error(extractApiError(err, "Could not request settlement"));
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  const hasActiveBank = banks.some((b) => b.isActive && b.verified);

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Settlements
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Register a bank account, then withdraw settleable balance to your account
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold"
            style={{ borderColor: B.border, color: B.blue }}
          >
            <RefreshCcw size={14} />
            Refresh
          </button>
        </div>

        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold" style={{ color: B.blue }}>
              <Landmark size={18} />
              Settlement banks
            </h2>
            <button
              type="button"
              onClick={() => setShowBankForm((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-white"
              style={{ background: B.badgeGrad }}
            >
              <Plus size={14} />
              Add bank
            </button>
          </div>

          {showBankForm ? (
            <form onSubmit={registerBank} className="mb-4 grid gap-3 rounded-xl border p-4 md:grid-cols-3" style={{ borderColor: B.border }}>
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="Account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                required
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm uppercase"
                style={{ borderColor: B.border }}
                placeholder="IFSC"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value)}
                required
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="Account holder name"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-2 text-sm font-bold text-white md:col-span-3 disabled:opacity-60"
                style={{ background: B.badgeGrad }}
              >
                {saving ? "Saving…" : "Submit for verification"}
              </button>
            </form>
          ) : null}

          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>Loading…</p>
          ) : banks.length === 0 ? (
            <p className="text-sm" style={{ color: B.muted }}>No settlement banks yet. Add one to withdraw.</p>
          ) : (
            <ul className="space-y-2">
              {banks.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                >
                  <div>
                    <div className="font-semibold" style={{ color: B.blue }}>
                      {b.holderName} · ****{b.accountNumberLast4}
                    </div>
                    <div className="text-xs" style={{ color: B.muted }}>
                      {b.ifsc}
                    </div>
                  </div>
                  <span
                    className="rounded-lg px-2 py-1 text-xs font-semibold"
                    style={{
                      background: b.verified && b.isActive ? "#ecfdf5" : "#fff7ed",
                      color: b.verified && b.isActive ? "#047857" : "#c2410c",
                    }}
                  >
                    {b.verified ? (b.isActive ? "Active" : "Verified") : "Pending verification"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Withdraw to bank
            </h2>
            <button
              type="button"
              disabled={!hasActiveBank}
              onClick={() => setShowSettleForm((v) => !v)}
              className="rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: B.badgeGrad }}
            >
              Request settlement
            </button>
          </div>
          {!hasActiveBank ? (
            <p className="mb-3 text-sm" style={{ color: B.muted }}>
              You need an active verified bank before requesting a settlement.
            </p>
          ) : null}

          {showSettleForm ? (
            <form onSubmit={submitSettlement} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-4" style={{ borderColor: B.border }}>
              <label className="text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>Amount (₹)</span>
                <input
                  className="rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: B.border }}
                  value={amount}
                  onChange={(e) => {
                    settleKey.current.clear();
                    setAmount(e.target.value);
                  }}
                  required
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>Mode</span>
                <select
                  className="rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: B.border }}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="imps">IMPS</option>
                  <option value="neft">NEFT</option>
                  <option value="rtgs">RTGS</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                style={{ background: B.badgeGrad }}
              >
                {saving ? "Submitting…" : "Submit"}
              </button>
            </form>
          ) : null}

          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm" style={{ color: B.muted }}>No settlement requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase" style={{ borderColor: B.border, color: B.muted }}>
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Mode</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">UTR / note</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.requestId} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="py-2.5 pr-3" style={{ color: B.muted }}>
                        {new Date(r.requestedAt).toLocaleString("en-IN")}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold" style={{ color: B.blue }}>
                        {formatInr(r.amount)}
                      </td>
                      <td className="py-2.5 pr-3 uppercase">{r.mode}</td>
                      <td className="py-2.5 pr-3">{r.status}</td>
                      <td className="py-2.5 text-xs" style={{ color: B.muted }}>
                        {r.bankUtr || r.failureReason || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
