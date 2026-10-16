"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { CheckCircle2, Circle, Lock, Unlock } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

interface DailyCloseStep {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  blocking: boolean;
  count: number;
  href: string | null;
}

interface DailyCloseBank {
  id: string;
  bankName: string;
  last4: string;
  uploaded: boolean;
}

interface DailyCloseStatus {
  date: string;
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
  note: string | null;
  canClose: boolean;
  banks: DailyCloseBank[];
  steps: DailyCloseStep[];
}

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

export function DailyClosePanel() {
  const [date, setDate] = useState(istToday);
  const [status, setStatus] = useState<DailyCloseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      setStatus(await fetchApi<DailyCloseStatus>("/banking/daily-close", { date: d }));
    } catch (err) {
      toast.error(errMessage(err, "Could not load daily close checklist"));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  async function closeDay() {
    setBusy(true);
    try {
      const { data } = await api.post<{ success: boolean; data: DailyCloseStatus; message?: string }>(
        "/banking/daily-close",
        { date, note: note.trim() || null },
      );
      if (!data.success) throw new Error(data.message || "Could not close this day");
      setStatus(data.data);
      setNote("");
      toast.success("Business day closed");
    } catch (err) {
      toast.error(errMessage(err, "Could not close this day"));
    } finally {
      setBusy(false);
    }
  }

  async function reopenDay() {
    setBusy(true);
    try {
      const { data } = await api.post<{ success: boolean; data: DailyCloseStatus; message?: string }>(
        "/banking/daily-close/reopen",
        { date },
      );
      if (!data.success) throw new Error(data.message || "Could not reopen this day");
      setStatus(data.data);
      toast.success("Business day reopened");
    } catch (err) {
      toast.error(errMessage(err, "Could not reopen this day"));
    } finally {
      setBusy(false);
    }
  }

  const doneCount = status?.steps.filter((s) => s.done).length ?? 0;
  const totalSteps = status?.steps.length ?? 4;

  return (
    <div className="space-y-5 p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Daily close
          </h2>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Walk through Upload → Reconcile → Resolve → Close for one business day
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
            Business date
          </span>
          <input
            type="date"
            className="h-11 rounded-xl border px-3 text-sm"
            style={{ borderColor: B.border }}
            value={date}
            onChange={(e) => setDate(e.target.value || istToday())}
          />
        </label>
      </div>

      {loading || !status ? (
        <p className="text-sm" style={{ color: B.muted }}>
          {loading ? "Loading checklist…" : "Checklist unavailable."}
        </p>
      ) : (
        <>
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
            style={{
              borderColor: status.closed ? "#BBF7D0" : B.border,
              background: status.closed ? "#F0FDF4" : "#F8FAFC",
            }}
          >
            <div>
              <p className="text-sm font-bold" style={{ color: status.closed ? "#15803D" : B.blue }}>
                {status.closed ? "Day closed" : `Checklist ${doneCount} of ${totalSteps}`}
              </p>
              <p className="text-xs" style={{ color: B.muted }}>
                {status.closed
                  ? `Closed${status.closedByName ? ` by ${status.closedByName}` : ""}${
                      status.closedAt ? ` · ${new Date(status.closedAt).toLocaleString("en-IN")}` : ""
                    }`
                  : "Soft close records the day as done. Balance lock comes later."}
              </p>
              {status.note ? (
                <p className="mt-1 text-xs" style={{ color: B.muted }}>
                  Note: {status.note}
                </p>
              ) : null}
            </div>
            {status.closed ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void reopenDay()}
                className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-60"
                style={{ borderColor: "#FCA5A5", color: B.danger }}
              >
                <Unlock size={15} /> Reopen day
              </button>
            ) : null}
          </div>

          <ol className="space-y-3">
            {status.steps.map((step, i) => (
              <li
                key={step.id}
                className="rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                style={{ borderColor: step.done ? "#BBF7D0" : B.border }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: step.done ? "#DCFCE7" : "#F1F5F9",
                        color: step.done ? "#15803D" : B.muted,
                      }}
                    >
                      {step.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: B.blue }}>
                        Step {i + 1}. {step.title}
                      </p>
                      <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
                        {step.detail}
                      </p>
                    </div>
                  </div>
                  {step.href && !status.closed ? (
                    <Link
                      href={step.href}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                      style={{ background: B.badgeGrad }}
                    >
                      Open
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          {status.banks.length > 0 ? (
            <div className="rounded-2xl border p-4" style={{ borderColor: B.border }}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                Banks for this date
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {status.banks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: B.border }}
                  >
                    <span className="font-semibold" style={{ color: B.blue }}>
                      {b.bankName} ••{b.last4}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        color: b.uploaded ? "#15803D" : "#B45309",
                        background: b.uploaded ? "#DCFCE7" : "#FEF3C7",
                      }}
                    >
                      {b.uploaded ? "Uploaded" : "Missing"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!status.closed ? (
            <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: B.border }}>
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Close note (optional)
                </span>
                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. All Indian Bank lines cleared"
                  maxLength={500}
                  disabled={!status.canClose || busy}
                />
              </label>
              <button
                type="button"
                disabled={!status.canClose || busy}
                onClick={() => void closeDay()}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: status.canClose ? B.badgeGrad : "#94A3B8" }}
              >
                <Lock size={15} />
                {busy ? "Closing…" : "Close this day"}
              </button>
              {!status.canClose ? (
                <p className="text-xs" style={{ color: B.muted }}>
                  Complete every blocking step above before closing.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
