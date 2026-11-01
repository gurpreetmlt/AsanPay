"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowRight, ChevronRight, Download, FileSpreadsheet, ListChecks, ShieldCheck, Upload, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { readXlsx } from "@/lib/xlsxWorkbook";
import { apiErrorMessage, downloadCsv, parseCsv } from "@/lib/taxCommissionUtils";
import { CompareTable } from "./SaveConfirmModal";
import { BillerChangeRow } from "./CmsBillerUploadModal";
import {
  billerChangeCount,
  checkBillers,
  hasBillerTab,
  issuesCsv as billerIssuesCsv,
  parseBillerSheet,
  saveBillers,
  type BillerPreview,
  type BillerRow,
} from "./cmsBillers";
import {
  defaultPick,
  importRecordBody,
  importSave,
  issueText,
  issuesCsv,
  parseCsvImport,
  parseXlsxImport,
  planImport,
  providerIdsIn,
  slabTicked,
  staleWarning,
  type FieldDiff,
  type ImportPick,
  type ParsedImport,
  type ServicePreview,
  type SlabPreview,
  type SlabStatus,
} from "./rateCardImport";
import type { SaveProgress, SaveRequest } from "./usePendingSave";
import type { RateCardData } from "./types";
import { Btn, Chip } from "./ui";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const STATUS: Record<SlabStatus, { label: string; tone: "green" | "amber" | "red" | "muted"; bg: string; edge: string }> = {
  new: { label: "New", tone: "green", bg: "rgba(18,183,106,0.07)", edge: "#86EFAC" },
  changed: { label: "Changed", tone: "amber", bg: "rgba(217,119,6,0.07)", edge: "#FCD34D" },
  removed: { label: "Remove", tone: "red", bg: "rgba(220,38,38,0.06)", edge: "#FCA5A5" },
  unchanged: { label: "Same", tone: "muted", bg: "var(--admin-secondary)", edge: B.border },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const emptyImport = (fileName: string, kind: ParsedImport["kind"]): ParsedImport => ({
  fileName,
  kind,
  exportedAt: null,
  dataVersion: null,
  rows: [],
  emptyTabs: [],
  warnings: [],
});

type BillerPart = { rows: BillerRow[]; sheets: string[]; preview: BillerPreview };

/** Cash Collection biller tab(s) found in the same workbook — saved together with the rate card. */
function BillerBlock({
  part,
  on,
  open,
  done,
  onToggle,
  onToggleOpen,
}: {
  part: BillerPart;
  on: boolean;
  open: boolean;
  done: boolean;
  onToggle: () => void;
  onToggleOpen: () => void;
}) {
  const p = part.preview;
  const changes = billerChangeCount(p);
  const blocked = p.issueCount > 0;
  return (
    <div className="mb-3 rounded-2xl border" style={{ borderColor: blocked ? "#FCA5A5" : on ? "#BFDBFE" : B.border, background: "var(--admin-card)" }}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <Tick
          checked={on && !blocked && changes > 0}
          disabled={blocked || changes === 0 || done}
          label={blocked ? "Fix the biller errors first" : changes === 0 ? "No biller changes" : on ? "Skip the billers" : "Save the billers"}
          onChange={onToggle}
        />
        <button type="button" onClick={onToggleOpen} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open}>
          <ChevronRight size={15} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} style={{ color: B.muted }} />
          <Users size={15} className="shrink-0" style={{ color: B.blueLight }} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold" style={{ color: B.blue }}>
              Cash Collection billers
            </span>
            <span className="block text-[11px]" style={{ color: B.muted }}>
              {part.sheets.length === 1 ? "Tab" : "Tabs"} {part.sheets.map((s) => `“${s}”`).join(", ")} · {plural(p.rowsRead, "row")}
              {done ? " · saved" : ""}
            </span>
          </span>
        </button>
        <span className="flex flex-wrap items-center gap-1">
          {blocked ? <Chip tone="red">{plural(p.issueCount, "error")}</Chip> : null}
          {p.counts.new ? <Chip tone="green">{p.counts.new} new</Chip> : null}
          {p.counts.changed ? <Chip tone="amber">{p.counts.changed} changed</Chip> : null}
          {p.counts.unchanged ? <Chip tone="muted">{p.counts.unchanged} same</Chip> : null}
        </span>
      </div>
      {blocked ? (
        <div className="px-3 pb-3">
          <ul className="space-y-1 rounded-xl border p-2.5 text-[11px]" style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}>
            {p.issues.slice(0, 6).map((i) => (
              <li key={i} className="flex items-start gap-1.5 font-semibold">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {i}
              </li>
            ))}
            {p.issueCount > 6 ? <li className="font-semibold">…and {p.issueCount - 6} more — download the biller error report.</li> : null}
          </ul>
          <button
            type="button"
            onClick={() => downloadCsv(`cms-biller-errors-${new Date().toISOString().slice(0, 10)}.csv`, billerIssuesCsv(p.issues))}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold"
            style={{ borderColor: "#FCA5A5", color: B.danger, background: "#FEF2F2" }}
          >
            <Download size={13} /> Download biller error report
          </button>
        </div>
      ) : null}
      {open && !blocked ? (
        <div className="space-y-2 border-t px-3 py-3" style={{ borderColor: B.border }}>
          {changes === 0 ? (
            <p className="text-xs" style={{ color: B.muted }}>
              Every biller in the file already matches the saved margins.
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {p.changes.slice(0, 200).map((c, i) => (
                <BillerChangeRow key={`${c.status}-${c.billerId}`} c={c} index={i} />
              ))}
              {p.changes.length > 200 ? (
                <li className="text-center text-[11px] font-semibold" style={{ color: B.muted }}>
                  Showing the first 200 of {p.changes.length}. All of them are saved.
                </li>
              ) : null}
            </ul>
          )}
          <p className="text-[11px]" style={{ color: B.muted }}>
            Billers missing from the file keep their saved margins. To remove them, use Cash Collection → Billers → Upload biller sheet.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Tick({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      title={label}
      className="h-4 w-4 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-35"
      style={{ accentColor: B.blueLight }}
    />
  );
}

function FieldTile({ f }: { f: FieldDiff }) {
  return (
    <div className="rounded-xl border px-2.5 py-1.5" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
        {f.label}
      </p>
      {f.changed ? (
        <p className="flex flex-wrap items-center gap-1 text-xs tabular-nums">
          <span className="line-through" style={{ color: B.muted }}>
            {f.before}
          </span>
          <ArrowRight size={11} style={{ color: B.muted }} />
          <span className="font-bold" style={{ color: f.after === "Removed" || f.after === "Not set" ? B.danger : B.greenDark }}>
            {f.after}
          </span>
        </p>
      ) : (
        <p className="text-xs tabular-nums" style={{ color: B.muted }}>
          {f.before}
        </p>
      )}
    </div>
  );
}

function SlabCard({
  slab,
  ticked,
  canTick,
  onToggle,
}: {
  slab: SlabPreview;
  ticked: boolean;
  canTick: boolean;
  onToggle: () => void;
}) {
  const st = STATUS[slab.status];
  const edge = slab.loss ? B.danger : st.edge;
  return (
    <li className="rounded-2xl border p-2.5" style={{ borderColor: edge, background: slab.loss ? "#FEF2F2" : st.bg }}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {slab.status === "unchanged" ? (
          <span className="w-4" />
        ) : (
          <Tick checked={ticked} disabled={!canTick} label={ticked ? "Skip this change" : "Save this change"} onChange={onToggle} />
        )}
        <span className="text-xs font-bold" style={{ color: B.blue }}>
          {slab.slab}
        </span>
        <Chip tone={st.tone}>{st.label}</Chip>
        <span className="ml-auto text-[11px]" style={{ color: B.muted }}>
          {slab.where}
        </span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {slab.fields.map((f, i) => (
          <FieldTile key={`${f.label}-${i}`} f={f} />
        ))}
      </div>
      {slab.loss ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold" style={{ color: B.danger }}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {slab.loss}
        </p>
      ) : null}
    </li>
  );
}

function IssueList({ issues, max = 8 }: { issues: ServicePreview["issues"]; max?: number }) {
  return (
    <ul className="space-y-1 rounded-xl border p-2.5 text-[11px]" style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}>
      {issues.slice(0, max).map((i, n) => (
        <li key={n} className="flex items-start gap-1.5 font-semibold">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {issueText(i)}
        </li>
      ))}
      {issues.length > max ? <li className="font-semibold">…and {issues.length - max} more — download the error report.</li> : null}
    </ul>
  );
}

