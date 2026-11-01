"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, FileSpreadsheet, History, Search, Undo2, Upload, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { Modal } from "@/components/ui/Modal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { openBrandedPdf } from "@/lib/brandedExport";
import { apiErrorMessage, downloadCsv, formatWhen } from "@/lib/taxCommissionUtils";
import { CmsBillerUploadModal } from "./CmsBillerUploadModal";
import {
  TYPE_LABEL,
  billersCsv,
  billersCsvName,
  billersReport,
  downloadBillersXlsx,
  margin,
  type BillerType,
  type CmsBiller,
  type CmsBillerImport,
  type CmsBillerList,
} from "./cmsBillers";
import { Btn, Chip } from "./ui";

type SortKey = "name" | "id" | "margin-desc" | "margin-asc" | "keeps-desc";

const SORTS: Array<[SortKey, string]> = [
  ["name", "Name A–Z"],
  ["id", "Biller Id"],
  ["margin-desc", "Company margin: high to low"],
  ["margin-asc", "Company margin: low to high"],
  ["keeps-desc", "AsanPay keeps: high to low"],
];

function sortBillers(list: CmsBiller[], key: SortKey): CmsBiller[] {
  const out = [...list];
  const num = (v: string) => Number(v);
  switch (key) {
    case "name":
      return out.sort((a, b) => a.billerName.localeCompare(b.billerName));
    case "id":
      return out.sort((a, b) => a.billerId.localeCompare(b.billerId, undefined, { numeric: true }));
    case "margin-desc":
      return out.sort((a, b) => num(b.companyMargin) - num(a.companyMargin));
    case "margin-asc":
      return out.sort((a, b) => num(a.companyMargin) - num(b.companyMargin));
    case "keeps-desc":
      return out.sort((a, b) => num(b.companyKeeps) - num(a.companyKeeps));
  }
}

