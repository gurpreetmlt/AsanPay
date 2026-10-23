"use client";

import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { MapPin, Store } from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { formatAadhaar, stripAadhaar } from "@/lib/aadhaar";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

export default function NobleAgentOnboardPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [loading, setLoading] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    mobileNumber: "",
    email: "",
    panNumber: "",
    aadhaarNumber: "",
    dob: "",
    agentAddress: "",
    agentStateCode: "",
    agentCity: "",
    agentPinCode: "",
    agentBankName: "",
    agentBankAccountNumber: "",
    agentBankIFSC: "",
    shopName: "",
    shopAddress: "",
    shopStateCode: "",
    shopCity: "",
    shopPinCode: "",
    shopLatitude: "",
    shopLongitude: "",
  });

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
    if (!hydrated || !accessToken || !user) return;
    if (user.role !== "retailer") {
      router.replace("/dashboard");
      return;
    }
    if (user.hasNobleAgent) {
      router.replace("/dashboard");
    }
  }, [hydrated, accessToken, user, router]);

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const lat = Number(form.shopLatitude);
    const lng = Number(form.shopLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Allow location access before continuing");
      return;
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
        panNumber: form.panNumber.toUpperCase().trim(),
        aadhaarNumber: stripAadhaar(form.aadhaarNumber),
        dob: form.dob.trim(),
        agentAddress: form.agentAddress.trim(),
        agentStateCode: form.agentStateCode.toUpperCase().trim(),
        agentCity: form.agentCity.trim(),
        agentPinCode: form.agentPinCode.replace(/\D/g, "").slice(0, 6),
        agentBankName: form.agentBankName.trim(),
        agentBankAccountNumber: form.agentBankAccountNumber.replace(/\D/g, ""),
        agentBankIFSC: form.agentBankIFSC.toUpperCase().trim(),
        shopName: form.shopName.trim(),
        shopAddress: form.shopAddress.trim(),
        shopStateCode: form.shopStateCode.toUpperCase().trim(),
        shopCity: form.shopCity.trim(),
        shopPinCode: form.shopPinCode.replace(/\D/g, "").slice(0, 6),
        shopLatitude: lat,
        shopLongitude: lng,
        isPhysicalVerified: "YES",
      });
      const me = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (me.data.success) setUser(me.data.data.user);
      toast.success("AEPS agent onboarding complete");
      router.replace("/dashboard");
    } catch (err) {
      toast.error(extractApiError(err, "AEPS agent onboarding failed"));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--focus)]";
  const labelClass = "mb-1 block text-xs font-medium";
  const field = (label: string, key: keyof typeof form, props?: InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block">
      <span className={labelClass} style={{ color: B.muted }}>
        {label}
      </span>
      <input
        className={inputClass}
        style={{ borderColor: B.border, color: B.blue }}
        value={form[key]}
        onChange={(ev) => setField(key, ev.target.value)}
        {...props}
      />
    </label>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4 pb-10">
        <div className="rounded-2xl border p-4" style={{ borderColor: B.border, background: "#fff" }}>
          <div className="mb-1 flex items-center gap-2 text-sm font-bold" style={{ color: B.blue }}>
            <Store size={16} style={{ color: B.blue }} />
            Register for AEPS services
          </div>
          <p className="text-xs" style={{ color: B.muted }}>
            One-time form. Unlocks AEPS, Aadhaar Pay, Cash Deposit, and UPI QR after approval.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border p-4" style={{ borderColor: B.border, background: "#fff" }}>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("First name", "firstName", { required: true, maxLength: 50 })}
            {field("Middle name", "middleName", { maxLength: 50 })}
            {field("Last name", "lastName", { maxLength: 50 })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Mobile", "mobileNumber", { required: true, inputMode: "numeric", maxLength: 10 })}
            {field("Email", "email", { required: true, type: "email" })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass} style={{ color: B.muted }}>
                PAN
              </span>
              <input
                className={inputClass}
                style={{ borderColor: B.border, color: B.blue, textTransform: "uppercase" }}
                value={form.panNumber}
                onChange={(ev) => setField("panNumber", ev.target.value.toUpperCase())}
                required
                maxLength={10}
              />
            </label>
            <label className="block">
              <span className={labelClass} style={{ color: B.muted }}>
                Aadhaar
              </span>
              <input
                className={inputClass}
                style={{ borderColor: B.border, color: B.blue }}
                value={formatAadhaar(form.aadhaarNumber)}
                onChange={(ev) => setField("aadhaarNumber", stripAadhaar(ev.target.value))}
                inputMode="numeric"
                required
                maxLength={14}
              />
            </label>
          </div>
          {field("Date of birth (DD-MM-YYYY)", "dob", { required: true, placeholder: "20-10-1985" })}
          {field("Residential address", "agentAddress", { required: true, maxLength: 250 })}
          <div className="grid gap-3 sm:grid-cols-3">
            {field("State code", "agentStateCode", { required: true, maxLength: 2, placeholder: "RJ" })}
            {field("City", "agentCity", { required: true })}
            {field("PIN", "agentPinCode", { required: true, inputMode: "numeric", maxLength: 6 })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Bank name", "agentBankName", { required: true })}
            <label className="block">
              <span className={labelClass} style={{ color: B.muted }}>
                IFSC
              </span>
              <input
                className={inputClass}
                style={{ borderColor: B.border, color: B.blue, textTransform: "uppercase" }}
                value={form.agentBankIFSC}
                onChange={(ev) => setField("agentBankIFSC", ev.target.value.toUpperCase())}
                required
                maxLength={11}
              />
            </label>
          </div>
          {field("Bank account number", "agentBankAccountNumber", { required: true, inputMode: "numeric" })}
          {field("Shop name", "shopName", { required: true })}
          {field("Shop address", "shopAddress", { required: true, maxLength: 250 })}
          <div className="grid gap-3 sm:grid-cols-3">
            {field("Shop state", "shopStateCode", { required: true, maxLength: 2, placeholder: "RJ" })}
            {field("Shop city", "shopCity", { required: true })}
            {field("Shop PIN", "shopPinCode", { required: true, inputMode: "numeric", maxLength: 6 })}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              {field("Latitude", "shopLatitude", { required: true, readOnly: true })}
              {field("Longitude", "shopLongitude", { required: true, readOnly: true })}
            </div>
            <PrimaryButton type="button" variant="secondary" onClick={captureLocation} disabled={geoBusy}>
              <MapPin size={14} className="mr-1 inline" />
              {geoBusy ? "Locating…" : "Use GPS"}
            </PrimaryButton>
          </div>
          <PrimaryButton type="submit" variant="primary" disabled={loading} className="w-full">
            {loading ? "Submitting…" : "Submit onboarding"}
          </PrimaryButton>
        </form>
      </div>
    </AppShell>
  );
}
