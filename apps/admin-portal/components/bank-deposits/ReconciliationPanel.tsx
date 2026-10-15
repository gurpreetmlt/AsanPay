"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Upload,
  XCircle,
} from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { downloadBrandedExcel, openBrandedPdf, type BrandedReport, type CellTone } from "@/lib/brandedExport";
import { parseStatement, type ParsedStatement } from "@/lib/statementParser";

type Kind = "matched" | "suspense" | "mismatch" | "possible" | "only_bank" | "only_ours" | "ignored";

interface BankAccount {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  purpose: string;
  isActive: boolean;
}

interface ReconLine {
  id: string;
  date: string;
  direction: "CR" | "DR";
  amount: string;
  utr: string | null;
  narration: string | null;
  senderName: string | null;
}

interface ReconRecord {
  journalId: string;
  date: string;
  direction: "CR" | "DR";
  amount: string;
  label: string;
  party: string | null;
  utr: string | null;
}

interface ReconRow {
  kind: Kind;
  line: ReconLine | null;
  record: ReconRecord | null;
  unlinkable: boolean;
}

interface StatementImport {
  id: string;
  bankAccountId: string;
  bankName: string;
  last4: string;
  fileName: string | null;
  source: string;
  periodFrom: string | null;
  periodTo: string | null;
  lineCount: number;
  newLines: number;
  duplicates: number;
  matched: number;
  suspense: number;
  unmatched: number;
  importedBy: string | null;
  uploadedAt: string;
  accountLast4: string | null;
  verification: string | null;
}

interface BankVerifyCheck {
  code: string;
  result: "pass" | "fail" | "skipped";
  message: string;
}

interface BankVerifyResult {
  verdict: "verified" | "blocked" | "unverified";
  message: string;
  checks: BankVerifyCheck[];
  suggestedBank: { id: string; bankName: string; last4: string } | null;
}

interface ReconReport {
  bank: { id: string; bankName: string; last4: string };
  period: { from: string; to: string };
  counts: Record<Kind, number>;
  statement: { lineCount: number; credits: string; debits: string; opening: string | null; closing: string | null };
  ours: { opening: string; closing: string };
  closingDifference: string | null;
  rows: ReconRow[];
}

const KIND_META: Record<Kind, { label: string; color: string; bg: string; tone: CellTone }> = {
  matched: { label: "Matched", color: "#15803D", bg: "#DCFCE7", tone: "approved" },
  suspense: { label: "Parked in suspense", color: "#B45309", bg: "#FEF3C7", tone: "requested" },
  possible: { label: "Possible match", color: "#A16207", bg: "#FEF9C3", tone: "requested" },
  mismatch: { label: "Amount mismatch", color: "#C2410C", bg: "#FFEDD5", tone: "requested" },
  only_bank: { label: "Only in bank", color: "#B91C1C", bg: "#FEE2E2", tone: "rejected" },
  only_ours: { label: "Only in our records", color: "#B91C1C", bg: "#FEE2E2", tone: "rejected" },
  ignored: { label: "Ignored", color: "#64748B", bg: "#F1F5F9", tone: "muted" },
};

const TILE_ORDER: Kind[] = ["matched", "possible", "mismatch", "only_bank", "only_ours", "suspense"];
const ATTENTION: Kind[] = ["possible", "mismatch", "only_bank", "only_ours", "suspense"];
const BATCH = 500;

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

function inr(amount: string | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  const n = Number(amount);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signed(direction: "CR" | "DR", amount: string) {
  return `${direction === "CR" ? "+" : "−"} ${inr(amount)}`;
}

function dmy(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number) {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function presetRange(preset: "today" | "week" | "month" | "lastMonth"): { from: string; to: string } {
  const today = istToday();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { from: shiftDays(today, -((dow + 6) % 7)), to: today };
  }
  const [y, m] = today.split("-").map(Number) as [number, number];
  if (preset === "month") return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const mm = String(pm).padStart(2, "0");
  return { from: `${py}-${mm}-01`, to: `${py}-${mm}-${String(last).padStart(2, "0")}` };
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const inputCls = "w-full rounded-xl border px-3 py-2.5 text-sm";
const inputStyle = { borderColor: B.border };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: B.muted }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px]" style={{ color: B.muted }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function KindPill({ kind }: { kind: Kind }) {
  const m = KIND_META[kind];
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ color: m.color, background: m.bg }}
    >
      {m.label}
    </span>
  );
}

