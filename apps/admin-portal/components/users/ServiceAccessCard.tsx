"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import {
  Banknote,
  Fingerprint,
  Power,
  PowerOff,
  QrCode,
  Receipt,
  Send,
  Smartphone,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { Modal } from "@/components/ui/Modal";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { DetailSection } from "@/components/users/DetailSection";

export type ServiceGroup = "aeps" | "dmt" | "bbps" | "recharge" | "cms" | "upi_cash_point";

export const SERVICE_ICON: Record<ServiceGroup, LucideIcon> = {
  aeps: Fingerprint,
  dmt: Send,
  bbps: Receipt,
  recharge: Smartphone,
  cms: Banknote,
  upi_cash_point: QrCode,
};

type Row = { group: ServiceGroup; label: string; enabled: boolean; reason: string | null; blockedAt: string | null };

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

/** Agent page → Services & limits: turn one service group off (or back on) for this agent only. */
export function ServiceAccessCard({ userId, agentName }: { userId: string; agentName: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<{ row: Row; enable: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchApi<Row[]>(`/admin/users/${userId}/service-access`));
    } catch (err) {
      toast.error(errMsg(err, "Services did not load. Refresh the page."));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reasonError = reason.trim().length < 3 ? "Enter a reason (at least 3 characters)" : null;

  async function save() {
    if (!pending || reasonError) return;
    setBusy(true);
    try {
      const res = await api.put<{ data: Row[] }>(`/admin/users/${userId}/service-access`, {
        group: pending.row.group,
        enabled: pending.enable,
        reason: reason.trim(),
      });
      setRows(res.data.data);
      toast.success(`${pending.row.label} turned ${pending.enable ? "on" : "off"} for ${agentName}`);
      setPending(null);
    } catch (err) {
      toast.error(errMsg(err, "Service switch was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const offCount = rows?.filter((r) => !r.enabled).length ?? 0;

  return (
    <DetailSection title="Services" icon={ToggleRight}>
      <div className="space-y-3">
        <div
          className="flex items-start gap-3 rounded-2xl px-3 py-2.5"
          style={{ background: "rgba(42,92,221,0.06)", border: "1px solid rgba(42,92,221,0.18)" }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(42,92,221,0.12)", color: B.blueLight }}>
            <Power size={15} />
          </span>
          <p className="pt-1 text-xs leading-relaxed" style={{ color: "var(--admin-text)" }}>
            Turn a service off for {agentName} only. They see “… is turned off for your account. Contact support.” on web and app.
            {offCount > 0 ? (
              <>
                {" "}
                <strong>{offCount} off right now.</strong>
              </>
            ) : null}
          </p>
        </div>

        {!rows ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const RowIcon = SERVICE_ICON[r.group];
              return (
                <div
                  key={r.group}
                  className="flex items-center gap-3 rounded-2xl border px-3 py-2.5"
                  style={{
                    borderColor: r.enabled ? B.border : "#FCA5A5",
                    background: r.enabled ? "var(--admin-card)" : "linear-gradient(90deg, #FEF2F2 0%, var(--admin-card) 70%)",
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={r.enabled ? { background: "rgba(42,92,221,0.10)", color: B.blueLight } : { background: "rgba(220,38,38,0.12)", color: B.danger }}
                  >
                    <RowIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                      {r.label}
                    </p>
                    <p className="truncate text-[11px]" style={{ color: r.enabled ? B.muted : "#B91C1C" }} title={r.reason ?? undefined}>
                      {r.enabled ? "On" : `Off since ${fmt(r.blockedAt!)}${r.reason ? ` · ${r.reason}` : ""}`}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={r.enabled}
                    label={`${r.label} ${r.enabled ? "on" : "off"}`}
                    onChange={(on) => {
                      setReason("");
                      setPending({ row: r, enable: on });
                    }}
                    disabled={busy}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pending ? (
        <Modal
          title={pending.enable ? `Turn on ${pending.row.label}?` : `Turn off ${pending.row.label}?`}
          eyebrow={agentName}
          subtitle={
            pending.enable
              ? "The agent can use this service again right away."
              : "New requests are refused with a clear message. Transactions already running finish normally."
          }
          icon={pending.enable ? <Power size={22} /> : <PowerOff size={22} />}
          iconTone={pending.enable ? "green" : "red"}
          onClose={() => {
            if (!busy) setPending(null);
          }}
        >
          <div className="space-y-3">
            <div className="rounded-2xl border p-3" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
              <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                Reason
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={pending.enable ? "e.g. Review complete, cleared by risk team" : "e.g. Customer complaints under review"}
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </label>
              <p className="mt-1.5 text-[11px]" style={{ color: reason && reasonError ? B.danger : B.muted }}>
                {reason && reasonError ? reasonError : "Saved in the audit log with your name"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className={
                  pending.enable
                    ? "rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    : "rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                }
                style={pending.enable ? { background: B.danger } : { borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
              >
                {pending.enable ? "Cancel" : "Back"}
              </button>
              <button
                type="button"
                disabled={busy || !!reasonError}
                onClick={() => void save()}
                className={`${pending.enable ? "admin-btn-success" : "admin-btn-danger"} rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50`}
              >
                {busy ? "Saving…" : pending.enable ? "Turn on" : "Turn off"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </DetailSection>
  );
}
