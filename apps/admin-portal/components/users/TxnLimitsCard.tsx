"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Gauge, RotateCcw, SlidersHorizontal } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { Modal } from "@/components/ui/Modal";
import { DetailSection } from "@/components/users/DetailSection";
import { SERVICE_ICON, type ServiceGroup } from "@/components/users/ServiceAccessCard";

type Limits = { perTxnRupees: number | null; dailyRupees: number | null; monthlyRupees: number | null };
type Row = { group: ServiceGroup; label: string; platform: Limits; custom: Limits | null; reason: string | null; updatedAt: string | null };
type Field = keyof Limits;

const FIELDS: Array<{ key: Field; label: string; short: string }> = [
  { key: "perTxnRupees", label: "Per transaction limit", short: "Per txn" },
  { key: "dailyRupees", label: "Daily limit", short: "Daily" },
  { key: "monthlyRupees", label: "Monthly limit", short: "Monthly" },
];

const inr = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

type Draft = Record<Field, string>;

function fieldError(label: string, raw: string): string | null {
  if (!raw.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw.trim())) return `${label} must be an amount like 5000 or 2500.50`;
  if (Number(raw) <= 0) return `${label} must be more than ₹0`;
  return null;
}

function draftErrors(d: Draft, platform: Limits): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const f of FIELDS) {
    const e = fieldError(f.label, d[f.key]);
    if (e) out[f.key] = e;
  }
  const n = (k: Field) => (d[k].trim() && !out[k] ? Number(d[k]) : null);
  const per = n("perTxnRupees");
  const day = n("dailyRupees");
  const month = n("monthlyRupees");
  if (per != null && platform.perTxnRupees != null && per > platform.perTxnRupees) {
    out.perTxnRupees = `Cannot be more than the platform maximum ${inr(platform.perTxnRupees)}`;
  }
  if (per != null && day != null && day < per && !out.dailyRupees) out.dailyRupees = "Daily limit must be at least the per transaction limit";
  if (day != null && month != null && month < day && !out.monthlyRupees) out.monthlyRupees = "Monthly limit must be at least the daily limit";
  return out;
}