function buildReport(report: ReconReport, rows: ReconRow[], generatedBy: string): BrandedReport {
  const { bank, period, counts } = report;
  return {
    title: "Bank Reconciliation Statement",
    fileName: `AsanPay_Bank_Reconciliation_${bank.bankName.replace(/\W+/g, "_")}_${period.from}_to_${period.to}`,
    meta: [
      { label: "Bank", value: `${bank.bankName} ••${bank.last4}` },
      { label: "Period", value: `${dmy(period.from)} to ${dmy(period.to)}` },
      { label: "Generated on", value: new Date().toLocaleString("en-IN") },
      { label: "Generated by", value: generatedBy },
    ],
    summary: [
      { label: "Statement closing", value: inr(report.statement.closing) },
      { label: "Our closing", value: inr(report.ours.closing) },
      {
        label: "Difference",
        value: inr(report.closingDifference),
        tone: report.closingDifference && Number(report.closingDifference) !== 0 ? "debit" : "credit",
      },
      { label: "Matched", value: String(counts.matched), tone: "credit" },
      {
        label: "Needs attention",
        value: String(ATTENTION.reduce((n, k) => n + counts[k], 0)),
        tone: "debit",
      },
    ],
    columns: [
      { label: "#", align: "center" },
      { label: "Date" },
      { label: "Bank statement", align: "right" },
      { label: "Statement details" },
      { label: "Our record", align: "right" },
      { label: "Record details" },
      { label: "Status" },
    ],
    rows: rows.map((r, i) => [
      { text: String(i + 1), align: "center", tone: "muted" },
      { text: dmy(r.line?.date ?? r.record?.date ?? "") },
      r.line
        ? { text: signed(r.line.direction, r.line.amount), align: "right", tone: r.line.direction === "CR" ? "credit" : "debit" }
        : { text: "—", align: "center", tone: "muted" },
      r.line ? { text: r.line.utr ?? "No UTR", sub: r.line.narration ?? undefined, mono: true } : { text: "" },
      r.record
        ? {
            text: signed(r.record.direction, r.record.amount),
            align: "right",
            tone: r.record.direction === "CR" ? "credit" : "debit",
          }
        : { text: "—", align: "center", tone: "muted" },
      r.record ? { text: r.record.label, sub: [r.record.party, r.record.utr].filter(Boolean).join(" · ") } : { text: "" },
      { text: KIND_META[r.kind].label, tone: KIND_META[r.kind].tone },
    ]),
    footerNote:
      "Matched = statement line tied to a ledger posting. Only in bank = money moved with no entry in AsanPay. Only in our records = posted in AsanPay but not on this statement.",
  };
}

