"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowRight, ChevronRight, Download, FileSpreadsheet, ListChecks, ShieldCheck, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { readXlsx } from "@/lib/xlsxWorkbook";
import { apiErrorMessage, downloadCsv } from "@/lib/taxCommissionUtils";
import { CompareTable } from "./SaveConfirmModal";
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
}: {
  data: RateCardData;
  saving: boolean;
  progress: SaveProgress | null;
  runSave: (reason: string, req: SaveRequest) => Promise<number>;
  onClose: () => void;
  /** `importId` null when the rates saved but the history record failed (no undo). */
  onImported: (importId: string | null, saved: number, fileName: string) => void;
}) {
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

  async function readFile(f: File) {
    setFile(f);
    setFileError(null);
    setParsed(null);
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
      const res = isXlsx ? parseXlsxImport(f.name, await readXlsx(f), data) : parseCsvImport(f.name, await f.text(), data);
      if ("error" in res) {
        setFileError(res.error);
        return;
      }
      setPhase("Comparing with the saved rates…");
      const next = new Map<string, RateCardData>([[data.providerId ?? "", data]]);
      for (const id of providerIdsIn(res, data)) {
        if (!next.has(id ?? "")) next.set(id ?? "", await fetchApi<RateCardData>("/admin/rate-card", id ? { providerId: id } : undefined));
      }
      const pv = planImport(res, data, (id) => next.get(id ?? ""), { removeMissing });
      if (pv.length === 0) {
        setFileError(
          res.emptyTabs.length > 0 && res.warnings.length === 0
            ? "Every service tab in this file is empty. Fill at least one slab row and import again."
            : "No service in this file matches a service on the rate card. Check the tab titles, or download the template from Export → Blank template.",
        );
        return;
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
    if (f && !reading && !saving) void readFile(f);
  }

  const toggleIn = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  async function confirm() {
    if (!file || !reasonOk || save.pairs.length === 0) return;
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
      ? "Excel (.xlsx) from Export → Excel or Blank template, or a CSV from Export → CSV."
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
      onClose={saving || reading ? () => undefined : onClose}
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
                  Read {plural(parsed.rows.length, "row")} across {plural(previews.length, "service")}.
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

          <p className="mt-3 text-[11px]" style={{ color: save.pairs.length ? B.muted : B.danger }}>
            {save.pairs.length
              ? `${plural(save.slabs, "slab")} in ${plural(save.services, "service")} · ${plural(save.pairs.length, "save")}${
                  blockedCount ? ` · ${plural(blockedCount, "service")} with errors skipped` : ""
                }`
              : blockedCount === previews.length
                ? "Every service has errors. Fix them in the file (download the error report) and import again."
                : "Nothing to save — tick at least one service with changes."}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Btn
              variant="secondary"
              onClick={() => {
                setStep(1);
                setParsed(null);
                setFile(null);
              }}
            >
              Choose another file
            </Btn>
            <Btn variant="primary" disabled={save.pairs.length === 0} onClick={() => setStep(3)}>
              Continue
            </Btn>
          </div>
        </>
      ) : null}

      {step === 3 && parsed ? (
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
              disabled={saving}
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

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Btn variant="secondary" disabled={saving} onClick={() => setStep(2)}>
              Back
            </Btn>
            <Btn variant="primary" disabled={saving || !reasonOk} onClick={() => void confirm()}>
              {saving ? "Saving…" : `Save ${plural(save.pairs.length, "change")}`}
            </Btn>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
