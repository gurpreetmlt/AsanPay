"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Landmark, Plus, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import api, { fetchApi } from "@/lib/api";
import {
  bankBrandTint,
  bankCardGlow,
  bankCardGradient,
  bankCodeFromIfsc,
  bankLogoUrl,
  formatSettlementBankCopy,
} from "@/lib/bankLogo";
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
}

type PlaceMap = Record<string, IfscPlace>;

function BankLogo({ ifsc }: { ifsc: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: `${B.blueLight}18`, color: B.blueLight }}
      >
        <Landmark size={18} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={bankLogoUrl(ifsc)}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 rounded-xl bg-white object-contain p-1 shadow-sm"
      style={{ border: `1px solid ${B.border}` }}
      onError={() => setFailed(true)}
    />
  );
}

function SettlementBankCard({
  bank,
  place,
  revealed,
  revealing,
  onToggleReveal,
  onCopy,
}: {
  bank: SettlementBank;
  place?: IfscPlace;
  revealed: string | undefined;
  revealing: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
}) {
  const active = bank.verified && bank.isActive;
  const showFull = Boolean(revealed);
  const tint = bankBrandTint(bank.ifsc);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-4"
      style={{
        borderColor: active ? `${tint}66` : B.border,
        background: bankCardGradient(bank.ifsc),
        boxShadow: bankCardGlow(bank.ifsc, active),
      }}
    >
      <div className="relative flex items-start justify-between gap-2">
        <BankLogo ifsc={bank.ifsc} />
        <StatusBadge tone={active ? "success" : bank.verified ? "info" : "pending"}>
          {bank.verified ? (bank.isActive ? "Active" : "Verified") : "Pending"}
        </StatusBadge>
      </div>

      <div className="relative mt-4 flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
            Account
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold tracking-wider" style={{ color: B.blue }}>
            {showFull ? revealed : `**** ${bank.accountNumberLast4}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleReveal}
            disabled={revealing}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white/80"
            style={{ borderColor: B.border, color: B.blueLight, opacity: revealing ? 0.6 : 1 }}
            aria-label={showFull ? "Hide account number" : "Show account number"}
            title={showFull ? "Hide" : "Show"}
          >
            {showFull ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={revealing}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white/80"
            style={{ borderColor: B.border, color: B.blueLight, opacity: revealing ? 0.6 : 1 }}
            aria-label="Copy all bank details"
            title="Copy all details"
          >
            <Copy size={16} />
          </button>
        </div>
      </div>

      <p className="relative mt-3 text-sm font-semibold" style={{ color: B.blue }}>
        {bank.holderName}
      </p>
      <p className="relative mt-1 font-mono text-xs" style={{ color: B.muted }}>
        IFSC · {bank.ifsc}
      </p>
      {place?.bank ? (
        <p className="relative mt-0.5 truncate text-[11px]" style={{ color: B.muted }}>
          {place.bank}
          {place.branch ? ` · ${place.branch}` : ""}
        </p>
      ) : null}
    </div>
  );
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
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [holderName, setHolderName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [fetchedPlace, setFetchedPlace] = useState<IfscPlace | null>(null);
  const [ifscBusy, setIfscBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [places, setPlaces] = useState<PlaceMap>({});
  const [busyId, setBusyId] = useState<string | null>(null);

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

  useEffect(() => {
    const code = ifsc.trim().toUpperCase();
    if (code.length !== 11) {
      setFetchedPlace(null);
      return;
    }
    let cancelled = false;
    setIfscBusy(true);
    void lookupIndianIfsc(code).then((place) => {
      if (cancelled) return;
      setIfscBusy(false);
      if (!place) {
        setFetchedPlace(null);
        toast.error("IFSC not found. Check the code and try again.");
        return;
      }
      setFetchedPlace(place);
    });
    return () => {
      cancelled = true;
    };
  }, [ifsc]);

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
          bankName: place?.bank || bankCodeFromIfsc(bank.ifsc),
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

  function resetForm() {
    setAccountNumber("");
    setIfsc("");
    setHolderName("");
    setOtp("");
    setOtpSent(false);
    setFetchedPlace(null);
  }

  async function sendOtp() {
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
    const code = ifsc.trim().toUpperCase();
    if (code.length !== 11) {
      toast.error("Enter a valid 11-character IFSC");
      return;
    }
    if (!fetchedPlace?.bank) {
      toast.error("Wait for bank details to load from IFSC, or check the code");
      return;
    }
    if (needsOtp && !/^\d{6}$/.test(otp.trim())) {
      toast.error("Enter the 6-digit OTP sent to your mobile");
      return;
    }
    setSaving(true);
    try {
      await api.post("/settlements/banks", {
        accountNumber: accountNumber.trim(),
        ifsc: code,
        holderName: holderName.trim(),
        ...(needsOtp ? { otp: otp.trim() } : {}),
      });
      toast.success("Bank submitted — awaiting admin verification");
      setShowBankForm(false);
      resetForm();
      await load();
    } catch (err) {
      toast.error(extractApiError(err, "Could not register bank"));
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
          className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
          style={{ borderColor: B.border, background: B.bg }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
              IFSC *
            </span>
            <input
              className="w-full rounded-xl border px-3 py-2.5 font-mono text-sm outline-none"
              style={{ borderColor: B.border, background: "#fff" }}
              placeholder="e.g. SBIN0001234"
              value={ifsc}
              onChange={(e) =>
                setIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))
              }
              required
            />
            <span className="mt-1 block text-xs" style={{ color: B.muted }}>
              {ifsc.length}/11 {ifscBusy ? "· Looking up…" : ""}
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
              Bank name
            </span>
            <input
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border, background: "#F8FAFC", color: B.blue }}
              value={fetchedPlace?.bank || ""}
              readOnly
              placeholder={ifscBusy ? "Looking up…" : "Auto from IFSC"}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
              Branch
            </span>
            <input
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border, background: "#F8FAFC", color: B.blue }}
              value={
                fetchedPlace
                  ? [fetchedPlace.branch, fetchedPlace.city].filter(Boolean).join(", ")
                  : ""
              }
              readOnly
              placeholder={ifscBusy ? "Looking up…" : "Auto from IFSC"}
              title={
                fetchedPlace
                  ? [fetchedPlace.branch, fetchedPlace.city].filter(Boolean).join(", ")
                  : undefined
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
              Account number *
            </span>
            <input
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border, background: "#fff" }}
              placeholder="Account number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 18))}
              required
            />
          </label>
          <label className="block text-sm lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
              Account holder *
            </span>
            <input
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border, background: "#fff" }}
              placeholder="Account holder name"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              required
            />
          </label>

          {needsOtp ? (
            <div
              className="rounded-xl border px-3 py-3 sm:col-span-2 lg:col-span-3"
              style={{ borderColor: "#FDBA74", background: "#FFF7ED" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#C2410C" }}>
                You already have an active settlement bank. Changing it requires a mobile OTP.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="min-w-[160px] flex-1 text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
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
                  {otpSent ? "Resend OTP" : "Send OTP"}
                </PrimaryButton>
              </div>
              {otpSent ? (
                <p className="mt-2 text-xs" style={{ color: B.muted }}>
                  OTP sent to your registered mobile. Enter it above, then submit.
                </p>
              ) : null}
            </div>
          ) : null}

          <PrimaryButton
            type="submit"
            variant="primary"
            disabled={
              saving ||
              ifscBusy ||
              !fetchedPlace?.bank ||
              !accountNumber.trim() ||
              ifsc.trim().length !== 11 ||
              !holderName.trim() ||
              (needsOtp && !/^\d{6}$/.test(otp.trim()))
            }
            loading={saving}
            className="sm:col-span-2 lg:col-span-3"
          >
            Submit for verification
          </PrimaryButton>
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
          {banks.map((b) => (
            <SettlementBankCard
              key={b.id}
              bank={b}
              place={places[b.id]}
              revealed={revealed[b.id]}
              revealing={busyId === b.id}
              onToggleReveal={() => void toggleReveal(b)}
              onCopy={() => void copyBank(b)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