function ExportMenu({ report, rows }: { report: ReconReport; rows: ReconRow[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const generatedBy = useAuthStore((s) => s.user?.name) ?? "AsanPay Admin";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={!rows.length}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ borderColor: B.border, color: B.blue }}
      >
        <Download size={14} /> Export <ChevronDown size={14} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border bg-white shadow-lg"
          style={{ borderColor: B.border }}
        >
          <button
            type="button"
            className={item}
            style={{ color: B.blue }}
            onClick={() => {
              setOpen(false);
              if (!openBrandedPdf(buildReport(report, rows, generatedBy))) {
                toast.error("Allow pop-ups for this site to export the PDF");
              }
            }}
          >
            <FileText size={14} style={{ color: "#DC2626" }} /> PDF
          </button>
          <button
            type="button"
            className={item}
            style={{ color: B.blue }}
            onClick={() => {
              setOpen(false);
              downloadBrandedExcel(buildReport(report, rows, generatedBy));
            }}
          >
            <FileSpreadsheet size={14} style={{ color: "#16A34A" }} /> Excel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function newEntryHref(bankId: string, line: ReconLine) {
  const q = new URLSearchParams({
    fromStatement: "1",
    bankAccountId: bankId,
    amount: line.amount,
    txnDate: line.date,
    direction: line.direction === "CR" ? "credit" : "debit",
  });
  if (line.utr) q.set("utr", line.utr);
  if (line.narration) q.set("narration", line.narration.slice(0, 300));
  return `/treasury/bank?tab=bank-entries&${q.toString()}`;
}

const VERDICT_STYLE = {
  verified: { color: "#15803D", bg: "#F0FDF4", border: "#BBF7D0" },
  blocked: { color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
  unverified: { color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
} as const;

function BankCheckBox({
  check,
  verifying,
  confirmed,
  onConfirm,
  onSwitch,
}: {
  check: BankVerifyResult | null;
  verifying: boolean;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
  onSwitch: (bankId: string) => void;
}) {
  if (verifying)
    return (
      <p className="text-sm" style={{ color: B.muted }}>
        Verifying the statement belongs to the selected bank…
      </p>
    );
  if (!check) return null;
  const s = VERDICT_STYLE[check.verdict];
  const Icon = check.verdict === "verified" ? CheckCircle2 : check.verdict === "blocked" ? XCircle : AlertTriangle;
  return (
    <div className="panel-fade-in space-y-2 rounded-xl border p-3 text-sm" style={{ background: s.bg, borderColor: s.border }}>
      <p className="flex items-start gap-2 font-semibold" style={{ color: s.color }}>
        <Icon size={16} className="mt-0.5 shrink-0" /> {check.message}
      </p>
      <ul className="space-y-0.5 pl-6 text-xs" style={{ color: B.muted }}>
        {check.checks
          .filter((c) => c.result !== "skipped")
          .map((c) => (
            <li key={c.code}>
              {c.result === "pass" ? "✓" : "✗"} {c.message}
            </li>
          ))}
      </ul>
      {check.verdict === "blocked" && check.suggestedBank ? (
        <button
          type="button"
          onClick={() => onSwitch(check.suggestedBank!.id)}
          className="ml-6 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
          style={{ background: B.blue }}
        >
          Switch to {check.suggestedBank.bankName} ••{check.suggestedBank.last4}
        </button>
      ) : null}
      {check.verdict === "unverified" ? (
        <label className="ml-6 flex cursor-pointer items-center gap-2 text-xs font-semibold" style={{ color: s.color }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />I confirm this
          statement is for the selected bank
        </label>
      ) : null}
    </div>
  );
}

export function ReconciliationPanel({ onChanged }: { onChanged?: () => void }) {

  const [banks, setBanks] = useState<BankAccount[]>([]);

  const [uploadBankId, setUploadBankId] = useState("");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [importing, setImporting] = useState(false);
  const [bankCheck, setBankCheck] = useState<BankVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [confirmedBank, setConfirmedBank] = useState(false);

  const initial = presetRange("month");
  const [bankId, setBankId] = useState("");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<ReconReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"attention" | "matched" | "all">("attention");
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [focusLine, setFocusLine] = useState<string | null>(null);
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);
  const reconcileRef = useRef<HTMLElement | null>(null);
  const [history, setHistory] = useState<StatementImport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchApi<StatementImport[]>("/banking/statement-imports", { limit: "20" }));
    } catch (err) {
      toast.error(errMessage(err, "Could not load the statement upload history"));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    fetchApi<BankAccount[]>("/banking/accounts", { purpose: "all" })
      .then((list) => {
        setBanks(list);
        const first = list.find((b) => b.isActive) ?? list[0];
        if (first) {
          setUploadBankId((v) => v || first.id);
          setBankId((v) => v || first.id);
        }
      })
      .catch((err) => toast.error(errMessage(err, "Could not load company bank accounts")));
  }, []);

  const runReport = useCallback(
    async (opts?: { bankId?: string; from?: string; to?: string }) => {
      const b = opts?.bankId ?? bankId;
      const f = opts?.from ?? from;
      const t = opts?.to ?? to;
      if (!b) return void toast.error("Select a company bank account");
      if (!f || !t) return void toast.error("Select both From and To dates");
      if (f > t) return void toast.error("From date must be on or before To date");
      setLoading(true);
      try {
        await api.post("/banking/reconciliation/auto-match", { bankAccountId: b });
        setReport(await fetchApi<ReconReport>("/banking/reconciliation", { bankAccountId: b, from: f, to: t }));
        onChanged?.();
      } catch (err) {
        toast.error(errMessage(err, "Could not run the reconciliation"));
      } finally {
        setLoading(false);
      }
    },
    [bankId, from, to, onChanged],
  );

  // Deep link from Bank entries: ?bank=&from=&to=&line= opens that period and highlights the line.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const b = q.get("bank");
    const f = q.get("from");
    const t = q.get("to");
    if (!b || !f || !t) return;
    setBankId(b);
    setFrom(f);
    setTo(t);
    setFilter("all");
    setFocusLine(q.get("line"));
    for (const k of ["bank", "from", "to", "line"]) q.delete(k);
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
    void runReport({ bankId: b, from: f, to: t });
    // Runs once on mount; runReport is read with the deep-link values passed explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (report && focusLine) focusRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [report, focusLine]);

  function viewImport(imp: StatementImport) {
    if (!imp.periodFrom || !imp.periodTo) {
      return void toast.error("This upload has no statement period recorded — pick the dates manually");
    }
    const range = { bankId: imp.bankAccountId, from: imp.periodFrom, to: imp.periodTo };
    setBankId(range.bankId);
    setFrom(range.from);
    setTo(range.to);
    setFilter("all");
    setFocusLine(null);
    reconcileRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    void runReport(range);
  }

  async function onFile(file: File | null) {
    setParsed(null);
    if (!file) {
      setFileName(null);
      return;
    }
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
      toast.error("Upload a .csv file. For Excel, open the file and Save As → CSV, or copy the rows and paste below.");
      setFileInputKey((k) => k + 1);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Statement file must be 5 MB or smaller");
      setFileInputKey((k) => k + 1);
      return;
    }
    setFileName(file.name);
    setRawText(await file.text());
  }

  async function verifyBank(bank: string, statement: ParsedStatement) {
    setBankCheck(null);
    setConfirmedBank(false);
    if (!statement.lines.length) return;
    setVerifying(true);
    try {
      const { data } = await api.post("/banking/statements/verify", {
        bankAccountId: bank,
        ...statement.identity,
        lines: statement.lines.slice(0, 500).map((l) => ({ utr: l.utr, amount: l.amount, direction: l.direction })),
      });
      if (!data.success) throw new Error(data.message);
      setBankCheck(data.data as BankVerifyResult);
    } catch (err) {
      toast.error(errMessage(err, "Could not verify the statement's bank"));
    } finally {
      setVerifying(false);
    }
  }

  async function preview() {
    if (!uploadBankId) return void toast.error("Select which company bank this statement belongs to");
    if (!rawText.trim()) return void toast.error("Choose a statement CSV file or paste the statement rows");
    const result = await parseStatement(rawText);
    setParsed(result);
    if (result.errors.length) toast.error(result.errors[0]!);
    await verifyBank(uploadBankId, result);
  }

  function switchUploadBank(id: string) {
    setUploadBankId(id);
    if (parsed) void verifyBank(id, parsed);
  }

  async function importParsed() {
    if (!uploadBankId) return void toast.error("Select which company bank this statement belongs to");
    if (!parsed?.lines.length) return void toast.error("Preview the statement first — no rows to import");
    if (bankCheck?.verdict === "blocked") return void toast.error(bankCheck.message);
    if (bankCheck?.verdict === "unverified" && !confirmedBank)
      return void toast.error("Tick “I confirm this statement is for the selected bank” before importing");
    setImporting(true);
    let imported = 0;
    let skipped = 0;
    let matched = 0;
    const dates = parsed.lines.map((l) => l.txnDate).sort();
    const range = { bankId: uploadBankId, from: dates[0]!, to: dates[dates.length - 1]! };
    let importId: string | undefined;
    try {
      for (let i = 0; i < parsed.lines.length; i += BATCH) {
        const { data } = await api.post(
          "/banking/statements/import",
          {
            bankAccountId: uploadBankId,
            lines: parsed.lines.slice(i, i + BATCH),
            importId,
            fileName,
            source: fileName ? "file" : "paste",
            periodFrom: range.from,
            periodTo: range.to,
            ...parsed.identity,
            confirmedBank,
          },
          { headers: { "Idempotency-Key": newKey() } },
        );
        if (!data.success) throw new Error(data.message);
        importId = data.data.importId ?? importId;
        imported += data.data.imported ?? 0;
        skipped += data.data.skipped ?? 0;
        matched += data.data.autoMatched ?? 0;
      }
      toast.success(`Imported ${imported} new line(s), ${skipped} already uploaded, ${matched} matched by UTR`);
      setBankId(range.bankId);
      setFrom(range.from);
      setTo(range.to);
      setParsed(null);
      setBankCheck(null);
      setRawText("");
      setFileName(null);
      setFileInputKey((k) => k + 1);
      await runReport(range);
    } catch (err) {
      toast.error(errMessage(err, "Statement import failed"));
    } finally {
      setImporting(false);
      void loadHistory();
    }
  }

  async function confirmMatch(row: ReconRow) {
    if (!row.line || !row.record) return;
    setBusyLine(row.line.id);
    try {
      await api.post("/banking/reconciliation/link", { lineId: row.line.id, journalId: row.record.journalId });
      toast.success("Match confirmed");
      void loadHistory();
      await runReport();
    } catch (err) {
      toast.error(errMessage(err, "Could not confirm the match"));
    } finally {
      setBusyLine(null);
    }
  }

  async function undoMatch(row: ReconRow) {
    if (!row.line) return;
    setBusyLine(row.line.id);
    try {
      await api.post("/banking/reconciliation/unlink", { lineId: row.line.id });
      toast.success("Match removed");
      void loadHistory();
      await runReport();
    } catch (err) {
      toast.error(errMessage(err, "Could not remove the match"));
    } finally {
      setBusyLine(null);
    }
  }

  const visibleRows = useMemo(() => {
    if (!report) return [];
    if (filter === "all") return report.rows;
    if (filter === "matched") return report.rows.filter((r) => r.kind === "matched");
    return report.rows.filter((r) => ATTENTION.includes(r.kind));
  }, [report, filter]);

  const previewTotals = useMemo(() => {
    if (!parsed?.lines.length) return null;
    const sum = (d: "CR" | "DR") =>
      parsed.lines.filter((l) => l.direction === d).reduce((acc, l) => acc + Number(l.amount), 0);
    const dates = parsed.lines.map((l) => l.txnDate).sort();
    return { credits: sum("CR"), debits: sum("DR"), first: dates[0]!, last: dates[dates.length - 1]! };
  }, [parsed]);

  const diff = report?.closingDifference ?? null;
  const balanced = diff !== null && Number(diff) === 0;
  const bankLabel = (b: BankAccount) =>
    `${b.bankName} ••${b.accountNumberLast4} (${b.purpose})${b.isActive ? "" : " — inactive"}`;

  return (
    <>
      <div className="space-y-5 p-4 md:p-5">
        <p className="text-sm" style={{ color: B.muted }}>
          Upload each bank&apos;s statement (daily, weekly or monthly) and match it line by line against AsanPay records.
          Anything that does not match is highlighted.
        </p>

        <section className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            1. Upload statement
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Statement of which bank? *">
              <select
                className={inputCls}
                style={inputStyle}
                value={uploadBankId}
                onChange={(e) => switchUploadBank(e.target.value)}
              >
                <option value="">Select bank account</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {bankLabel(b)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Statement file (CSV)"
              hint="Download the statement from net banking as CSV. Excel file? Open it and Save As → CSV, or copy the rows and paste below."
            >
              <input
                key={fileInputKey}
                type="file"
                accept=".csv,.txt,.tsv,text/csv"
                className="block w-full rounded-xl border border-dashed px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
                style={{ borderColor: B.border }}
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>

          <Field label="…or paste rows copied from Excel / the statement (include the header row)">
            <textarea
              className={`${inputCls} min-h-[110px] font-mono text-xs`}
              style={inputStyle}
              placeholder={"Txn Date\tDescription\tRef No.\tDebit\tCredit\tBalance\n14/09/2026\tUPI/392778526720/AJAY KUMAR\t392778526720\t\t4,990.00\t4,990.00"}
              value={fileName ? `Loaded from ${fileName}` : rawText}
              readOnly={!!fileName}
              onChange={(e) => {
                setRawText(e.target.value);
                setParsed(null);
              }}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void preview()}
              className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
              style={{ borderColor: B.border, color: B.blue }}
            >
              Preview
            </button>
            {fileName || rawText ? (
              <button
                type="button"
                onClick={() => {
                  setRawText("");
                  setFileName(null);
                  setParsed(null);
                  setBankCheck(null);
                  setFileInputKey((k) => k + 1);
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                style={{ background: B.danger }}
              >
                Clear
              </button>
            ) : null}
          </div>

          {parsed && parsed.lines.length > 0 && previewTotals ? (
            <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: B.border, background: "#F8FAFF" }}>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm" style={{ color: B.blue }}>
                <span>
                  <b>{parsed.lines.length}</b> transactions
                </span>
                <span>
                  {dmy(previewTotals.first)} to {dmy(previewTotals.last)}
                </span>
                <span style={{ color: "#15803D" }}>Credits {inr(String(previewTotals.credits))}</span>
                <span style={{ color: "#B91C1C" }}>Debits {inr(String(previewTotals.debits))}</span>
                {parsed.skippedRows ? (
                  <span style={{ color: B.muted }}>{parsed.skippedRows} non-transaction row(s) skipped</span>
                ) : null}
              </div>
              <p className="text-xs" style={{ color: B.muted }}>
                Columns detected: {parsed.columns.join(" · ")}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left" style={{ color: B.muted }}>
                      <th className="py-1 pr-3">Date</th>
                      <th className="py-1 pr-3 text-right">Amount</th>
                      <th className="py-1 pr-3">UTR</th>
                      <th className="py-1 pr-3">Narration</th>
                      <th className="py-1 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.lines.slice(0, 8).map((l) => (
                      <tr key={l.bankTxnId} className="border-t" style={{ borderColor: B.border }}>
                        <td className="py-1 pr-3">{dmy(l.txnDate)}</td>
                        <td
                          className="py-1 pr-3 text-right font-semibold"
                          style={{ color: l.direction === "CR" ? "#15803D" : "#B91C1C" }}
                        >
                          {signed(l.direction, l.amount)}
                        </td>
                        <td className="py-1 pr-3 font-mono">{l.utr ?? "—"}</td>
                        <td className="max-w-[420px] truncate py-1 pr-3" title={l.narration ?? ""}>
                          {l.narration ?? "—"}
                        </td>
                        <td className="py-1 text-right">{inr(l.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.lines.length > 8 ? (
                  <p className="mt-1 text-xs" style={{ color: B.muted }}>
                    …and {parsed.lines.length - 8} more
                  </p>
                ) : null}
              </div>
              <BankCheckBox
                check={bankCheck}
                verifying={verifying}
                confirmed={confirmedBank}
                onConfirm={setConfirmedBank}
                onSwitch={switchUploadBank}
              />
              <button
                type="button"
                disabled={
                  importing ||
                  verifying ||
                  !bankCheck ||
                  bankCheck.verdict === "blocked" ||
                  (bankCheck.verdict === "unverified" && !confirmedBank)
                }
                onClick={() => void importParsed()}
                className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                style={{ background: B.badgeGrad }}
              >
                <Upload size={14} /> {importing ? "Importing…" : `Import ${parsed.lines.length} lines & match`}
              </button>
            </div>
          ) : null}
        </section>

        <section
          ref={reconcileRef}
          className="scroll-mt-4 space-y-4 rounded-2xl border bg-white p-5"
          style={{ borderColor: B.border }}
        >
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            2. Reconcile
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <Field label="Bank">
                <select className={inputCls} style={inputStyle} value={bankId} onChange={(e) => setBankId(e.target.value)}>
                  <option value="">Select bank account</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {bankLabel(b)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="From">
              <input type="date" className={inputCls} style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className={inputCls} style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <button
              type="button"
              disabled={loading}
              onClick={() => void runReport()}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {loading ? "Checking…" : "Run reconciliation"}
            </button>
            {report ? <ExportMenu report={report} rows={visibleRows} /> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Today"],
                ["week", "This week"],
                ["month", "This month"],
                ["lastMonth", "Last month"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  const r = presetRange(key);
                  setFrom(r.from);
                  setTo(r.to);
                }}
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{ borderColor: B.border, color: B.blue }}
              >
                {label}
              </button>
            ))}
          </div>

          {report ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {TILE_ORDER.map((k) => (
                  <div
                    key={k}
                    className="rounded-xl border border-l-4 bg-white p-3"
                    style={{ borderColor: B.border, borderLeftColor: KIND_META[k].color }}
                  >
                    <p className="text-xs font-semibold" style={{ color: B.muted }}>
                      {KIND_META[k].label}
                    </p>
                    <p className="text-2xl font-bold" style={{ color: KIND_META[k].color }}>
                      {report.counts[k]}
                    </p>
                  </div>
                ))}
              </div>

              <div
                className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border p-4 text-sm"
                style={{
                  borderColor: diff === null ? B.border : balanced ? "#86EFAC" : "#FCA5A5",
                  background: diff === null ? "#F8FAFC" : balanced ? "#F0FDF4" : "#FEF2F2",
                }}
              >
                <span style={{ color: B.muted }}>
                  Statement closing <b style={{ color: B.blue }}>{inr(report.statement.closing)}</b>
                </span>
                <span style={{ color: B.muted }}>
                  Our closing <b style={{ color: B.blue }}>{inr(report.ours.closing)}</b>
                </span>
                <span style={{ color: B.muted }}>
                  Statement credits <b style={{ color: "#15803D" }}>{inr(report.statement.credits)}</b> · debits{" "}
                  <b style={{ color: "#B91C1C" }}>{inr(report.statement.debits)}</b>
                </span>
                {diff === null ? (
                  <span style={{ color: B.muted }}>
                    No balance column in this statement — closing balance cannot be compared
                  </span>
                ) : balanced ? (
                  <span className="inline-flex items-center gap-1 font-bold" style={{ color: "#15803D" }}>
                    <CheckCircle2 size={16} /> Balanced
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold" style={{ color: "#B91C1C" }}>
                    <XCircle size={16} /> Difference {inr(diff)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["attention", `Needs attention (${ATTENTION.reduce((n, k) => n + report.counts[k], 0)})`],
                    ["matched", `Matched (${report.counts.matched})`],
                    ["all", `All (${report.rows.length})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className="rounded-full px-3 py-1.5 text-xs font-bold"
                    style={
                      filter === key
                        ? { background: B.cta, color: "#fff" }
                        : { background: "#EEF2FF", color: B.blueLight }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase" style={{ color: B.muted }}>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Bank statement</th>
                      <th className="px-3 py-2">Our record</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center" style={{ color: B.muted }}>
                          {filter === "attention"
                            ? "Nothing needs attention for this period."
                            : "No statement lines or records in this period. Upload the statement first."}
                        </td>
                      </tr>
                    ) : (
                      visibleRows.map((r, i) => {
                        const meta = KIND_META[r.kind];
                        const busy = !!r.line && busyLine === r.line.id;
                        const focused = !!focusLine && r.line?.id === focusLine;
                        return (
                          <tr
                            key={`${r.line?.id ?? "x"}-${r.record?.journalId ?? "x"}-${i}`}
                            ref={focused ? focusRowRef : undefined}
                            className={`border-t align-top ${focused ? "recon-row-focus" : ""}`}
                            style={{
                              borderColor: B.border,
                              background: focused ? "#DBEAFE" : r.kind === "matched" ? undefined : `${meta.bg}80`,
                            }}
                          >
                            <td className="whitespace-nowrap px-3 py-2.5">{dmy(r.line?.date ?? r.record?.date ?? "")}</td>
                            <td className="px-3 py-2.5">
                              {r.line ? (
                                <>
                                  <p
                                    className="font-bold"
                                    style={{ color: r.line.direction === "CR" ? "#15803D" : "#B91C1C" }}
                                  >
                                    {signed(r.line.direction, r.line.amount)}
                                  </p>
                                  <p className="font-mono text-xs" style={{ color: B.muted }}>
                                    {r.line.utr ? `UTR ${r.line.utr}` : "No UTR"}
                                  </p>
                                  {r.line.narration ? (
                                    <p className="max-w-[360px] truncate text-xs" style={{ color: B.muted }} title={r.line.narration}>
                                      {r.line.narration}
                                    </p>
                                  ) : null}
                                </>
                              ) : (
                                <span style={{ color: B.muted }}>—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {r.record ? (
                                <>
                                  <p className="font-semibold" style={{ color: B.blue }}>
                                    {r.record.label}
                                  </p>
                                  <p className="text-xs" style={{ color: B.muted }}>
                                    {signed(r.record.direction, r.record.amount)}
                                    {r.record.party ? ` · ${r.record.party}` : ""}
                                    {r.record.date !== r.line?.date ? ` · ${dmy(r.record.date)}` : ""}
                                  </p>
                                  {r.record.utr ? (
                                    <p className="font-mono text-xs" style={{ color: B.muted }}>
                                      UTR {r.record.utr}
                                    </p>
                                  ) : null}
                                </>
                              ) : (
                                <span style={{ color: B.muted }}>—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <KindPill kind={r.kind} />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {r.kind === "possible" ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void confirmMatch(r)}
                                  className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                                  style={{ background: B.badgeGrad }}
                                >
                                  {busy ? "Saving…" : "Confirm match"}
                                </button>
                              ) : r.kind === "only_bank" && r.line ? (
                                <Link
                                  href={newEntryHref(report.bank.id, r.line)}
                                  className="inline-block rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                                  style={{ background: B.green }}
                                >
                                  Create bank entry
                                </Link>
                              ) : r.kind === "matched" && r.unlinkable ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void undoMatch(r)}
                                  className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                                  style={{ borderColor: "#FCA5A5", color: B.danger }}
                                >
                                  {busy ? "Saving…" : "Undo match"}
                                </button>
                              ) : r.kind === "mismatch" ? (
                                <span className="text-xs" style={{ color: meta.color }}>
                                  Same UTR, different amount — fix the record
                                </span>
                              ) : r.kind === "only_ours" ? (
                                <span className="text-xs" style={{ color: meta.color }}>
                                  Not on this statement — check date or bank
                                </span>
                              ) : r.kind === "suspense" ? (
                                <span className="text-xs" style={{ color: meta.color }}>
                                  Owner unknown — identify the sender
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: B.muted }}>
              Pick a bank and period, then Run reconciliation.
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              3. Upload history
            </h2>
            <p className="text-xs" style={{ color: B.muted }}>
              Every statement uploaded, newest first. Matched counts are live.
            </p>
          </div>
          {historyLoading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !history.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No statement uploaded yet. Uploads made before this history existed are not listed — use Reconcile with
              their dates.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase" style={{ color: B.muted }}>
                    <th className="px-3 py-2">Uploaded</th>
                    <th className="px-3 py-2">Bank</th>
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">Statement period</th>
                    <th className="px-3 py-2 text-right">Lines</th>
                    <th className="px-3 py-2">Match result</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t align-top" style={{ borderColor: B.border }}>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <p style={{ color: B.blue }}>{new Date(h.uploadedAt).toLocaleString("en-IN")}</p>
                        <p className="text-xs" style={{ color: B.muted }}>
                          By {h.importedBy ?? "—"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        <p>
                          {h.bankName} ••{h.last4}
                        </p>
                        {h.verification ? (
                          <p style={{ color: h.verification === "verified" ? "#15803D" : "#B45309" }}>
                            {h.verification === "verified"
                              ? `Verified${h.accountLast4 ? ` · statement ••${h.accountLast4}` : ""}`
                              : "Confirmed manually"}
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5 text-xs">
                        <p className="truncate" title={h.fileName ?? ""} style={{ color: B.blue }}>
                          {h.fileName ?? "Pasted rows"}
                        </p>
                        <p style={{ color: B.muted }}>{h.source === "file" ? "CSV file" : "Copy-paste"}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {h.periodFrom && h.periodTo ? `${dmy(h.periodFrom)} to ${dmy(h.periodTo)}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs">
                        <p className="font-semibold" style={{ color: B.blue }}>
                          {h.lineCount} in file
                        </p>
                        <p style={{ color: B.muted }}>
                          {h.newLines} new · {h.duplicates} already uploaded
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full px-2 py-0.5 font-bold" style={{ color: "#15803D", background: "#DCFCE7" }}>
                            {h.matched} matched
                          </span>
                          {h.unmatched ? (
                            <span className="rounded-full px-2 py-0.5 font-bold" style={{ color: "#B91C1C", background: "#FEE2E2" }}>
                              {h.unmatched} not matched
                            </span>
                          ) : null}
                          {h.suspense ? (
                            <span className="rounded-full px-2 py-0.5 font-bold" style={{ color: "#B45309", background: "#FEF3C7" }}>
                              {h.suspense} in suspense
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => viewImport(h)}
                          className="rounded-lg px-3 py-1.5 text-xs font-bold text-white transition hover:-translate-y-px active:scale-95"
                          style={{ background: B.badgeGrad }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
