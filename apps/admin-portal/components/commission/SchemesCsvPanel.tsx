"use client";

import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Download, Upload } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { apiErrorMessage, downloadCsv, parseSchemeCsv, type SchemeCsvRow } from "@/lib/taxCommissionUtils";

type ImportResult = {
  dryRun: boolean;
  batchId: string | null;
  lockedMessage: string | null;
  summary: {
    rowCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
  };
  results: { row: number; serviceCode: string; role: string; action: string; message?: string }[];
};

export function SchemesCsvPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SchemeCsvRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [applied, setApplied] = useState<ImportResult | null>(null);

  async function exportCsv() {
    setExporting(true);
    try {
      const data = await fetchApi<{ filename: string; csv: string; rowCount: number }>(
        "/admin/commission/rules/export",
      );
      downloadCsv(data.filename, data.csv);
      toast.success(`Exported ${data.rowCount} scheme rule${data.rowCount === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not export schemes CSV"));
    } finally {
      setExporting(false);
    }
  }

  async function onFile(file: File | undefined) {
    setPreview(null);
    setApplied(null);
    setRows([]);
    setFileName("");
    if (!file) return;
    try {
      const parsed = parseSchemeCsv(await file.text());
      if (parsed.length > 1000) {
        toast.error("Import is limited to 1000 rows per file. Split the CSV and try again.");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      await runImport(parsed, file.name, true);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not read the CSV file"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runImport(payload: SchemeCsvRow[], name: string, dryRun: boolean) {
    setBusy(true);
    try {
      const { data } = await api.post<{ success: boolean; message: string; data: ImportResult }>(
        "/admin/commission/rules/import",
        { rows: payload, dryRun, fileName: name },
      );
      if (!data.success) throw new Error(data.message);
      if (dryRun) {
        setPreview(data.data);
        toast.success("Preview ready. Review the counts, then apply.");
      } else {
        setApplied(data.data);
        setPreview(null);
        toast.success("Scheme import applied");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not import schemes CSV"));
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setRows([]);
    setFileName("");
    setPreview(null);
    setApplied(null);
  }

  const shown = applied ?? preview;
  const errorRows = shown?.results.filter((r) => r.action === "error") ?? [];
  const canApply = Boolean(
    preview && rows.length > 0 && preview.summary.errorCount === 0 && !preview.lockedMessage && !busy,
  );

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Schemes CSV
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
            Columns: serviceCode, role, ruleType, value, minAmount, maxAmount, providerCode, isActive. Import
            previews first; nothing changes until you apply.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: B.green }}
          >
            <Download size={15} />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: B.badgeGrad }}
          >
            <Upload size={15} />
            Import CSV
          </button>
        </div>
      </div>

      {fileName ? (
        <p className="text-sm" style={{ color: B.muted }}>
          File: <span className="font-semibold">{fileName}</span> · {rows.length} row
          {rows.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {shown ? (
        <div className="space-y-3">
          <p className="text-sm font-bold" style={{ color: B.blue }}>
            {applied ? "Import applied" : "Dry-run preview (no changes saved yet)"}
          </p>
          <div className="grid gap-2 sm:grid-cols-5">
            {[
              ["Rows", shown.summary.rowCount, B.blue],
              ["Create", shown.summary.createdCount, "#0F9E5C"],
              ["Update", shown.summary.updatedCount, B.blueLight],
              ["Skip", shown.summary.skippedCount, B.muted],
              ["Errors", shown.summary.errorCount, shown.summary.errorCount ? "#B91C1C" : B.muted],
            ].map(([label, n, color]) => (
              <div
                key={String(label)}
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: B.border }}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                  {label}
                </p>
                <p className="text-xl font-extrabold" style={{ color: String(color) }}>
                  {n}
                </p>
              </div>
            ))}
          </div>

          {shown.lockedMessage ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {shown.lockedMessage} Unlock the month under Month lock before applying.
            </p>
          ) : null}

          {errorRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="py-2 pr-3 font-semibold">Row</th>
                    <th className="py-2 pr-3 font-semibold">Service</th>
                    <th className="py-2 pr-3 font-semibold">Role</th>
                    <th className="py-2 font-semibold">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {errorRows.map((r) => (
                    <tr key={r.row} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="py-2 pr-3">{r.row}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.serviceCode || "—"}</td>
                      <td className="py-2 pr-3">{r.role || "—"}</td>
                      <td className="py-2" style={{ color: "#B91C1C" }}>
                        {r.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!applied ? (
              <button
                type="button"
                disabled={!canApply}
                onClick={() => void runImport(rows, fileName, false)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: B.badgeGrad }}
              >
                {busy ? "Applying…" : "Confirm and apply"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={clear}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white"
              style={{ background: B.danger }}
            >
              {applied ? "Close" : "Cancel"}
            </button>
          </div>
          {!applied && preview && preview.summary.errorCount > 0 ? (
            <p className="text-xs" style={{ color: B.muted }}>
              Fix the errors in your CSV and re-upload. Apply is disabled while any row has an error.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
