"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { MapPin } from "lucide-react";
import type { ApiResponse } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError, wasAepsOnboardingSkipped } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

export default function UpiQrPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [txnId, setTxnId] = useState("");
  const [form, setForm] = useState({
    amount: "",
    mobileNumber: "",
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!user?.aepsOnboardingRequired || wasAepsOnboardingSkipped()) return;
    toast("Complete AEPS agent onboarding to start using UPI QR");
    router.replace(`/onboarding/aeps-agent?next=${encodeURIComponent("/upi-qr")}`);
  }, [user?.aepsOnboardingRequired, router]);

  useEffect(() => {
    if (user?.mobile) setForm((f) => ({ ...f, mobileNumber: f.mobileNumber || user.mobile }));
  }, [user]);

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Allow location access before continuing");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(4),
          longitude: pos.coords.longitude.toFixed(4),
        }));
        toast.success("Location captured");
      },
      () => toast.error("Allow location access before continuing"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Allow location access before continuing");
      return;
    }
    setBusy(true);
    setQr("");
    try {
      await api.post("/noble/upi-qr/load", { channel: "WEB" });
      const { data } = await api.post<ApiResponse<{ qr: string; transactionId: string }>>(
        "/noble/upi-qr/generate",
        {
          amount: form.amount.trim(),
          mobileNumber: form.mobileNumber.replace(/\D/g, "").slice(0, 10),
          latitude: lat,
          longitude: lng,
          channel: "WEB",
        },
      );
      if (!data.success) throw new Error(data.message);
      setQr(data.data.qr || "");
      setTxnId(data.data.transactionId || "");
      toast.success("UPI QR generated");
    } catch (err) {
      toast.error(extractApiError(err, "UPI QR generate failed"));
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none";

  return (
    <AppShell>
      <div className="mx-auto max-w-lg space-y-4 pb-10">
        <h1 className="text-lg font-bold" style={{ color: B.blue }}>
          UPI QR
        </h1>
        <p className="text-sm" style={{ color: B.muted }}>
          Generate a UPI QR for collection. Complete AEPS agent onboarding first.
        </p>
        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-2xl border p-4"
          style={{ borderColor: B.border, background: "#fff" }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
              Amount
            </span>
            <input
              className={inputClass}
              style={{ borderColor: B.border, color: B.blue }}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
              Customer mobile
            </span>
            <input
              className={inputClass}
              style={{ borderColor: B.border, color: B.blue }}
              value={form.mobileNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))
              }
              required
              maxLength={10}
              inputMode="numeric"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
                Lat / Long
              </span>
              <input
                className={inputClass}
                style={{ borderColor: B.border, color: B.blue }}
                value={form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : ""}
                readOnly
                placeholder="Use GPS"
              />
            </label>
            <PrimaryButton type="button" variant="secondary" onClick={captureLocation}>
              <MapPin size={14} className="mr-1 inline" />
              GPS
            </PrimaryButton>
          </div>
          <PrimaryButton type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? "Generating…" : "Generate QR"}
          </PrimaryButton>
        </form>
        {qr ? (
          <div
            className="rounded-2xl border p-4 break-all text-xs"
            style={{ borderColor: B.border, background: "#fff", color: B.blue }}
          >
            <div className="mb-2 text-sm font-bold">QR payload</div>
            {qr}
            {txnId ? (
              <div className="mt-2" style={{ color: B.muted }}>
                Txn: {txnId}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
