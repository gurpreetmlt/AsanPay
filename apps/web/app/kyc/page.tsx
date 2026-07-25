"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  FileText,
  User,
  Fingerprint,
  CreditCard,
  Building2,
  Eye,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import api from "@/lib/api";
import { formatAadhaar, stripAadhaar } from "@/lib/aadhaar";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";

const STEPS = [
  { id: "agreement", label: "Agreement", icon: FileText },
  { id: "personal", label: "Personal", icon: User },
  { id: "aadhaar", label: "Aadhaar", icon: Fingerprint },
  { id: "pan", label: "PAN", icon: CreditCard },
  { id: "bank", label: "Bank", icon: Building2 },
  { id: "review", label: "Review", icon: Eye },
] as const;

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
      {children}
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm outline-none"
        style={{ borderColor: B.border, color: B.blue }}
      />
    </div>
  );
}

export default function KycPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    dob: "",
    email: "",
    address: "",
    city: "",
    pincode: "",
    aadhaar: "",
    pan: "",
    accountName: "",
    accountNumber: "",
    ifsc: "",
    bankName: "",
  });

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (user?.name) {
      setForm((f) => ({ ...f, fullName: f.fullName || user.name, accountName: f.accountName || user.name }));
    }
  }, [user?.name]);

  if (!hydrated || !accessToken) return null;

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function next() {
    if (step === 0 && !agreed) {
      toast.error("Please accept the agreement");
      return;
    }
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function submit() {
    if (!form.pan || !form.aadhaar) {
      toast.error("PAN and Aadhaar are required");
      setStep(3);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/kyc/submit", {
        fullName: form.fullName || user?.name,
        panNumber: form.pan.toUpperCase(),
        aadhaarNumber: form.aadhaar.replace(/\s/g, ""),
        email: form.email || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        pincode: form.pincode || undefined,
        bankAccountName: form.accountName || undefined,
        bankAccountNumber: form.accountNumber || undefined,
        bankIfsc: form.ifsc ? form.ifsc.toUpperCase() : undefined,
        bankName: form.bankName || undefined,
      });
      if (!data.success) throw new Error(data.message);
      setUser(data.data.user);
      toast.success("KYC submitted — set your PIN next");
      router.replace("/onboarding/pin");
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "KYC submit failed",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            KYC Onboarding
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Complete verification to unlock full transaction limits
          </p>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border bg-white p-3" style={{ borderColor: B.border }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.id} className="flex min-w-0 flex-1 items-center gap-1">
                <div
                  className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2"
                  style={{
                    background: active ? `${B.blue}0C` : done ? `${B.green}10` : "transparent",
                  }}
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      background: done ? B.green : active ? B.badgeGrad : B.secondary,
                      color: done || active ? "#fff" : B.muted,
                    }}
                  >
                    {done ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
                  </div>
                  <span
                    className="truncate text-[10px] font-semibold"
                    style={{ color: active ? B.blue : done ? B.green : B.muted }}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="h-0.5 w-3 flex-shrink-0 rounded" style={{ background: done ? B.green : B.border }} />
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                Agent Agreement
              </h2>
              <div
                className="max-h-56 space-y-3 overflow-y-auto rounded-xl p-4 text-sm leading-relaxed"
                style={{ background: B.bg, color: B.muted }}
              >
                <p>
                  By continuing, you agree to AsanPay&apos;s agent terms: you will comply with applicable RBI
                  guidelines, maintain accurate KYC records for customers, and not misuse the platform for fraudulent
                  transactions.
                </p>
                <p>
                  Commission rates, settlement timelines, and service availability are subject to network and partner
                  bank rules. AsanPay may suspend access for compliance violations.
                </p>
                <p>Your personal and business data will be processed as described in our privacy policy.</p>
              </div>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm" style={{ color: B.blue }}>
                  I have read and agree to the agent agreement and terms of service.
                </span>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                Personal Information
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full Name" placeholder="As per Aadhaar" value={form.fullName} onChange={(v) => set("fullName", v)} />
                <Field label="Date of Birth" placeholder="DD/MM/YYYY" value={form.dob} onChange={(v) => set("dob", v)} type="date" />
                <Field label="Email" placeholder="email@example.com" value={form.email} onChange={(v) => set("email", v)} type="email" />
                <Field label="City" placeholder="City" value={form.city} onChange={(v) => set("city", v)} />
                <div className="col-span-2">
                  <Field label="Address" placeholder="Full address" value={form.address} onChange={(v) => set("address", v)} />
                </div>
                <Field label="Pincode" placeholder="6-digit" value={form.pincode} onChange={(v) => set("pincode", v.replace(/\D/g, "").slice(0, 6))} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                Aadhaar Verification
              </h2>
              <Field
                label="Aadhaar Number"
                placeholder="XXXX XXXX XXXX"
                value={formatAadhaar(form.aadhaar)}
                onChange={(v) => set("aadhaar", stripAadhaar(v))}
              />
              <p className="text-xs" style={{ color: B.muted }}>
                OTP verification will be required in production. For now, enter your 12-digit Aadhaar number.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                PAN Card
              </h2>
              <Field
                label="PAN Number"
                placeholder="ABCDE1234F"
                value={form.pan}
                onChange={(v) => set("pan", v.toUpperCase().slice(0, 10))}
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                Bank Details
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Account Holder" placeholder="Name on passbook" value={form.accountName} onChange={(v) => set("accountName", v)} />
                <Field label="Bank Name" placeholder="Bank name" value={form.bankName} onChange={(v) => set("bankName", v)} />
                <Field label="Account Number" placeholder="Account number" value={form.accountNumber} onChange={(v) => set("accountNumber", v.replace(/\D/g, ""))} />
                <Field label="IFSC" placeholder="IFSC code" value={form.ifsc} onChange={(v) => set("ifsc", v.toUpperCase().slice(0, 11))} />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                Review & Submit
              </h2>
              <div className="grid grid-cols-2 gap-3 rounded-xl p-4" style={{ background: B.bg }}>
                {[
                  { label: "Name", value: form.fullName },
                  { label: "Mobile", value: user?.mobile ?? "—" },
                  { label: "Aadhaar", value: form.aadhaar ? `XXXX XXXX ${form.aadhaar.slice(-4)}` : "—" },
                  { label: "PAN", value: form.pan || "—" },
                  { label: "Bank", value: form.bankName || "—" },
                  { label: "Account", value: form.accountNumber ? `****${form.accountNumber.slice(-4)}` : "—" },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="text-xs" style={{ color: B.muted }}>
                      {r.label}
                    </div>
                    <div className="text-sm font-semibold" style={{ color: B.blue }}>
                      {r.value || "—"}
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="flex items-center gap-2 rounded-xl p-3 text-sm"
                style={{ background: `${B.green}12`, color: B.green }}
              >
                <CheckCircle2 size={16} /> All steps complete — submit for verification
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t pt-5" style={{ borderColor: B.border }}>
            <button
              type="button"
              onClick={back}
              disabled={step === 0}
              className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
              style={{ borderColor: B.border, color: B.blue }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{ background: B.badgeGrad }}
              >
                Next <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: B.walletGrad }}
              >
                {submitting ? "Submitting…" : "Submit KYC"} <Check size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
