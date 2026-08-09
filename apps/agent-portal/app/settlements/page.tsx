"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Plus, RefreshCcw, Inbox } from "lucide-react";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StatusBadge, toneFromStatus } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
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

        <div className="ui-card p-5">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Landmark size={18} />
                Settlement banks
              </span>
            }
            subtitle="Verified accounts for withdrawals"
            action={
              <PrimaryButton
                type="button"
                variant="secondary"
                size="sm"
                showArrow={false}
                onClick={() => setShowBankForm((v) => !v)}
                className="!w-auto"
              >
                <Plus size={14} />
                Add bank
              </PrimaryButton>
            }
          />

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
              <PrimaryButton
                type="submit"
                variant="primary"
                disabled={
                  saving ||
                  !accountNumber.trim() ||
                  !ifsc.trim() ||
                  !holderName.trim()
                }
                loading={saving}
                className="md:col-span-3"
              >
                Submit for verification
              </PrimaryButton>
            </form>
          ) : null}

          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>Loading…</p>
          ) : banks.length === 0 ? (
            <EmptyState
              icon={<Landmark size={22} strokeWidth={1.75} />}
              title="No settlement banks yet"
              description="Add a bank account to withdraw funds."
              action={
                <PrimaryButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  showArrow={false}
                  className="!w-auto"
                  onClick={() => setShowBankForm(true)}
                >
                  <Plus size={14} />
                  Add bank
                </PrimaryButton>
              }
            />
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
                  <StatusBadge
                    tone={
                      b.verified && b.isActive
                        ? "success"
                        : b.verified
                          ? "info"
                          : "pending"
                    }
                  >
                    {b.verified ? (b.isActive ? "Active" : "Verified") : "Pending verification"}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ui-card p-5">
          <SectionHeader
            title="Withdraw to bank"
            subtitle="Request settlement from your AePS / main balance"
            action={
              <PrimaryButton
                type="button"
                variant="secondary"
                size="sm"
                showArrow={false}
                disabled={!hasActiveBank}
                onClick={() => setShowSettleForm((v) => !v)}
                className="!w-auto"
              >
                Request settlement
              </PrimaryButton>
            }
          />
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
              <PrimaryButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={saving || !amount.trim() || Number(amount) <= 0}
                loading={saving}
                className="!w-auto"
              >
                Submit
              </PrimaryButton>
            </form>
          ) : null}

          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>Loading…</p>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={<Inbox size={22} strokeWidth={1.75} />}
              title="No settlement requests yet"
              description="When you withdraw, history will appear here."
              className="!py-6"
            />
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
                      <td className="py-2.5 pr-3">
                        <StatusBadge tone={toneFromStatus(r.status)}>
                          {r.status.replace(/_/g, " ")}
                        </StatusBadge>
                      </td>
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
