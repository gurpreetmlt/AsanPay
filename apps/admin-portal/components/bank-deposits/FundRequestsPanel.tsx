"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, FileText, Info, Link2, RefreshCw } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";

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
  hasBankLine?: boolean;
  requester?: { id: string; name: string; mobile: string; uid: string; role?: string };
  bankName?: string | null;
  bankLast4?: string | null;
}

interface LineCandidate {
  id: string;
  txnDate: string;
  amount: string;
  exactAmount: boolean;
  utr: string | null;
  narration: string | null;
  senderName: string | null;
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

const STATUS_PILL: Record<string, { label: string; color: string; bg: string }> = {
  submitted: { label: "Waiting for bank line", color: "#B45309", bg: "#FEF3C7" },
  pending_match: { label: "Waiting for bank line", color: "#B45309", bg: "#FEF3C7" },
  under_review: { label: "Ready to approve", color: "#1D4ED8", bg: "#DBEAFE" },
  auto_matched: { label: "Auto-matched", color: "#15803D", bg: "#DCFCE7" },
  amount_mismatch: { label: "Amount mismatch", color: "#C2410C", bg: "#FFEDD5" },
  suspect: { label: "UTR already used — check", color: "#B91C1C", bg: "#FEE2E2" },
  credited: { label: "Credited", color: "#15803D", bg: "#DCFCE7" },
  rejected: { label: "Rejected", color: "#B91C1C", bg: "#FEE2E2" },
  cancelled: { label: "Cancelled", color: "#64748B", bg: "#F1F5F9" },
};

function formatInr(amount: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `₹${amount}`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
  };
}

function initials(name: string | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

function errMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}

/** Open queue aging: 24h+ amber, 48h+ red. */
function fundAging(submittedAt: string): { label: string; bg: string; color: string } | null {
  const hours = (Date.now() - new Date(submittedAt).getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 24) return null;
  if (hours >= 48) return { label: `Aging ${Math.floor(hours)}h`, bg: "#FEE2E2", color: "#991B1B" };
  return { label: `Aging ${Math.floor(hours)}h`, bg: "#FEF3C7", color: "#92400E" };
}

