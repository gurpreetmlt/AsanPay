"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileSpreadsheet, History, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { Btn, Chip } from "./ui";

export type ImportHistoryItem = {
  id: string;
  adminName: string;
  fileName: string;
  reason: string | null;
  services: Array<{ serviceId: string; serviceName: string; providerName: string; changes: number }>;
  changeCount: number;
  restoreCount: number;
  createdAt: string;
  undoneAt: string | null;
  canUndo: boolean;
  undoBlockedReason: string | null;
};

export type UndoTarget = { id: string; fileName: string; changeCount: number; services?: string[] };

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

/** Confirm + run the server-side undo of one import. */
export function UndoImportModal({ target, onClose, onUndone }: { target: UndoTarget; onClose: () => void; onUndone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post(`/admin/rate-card/imports/${target.id}/undo`, {});
      if (!r.data.success) throw new Error(r.data.message);
      const { restored } = r.data.data as { restored: number };
      toast.success(`Import undone — ${restored} rate${restored === 1 ? "" : "s"} restored`);
      onUndone();
    } catch (err) {
      setError(apiErrorMessage(err, "Undo failed. Refresh Import history and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Undo this import?"
      eyebrow="Rate card import"
      subtitle="Puts back the rates this import replaced and ends the slabs it added. Allowed once, within 24 hours."
      icon={<Undo2 size={22} />}
      iconTone="amber"
      onClose={busy ? () => undefined : onClose}
    >
      <div className="rounded-2xl border p-3 text-xs" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
        <p className="flex items-center gap-1.5 font-semibold" style={{ color: B.blue }}>
          <FileSpreadsheet size={14} style={{ color: B.greenDark }} /> {target.fileName}
        </p>
        <p className="mt-1" style={{ color: B.muted }}>
          {target.changeCount} change{target.changeCount === 1 ? "" : "s"}
          {target.services?.length ? ` · ${target.services.slice(0, 4).join(", ")}${target.services.length > 4 ? ` +${target.services.length - 4} more` : ""}` : ""}
        </p>
      </div>
      <p className="mt-3 text-[11px]" style={{ color: B.muted }}>
        Undo is refused when any of these services changed after the import — undo the newer import first.
      </p>
      {error ? (
        <p
          className="mt-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
          style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Btn variant="destructive" disabled={busy} onClick={onClose}>
          Cancel
        </Btn>
        <Btn variant="primary" disabled={busy} onClick={() => void undo()}>
          {busy ? "Undoing…" : "Undo import"}
        </Btn>
      </div>
    </Modal>
  );
}

/** Last 20 rate card imports with Undo while it is still allowed. */
export function ImportHistoryModal({ onClose, onUndo }: { onClose: () => void; onUndo: (t: UndoTarget) => void }) {
  const [items, setItems] = useState<ImportHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchApi<ImportHistoryItem[]>("/admin/rate-card/imports"));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not load Import history. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal
      title="Import history"
      eyebrow="Rate card"
      subtitle="Last 20 file imports. An import can be undone once, within 24 hours."
      icon={<History size={22} />}
      iconTone="blue"
      onClose={onClose}
      wide
    >
      {error ? (
        <p className="rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}>
          {error}
        </p>
      ) : !items ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading imports…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border px-3 py-6 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
          No imports yet. Files imported from Rate card → Import show here.
        </p>
      ) : (
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {items.map((it) => (
            <li key={it.id} className="rounded-2xl border px-3 py-2.5" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
              <div className="flex flex-wrap items-start gap-2">
                <FileSpreadsheet size={16} className="mt-0.5 shrink-0" style={{ color: B.greenDark }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                    {it.fileName}
                  </p>
                  <p className="text-[11px]" style={{ color: B.muted }}>
                    {it.adminName} · {when(it.createdAt)} · {it.changeCount} change{it.changeCount === 1 ? "" : "s"}
                    {it.reason ? ` · “${it.reason}”` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {it.services.slice(0, 5).map((s) => (
                      <Chip key={`${s.serviceId}-${s.providerName}`} tone="blue">
                        {s.serviceName} · {s.changes}
                      </Chip>
                    ))}
                    {it.services.length > 5 ? <Chip tone="muted">+{it.services.length - 5} more</Chip> : null}
                  </div>
                </div>
                {it.undoneAt ? (
                  <Chip tone="muted">Undone {when(it.undoneAt)}</Chip>
                ) : it.canUndo ? (
                  <Btn
                    variant="destructive"
                    className="px-2.5 py-1 text-xs"
                    onClick={() =>
                      onUndo({ id: it.id, fileName: it.fileName, changeCount: it.changeCount, services: it.services.map((s) => s.serviceName) })
                    }
                  >
                    <Undo2 size={13} /> Undo
                  </Btn>
                ) : (
                  <span className="text-[11px]" style={{ color: B.muted }} title={it.undoBlockedReason ?? undefined}>
                    Undo closed after 24 h
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Btn variant="destructive" onClick={onClose}>
          Close
        </Btn>
        <Btn variant="secondary" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </Btn>
      </div>
    </Modal>
  );
}
