"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Banknote, Clock, Fingerprint, Moon, Receipt, Send, Smartphone, Sunrise, Sunset, type LucideIcon } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { DateTimeField } from "@/components/ui/DateField";
import { DetailSection } from "@/components/users/DetailSection";
import { NightWindowForm } from "@/components/settings/NightWindowForm";

type Group = "aeps" | "dmt" | "bbps" | "recharge" | "cms";
type Row = {
  group: Group;
  label: string;
  active: boolean;
  scheduled?: boolean;
  mode: "always" | "until" | null;
  from?: string | null;
  until: string | null;
  expired: boolean;
  reason: string | null;
};
type WindowInfo = { enabled: boolean; start?: string; end?: string; startLabel: string; endLabel: string; closedNow: boolean };

const ICON: Record<Group, LucideIcon> = { aeps: Fingerprint, dmt: Send, bbps: Receipt, recharge: Smartphone, cms: Banknote };

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

/** Open / close pair check against the current clock (values are local "YYYY-MM-DDTHH:mm"). */
function windowProblems(from: string, until: string): { from: string | null; until: string | null } {
  const untilMs = until ? new Date(until).getTime() : NaN;
  const fromMs = from ? new Date(from).getTime() : NaN;
  return {
    from: !from ? "Pick the date and time it should open" : null,
    until: !until
      ? "Pick the date and time it should close"
      : untilMs <= Date.now()
        ? "Close time must be in the future"
        : from && fromMs >= untilMs
          ? "Close time must be after the open time"
          : null,
  };
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

const pad = (n: number) => String(n).padStart(2, "0");
/** Date → local "YYYY-MM-DDTHH:mm" for DateTimeField. */
const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Next time today/tomorrow at "HH:MM" that is after `after`. */
function nextAt(hm: string | undefined, after: Date): Date {
  const [h, m] = (hm ?? "06:00").split(":").map(Number);
  const d = new Date(after);
  d.setHours(h ?? 6, m ?? 0, 0, 0);
  if (d.getTime() <= after.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/** Agent page → Controls: keep a service group open for this agent during the night window. */
export function NightAccessCard({ userId, agentName }: { userId: string; agentName: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [win, setWin] = useState<WindowInfo | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [closing, setClosing] = useState<Row | null>(null);
  const [mode, setMode] = useState<"always" | "until">("until");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, w] = await Promise.all([
        fetchApi<Row[]>(`/admin/users/${userId}/night-access`),
        fetchApi<WindowInfo>("/admin/service-window"),
      ]);
      setRows(list);
      setWin(w);
    } catch (err) {
      toast.error(errMsg(err, "Night services did not load. Refresh the page."));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEditor(row: Row) {
    setEditing(row);
    setMode(row.mode === "always" ? "always" : "until");
    const now = new Date();
    const keep = row.until && !row.expired;
    // New window defaults to tonight's closed hours (or now, if the window is already closed).
    const saved = keep && row.from ? new Date(row.from) : null;
    const fromDate = saved && saved > now ? saved : win?.closedNow || !win?.start ? now : nextAt(win.start, now);
    setFrom(toLocal(fromDate));
    setUntil(keep ? toLocal(new Date(row.until!)) : toLocal(nextAt(win?.end, fromDate)));
    setReason("");
  }

  const problems = mode === "until" ? windowProblems(from, until) : { from: null, until: null };
  const windowError = problems.from ?? problems.until;
  const reasonError = reason.trim().length < 3 ? "Enter a reason (at least 3 characters)" : null;

  async function saveOpen() {
    if (!editing || windowError || reasonError) return;
    setBusy(true);
    try {
      const list = await api.put<{ data: Row[] }>(`/admin/users/${userId}/night-access`, {
        group: editing.group,
        from: mode === "always" ? null : new Date(from).toISOString(),
        until: mode === "always" ? null : new Date(until).toISOString(),
        reason: reason.trim(),
      });
      setRows(list.data.data);
      toast.success(`${editing.label} stays open at night for ${agentName}`);
      setEditing(null);
    } catch (err) {
      toast.error(errMsg(err, "Night access was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmClose() {
    if (!closing) return;
    setBusy(true);
    try {
      const list = await api.delete<{ data: Row[] }>(`/admin/users/${userId}/night-access/${closing.group}`, {
        data: { reason: "Closed at night again by admin" },
      });
      setRows(list.data.data);
      toast.success(`${closing.label} closes at night again`);
      setClosing(null);
    } catch (err) {
      toast.error(errMsg(err, "Night access was not removed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DetailSection title="Night services" icon={Moon}>
      <div className="space-y-3">
        <div
          className="flex items-start gap-3 rounded-2xl px-3 py-2.5"
          style={{ background: "rgba(55,48,163,0.07)", border: "1px solid rgba(55,48,163,0.2)" }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(55,48,163,0.14)", color: "#3730A3" }}>
            <Moon size={15} />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-xs leading-relaxed" style={{ color: "var(--admin-text)" }}>
              {win && win.enabled ? (
                <>
                  Services close every night for all agents from <strong>{win.startLabel}</strong> to{" "}
                  <strong>{win.endLabel}</strong>
                  {win.closedNow ? " — closed right now." : "."} Turn a service on to keep it open for {agentName} (emergency).
                </>
              ) : (
                "The night window is off — services are open all day for every agent."
              )}
            </p>
            <button
              type="button"
              onClick={() => setTimingOpen(true)}
              className="mt-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition hover:bg-[rgba(55,48,163,0.1)]"
              style={{ color: "#3730A3" }}
            >
              <Clock size={12} /> Change timing (all agents)
            </button>
          </div>
        </div>

        {!rows ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const RowIcon = ICON[r.group];
              return (
                <div
                  key={r.group}
                  className="flex items-center gap-3 rounded-2xl border px-3 py-2.5"
                  style={{
                    borderColor: r.active ? "#86EFAC" : B.border,
                    background: r.active ? "linear-gradient(90deg, #F0FDF4 0%, var(--admin-card) 70%)" : "var(--admin-card)",
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={r.active ? { background: "rgba(22,163,74,0.12)", color: "#16A34A" } : { background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                  >
                    <RowIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                      {r.label}
                    </p>
                    <p
                      className="truncate text-[11px]"
                      style={{ color: r.active ? "#15803D" : r.scheduled ? "#3730A3" : B.muted }}
                      title={r.reason ?? undefined}
                    >
                      {r.active
                        ? r.mode === "always"
                          ? "Open at night · always"
                          : `Open now · closes ${fmt(r.until!)}`
                        : r.scheduled
                          ? `Opens ${fmt(r.from!)} · closes ${fmt(r.until!)}`
                          : r.expired
                            ? `Ended ${fmt(r.until!)} · closed at night`
                            : "Closed at night"}
                    </p>
                  </div>
                  {r.active || r.scheduled ? (
                    <button
                      type="button"
                      onClick={() => openEditor(r)}
                      className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold transition hover:bg-[rgba(42,92,221,0.08)]"
                      style={{ color: B.blueLight }}
                    >
                      Change
                    </button>
                  ) : null}
                  <ToggleSwitch
                    checked={r.active || !!r.scheduled}
                    onChange={(on) => (on ? openEditor(r) : setClosing(r))}
                    disabled={busy}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing ? (
        <Modal
          title={`Keep ${editing.label} open at night`}
          eyebrow={agentName}
          subtitle={win ? `Normally closed ${win.startLabel} – ${win.endLabel}. Only this agent gets access.` : undefined}
          icon={<Moon size={22} />}
          iconTone="green"
          wide
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["until", "Open & close time", "Opens and closes by itself at the times you pick"],
                  ["always", "Always open", "Stays open every night until you turn it off"],
                ] as const
              ).map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className="rounded-2xl border-2 px-3 py-2.5 text-left transition"
                  style={{
                    borderColor: mode === id ? B.blueLight : B.border,
                    background: mode === id ? "rgba(42,92,221,0.06)" : "var(--admin-card)",
                  }}
                >
                  <span className="block text-sm font-bold" style={{ color: B.blue }}>
                    {label}
                  </span>
                  <span className="block text-[11px]" style={{ color: B.muted }}>
                    {hint}
                  </span>
                </button>
              ))}
            </div>
            {mode === "until" ? (
              <div
                className="space-y-3 rounded-2xl border p-3"
                style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["Open from", Sunrise, from, setFrom, problems.from],
                      ["Close at", Sunset, until, setUntil, problems.until],
                    ] as const
                  ).map(([label, Icon, value, set, err]) => (
                    <div key={label} className="rounded-xl border bg-white p-3" style={{ borderColor: B.border }}>
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: B.muted }}>
                        <Icon size={13} /> {label}
                      </p>
                      <DateTimeField value={value} onChange={set} className="w-full" />
                      {value && err ? (
                        <p className="mt-1 text-xs font-semibold" style={{ color: B.danger }}>
                          {err}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {!windowError ? (
                  <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "#F0FDF4", color: "#15803D" }}>
                    {editing.label} open for {agentName}: {fmt(new Date(from).toISOString())} → {fmt(new Date(until).toISOString())}
                  </p>
                ) : null}
              </div>
            ) : null}
            <label className="block text-xs font-semibold" style={{ color: B.muted }}>
              Reason
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Hospital emergency withdrawals tonight"
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                style={{ borderColor: B.border, color: B.blue }}
              />
            </label>
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
                disabled={busy || !!windowError || !!reasonError}
                onClick={() => void saveOpen()}
                className="admin-btn-success rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Saving…" : "Keep open"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {timingOpen ? (
        <Modal
          title="Night service timing"
          eyebrow="All agents"
          subtitle="AePS, DMT, BBPS, recharge and CMS close in this window every night (India time)."
          icon={<Moon size={22} />}
          iconTone="blue"
          onClose={() => setTimingOpen(false)}
        >
          <NightWindowForm
            onCancel={() => setTimingOpen(false)}
            onSaved={(w) => {
              setWin(w);
              setTimingOpen(false);
            }}
          />
        </Modal>
      ) : null}

      {closing ? (
        <ConfirmModal
          title={`Close ${closing.label} at night again?`}
          message={`${agentName} follows the normal night window again for ${closing.label}.`}
          confirmLabel="Close at night"
          tone="warning"
          busy={busy}
          onConfirm={() => void confirmClose()}
          onClose={() => {
            if (!busy) setClosing(null);
          }}
        />
      ) : null}
    </DetailSection>
  );
}
