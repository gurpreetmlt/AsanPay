"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Moon, Sun } from "lucide-react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

type Window = { enabled: boolean; start: string; end: string; startLabel: string; endLabel: string; closedNow: boolean };

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

/** Platform Settings → Night service window (counter services close every night, IST). */
export function NightWindowCard() {
  const [data, setData] = useState<Window | null>(null);
  const [form, setForm] = useState({ enabled: true, start: "00:00", end: "06:00" });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const w = await fetchApi<Window>("/admin/service-window");
      setData(w);
      setForm({ enabled: w.enabled, start: w.start, end: w.end });
    } catch (err) {
      toast.error(errMsg(err, "Night service window did not load. Refresh the page."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !!data && (form.enabled !== data.enabled || form.start !== data.start || form.end !== data.end);
  const sameTime = form.start === form.end;

  async function save() {
    if (sameTime) {
      toast.error("Start and end cannot be the same time. Turn the window off instead.");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("Enter a reason (at least 3 characters)");
      return;
    }
    setSaving(true);
    try {
      await api.put("/admin/service-window", { ...form, reason: reason.trim() });
      toast.success("Night service window saved");
      setReason("");
      await load();
    } catch (err) {
      toast.error(errMsg(err, "Night service window was not saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  const timeInput = "w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-bold tabular-nums outline-none focus:ring-2";

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Moon size={18} style={{ color: B.blueLight }} />
          <h2 className="text-sm font-bold" style={{ color: B.blue }}>
            Night service window
          </h2>
        </div>
        {data ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={data.closedNow ? { background: "#EEF2FF", color: "#3730A3" } : { background: "#F0FDF4", color: "#15803D" }}
          >
            {data.closedNow ? <Moon size={12} /> : <Sun size={12} />}
            {data.closedNow ? `Closed now · opens ${data.endLabel}` : "Services open now"}
          </span>
        ) : null}
      </div>
      <p className="text-xs" style={{ color: B.muted }}>
        AePS, money transfer (DMT), bill payments (BBPS), recharge and CMS close every day in this window (IST, server
        clock). Login, wallet, transfers, fund requests and settlements stay open. Keep a service open for one agent from
        their page → Controls → Night services.
      </p>

      {!data ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : (
        <>
          <ToggleSwitch checked={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} label="Close services at night" disabled={saving} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold" style={{ color: B.muted }}>
              Close at
              <input
                type="time"
                value={form.start}
                disabled={!form.enabled || saving}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                className={`${timeInput} mt-1`}
                style={{ borderColor: B.border, color: B.blue }}
              />
            </label>
            <label className="block text-xs font-semibold" style={{ color: B.muted }}>
              Open again at
              <input
                type="time"
                value={form.end}
                disabled={!form.enabled || saving}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                className={`${timeInput} mt-1`}
                style={{ borderColor: sameTime ? B.danger : B.border, color: B.blue }}
              />
            </label>
          </div>
          {sameTime ? (
            <p className="text-xs font-semibold" style={{ color: B.danger }}>
              Start and end cannot be the same time. Turn the window off instead.
            </p>
          ) : null}
          {dirty ? (
            <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: B.border, background: "#F7F9FF" }}>
              <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                Reason for this change
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Provider maintenance moved to 1 AM"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </label>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || sameTime || reason.trim().length < 3}
                className="admin-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save night window"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
