"use client";

import { FormEvent, PointerEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { TELECOM_CIRCLES, type ApiResponse } from "@asanpay/shared-types";
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
  operatorSource?: "bestapi" | null;
  operatorCode: string | null;
  operatorName: string | null;
  circleCode: string | null;
  circleName: string | null;
  plans: PlanItem[];
  offers: PlanItem[];
  plansSource?: "bestapi" | null;
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
  selectedAmount,
  onPick,
}: {
  title?: string;
  items: PlanItem[];
  selectedAmount: string;
  onPick: (amount: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {title ? (
        <div className="text-sm font-semibold" style={{ color: B.blue }}>
          {title}
        </div>
      ) : null}
      <div className="space-y-2">
        {items.map((p, i) => {
          const selected = selectedAmount === p.amount;
          return (
            <button
              key={`${p.amount}-${p.title}-${i}`}
              type="button"
              onClick={() => onPick(p.amount)}
              className="w-full rounded-xl border px-3 py-2.5 text-left transition hover:bg-slate-50"
              style={{
                borderColor: selected ? B.blue : B.border,
                background: selected ? `${B.blue}10` : undefined,
              }}
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
          );
        })}
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
  const [circleCode, setCircleCode] = useState("");
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [offers, setOffers] = useState<PlanItem[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"plans" | "offers">("plans");
  const [panelBusy, setPanelBusy] = useState(false);
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
    setCircleCode("");
    setPanelOpen(false);
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
      setCircleCode("");
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
            setOperatorCode(info.operatorCode);
          }
          if (info.circleCode) setCircleCode(info.circleCode);
          setPlans([]);
          setOffers([]);
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

  const circleOptions = useMemo(() => {
    const list = TELECOM_CIRCLES.map((c) => ({ code: c.code, name: c.name }));
    if (circleCode && !list.some((c) => c.code === circleCode)) {
      list.unshift({ code: circleCode, name: circleCode });
    }
    return list;
  }, [circleCode]);

  function catalogBody() {
    return {
      mobile: accountRef.replace(/\D/g, ""),
      operatorCode,
      circleCode,
    };
  }

  async function loadPlans(): Promise<void> {
    const { data } = await api.post<ApiResponse<{ plans: PlanItem[] }>>(
      "/txn/recharge/mobile-plans",
      catalogBody(),
    );
    if (!data.success) throw new Error(data.message || "Could not load plans");
    setPlans(data.data?.plans ?? []);
  }

  async function loadOffers(): Promise<void> {
    const { data } = await api.post<ApiResponse<{ offers: PlanItem[] }>>(
      "/txn/recharge/mobile-offers",
      catalogBody(),
    );
    if (!data.success) throw new Error(data.message || "Could not load offers");
    setOffers(data.data?.offers ?? []);
  }

  async function openCatalog(tab: "plans" | "offers"): Promise<void> {
    const mobile = accountRef.replace(/\D/g, "");
    if (mobile.length !== 10) {
      toast.error("Enter a valid 10-digit mobile");
      return;
    }
    if (!operatorCode) {
      toast.error("Select an operator");
      return;
    }
    if (!circleCode) {
      toast.error("Select a circle/state");
      return;
    }
    setPanelTab(tab);
    setPanelOpen(true);
    const needFetch = tab === "plans" ? plans.length === 0 : offers.length === 0;
    if (!needFetch) return;
    setPanelBusy(true);
    try {
      if (tab === "plans") await loadPlans();
      else await loadOffers();
    } catch (err) {
      toast.error(extractApiError(err, tab === "plans" ? "Could not load plans" : "Could not load offers"));
    } finally {
      setPanelBusy(false);
    }
  }

  async function switchCatalogTab(tab: "plans" | "offers"): Promise<void> {
    setPanelTab(tab);
    const needFetch = tab === "plans" ? plans.length === 0 : offers.length === 0;
    if (!needFetch) return;
    setPanelBusy(true);
    try {
      if (tab === "plans") await loadPlans();
      else await loadOffers();
    } catch (err) {
      toast.error(extractApiError(err, tab === "plans" ? "Could not load plans" : "Could not load offers"));
    } finally {
      setPanelBusy(false);
    }
  }

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
            Recharge via VyaparAPI · operator, plans and offers via BestAPI
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
                Detecting operator and circle…
              </span>
            ) : null}
          </label>

          {serviceCode === "MOBILE_PREPAID" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold" style={{ color: B.blue }}>
                Circle/State
              </span>
              <select
                value={circleCode}
                onChange={(e) => {
                  markNewIntent();
                  setCircleCode(e.target.value);
                  setPlans([]);
                  setOffers([]);
                }}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: B.border }}
              >
                <option value="">Select circle/state</option>
                {circleOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              Operator
            </span>
            <select
              value={operatorCode}
              onChange={(e) => {
                markNewIntent();
                setOperatorCode(e.target.value);
                setPlans([]);
                setOffers([]);
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

          {serviceCode === "MOBILE_PREPAID" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void openCatalog("plans")}
                className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                style={{ borderColor: B.blue, color: B.blue, background: "#fff" }}
              >
                Plans
              </button>
              <button
                type="button"
                onClick={() => void openCatalog("offers")}
                className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                style={{ borderColor: B.blue, color: B.blue, background: "#fff" }}
              >
                Offers
              </button>
            </div>
          ) : null}

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

      {panelOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="h-full flex-1 bg-black/40"
            aria-label="Close plans panel"
            onClick={() => setPanelOpen(false)}
          />
          <aside
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            style={{ borderLeft: `1px solid ${B.border}` }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: B.border }}>
              <span className="text-sm font-bold" style={{ color: B.blue }}>
                Browse packs
              </span>
              <button
                type="button"
                className="text-sm font-semibold"
                style={{ color: B.muted }}
                onClick={() => setPanelOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => void switchCatalogTab("plans")}
                className="rounded-xl px-3 py-2 text-sm font-semibold"
                style={{
                  background: panelTab === "plans" ? B.blue : "#fff",
                  color: panelTab === "plans" ? "#fff" : B.blue,
                  border: `1px solid ${B.blue}`,
                }}
              >
                Plans
              </button>
              <button
                type="button"
                onClick={() => void switchCatalogTab("offers")}
                className="rounded-xl px-3 py-2 text-sm font-semibold"
                style={{
                  background: panelTab === "offers" ? B.blue : "#fff",
                  color: panelTab === "offers" ? "#fff" : B.blue,
                  border: `1px solid ${B.blue}`,
                }}
              >
                Offers
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {panelBusy ? (
                <p className="text-sm" style={{ color: B.muted }}>
                  Loading {panelTab}…
                </p>
              ) : (
                <PlanList
                  items={panelTab === "plans" ? plans : offers}
                  selectedAmount={amount}
                  onPick={(a) => {
                    markNewIntent();
                    setAmount(a);
                    setPanelOpen(false);
                  }}
                />
              )}
              {!panelBusy && (panelTab === "plans" ? plans : offers).length === 0 ? (
                <p className="text-sm" style={{ color: B.muted }}>
                  No {panelTab} for this operator and circle. Enter amount manually.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
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
