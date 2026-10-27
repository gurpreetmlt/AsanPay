"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, BadgeCheck, Landmark, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { extractApiError } from "@/lib/onboarding";
import { BANK_NAME_MATCH_COPY, bankNameMatch, type ApiResponse } from "@asanpay/shared-types";

interface SignupBankCheckResult {
  status: "verified" | "not_confirmed" | "pending";
  bankName: string | null;
  cached: boolean;
  message: string;
}

const AUTO_CHECK_DELAY_MS = 700;

/** Signup bank step: free bank check, runs by itself once account + IFSC are complete. Warn only. */
export function SignupBankCheck({
  accountNumber,
  accountNumberConfirm,
  ifsc,
  panName,
  onUseBankName,
}: {
  accountNumber: string;
  accountNumberConfirm: string;
  ifsc: string;
  panName: string;
  onUseBankName: (name: string) => void;
}) {
  const code = ifsc.trim().toUpperCase();
  const ready =
    /^\d{6,18}$/.test(accountNumber) &&
    accountNumber === accountNumberConfirm &&
    /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code);
  const details = ready ? `${accountNumber}|${code}` : "";

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ details: string; data: SignupBankCheckResult } | null>(null);
  const [error, setError] = useState<{ details: string; message: string } | null>(null);
  const started = useRef("");

  async function run(target: string) {
    started.current = target;
    setBusy(true);
    setError(null);
    try {
      const [acct, ifscCode] = target.split("|");
      const { data } = await api.post<ApiResponse<SignupBankCheckResult>>("/kyc/bank-check", {
        accountNumber: acct,
        ifsc: ifscCode,
      });
      if (!data.success) throw new Error(data.message || "Bank check could not run. Try again.");
      if (started.current === target) setResult({ details: target, data: data.data });
    } catch (err) {
      if (started.current === target) {
        setError({ details: target, message: extractApiError(err, "Bank check could not run. Try again.") });
      }
    } finally {
      if (started.current === target) setBusy(false);
    }
  }

  useEffect(() => {
    if (!details || started.current === details) return;
    const t = setTimeout(() => void run(details), AUTO_CHECK_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details]);

  if (!ready) return null;

  const current = result?.details === details ? result.data : null;
  const currentError = error?.details === details ? error.message : null;
  const match =
    current?.status === "verified" && current.bankName && panName.trim()
      ? bankNameMatch(panName, current.bankName)
      : null;
  const pill =
    match?.level === "match"
      ? "bg-green-100 text-green-800"
      : match?.level === "partial"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";

  return (
    <div className="rounded-2xl border border-blue-100 bg-[#F7F9FF] p-3">
      {busy ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
          <Loader2 size={15} className="animate-spin" /> Checking account with bank…
        </p>
      ) : current?.status === "verified" ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <BadgeCheck size={18} className="mt-0.5 shrink-0 text-green-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Name as per bank</p>
              <p className="truncate text-sm font-bold text-gray-900">{current.bankName ?? "Bank did not return a name"}</p>
            </div>
            {match ? (
              <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", pill)}>{match.percent}%</span>
            ) : null}
          </div>
          {match ? (
            <p className={clsx("rounded-lg px-2.5 py-1.5 text-xs font-semibold", pill)}>
              {BANK_NAME_MATCH_COPY[match.level]} (compared with your PAN name)
            </p>
          ) : null}
          {current.bankName ? (
            <button
              type="button"
              onClick={() => onUseBankName(current.bankName!)}
              className="w-full rounded-xl border border-blue-200 bg-white py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
            >
              Use bank name as account holder
            </button>
          ) : null}
        </div>
      ) : current || currentError ? (
        <div className="space-y-2">
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {currentError ?? current?.message}
            {" "}You can still continue — admin will check this account.
          </p>
          <button
            type="button"
            onClick={() => void run(details)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
          >
            <Landmark size={14} /> Check again
          </button>
        </div>
      ) : null}
    </div>
  );
}
