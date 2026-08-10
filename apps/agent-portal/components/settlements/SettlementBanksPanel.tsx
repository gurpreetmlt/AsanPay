"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Landmark, Plus } from "lucide-react";
import { toast } from "react-hot-toast";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { bankLogoUrl, formatSettlementBankCopy } from "@/lib/bankLogo";
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

type RevealedMap = Record<string, string>;

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
      className="h-10 w-10 rounded-xl object-contain bg-white p-1"
      style={{ border: `1px solid ${B.border}` }}
      onError={() => setFailed(true)}
    />
  );
}

function SettlementBankCard({
  bank,
  revealed,
  revealing,
  onToggleReveal,
  onCopy,
}: {
  bank: SettlementBank;
  revealed: string | undefined;
  revealing: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
}) {
  const active = bank.verified && bank.isActive;
  const showFull = Boolean(revealed);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-4 shadow-sm"
      style={{
        borderColor: active ? `${B.blueLight}66` : B.border,
        background: active
          ? `linear-gradient(145deg, ${B.blueLight}14 0%, #fff 45%, #fff 100%)`
          : "#fff",
      }}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20"
        style={{ background: B.badgeGrad }}
      />
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border"
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border"
            style={{ borderColor: B.border, color: B.blueLight, opacity: revealing ? 0.6 : 1 }}
            aria-label="Copy bank details"
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
    </div>
  );
}

/** Credit-card style settlement bank cards + optional add form. */
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
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<RevealedMap>({});
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function fetchReveal(bankId: string): Promise<string> {
    const cached = revealed[bankId];
    if (cached) return cached;
    const data = await fetchApi<{ accountNumber: string }>(`/settlements/banks/${bankId}/reveal`);
    setRevealed((prev) => ({ ...prev, [bankId]: data.accountNumber }));
    return data.accountNumber;
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
      const accountNumber = await fetchReveal(bank.id);
      await navigator.clipboard.writeText(
        formatSettlementBankCopy({
          holderName: bank.holderName,
          accountNumber,
          ifsc: bank.ifsc,
        }),
      );
      toast.success("Bank details copied");
    } catch (err) {
      toast.error(extractApiError(err, "Could not copy bank details"));
    } finally {
      setBusyId(null);
    }
  }

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
            variant="secondary"
            size="sm"
            showArrow={false}
            onClick={() => setShowBankForm((v) => !v)}
            className="!w-auto"
          >
            <Plus size={14} />
            {showBankForm ? "Cancel" : "Add bank"}
          </PrimaryButton>
        ) : null}
      </div>

      {allowAdd && showBankForm ? (
        <form
          onSubmit={registerBank}
          className="grid gap-3 rounded-2xl border p-4 md:grid-cols-3"
          style={{ borderColor: B.border, background: B.bg }}
        >
          <input
            className="rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: B.border, background: "#fff" }}
            placeholder="Account number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            required
          />
          <input
            className="rounded-xl border px-3 py-2.5 text-sm uppercase outline-none"
            style={{ borderColor: B.border, background: "#fff" }}
            placeholder="IFSC"
            value={ifsc}
            onChange={(e) => setIfsc(e.target.value)}
            required
          />
          <input
            className="rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: B.border, background: "#fff" }}
            placeholder="Account holder name"
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            required
          />
          <PrimaryButton
            type="submit"
            variant="primary"
            disabled={saving || !accountNumber.trim() || !ifsc.trim() || !holderName.trim()}
            loading={saving}
            className="md:col-span-3"
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
                variant="secondary"
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
