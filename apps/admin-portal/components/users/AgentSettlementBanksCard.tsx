"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { CircleCheck, Clock, Info, Landmark, ShieldCheck } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DetailSection } from "@/components/users/DetailSection";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

type SettlementBankRow = {
  id: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
  isActive: boolean;
  verified: boolean;
  coolingUntil: string | null;
  bankCheckStatus: "verified" | "not_confirmed" | "pending" | "error" | null;
  bankHolderName: string | null;
  bankCheckMessage: string | null;
};

function statusMeta(bank: SettlementBankRow): {
  label: string;
  bg: string;
  color: string;
  hint: string;
} {
  if (bank.isActive) {
    const cooling =
      bank.coolingUntil && new Date(bank.coolingUntil).getTime() > Date.now()
        ? ` Withdrawals pause until ${new Date(bank.coolingUntil).toLocaleString("en-IN")}.`
        : "";
    return {
      label: "Active payout bank",
      bg: "#ECFDF3",
      color: "#027A48",
      hint: `This account receives settlements.${cooling}`,
    };
  }
  if (bank.verified) {
    return {
      label: "Verified",
      bg: "#EFF8FF",
      color: "#175CD3",
      hint: "Approved — agent can set this as active from their app.",
    };
  }
  return {
    label: "Needs verification",
    bg: "#FFFAEB",
    color: "#B54708",
    hint: "Agent added this bank. Confirm account details, then verify.",
  };
}

