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

export interface SettlementBank {
  id: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
  isActive: boolean;
  verified: boolean;
  effectiveFrom?: string;
  coolingUntil?: string | null;
}

type PlaceMap = Record<string, IfscPlace>;

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

  const needsOtp = banks.some((b) => b.isActive && b.verified);

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
      const testOtp = data.data?.otp;
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
      await api.post("/settlements/banks", {
        accountNumber: bankDetails.accountNumber.trim(),
        ifsc: code,
        holderName: bankDetails.holderName.trim(),
        ...(needsOtp ? { otp: otp.trim() } : {}),
      });
      toast.success("Bank submitted — awaiting admin verification");
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
                    <span className="text-[11px] font-semibold" style={{ color: B.muted }}>
                      Waiting for admin verification
                    </span>
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
