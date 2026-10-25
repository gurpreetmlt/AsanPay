"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import type { ApiResponse } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

export default function CmsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [merchantId, setMerchantId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastTxn, setLastTxn] = useState("");
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  async function start(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatusText("");
    try {
      const { data } = await api.post<
        ApiResponse<{ redirectionUrl: string; transactionId: string }>
      >("/noble/cms/start", {
        merchantId: merchantId.trim(),
        ...(transactionId.trim() ? { transactionId: transactionId.trim() } : {}),
      });
      if (!data.success) throw new Error(data.message);
      const url = data.data.redirectionUrl;
      const tid = data.data.transactionId;
      setLastTxn(tid);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Cash collection started — complete payment in the opened window");
    } catch (err) {
      toast.error(extractApiError(err, "Could not start cash collection. Check the merchant id and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function checkStatus() {
    const tid = lastTxn || transactionId.trim();
    if (!tid) {
      toast.error("Start a cash collection or enter its transaction id first");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<
        ApiResponse<{ tranStatus: string; amount: string; utr: string }>
      >("/noble/cms/status", { transactionId: tid });
      if (!data.success) throw new Error(data.message);
      const d = data.data;
      setStatusText(`Status: ${d.tranStatus || "—"} · Amount: ${d.amount || "—"} · UTR: ${d.utr || "—"}`);
    } catch (err) {
      toast.error(extractApiError(err, "Could not fetch the cash collection status. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border px-3 py-2.5 text-sm outline-none";

  return (
    <AppShell>
      <div className="mx-auto max-w-lg space-y-4 pb-10">
        <h1 className="text-lg font-bold" style={{ color: B.blue }}>
          Cash Collection
        </h1>
        <p className="text-sm" style={{ color: B.muted }}>
          Start opens the bank page; then check status with the same transaction id.
        </p>
        <form
          onSubmit={start}
          className="space-y-3 rounded-2xl border p-4"
          style={{ borderColor: B.border, background: "#fff" }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
              Merchant id
            </span>
            <input
              className={inputClass}
              style={{ borderColor: B.border, color: B.blue }}
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value.replace(/\D/g, "").slice(0, 10))}
              required
              inputMode="numeric"
              maxLength={10}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
              Transaction id (optional, 12–25 chars)
            </span>
            <input
              className={inputClass}
              style={{ borderColor: B.border, color: B.blue }}
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value.slice(0, 25))}
              maxLength={25}
            />
          </label>
          <PrimaryButton type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? "Starting…" : "Start collection"}
          </PrimaryButton>
          <PrimaryButton type="button" variant="secondary" disabled={busy} className="w-full" onClick={() => void checkStatus()}>
            Check status
          </PrimaryButton>
          {statusText ? (
            <p className="text-sm" style={{ color: B.blue }}>
              {statusText}
            </p>
          ) : null}
          {lastTxn ? (
            <p className="text-xs" style={{ color: B.muted }}>
              Last transaction id: {lastTxn}
            </p>
          ) : null}
        </form>
      </div>
    </AppShell>
  );
}
