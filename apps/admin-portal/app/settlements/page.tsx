"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Landmark } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import Link from "next/link";

type Tab = "open" | "banks";

interface OpenSettlement {
  requestId: string;
  userId: string;
  userName: string;
  userUid: string;
  userMobile: string;
  amount: string;
  netAmount: string;
  mode: string;
  status: string;
  settlementBankLast4: string;
  settlementBankIfsc: string;
  holderName: string;
  requestedAt: string;
}

interface PendingBank {
  id: string;
  userId: string;
  userName: string;
  userUid: string;
  userMobile: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
  createdAt: string;
}

function formatInr(amount: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `₹${amount}`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

export default function AdminSettlementsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tab, setTab] = useState<Tab>("banks");
  const [openRows, setOpenRows] = useState<OpenSettlement[]>([]);
  const [banks, setBanks] = useState<PendingBank[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<{ bank: PendingBank; activate: boolean } | null>(
    null,
  );
  const [successFor, setSuccessFor] = useState<OpenSettlement | null>(null);
  const [bankUtr, setBankUtr] = useState("");
  const [failFor, setFailFor] = useState<OpenSettlement | null>(null);
  const [failReason, setFailReason] = useState("");
  const successKey = useRef(createAttemptKeyHolder("settle-ok"));
  const failKey = useRef(createAttemptKeyHolder("settle-fail"));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("tab");
    setTab(q === "open" ? "open" : "banks");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pending = await fetchApi<PendingBank[]>("/settlements/banks/pending");
      setPendingCount(pending.length);
      if (tab === "open") {
        setOpenRows(await fetchApi<OpenSettlement[]>("/settlements/requests/open"));
      } else {
        setBanks(pending);
      }
    } catch (err) {
      toast.error(errMessage(err, "Failed to load settlements"));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  async function confirmVerify() {
    if (!verifyTarget) return;
    setActing(verifyTarget.bank.id);
    try {
      await api.post(`/settlements/banks/${verifyTarget.bank.id}/verify`, {
        activate: verifyTarget.activate,
      });
      toast.success(
        verifyTarget.activate
          ? "Bank verified and activated"
          : "Bank verified — agent can Set as active later",
      );
      setVerifyTarget(null);
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Verify failed"));
    } finally {
      setActing(null);
    }
  }

  async function markSuccess() {
    if (!successFor || !bankUtr.trim()) {
      toast.error("Bank UTR is required");
      return;
    }
    setActing(successFor.requestId);
    try {
      await api.post(
        `/settlements/requests/${successFor.requestId}/success`,
        { bankUtr: bankUtr.trim() },
        { headers: { "Idempotency-Key": successKey.current.get() } },
      );
      toast.success("Payout marked successful");
      successKey.current.clear();
      setSuccessFor(null);
      setBankUtr("");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Mark success failed"));
    } finally {
      setActing(null);
    }
  }

  async function markFail() {
    if (!failFor || !failReason.trim()) {
      toast.error("Failure reason is required");
      return;
    }
    setActing(failFor.requestId);
    try {
      await api.post(
        `/settlements/requests/${failFor.requestId}/fail`,
        { failureReason: failReason.trim() },
        { headers: { "Idempotency-Key": failKey.current.get() } },
      );
      toast.success("Payout failed — balance restored");
      failKey.current.clear();
      setFailFor(null);
      setFailReason("");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Mark fail failed"));
    } finally {
      setActing(null);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
            style={{ background: B.badgeGrad }}
          >
            <Landmark size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
              Settlements
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              Open payouts and pending agent banks. Retailer bank verify also starts from{" "}
              <Link href="/users/retailers" className="font-semibold underline" style={{ color: B.blueLight }}>
                Agents → Retailers
              </Link>
              .
            </p>
          </div>
        </div>

        {pendingCount > 0 ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
            style={{ borderColor: "#FDBA74", background: "#FFF7ED" }}
          >
            <div>
              <p className="text-sm font-bold" style={{ color: "#C2410C" }}>
                {pendingCount} agent bank{pendingCount === 1 ? "" : "s"} awaiting verification
              </p>
              <p className="text-xs" style={{ color: "#9A3412" }}>
                Prefer Agents → Retailers for retailer context, or verify here for payouts ops.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setTab("banks");
                router.replace("/settlements?tab=banks");
              }}
              className="rounded-xl px-3 py-2 text-sm font-bold text-white"
              style={{ background: "#12B76A" }}
            >
              Open pending banks
            </button>
          </div>
        ) : null}

        <div className="flex gap-2">
          {(
            [
              {
                key: "banks" as const,
                label: pendingCount > 0 ? `Pending banks (${pendingCount})` : "Pending banks",
              },
              { key: "open" as const, label: "Open payouts" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                router.replace(`/settlements?tab=${t.key}`);
              }}
              className="rounded-xl px-3 py-2 text-sm font-semibold"
              style={{
                background: tab === t.key ? B.badgeGrad : "var(--admin-card)",
                color: tab === t.key ? B.ctaText : "var(--admin-muted)",
                border: `1px solid ${B.border}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>Loading…</p>
        ) : tab === "banks" ? (
          banks.length === 0 ? (
            <p className="text-sm" style={{ color: B.muted }}>No banks awaiting verification.</p>
          ) : (
            <div className="space-y-3">
              {banks.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl border bg-white p-4"
                  style={{ borderColor: B.border }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <span
                        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{ background: "#FFFAEB", color: "#B54708" }}
                      >
                        Needs verification
                      </span>
                      <div className="font-semibold" style={{ color: B.blue }}>
                        {b.holderName} · ****{b.accountNumberLast4}
                      </div>
                      <div className="text-sm" style={{ color: B.blueMid }}>
                        IFSC {b.ifsc}
                      </div>
                      <div className="text-xs" style={{ color: B.muted }}>
                        {b.userName} ({b.userUid}) · {b.userMobile}
                      </div>
                      <div className="text-xs" style={{ color: B.muted }}>
                        Added {new Date(b.createdAt).toLocaleString("en-IN")}
                      </div>
                      <Link
                        href={`/users/${b.userId}`}
                        className="inline-block text-xs font-semibold underline-offset-2 hover:underline"
                        style={{ color: B.blueMid }}
                      >
                        Open agent profile →
                      </Link>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px]">
                      <button
                        type="button"
                        disabled={acting === b.id}
                        onClick={() => setVerifyTarget({ bank: b, activate: true })}
                        className="rounded-xl px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        style={{ background: "#12B76A" }}
                      >
                        Verify & activate
                      </button>
                      <button
                        type="button"
                        disabled={acting === b.id}
                        onClick={() => setVerifyTarget({ bank: b, activate: false })}
                        className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        style={{ borderColor: B.border, color: B.blue }}
                      >
                        Verify only
                      </button>
                      <p className="text-[11px] leading-snug" style={{ color: B.muted }}>
                        Use <span className="font-semibold">Verify & activate</span> for the first
                        bank so the agent can withdraw.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : openRows.length === 0 ? (
          <p className="text-sm" style={{ color: B.muted }}>No open settlement payouts.</p>
        ) : (
          <div className="space-y-3">
            {openRows.map((r) => (
              <div
                key={r.requestId}
                className="rounded-2xl border bg-white p-4"
                style={{ borderColor: B.border }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold" style={{ color: B.blue }}>
                      {formatInr(r.amount)} · {r.mode.toUpperCase()} · {r.status}
                    </div>
                    <div className="text-xs" style={{ color: B.muted }}>
                      {r.userName} ({r.userUid}) · {r.userMobile}
                    </div>
                    <div className="text-xs" style={{ color: B.muted }}>
                      {r.holderName} · ****{r.settlementBankLast4} · {r.settlementBankIfsc}
                    </div>
                    <div className="text-xs" style={{ color: B.muted }}>
                      Requested {new Date(r.requestedAt).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSuccessFor(r);
                        setBankUtr("");
                        successKey.current.clear();
                      }}
                      className="rounded-xl px-3 py-2 text-sm font-bold text-white"
                      style={{ background: B.badgeGrad }}
                    >
                      Mark paid
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFailFor(r);
                        setFailReason("");
                        failKey.current.clear();
                      }}
                      className="rounded-xl border px-3 py-2 text-sm font-bold text-red-600"
                      style={{ borderColor: "#fecaca" }}
                    >
                      Mark failed
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {successFor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-bold" style={{ color: B.blue }}>
                Confirm payout
              </h3>
              <p className="mt-1 text-sm" style={{ color: B.muted }}>
                {successFor.userName} · {formatInr(successFor.amount)}
              </p>
              <input
                className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="Bank UTR"
                value={bankUtr}
                onChange={(e) => setBankUtr(e.target.value)}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-xl px-3 py-2 text-sm font-semibold" onClick={() => setSuccessFor(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={acting === successFor.requestId}
                  onClick={() => void markSuccess()}
                  className="rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: B.badgeGrad }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {failFor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-bold" style={{ color: B.blue }}>
                Mark payout failed
              </h3>
              <p className="mt-1 text-sm" style={{ color: B.muted }}>
                Balance will be restored for {failFor.userName}
              </p>
              <textarea
                className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                rows={3}
                placeholder="Failure reason"
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-xl px-3 py-2 text-sm font-semibold" onClick={() => setFailFor(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={acting === failFor.requestId}
                  onClick={() => void markFail()}
                  className="rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  Confirm fail
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {verifyTarget ? (
          <ConfirmModal
            title={verifyTarget.activate ? "Verify & activate bank?" : "Verify bank only?"}
            tone="warning"
            confirmLabel={verifyTarget.activate ? "Verify & activate" : "Verify only"}
            busy={acting === verifyTarget.bank.id}
            busyLabel="Verifying…"
            message={
              <>
                Confirm verification for{" "}
                <strong>
                  {verifyTarget.bank.holderName} ****{verifyTarget.bank.accountNumberLast4}
                </strong>{" "}
                ({verifyTarget.bank.userName}).
                {verifyTarget.activate
                  ? " This becomes the agent’s active settlement bank."
                  : " Agent can Set as active later from their portal."}
              </>
            }
            onClose={() => {
              if (acting !== verifyTarget.bank.id) setVerifyTarget(null);
            }}
            onConfirm={() => void confirmVerify()}
          />
        ) : null}
      </div>
    </AdminShell>
  );
}
