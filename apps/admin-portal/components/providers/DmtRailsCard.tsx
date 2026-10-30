"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { ArrowDown, ArrowUp, Landmark } from "lucide-react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

type Rail = {
  code: string;
  name: string;
  shortName: string;
  live: boolean;
  pilot?: boolean;
  enabled: boolean;
  priority: number;
};

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

const sameState = (a: Rail[], b: Rail[]) =>
  a.length === b.length && a.every((r, i) => r.code === b[i]!.code && r.enabled === b[i]!.enabled);

const parseMobiles = (text: string) => [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];

/** API Providers → DMT bank rails: order the agent sees on the DMT screen + on/off per rail. */
export function DmtRailsCard() {
  const [saved, setSaved] = useState<Rail[] | null>(null);
  const [rails, setRails] = useState<Rail[] | null>(null);
  const [savedPilots, setSavedPilots] = useState<string[]>([]);
  const [pilotText, setPilotText] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchApi<{ rails: Rail[]; pilotMobiles: string[] }>("/admin/dmt-rails");
      setSaved(d.rails);
      setRails(d.rails);
      setSavedPilots(d.pilotMobiles ?? []);
      setPilotText((d.pilotMobiles ?? []).join(", "));
    } catch (err) {
      toast.error(errMsg(err, "DMT bank rails did not load. Refresh the page."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function move(index: number, delta: -1 | 1) {
    setRails((cur) => {
      if (!cur) return cur;
      const to = index + delta;
      if (to < 0 || to >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next.map((r, i) => ({ ...r, priority: i + 1 }));
    });
  }

  function toggle(code: string, enabled: boolean) {
    setRails((cur) => (cur ? cur.map((r) => (r.code === code ? { ...r, enabled } : r)) : cur));
  }

  const pilotMobiles = parseMobiles(pilotText);
  const pilotsDirty = pilotMobiles.join(",") !== savedPilots.join(",");
  const dirty = !!saved && !!rails && (!sameState(saved, rails) || pilotsDirty);
  const noneLive = !!rails && !rails.some((r) => r.enabled && r.live);
  const hasPilotRail = !!rails && rails.some((r) => !r.live && r.pilot);
  const badPilot = pilotMobiles.find((m) => !/^[6-9]\d{9}$/.test(m));
  const pilotError = badPilot ? `"${badPilot}" is not a valid 10-digit mobile` : null;
  const reasonError = reason.trim().length < 3 ? "Enter a reason (at least 3 characters)" : null;

  async function save() {
    if (!rails || noneLive || reasonError || pilotError) return;
    setSaving(true);
    try {
      await api.put("/admin/dmt-rails", {
        order: rails.map((r) => r.code),
        disabled: rails.filter((r) => !r.enabled).map((r) => r.code),
        pilotMobiles,
        reason: reason.trim(),
      });
      toast.success("DMT bank rails saved — agents see the new order within 30 seconds");
      setReason("");
      await load();
    } catch (err) {
      toast.error(errMsg(err, "DMT bank rails were not saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border p-4" style={{ borderColor: B.border, background: B.card }}>
      <div className="flex items-center gap-2">
        <Landmark size={18} style={{ color: B.blueLight }} />
        <h2 className="text-sm font-bold" style={{ color: B.blue }}>
          DMT bank rails
        </h2>
      </div>
      <p className="text-xs" style={{ color: B.muted }}>
        Agents pick the bank on the money transfer screen in this order; the first switched-on rail is selected by
        default. A switched-off rail is hidden from agents.
      </p>

      {!rails ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {rails.map((r, i) => (
              <li
                key={r.code}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: B.border, opacity: r.enabled ? 1 : 0.6 }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                  style={{ background: "rgba(42,92,221,0.1)", color: B.blueLight }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                    {r.name}
                  </p>
                  <p className="text-[11px]" style={{ color: B.muted }}>
                    {r.live
                      ? r.enabled
                        ? "Live for agents"
                        : "Hidden from agents"
                      : r.pilot
                        ? "Pilot — live only for test retailers, Coming soon for everyone else"
                        : "Coming soon — shown to agents as Coming soon"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${r.shortName} up`}
                    disabled={i === 0 || saving}
                    onClick={() => move(i, -1)}
                    className="rounded-lg border p-1.5 disabled:opacity-30"
                    style={{ borderColor: B.border, color: B.blue }}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${r.shortName} down`}
                    disabled={i === rails.length - 1 || saving}
                    onClick={() => move(i, 1)}
                    className="rounded-lg border p-1.5 disabled:opacity-30"
                    style={{ borderColor: B.border, color: B.blue }}
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <ToggleSwitch
                  checked={r.enabled}
                  onChange={(v) => toggle(r.code, v)}
                  label={`${r.shortName} on for agents`}
                  disabled={saving}
                />
              </li>
            ))}
          </ul>

          {noneLive ? (
            <p className="text-xs font-semibold" style={{ color: B.danger }}>
              Keep at least one working rail switched on, or turn DMT off in the service controls instead.
            </p>
          ) : null}

          {hasPilotRail ? (
            <div className="space-y-1 rounded-xl border p-3" style={{ borderColor: B.border }}>
              <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                Test retailers for Pilot banks
                <input
                  value={pilotText}
                  onChange={(e) => setPilotText(e.target.value)}
                  placeholder="e.g. 9876543210, 9123456789"
                  inputMode="numeric"
                  disabled={saving}
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                  style={{ borderColor: pilotError ? B.danger : B.border, color: B.blue }}
                />
              </label>
              <p className="text-[11px]" style={{ color: pilotError ? B.danger : B.muted }}>
                {pilotError ??
                  "Retailer login mobiles, comma-separated. Only these retailers can use Pilot banks; everyone else sees Coming soon."}
              </p>
            </div>
          ) : null}

          {dirty ? (
            <div className="space-y-1">
              <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                Reason for this change
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Airtel DMT slow today, Fino first"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </label>
              <p className="text-[11px]" style={{ color: reason && reasonError ? B.danger : B.muted }}>
                {reason && reasonError ? reasonError : "Saved in the audit log."}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                setRails(saved);
                setPilotText(savedPilots.join(", "));
                setReason("");
              }}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: B.danger }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving || noneLive || !!reasonError || !!pilotError}
              className="admin-btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : dirty ? "Save changes" : "No changes"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
