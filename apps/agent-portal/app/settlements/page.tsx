"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCcw, Inbox, Landmark } from "lucide-react";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StatusBadge, toneFromStatus } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SettlementStatusTimeline } from "@/components/settlements/SettlementStatusTimeline";
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
  const [showSettleForm, setShowSettleForm] = useState(false);
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

  const activeBank = banks.find((b) => b.isActive && b.verified);
  const hasActiveBank = Boolean(activeBank);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Settlements
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Withdraw settleable balance to your verified bank
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

        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: B.border, background: "#fff" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: `${B.blueLight}18`, color: B.blueLight }}
            >
              <Landmark size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: B.blue }}>
                {hasActiveBank
                  ? `${activeBank!.holderName} · ****${activeBank!.accountNumberLast4}`
                  : "No active settlement bank"}
              </p>
              <p className="text-xs" style={{ color: B.muted }}>
                {hasActiveBank
                  ? `IFSC ${activeBank!.ifsc} · Manage banks in Settings`
                  : "Add a bank in Settings before withdrawing"}
              </p>
            </div>
          </div>
          <PrimaryButton
            type="button"
            variant={hasActiveBank ? "secondary" : "success"}
            size="sm"
            showArrow={false}
            className="!w-auto"
            onClick={() => router.push("/settings?tab=banks")}
          >
            {hasActiveBank ? "Manage banks" : "Add bank in Settings"}
          </PrimaryButton>
        </div>

        <div className="ui-card p-5">
          <SectionHeader
            title="Withdraw to bank"
            subtitle="Request settlement from your AePS / main balance"
            action={
              <PrimaryButton
                type="button"
                variant={showSettleForm ? "destructive" : "primary"}
                size="sm"
                showArrow={false}
                disabled={!hasActiveBank && !showSettleForm}
                onClick={() => setShowSettleForm((v) => !v)}
                className="!w-auto"
              >
                {showSettleForm ? "Cancel" : "Request settlement"}
              </PrimaryButton>
            }
          />
          {!hasActiveBank ? (
            <p className="mb-3 text-sm" style={{ color: B.muted }}>
              You need an active verified bank in{" "}
              <Link href="/settings?tab=banks" className="font-semibold underline" style={{ color: B.blueLight }}>
                Settings → Settlement banks
              </Link>{" "}
              before requesting a withdrawal.
            </p>
          ) : null}

          {showSettleForm ? (
            <form
              onSubmit={submitSettlement}
              className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-4"
              style={{ borderColor: B.border }}
            >
              <label className="text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Amount (₹)
                </span>
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
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Mode
                </span>
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
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
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
                        <StatusBadge tone={toneFromStatus(r.status)}>{r.status.replace(/_/g, " ")}</StatusBadge>
                        <SettlementStatusTimeline
                          status={r.status}
                          note={r.bankUtr ? `UTR ${r.bankUtr}` : r.failureReason}
                        />
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
