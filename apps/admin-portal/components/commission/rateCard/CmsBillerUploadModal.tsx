"use client";

import { useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowRight, Download, FileSpreadsheet, ListChecks, Upload } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { readXlsx } from "@/lib/xlsxWorkbook";
import { apiErrorMessage, downloadCsv, parseCsv } from "@/lib/taxCommissionUtils";
import { MARGIN_FIELDS, TYPE_LABEL, issuesCsv, margin, parseBillerSheet, type BillerChange, type BillerPreview, type BillerRow } from "./cmsBillers";
import { Btn, Chip } from "./ui";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SHOWN = 400;

type StatusFilter = "all" | BillerChange["status"];

const STATUS: Record<BillerChange["status"], { label: string; tone: "green" | "amber" | "red"; bg: string; edge: string }> = {
  new: { label: "New", tone: "green", bg: "rgba(18,183,106,0.07)", edge: "#86EFAC" },
  changed: { label: "Changed", tone: "amber", bg: "rgba(217,119,6,0.07)", edge: "#FCD34D" },
  removed: { label: "Remove", tone: "red", bg: "rgba(220,38,38,0.06)", edge: "#FCA5A5" },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ChangeRow({ c, index }: { c: BillerChange; index: number }) {
  const st = STATUS[c.status];
  const name = c.after?.billerName ?? c.before?.billerName ?? "";
  const renamed = c.status === "changed" && c.before && c.after && c.before.billerName !== c.after.billerName;
  return (
    <li
      className="rc-slab-in rounded-2xl border p-2.5"
      style={{ borderColor: st.edge, background: st.bg, animationDelay: `${Math.min(index, 12) * 18}ms` }}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold" style={{ color: B.blue }}>
          {c.billerId}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: B.blue }} title={name}>
          {renamed ? (
            <>
              <span className="line-through" style={{ color: B.muted }}>
                {c.before!.billerName}
              </span>{" "}
              → {name}
            </>
          ) : (
            name
          )}
        </span>
        <Chip tone="muted">{TYPE_LABEL[c.billerType]}</Chip>
        <Chip tone={st.tone}>{c.reactivated ? "Re-activate" : st.label}</Chip>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {MARGIN_FIELDS.map(({ key, label }) => {
          const before = c.before ? margin(c.before[key]) : null;
          const after = c.after ? margin(c.after[key]) : null;
          const changed = c.status === "changed" && before !== after;
          return (
            <div key={key} className="rounded-xl border px-2.5 py-1.5" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                {label}
              </p>
              {changed ? (
                <p className="flex flex-wrap items-center gap-1 text-xs tabular-nums">
                  <span className="line-through" style={{ color: B.muted }}>
                    {before}
                  </span>
                  <ArrowRight size={11} style={{ color: B.muted }} />
                  <span className="font-bold" style={{ color: B.greenDark }}>
                    {after}
                  </span>
                </p>
              ) : (
                <p className="text-xs tabular-nums" style={{ color: c.status === "removed" ? B.danger : B.blue }}>
                  {after ?? before}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </li>
  );
}

export function CmsBillerUploadModal({
  savedCount,
  onClose,
  onSaved,
}: {
  savedCount: number;
  onClose: () => void;
  onSaved: (importId: string, changes: number, fileName: string) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<BillerRow[] | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BillerPreview | null>(null);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const busy = phase !== null || saving;
  const reasonOk = reason.trim().length >= 3;
  const changeCount = preview ? preview.counts.new + preview.counts.changed + preview.counts.removed : 0;
  const blocked = Boolean(preview && preview.issueCount > 0);

  async function check(fileName: string, list: BillerRow[], remove: boolean) {
    const r = await api.post("/admin/cms/billers/import", { fileName, rows: list, removeMissing: remove, dryRun: true });
    if (!r.data.success) throw new Error(r.data.message);
    return r.data.data as BillerPreview;
  }

  async function readFile(f: File) {
    setFile(f);
    setFileError(null);
    setPreview(null);
    setRows(null);
    const isXlsx = /\.xlsx$/i.test(f.name);
    if (!isXlsx && !/\.csv$/i.test(f.name)) {
      setFileError(`“${f.name}” is not an Excel (.xlsx) or CSV file. Upload the provider biller sheet.`);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setFileError(`“${f.name}” is larger than 10 MB. Keep only the biller tab and upload again.`);
      return;
    }
    try {
      setPhase("Reading the sheet…");
      const sheets = isXlsx ? await readXlsx(f) : [{ name: f.name, rows: parseCsv(await f.text()) }];
      const parsed = parseBillerSheet(sheets);
      if ("error" in parsed) {
        setFileError(parsed.error);
        return;
      }
      setPhase("Comparing with the saved billers…");
      const pv = await check(f.name, parsed.rows, removeMissing);
      setRows(parsed.rows);
      setSheetName(parsed.sheet);
      setPreview(pv);
      setFilter("all");
      setStep(2);
    } catch (err) {
      setFileError(apiErrorMessage(err, "Could not read this file. Save it again in Excel and retry."));
    } finally {
      setPhase(null);
    }
  }

  async function toggleRemove() {
    if (!file || !rows) return;
    const next = !removeMissing;
    setRemoveMissing(next);
    setPhase("Updating the preview…");
    try {
      setPreview(await check(file.name, rows, next));
    } catch (err) {
      setRemoveMissing(!next);
      setSaveError(apiErrorMessage(err, "Could not update the preview. Check your connection and try again."));
    } finally {
      setPhase(null);
    }
  }

  async function save() {
    if (!file || !rows || !reasonOk || changeCount === 0 || blocked) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await api.post("/admin/cms/billers/import", {
        fileName: file.name,
        rows,
        removeMissing,
        dryRun: false,
        reason: reason.trim(),
      });
      if (!r.data.success) throw new Error(r.data.message);
      onSaved((r.data.data as { id: string }).id, changeCount, file.name);
    } catch (err) {
      setSaveError(apiErrorMessage(err, "The biller sheet was not saved. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !busy) void readFile(f);
  }

  const shown = (preview?.changes ?? []).filter((c) => filter === "all" || c.status === filter);

  return (
    <Modal
      title="Upload biller sheet"
      eyebrow={step === 1 ? "Step 1 of 2 · Upload" : "Step 2 of 2 · Review & save"}
      subtitle={
        step === 1
          ? "Provider Cash Collection sheet with Biller Id, Biller Name and the four margin columns."
          : "Check new, changed and removed billers, add a reason, then save. Applies to new transactions."
      }
      icon={step === 1 ? <Upload size={22} /> : <ListChecks size={22} />}
      iconTone="blue"
      onClose={busy ? () => undefined : onClose}
      wide
    >
      {step === 1 ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition"
            style={{
              borderColor: dragging ? B.blueLight : "#BFDBFE",
              background: dragging ? "rgba(42,92,221,0.08)" : "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)",
            }}
          >
            <FileSpreadsheet size={30} style={{ color: B.blueLight }} />
            <p className="text-sm font-semibold" style={{ color: B.blue }}>
              Drag the biller sheet here
            </p>
            <p className="text-xs" style={{ color: B.muted }}>
              .xlsx or .csv · up to 10 MB · {savedCount} biller{savedCount === 1 ? "" : "s"} saved now
            </p>
            <Btn variant="primary" disabled={busy} onClick={() => input.current?.click()}>
              <Upload size={14} /> Choose file
            </Btn>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void readFile(f);
              }}
            />
          </div>

          {file ? (
            <div className="mt-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
              <div className="flex items-center gap-2 text-xs">
                <FileSpreadsheet size={16} style={{ color: B.greenDark }} />
                <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: B.blue }}>
                  {file.name}
                </span>
              </div>
              {phase ? (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(42,92,221,0.12)" }}>
                    <div className="h-full w-1/3 animate-pulse rounded-full" style={{ background: B.blueLight }} />
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: B.muted }}>
                    {phase}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {fileError ? (
            <p
              className="mt-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {fileError}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Btn variant="destructive" disabled={busy} onClick={onClose}>
              Cancel
            </Btn>
            <Btn variant="primary" disabled={!preview || busy || Boolean(fileError)} onClick={() => setStep(2)}>
              Continue
            </Btn>
          </div>
        </>
      ) : null}

      {step === 2 && preview ? (
        <>
          <p className="mb-2 text-[11px]" style={{ color: B.muted }}>
            {file?.name} · tab “{sheetName}” · {plural(preview.rowsRead, "row")} read
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["new", "New", preview.counts.new, B.greenDark],
                ["changed", "Changed", preview.counts.changed, "#B45309"],
                ["removed", "Removed", preview.counts.removed, B.danger],
                ["all", "Same", preview.counts.unchanged, B.muted],
              ] as const
            ).map(([key, label, value, tone]) => {
              const active = key !== "all" && filter === key;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={key === "all"}
                  onClick={() => setFilter(active ? "all" : key)}
                  className="rounded-2xl border px-3 py-2 text-left transition enabled:hover:-translate-y-px"
                  style={{
                    borderColor: active ? tone : B.border,
                    background: active ? `color-mix(in srgb, ${tone} 8%, var(--admin-card))` : "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)",
                  }}
                  title={key === "all" ? "Billers that already match the saved rates" : `Show only ${label.toLowerCase()} billers`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                    {label}
                  </p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: value > 0 ? tone : B.muted }}>
                    {value}
                  </p>
                </button>
              );
            })}
          </div>

          {preview.issueCount > 0 ? (
            <div className="mb-3 rounded-xl border p-2.5 text-[11px]" style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <p className="flex items-center gap-1.5 text-xs font-bold">
                  <AlertTriangle size={14} /> {plural(preview.issueCount, "error")} in the sheet — fix them and upload again
                </p>
                <button
                  type="button"
                  onClick={() => downloadCsv(`cms-biller-errors-${new Date().toISOString().slice(0, 10)}.csv`, issuesCsv(preview.issues))}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-bold"
                  style={{ borderColor: "#FCA5A5", background: "var(--admin-card)" }}
                >
                  <Download size={13} /> Download error report
                </button>
              </div>
              <ul className="max-h-28 space-y-1 overflow-y-auto">
                {preview.issues.slice(0, 8).map((i) => (
                  <li key={i} className="font-semibold">
                    {i}
                  </li>
                ))}
                {preview.issueCount > 8 ? <li className="font-semibold">…and {preview.issueCount - 8} more — download the error report.</li> : null}
              </ul>
            </div>
          ) : null}

          {preview.counts.missing > 0 ? (
            <label
              className="mb-3 flex cursor-pointer items-start gap-2 rounded-2xl border px-3 py-2.5 text-xs"
              style={{ borderColor: removeMissing ? "#FCA5A5" : B.border, background: removeMissing ? "#FEF2F2" : "var(--admin-secondary)" }}
            >
              <input
                type="checkbox"
                checked={removeMissing}
                disabled={busy}
                onChange={() => void toggleRemove()}
                className="mt-0.5 h-4 w-4"
                style={{ accentColor: B.danger }}
              />
              <span>
                <span className="block font-bold" style={{ color: removeMissing ? B.danger : B.blue }}>
                  Remove {plural(preview.counts.missing, "biller")} that {preview.counts.missing === 1 ? "is" : "are"} not in the sheet
                </span>
                <span style={{ color: B.muted }}>
                  Off: they keep their saved margins. On: they are switched off (Undo brings them back).
                </span>
              </span>
            </label>
          ) : null}

          {changeCount === 0 ? (
            <p className="rounded-2xl border px-3 py-4 text-center text-xs" style={{ borderColor: B.border, color: B.muted }}>
              Every biller in the sheet already matches the saved margins. Nothing to save.
            </p>
          ) : (
            <ul className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
              {shown.slice(0, MAX_SHOWN).map((c, i) => (
                <ChangeRow key={`${c.status}-${c.billerId}`} c={c} index={i} />
              ))}
              {shown.length > MAX_SHOWN ? (
                <li className="text-center text-[11px] font-semibold" style={{ color: B.muted }}>
                  Showing the first {MAX_SHOWN} of {shown.length}. All of them are saved.
                </li>
              ) : null}
            </ul>
          )}

          <div
            className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold"
            style={
              blocked || changeCount === 0
                ? { background: "#FEF2F2", color: B.danger }
                : { background: "rgba(18,183,106,0.10)", color: B.greenDark }
            }
          >
            {blocked
              ? "Saving is off until every error in the sheet is fixed."
              : changeCount === 0
                ? "No changes to save."
                : `${plural(changeCount, "biller")} will be saved · ${preview.counts.unchanged} unchanged`}
          </div>

          <label className="mt-4 block text-xs">
            <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
              Reason for this upload
            </span>
            <textarea
              rows={2}
              value={reason}
              disabled={saving}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Provider CMS commercial sheet V0.95"
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: touched && !reasonOk ? "#FCA5A5" : B.border, background: "var(--admin-card)" }}
            />
            <span className={`mt-1 block ${touched && !reasonOk ? "font-semibold text-red-600" : ""}`} style={touched && !reasonOk ? undefined : { color: B.muted }}>
              {touched && !reasonOk ? "Enter a reason for this upload (at least 3 characters)" : "At least 3 characters · shown in Rate audit"}
            </span>
          </label>

          {saveError ? (
            <p
              className="mt-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {saveError}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Btn
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setStep(1);
                setPreview(null);
                setRows(null);
                setFile(null);
                setSaveError(null);
              }}
            >
              Choose another file
            </Btn>
            <Btn variant="primary" disabled={busy || blocked || changeCount === 0 || !reasonOk} onClick={() => void save()}>
              {saving ? "Saving…" : `Save ${plural(changeCount, "biller")}`}
            </Btn>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
