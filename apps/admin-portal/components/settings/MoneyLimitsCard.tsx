"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { IndianRupee } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

type Limits = {
  dmtPerTxnRupees: number;
  dmtRemitterMonthlyRupees: number;
  dmtAgentDailyRupees: number;
  adminManualFundDailyRupees: number;
};
type Key = keyof Limits;

const FIELDS: { key: Key; label: string; help: string }[] = [
  { key: "dmtPerTxnRupees", label: "DMT per transfer", help: "Largest single money transfer. Provider allows up to ₹5,000." },
  { key: "dmtAgentDailyRupees", label: "DMT per agent per day", help: "Total money transfers one agent can do in a day (IST)." },
  { key: "dmtRemitterMonthlyRupees", label: "DMT per remitter per month", help: "Total one sender can send in a calendar month." },
  { key: "adminManualFundDailyRupees", label: "Admin manual top-up per day", help: "Total wallet top-ups an admin can do by hand in a day." },
];

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Platform Settings → Money limits for every agent. One agent can differ via their page → Services & limits. */
export function MoneyLimitsCard() {
  const [saved, setSaved] = useState<Limits | null>(null);
  const [defaults, setDefaults] = useState<Limits | null>(null);
  const [form, setForm] = useState<Record<Key, string> | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchApi<{ limits: Limits; defaults: Limits }>("/admin/money-limits");
      setSaved(d.limits);
      setDefaults(d.defaults);
      setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(d.limits[f.key])])) as Record<Key, string>);
    } catch (err) {
      toast.error(errMsg(err, "Money limits did not load. Refresh the page."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const errors: Partial<Record<Key, string>> = {};
  if (form) {
    for (const f of FIELDS) {
      const v = Number(form[f.key]);
      if (!form[f.key].trim() || !Number.isFinite(v) || v <= 0) errors[f.key] = `${f.label} must be more than ₹0`;
    }
    const perTxn = Number(form.dmtPerTxnRupees);
    if (!errors.dmtAgentDailyRupees && Number(form.dmtAgentDailyRupees) < perTxn) {
      errors.dmtAgentDailyRupees = "Must be at least the DMT per transfer limit";
    }
    if (!errors.dmtRemitterMonthlyRupees && Number(form.dmtRemitterMonthlyRupees) < perTxn) {
      errors.dmtRemitterMonthlyRupees = "Must be at least the DMT per transfer limit";
    }
  }
  const dirty = !!saved && !!form && FIELDS.some((f) => Number(form[f.key]) !== saved[f.key]);
  const reasonError = reason.trim().length < 3 ? "Enter a reason (at least 3 characters)" : null;
  const invalid = Object.keys(errors).length > 0;

  async function save() {
    if (!form || invalid || reasonError) return;
    setSaving(true);
    try {
      await api.put("/admin/money-limits", {
        ...Object.fromEntries(FIELDS.map((f) => [f.key, Number(form[f.key])])),
        reason: reason.trim(),
      });
      toast.success("Money limits saved for all agents");
      setReason("");
      await load();
    } catch (err) {
      toast.error(errMsg(err, "Money limits were not saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="money-limits" className="scroll-mt-24 space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
      <div className="flex items-center gap-2">
        <IndianRupee size={18} style={{ color: B.blueLight }} />
        <h2 className="text-sm font-bold" style={{ color: B.blue }}>
          Money limits · all agents
        </h2>
      </div>
      <p className="text-xs" style={{ color: B.muted }}>
        Default limits for every agent. To raise or lower DMT for one retailer, open their page → Services &amp; limits.
      </p>

      {!form || !saved ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : (
        <div className="space-y-3">
          <div
            className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-2"
            style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}
          >
            {FIELDS.map((f) => (
              <label key={f.key} className="block text-xs font-semibold" style={{ color: B.muted }}>
                {f.label}
                <div
                  className="mt-1 flex items-center rounded-xl border bg-white px-3"
                  style={{ borderColor: errors[f.key] ? B.danger : B.border }}
                >
                  <span className="text-sm font-bold" style={{ color: B.muted }}>
                    ₹
                  </span>
                  <input
                    inputMode="decimal"
                    value={form[f.key]}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((cur) => (cur ? { ...cur, [f.key]: e.target.value.replace(/[^\d.]/g, "") } : cur))
                    }
                    className="w-full bg-transparent px-2 py-2 text-sm font-bold tabular-nums outline-none"
                    style={{ color: B.blue }}
                  />
                </div>
                <span className="mt-1 block text-[11px] font-normal" style={{ color: errors[f.key] ? B.danger : B.muted }}>
                  {errors[f.key] ?? `${f.help}${defaults ? ` Default ${inr(defaults[f.key])}.` : ""}`}
                </span>
              </label>
            ))}
          </div>

          {dirty ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                Reason for this change
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Provider raised the per-transfer limit"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </label>
              <p className="text-[11px]" style={{ color: reason && reasonError ? B.danger : B.muted }}>
                {reason && reasonError ? reasonError : "Applies to every agent within 30 seconds. Saved in the audit log."}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving || invalid || !!reasonError}
            className="admin-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : dirty ? "Save for all agents" : "No changes"}
          </button>
        </div>
      )}
    </section>
  );
}
