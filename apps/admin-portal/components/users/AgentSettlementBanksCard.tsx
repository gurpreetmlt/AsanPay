"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Landmark } from "lucide-react";
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

  return (
    <>
      <DetailSection title="Settlement banks" icon={Landmark}>
        <p className="mb-4 text-sm leading-relaxed" style={{ color: B.muted }}>
          These accounts are used for agent withdrawals. KYC bank details above are for identity —
          settlement banks below need a separate verify step.
        </p>

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading banks…
          </p>
        ) : banks.length === 0 ? (
          <div
            className="rounded-xl border border-dashed px-4 py-5 text-sm"
            style={{ borderColor: B.border, color: B.muted }}
          >
            No settlement bank yet. When the agent adds one, it will show here for verification.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingCount > 0 ? (
              <div
                className="rounded-xl px-3 py-2 text-sm font-medium"
                style={{ background: "#FFFAEB", color: "#B54708" }}
              >
                {pendingCount} bank{pendingCount === 1 ? "" : "s"} waiting for your verification
              </div>
            ) : null}

            {banks.map((bank) => {
              const meta = statusMeta(bank);
              return (
                <div
                  key={bank.id}
                  className="rounded-2xl border bg-white p-4"
                  style={{ borderColor: bank.isActive ? "#A6F4C5" : B.border }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <span
                        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <p className="text-base font-bold" style={{ color: B.blue }}>
                        {bank.holderName} · ****{bank.accountNumberLast4}
                      </p>
                      <p className="text-sm font-medium" style={{ color: B.blueMid }}>
                        IFSC {bank.ifsc}
                      </p>
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
    </>
  );
}