function ServiceBlock({
  p,
  pick,
  open,
  showSame,
  onToggleService,
  onToggleSlab,
  onToggleOpen,
  onToggleSame,
}: {
  p: ServicePreview;
  pick: ImportPick;
  open: boolean;
  showSame: boolean;
  onToggleService: () => void;
  onToggleSlab: (id: string) => void;
  onToggleOpen: () => void;
  onToggleSame: () => void;
}) {
  const blocked = p.issues.length > 0;
  const on = pick.services.has(p.key) && !blocked;
  const active = p.slabs.filter((s) => s.status !== "unchanged");
  const same = p.slabs.filter((s) => s.status === "unchanged");
  const tickedCount = p.slabs.filter((s) => slabTicked(pick, p, s)).length;
  return (
    <li className="rounded-2xl border" style={{ borderColor: blocked ? "#FCA5A5" : on ? "#BFDBFE" : B.border, background: "var(--admin-card)" }}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <Tick
          checked={on}
          disabled={blocked}
          label={blocked ? "Fix the errors in this service first" : on ? "Skip this service" : "Import this service"}
          onChange={onToggleService}
        />
        <button type="button" onClick={onToggleOpen} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open}>
          <ChevronRight size={15} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} style={{ color: B.muted }} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold" style={{ color: B.blue }}>
              {p.serviceName}
            </span>
            <span className="block text-[11px]" style={{ color: B.muted }}>
              {p.providerName} · {plural(p.rowsRead, "row")}
              {on && active.length ? ` · ${tickedCount} of ${active.length} ticked` : ""}
            </span>
          </span>
        </button>
        <span className="flex flex-wrap items-center gap-1">
          {p.stale ? <Chip tone="amber" title="Saved rates changed after this file was exported">Changed since export</Chip> : null}
          {blocked ? <Chip tone="red">{plural(p.issues.length, "error")}</Chip> : null}
          {p.counts.changed ? <Chip tone="amber">{p.counts.changed} changed</Chip> : null}
          {p.counts.new ? <Chip tone="green">{p.counts.new} new</Chip> : null}
          {p.counts.removed ? <Chip tone="red">{p.counts.removed} removed</Chip> : null}
          {p.counts.unchanged ? <Chip tone="muted">{p.counts.unchanged} same</Chip> : null}
        </span>
      </div>
      {blocked ? (
        <div className="px-3 pb-3">
          <IssueList issues={p.issues} />
        </div>
      ) : null}
      {open && !blocked ? (
        <div className="space-y-2 border-t px-3 py-3" style={{ borderColor: B.border }}>
          {active.length === 0 ? (
            <p className="text-xs" style={{ color: B.muted }}>
              Every slab in the file already matches the rate card.
            </p>
          ) : (
            <ul className="space-y-2">
              {active.map((s) => (
                <SlabCard key={s.id} slab={s} ticked={slabTicked(pick, p, s)} canTick={on} onToggle={() => onToggleSlab(s.id)} />
              ))}
            </ul>
          )}
          {same.length > 0 ? (
            <>
              <button type="button" onClick={onToggleSame} className="text-xs font-bold hover:underline" style={{ color: B.blueLight }}>
                {showSame ? "Hide" : "Show"} {plural(same.length, "unchanged slab")}
              </button>
              {showSame ? (
                <ul className="space-y-2">
                  {same.map((s) => (
                    <SlabCard key={s.id} slab={s} ticked={false} canTick={false} onToggle={() => undefined} />
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function RateCardImportModal({
  data,
  saving,
  progress,
  runSave,
  onClose,
  onImported,
  onBillersSaved,
}: {
  data: RateCardData;
  saving: boolean;
  progress: SaveProgress | null;
  runSave: (reason: string, req: SaveRequest) => Promise<number>;
  onClose: () => void;
  /** `importId` null when the rates saved but the history record failed (no undo), or only billers were saved. */
  onImported: (importId: string | null, saved: number, fileName: string) => void;
  /** Cash Collection billers from the same workbook were saved. */
  onBillersSaved: (count: number, fileName: string) => void;
}) {
  const [billers, setBillers] = useState<BillerPart | null>(null);
  const [billersOn, setBillersOn] = useState(false);
  const [billersOpen, setBillersOpen] = useState(false);
  const [billersDone, setBillersDone] = useState(false);
  const [billerSaving, setBillerSaving] = useState(false);
  const [billerError, setBillerError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [cards, setCards] = useState<Map<string, RateCardData>>(() => new Map());
  const [removeMissing, setRemoveMissing] = useState(false);
  const [pick, setPick] = useState<ImportPick>({ services: new Set(), excluded: new Set() });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [showSame, setShowSame] = useState<Set<string>>(() => new Set());
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const previews = useMemo<ServicePreview[]>(() => {
    if (!parsed) return [];
    return planImport(parsed, data, (id) => cards.get(id ?? ""), { removeMissing });
  }, [parsed, data, cards, removeMissing]);
  const save = useMemo(() => importSave(previews, pick), [previews, pick]);
  const stale = parsed ? staleWarning(parsed, previews) : null;
  const allIssues = previews.flatMap((p) => p.issues.map((issue) => ({ service: p.serviceName, issue })));
  const blockedCount = previews.filter((p) => p.issues.length > 0).length;
  const reading = phase !== null;
  const reasonOk = reason.trim().length >= 3;
  const billerCount = billers ? billerChangeCount(billers.preview) : 0;
  const billerSave = Boolean(billers && billersOn && !billersDone && billers.preview.issueCount === 0 && billerCount > 0);
  const busy = saving || billerSaving;
  const nothingToSave = save.pairs.length === 0 && !billerSave;

  async function readFile(f: File) {
    setFile(f);
    setFileError(null);
    setParsed(null);
    setBillers(null);
    setBillersDone(false);
    setBillerError(null);
    const isXlsx = /\.xlsx$/i.test(f.name);
    if (!isXlsx && !/\.csv$/i.test(f.name)) {
      setFileError(`“${f.name}” is not an Excel (.xlsx) or CSV file. Use the file from Export → Excel, CSV or Blank template.`);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setFileError(`“${f.name}” is ${fileSize(f.size)} — the limit is 10 MB. Export fewer services (Export → Only <service>) and import that file.`);
      return;
    }
    try {
      setPhase("Reading the file…");
      const text = isXlsx ? "" : await f.text();
      const sheets = isXlsx ? await readXlsx(f) : [{ name: f.name, rows: parseCsv(text) }];
      // Tabs with a "Biller Id" header are Cash Collection billers; every other tab is read as the rate card.
      const bill = hasBillerTab(sheets) ? parseBillerSheet(sheets) : null;
      const billTabs = bill && !("error" in bill) ? bill.sheets : [];
      const parsedRc = isXlsx
        ? parseXlsxImport(f.name, sheets.filter((s) => !billTabs.includes(s.name)), data)
        : billTabs.length > 0
          ? emptyImport(f.name, "csv")
          : parseCsvImport(f.name, text, data);
      const hasBillers = billTabs.length > 0;
      if ("error" in parsedRc && !hasBillers) {
        setFileError(bill && "error" in bill ? bill.error : parsedRc.error);
        return;
      }
      const res = "error" in parsedRc ? emptyImport(f.name, isXlsx ? "xlsx" : "csv") : parsedRc;
      if (bill && "error" in bill) res.warnings.push(`${bill.error} Billers skipped.`);
      setPhase("Comparing with the saved rates…");
      const next = new Map<string, RateCardData>([[data.providerId ?? "", data]]);
      for (const id of providerIdsIn(res, data)) {
        if (!next.has(id ?? "")) next.set(id ?? "", await fetchApi<RateCardData>("/admin/rate-card", id ? { providerId: id } : undefined));
      }
      const pv = planImport(res, data, (id) => next.get(id ?? ""), { removeMissing });
      if (pv.length === 0 && !hasBillers) {
        setFileError(
          res.emptyTabs.length > 0 && res.warnings.length === 0
            ? "Every service tab in this file is empty. Fill at least one slab row and import again."
            : "No service in this file matches a service on the rate card. Check the tab titles, or download the template from Export → Blank template.",
        );
        return;
      }
      if (bill && !("error" in bill)) {
        setPhase("Comparing with the saved billers…");
        const preview = await checkBillers(f.name, bill.rows, false);
        setBillers({ rows: bill.rows, sheets: bill.sheets, preview });
        setBillersOn(preview.issueCount === 0 && billerChangeCount(preview) > 0);
        setBillersOpen(pv.length === 0);
      }
      setCards(next);
      setParsed(res);
      setPick(defaultPick(pv));
      setOpen(new Set(pv.length === 1 ? [pv[0]!.key] : []));
      setShowSame(new Set());
      setStep(2);
    } catch (err) {
      setFileError(apiErrorMessage(err, "Could not read this file. Save it again in Excel and retry."));
    } finally {
      setPhase(null);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !reading && !busy) void readFile(f);
  }

  const toggleIn = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  async function confirm() {
    if (!file || !reasonOk || nothingToSave) return;
    if (billerSave && billers) {
      setBillerSaving(true);
      setBillerError(null);
      try {
        await saveBillers(file.name, billers.rows, false, reason.trim());
        setBillersDone(true);
        onBillersSaved(billerCount, file.name);
      } catch (err) {
        setBillerError(apiErrorMessage(err, "The billers were not saved and no rates were changed. Try again."));
        return;
      } finally {
        setBillerSaving(false);
      }
    }
    if (save.pairs.length === 0) {
      onImported(null, 0, file.name);
      return;
    }
    const pairs = save.pairs;
    let importId: string | null = null;
    const req: SaveRequest = {
      title: "Import rate card",
      changes: pairs.map((p) => p.change),
      warnings: [],
      compare: save.compare,
      afterSave: async (saved, why) => {
        try {
          const r = await api.post("/admin/rate-card/imports", importRecordBody(file.name, why, previews, pairs.slice(0, saved.length)));
          if (!r.data.success) throw new Error(r.data.message);
          importId = (r.data.data as { id: string }).id;
        } catch (err) {
          toast.error(`Rates saved, but the import was not added to Import history (${apiErrorMessage(err, "network error")}). Undo is not available for it.`);
        }
      },
    };
    const done = await runSave(reason.trim(), req);
    if (done > 0) onImported(importId, done, file.name);
  }

  const eyebrow = step === 1 ? "Step 1 of 3 · Upload" : step === 2 ? "Step 2 of 3 · Choose services & review" : "Step 3 of 3 · Confirm";
  const subtitle =
    step === 1
      ? "Excel (.xlsx) from Export → Excel or Blank template, or a CSV from Export → CSV. Tabs with a Biller Id column are saved as Cash Collection billers."
      : step === 2
        ? "Tick the services and changes to save. Blank cells in the file keep what is saved."
        : "Check what changes, add a reason, then save. Applies from now to new transactions.";

  return (
    <Modal
      title="Import rate card"
      eyebrow={eyebrow}
      subtitle={subtitle}
      icon={step === 1 ? <Upload size={22} /> : step === 2 ? <ListChecks size={22} /> : <ShieldCheck size={22} />}
      iconTone="blue"
      onClose={busy || reading ? () => undefined : onClose}
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
              Drag the rate card file here
            </p>
            <p className="text-xs" style={{ color: B.muted }}>
              .xlsx or .csv · up to 10 MB
            </p>
            <Btn variant="primary" disabled={reading} onClick={() => input.current?.click()}>
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
                <span style={{ color: B.muted }}>{fileSize(file.size)}</span>
              </div>
              {reading ? (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(42,92,221,0.12)" }}>
                    <div className="h-full w-1/3 animate-pulse rounded-full" style={{ background: B.blueLight }} />
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: B.muted }}>
                    {phase}
                  </p>
                </div>
              ) : parsed && !fileError ? (
                <p className="mt-1 text-[11px] font-semibold" style={{ color: B.greenDark }}>
                  Read {plural(parsed.rows.length, "row")} across {plural(previews.length, "service")}
                  {billers ? ` + ${plural(billers.preview.rowsRead, "biller")} (Cash Collection)` : ""}.
                </p>
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
            <Btn variant="destructive" disabled={reading} onClick={onClose}>
              Cancel
            </Btn>
            <Btn variant="primary" disabled={!parsed || reading || Boolean(fileError)} onClick={() => setStep(2)}>
              Continue
            </Btn>
          </div>
        </>
      ) : null}

      {step === 2 && parsed ? (
        <>
          {stale ? (
            <p
              className="mb-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "#FCD34D", background: "#FFFBEB", color: "#B45309" }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {stale}
            </p>
          ) : null}
          {parsed.warnings.length || parsed.emptyTabs.length ? (
            <ul
              className="mb-3 max-h-28 space-y-1 overflow-y-auto rounded-xl border px-3 py-2 text-[11px] font-semibold"
              style={{ borderColor: "#FCD34D", background: "#FFFBEB", color: "#B45309" }}
            >
              {parsed.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
              {parsed.emptyTabs.length ? (
                <li>
                  {plural(parsed.emptyTabs.length, "tab")} with no slab rows skipped: {parsed.emptyTabs.slice(0, 8).join(", ")}
                  {parsed.emptyTabs.length > 8 ? "…" : ""}
                </li>
              ) : null}
            </ul>
          ) : null}

          {billers ? (
            <BillerBlock
              part={billers}
              on={billersOn}
              open={billersOpen}
              done={billersDone}
              onToggle={() => setBillersOn((v) => !v)}
              onToggleOpen={() => setBillersOpen((v) => !v)}
            />
          ) : null}

          {previews.length > 0 ? (
          <>
          <label
            className="mb-3 flex cursor-pointer items-start gap-2 rounded-2xl border px-3 py-2.5 text-xs"
            style={{ borderColor: removeMissing ? "#FCA5A5" : B.border, background: removeMissing ? "#FEF2F2" : "var(--admin-secondary)" }}
          >
            <input
              type="checkbox"
              checked={removeMissing}
              onChange={() => setRemoveMissing((v) => !v)}
              className="mt-0.5 h-4 w-4"
              style={{ accentColor: B.danger }}
            />
            <span>
              <span className="block font-bold" style={{ color: removeMissing ? B.danger : B.blue }}>
                Remove slabs that are not in the file
              </span>
              <span style={{ color: B.muted }}>
                Off: slabs missing from the file stay as they are. On: they are ended for the ticked services (shown in red, each can be unticked).
              </span>
            </span>
          </label>

          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold" style={{ color: B.blue }}>
              {plural(previews.length, "service")} in the file · {pick.services.size} ticked
            </span>
            <button
              type="button"
              className="font-bold hover:underline"
              style={{ color: B.blueLight }}
              onClick={() => setPick((p) => ({ ...p, services: new Set(previews.filter((x) => x.issues.length === 0).map((x) => x.key)) }))}
            >
              Select all
            </button>
            <button type="button" className="font-bold hover:underline" style={{ color: B.danger }} onClick={() => setPick((p) => ({ ...p, services: new Set() }))}>
              Clear
            </button>
            {allIssues.length > 0 ? (
              <button
                type="button"
                onClick={() => downloadCsv(`rate-card-import-errors-${new Date().toISOString().slice(0, 10)}.csv`, issuesCsv(allIssues))}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-bold"
                style={{ borderColor: "#FCA5A5", color: B.danger, background: "#FEF2F2" }}
              >
                <Download size={13} /> Download error report ({allIssues.length})
              </button>
            ) : null}
          </div>

          <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {previews.map((p) => (
              <ServiceBlock
                key={p.key}
                p={p}
                pick={pick}
                open={open.has(p.key)}
                showSame={showSame.has(p.key)}
                onToggleService={() => setPick((cur) => ({ ...cur, services: toggleIn(cur.services, p.key) }))}
                onToggleSlab={(id) => setPick((cur) => ({ ...cur, excluded: toggleIn(cur.excluded, id) }))}
                onToggleOpen={() => setOpen((cur) => toggleIn(cur, p.key))}
                onToggleSame={() => setShowSame((cur) => toggleIn(cur, p.key))}
              />
            ))}
          </ul>
          </>
          ) : null}

          <p className="mt-3 text-[11px]" style={{ color: nothingToSave ? B.danger : B.muted }}>
            {save.pairs.length
              ? `${plural(save.slabs, "slab")} in ${plural(save.services, "service")} · ${plural(save.pairs.length, "save")}${
                  blockedCount ? ` · ${plural(blockedCount, "service")} with errors skipped` : ""
                }${billerSave ? ` · ${plural(billerCount, "biller")}` : ""}`
              : billerSave
                ? `${plural(billerCount, "biller")} to save · no rate card slab changes`
                : previews.length > 0 && blockedCount === previews.length
                  ? "Every service has errors. Fix them in the file (download the error report) and import again."
                  : billers && billers.preview.issueCount > 0
                    ? "The biller tab has errors. Fix them in the file (download the biller error report) and import again."
                    : "Nothing to save — tick at least one service or the billers with changes."}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Btn
              variant="secondary"
              onClick={() => {
                setStep(1);
                setParsed(null);
                setFile(null);
                setBillers(null);
              }}
            >
              Choose another file
            </Btn>
            <Btn variant="primary" disabled={nothingToSave} onClick={() => setStep(3)}>
              Continue
            </Btn>
          </div>
        </>
      ) : null}

      {step === 3 && parsed ? (
        <>
          {billers && (billerSave || billersDone) ? (
            <div
              className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "#86EFAC", background: "rgba(18,183,106,0.08)", color: B.greenDark }}
            >
              <Users size={14} />
              {billersDone ? "Saved: " : ""}Cash Collection billers · {billers.preview.counts.new} new · {billers.preview.counts.changed} changed
              <span className="ml-auto font-normal" style={{ color: B.muted }}>
                Undo from Cash Collection → Billers → Upload history
              </span>
            </div>
          ) : null}

          {save.pairs.length > 0 ? (
          <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Services", save.services],
              ["Slabs", save.slabs],
              ["Saves", save.pairs.length],
              ["Removals", save.removed],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border px-3 py-2" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                  {label}
                </p>
                <p className="text-lg font-bold tabular-nums" style={{ color: label === "Removals" && Number(value) > 0 ? B.danger : B.blue }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          <CompareTable rows={save.compare} />
          </>
          ) : null}

          {(() => {
            const warnings = [
              ...save.losses,
              ...(stale ? [stale] : []),
              ...(save.removed
                ? [`${plural(save.removed, "slab")} will be ended. Txns in those ranges get no provider income until another slab covers them.`]
                : []),
              ...(blockedCount ? [`${plural(blockedCount, "service")} with errors will not be imported.`] : []),
            ];
            return warnings.length ? (
              <div
                className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-xl border px-3 py-2 text-xs font-semibold"
                style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}
              >
                {warnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            ) : null;
          })()}

          <label className="mt-4 block text-xs">
            <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
              Reason for this change
            </span>
            <textarea
              rows={2}
              value={reason}
              disabled={busy || billersDone}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Provider rate sheet Oct 2026"
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: touched && !reasonOk ? "#FCA5A5" : B.border, background: "var(--admin-card)" }}
            />
            <span className={`mt-1 block ${touched && !reasonOk ? "font-semibold text-red-600" : ""}`} style={touched && !reasonOk ? undefined : { color: B.muted }}>
              {touched && !reasonOk ? "Enter a reason for this change (at least 3 characters)" : "At least 3 characters · shown in Rate audit"}
            </span>
          </label>

          {saving && progress ? (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "rgba(42,92,221,0.12)" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`, background: B.blueLight }}
                />
              </div>
              <p className="mt-1 text-[11px] font-semibold" style={{ color: B.blueLight }}>
                Saving {Math.min(progress.done + 1, progress.total)} of {progress.total} changes…
              </p>
            </div>
          ) : null}

          {billerError ? (
            <p
              className="mt-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {billerError}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Btn variant="secondary" disabled={busy || billersDone} onClick={() => setStep(2)}>
              Back
            </Btn>
            <Btn variant="primary" disabled={busy || !reasonOk || nothingToSave} onClick={() => void confirm()}>
              {busy
                ? billerSaving
                  ? "Saving billers…"
                  : "Saving…"
                : `Save ${[save.pairs.length ? plural(save.pairs.length, "change") : null, billerSave ? plural(billerCount, "biller") : null]
                    .filter(Boolean)
                    .join(" + ")}`}
            </Btn>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
