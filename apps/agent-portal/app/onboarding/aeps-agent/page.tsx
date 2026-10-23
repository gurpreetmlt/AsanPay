"use client";

import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowLeft, Eye, EyeOff, Landmark, Lock, MapPin, Store, UserRound } from "lucide-react";
import {
  AEPS_ONBOARDING_STEPS,
  EMPTY_AEPS_ONBOARDING_FORM,
  validateAepsOnboardingStep,
  type AepsOnboardingForm,
  type AepsOnboardingPrefill,
  type ApiResponse,
  type AuthUser,
} from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { SignupStepper, type StepperStep } from "@/components/signup/SignupStepper";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StateSelect } from "@/components/ui/StateSelect";
import api from "@/lib/api";
import { formatAadhaar, stripAadhaar } from "@/lib/aadhaar";
import { B } from "@/lib/brand";
import { extractApiError, markAepsOnboardingSkipped } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

const STEP_ICONS = [UserRound, Landmark, Store];
const STEPS: StepperStep[] = AEPS_ONBOARDING_STEPS.map((s, i) => ({ ...s, icon: STEP_ICONS[i]! }));
const LAST_STEP = STEPS.length - 1;
const ERR_RED = "#DC2626";
/** Full PAN / Aadhaar re-mask automatically after this long. */
const REVEAL_MS = 30_000;

type FieldKey = keyof AepsOnboardingForm;

