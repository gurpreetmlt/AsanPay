"use client";

import { FormEvent, PointerEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import type { ApiResponse } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type ServiceCode = "MOBILE_PREPAID" | "DTH";

type PlanItem = {
  amount: string;
  title: string;
  description?: string;
  validity?: string;
  category?: string;
};

type MobileInfo = {
  mobile: string;
  operatorSource?: "bestapi" | "vyaparapi" | null;
  operatorCode: string | null;
  operatorName: string | null;
  circleCode: string | null;
  circleName: string | null;
  plans: PlanItem[];
  offers: PlanItem[];
  plansSource?: "bestapi" | "vyaparapi" | null;
  warnings: string[];
};

const MOBILE_OPS = [
  { code: "JIO", label: "Reliance JIO" },
  { code: "AT", label: "Airtel" },
  { code: "VI", label: "Vi (Vodafone Idea)" },
  { code: "BL", label: "BSNL" },
  { code: "JPL", label: "Jio Lite" },
  { code: "TESTOP", label: "TestOperator" },
] as const;

const DTH_OPS = [
  { code: "TTV", label: "Tata Play" },
  { code: "ATV", label: "Airtel Digital TV" },
  { code: "DTV", label: "Dish TV" },
  { code: "STV", label: "Sun Direct" },
  { code: "VTV", label: "d2h" },
] as const;

function parseService(raw: string | null): ServiceCode {
  return raw === "DTH" ? "DTH" : "MOBILE_PREPAID";
}

function RechargeLoading() {
  return (
    <AppShell>
      <div className="px-4 py-8 text-sm" style={{ color: B.muted }}>
        Loading…
      </div>
    </AppShell>
  );
}

function PlanList({
  title,
  items,
  onPick,
}: {
  title: string;
  items: PlanItem[];
  onPick: (amount: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold" style={{ color: B.blue }}>
        {title}
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {items.map((p, i) => (
          <button
            key={`${p.amount}-${p.title}-${i}`}
            type="button"
            onClick={() => onPick(p.amount)}
            className="w-full rounded-xl border px-3 py-2.5 text-left transition hover:bg-slate-50"
            style={{ borderColor: B.border }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold" style={{ color: B.blue }}>
                ₹{p.amount}
              </span>
              <span className="text-xs font-medium" style={{ color: B.muted }}>
                {p.validity ? `Validity ${p.validity}` : p.category ?? "Tap to select"}
              </span>
            </div>
            <div className="mt-0.5 text-xs font-semibold" style={{ color: B.blue }}>
              {p.title}
            </div>
            {p.description ? (
              <div className="mt-0.5 text-xs leading-snug" style={{ color: B.muted }}>
                {p.description}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function RechargeInner() {
  const router = useRouter();
  const search = useSearchParams();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const serviceCode = parseService(search.get("service"));
  const ops = serviceCode === "DTH" ? DTH_OPS : MOBILE_OPS;

  const [accountRef, setAccountRef] = useState("");
  const [operatorCode, setOperatorCode] = useState<string>(ops[0]!.code);
  const [circleHint, setCircleHint] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [offers, setOffers] = useState<PlanItem[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastRef, setLastRef] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  /** After pending/success — block another Recharge until number/amount/operator changes. */
  const [blockResubmit, setBlockResubmit] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder("recharge"));
  const lookupSeq = useRef(0);
  /** True from first pointerdown/submit until request finishes (or stay blocked). */
  const busyRef = useRef(false);
  /** True once this attempt has started the API call — blocks a second submit. */
  const apiStartedRef = useRef(false);

  function markNewIntent() {
    attemptKey.current.clear();
    setBlockResubmit(false);
    busyRef.current = false;
    apiStartedRef.current = false;
  }

  function armSubmitFromPointer(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const number = accountRef.replace(/\D/g, "");
    const numberOk =
      serviceCode === "MOBILE_PREPAID" ? number.length === 10 : number.length >= 8;
    const amountOk = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
    const formReadyNow = Boolean(numberOk && operatorCode && amountOk && txnPin.length === 4);
    if (
      busyRef.current ||
      blockResubmit ||
      loading ||
      apiStartedRef.current ||
      !formReadyNow
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    busyRef.current = true;
    setLoading(true);
  }

  useEffect(() => {
    setOperatorCode(ops[0]!.code);
    setPlans([]);
    setOffers([]);
    setCircleHint(null);
    markNewIntent();
  }, [serviceCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    if (user?.role && user.role !== "retailer") {
      toast.error("Recharge is for retailers only");
      router.replace("/dashboard");
    }
  }, [hydrated, accessToken, user?.role, router]);

  useEffect(() => {
    if (serviceCode !== "MOBILE_PREPAID") return;
    const mobile = accountRef.replace(/\D/g, "");
    if (mobile.length !== 10) {
      setPlans([]);
      setOffers([]);
      setCircleHint(null);
      return;
    }

    const seq = ++lookupSeq.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLookupBusy(true);
        try {
          const { data } = await api.post<ApiResponse<MobileInfo>>("/txn/recharge/mobile-info", {
            mobile,
          });
          if (seq !== lookupSeq.current) return;
          if (!data.success || !data.data) {
            throw new Error(data.message || "Could not look up this number");
          }
          const info = data.data;
          if (info.operatorCode) {
            const known = MOBILE_OPS.some((o) => o.code === info.operatorCode);
            setOperatorCode(known ? info.operatorCode : info.operatorCode);
          }
          setCircleHint(
            [
              [info.circleName, info.circleCode].filter(Boolean).join(" · "),
              info.operatorName,
              info.operatorSource ? `via ${info.operatorSource}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || null,
          );
          setOffers(info.offers ?? []);
          setPlans(info.plans ?? []);
          for (const w of info.warnings ?? []) {
            if (w.startsWith("Operator detected via")) continue;
            if (w.startsWith("Plans loaded via")) continue;
            if (w.startsWith("Offers loaded via")) continue;
            if (w.startsWith("BestAPI plans empty")) continue;
            toast(w, { icon: "ℹ️" });
          }
        } catch (err) {
          if (seq !== lookupSeq.current) return;
          setPlans([]);
          setOffers([]);
          toast.error(extractApiError(err, "Could not detect operator. Select manually."));
        } finally {
          if (seq === lookupSeq.current) setLookupBusy(false);
        }
      })();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [accountRef, serviceCode]);

  const title = useMemo(
    () => (serviceCode === "DTH" ? "DTH recharge" : "Mobile prepaid"),
    [serviceCode],
  );

  const operatorOptions = useMemo(() => {
    if (serviceCode !== "MOBILE_PREPAID") return [...ops];
    if (MOBILE_OPS.some((o) => o.code === operatorCode)) return [...MOBILE_OPS];
    return [{ code: operatorCode, label: operatorCode }, ...MOBILE_OPS];
  }, [ops, operatorCode, serviceCode]);

  const formReady = useMemo(() => {
    const number = accountRef.replace(/\D/g, "");
    const numberOk =
      serviceCode === "MOBILE_PREPAID" ? number.length === 10 : number.length >= 8;
    const amountOk = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
    return Boolean(numberOk && operatorCode && amountOk && txnPin.length === 4);
  }, [accountRef, amount, operatorCode, serviceCode, txnPin]);

  const submitDisabled = loading || blockResubmit || !formReady;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (blockResubmit || !formReady) return;
    // Second form submit (extra mouse click) while first request is running.
    if (apiStartedRef.current) return;

    busyRef.current = true;
    apiStartedRef.current = true;
    setLoading(true);
    let stayBlocked = false;

    try {
      const number = accountRef.replace(/\D/g, "");
      if (serviceCode === "MOBILE_PREPAID" && number.length !== 10) {
        toast.error("Enter a valid 10-digit mobile");
        return;
      }
      if (serviceCode === "DTH" && number.length < 8) {
        toast.error("Enter a valid DTH subscriber number");
        return;
      }
      if (!operatorCode) {
        toast.error("Select an operator");
        return;
      }
      if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) {
        toast.error("Enter a valid recharge amount");
        return;
      }
      if (txnPin.length !== 4) {
        toast.error("Enter your 4-digit transaction PIN");
        return;
      }

      const { data } = await api.post<
        ApiResponse<{ txn?: { txnRef?: string; status?: string }; provider?: { status?: string; message?: string } }>
      >("/txn/recharge", {
        serviceCode,
        operatorCode,
        accountRef: number,
        amount: amount.trim(),
        txnPin,
        idempotencyKey: attemptKey.current.get(),
      });
      if (!data.success) throw new Error(data.message || "Recharge failed");
      const txn = data.data?.txn;
      const status = (txn?.status ?? data.data?.provider?.status ?? "pending").toLowerCase();
      setLastRef(txn?.txnRef ?? null);
      setLastStatus(status);
      if (status === "success") {
        toast.success("Recharge successful");
        stayBlocked = true;
        setBlockResubmit(true);
        attemptKey.current.clear();
        setTxnPin("");
      } else if (status === "failed") {
        toast.error(data.data?.provider?.message || "Recharge failed");
        setBlockResubmit(false);
      } else {
        toast.success(
          "Recharge submitted. Status is pending — do not tap Recharge again. Check Transactions.",
        );
        stayBlocked = true;
        setBlockResubmit(true);
        attemptKey.current.clear();
        setTxnPin("");
      }
    } catch (err) {
      toast.error(extractApiError(err, "Recharge failed"));
      setBlockResubmit(false);
    } finally {
      setLoading(false);
      if (stayBlocked) {
        busyRef.current = true;
        apiStartedRef.current = true;
      } else {
        busyRef.current = false;
        apiStartedRef.current = false;
      }
    }
  }

  if (!hydrated || !accessToken) return null;
  if (user?.role && user.role !== "retailer") return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-5 sm:px-6">
        <div>
          <button
            type="button"
            className="text-sm font-semibold"
            style={{ color: B.blueLight }}
            onClick={() => router.push("/dashboard")}
          >
            ← Back
          </button>
          <h1 className="mt-2 text-2xl font-bold" style={{ color: B.blue }}>
            {title}
          </h1>
          <p className="mt-0.5 text-[14px]" style={{ color: B.muted }}>
            Recharge via VyaparAPI · plans/offers via BestAPI
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border bg-white p-5"
          style={{ borderColor: B.border }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              {serviceCode === "DTH" ? "Subscriber ID" : "Mobile number"}
            </span>
            <input
              inputMode="numeric"
              autoComplete="tel"
              maxLength={serviceCode === "DTH" ? 20 : 10}
              value={accountRef}
              onChange={(e) => {
                markNewIntent();
                setAccountRef(e.target.value.replace(/\D/g, ""));
              }}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border }}
              placeholder={serviceCode === "DTH" ? "DTH number" : "10-digit mobile"}
            />
            {serviceCode === "MOBILE_PREPAID" && lookupBusy ? (
              <span className="text-xs" style={{ color: B.muted }}>
                Detecting operator and plans…
              </span>
            ) : null}
            {serviceCode === "MOBILE_PREPAID" && circleHint && !lookupBusy ? (
              <span className="text-xs" style={{ color: B.muted }}>
                {circleHint}
              </span>
            ) : null}
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              Operator
            </span>
            <select
              value={operatorCode}
              onChange={(e) => {
                markNewIntent();
                setOperatorCode(e.target.value);
              }}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border }}
            >
              {operatorOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label} ({o.code})
                </option>
              ))}
            </select>
          </label>

          {serviceCode === "MOBILE_PREPAID" ? (
            <>
              <PlanList
                title="Special offers"
                items={offers}
                onPick={(a) => {
                  markNewIntent();
                  setAmount(a);
                }}
              />
              <PlanList
                title="Plans"
                items={plans}
                onPick={(a) => {
                  markNewIntent();
                  setAmount(a);
                }}
              />
              {!lookupBusy &&
              accountRef.replace(/\D/g, "").length === 10 &&
              plans.length === 0 &&
              offers.length === 0 ? (
                <p className="text-xs" style={{ color: B.muted }}>
                  No plans/offers for this number yet. Enter amount manually.
                </p>
              ) : null}
            </>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              Amount (₹)
            </span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                markNewIntent();
                setAmount(e.target.value);
              }}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border }}
              placeholder="e.g. 199"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              Transaction PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={txnPin}
              onChange={(e) => setTxnPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none tracking-widest"
              style={{ borderColor: B.border }}
              placeholder="••••"
            />
          </label>

          {blockResubmit ? (
            <p className="text-xs font-medium" style={{ color: B.muted }}>
              Do not tap Recharge again while status is pending or already submitted. Change
              number, operator, or amount to start a new recharge — or open Transactions.
            </p>
          ) : null}

          {!formReady && !blockResubmit ? (
            <p className="text-xs" style={{ color: B.muted }}>
              Fill mobile number, operator, amount, and 4-digit transaction PIN to enable Recharge.
            </p>
          ) : null}

          <PrimaryButton
            type="submit"
            variant="primary"
            loading={loading}
            disabled={submitDisabled}
            onPointerDown={armSubmitFromPointer}
            className={`w-full${submitDisabled ? " pointer-events-none" : ""}`}
          >
            {blockResubmit ? "Submitted — wait for status" : "Recharge"}
          </PrimaryButton>
        </form>

        {lastRef ? (
          <div className="rounded-2xl border bg-white p-4 text-sm" style={{ borderColor: B.border }}>
            <p style={{ color: B.muted }}>Last txn</p>
            <p className="font-semibold" style={{ color: B.blue }}>
              {lastRef}
            </p>
            <p className="mt-1 capitalize" style={{ color: B.muted }}>
              Status: {lastStatus}
            </p>
            <button
              type="button"
              className="mt-2 text-sm font-bold"
              style={{ color: B.blueLight }}
              onClick={() => router.push("/transactions")}
            >
              View transactions →
            </button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function RechargePage() {
  return (
    <Suspense fallback={<RechargeLoading />}>
      <RechargeInner />
    </Suspense>
  );
}
