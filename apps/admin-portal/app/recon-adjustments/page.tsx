"use client";

import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Scale, Check, X } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { ConfirmModal, type ConfirmTone } from "@/components/ui/ConfirmModal";
import { PromptModal } from "@/components/ui/PromptModal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type PendingConfirm = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone: ConfirmTone;
  action: () => void | Promise<void>;
};

type PendingPrompt = {
  title: string;
  message?: ReactNode;
  label?: string;
  placeholder?: string;
  minLength?: number;
  multiline?: boolean;
  tone?: ConfirmTone;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
};

type AdjStatus = "requested" | "approved" | "rejected";

interface ReconAdjustment {
  id: string;
  amount: string;
  debitCode: string;
  creditCode: string;
  reason: string;
  status: AdjStatus;
  requestedBy: string;
  requestedByName: string;
  approvedBy: string | null;
  approvedByName: string | null;
  decisionNote: string | null;
  journalId: string | null;
  requestedAt: string;
  decidedAt: string | null;
}

interface AccountCode {
  code: string;
  name: string;
  accountType: string;
}

const EMPTY_FORM = {
  amount: "",
  debitCode: "",
  creditCode: "",
  reason: "",
};

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ReconAdjustmentsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);

  const [rows, setRows] = useState<ReconAdjustment[]>([]);
  const [accounts, setAccounts] = useState<AccountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState<"" | AdjStatus>("requested");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "100" };
      if (statusFilter) params.status = statusFilter;
      const [list, codes] = await Promise.all([
        fetchApi<ReconAdjustment[]>("/admin/recon-adjustments", params),
        fetchApi<AccountCode[]>("/admin/recon-adjustments/account-codes", { limit: "200" }),
      ]);
      setRows(list);
      setAccounts(codes);
    } catch (err) {
      toast.error(errMessage(err, "Failed to load recon adjustments"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load]);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    if (!form.amount.trim() || Number(form.amount) <= 0) {
      toast.error("Enter a positive amount in rupees");
      return;
    }
    if (!form.debitCode.trim() || !form.creditCode.trim()) {
      toast.error("Enter debit and credit account codes");
      return;
    }
    if (form.reason.trim().length < 8) {
      toast.error("Reason must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/recon-adjustments", {
        amount: form.amount.trim(),
        debitCode: form.debitCode.trim(),
        creditCode: form.creditCode.trim(),
        reason: form.reason.trim(),
      });
      toast.success("Adjustment requested — another admin must approve");
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not request adjustment"));
    } finally {
      setSaving(false);
    }
  }

  async function executeApprove(row: ReconAdjustment) {
    setDecidingId(row.id);
    try {
      await api.post(`/admin/recon-adjustments/${row.id}/approve`, {});
      toast.success("Adjustment approved and posted to the ledger");
      setPendingConfirm(null);
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not approve adjustment"));
    } finally {
      setDecidingId(null);
    }
  }

  function approve(row: ReconAdjustment) {
    if (me?.id && row.requestedBy === me.id) {
      toast.error("You cannot approve your own adjustment");
      return;
    }
    setPendingConfirm({
      title: "Approve recon adjustment?",
      message: (
        <>
          Approve ₹{row.amount} DR{" "}
          <span className="font-mono font-semibold" style={{ color: B.blue }}>
            {row.debitCode}
          </span>{" "}
          / CR{" "}
          <span className="font-mono font-semibold" style={{ color: B.blue }}>
            {row.creditCode}
          </span>
          ?
        </>
      ),
      confirmLabel: "Approve",
      tone: "info",
      action: () => void executeApprove(row),
    });
  }

  async function executeReject(row: ReconAdjustment, note: string) {
    setDecidingId(row.id);
    setPendingPrompt(null);
    try {
      await api.post(`/admin/recon-adjustments/${row.id}/reject`, { note });
      toast.success("Adjustment rejected");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not reject adjustment"));
    } finally {
      setDecidingId(null);
    }
  }

  function reject(row: ReconAdjustment) {
    if (me?.id && row.requestedBy === me.id) {
      toast.error("You cannot reject your own adjustment");
      return;
    }
    setPendingPrompt({
      title: "Reject recon adjustment?",
      message: "A rejection note is required for the maker.",
      label: "Rejection note",
      placeholder: "Why is this adjustment being rejected?",
      minLength: 3,
      multiline: true,
      tone: "danger",
      confirmLabel: "Reject",
      onConfirm: (value) => void executeReject(row, value),
    });
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-6">
        <SectionTabs group="reports" />
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
            style={{ background: B.badgeGrad }}
          >
            <Scale size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Recon adjustments
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              Ledger corrections (RECON_ADJUSTMENT). Maker requests; a different admin must approve
              before any journal is posted.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={onRequest}
            className="space-y-4 rounded-2xl border bg-white p-5"
            style={{ borderColor: B.border }}
          >
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Request adjustment
            </h2>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Amount (₹)
              </span>
              <input
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border }}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") }))}
                placeholder="e.g. 100.00"
                inputMode="decimal"
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Debit account code
                </span>
                <input
                  list="ledger-account-codes"
                  className="w-full rounded-xl border px-3 py-2.5 font-mono text-sm"
                  style={{ borderColor: B.border }}
                  value={form.debitCode}
                  onChange={(e) => setForm((f) => ({ ...f, debitCode: e.target.value }))}
                  placeholder="e.g. COMPANY_001"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Credit account code
                </span>
                <input
                  list="ledger-account-codes"
                  className="w-full rounded-xl border px-3 py-2.5 font-mono text-sm"
                  style={{ borderColor: B.border }}
                  value={form.creditCode}
                  onChange={(e) => setForm((f) => ({ ...f, creditCode: e.target.value }))}
                  placeholder="e.g. TREASURY_FLOAT_CONTROL"
                  required
                />
              </label>
            </div>
            <datalist id="ledger-account-codes">
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name} ({a.accountType})
                </option>
              ))}
            </datalist>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Reason (min 8 characters)
              </span>
              <textarea
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border }}
                rows={3}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Why this correction is needed (bank ref, exception id, …)"
                required
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Submitting…" : "Submit for approval"}
            </button>
          </form>

          <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Controls
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-sm" style={{ color: B.muted }}>
              <li>No journal posts until a second admin approves.</li>
              <li>Maker cannot approve or reject their own request.</li>
              <li>Posts a balanced two-leg RECON_ADJUSTMENT with reason + checker id.</li>
              <li>
                Use carefully — this is the only intentional path to force a wildcard ledger
                correction in ops.
              </li>
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Status
              </span>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "" | AdjStatus)}
              >
                <option value="">All</option>
                <option value="requested">Pending approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: B.border, color: B.blue }}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !rows.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No recon adjustments match this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="py-2 pr-3 font-semibold">When</th>
                    <th className="py-2 pr-3 font-semibold">Legs</th>
                    <th className="py-2 pr-3 font-semibold">Amount</th>
                    <th className="py-2 pr-3 font-semibold">Maker</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const mine = me?.id && row.requestedBy === me.id;
                    const pending = row.status === "requested";
                    return (
                      <tr key={row.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                        <td className="py-3 pr-3 whitespace-nowrap text-xs" style={{ color: B.muted }}>
                          {formatWhen(row.requestedAt)}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="font-mono text-xs">
                            DR {row.debitCode}
                          </div>
                          <div className="font-mono text-xs">
                            CR {row.creditCode}
                          </div>
                          <div className="mt-1 max-w-[220px] text-xs" style={{ color: B.muted }}>
                            {row.reason}
                          </div>
                        </td>
                        <td className="py-3 pr-3 font-semibold" style={{ color: B.blue }}>
                          ₹{row.amount}
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          {row.requestedByName}
                          {row.approvedByName ? (
                            <div style={{ color: B.muted }}>Checker: {row.approvedByName}</div>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className="rounded-lg px-2 py-1 text-xs font-semibold capitalize"
                            style={{
                              background:
                                row.status === "approved"
                                  ? "rgba(22,163,74,0.12)"
                                  : row.status === "rejected"
                                    ? "rgba(185,28,28,0.1)"
                                    : "rgba(234,179,8,0.15)",
                              color:
                                row.status === "approved"
                                  ? "#15803d"
                                  : row.status === "rejected"
                                    ? "#b91c1c"
                                    : "#a16207",
                            }}
                          >
                            {row.status}
                          </span>
                          {row.journalId ? (
                            <div className="mt-1 font-mono text-[11px]" style={{ color: B.muted }}>
                              J#{row.journalId}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 text-right">
                          {pending ? (
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                disabled={!!mine || decidingId === row.id}
                                onClick={() => void approve(row)}
                                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold disabled:opacity-40"
                                style={{ borderColor: B.border, color: "#15803d" }}
                              >
                                <Check size={14} /> Approve
                              </button>
                              <button
                                type="button"
                                disabled={!!mine || decidingId === row.id}
                                onClick={() => void reject(row)}
                                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold disabled:opacity-40"
                                style={{ borderColor: B.border, color: "#b91c1c" }}
                              >
                                <X size={14} /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: B.muted }}>
                              {row.decisionNote || "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {pendingConfirm ? (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          tone={pendingConfirm.tone}
          busy={decidingId !== null}
          onConfirm={() => void pendingConfirm.action()}
          onClose={() => {
            if (!decidingId) setPendingConfirm(null);
          }}
        />
      ) : null}

      {pendingPrompt ? (
        <PromptModal
          title={pendingPrompt.title}
          message={pendingPrompt.message}
          label={pendingPrompt.label}
          placeholder={pendingPrompt.placeholder}
          minLength={pendingPrompt.minLength}
          multiline={pendingPrompt.multiline}
          tone={pendingPrompt.tone}
          confirmLabel={pendingPrompt.confirmLabel}
          busy={decidingId !== null}
          onConfirm={(v) => pendingPrompt.onConfirm(v)}
          onClose={() => {
            if (!decidingId) setPendingPrompt(null);
          }}
        />
      ) : null}
    </AdminShell>
  );
}
