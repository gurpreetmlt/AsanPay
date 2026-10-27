"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, BadgeCheck, Clock, Landmark, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { extractApiError } from "@/lib/onboarding";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import {
  BANK_NAME_MATCH_COPY,
  bankNameMatch,
  type ApiResponse,
} from "@asanpay/shared-types";

interface BankCheckResult {
  status: "verified" | "not_confirmed" | "pending";
  bankName: string | null;
  method: "pennyless" | "pennydrop" | null;
  charged: string;
  cached: boolean;
  message: string;
}

interface Prices {
  nameCheck: string;
  pennyDrop: string;
}

const rupees = (v: string) => `₹${Number(v).toFixed(2)}`;

/** Optional bank name check before adding a payee. A result is dropped when the account or IFSC changes. */
export function BankNameCheck({
  accountNumber,
  ifsc,
  typedName,
  onUseBankName,
}: {
  accountNumber: string;
  ifsc: string;
  typedName: string;
  onUseBankName: (name: string) => void;
}) {
  const [prices, setPrices] = useState<Prices | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BankCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** One idempotency key per account + IFSC attempt, reused only for retries of that attempt. */
  const attempt = useRef<{ details: string; key: ReturnType<typeof createAttemptKeyHolder> } | null>(null);
  const details = `${accountNumber}|${ifsc}`;
  const [checkedDetails, setCheckedDetails] = useState(details);
  if (checkedDetails !== details) {
    setCheckedDetails(details);
    setResult(null);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    void api
      .get<ApiResponse<Prices>>("/txn/dmt/beneficiary/bank-check/price")
      .then(({ data }) => {
        if (!cancelled && data.success) setPrices(data.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = /^\d{6,18}$/.test(accountNumber) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);

  async function verify() {
    if (!ready) {
      setError("Enter the account number (6–18 digits) and a valid IFSC first");
      return;
    }
    if (attempt.current?.details !== details) {
      attempt.current = { details, key: createAttemptKeyHolder("bank-check") };
    }
    const holder = attempt.current.key;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<ApiResponse<BankCheckResult>>("/txn/dmt/beneficiary/bank-check", {
        accountNumber,
        ifsc,
        idempotencyKey: holder.get(),
      });
      if (!data.success) throw new Error(data.message || "Bank name check failed. Try again.");
      setResult(data.data);
      holder.clear();
    } catch (err) {
      setError(extractApiError(err, "Bank name check failed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const match = result?.status === "verified" && result.bankName ? bankNameMatch(typedName, result.bankName) : null;
  const pill =
    match?.level === "match"
      ? "bg-green-100 text-green-800"
      : match?.level === "partial"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";

  return (
    <div className="rounded-xl border border-blue-100 bg-white p-3">
      {!result || result.status !== "verified" ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void verify()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Landmark size={15} />}
            {busy ? "Checking with bank…" : `Verify name with bank${prices ? ` (${rupees(prices.nameCheck)})` : ""}`}
          </button>
          <p className="mt-1.5 text-[11px] text-gray-500">
            Optional. {prices ? `${rupees(prices.nameCheck)} per check` : "Small fee per check"}
            {prices ? `, or ${rupees(prices.pennyDrop)} if the bank needs a ₹1 test credit` : ""} — debited from your
            wallet only when the bank confirms. Same account checked again within 90 days is free.
          </p>
        </>
      ) : null}

      {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}

      {result?.status === "not_confirmed" || result?.status === "pending" ? (
        <p
          className={clsx(
            "mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold",
            result.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700",
          )}
        >
          {result.status === "pending" ? <Clock size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          {result.message}
        </p>
      ) : null}

      {result?.status === "verified" ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <BadgeCheck size={18} className="mt-0.5 shrink-0 text-green-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Name as per bank</p>
              <p className="truncate text-sm font-bold text-gray-900">{result.bankName ?? "Bank did not return a name"}</p>
            </div>
            {match ? <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", pill)}>{match.percent}%</span> : null}
          </div>
          {match ? <p className={clsx("rounded-lg px-2.5 py-1.5 text-xs font-semibold", pill)}>{BANK_NAME_MATCH_COPY[match.level]}</p> : null}
          {result.bankName && match?.level !== "match" ? (
            <button
              type="button"
              onClick={() => onUseBankName(result.bankName!)}
              className="w-full rounded-xl border border-blue-200 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
            >
              Use bank name
            </button>
          ) : null}
          <p className="text-[11px] text-gray-500">
            {result.cached ? "Checked earlier — no charge." : `${rupees(result.charged)} debited from your wallet.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