/** Agent page → Services & limits: per-agent per txn / daily / monthly caps for each service. */
export function TxnLimitsCard({ userId, agentName }: { userId: string; agentName: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [resetting, setResetting] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Draft>({ perTxnRupees: "", dailyRupees: "", monthlyRupees: "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchApi<Row[]>(`/admin/users/${userId}/txn-limits`));
    } catch (err) {
      toast.error(errMsg(err, "Transaction limits did not load. Refresh the page."));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEditor(r: Row) {
    const s = (v: number | null | undefined) => (v == null ? "" : String(v));
    setDraft({ perTxnRupees: s(r.custom?.perTxnRupees), dailyRupees: s(r.custom?.dailyRupees), monthlyRupees: s(r.custom?.monthlyRupees) });
    setReason("");
    setEditing(r);
  }

  const errors = editing ? draftErrors(draft, editing.platform) : {};
  const empty = FIELDS.every((f) => !draft[f.key].trim());
  const reasonError = reason.trim().length < 3 ? "Enter a reason (at least 3 characters)" : null;
  const canSave = !!editing && !empty && Object.keys(errors).length === 0 && !reasonError;

  async function save() {
    if (!editing || !canSave) return;
    setBusy(true);
    const val = (k: Field) => (draft[k].trim() ? Number(draft[k]) : null);
    try {
      const res = await api.put<{ data: Row[] }>(`/admin/users/${userId}/txn-limits`, {
        group: editing.group,
        perTxnRupees: val("perTxnRupees"),
        dailyRupees: val("dailyRupees"),
        monthlyRupees: val("monthlyRupees"),
        reason: reason.trim(),
      });
      setRows(res.data.data);
      toast.success(`${editing.label} limits saved for ${agentName}`);
      setEditing(null);
    } catch (err) {
      toast.error(errMsg(err, "Limits were not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!resetting || reasonError) return;
    setBusy(true);
    try {
      const res = await api.delete<{ data: Row[] }>(`/admin/users/${userId}/txn-limits/${resetting.group}`, {
        data: { reason: reason.trim() },
      });
      setRows(res.data.data);
      toast.success(`${resetting.label} back to platform limits`);
      setResetting(null);
    } catch (err) {
      toast.error(errMsg(err, "Limits were not reset. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const reasonBlock = (placeholder: string) => (
    <div>
      <label className="block text-xs font-semibold" style={{ color: B.muted }}>
        Reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
          style={{ borderColor: B.border, color: B.blue }}
        />
      </label>
      <p className="mt-1 text-[11px]" style={{ color: reason && reasonError ? B.danger : B.muted }}>
        {reason && reasonError ? reasonError : "Saved in the audit log with your name"}
      </p>
    </div>
  );

  return (
    <DetailSection title="Transaction limits" icon={Gauge}>
      {!rows ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : (
        <div className="space-y-2">
          <p className="mb-1 text-xs" style={{ color: B.muted }}>
            Custom limits apply to {agentName} only and count success, pending and in-progress transactions (India time day / month).
            Empty = platform default.
          </p>
          {rows.map((r) => {
            const RowIcon = SERVICE_ICON[r.group];
            return (
              <div
                key={r.group}
                className="flex flex-col gap-3 rounded-2xl border px-3 py-3 md:flex-row md:items-center"
                style={{
                  borderColor: r.custom ? "rgba(42,92,221,0.35)" : B.border,
                  background: r.custom ? "linear-gradient(90deg, #F7F9FF 0%, var(--admin-card) 70%)" : "var(--admin-card)",
                }}
              >
                <div className="flex min-w-0 items-center gap-3 md:w-56">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}>
                    <RowIcon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                      {r.label}
                    </p>
                    <p className="truncate text-[11px]" style={{ color: r.custom ? B.blueLight : B.muted }} title={r.reason ?? undefined}>
                      {r.custom ? `Custom · ${r.reason ?? ""}` : "Platform defaults"}
                    </p>
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-3 gap-2">
                  {FIELDS.map((f) => {
                    const custom = r.custom?.[f.key] ?? null;
                    const platform = r.platform[f.key];
                    return (
                      <div key={f.key} className="rounded-xl border px-2.5 py-1.5" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                          {f.short}
                        </p>
                        <p className="truncate text-sm font-bold" style={{ color: custom != null ? B.blueLight : B.blue }}>
                          {custom != null ? inr(custom) : platform != null ? inr(platform) : "No limit"}
                        </p>
                        {custom != null ? (
                          <p className="truncate text-[10px]" style={{ color: B.muted }}>
                            Platform {platform != null ? inr(platform) : "no limit"}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEditor(r)}
                    className="admin-btn-primary rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {r.custom ? "Change" : "Set limits"}
                  </button>
                  {r.custom ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setReason("");
                        setResetting(r);
                      }}
                      className="admin-btn-danger rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing ? (
        <Modal
          title={`${editing.label} limits`}
          eyebrow={agentName}
          subtitle="Leave a field empty to use the platform default. Agents get a clear message when they hit a limit."
          icon={<SlidersHorizontal size={22} />}
          iconTone="blue"
          wide
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <div className="space-y-3">
            <div className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-3" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
              {FIELDS.map((f) => {
                const platform = editing.platform[f.key];
                const err = errors[f.key];
                return (
                  <label key={f.key} className="block text-xs font-semibold" style={{ color: B.muted }}>
                    {f.label} (₹)
                    <input
                      inputMode="decimal"
                      value={draft[f.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))}
                      placeholder={platform != null ? String(platform) : "No limit"}
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                      style={{ borderColor: err ? B.danger : B.border, color: B.blue }}
                    />
                    <span className="mt-1 block text-[11px] font-normal" style={{ color: err ? B.danger : B.muted }}>
                      {err ?? `Platform: ${platform != null ? inr(platform) : "no limit"}`}
                    </span>
                  </label>
                );
              })}
            </div>
            {empty ? (
              <p className="text-[11px]" style={{ color: B.muted }}>
                Enter at least one limit, or use Reset to go back to platform defaults.
              </p>
            ) : null}
            {reasonBlock("e.g. New agent, start with lower limits")}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: B.danger }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !canSave}
                onClick={() => void save()}
                className="admin-btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save limits"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {resetting ? (
        <Modal
          title={`Reset ${resetting.label} limits?`}
          eyebrow={agentName}
          subtitle="Custom limits are removed and the platform defaults apply again."
          icon={<RotateCcw size={22} />}
          iconTone="amber"
          onClose={() => {
            if (!busy) setResetting(null);
          }}
        >
          <div className="space-y-3">
            {reasonBlock("e.g. Agent volume reviewed, back to normal")}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setResetting(null)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy || !!reasonError}
                onClick={() => void reset()}
                className="admin-btn-danger rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Resetting…" : "Reset limits"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </DetailSection>
  );
}
