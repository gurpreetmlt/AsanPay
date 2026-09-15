"use client";

import { FormEvent, PointerEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
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

function groupPlans(items: PlanItem[]): { category: string; items: PlanItem[] }[] {
  const map = new Map<string, PlanItem[]>();
  for (const p of items) {
    const cat = p.category?.trim() || "Packs";
    const list = map.get(cat) ?? [];
    list.push(p);
    map.set(cat, list);
  }
  return [...map.entries()].map(([category, grouped]) => ({ category, items: grouped }));
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
  if (items.length === 0) return null;
  return (
    <div className="space-y-5">
      {groupPlans(items).map((group) => (
        <section key={group.category} className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
            {group.category}
          </div>
          <div className="space-y-2.5">
            {group.items.map((p, i) => {
              const selected = selectedAmount === p.amount;
              return (
                <button
                  key={`${group.category}-${p.amount}-${i}`}
                  type="button"
                  onClick={() => onPick(p.amount)}
                  className="flex w-full overflow-hidden rounded-2xl border text-left shadow-sm transition hover:shadow-md"
                  style={{
                    borderColor: selected ? B.blue : B.border,
                    boxShadow: selected ? `0 0 0 2px ${B.blue}33` : undefined,
                    background: "#fff",
                  }}
                >
                  <div
                    className="flex w-[4.75rem] shrink-0 flex-col items-center justify-center px-2 py-3"
                    style={{ background: selected ? B.btnGrad : B.secondary }}
                  >
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: selected ? "rgba(255,255,255,0.8)" : B.muted }}
                    >
                      ₹
                    </span>
                    <span
                      className="text-lg font-extrabold leading-none"
                      style={{ color: selected ? "#fff" : B.blue }}
                    >
                      {p.amount}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: B.secondary, color: B.blue }}
                      >
                        {p.validity ? p.validity : "Tap to select"}
                      </span>
                      {selected ? (
                        <span className="text-[11px] font-bold" style={{ color: B.green }}>
                          Selected
                        </span>
                      ) : null}
                    </div>
                    {p.description ? (
                      <p
                        className="mt-1.5 text-xs leading-snug"
                        style={{ color: B.muted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                      >
                        {p.description}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
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
  }

  function switchCatalogTab(tab: "plans" | "offers"): void {
    setPanelTab(tab);
  }

  useEffect(() => {
    if (!panelOpen || serviceCode !== "MOBILE_PREPAID") return;
    const mobile = accountRef.replace(/\D/g, "");
    if (mobile.length !== 10 || !operatorCode || !circleCode) return;
    let cancelled = false;
    setPanelBusy(true);
    void (async () => {
      try {
        if (panelTab === "plans") await loadPlans();
        else await loadOffers();
      } catch (err) {
        if (!cancelled) {
          toast.error(
            extractApiError(err, panelTab === "plans" ? "Could not load plans" : "Could not load offers"),
          );
        }
      } finally {
        if (!cancelled) setPanelBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // loadPlans/loadOffers close over latest circle/operator/mobile
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
      <div className="flex min-h-full w-full items-stretch">
      <div className="w-full max-w-lg shrink-0 space-y-5 px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white"
            style={{ borderColor: B.border, color: B.blue }}
            onClick={() => router.push("/dashboard")}
            aria-label="Back"
          >
            <ArrowLeft size={18} strokeWidth={2.4} />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              {title}
            </h1>
            <p className="mt-0.5 text-[13px]" style={{ color: B.muted }}>
              Recharge via VyaparAPI · operator, plans and offers via BestAPI
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
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
              }}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border }}
            >
              {operatorOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
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

      {panelOpen ? (
        <>
          <div className="hidden w-16 shrink-0 flex-col items-center justify-center lg:flex">
            <div className="h-20 w-px" style={{ background: B.border }} />
            <div
              className="my-3 flex h-11 w-11 items-center justify-center rounded-full border bg-white shadow-sm"
              style={{ borderColor: B.blue, color: B.blue }}
              aria-hidden
            >
              <ChevronRight size={22} strokeWidth={2.4} />
            </div>
            <div className="h-20 w-px" style={{ background: B.border }} />
          </div>
          <aside
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l bg-white shadow-2xl lg:static lg:z-0 lg:max-w-none lg:min-w-0 lg:flex-1 lg:shadow-none"
            style={{ borderColor: B.border }}
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
                onClick={() => switchCatalogTab("plans")}
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
                onClick={() => switchCatalogTab("offers")}
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
        </>
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