function UndoUploadModal({ target, onClose, onUndone }: { target: CmsBillerImport; onClose: () => void; onUndone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post(`/admin/cms/billers/imports/${target.id}/undo`, {});
      if (!r.data.success) throw new Error(r.data.message);
      const { restored } = r.data.data as { restored: number };
      toast.success(`Upload undone — ${restored} biller${restored === 1 ? "" : "s"} restored`);
      onUndone();
    } catch (err) {
      setError(apiErrorMessage(err, "Undo failed. Refresh the biller list and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Undo this biller upload?"
      eyebrow="Cash Collection billers"
      subtitle="Puts back the margins this upload replaced and deletes the billers it added. Allowed once, within 24 hours."
      icon={<Undo2 size={22} />}
      iconTone="amber"
      onClose={busy ? () => undefined : onClose}
    >
      <div className="rounded-2xl border p-3 text-xs" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
        <p className="flex items-center gap-1.5 font-semibold" style={{ color: B.blue }}>
          <FileSpreadsheet size={14} style={{ color: B.greenDark }} /> {target.fileName}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(
            [
              ["New", target.newCount, B.greenDark],
              ["Changed", target.changedCount, "#B45309"],
              ["Removed", target.removedCount, B.danger],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border px-2.5 py-1.5" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                {label}
              </p>
              <p className="text-sm font-bold tabular-nums" style={{ color: value ? tone : B.muted }}>
                {value}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2" style={{ color: B.muted }}>
          {target.adminName} · {formatWhen(target.createdAt)} · {target.reason}
        </p>
      </div>
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
          {busy ? "Undoing…" : "Undo upload"}
        </Btn>
      </div>
    </Modal>
  );
}

/** Cash Collection: per-biller margins from the provider sheet (search, filter, export, upload, undo). */
export function CmsBillersPanel() {
  const [data, setData] = useState<CmsBillerList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"" | BillerType>("");
  const [sort, setSort] = useState<SortKey>("name");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<CmsBillerImport | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchApi<CmsBillerList>("/admin/cms/billers"));
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Could not load the biller list. Check your connection and refresh."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const billers = useMemo(() => data?.billers ?? [], [data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = billers.filter((b) => (!q || b.billerId.includes(q) || b.billerName.toLowerCase().includes(q)) && (!type || b.billerType === type));
    return sortBillers(list, sort);
  }, [billers, query, type, sort]);
  const typeCount = (t: BillerType) => billers.filter((b) => b.billerType === t).length;
  const scope = query || type ? `${visible.length} of ${billers.length} billers${type ? ` · ${TYPE_LABEL[type]}` : ""}${query ? ` · “${query}”` : ""}` : "All billers";

  function onSaved(importId: string, changes: number, fileName: string) {
    setUploadOpen(false);
    setVersion((v) => v + 1);
    toast(
      (t) => (
        <span className="flex items-center gap-3 text-sm">
          <span>
            {changes} biller{changes === 1 ? "" : "s"} saved from {fileName}.
          </span>
          <button
            type="button"
            className="shrink-0 font-bold underline"
            style={{ color: B.blueLight }}
            onClick={() => {
              toast.dismiss(t.id);
              void fetchApi<CmsBillerList>("/admin/cms/billers").then((d) => {
                const imp = d.imports.find((i) => i.id === importId);
                if (imp?.canUndo) setUndoTarget(imp);
                else toast.error(imp?.undoBlockedReason ?? "This upload can no longer be undone.");
              });
            }}
          >
            Undo
          </button>
        </span>
      ),
      { duration: 20_000, icon: "✅" },
    );
  }

  return (
    <div className="rounded-2xl border" style={{ borderColor: "#BFDBFE", background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5" style={{ borderColor: "#BFDBFE" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}>
            <Users size={16} />
          </span>
          <div>
            <p className="text-sm font-bold" style={{ color: B.blue }}>
              Billers ({billers.length})
            </p>
            <p className="text-[11px]" style={{ color: B.muted }}>
              Per-biller margins from the provider sheet · {typeCount("agent")} agent · {typeCount("customer")} customer
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border px-3 py-1.5" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
            <Search size={14} style={{ color: B.muted }} />
            <input
              className="w-44 bg-transparent text-sm outline-none"
              placeholder="Search biller id or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter by biller type"
            className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
            style={{ borderColor: B.border, background: "var(--admin-card)", color: B.blue }}
            value={type}
            onChange={(e) => setType(e.target.value as "" | BillerType)}
          >
            <option value="">All types</option>
            <option value="agent">Agent ({typeCount("agent")})</option>
            <option value="customer">Customer ({typeCount("customer")})</option>
            {typeCount("other") ? <option value="other">Other ({typeCount("other")})</option> : null}
          </select>
          <select
            aria-label="Sort billers"
            className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
            style={{ borderColor: B.border, background: "var(--admin-card)", color: B.blue }}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <ExportMenu
            disabled={visible.length === 0}
            onPdf={() => {
              if (!openBrandedPdf(billersReport(visible, scope))) toast.error("Allow pop-ups for this site to export the PDF");
            }}
            onExcel={() => downloadBillersXlsx(visible, scope)}
            onCsv={() => downloadCsv(billersCsvName(), billersCsv(visible))}
          />
          <Btn variant="primary" disabled={!data} onClick={() => setUploadOpen(true)} title="Upload the provider Cash Collection biller sheet">
            <Upload size={14} /> Upload biller sheet
          </Btn>
        </div>
      </div>

      {loadError ? (
        <p className="px-3 py-6 text-sm font-semibold" style={{ color: B.danger }}>
          {loadError}
        </p>
      ) : !data ? (
        <p className="px-3 py-6 text-sm" style={{ color: B.muted }}>
          Loading billers…
        </p>
      ) : billers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
          <FileSpreadsheet size={26} style={{ color: B.blueLight }} />
          <p className="text-sm font-semibold" style={{ color: B.blue }}>
            No billers yet
          </p>
          <p className="max-w-md text-xs" style={{ color: B.muted }}>
            Upload the provider sheet (Biller Id, Biller Name, Asanpay Company Margin, Retailer, Distributor and Super Margin) to see each
            biller&apos;s margins here.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="px-3 py-6 text-sm" style={{ color: B.muted }}>
          No biller matches these filters. Clear the search or pick All types.
        </p>
      ) : (
        <div className="max-h-[440px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10" style={{ background: "var(--admin-card)" }}>
              <tr className="border-b text-[10px] uppercase tracking-wide" style={{ borderColor: B.border, color: B.muted }}>
                <th className="px-3 py-2 font-bold">Biller Id</th>
                <th className="px-3 py-2 font-bold">Biller name</th>
                <th className="px-3 py-2 text-right font-bold">Company margin</th>
                <th className="px-3 py-2 text-right font-bold">Retailer</th>
                <th className="px-3 py-2 text-right font-bold">Distributor</th>
                <th className="px-3 py-2 text-right font-bold">Super</th>
                <th className="px-3 py-2 text-right font-bold">AsanPay keeps</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((b, i) => (
                <tr
                  key={b.billerId}
                  className="border-b last:border-0"
                  style={{ borderColor: B.border, background: i % 2 ? "rgba(42,92,221,0.035)" : "var(--admin-card)" }}
                >
                  <td className="px-3 py-1.5 font-mono" style={{ color: B.blue }}>
                    {b.billerId}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="flex flex-wrap items-center gap-1.5" style={{ color: B.blue }}>
                      {b.billerName}
                      <Chip tone={b.billerType === "agent" ? "blue" : b.billerType === "customer" ? "green" : "muted"}>{TYPE_LABEL[b.billerType]}</Chip>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: B.blueLight }}>
                    {margin(b.companyMargin)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{margin(b.retailerMargin)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{margin(b.distributorMargin)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{margin(b.superMargin)}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: B.greenDark }}>
                    {margin(b.companyKeeps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.imports.length > 0 ? (
        <div className="border-t px-3 py-2" style={{ borderColor: "#BFDBFE" }}>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
            style={{ color: B.blueLight }}
          >
            <History size={13} /> Upload history ({data.imports.length})
            <ChevronRight size={13} className={`transition-transform ${historyOpen ? "rotate-90" : ""}`} />
          </button>
          {historyOpen ? (
            <ul className="mt-2 space-y-1.5">
              {data.imports.map((imp) => (
                <li
                  key={imp.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs"
                  style={{ borderColor: B.border, background: "var(--admin-card)" }}
                >
                  <FileSpreadsheet size={14} style={{ color: B.greenDark }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" style={{ color: B.blue }}>
                      {imp.fileName}
                    </span>
                    <span className="block text-[11px]" style={{ color: B.muted }}>
                      {imp.adminName} · {formatWhen(imp.createdAt)} · {imp.reason}
                    </span>
                  </span>
                  {imp.newCount ? <Chip tone="green">{imp.newCount} new</Chip> : null}
                  {imp.changedCount ? <Chip tone="amber">{imp.changedCount} changed</Chip> : null}
                  {imp.removedCount ? <Chip tone="red">{imp.removedCount} removed</Chip> : null}
                  {imp.undoneAt ? (
                    <Chip tone="muted">Undone</Chip>
                  ) : imp.canUndo ? (
                    <button
                      type="button"
                      onClick={() => setUndoTarget(imp)}
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold"
                      style={{ borderColor: "#FCD34D", color: "#B45309", background: "#FFFBEB" }}
                    >
                      <Undo2 size={12} /> Undo
                    </button>
                  ) : (
                    <span className="text-[11px]" style={{ color: B.muted }} title={imp.undoBlockedReason ?? undefined}>
                      Undo not available
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {uploadOpen ? <CmsBillerUploadModal savedCount={billers.length} onClose={() => setUploadOpen(false)} onSaved={onSaved} /> : null}
      {undoTarget ? (
        <UndoUploadModal
          target={undoTarget}
          onClose={() => setUndoTarget(null)}
          onUndone={() => {
            setUndoTarget(null);
            setVersion((v) => v + 1);
          }}
        />
      ) : null}
    </div>
  );
}