export function FundRequestsPanel({
  onChanged,
  onGoToReconciliation,
}: {
  onChanged?: () => void;
  onGoToReconciliation?: () => void;
}) {
  const [tab, setTab] = useState<FrTab>("open");
  const [rows, setRows] = useState<FundRequestRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<FundRequestRow | null>(null);
  const [rejectCode, setRejectCode] = useState(REJECT_REASONS[0].code);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [approveFor, setApproveFor] = useState<FundRequestRow | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [linkFor, setLinkFor] = useState<FundRequestRow | null>(null);
  const [candidates, setCandidates] = useState<LineCandidate[] | null>(null);
  const [pickedLine, setPickedLine] = useState("");
  const approveKey = useRef(createAttemptKeyHolder("fr-approve"));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchApi<FundRequestRow[]>("/fund-requests", { status: tab, limit: 50 });
      setRows(list);
      if (tab === "open") setOpenCount(list.length);
    } catch (err) {
      toast.error(errMessage(err, "Could not load fund requests"));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
    onChanged?.();
  }, [load, onChanged]);

  async function rematch() {
    try {
      const { data } = await api.post<{ success: boolean; data: { processed: number }; message: string }>(
        "/fund-requests/rematch",
      );
      toast.success(data.message ?? `Rematched ${data.data?.processed ?? 0}`);
      refresh();
    } catch (err) {
      toast.error(errMessage(err, "Rematch failed"));
    }
  }

  async function openLink(r: FundRequestRow) {
    setLinkFor(r);
    setCandidates(null);
    setPickedLine("");
    try {
      const list = await fetchApi<LineCandidate[]>(`/fund-requests/${r.id}/line-candidates`);
      setCandidates(list);
      const exact = list.filter((c) => c.exactAmount);
      if (exact.length === 1) setPickedLine(exact[0]!.id);
    } catch (err) {
      toast.error(errMessage(err, "Could not load bank statement lines"));
      setCandidates([]);
    }
  }

  async function linkLine() {
    if (!linkFor) return;
    if (!pickedLine) return void toast.error("Select the bank statement line for this deposit");
    setActing(linkFor.id);
    try {
      await api.post(`/fund-requests/${linkFor.id}/link-line`, { lineId: pickedLine });
      toast.success("Bank line linked — you can approve it now");
      setLinkFor(null);
      refresh();
    } catch (err) {
      toast.error(errMessage(err, "Could not link the bank line"));
    } finally {
      setActing(null);
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
      refresh();
    } catch (err) {
      toast.error(errMessage(err, "Approve failed"));
    } finally {
      setActing(null);
    }
  }

  async function reject() {
    if (!rejectFor || acting) return;
    if (!rejectRemarks.trim()) return void toast.error("Enter reject remarks so the agent knows why");
    setActing(rejectFor.id);
    try {
      await api.post(`/fund-requests/${rejectFor.id}/reject`, {
        reasonCode: rejectCode,
        remarks: rejectRemarks.trim(),
      });
      toast.success("Fund request rejected");
      setRejectFor(null);
      setRejectRemarks("");
      refresh();
    } catch (err) {
      toast.error(errMessage(err, "Reject failed"));
    } finally {
      setActing(null);
    }
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: B.border }}>
        <div className="inline-flex rounded-xl p-1" style={{ background: "#F1F5F9" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              style={
                tab === t.key
                  ? { background: "#fff", color: B.blueLight, boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }
                  : { color: B.muted }
              }
            >
              {t.label}
              {t.key === "open" && openCount > 0 ? (
                <span className="rounded-full px-1.5 text-[10px] font-bold" style={{ background: "#DBEAFE", color: B.blueLight }}>
                  {openCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void rematch()}
          className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-semibold"
          style={{ borderColor: "#BFD0F5", color: B.blueLight }}
        >
          <RefreshCw size={13} /> Rematch pending
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider" style={{ borderColor: B.border, color: B.muted }}>
              <th className="px-4 py-3 font-semibold">Agent</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Mode / bank</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Submitted</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: B.muted }}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: B.muted }}>
                  No {tab} fund requests
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const pill = STATUS_PILL[r.status] ?? { label: r.displayStatus, color: B.blueMid, bg: "#EEF2FF" };
                const submitted = formatWhen(r.submittedAt);
                const isOpen = tab === "open";
                const needsLine = isOpen && !r.hasBankLine;
                const age = isOpen ? fundAging(r.submittedAt) : null;
                return (
                  <Fragment key={r.id}>
                    <tr className={needsLine ? "" : "border-b"} style={{ borderColor: B.border }}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                            style={{ background: "#E8EEFC", color: B.blueLight }}
                          >
                            {initials(r.requester?.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold" style={{ color: B.blue }}>
                              {r.requester?.name ?? "—"}
                              {r.requester?.role ? (
                                <span
                                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                  style={{ background: "#F1F5F9", color: B.muted }}
                                >
                                  {ROLE_LABEL[r.requester.role] ?? r.requester.role}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs" style={{ color: B.muted }}>
                              {r.requester?.uid} · {r.requester?.mobile}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-base font-bold tabular-nums" style={{ color: B.blue }}>
                        {formatInr(r.amount)}
                        {r.creditedAmount ? (
                          <div className="text-xs font-medium" style={{ color: "#15803D" }}>
                            Credited {formatInr(r.creditedAmount)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-xs" style={{ color: B.muted }}>
                        <div className="font-bold uppercase" style={{ color: B.blue }}>
                          {r.paymentMode.replace(/_/g, " ")}
                        </div>
                        {r.referenceNumber ? <div className="font-mono">{r.referenceNumber}</div> : null}
                        {r.bankName ? (
                          <div>
                            {r.bankName} ••{r.bankLast4}
                          </div>
                        ) : null}
                        <div>Deposited {formatWhen(r.depositDatetime).date}, {formatWhen(r.depositDatetime).time}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ background: pill.bg, color: pill.color }}
                        >
                          {pill.label}
                        </span>
                        {age ? (
                          <div>
                            <span
                              className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{ background: age.bg, color: age.color }}
                            >
                              {age.label}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-xs" style={{ color: B.muted }}>
                        <div>{submitted.date}</div>
                        <div>{submitted.time}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={r.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`${btn} border bg-white`}
                            style={{ borderColor: B.border, color: B.blue }}
                          >
                            <FileText size={13} /> Receipt
                          </a>
                          {isOpen ? (
                            <>
                              {needsLine ? (
                                <button
                                  type="button"
                                  disabled={acting === r.id}
                                  onClick={() => void openLink(r)}
                                  className={`${btn} text-white`}
                                  style={{ background: B.badgeGrad }}
                                >
                                  <Link2 size={13} /> Link bank line
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={acting === r.id}
                                  onClick={() => {
                                    approveKey.current.clear();
                                    setApproveFor(r);
                                    setCreditAmount("");
                                    setApproveNote("");
                                  }}
                                  className={`${btn} text-white`}
                                  style={{ background: B.green }}
                                >
                                  <Check size={13} /> Approve
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={acting === r.id}
                                onClick={() => {
                                  setRejectFor(r);
                                  setRejectCode(REJECT_REASONS[0].code);
                                  setRejectRemarks("");
                                }}
                                className={`${btn} border bg-white`}
                                style={{ borderColor: "#FCA5A5", color: B.danger }}
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {needsLine ? (
                      <tr className="border-b" style={{ borderColor: B.border }}>
                        <td colSpan={6} className="px-4 pb-4">
                          <div
                            className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs"
                            style={{ background: "#EFF4FF", borderColor: "#D6E2FB", color: B.muted }}
                          >
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                              style={{ background: B.blueLight }}
                            >
                              <Info size={12} />
                            </span>
                            <span>
                              <b style={{ color: B.blue }}>No bank statement line yet.</b> Upload the statement in the{" "}
                              {onGoToReconciliation ? (
                                <button
                                  type="button"
                                  onClick={onGoToReconciliation}
                                  className="font-semibold underline"
                                  style={{ color: B.blueLight }}
                                >
                                  Reconciliation tab
                                </button>
                              ) : (
                                "Reconciliation tab"
                              )}
                              , or use Link bank line.
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {linkFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="text-base font-semibold" style={{ color: B.blue }}>
              Link bank statement line
            </h2>
            <p className="mb-4 text-xs" style={{ color: B.muted }}>
              {linkFor.requester?.name} · claimed {formatInr(linkFor.amount)} · {linkFor.bankName} ••{linkFor.bankLast4} ·
              deposited {formatWhen(linkFor.depositDatetime).date}
            </p>
            {candidates === null ? (
              <p className="py-6 text-center text-sm" style={{ color: B.muted }}>
                Loading bank lines…
              </p>
            ) : candidates.length === 0 ? (
              <div className="rounded-xl border px-4 py-5 text-sm" style={{ borderColor: B.border, color: B.muted }}>
                No unmatched credits found on {linkFor.bankName} ••{linkFor.bankLast4} within 7 days of this deposit.
                Upload the bank statement first.
                {onGoToReconciliation ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLinkFor(null);
                      onGoToReconciliation();
                    }}
                    className="mt-3 block rounded-lg px-3 py-2 text-xs font-bold text-white"
                    style={{ background: B.badgeGrad }}
                  >
                    Go to Reconciliation → Upload statement
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="max-h-[320px] space-y-2 overflow-y-auto">
                {candidates.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm"
                    style={{
                      borderColor: pickedLine === c.id ? B.blueLight : B.border,
                      background: pickedLine === c.id ? "#EFF4FF" : "#fff",
                    }}
                  >
                    <input
                      type="radio"
                      name="line"
                      className="mt-1"
                      checked={pickedLine === c.id}
                      onChange={() => setPickedLine(c.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <b style={{ color: "#15803D" }}>+ {formatInr(c.amount)}</b>
                        <span className="text-xs" style={{ color: B.muted }}>
                          {c.txnDate.split("-").reverse().join("/")}
                        </span>
                        {c.exactAmount ? (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#DCFCE7", color: "#15803D" }}>
                            Same amount
                          </span>
                        ) : (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#FFEDD5", color: "#C2410C" }}>
                            Different amount
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs" style={{ color: B.muted }}>
                        {c.utr ? `UTR ${c.utr} · ` : ""}
                        {c.narration ?? c.senderName ?? "No narration"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setLinkFor(null)}
                className="flex-1 rounded-lg border py-2 text-sm font-semibold"
                style={{ borderColor: "#FCA5A5", color: B.danger }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!acting || !candidates?.length}
                onClick={() => void linkLine()}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: B.badgeGrad }}
              >
                {acting ? "Linking…" : "Link line"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approveFor ? (
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
              placeholder="Leave blank to credit the bank statement amount"
              onChange={(e) => {
                setCreditAmount(e.target.value.replace(/[^\d.]/g, ""));
                approveKey.current.clear();
              }}
              className="mb-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
            />
            <p className="mb-3 text-[11px]" style={{ color: B.muted }}>
              Blank = the amount the bank actually received.
            </p>
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
                className="flex-1 rounded-lg border py-2 text-sm font-semibold"
                style={{ borderColor: "#FCA5A5", color: B.danger }}
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
      ) : null}

      {rejectFor ? (
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
                className="flex-1 rounded-lg border py-2 text-sm font-semibold"
                style={{ borderColor: B.border, color: B.muted }}
              >
                Close
              </button>
              <button
                type="button"
                disabled={!!acting}
                onClick={() => void reject()}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-white"
                style={{ background: B.danger }}
              >
                {acting ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
