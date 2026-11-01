"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Landmark, Plus, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { BankDetailCard } from "@/components/banking/BankAccountDetailsCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  emptyIfscBankDetails,
  IfscBankDetailsFields,
  type IfscBankDetailsValue,
} from "@/components/banking/IfscBankDetailsFields";
import api, { fetchApi } from "@/lib/api";
import { bankNameFromIfsc, formatSettlementBankCopy } from "@/lib/bankLogo";
import { B } from "@/lib/brand";
import { lookupIndianIfsc, type IfscPlace } from "@/lib/ifsc";
import { extractApiError } from "@/lib/onboarding";
import { BANK_NAME_MATCH_COPY, bankNameMatch, type ApiResponse } from "@asanpay/shared-types";

export interface SettlementBank {
  id: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
  isActive: boolean;
  verified: boolean;
  effectiveFrom?: string;
  coolingUntil?: string | null;
  bankCheckStatus?: "verified" | "not_confirmed" | "pending" | "error" | null;
  bankHolderName?: string | null;
  bankCheckMessage?: string | null;
}

interface BankCheckResult {
  status: "verified" | "not_confirmed" | "pending" | "error";
  bankName: string | null;
  message: string;
  charged: string;
  cached: boolean;
}

const NOT_CONFIRMED_COPY = "Bank could not confirm this account. Check the account number and IFSC.";

const rupees = (v: string) => `₹${Number(v).toFixed(2)}`;

