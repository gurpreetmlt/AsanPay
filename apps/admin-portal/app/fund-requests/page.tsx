"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type FrTab = "open" | "credited" | "rejected" | "cancelled";

interface FundRequestRow {
  id: string;
  amount: string;
  paymentMode: string;
  referenceNumber: string | null;
  depositDatetime: string;
  senderName: string | null;
  status: string;
  displayStatus: string;
  creditedAmount: string | null;
  rejectReasonCode: string | null;
  rejectRemarks: string | null;
  submittedAt: string;
  receiptUrl: string;
  requester?: { id: string; name: string; mobile: string; uid: string; role?: string };
  bankName?: string | null;
  bankLast4?: string | null;
}

const TABS: { key: FrTab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "credited", label: "Credited" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
];

const REJECT_REASONS = [
  { code: "UTR_NOT_FOUND", label: "UTR not found in bank statement" },
  { code: "AMOUNT_MISMATCH", label: "Amount does not match deposit" },
  { code: "DUPLICATE", label: "Duplicate / already credited" },
  { code: "INVALID_RECEIPT", label: "Invalid or unclear receipt" },
  { code: "OTHER", label: "Other" },
];

function formatInr(amount: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `₹${amount}`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Open queue aging: 24h+ amber, 48h+ red. */
function fundAging(submittedAt: string): { label: string; bg: string; color: string } | null {
  const hours = (Date.now() - new Date(submittedAt).getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 24) return null;
  if (hours >= 48) {
    return { label: `Aging ${Math.floor(hours)}h`, bg: "#FEE2E2", color: "#991B1B" };
  }
  return { label: `Aging ${Math.floor(hours)}h`, bg: "#FEF3C7", color: "#92400E" };
}

export default function FundRequestsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tab, setTab] = useState<FrTab>("open");
  const [rows, setRows] = useState<FundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<FundRequestRow | null>(null);
  const [rejectCode, setRejectCode] = useState(REJECT_REASONS[0].code);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [approveFor, setApproveFor] = useState<FundRequestRow | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const approveKey = useRef(createAttemptKeyHolder("fr-approve"));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<FundRequestRow[]>("/fund-requests", { status: tab, limit: 50 }));
    } catch {
      toast.error("Failed to load fund requests");
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

  async function rematch() {
    try {
      const { data } = await api.post<{ success: boolean; data: { processed: number }; message: string }>(
        "/fund-requests/rematch",
      );
      toast.success(data.message ?? `Rematched ${data.data?.processed ?? 0}`);
      void load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Rematch failed";
      toast.error(message);
    }
  }

  async function approve() {
    if (!approveFor || acting) return;
    setActing(approveFor.id);
    try {
      await api.post(
        `/fund-requests/${approveFor.id}/approve`,
        {
          ...(creditAmount.trim() ? { creditAmount: creditAmount.trim() } : {}),
          ...(approveNote.trim() ? { note: approveNote.trim() } : {}),
        },
        { headers: { "Idempotency-Key": approveKey.current.get() } },
      );
      approveKey.current.clear();
      toast.success("Fund request credited");
      setApproveFor(null);
      setCreditAmount("");
      setApproveNote("");
      void load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Approve failed";
      toast.error(message);
    } finally {
      setActing(null);
    }
  }

  async function reject() {
    if (!rejectFor || acting) return;
    if (!rejectRemarks.trim()) {
      toast.error("Enter reject remarks");
      return;
    }
    setActing(rejectFor.id);
    try {
      await api.post(`/fund-requests/${rejectFor.id}/reject`, {
        reasonCode: rejectCode,
        remarks: rejectRemarks.trim(),
      });
      toast.success("Fund request rejected");
      setRejectFor(null);
      setRejectRemarks("");
      void load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Reject failed";
      toast.error(message);
    } finally {
      setActing(null);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
              Fund requests
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              Review retailer bank deposits and credit balances
            </p>
          </div>
          <button
            type="button"
            onClick={() => void rematch()}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: B.secondary, color: B.blueMid }}
          >
            Rematch pending
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="rounded-xl px-3 py-2 text-sm font-semibold transition"
              style={
                tab === t.key
                  ? { background: B.badgeGrad, color: "#fff" }
                  : { background: B.secondary, color: B.blueMid }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className="overflow-hidden rounded-2xl border bg-white"
          style={{ borderColor: B.border }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr
                  className="border-b text-xs uppercase tracking-wider"
                  style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
                >
                  <th className="px-4 py-3 font-semibold">Agent</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Mode / bank</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                      No {tab} fund requests
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: B.blue }}>
                          {r.requester?.name ?? "—"}
                          {r.requester?.role ? (
                            <span
                              className="ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold"
                              style={{ background: B.secondary, color: B.muted }}
                            >
                              {ROLE_LABEL[r.requester.role] ?? r.requester.role}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs font-mono" style={{ color: B.muted }}>
                          {r.requester?.uid} · {r.requester?.mobile}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: B.blue }}>
                        {formatInr(r.amount)}
                        {r.creditedAmount && (
                          <div className="text-xs font-normal" style={{ color: B.green }}>
                            Credited {formatInr(r.creditedAmount)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                        <div className="uppercase">{r.paymentMode.replace("_", " ")}</div>
                        <div className="font-mono">{r.referenceNumber || "—"}</div>
                        {r.bankName ? (
                          <div className="mt-0.5 font-semibold" style={{ color: B.blueMid }}>
                            {r.bankName} ••{r.bankLast4}
                          </div>
                        ) : null}
                        <div>Deposited {new Date(r.depositDatetime).toLocaleString("en-IN")}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="font-semibold" style={{ color: B.blueMid }}>
                          {r.status}
                        </span>
                        <div style={{ color: B.muted }}>{r.displayStatus}</div>
                        {tab === "open"
                          ? (() => {
                              const age = fundAging(r.submittedAt);
                              if (!age) return null;
                              return (
                                <span
                                  className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
                                  style={{ background: age.bg, color: age.color }}
                                >
                                  {age.label}
                                </span>
                              );
                            })()
                          : null}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: B.muted }}>
                        {new Date(r.submittedAt).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <a
                            href={r.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg px-2 py-1 text-xs font-semibold"
                            style={{ background: B.secondary, color: B.blueMid }}
                          >
                            Receipt
                          </a>
                          {tab === "open" && (
                            <>
                              <button
                                type="button"
                                disabled={acting === r.id}
                                onClick={() => {
                                  approveKey.current.clear();
                                  setApproveFor(r);
                                  setCreditAmount(r.amount);
                                  setApproveNote("");
                                }}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-white"
                                style={{ background: B.green }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={acting === r.id}
                                onClick={() => {
                                  setRejectFor(r);
                                  setRejectCode(REJECT_REASONS[0].code);
                                  setRejectRemarks("");
                                }}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-white"
                                style={{ background: "#DC2626" }}
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {approveFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="mb-1 text-base font-semibold" style={{ color: B.blue }}>
              Approve fund request
            </h2>
            <p className="mb-4 text-xs" style={{ color: B.muted }}>
              {approveFor.requester?.name} · claimed {formatInr(approveFor.amount)}
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">Credit amount (₹)</label>
            <input
              value={creditAmount}
              onChange={(e) => {
                setCreditAmount(e.target.value.replace(/[^\d.]/g, ""));
                approveKey.current.clear();
              }}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
            />
            <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
            <input
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              className="mb-4 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setApproveFor(null)}
                className="flex-1 rounded-lg py-2 text-sm font-semibold"
                style={{ background: B.secondary, color: B.blueMid }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!acting}
                onClick={() => void approve()}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-white"
                style={{ background: B.green }}
              >
                {acting ? "Crediting…" : "Credit balance"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="mb-1 text-base font-semibold" style={{ color: B.blue }}>
              Reject fund request
            </h2>
            <p className="mb-4 text-xs" style={{ color: B.muted }}>
              {rejectFor.requester?.name} · {formatInr(rejectFor.amount)}
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
            <select
              value={rejectCode}
              onChange={(e) => setRejectCode(e.target.value)}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
            >
              {REJECT_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            <label className="mb-1 block text-sm font-medium text-gray-700">Remarks</label>
            <textarea
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              rows={3}
              className="mb-4 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
              placeholder="Explain why this request is rejected"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRejectFor(null)}
                className="flex-1 rounded-lg py-2 text-sm font-semibold"
                style={{ background: B.secondary, color: B.blueMid }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!acting}
                onClick={() => void reject()}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-white"
                style={{ background: "#DC2626" }}
              >
                {acting ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
