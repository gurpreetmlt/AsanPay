"use client";

import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { AsanPayLockup } from "@/components/brand/Logo";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";

type PartnerRole = "distributor" | "super_distributor";

const ROLE_OPTIONS: { value: PartnerRole; label: string }[] = [
  { value: "distributor", label: "Distributor" },
  { value: "super_distributor", label: "Super Distributor" },
];

const inputCls = "w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm outline-none";
const inputStyle = { borderColor: B.border, color: B.blue } as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
        {label} <span style={{ color: "#DC2626" }}>*</span>
      </div>
      {children}
    </div>
  );
}

function validate(f: Record<string, string>): string | null {
  if (!f.name.trim()) return "Enter your full name";
  if (!/^[6-9]\d{9}$/.test(f.mobile)) return "Enter a valid 10-digit mobile";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "Enter a valid email address";
  if (!f.city.trim()) return "Enter your city";
  if (!f.state.trim()) return "Enter your state";
  if (!f.message.trim()) return "Tell us about your business (network size, area, current services)";
  return null;
}

function PartnerEnquiryForm() {
  const router = useRouter();
  const q = useSearchParams().get("role");
  const [role, setRole] = useState<PartnerRole>(q === "super_distributor" || q === "super" ? "super_distributor" : "distributor");
  const [form, setForm] = useState({ name: "", mobile: "", email: "", city: "", state: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validate(form);
    if (err) {
      toast.error(err);
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/partner-enquiry", { role, ...form });
      setSent(true);
    } catch (error) {
      toast.error(extractApiError(error, "Your enquiry could not be sent. Please try again in a few minutes."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 sm:py-8" style={{ background: B.bg }}>
      <div className="mx-auto w-full max-w-xl rounded-3xl border bg-white p-6 shadow-xl sm:p-8" style={{ borderColor: B.border }}>
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
            style={{ borderColor: B.border, color: B.blue }}
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight" style={{ color: B.blue }}>
              Become a partner
            </h1>
            <p className="text-sm leading-tight" style={{ color: B.muted }}>
              Distributor and Super Distributor accounts are opened by our team.
            </p>
          </div>
          <div className="shrink-0">
            <AsanPayLockup width={112} light={false} animate showTagline={false} />
          </div>
        </div>

        {sent ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: B.green }} />
            <h2 className="text-lg font-bold" style={{ color: B.blue }}>
              Enquiry sent
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: B.muted }}>
              Thank you. Our team will contact you soon on {form.mobile}.
            </p>
            <Link href="/login" className="mt-5 inline-block text-sm font-semibold" style={{ color: B.blue }}>
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="I want to become">
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className="rounded-2xl border-2 px-3 py-3 text-sm font-semibold"
                    style={{
                      borderColor: role === r.value ? B.blue : B.border,
                      background: role === r.value ? B.secondary : "#fff",
                      color: B.blue,
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Full name">
              <input value={form.name} onChange={(e) => set("name")(e.target.value)} className={inputCls} style={inputStyle} placeholder="Your full name" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile">
                <input
                  value={form.mobile}
                  onChange={(e) => set("mobile")(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className={inputCls}
                  style={inputStyle}
                  inputMode="numeric"
                  placeholder="10-digit mobile"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email")(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="City">
                <input value={form.city} onChange={(e) => set("city")(e.target.value)} className={inputCls} style={inputStyle} placeholder="City" />
              </Field>
              <Field label="State">
                <input value={form.state} onChange={(e) => set("state")(e.target.value)} className={inputCls} style={inputStyle} placeholder="State" />
              </Field>
            </div>
            <Field label="About your business">
              <textarea
                value={form.message}
                onChange={(e) => set("message")(e.target.value)}
                className={`${inputCls} min-h-28 resize-y`}
                style={inputStyle}
                maxLength={2000}
                placeholder="Network size, area you cover, services you offer today"
              />
            </Field>
            <PrimaryButton type="submit" variant="primary" disabled={loading}>
              {loading ? "Sending…" : "Send enquiry"}
            </PrimaryButton>
            <p className="text-center text-xs" style={{ color: B.muted }}>
              Want a Retailer account?{" "}
              <Link href="/signup?role=retailer" className="font-semibold" style={{ color: B.blue }}>
                Sign up as Retailer
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function PartnerEnquiryPage() {
  return (
    <Suspense fallback={null}>
      <PartnerEnquiryForm />
    </Suspense>
  );
}
