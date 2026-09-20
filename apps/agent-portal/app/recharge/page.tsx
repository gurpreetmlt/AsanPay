"use client";

import { FormEvent, PointerEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  History,
  Lock,
  RadioTower,
  Search,
  Smartphone,
  UserRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import type { TxnRow } from "@/lib/types";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

function todayInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatInr(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function badgeStatus(status: string) {
  if (status === "success") return "success" as const;
  if (status === "pending" || status === "initiated") return "pending" as const;
  return "failed" as const;
}

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

type OperatorDef = {
  code: string;
  label: string;
  color: string;
  mark: string;
};

const MOBILE_OPS: OperatorDef[] = [
  { code: "AT", label: "Airtel", color: "#ED1C24", mark: "Airtel" },
  { code: "BL", label: "BSNL", color: "#F5A623", mark: "BSNL" },
  { code: "JIO", label: "Jio", color: "#0A2885", mark: "Jio" },
  { code: "VI", label: "Vi", color: "#EE3124", mark: "Vi" },
];

const DTH_OPS: OperatorDef[] = [
  { code: "TTV", label: "Tata Play", color: "#111827", mark: "Tata" },
  { code: "ATV", label: "Airtel TV", color: "#ED1C24", mark: "ATV" },
  { code: "DTV", label: "Dish TV", color: "#E31837", mark: "Dish" },
  { code: "STV", label: "Sun Direct", color: "#F5A623", mark: "Sun" },
  { code: "VTV", label: "d2h", color: "#00A651", mark: "d2h" },
];

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

function OperatorLogo({ op, size = 56 }: { op: OperatorDef; size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-[14px] border bg-white shadow-sm"
      style={{
        width: size,
        height: size,
        borderColor: B.border,
      }}
    >
      <span className="text-[12px] font-black tracking-tight" style={{ color: op.color }}>
        {op.mark}
      </span>
      <span
        className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
        style={{ background: B.green }}
      />
    </div>
  );
}

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

  const [operatorPicked, setOperatorPicked] = useState(false);
  const [accountRef, setAccountRef] = useState("");
  const [operatorCode, setOperatorCode] = useState("");
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
  const [blockResubmit, setBlockResubmit] = useState(false);
  const [recentTxns, setRecentTxns] = useState<TxnRow[]>([]);
  const [recentBusy, setRecentBusy] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayInputValue);
  const [dateTo, setDateTo] = useState(todayInputValue);
  const [appliedFrom, setAppliedFrom] = useState(todayInputValue);
  const [appliedTo, setAppliedTo] = useState(todayInputValue);
  const attemptKey = useRef(createAttemptKeyHolder("recharge"));
  const lookupSeq = useRef(0);
  const busyRef = useRef(false);
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
    const circleOk = serviceCode !== "MOBILE_PREPAID" || Boolean(circleCode);
    const formReadyNow = Boolean(numberOk && operatorCode && circleOk && amountOk && txnPin.length === 4);
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
    setOperatorPicked(false);
    setOperatorCode("");
    setPlans([]);
    setOffers([]);
    setDthSummary([]);
    setCircleCode("");
    setPanelOpen(false);
    setAccountRef("");
    setAmount("");
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

  async function loadRecentTxns() {
    if (!accessToken) return;
    setRecentBusy(true);
    try {
      const data = await fetchApi<TxnRow[]>("/txn", { limit: 100, offset: 0 });
      setRecentTxns(data);
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load recent recharges"));
    } finally {
      setRecentBusy(false);
    }
  }

  useEffect(() => {
    if (!accessToken || !hydrated) return;
    void loadRecentTxns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, hydrated, serviceCode]);

  useEffect(() => {
    if (serviceCode !== "MOBILE_PREPAID" || !operatorPicked) return;
    const mobile = accountRef.replace(/\D/g, "");
    if (mobile.length !== 10) {
      setPlans([]);
      setOffers([]);
      return;
    }
    // Operator already chosen from logos — lookup only auto-fills circle.
    // If circle is already set, skip. On failure, stay silent.
    if (circleCode) return;

    const seq = ++lookupSeq.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLookupBusy(true);
        try {
          const { data } = await api.post<ApiResponse<MobileInfo>>("/txn/recharge/mobile-info", {
            mobile,
          });
          if (seq !== lookupSeq.current) return;
          if (!data.success || !data.data) return;
          const info = data.data;
          if (info.circleCode) setCircleCode(info.circleCode);
          setPlans([]);
          setOffers([]);
        } catch {
          // Operator is already selected — ignore BestAPI operator-detect errors.
        } finally {
          if (seq === lookupSeq.current) setLookupBusy(false);
        }
      })();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [accountRef, serviceCode, operatorPicked, circleCode]);

  const selectedOp = useMemo(
    () => ops.find((o) => o.code === operatorCode) ?? null,
    [ops, operatorCode],
  );

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
      toast.error("Select a telecom circle");
      return;
    }
    setPanelTab(tab);
    setPanelOpen(true);
  }

  function selectOperator(code: string) {
    markNewIntent();
    setOperatorCode(code);
    setOperatorPicked(true);
    setPlans([]);
    setOffers([]);
    setDthSummary([]);
    setAmount("");
    setTxnPin("");
    setPanelOpen(false);
  }

  function clearOperator() {
    markNewIntent();
    setPanelOpen(false);
    setPlans([]);
    setOffers([]);
    setDthSummary([]);
    setOperatorPicked(false);
    setOperatorCode("");
    setAccountRef("");
    setCircleCode("");
    setAmount("");
    setTxnPin("");
  }

  const filteredRecent = useMemo(() => {
    const from = new Date(`${appliedFrom}T00:00:00`);
    const to = new Date(`${appliedTo}T23:59:59.999`);
    return recentTxns.filter((t) => {
      if (t.serviceCode !== serviceCode) return false;
      const created = new Date(t.createdAt);
      if (Number.isNaN(created.getTime())) return false;
      return created >= from && created <= to;
    });
  }, [recentTxns, serviceCode, appliedFrom, appliedTo]);

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
    const circleOk = serviceCode !== "MOBILE_PREPAID" || Boolean(circleCode);
    return Boolean(numberOk && operatorCode && circleOk && amountOk && txnPin.length === 4);
  }, [accountRef, amount, circleCode, operatorCode, serviceCode, txnPin]);

  const submitDisabled = loading || blockResubmit || !formReady;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (blockResubmit || !formReady) return;
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
        void loadRecentTxns();
      } else if (status === "failed") {
        toast.error(data.data?.provider?.message || "Recharge failed");
        setBlockResubmit(false);
        void loadRecentTxns();
      } else {
        toast.success(
          "Recharge submitted. Status is pending — do not tap Recharge again. Check Transactions.",
        );
        stayBlocked = true;
        setBlockResubmit(true);
        attemptKey.current.clear();
        setTxnPin("");
        void loadRecentTxns();
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

  const recentTitle =
    serviceCode === "DTH" ? "Recent DTH Recharges" : "Recent Mobile Recharges";
  const serviceKindLabel = serviceCode === "DTH" ? "DTH Recharge" : "Prepaid Recharge";
  const fieldClass =
    "w-full rounded-xl border bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[#2A5CDD]";
  const labelClass = "text-[11px] font-bold uppercase tracking-wide";

  return (
    <AppShell>
      <div className="w-full space-y-4 px-4 py-5 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm"
            style={{ borderColor: B.border, color: B.blue }}
            onClick={() => router.push("/dashboard")}
            aria-label="Back"
          >
            <ArrowLeft size={16} strokeWidth={2.4} />
          </button>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: B.secondary, color: B.blue }}
          >
            <Smartphone size={16} strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: B.blue }}>
            {serviceCode === "DTH" ? "DTH Recharge" : "Mobile Recharge (Prepaid)"}
          </h1>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* 1. Operators */}
          <section
            className="w-full shrink-0 rounded-2xl border bg-white p-4 shadow-sm lg:w-[17.5rem] xl:w-[18.5rem]"
            style={{ borderColor: B.border }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: B.secondary, color: B.blue }}
              >
                <RadioTower size={15} strokeWidth={2.2} />
              </span>
              <div>
                <h2 className="text-[13px] font-extrabold" style={{ color: B.blue }}>
                  1. Select {serviceCode === "DTH" ? "DTH" : "Mobile"} Operator
                </h2>
                <p className="text-[10px]" style={{ color: B.muted }}>
                  {ops.length} Operators
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              {ops.map((op) => {
                const selected = operatorCode === op.code;
                return (
                  <button
                    key={op.code}
                    type="button"
                    onClick={() => selectOperator(op.code)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition hover:bg-[#F4F7FF]"
                    style={{
                      borderColor: selected ? B.blueLight : B.border,
                      background: selected ? "#EEF3FF" : "#fff",
                    }}
                  >
                    <OperatorLogo op={op} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-extrabold" style={{ color: B.blue }}>
                        {op.label}
                      </p>
                      <p className="truncate text-[10px]" style={{ color: B.muted }}>
                        {serviceKindLabel}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide"
                      style={{ background: "#ECFDF3", color: B.green }}
                    >
                      Active
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Details + plans */}
          <div className={`flex min-w-0 flex-1 gap-4 ${panelOpen ? "flex-col xl:flex-row" : ""}`}>
            <section
              className="min-w-0 flex-1 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
              style={{ borderColor: B.border }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: B.secondary, color: B.blue }}
                  >
                    <UserRound size={15} strokeWidth={2.2} />
                  </span>
                  <h2 className="text-[13px] font-extrabold" style={{ color: B.blue }}>
                    2. Recharge Details
                  </h2>
                </div>
                {selectedOp ? (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-bold"
                    style={{ color: B.green }}
                  >
                    <Check size={14} strokeWidth={3} />
                    Ready
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold" style={{ color: B.muted }}>
                    Waiting for operator
                  </span>
                )}
              </div>

              <form onSubmit={onSubmit} className="space-y-3">
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                  style={{ borderColor: B.border, background: "#F8FAFF" }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {selectedOp ? (
                      <OperatorLogo op={selectedOp} size={40} />
                    ) : (
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-dashed bg-white"
                        style={{ borderColor: B.border }}
                      >
                        <Smartphone size={18} style={{ color: B.blueLight }} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-extrabold" style={{ color: B.blue }}>
                        {selectedOp?.label ?? "Select an operator"}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: B.secondary, color: B.blue }}
                        >
                          {serviceCode === "DTH" ? "DTH Operator" : "Prepaid Operator"}
                        </span>
                        {selectedOp ? (
                          <span
                            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                            style={{ background: "#ECFDF3", color: B.green }}
                          >
                            Live Gateway
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {selectedOp ? (
                    <button
                      type="button"
                      onClick={clearOperator}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{ background: "#fff", color: B.muted, border: `1px solid ${B.border}` }}
                      aria-label="Clear operator"
                    >
                      <X size={14} strokeWidth={2.4} />
                    </button>
                  ) : null}
                </div>

                <div
                  className={`grid gap-3 ${
                    serviceCode === "MOBILE_PREPAID" ? "sm:grid-cols-2" : "sm:grid-cols-2"
                  }`}
                >
                  {serviceCode === "MOBILE_PREPAID" ? (
                    <label className="block space-y-1">
                      <span className={labelClass} style={{ color: B.muted }}>
                        Telecom Circle
                      </span>
                      <div className="relative">
                        <Building2
                          size={15}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                          style={{ color: B.blueLight }}
                        />
                        <select
                          value={circleCode}
                          onChange={(e) => {
                            markNewIntent();
                            setCircleCode(e.target.value);
                            setPlans([]);
                            setOffers([]);
                          }}
                          className={`${fieldClass} appearance-none`}
                          style={{ borderColor: B.border }}
                        >
                          <option value="">Select Telecom Circle</option>
                          {circleOptions.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  ) : null}

                  <label className="block space-y-1">
                    <span className={labelClass} style={{ color: B.muted }}>
                      {serviceCode === "DTH" ? "Subscriber ID" : "Mobile Number"}
                    </span>
                    <div className="relative">
                      <Smartphone
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: B.blueLight }}
                      />
                      <input
                        inputMode="numeric"
                        autoComplete="tel"
                        maxLength={serviceCode === "DTH" ? 20 : 10}
                        value={accountRef}
                        onChange={(e) => {
                          markNewIntent();
                          setAccountRef(e.target.value.replace(/\D/g, ""));
                        }}
                        className={fieldClass}
                        style={{ borderColor: B.border }}
                        placeholder={
                          serviceCode === "DTH" ? "Subscriber ID" : "10-digit mobile number"
                        }
                      />
                    </div>
                    {serviceCode === "MOBILE_PREPAID" && lookupBusy ? (
                      <span className="text-[10px]" style={{ color: B.muted }}>
                        Detecting circle…
                      </span>
                    ) : null}
                  </label>

                  <label className="block space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={labelClass} style={{ color: B.muted }}>
                        Recharge Amount (Rs.)
                      </span>
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openCatalog("plans")}
                          className="cursor-pointer text-[11px] font-extrabold uppercase tracking-wide hover:underline"
                          style={{ color: B.blueLight }}
                        >
                          View Plans
                        </button>
                        <button
                          type="button"
                          onClick={() => void openCatalog("offers")}
                          className="cursor-pointer text-[11px] font-extrabold uppercase tracking-wide hover:underline"
                          style={{ color: B.blueLight }}
                        >
                          {serviceCode === "DTH" ? "View Info" : "View Offers"}
                        </button>
                      </span>
                    </div>
                    <div className="relative">
                      <Wallet
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: B.blueLight }}
                      />
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => {
                          markNewIntent();
                          setAmount(e.target.value);
                        }}
                        className={fieldClass}
                        style={{ borderColor: B.border }}
                        placeholder="Min. Rs. 10"
                      />
                    </div>
                  </label>

                  <label className="block space-y-1">
                    <span className={labelClass} style={{ color: B.muted }}>
                      Transaction PIN (TPIN)
                    </span>
                    <div className="relative">
                      <Lock
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: B.blueLight }}
                      />
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={txnPin}
                        onChange={(e) => setTxnPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        className={`${fieldClass} tracking-widest`}
                        style={{ borderColor: B.border }}
                        placeholder="Enter 4-digit TPIN"
                      />
                    </div>
                  </label>
                </div>

                {blockResubmit ? (
                  <p className="text-xs font-medium" style={{ color: B.muted }}>
                    Do not tap Recharge again while status is pending. Change number or amount to
                    start a new recharge.
                  </p>
                ) : null}

                {lastRef ? (
                  <p className="text-xs" style={{ color: B.muted }}>
                    Last txn <span className="font-semibold" style={{ color: B.blue }}>{lastRef}</span>
                    {" · "}
                    <span className="capitalize">{lastStatus}</span>
                  </p>
                ) : null}

                <PrimaryButton
                  type="submit"
                  variant="primary"
                  showArrow={false}
                  loading={loading}
                  disabled={submitDisabled}
                  onPointerDown={armSubmitFromPointer}
                  className={`w-full !rounded-xl !py-3${submitDisabled ? " pointer-events-none" : ""}`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Zap size={16} strokeWidth={2.4} fill="currentColor" />
                    {blockResubmit ? "Submitted — wait for status" : "Recharge Now"}
                  </span>
                </PrimaryButton>
              </form>
            </section>

            {panelOpen ? (
              <aside
                className="flex min-h-[28rem] w-full min-w-0 flex-col overflow-hidden rounded-[24px] border bg-white shadow-[0_12px_40px_rgba(11,42,154,0.08)] xl:max-w-md xl:flex-1"
                style={{ borderColor: B.border }}
              >
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: `1px solid ${B.border}` }}
                >
                  <div>
                    <p className="text-sm font-bold" style={{ color: B.blue }}>
                      {serviceCode === "DTH" ? "Plans & Info" : "Plans & Offers"}
                    </p>
                    <p className="text-[11px]" style={{ color: B.muted }}>
                      Tap a pack to fill amount
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold"
                    style={{ color: B.muted, background: B.secondary }}
                    onClick={() => setPanelOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setPanelTab("plans")}
                    className="cursor-pointer rounded-2xl px-3 py-2 text-sm font-semibold"
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
                    onClick={() => setPanelTab("offers")}
                    className="cursor-pointer rounded-2xl px-3 py-2 text-sm font-semibold"
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
                        <div
                          className="mb-4 space-y-2 rounded-2xl border p-3"
                          style={{ borderColor: B.border }}
                        >
                          {dthSummary.map((row) => (
                            <div
                              key={`${row.label}-${row.value}`}
                              className="flex justify-between gap-3 text-sm"
                            >
                              <span style={{ color: B.muted }}>{row.label}</span>
                              <span className="text-right font-semibold" style={{ color: B.blue }}>
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
                          setPanelOpen(false);
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
        </div>

        {/* Recent recharges — web only section */}
        <section
          className="overflow-hidden rounded-[24px] border bg-white shadow-[0_10px_40px_rgba(11,42,154,0.06)]"
          style={{ borderColor: B.border }}
        >
          <div
            className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderBottom: `1px solid ${B.border}` }}
          >
            <div className="flex items-center gap-2">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: B.secondary, color: B.blue }}
              >
                <History size={18} strokeWidth={2.2} />
              </span>
              <h2 className="text-sm font-extrabold" style={{ color: B.blue }}>
                {recentTitle}
              </h2>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 block rounded-xl border bg-[#F7F9FF] px-2.5 py-2 text-sm"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                To
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 block rounded-xl border bg-[#F7F9FF] px-2.5 py-2 text-sm"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </label>
              <PrimaryButton
                type="button"
                variant="primary"
                showArrow={false}
                className="!h-10 !min-w-0 !px-4 !text-sm"
                onClick={() => {
                  setAppliedFrom(dateFrom);
                  setAppliedTo(dateTo);
                  void loadRecentTxns();
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Search size={14} strokeWidth={2.4} />
                  View
                </span>
              </PrimaryButton>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead style={{ background: B.secondary }}>
                <tr>
                  {[
                    "Date & Time",
                    "Operator",
                    "Mobile Number",
                    "Txn ID",
                    "RRN / UTR",
                    "Amount (Rs.)",
                    "Status",
                    "Action",
                  ].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider ${
                        h === "Amount (Rs.)" ? "text-right" : "text-left"
                      }`}
                      style={{ color: B.muted }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentBusy && filteredRecent.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center" style={{ color: B.muted }}>
                      Loading…
                    </td>
                  </tr>
                ) : filteredRecent.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-14 text-center">
                      <Wallet
                        size={28}
                        className="mx-auto mb-2 opacity-40"
                        style={{ color: B.muted }}
                      />
                      <p className="text-sm font-medium" style={{ color: B.muted }}>
                        No recent transactions found for the selected date range.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredRecent.map((t, i) => (
                    <tr
                      key={t.id}
                      className="border-b"
                      style={{
                        borderColor: B.border,
                        background: i % 2 === 0 ? "#fff" : "#fafbff",
                      }}
                    >
                      <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                        {new Date(t.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: B.blue }}>
                        {t.serviceName}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                        —
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: B.muted }}>
                        {t.txnRef}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                        —
                      </td>
                      <td className="px-4 py-3 text-right font-bold" style={{ color: B.blue }}>
                        {formatInr(t.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={badgeStatus(t.status)} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-xs font-bold hover:underline"
                          style={{ color: B.blueLight }}
                          onClick={() => router.push(`/transactions?q=${encodeURIComponent(t.txnRef)}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
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