function matchPill(level: string) {
  if (level === "match") return "bg-green-100 text-green-800";
  if (level === "partial") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

type PlaceMap = Record<string, IfscPlace>;

/** Post-change withdrawal hold, e.g. "Withdrawals paused until 2 Nov, 6:35 pm (23 h 10 min left)". */
function holdNote(coolingUntil: string | null | undefined, now: number): string | null {
  if (!coolingUntil) return null;
  const until = new Date(coolingUntil);
  const ms = until.getTime() - now;
  if (!(ms > 0)) return null;
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.max(1, Math.ceil((ms % 3_600_000) / 60_000));
  const left = hours > 0 ? `${hours} h ${mins} min left` : `${mins} min left`;
  const at = until.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `Withdrawals paused until ${at} (${left}) — the settlement bank was changed recently`;
}

/** Compact settlement bank cards + KYC-style IFSC add form. */
export function SettlementBanksPanel({
  showAddFormDefault = false,
  compact = false,
  allowAdd = true,
  onBanksChange,
}: {
  showAddFormDefault?: boolean;
  compact?: boolean;
  allowAdd?: boolean;
  onBanksChange?: (banks: SettlementBank[]) => void;
}) {
  const [banks, setBanks] = useState<SettlementBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBankForm, setShowBankForm] = useState(showAddFormDefault && allowAdd);
  const [bankDetails, setBankDetails] = useState<IfscBankDetailsValue>(emptyIfscBankDetails);
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [places, setPlaces] = useState<PlaceMap>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activateTarget, setActivateTarget] = useState<SettlementBank | null>(null);
  const [activating, setActivating] = useState(false);
  const [lastCheck, setLastCheck] = useState<{ holderName: string; result: BankCheckResult } | null>(null);
  const [prices, setPrices] = useState<{ standard: string; pennyDrop: string } | null>(null);

  const needsOtp = banks.some((b) => b.isActive && b.verified);
  const [now, setNow] = useState(() => Date.now());
  const holdActive = banks.some((b) => b.isActive && b.coolingUntil && new Date(b.coolingUntil).getTime() > now);
  useEffect(() => {
    if (!holdActive) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [holdActive]);

  useEffect(() => {
    if (!allowAdd) return;
    let cancelled = false;
    void api
      .get<ApiResponse<{ standard: string; pennyDrop: string }>>("/txn/dmt/beneficiary/bank-check/price")
      .then(({ data }) => {
        if (!cancelled && data.success) setPrices(data.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [allowAdd]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchApi<SettlementBank[]>("/settlements/banks");
      setBanks(list);
      onBanksChange?.(list);
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load banks"));
    } finally {
      setLoading(false);
    }
  }, [onBanksChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: PlaceMap = {};
      await Promise.all(
        banks.map(async (b) => {
          const place = await lookupIndianIfsc(b.ifsc);
          if (place) next[b.id] = place;
        }),
      );
      if (!cancelled) setPlaces(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [banks]);

  async function fetchReveal(bankId: string): Promise<string> {
    if (revealed[bankId]) return revealed[bankId];
    const data = await fetchApi<{ accountNumber: string }>(`/settlements/banks/${bankId}/reveal`);
    setRevealed((prev) => ({ ...prev, [bankId]: data.accountNumber }));
    return data.accountNumber;
  }

  async function resolvePlace(bank: SettlementBank): Promise<IfscPlace | null> {
    if (places[bank.id]) return places[bank.id];
    const place = await lookupIndianIfsc(bank.ifsc);
    if (place) setPlaces((prev) => ({ ...prev, [bank.id]: place }));
    return place;
  }

  async function toggleReveal(bank: SettlementBank) {
    if (revealed[bank.id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[bank.id];
        return next;
      });
      return;
    }
    setBusyId(bank.id);
    try {
      await fetchReveal(bank.id);
    } catch (err) {
      toast.error(extractApiError(err, "Could not show account number"));
    } finally {
      setBusyId(null);
    }
  }

  async function copyBank(bank: SettlementBank) {
    setBusyId(bank.id);
    try {
      const [accountNumberFull, place] = await Promise.all([
        fetchReveal(bank.id),
        resolvePlace(bank),
      ]);
      await navigator.clipboard.writeText(
        formatSettlementBankCopy({
          bankName: place?.bank || bankNameFromIfsc(bank.ifsc),
          branch: place?.branch,
          city: place?.city,
          holderName: bank.holderName,
          accountNumber: accountNumberFull,
          ifsc: bank.ifsc,
        }),
      );
      toast.success("All bank details copied");
    } catch (err) {
      toast.error(extractApiError(err, "Could not copy bank details"));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmActivate() {
    if (!activateTarget) return;
    setActivating(true);
    try {
      const res = await api.post<{
        success: boolean;
        message?: string;
        data?: { coolingUntil: string | null };
      }>(`/settlements/banks/${activateTarget.id}/activate`);
      const cooling = res.data?.data?.coolingUntil;
      if (cooling && new Date(cooling).getTime() > Date.now()) {
        toast.success(
          res.data?.message ||
            "Bank activated — withdrawals pause for 24 hours after the change",
        );
      } else {
        toast.success(res.data?.message || "Settlement bank activated");
      }
      setActivateTarget(null);
      await load();
    } catch (err) {
      toast.error(extractApiError(err, "Could not activate bank"));
    } finally {
      setActivating(false);
    }
  }

  function resetForm() {
    setBankDetails(emptyIfscBankDetails());
    setOtp("");
    setOtpSent(false);
  }

  async function sendOtp() {
    if (bankDetails.ifsc.trim().length !== 11 || !bankDetails.bankName.trim()) {
      toast.error("Enter a valid IFSC and wait for bank details to load");
      return;
    }
    if (!/^\d{6,18}$/.test(bankDetails.accountNumber.trim())) {
      toast.error("Account number must be 6–18 digits");
      return;
    }
    if (!bankDetails.holderName.trim() || !/[A-Za-z]/.test(bankDetails.holderName)) {
      toast.error("Account holder must be a name (letters), not the account number");
      return;
    }
    setOtpSending(true);
    try {
      const { data } = await api.post<{
        success: boolean;
        data?: { expiresInSec: number; otp?: string };
        message?: string;
      }>("/settlements/banks/otp");
      setOtpSent(true);
      const testOtp = process.env.NODE_ENV !== "production" ? data.data?.otp : undefined;
      if (testOtp) {
        setOtp(testOtp);
        toast.success(`OTP ready: ${testOtp}`);
      } else {
        toast.success("OTP sent to your registered mobile");
      }
    } catch (err) {
      toast.error(extractApiError(err, "Could not send OTP"));
    } finally {
      setOtpSending(false);
    }
  }

  async function registerBank(e: FormEvent) {
    e.preventDefault();
    const code = bankDetails.ifsc.trim().toUpperCase();
    if (code.length !== 11) {
      toast.error("Enter a valid 11-character IFSC");
      return;
    }
    if (!bankDetails.bankName.trim()) {
      toast.error("Wait for bank details to load from IFSC, or check the code");
      return;
    }
    if (bankDetails.accountNumber !== (bankDetails.accountNumberConfirm ?? "")) {
      toast.error("Account numbers do not match");
      return;
    }
    if (needsOtp && !/^\d{6}$/.test(otp.trim())) {
      toast.error("Enter the 6-digit OTP sent to your mobile");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<ApiResponse<{ bankCheck: BankCheckResult }>>("/settlements/banks", {
        accountNumber: bankDetails.accountNumber.trim(),
        ifsc: code,
        holderName: bankDetails.holderName.trim(),
        ...(needsOtp ? { otp: otp.trim() } : {}),
      });
      const check = data.success ? data.data.bankCheck : null;
      if (check) setLastCheck({ holderName: bankDetails.holderName.trim(), result: check });
      if (check?.status === "verified") toast.success("Bank confirmed the account — awaiting admin verification");
      else if (check?.status === "not_confirmed") toast.error(NOT_CONFIRMED_COPY);
      else toast.success("Bank submitted — awaiting admin verification");
      setShowBankForm(false);
      resetForm();
      await load();
    } catch (err) {
      const msg = extractApiError(err, "Could not register bank");
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(status ? `${msg} (${status})` : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!compact ? (
            <h2 className="text-lg font-bold" style={{ color: B.blue }}>
              Settlement banks
            </h2>
          ) : null}
          <p className={`text-sm ${compact ? "" : "mt-0.5"}`} style={{ color: B.muted }}>
            {allowAdd
              ? "Verified accounts used for withdrawals. Add or manage banks here."
              : "Verified accounts used for withdrawals. Add or edit banks in Settings."}
          </p>
        </div>
        {allowAdd ? (
          <PrimaryButton
            type="button"
            variant={showBankForm ? "destructive" : "success"}
            size="sm"
            showArrow={false}
            onClick={() => {
              setShowBankForm((v) => !v);
              if (showBankForm) resetForm();
            }}
            className="!w-auto"
          >
            {showBankForm ? <X size={14} /> : <Plus size={14} />}
            {showBankForm ? "Cancel" : "Add bank"}
          </PrimaryButton>
        ) : null}
      </div>

      {allowAdd && showBankForm ? (
        <form
          onSubmit={registerBank}
          className="space-y-3 rounded-2xl border p-4"
          style={{ borderColor: B.border, background: B.bg }}
        >
          <IfscBankDetailsFields
            value={bankDetails}
            onChange={(patch) => setBankDetails((prev) => ({ ...prev, ...patch }))}
            showHolder
            showConfirmAccount
            disabled={saving || otpSending}
            footer={
              needsOtp ? (
                <div
                  className="rounded-xl border px-3 py-3 sm:col-span-2 lg:col-span-3"
                  style={{ borderColor: "#FDBA74", background: "#FFF7ED" }}
                >
                  <p className="text-sm font-semibold" style={{ color: "#C2410C" }}>
                    You already have an active settlement bank. Changing it requires a mobile OTP after
                    you confirm the bank details.
                  </p>
                  {otpSent ? (
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="min-w-[160px] flex-1 text-sm">
                        <span
                          className="mb-1 block text-xs font-semibold uppercase"
                          style={{ color: B.muted }}
                        >
                          OTP *
                        </span>
                        <input
                          className="w-full rounded-xl border px-3 py-2.5 font-mono text-sm outline-none"
                          style={{ borderColor: B.border, background: "#fff" }}
                          placeholder="6-digit OTP"
                          inputMode="numeric"
                          maxLength={6}
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          required
                        />
                      </label>
                      <PrimaryButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        showArrow={false}
                        loading={otpSending}
                        disabled={otpSending}
                        onClick={() => void sendOtp()}
                        className="!w-auto"
                      >
                        Resend OTP
                      </PrimaryButton>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs" style={{ color: B.muted }}>
                      Fill IFSC, account number, and holder name, then tap Verify &amp; send OTP.
                    </p>
                  )}
                  {otpSent ? (
                    <p className="mt-2 text-xs" style={{ color: B.muted }}>
                      OTP sent to your registered mobile. Enter it above, then submit.
                    </p>
                  ) : null}
                </div>
              ) : null
            }
          />

          <p className="text-xs" style={{ color: B.muted }}>
            On submit we confirm this account with the bank and get the account holder name.{" "}
            {prices
              ? `${rupees(prices.standard)} per check, or ${rupees(prices.pennyDrop)} if the bank needs a ₹1 test credit`
              : "A small fee per check"}{" "}
            — debited from your main wallet only when the bank confirms. Same account checked within 90 days is free.
          </p>

          {needsOtp && !otpSent ? (
            <div className="flex justify-end">
              <PrimaryButton
                type="button"
                variant="primary"
                disabled={
                  otpSending ||
                  !bankDetails.bankName.trim() ||
                  !bankDetails.accountNumber.trim() ||
                  bankDetails.ifsc.trim().length !== 11 ||
                  !bankDetails.holderName.trim() ||
                  !/[A-Za-z]/.test(bankDetails.holderName)
                }
                loading={otpSending}
                onClick={() => void sendOtp()}
                className="!w-auto"
              >
                Verify &amp; send OTP
              </PrimaryButton>
            </div>
          ) : (
            <div className="flex justify-end">
              <PrimaryButton
                type="submit"
                variant="primary"
                disabled={
                  saving ||
                  !bankDetails.bankName.trim() ||
                  !bankDetails.accountNumber.trim() ||
                  bankDetails.ifsc.trim().length !== 11 ||
                  !bankDetails.holderName.trim() ||
                  (needsOtp && !/^\d{6}$/.test(otp.trim()))
                }
                loading={saving}
                className="!w-auto"
              >
                Submit for verification
              </PrimaryButton>
            </div>
          )}
        </form>
      ) : null}

      {lastCheck ? <BankCheckSummary holderName={lastCheck.holderName} result={lastCheck.result} onDismiss={() => setLastCheck(null)} /> : null}

      {loading ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : banks.length === 0 ? (
        <EmptyState
          icon={<Landmark size={22} strokeWidth={1.75} />}
          title="No settlement banks yet"
          description="Add a bank account to withdraw settleable balance."
          action={
            allowAdd ? (
              <PrimaryButton
                type="button"
                variant="success"
                size="sm"
                showArrow={false}
                className="!w-auto"
                onClick={() => setShowBankForm(true)}
              >
                <Plus size={14} />
                Add bank
              </PrimaryButton>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {banks.map((b) => {
            const place = places[b.id];
            const active = b.verified && b.isActive;
            const hold = active ? holdNote(b.coolingUntil, now) : null;
            return (
              <BankDetailCard
                key={b.id}
                ifsc={b.ifsc}
                holderName={b.holderName}
                accountMasked={`**** ${b.accountNumberLast4}`}
                accountFull={revealed[b.id]}
                revealed={Boolean(revealed[b.id])}
                revealing={busyId === b.id}
                onToggleReveal={() => void toggleReveal(b)}
                onCopy={() => void copyBank(b)}
                statusTone={active ? "success" : b.verified ? "info" : "pending"}
                statusLabel={
                  active ? "Active" : b.verified ? "Verified" : "Pending verification"
                }
                bankName={place?.bank}
                branch={place?.branch}
                note={
                  !b.verified ? (
                    <span className="block text-[11px] font-semibold" style={{ color: B.muted }}>
                      Waiting for admin verification
                      {b.bankHolderName ? (
                        <span className="block" style={{ color: "#027A48" }}>
                          Name as per bank: {b.bankHolderName}
                        </span>
                      ) : b.bankCheckStatus === "not_confirmed" ? (
                        <span className="block text-red-600">{NOT_CONFIRMED_COPY}</span>
                      ) : b.bankCheckStatus === "pending" ? (
                        <span className="block text-amber-700">The bank is still confirming this account</span>
                      ) : null}
                    </span>
                  ) : hold ? (
                    <span className="block text-[11px] font-semibold text-amber-700">{hold}</span>
                  ) : undefined
                }
                onActivate={
                  b.verified && !b.isActive ? () => setActivateTarget(b) : undefined
                }
              />
            );
          })}
        </div>
      )}

      {activateTarget ? (
        <ConfirmModal
          title="Switch active bank?"
          tone="warning"
          confirmLabel="Set as active"
          busy={activating}
          busyLabel="Activating…"
          message={
            <>
              Switch active settlement bank to{" "}
              <strong>
                {bankNameFromIfsc(activateTarget.ifsc) || "Bank"} ****
                {activateTarget.accountNumberLast4}
              </strong>
              ? Withdrawals pause for 24 hours after the change.
            </>
          }
          onClose={() => {
            if (!activating) setActivateTarget(null);
          }}
          onConfirm={() => void confirmActivate()}
        />
      ) : null}
    </div>
  );
}

function BankCheckSummary({
  holderName,
  result,
  onDismiss,
}: {
  holderName: string;
  result: BankCheckResult;
  onDismiss: () => void;
}) {
  const match = result.status === "verified" && result.bankName ? bankNameMatch(holderName, result.bankName) : null;
  return (
    <div className="relative rounded-2xl border p-4" style={{ borderColor: B.border, background: "#F7F9FF" }}>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-xs font-semibold"
        style={{ color: B.muted }}
      >
        <X size={14} />
      </button>
      {result.status === "verified" ? (
        <div className="space-y-2 pr-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
              Name as per bank
            </span>
            {match ? (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${matchPill(match.level)}`}>
                {match.percent}%
              </span>
            ) : null}
          </div>
          <p className="text-sm font-bold" style={{ color: B.blue }}>
            {result.bankName ?? "Bank did not return a name"}
          </p>
          {match ? (
            <p className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${matchPill(match.level)}`}>
              {BANK_NAME_MATCH_COPY[match.level]}
            </p>
          ) : null}
          <p className="text-[11px]" style={{ color: B.muted }}>
            {result.cached || Number(result.charged) === 0
              ? "Checked earlier — no charge."
              : `${rupees(result.charged)} debited from your wallet.`}{" "}
            Admin verifies the bank before you can withdraw.
          </p>
        </div>
      ) : (
        <p
          className={`pr-6 text-xs font-semibold ${result.status === "pending" ? "text-amber-800" : "text-red-700"}`}
        >
          {result.status === "not_confirmed"
            ? `${NOT_CONFIRMED_COPY} You were not charged.`
            : result.status === "pending"
              ? "The bank is still confirming this account. Admin will re-check it — you were not charged."
              : "Bank check could not run right now. Admin will re-check it — you were not charged."}
        </p>
      )}
    </div>
  );
}