export function AgentSettlementBanksCard({ userId }: { userId: string }) {
  const [banks, setBanks] = useState<SettlementBankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ bank: SettlementBankRow; activate: boolean } | null>(
    null,
  );
  const [releaseTarget, setReleaseTarget] = useState<SettlementBankRow | null>(null);

  async function runRelease() {
    if (!releaseTarget) return;
    setActing(releaseTarget.id);
    try {
      await api.post(`/settlements/banks/${releaseTarget.id}/release-cooling`);
      toast.success("Withdrawal hold removed — the agent can withdraw now");
      setReleaseTarget(null);
      await load();
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(ax?.response?.data?.message || ax?.message || "Could not remove the withdrawal hold");
    } finally {
      setActing(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBanks(await fetchApi<SettlementBankRow[]>(`/settlements/banks/by-user/${userId}`));
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(ax?.response?.data?.message || ax?.message || "Failed to load settlement banks");
      setBanks([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recheck(bank: SettlementBankRow) {
    setActing(bank.id);
    try {
      const { data } = await api.post<{ data?: { status: string; message: string } }>(
        `/settlements/banks/${bank.id}/bank-check`,
      );
      if (data.data?.status === "verified") toast.success(data.data.message);
      else toast.error(data.data?.message || "The bank could not confirm this account");
      await load();
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(ax?.response?.data?.message || ax?.message || "Bank check could not run. Try again in a minute.");
    } finally {
      setActing(null);
    }
  }

  async function runVerify() {
    if (!confirm) return;
    setActing(confirm.bank.id);
    try {
      await api.post(`/settlements/banks/${confirm.bank.id}/verify`, {
        activate: confirm.activate,
      });
      toast.success(
        confirm.activate
          ? "Bank verified and set as active payout bank"
          : "Bank verified — agent can activate it later",
      );
      setConfirm(null);
      await load();
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(ax?.response?.data?.message || ax?.message || "Verify failed");
    } finally {
      setActing(null);
    }
  }

  const pendingCount = banks.filter((b) => !b.verified).length;
  const verifiedCount = banks.filter((b) => b.verified && !b.isActive).length;
  const activeBank = banks.find((b) => b.isActive);

  return (
    <>
      <DetailSection title="Settlement banks" icon={Landmark}>
        <div
          className="mb-4 flex items-start gap-3 rounded-2xl px-3 py-2.5"
          style={{ background: "rgba(42,92,221,0.06)", border: "1px solid rgba(42,92,221,0.18)" }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(42,92,221,0.14)", color: B.blueLight }}>
            <Info size={15} />
          </span>
          <p className="pt-1 text-xs leading-relaxed" style={{ color: "var(--admin-text)" }}>
            Withdrawals go to the <strong>active payout bank</strong>. KYC bank details are for identity only — each settlement
            bank needs its own verify step.
          </p>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading banks…
          </p>
        ) : banks.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-4 py-8 text-center" style={{ borderColor: B.border }}>
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "rgba(42,92,221,0.08)", color: B.blueLight, boxShadow: "0 0 0 8px rgba(42,92,221,0.04)" }}
            >
              <Landmark size={24} />
            </span>
            <p className="mt-3 text-sm font-bold" style={{ color: B.blue }}>
              No settlement bank yet
            </p>
            <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
              When the agent adds one, it shows here for verification.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: "Active payout bank", value: activeBank ? `****${activeBank.accountNumberLast4}` : "None", icon: CircleCheck, tone: "#16A34A" },
                { label: "Verified, not active", value: String(verifiedCount), icon: ShieldCheck, tone: "#175CD3" },
                { label: "Waiting for you", value: String(pendingCount), icon: Clock, tone: pendingCount ? "#B54708" : "#64748B" },
              ].map((k) => {
                const KIcon = k.icon;
                return (
                  <div key={k.label} className="flex items-center gap-2.5 rounded-2xl border px-3 py-2.5" style={{ borderColor: B.border }}>
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `color-mix(in srgb, ${k.tone} 14%, transparent)`, color: k.tone }}
                    >
                      <KIcon size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
                        {k.label}
                      </p>
                      <p className="truncate text-sm font-extrabold tabular-nums" style={{ color: k.tone }}>
                        {k.value}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {banks.map((bank) => {
              const meta = statusMeta(bank);
              const StatusIcon = bank.isActive ? CircleCheck : bank.verified ? ShieldCheck : Clock;
              return (
                <div
                  key={bank.id}
                  className="relative overflow-hidden rounded-2xl border p-4 pl-5 transition hover:shadow-md"
                  style={{
                    borderColor: bank.isActive ? "#A6F4C5" : B.border,
                    background: bank.isActive ? "linear-gradient(90deg, #ECFDF3 0%, var(--admin-card) 55%)" : "var(--admin-card)",
                  }}
                >
                  <span className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color }} />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        <Landmark size={20} />
                      </span>
                    <div className="min-w-0 space-y-1">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        <StatusIcon size={12} />
                        {meta.label}
                      </span>
                      <p className="text-base font-bold" style={{ color: B.blue }}>
                        {bank.holderName} <span className="font-mono text-sm" style={{ color: B.muted }}>· ****{bank.accountNumberLast4}</span>
                      </p>
                      <span
                        className="inline-flex rounded-lg px-2 py-0.5 font-mono text-xs font-semibold"
                        style={{ background: "rgba(42,92,221,0.08)", color: B.blueMid }}
                      >
                        IFSC {bank.ifsc}
                      </span>
                      <p className="text-xs leading-relaxed" style={{ color: B.muted }}>
                        {meta.hint}
                      </p>
                      {bank.bankHolderName ? (
                        <p className="text-xs" style={{ color: B.muted }}>
                          Name as per bank:{" "}
                          <span className="font-bold" style={{ color: B.blue }}>
                            {bank.bankHolderName}
                          </span>
                        </p>
                      ) : !bank.verified ? (
                        <p className="text-xs font-semibold" style={{ color: "#B42318" }}>
                          {bank.bankCheckMessage || "Not checked with the bank yet"}
                        </p>
                      ) : null}
                    </div>
                    </div>

                    {bank.isActive && bank.coolingUntil && new Date(bank.coolingUntil).getTime() > Date.now() ? (
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px]">
                        <button
                          type="button"
                          disabled={acting === bank.id}
                          onClick={() => setReleaseTarget(bank)}
                          className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                          style={{ borderColor: "#FEC84B", color: "#B54708", background: "#FFFAEB" }}
                        >
                          Remove withdrawal hold
                        </button>
                        <p className="text-[11px] leading-snug" style={{ color: B.muted }}>
                          Call the agent on their registered mobile first and confirm they changed the bank.
                        </p>
                      </div>
                    ) : null}

                    {!bank.verified ? (
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px]">
                        {bank.bankCheckStatus === "verified" ? (
                          <>
                            <button
                              type="button"
                              disabled={acting === bank.id}
                              onClick={() => setConfirm({ bank, activate: true })}
                              className="rounded-xl px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                              style={{ background: "#12B76A" }}
                            >
                              Verify & activate
                            </button>
                            <button
                              type="button"
                              disabled={acting === bank.id}
                              onClick={() => setConfirm({ bank, activate: false })}
                              className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                              style={{ borderColor: B.border, color: B.blue }}
                            >
                              Verify only
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          disabled={acting === bank.id}
                          onClick={() => void recheck(bank)}
                          className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                          style={{ borderColor: "#B2CCFF", color: B.blueLight, background: "#EFF4FF" }}
                        >
                          {acting === bank.id ? "Checking with bank…" : "Re-check with bank"}
                        </button>
                        <p className="text-[11px] leading-snug" style={{ color: B.muted }}>
                          {bank.bankCheckStatus === "verified" ? (
                            <>
                              Prefer <span className="font-semibold">Verify & activate</span> for the
                              first bank so withdrawals can start.
                            </>
                          ) : (
                            <>
                              Bank has not confirmed this account. To approve with your own reference, use{" "}
                              <Link href="/settlements?tab=banks" className="font-semibold underline">
                                Pending banks
                              </Link>
                              .
                            </>
                          )}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs" style={{ color: B.muted }}>
          Full queue across all agents:{" "}
          <Link href="/settlements?tab=banks" className="font-semibold underline-offset-2 hover:underline" style={{ color: B.blueMid }}>
            Settlements → Pending banks
          </Link>
        </p>
      </DetailSection>

      {confirm ? (
        <ConfirmModal
          title={confirm.activate ? "Verify and activate this bank?" : "Verify this bank only?"}
          message={
            <div className="space-y-2 text-sm" style={{ color: B.muted }}>
              <p>
                <span className="font-semibold" style={{ color: B.blue }}>
                  {confirm.bank.holderName} · ****{confirm.bank.accountNumberLast4}
                </span>
                <br />
                IFSC {confirm.bank.ifsc}
              </p>
              <p>
                {confirm.activate
                  ? "This becomes the active payout bank. If another bank was active, a 24-hour cooling period may apply."
                  : "Account is marked verified but stays inactive until the agent (or you) activates it."}
              </p>
            </div>
          }
          confirmLabel={confirm.activate ? "Verify & activate" : "Verify only"}
          tone={confirm.activate ? "warning" : "info"}
          busy={!!acting}
          busyLabel="Verifying…"
          onClose={() => {
            if (!acting) setConfirm(null);
          }}
          onConfirm={() => void runVerify()}
        />
      ) : null}

      {releaseTarget ? (
        <ConfirmModal
          title="Remove the withdrawal hold?"
          message={
            <div className="space-y-2 text-sm" style={{ color: B.muted }}>
              <p>
                <span className="font-semibold" style={{ color: B.blue }}>
                  {releaseTarget.holderName} · ****{releaseTarget.accountNumberLast4}
                </span>
                <br />
                IFSC {releaseTarget.ifsc}
              </p>
              <p>
                The agent can withdraw to this bank right away. Do this only after you have called the agent and they
                confirmed the bank change. This is saved in the audit log.
              </p>
            </div>
          }
          confirmLabel="Remove hold"
          tone="warning"
          busy={!!acting}
          busyLabel="Removing…"
          onClose={() => {
            if (!acting) setReleaseTarget(null);
          }}
          onConfirm={() => void runRelease()}
        />
      ) : null}
    </>
  );
}