function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export default function NobleAgentOnboardPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [sameAsResidential, setSameAsResidential] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [form, setForm] = useState<AepsOnboardingForm>(EMPTY_AEPS_ONBOARDING_FORM);
  const [prefill, setPrefill] = useState<AepsOnboardingPrefill | null>(null);
  const [revealed, setRevealed] = useState<{ pan: string | null; aadhaar: string | null } | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!user) return;
    const parts = user.name.trim().split(/\s+/);
    setForm((f) => ({
      ...f,
      firstName: f.firstName || parts[0] || "",
      lastName: f.lastName || (parts.length > 1 ? parts.slice(1).join(" ") : ""),
      mobileNumber: f.mobileNumber || user.mobile || "",
      email: f.email || user.email || "",
    }));
  }, [user]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    let cancelled = false;
    void api
      .get<ApiResponse<AepsOnboardingPrefill>>("/onboarding/noble/prefill")
      .then((res) => {
        if (cancelled || !res.data.success) return;
        const p = res.data.data;
        setPrefill(p);
        setForm((f) => {
          const merged = { ...f };
          for (const [k, v] of Object.entries(p.form) as [FieldKey, string][]) {
            if (v && !merged[k]) merged[k] = v;
          }
          return merged;
        });
      })
      .catch(() => {
        /* prefill is a convenience — the form still works empty */
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, accessToken]);

  const locks = {
    panLocked: Boolean(prefill?.panMasked),
    aadhaarLocked: Boolean(prefill?.aadhaarMasked),
    bankAccountOnFile: Boolean(prefill?.bankAccountMasked),
  };

  useEffect(() => {
    if (!hydrated || !accessToken || !user) return;
    if (user.role !== "retailer" || user.hasNobleAgent) router.replace("/dashboard");
  }, [hydrated, accessToken, user, router]);

  useEffect(() => {
    if (!sameAsResidential) return;
    setForm((f) => ({
      ...f,
      shopAddress: f.agentAddress,
      shopStateCode: f.agentStateCode,
      shopCity: f.agentCity,
      shopPinCode: f.agentPinCode,
    }));
  }, [sameAsResidential, form.agentAddress, form.agentStateCode, form.agentCity, form.agentPinCode]);

  function setField(key: FieldKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  function checkStep(index: number): boolean {
    const err = validateAepsOnboardingStep(index, form, locks);
    if (!err) return true;
    setErrors({ [err.field]: err.message });
    toast.error(err.message);
    return false;
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Allow location access before continuing");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setField("shopLatitude", pos.coords.latitude.toFixed(4));
        setField("shopLongitude", pos.coords.longitude.toFixed(4));
        toast.success("Shop location captured");
        setGeoBusy(false);
      },
      () => {
        toast.error("Allow location access before continuing");
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function toggleReveal() {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    if (revealed) {
      setRevealed(null);
      return;
    }
    setRevealBusy(true);
    try {
      const res = await api.get<ApiResponse<{ pan: string | null; aadhaar: string | null }>>(
        "/onboarding/noble/identity",
      );
      if (!res.data.success) return;
      setRevealed(res.data.data);
      revealTimer.current = setTimeout(() => setRevealed(null), REVEAL_MS);
    } catch (err) {
      toast.error(extractApiError(err, "Could not load your PAN and Aadhaar. Try again."));
    } finally {
      setRevealBusy(false);
    }
  }

  function skipForNow() {
    markAepsOnboardingSkipped();
    router.replace(safeNext());
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!checkStep(step)) return;
    if (step < LAST_STEP) {
      setStep(step + 1);
      return;
    }
    for (let i = 0; i < LAST_STEP; i++) {
      if (!checkStep(i)) {
        setStep(i);
        return;
      }
    }
    setLoading(true);
    try {
      await api.post("/onboarding/noble", {
        channel: "WEB",
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim(),
        lastName: form.lastName.trim(),
        mobileNumber: form.mobileNumber.replace(/\D/g, "").slice(0, 10),
        email: form.email.trim(),
        panNumber: locks.panLocked ? "" : form.panNumber.toUpperCase().trim(),
        aadhaarNumber: locks.aadhaarLocked ? "" : stripAadhaar(form.aadhaarNumber),
        dob: form.dob.trim(),
        agentAddress: form.agentAddress.trim(),
        agentStateCode: form.agentStateCode,
        agentCity: form.agentCity.trim(),
        agentPinCode: form.agentPinCode.replace(/\D/g, "").slice(0, 6),
        agentBankName: form.agentBankName.trim(),
        agentBankAccountNumber: form.agentBankAccountNumber.replace(/\D/g, ""),
        agentBankIFSC: form.agentBankIFSC.toUpperCase().trim(),
        shopName: form.shopName.trim(),
        shopAddress: form.shopAddress.trim(),
        shopStateCode: form.shopStateCode,
        shopCity: form.shopCity.trim(),
        shopPinCode: form.shopPinCode.replace(/\D/g, "").slice(0, 6),
        shopLatitude: Number(form.shopLatitude),
        shopLongitude: Number(form.shopLongitude),
        isPhysicalVerified: "YES",
      });
      const me = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (me.data.success) setUser(me.data.data.user);
      toast.success("AEPS agent onboarding complete");
      router.replace(safeNext());
    } catch (err) {
      toast.error(extractApiError(err, "AEPS agent onboarding failed"));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--focus)] disabled:bg-slate-50";
  const labelClass = "mb-1 block text-xs font-medium";

  const field = (label: string, key: FieldKey, props?: InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block">
      <span className={labelClass} style={{ color: B.muted }}>
        {label}
      </span>
      <input
        className={inputClass}
        style={{ borderColor: errors[key] ? ERR_RED : B.border, color: B.blue }}
        value={form[key]}
        onChange={(ev) => setField(key, ev.target.value)}
        aria-invalid={Boolean(errors[key])}
        {...props}
      />
      {errors[key] ? (
        <span className="mt-1 block text-xs" style={{ color: ERR_RED }}>
          {errors[key]}
        </span>
      ) : null}
    </label>
  );

  const lockedField = (label: string, masked: string, full: string | null) => (
    <div className="block">
      <span className={labelClass} style={{ color: B.muted }}>
        {label}
      </span>
      <div
        className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm"
        style={{ borderColor: B.border, background: "#F8FAFC", color: B.blue }}
      >
        <span className="font-semibold tracking-wide">{revealed && full ? full : masked}</span>
        <span className="flex items-center gap-2 text-xs" style={{ color: B.muted }}>
          <span className="flex items-center gap-1">
            <Lock size={12} />
            From KYC
          </span>
          <button
            type="button"
            onClick={() => void toggleReveal()}
            disabled={revealBusy}
            className="icon-tooltip cursor-pointer rounded-md p-1 hover:bg-slate-100"
            aria-label={revealed ? `Hide ${label}` : `Show full ${label}`}
            data-tooltip={revealed ? "Hide" : "Show full number"}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </span>
      </div>
    </div>
  );

  const stateField = (label: string, key: "agentStateCode" | "shopStateCode", disabled?: boolean) => (
    <div className={disabled ? "pointer-events-none opacity-70" : undefined}>
      <StateSelect label={label} value={form[key]} onChange={(code) => setField(key, code)} />
      {errors[key] ? (
        <span className="mt-1 block text-xs" style={{ color: ERR_RED }}>
          {errors[key]}
        </span>
      ) : null}
    </div>
  );

  const current = STEPS[step]!;
  const StepIcon = current.icon;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4 pb-10">
        <div className="rounded-2xl border p-4" style={{ borderColor: B.border, background: "#fff" }}>
          <div className="mb-1 flex items-center gap-2 text-sm font-bold" style={{ color: B.blue }}>
            <Store size={16} style={{ color: B.blue }} />
            Register for AEPS services
          </div>
          <p className="text-xs" style={{ color: B.muted }}>
            One-time form. Required before using AEPS, Aadhaar Pay, Cash Deposit, and UPI QR.
          </p>
          {prefill ? (
            <p className="mt-2 text-xs font-semibold" style={{ color: B.greenDark }}>
              Filled from your KYC — check each step before submitting.
            </p>
          ) : null}
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="rounded-2xl border p-5"
          style={{ borderColor: B.border, background: "#fff" }}
        >
          <SignupStepper currentIndex={step} steps={STEPS} />

          <div className="mb-4 flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: `${B.blue}10`, color: B.blue }}
            >
              <StepIcon size={16} />
            </span>
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              {current.label}
            </h2>
          </div>

          <div key={step} className="dash-page-animate space-y-3">
            {step === 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {field("First name", "firstName", { maxLength: 50 })}
                  {field("Middle name", "middleName", { maxLength: 50 })}
                  {field("Last name", "lastName", { maxLength: 50 })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {field("Mobile", "mobileNumber", { inputMode: "numeric", maxLength: 10 })}
                  {field("Email", "email", { type: "email" })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {prefill?.panMasked
                    ? lockedField("PAN", prefill.panMasked, revealed?.pan ?? null)
                    : field("PAN", "panNumber", {
                        maxLength: 10,
                        style: {
                          borderColor: errors.panNumber ? ERR_RED : B.border,
                          color: B.blue,
                          textTransform: "uppercase",
                        },
                        onChange: (ev) => setField("panNumber", ev.target.value.toUpperCase()),
                      })}
                  {prefill?.aadhaarMasked
                    ? lockedField(
                        "Aadhaar",
                        prefill.aadhaarMasked,
                        revealed?.aadhaar ? formatAadhaar(revealed.aadhaar) : null,
                      )
                    : field("Aadhaar", "aadhaarNumber", {
                        inputMode: "numeric",
                        maxLength: 14,
                        value: formatAadhaar(form.aadhaarNumber),
                        onChange: (ev) => setField("aadhaarNumber", stripAadhaar(ev.target.value)),
                      })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {field("Date of birth (DD-MM-YYYY)", "dob", { placeholder: "20-10-1985", maxLength: 10 })}
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                {field("Residential address", "agentAddress", { maxLength: 250 })}
                <div className="grid gap-3 sm:grid-cols-3">
                  {stateField("State", "agentStateCode")}
                  {field("City", "agentCity")}
                  {field("PIN", "agentPinCode", { inputMode: "numeric", maxLength: 6 })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {field("Bank name", "agentBankName")}
                  {field("IFSC", "agentBankIFSC", {
                    maxLength: 11,
                    style: {
                      borderColor: errors.agentBankIFSC ? ERR_RED : B.border,
                      color: B.blue,
                      textTransform: "uppercase",
                    },
                    onChange: (ev) => setField("agentBankIFSC", ev.target.value.toUpperCase()),
                  })}
                </div>
                {field("Bank account number", "agentBankAccountNumber", {
                  inputMode: "numeric",
                  placeholder: prefill?.bankAccountMasked
                    ? `${prefill.bankAccountMasked} (from KYC) — type to change`
                    : undefined,
                })}
              </>
            ) : null}

            {step === 2 ? (
              <>
                {field("Shop name", "shopName")}
                <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: B.blue }}>
                  <input
                    type="checkbox"
                    checked={sameAsResidential}
                    onChange={(e) => setSameAsResidential(e.target.checked)}
                    className="h-4 w-4 cursor-pointer"
                  />
                  Shop address is same as residential address
                </label>
                {field("Shop address", "shopAddress", { maxLength: 250, disabled: sameAsResidential })}
                <div className="grid gap-3 sm:grid-cols-3">
                  {stateField("Shop state", "shopStateCode", sameAsResidential)}
                  {field("Shop city", "shopCity", { disabled: sameAsResidential })}
                  {field("Shop PIN", "shopPinCode", {
                    inputMode: "numeric",
                    maxLength: 6,
                    disabled: sameAsResidential,
                  })}
                </div>
                <div
                  className="rounded-xl border p-3"
                  style={{ borderColor: errors.shopLatitude ? ERR_RED : B.border, background: `${B.blue}04` }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm" style={{ color: B.blue }}>
                      <div className="font-semibold">Shop location</div>
                      <div className="text-xs" style={{ color: B.muted }}>
                        {form.shopLatitude && form.shopLongitude
                          ? `${form.shopLatitude}, ${form.shopLongitude}`
                          : "Stand inside your shop and tap Use GPS"}
                      </div>
                    </div>
                    <PrimaryButton type="button" variant="secondary" onClick={captureLocation} disabled={geoBusy}>
                      <MapPin size={14} className="mr-1 inline" />
                      {geoBusy ? "Locating…" : form.shopLatitude ? "Update GPS" : "Use GPS"}
                    </PrimaryButton>
                  </div>
                  {errors.shopLatitude ? (
                    <span className="mt-2 block text-xs" style={{ color: ERR_RED }}>
                      {errors.shopLatitude}
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {step > 0 ? (
              <PrimaryButton type="button" variant="secondary" onClick={goBack} disabled={loading}>
                <ArrowLeft size={14} className="mr-1 inline" />
                Back
              </PrimaryButton>
            ) : null}
            <PrimaryButton type="submit" variant="primary" disabled={loading} className="sm:flex-1">
              {step < LAST_STEP ? "Continue" : loading ? "Submitting…" : "Submit onboarding"}
            </PrimaryButton>
          </div>
          <PrimaryButton
            type="button"
            variant="ghost"
            onClick={skipForNow}
            disabled={loading}
            className="mt-2 w-full"
          >
            Skip for now
          </PrimaryButton>
        </form>
      </div>
    </AppShell>
  );
}
