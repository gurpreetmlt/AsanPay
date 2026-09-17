"use client";

import { FormEvent, PointerEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  TELECOM_CIRCLES,
  classifyRechargePlanTab,
  RECHARGE_PLAN_TAB_LABELS,
  RECHARGE_PLAN_TAB_ORDER,
  type ApiResponse,
  type RechargePlanTabId,
} from "@asanpay/shared-types";
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

function groupPlansByTab(items: PlanItem[]): { id: RechargePlanTabId; label: string; items: PlanItem[] }[] {
  const map = new Map<RechargePlanTabId, PlanItem[]>();
  for (const p of items) {
    const id = classifyRechargePlanTab(p);
    const list = map.get(id) ?? [];
    list.push(p);
    map.set(id, list);
  }
  return RECHARGE_PLAN_TAB_ORDER.filter((id) => (map.get(id)?.length ?? 0) > 0).map((id) => ({
    id,
    label: RECHARGE_PLAN_TAB_LABELS[id],
    items: map.get(id)!,
  }));
}

const PLAN_PAGE_SIZE = 5;

function PlanList({
  items,
  selectedAmount,
  onPick,
}: {
  items: PlanItem[];
  selectedAmount: string;
  onPick: (amount: string) => void;
}) {
  const groups = useMemo(() => groupPlansByTab(items), [items]);
  const [tab, setTab] = useState<RechargePlanTabId>(groups[0]?.id ?? "popular");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!groups.some((g) => g.id === tab)) {
      setTab(groups[0]?.id ?? "popular");
      setShowAll(false);
    }
  }, [groups, tab]);

  if (items.length === 0) return null;
  const active = groups.find((g) => g.id === tab) ?? groups[0];
  if (!active) return null;
  const visible = showAll ? active.items : active.items.slice(0, PLAN_PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
        {groups.map((g) => {
          const on = g.id === active.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setTab(g.id);
                setShowAll(false);
              }}
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: on ? B.btnGrad : B.secondary,
                color: on ? "#fff" : B.blue,
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <div className="space-y-2.5">
        {visible.map((p, i) => {
              const selected = selectedAmount === p.amount;
              return (
                <button
                  key={`${active.id}-${p.amount}-${i}`}
                  type="button"
                  onClick={() => onPick(p.amount)}
                  className="flex w-full overflow-hidden rounded-[20px] border text-left transition"
                  style={{
                    borderColor: selected ? B.blueLight : B.border,
                    background: selected ? "#F4F7FF" : "#fff",
                    boxShadow: selected
                      ? `0 0 0 3px ${B.blueLight}22, 0 8px 20px rgba(11,42,154,0.08)`
                      : "0 1px 2px rgba(11,42,154,0.04)",
                  }}
                >
                  <div
                    className="flex w-[5.25rem] shrink-0 flex-col items-center justify-center py-3.5"
                    style={{ background: selected ? B.btnGrad : B.secondary }}
                  >
                    <span
                      className="text-[10px] font-bold tracking-wide"
                      style={{ color: selected ? "rgba(255,255,255,0.75)" : B.muted }}
                    >
                      INR
                    </span>
                    <span
                      className="text-[22px] font-extrabold leading-none"
                      style={{ color: selected ? "#fff" : B.blue }}
                    >
                      {p.amount}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                        style={{ background: selected ? "#fff" : B.secondary, color: B.blueLight }}
                      >
                        {p.validity ? p.validity : "Validity on pack"}
                      </span>
                      {selected ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: B.green }}>
                          <Check size={12} strokeWidth={3} />
                          Selected
                        </span>
                      ) : null}
                    </div>
                    {p.description ? (
                      <p
                        className="mt-1.5 text-[12px] leading-snug"
                        style={{
                          color: B.muted,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {p.description}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
        })}
      </div>
      {active.items.length > PLAN_PAGE_SIZE ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full py-2 text-sm font-semibold"
          style={{ color: B.blueLight }}
        >
          {showAll ? "Show less" : `See more (${active.items.length - PLAN_PAGE_SIZE})`}
        </button>
      ) : null}
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
  const [dthSummary, setDthSummary] = useState<{ label: string; value: string }[]>([]);
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
    setDthSummary([]);
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
    if (serviceCode === "DTH") {
      const { data } = await api.post<ApiResponse<{ plans: PlanItem[] }>>("/txn/recharge/dth-plans", {
        operatorCode,
      });
      if (!data.success) throw new Error(data.message || "Could not load DTH plans");
      setPlans(data.data?.plans ?? []);
      return;
    }
    const { data } = await api.post<ApiResponse<{ plans: PlanItem[] }>>(
      "/txn/recharge/mobile-plans",
      catalogBody(),
    );
    if (!data.success) throw new Error(data.message || "Could not load plans");
    setPlans(data.data?.plans ?? []);
  }

  async function loadOffers(): Promise<void> {
    if (serviceCode === "DTH") {
      const number = accountRef.replace(/\s+/g, "").trim();
      const { data } = await api.post<
        ApiResponse<{ plans: PlanItem[]; summary: { label: string; value: string }[] }>
      >("/txn/recharge/dth-info", { operatorCode, number });
      if (!data.success) throw new Error(data.message || "Could not load DTH info");
      setOffers(data.data?.plans ?? []);
      setDthSummary(data.data?.summary ?? []);
      return;
    }
    const { data } = await api.post<ApiResponse<{ offers: PlanItem[] }>>(
      "/txn/recharge/mobile-offers",
      catalogBody(),
    );
    if (!data.success) throw new Error(data.message || "Could not load offers");
    setOffers(data.data?.offers ?? []);
  }

  async function openCatalog(tab: "plans" | "offers"): Promise<void> {
    if (serviceCode === "DTH") {
      const number = accountRef.replace(/\s+/g, "").trim();
      if (number.length < 8) {
        toast.error("Enter a valid DTH subscriber number");
        return;
      }
      if (!operatorCode) {
        toast.error("Select an operator");
        return;
      }
      setPanelTab(tab);
      setPanelOpen(true);
      return;
    }
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
  }

  function switchCatalogTab(tab: "plans" | "offers"): void {
    setPanelTab(tab);
  }

  useEffect(() => {
    if (!panelOpen) return;
    if (serviceCode === "MOBILE_PREPAID") {
      const mobile = accountRef.replace(/\D/g, "");
      if (mobile.length !== 10 || !operatorCode || !circleCode) return;
    } else {
      const number = accountRef.replace(/\s+/g, "").trim();
      if (number.length < 8 || !operatorCode) return;
    }
    let cancelled = false;
    setPanelBusy(true);
    void (async () => {
      try {
        if (panelTab === "plans") await loadPlans();
        else await loadOffers();
      } catch (err) {
        if (!cancelled) {
          toast.error(
            extractApiError(
              err,
              panelTab === "plans"
                ? "Could not load plans"
                : serviceCode === "DTH"
                  ? "Could not load DTH info"
                  : "Could not load offers",
            ),
          );
        }
      } finally {
        if (!cancelled) setPanelBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, panelTab, accountRef, operatorCode, circleCode, serviceCode]);

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
      <div
        className={`mx-auto flex min-h-full w-full items-start gap-6 px-4 py-6 transition-[max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          panelOpen ? "max-w-[92rem]" : "max-w-lg"
        }`}
      >
      <div className="w-full max-w-lg shrink-0 space-y-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm"
            style={{ borderColor: B.border, color: B.blue }}
            onClick={() => router.push("/dashboard")}
            aria-label="Back"
          >
            <ArrowLeft size={18} strokeWidth={2.4} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: B.blue }}>
              {title}
            </h1>
            <p className="mt-0.5 text-[13px]" style={{ color: B.muted }}>
              Recharge via VyaparAPI · operator, plans and offers via BestAPI
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-[28px] border bg-white p-5 shadow-[0_10px_40px_rgba(11,42,154,0.06)] sm:p-6"
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
              className="w-full rounded-2xl border bg-[#F7F9FF] px-3.5 py-3 text-sm outline-none transition focus:border-[#2A5CDD] focus:bg-white"
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
                className="w-full rounded-2xl border bg-[#F7F9FF] px-3.5 py-3 text-sm outline-none transition focus:border-[#2A5CDD] focus:bg-white"
                style={{ borderColor: B.border }}
              >
                <option value="">Select circle/state</option>
                {circleOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="text-xs" style={{ color: B.muted }}>
                Auto-filled from the number. Change it anytime — open packs reload for the new circle.
              </span>
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
                setDthSummary([]);
              }}
              className="w-full rounded-2xl border bg-[#F7F9FF] px-3.5 py-3 text-sm outline-none transition focus:border-[#2A5CDD] focus:bg-white"
              style={{ borderColor: B.border }}
            >
              {operatorOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {serviceCode === "MOBILE_PREPAID" || serviceCode === "DTH" ? (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void openCatalog("plans")}
                className="rounded-2xl border px-3 py-2.5 text-sm font-semibold transition"
                style={{
                  borderColor: B.blue,
                  color: panelOpen && panelTab === "plans" ? "#fff" : B.blue,
                  background: panelOpen && panelTab === "plans" ? B.btnGrad : "#fff",
                }}
              >
                Plans
              </button>
              <button
                type="button"
                onClick={() => void openCatalog("offers")}
                className="rounded-2xl border px-3 py-2.5 text-sm font-semibold transition"
                style={{
                  borderColor: B.blue,
                  color: panelOpen && panelTab === "offers" ? "#fff" : B.blue,
                  background: panelOpen && panelTab === "offers" ? B.btnGrad : "#fff",
                }}
              >
                {serviceCode === "DTH" ? "Info" : "Offers"}
              </button>
            </div>
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
              className="w-full rounded-2xl border bg-[#F7F9FF] px-3.5 py-3 text-sm outline-none transition focus:border-[#2A5CDD] focus:bg-white"
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
              className="w-full rounded-2xl border bg-[#F7F9FF] px-3.5 py-3 text-sm outline-none tracking-widest transition focus:border-[#2A5CDD] focus:bg-white"
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

      {serviceCode === "MOBILE_PREPAID" || serviceCode === "DTH" ? (
          <aside
            aria-hidden={!panelOpen}
            className={`flex min-h-0 min-w-0 flex-col overflow-hidden bg-white transition-[opacity,transform,max-width,min-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-full max-lg:max-w-lg max-lg:shadow-2xl lg:static lg:h-[calc(100vh-3rem)] lg:rounded-[28px] lg:border ${
              panelOpen
                ? "max-lg:translate-x-0 max-lg:opacity-100 lg:min-w-[36rem] lg:max-w-[46rem] lg:flex-1 lg:translate-x-0 lg:opacity-100 lg:shadow-[0_12px_40px_rgba(11,42,154,0.08)]"
                : "pointer-events-none max-lg:translate-x-full max-lg:opacity-0 lg:min-w-0 lg:max-w-0 lg:flex-none lg:translate-x-8 lg:border-0 lg:opacity-0 lg:shadow-none"
            }`}
            style={{ borderColor: B.border }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${B.border}` }}>
              <div>
                <p className="text-sm font-bold" style={{ color: B.blue }}>
                  {serviceCode === "DTH" ? "DTH packs & info" : "Browse packs"}
                </p>
                <p className="text-[11px]" style={{ color: B.muted }}>
                  Tap a pack to fill amount
                </p>
              </div>
              <button
                type="button"
                className="rounded-full px-3 py-1.5 text-sm font-semibold"
                style={{ color: B.muted, background: B.secondary }}
                onClick={() => setPanelOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 px-5 py-3">
              <button
                type="button"
                onClick={() => switchCatalogTab("plans")}
                className="rounded-2xl px-3 py-2 text-sm font-semibold"
                style={{
                  background: panelTab === "plans" ? B.btnGrad : "#fff",
                  color: panelTab === "plans" ? "#fff" : B.blue,
                  border: `1px solid ${B.blue}`,
                }}
              >
                Plans
              </button>
              <button
                type="button"
                onClick={() => switchCatalogTab("offers")}
                className="rounded-2xl px-3 py-2 text-sm font-semibold"
                style={{
                  background: panelTab === "offers" ? B.btnGrad : "#fff",
                  color: panelTab === "offers" ? "#fff" : B.blue,
                  border: `1px solid ${B.blue}`,
                }}
              >
                {serviceCode === "DTH" ? "Info" : "Offers"}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              {panelBusy ? (
                <p className="text-sm" style={{ color: B.muted }}>
                  Loading {serviceCode === "DTH" && panelTab === "offers" ? "info" : panelTab}…
                </p>
              ) : (
                <>
                  {serviceCode === "DTH" && panelTab === "offers" && dthSummary.length > 0 ? (
                    <div className="mb-4 space-y-2 rounded-2xl border p-3" style={{ borderColor: B.border }}>
                      {dthSummary.map((row) => (
                        <div key={`${row.label}-${row.value}`} className="flex justify-between gap-3 text-sm">
                          <span style={{ color: B.muted }}>{row.label}</span>
                          <span className="font-semibold text-right" style={{ color: B.blue }}>
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <PlanList
                    items={panelTab === "plans" ? plans : offers}
                    selectedAmount={amount}
                    onPick={(a) => {
                      markNewIntent();
                      setAmount(a);
                    }}
                  />
                </>
              )}
              {!panelBusy && (panelTab === "plans" ? plans : offers).length === 0 ? (
                <p className="text-sm" style={{ color: B.muted }}>
                  {serviceCode === "DTH"
                    ? panelTab === "plans"
                      ? "No plans for this operator. Enter amount manually."
                      : dthSummary.length > 0
                        ? "No pack amounts in info. Enter amount manually if needed."
                        : "No info for this subscriber. Enter amount manually."
                    : `No ${panelTab} for this operator and circle. Enter amount manually.`}
                </p>
              ) : null}
            </div>
          </aside>
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
