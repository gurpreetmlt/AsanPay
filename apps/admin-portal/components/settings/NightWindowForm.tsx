"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

export type NightWindow = { enabled: boolean; start: string; end: string; startLabel: string; endLabel: string; closedNow: boolean };

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function split(hm: string): { hour: number; minute: number; pm: boolean } {
  const [h, m] = hm.split(":").map(Number);
  const h24 = Number.isFinite(h) ? h! : 0;
  return { hour: h24 % 12 === 0 ? 12 : h24 % 12, minute: Number.isFinite(m) ? m! : 0, pm: h24 >= 12 };
}

function join(hour: number, minute: number, pm: boolean): string {
  const h24 = (hour % 12) + (pm ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function hmLabel(hm: string): string {
  const { hour, minute, pm } = split(hm);
  return `${hour}:${String(minute).padStart(2, "0")} ${pm ? "PM" : "AM"}`;
}

/** Length of the closed window, wrapping past midnight. */
function durationLabel(start: string, end: string): string {
  const toMin = (hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const mins = (toMin(end) - toMin(start) + 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} hour${h > 1 ? "s" : ""}` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** Hour + minute + AM/PM picker that reads and writes "HH:MM" (24-hour). */
export function TimeAmPmField({
  label,
  icon: Icon,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  icon: typeof Sunset;
  value: string;
  onChange: (hm: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const { hour, minute, pm } = split(value);
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b);
  const select = "rounded-xl border bg-white px-2 py-2 text-sm font-bold tabular-nums outline-none disabled:opacity-50";
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold" style={{ color: B.muted }}>
        <Icon size={13} /> {label}
      </p>
      <div className="flex items-center gap-1.5">
        <select
          aria-label={`${label} hour`}
          value={hour}
          disabled={disabled}
          onChange={(e) => onChange(join(Number(e.target.value), minute, pm))}
          className={select}
          style={{ borderColor: error ? B.danger : B.border, color: B.blue }}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="font-bold" style={{ color: B.muted }}>
          :
        </span>
        <select
          aria-label={`${label} minute`}
          value={minute}
          disabled={disabled}
          onChange={(e) => onChange(join(hour, Number(e.target.value), pm))}
          className={select}
          style={{ borderColor: error ? B.danger : B.border, color: B.blue }}
        >
          {minutes.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
        <div className="ml-1 inline-flex rounded-xl border p-0.5" style={{ borderColor: error ? B.danger : B.border }} role="radiogroup">
          {(["AM", "PM"] as const).map((p) => {
            const active = (p === "PM") === pm;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange(join(hour, minute, p === "PM"))}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-50"
                style={active ? { background: B.cta, color: "#fff" } : { color: B.muted }}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Night service window for every agent: on/off, close time, open time (IST), reason, save.
 * Used inline on Platform Settings and inside a popup from the agent page.
 */
export function NightWindowForm({ onSaved, onCancel }: { onSaved?: (w: NightWindow) => void; onCancel?: () => void }) {
  const [data, setData] = useState<NightWindow | null>(null);
  const [form, setForm] = useState({ enabled: true, start: "00:00", end: "06:00" });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const w = await fetchApi<NightWindow>("/admin/service-window");
      setData(w);
      setForm({ enabled: w.enabled, start: w.start, end: w.end });
      return w;
    } catch (err) {
      toast.error(errMsg(err, "Night service window did not load. Refresh the page."));
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !!data && (form.enabled !== data.enabled || form.start !== data.start || form.end !== data.end);
  const sameTime = form.enabled && form.start === form.end;
  const reasonError = reason.trim().length < 3 ? "Enter a reason (at least 3 characters)" : null;

  async function save() {
    if (sameTime || reasonError) return;
    setSaving(true);
    try {
      await api.put("/admin/service-window", { ...form, reason: reason.trim() });
      toast.success(
        form.enabled
          ? `Services close ${hmLabel(form.start)} – ${hmLabel(form.end)} for all agents`
          : "Night window turned off — services open all day",
      );
      setReason("");
      const w = await load();
      if (w) onSaved?.(w);
    } catch (err) {
      toast.error(errMsg(err, "Night service window was not saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <p className="text-sm" style={{ color: B.muted }}>
        Loading…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2.5" style={{ borderColor: B.border }}>
        <div className="flex items-center gap-2.5">
          <ToggleSwitch
            checked={form.enabled}
            onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            label="Close services at night"
            disabled={saving}
          />
          <span className="text-sm font-semibold" style={{ color: B.blue }}>
            {form.enabled ? "Close services at night" : "Open all day (night window off)"}
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={data.closedNow ? { background: "#EEF2FF", color: "#3730A3" } : { background: "#F0FDF4", color: "#15803D" }}
        >
          {data.closedNow ? <Moon size={12} /> : <Sun size={12} />}
          {data.closedNow ? `Closed now · opens ${data.endLabel}` : "Services open now"}
        </span>
      </div>

      <div
        className="grid gap-4 rounded-2xl border p-3 sm:grid-cols-2"
        style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)", opacity: form.enabled ? 1 : 0.55 }}
      >
        <TimeAmPmField
          label="Close at"
          icon={Sunset}
          value={form.start}
          disabled={!form.enabled || saving}
          onChange={(start) => setForm((f) => ({ ...f, start }))}
        />
        <TimeAmPmField
          label="Open again at"
          icon={Sunrise}
          value={form.end}
          disabled={!form.enabled || saving}
          error={sameTime}
          onChange={(end) => setForm((f) => ({ ...f, end }))}
        />
      </div>

      {sameTime ? (
        <p className="text-xs font-semibold" style={{ color: B.danger }}>
          Close and open time cannot be the same. Turn the window off instead.
        </p>
      ) : form.enabled ? (
        <p className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "#EEF2FF", color: "#3730A3" }}>
          <Moon size={13} />
          Every night {hmLabel(form.start)} → {hmLabel(form.end)} (India time) · closed for {durationLabel(form.start, form.end)}
        </p>
      ) : null}

      {dirty ? (
        <div className="space-y-2">
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
          <p className="text-[11px]" style={{ color: reason && reasonError ? B.danger : B.muted }}>
            {reason && reasonError ? reasonError : "Applies to every agent within 30 seconds. Saved in the audit log."}
          </p>
        </div>
      ) : null}

      <div className={onCancel ? "grid grid-cols-2 gap-2" : ""}>
        {onCancel ? (
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: B.danger }}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving || sameTime || !!reasonError}
          className="admin-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : dirty ? "Save for all agents" : "No changes"}
        </button>
      </div>
    </div>
  );
}
