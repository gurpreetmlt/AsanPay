"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { PromptModal } from "@/components/ui/PromptModal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { downloadBrandedExcel, openBrandedPdf, type BrandedReport, type ReportCell } from "@/lib/brandedExport";

type EntryStatus = "requested" | "approved" | "rejected";
type Direction = "credit" | "debit" | "none";

interface Category {
  value: string;
  label: string;
  direction: Direction;
  needsProvider: boolean;
}

interface BankAccount {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  purpose: string;
  isActive: boolean;
}

interface ProviderRow {
  id: string;
  code: string;
  name: string;
}

interface BankEntry {
  source: "bank_entry" | "fund_request";
  id: string;
  category: string;
  categoryLabel: string;
  direction: Direction;
  amount: string;
  txnDate: string;
  mode: string;
  utr: string | null;
  partyName: string | null;
  partyIfsc: string | null;
  partyAccountLast4: string | null;
  narration: string | null;
  hasAttachment: boolean;
  attachmentName: string | null;
  receiptUrl: string | null;
  bankAccountId: string | null;
  fundRequestId: string | null;
  isTest?: boolean;
  reversedAt?: string | null;
  reverseReason?: string | null;
  statement: {
    status: StatementStatus;
    line: { id: string; date: string; utr: string | null; narration: string | null; fileName: string | null } | null;
  };
  status: EntryStatus;
  requestedBy: string;
  requestedByName: string;
  approvedByName: string | null;
  decisionNote: string | null;
  journalId: string | null;
  requestedAt: string;
  decidedAt: string | null;
  bankName: string | null;
  bankLast4: string | null;
  providerName: string | null;
  agent: { name: string; uid: string; mobile: string; role: string } | null;
}

const MODES = [
  { value: "upi", label: "UPI" },
  { value: "imps", label: "IMPS" },
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

const MAX_PROOF_BYTES = 3 * 1024 * 1024;

const EMPTY_FORM = {
  category: "",
  bankAccountId: "",
  providerId: "",
  amount: "",
  txnDate: "",
  mode: "upi",
  utr: "",
  partyName: "",
  partyIfsc: "",
  partyAccountLast4: "",
  narration: "",
};

const GREEN = "#16A34A";
const RED = "#DC2626";

type StatementStatus = "matched" | "not_found" | "not_uploaded" | "pending" | "no_bank";

const STATEMENT_META: Record<StatementStatus, { label: string; color: string; bg: string; hint: string }> = {
  matched: { label: "Matched", color: "#15803D", bg: "#DCFCE7", hint: "Confirmed by the bank statement" },
  not_found: {
    label: "Not in statement",
    color: "#B91C1C",
    bg: "#FEE2E2",
    hint: "A statement for this date is uploaded, but this entry is not on it. Check the date, amount or bank.",
  },
  not_uploaded: {
    label: "Statement not uploaded",
    color: "#B45309",
    bg: "#FEF3C7",
    hint: "Upload this bank's statement for this date in the Reconciliation tab",
  },
  pending: { label: "Pending approval", color: "#64748B", bg: "#F1F5F9", hint: "Matched after the entry is approved" },
  no_bank: { label: "No company bank", color: "#64748B", bg: "#F1F5F9", hint: "Paid from the owner's personal account" },
};

export type OpenReconciliation = (q: { bankAccountId: string; date: string; lineId?: string }) => void;

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

function formatInr(amount: string) {
  const n = Number(amount);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function csvCell(v: string | null | undefined) {
  const s = v ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportFileName(from: string, to: string) {
  return `bank-entries${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}`;
}

function exportTable(rows: BankEntry[]) {
  const header = [
    "Entry ID",
    "Txn date",
    "Company bank",
    "Credit / Debit",
    "Category",
    "Amount (INR)",
    "Mode",
    "UTR / Reference",
    "Party name",
    "Party IFSC",
    "Party A/c last 4",
    "Agent role",
    "Agent UID",
    "Agent mobile",
    "API provider",
    "Narration",
    "Status",
    "Bank statement",
    "Statement line date",
    "Entered by",
    "Approved / rejected by",
    "Ledger journal",
    "Entered at",
  ];
  const body = rows.map((r) =>
    [
      r.id,
      formatDate(r.txnDate),
      r.bankName ? `${r.bankName} ••${r.bankLast4 ?? ""}` : "Owner personal account",
      r.direction === "none" ? "—" : r.direction === "credit" ? "Credit" : "Debit",
      r.categoryLabel,
      r.amount,
      r.mode.toUpperCase(),
      r.utr,
      r.partyName,
      r.partyIfsc,
      r.partyAccountLast4,
      r.agent?.role,
      r.agent?.uid,
      r.agent?.mobile,
      r.providerName,
      r.narration,
      r.status,
      STATEMENT_META[r.statement.status].label,
      r.statement.line ? formatDate(r.statement.line.date) : "",
      r.requestedByName,
      r.approvedByName,
      r.journalId,
      formatWhen(r.requestedAt),
    ].map((c) => c ?? ""),
  );
  return { header, body };
}

function downloadCsv(rows: BankEntry[], from: string, to: string) {
  const { header, body } = exportTable(rows);
  const lines = body.map((cells) => cells.map((c) => csvCell(c)).join(","));
  const blob = new Blob([`\uFEFF${[header.join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${exportFileName(from, to)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_TEXT: Record<EntryStatus, string> = {
  requested: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function buildReport(rows: BankEntry[], from: string, to: string, generatedBy: string, full: boolean): BrandedReport {
  const approved = rows.filter((r) => r.status === "approved");
  const credit = approved.filter((r) => r.direction === "credit").reduce((s, r) => s + Number(r.amount), 0);
  const debit = approved.filter((r) => r.direction === "debit").reduce((s, r) => s + Number(r.amount), 0);
  const pending = rows.filter((r) => r.status === "requested").length;
  const period = from || to ? `${from ? formatDate(from) : "Start"} to ${to ? formatDate(to) : "Today"}` : "All dates";
  const banks = [...new Set(rows.map((r) => (r.bankName ? `${r.bankName} ••${r.bankLast4 ?? ""}` : null)))]
    .filter(Boolean)
    .join(", ");

  const meta = [
    { label: "Period", value: period },
    { label: "Company bank(s)", value: banks || "—" },
    { label: "Generated on", value: new Date().toLocaleString("en-IN") },
    { label: "Generated by", value: generatedBy },
  ];
  const summary = [
    { label: "Entries", value: String(rows.length) },
    { label: "Approved credits", value: inr(credit), tone: "credit" as const },
    { label: "Approved debits", value: inr(debit), tone: "debit" as const },
    {
      label: "Net movement",
      value: inr(credit - debit),
      tone: credit - debit >= 0 ? ("credit" as const) : ("debit" as const),
    },
    { label: "Pending approval", value: String(pending) },
  ];
  const statusTone = (s: EntryStatus) => s as "approved" | "requested" | "rejected";
  const bankText = (r: BankEntry) => (r.bankName ? `${r.bankName} ••${r.bankLast4 ?? ""}` : "Owner personal account");
  const party = (r: BankEntry) =>
    r.agent
      ? { text: r.agent.name, sub: `${r.agent.role.replace(/_/g, " ")} · ${r.agent.uid} · ${r.agent.mobile}` }
      : {
          text: r.partyName ?? "—",
          sub:
            [r.partyIfsc, r.partyAccountLast4 ? `A/c ••${r.partyAccountLast4}` : null].filter(Boolean).join(" · ") ||
            undefined,
        };
  const amount = (r: BankEntry, dir: Direction): ReportCell =>
    r.direction === dir
      ? { text: inr(Number(r.amount)), tone: dir === "credit" ? "credit" : "debit", align: "right" }
      : { text: "", align: "right" };

  if (!full) {
    return {
      title: "Bank Entries Register",
      fileName: exportFileName(from, to),
      meta,
      summary,
      columns: [
        { label: "#", width: "5%" },
        { label: "Txn date", width: "8%" },
        { label: "Company bank", width: "11%" },
        { label: "Category / narration", width: "15%" },
        { label: "Party / agent", width: "13%" },
        { label: "UTR / mode", width: "12%" },
        { label: "Credit (₹)", align: "right", width: "9%" },
        { label: "Debit (₹)", align: "right", width: "9%" },
        { label: "Status", align: "center", width: "7%" },
        { label: "Bank statement", width: "9%" },
        { label: "Approved by / journal", width: "10%" },
      ],
      rows: rows.map((r) => [
        { text: r.id, mono: true },
        { text: formatDate(r.txnDate) },
        { text: bankText(r), sub: r.providerName ?? undefined },
        { text: r.categoryLabel, sub: r.narration ?? undefined },
        party(r),
        { text: r.utr ?? "—", sub: r.mode.toUpperCase(), mono: true },
        amount(r, "credit"),
        amount(r, "debit"),
        { text: STATUS_TEXT[r.status], tone: statusTone(r.status), align: "center" },
        {
          text: STATEMENT_META[r.statement.status].label,
          sub: r.statement.line ? `Line ${formatDate(r.statement.line.date)}` : undefined,
          tone: r.statement.status === "matched" ? "approved" : r.statement.status === "not_found" ? "rejected" : "muted",
        },
        { text: r.approvedByName ?? "—", sub: r.journalId ? `J#${r.journalId}` : undefined },
      ]),
    };
  }

  const { header, body } = exportTable(rows);
  return {
    title: "Bank Entries Register",
    fileName: exportFileName(from, to),
    meta,
    summary,
    columns: header.map((label) => ({ label, align: label === "Amount (INR)" ? ("right" as const) : undefined })),
    rows: body.map((cells, i) =>
      cells.map((text, c): ReportCell => {
        const r = rows[i]!;
        if (header[c] === "Amount (INR)")
          return { text, align: "right", tone: r.direction === "debit" ? "debit" : "credit" };
        if (header[c] === "Status") return { text: STATUS_TEXT[r.status], tone: statusTone(r.status) };
        if (header[c] === "UTR / Reference" || header[c] === "Agent mobile" || header[c] === "Party A/c last 4") {
          return { text, mono: true };
        }
        return { text };
      }),
    ),
  };
}

function ExportMenu({ rows, from, to }: { rows: BankEntry[]; from: string; to: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const generatedBy = useAuthStore((s) => s.user?.name) ?? "AsanPay Admin";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
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
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={14} /> Export <ChevronDown size={14} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-xl border bg-white shadow-lg"
          style={{ borderColor: B.border }}
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            style={{ color: B.blue }}
            onClick={() => {
              setOpen(false);
              if (!openBrandedPdf(buildReport(rows, from, to, generatedBy, false))) {
                toast.error("Allow pop-ups for this site to export the PDF");
              }
            }}
          >
            <FileText size={14} style={{ color: "#DC2626" }} /> PDF
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            style={{ color: B.blue }}
            onClick={() => {
              setOpen(false);
              downloadBrandedExcel(buildReport(rows, from, to, generatedBy, true));
            }}
          >
            <FileSpreadsheet size={14} style={{ color: "#16A34A" }} /> Excel
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            style={{ color: B.blue }}
            onClick={() => {
              setOpen(false);
              downloadCsv(rows, from, to);
            }}
          >
            <FileSpreadsheet size={14} style={{ color: B.muted }} /> CSV (plain, for import)
          </button>
        </div>
      ) : null}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the proof file"));
    reader.readAsDataURL(file);
  });
}

export function BankEntriesPanel({ onOpenReconciliation }: { onOpenReconciliation?: OpenReconciliation } = {}) {
  const me = useAuthStore((s) => s.user);
  const [showForm, setShowForm] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [rows, setRows] = useState<BankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [proof, setProof] = useState<File | null>(null);

  useEffect(() => {
    if (!showForm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setShowForm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm, saving]);
  const [proofInputKey, setProofInputKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"" | EntryStatus>("");
  const [statementFilter, setStatementFilter] = useState<"" | "matched" | "unmatched">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [approveRow, setApproveRow] = useState<BankEntry | null>(null);
  const [rejectRow, setRejectRow] = useState<BankEntry | null>(null);
  const [voidRow, setVoidRow] = useState<BankEntry | null>(null);
  const [testRow, setTestRow] = useState<BankEntry | null>(null);
  const [canSelfApprove, setCanSelfApprove] = useState(false);

  const visibleRows = useMemo(() => {
    if (statementFilter === "matched") return rows.filter((r) => r.statement.status === "matched");
    if (statementFilter === "unmatched") {
      return rows.filter((r) => r.statement.status === "not_found" || r.statement.status === "not_uploaded");
    }
    return rows;
  }, [rows, statementFilter]);

  const loadLookups = useCallback(async () => {
    try {
      const [cats, bankList, providerList, policy] = await Promise.all([
        fetchApi<Category[]>("/admin/bank-entries/categories"),
        fetchApi<BankAccount[]>("/banking/accounts", { purpose: "all" }),
        fetchApi<ProviderRow[]>("/float/providers"),
        fetchApi<{ canSelfApprove: boolean }>("/admin/bank-entries/approval-policy"),
      ]);
      setCategories(cats);
      setCanSelfApprove(policy.canSelfApprove);
      setBanks(bankList);
      setProviders(providerList);
    } catch (err) {
      toast.error(errMessage(err, "Could not load bank accounts and categories"));
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "2000" };
      if (statusFilter) params.status = statusFilter;
      if (from) params.from = from;
      if (to) params.to = to;
      setRows(await fetchApi<BankEntry[]>("/admin/bank-entries", params));
    } catch (err) {
      toast.error(errMessage(err, "Could not load bank entries"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, from, to]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("fromStatement") !== "1") return;
    setForm({
      ...EMPTY_FORM,
      bankAccountId: q.get("bankAccountId") ?? "",
      amount: q.get("amount") ?? "",
      txnDate: q.get("txnDate") ?? "",
      utr: q.get("utr") ?? "",
      narration: q.get("narration") ?? "",
    });
    const dir = q.get("direction") === "debit" ? "money out (debit)" : "money in (credit)";
    setShowForm(true);
    toast(`Filled from the bank statement line. Pick the ${dir} category, then submit.`, { duration: 6000 });
    for (const k of ["fromStatement", "bankAccountId", "amount", "txnDate", "utr", "narration", "direction"]) q.delete(k);
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const category = categories.find((c) => c.value === form.category);
  const noBank = category?.direction === "none";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!category) return void toast.error("Select a category");
    if (!noBank && !form.bankAccountId) return void toast.error("Select the company bank account");
    if (category.needsProvider && !form.providerId) return void toast.error("Select the API provider");
    if (!/^\d+(\.\d{1,2})?$/.test(form.amount) || Number(form.amount) <= 0) {
      return void toast.error("Amount must be a rupee amount greater than zero, e.g. 4990");
    }
    if (!form.txnDate) return void toast.error("Enter the transaction date");
    if (form.partyIfsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(form.partyIfsc)) {
      return void toast.error("Enter a valid 11-character IFSC, e.g. HDFC0001344");
    }
    if (form.partyAccountLast4 && !/^\d{4}$/.test(form.partyAccountLast4)) {
      return void toast.error("Enter only the last 4 digits of the account number");
    }
    if (!proof) {
      return void toast.error("Upload proof — a bank statement screenshot, receipt photo or PDF is required");
    }
    if (proof.size > MAX_PROOF_BYTES) return void toast.error("Proof file must be 3 MB or smaller");

    setSaving(true);
    try {
      const attachmentDataUrl = proof ? await readFileAsDataUrl(proof) : null;
      await api.post("/admin/bank-entries", {
        category: form.category,
        bankAccountId: noBank ? null : form.bankAccountId,
        providerId: category.needsProvider ? form.providerId : null,
        amount: form.amount,
        txnDate: form.txnDate,
        mode: form.mode,
        utr: form.utr.trim() || null,
        partyName: form.partyName.trim() || null,
        partyIfsc: form.partyIfsc.trim() || null,
        partyAccountLast4: form.partyAccountLast4.trim() || null,
        narration: form.narration.trim() || null,
        attachmentName: proof?.name ?? null,
        attachmentDataUrl,
      });
      toast.success("Bank entry saved — approve it to post to the ledger");
      setShowForm(false);
      setForm(EMPTY_FORM);
      setProof(null);
      setProofInputKey((k) => k + 1);
      await loadRows();
    } catch (err) {
      toast.error(errMessage(err, "Could not save the bank entry"));
    } finally {
      setSaving(false);
    }
  }

  async function approve(row: BankEntry) {
    setDecidingId(row.id);
    try {
      await api.post(`/admin/bank-entries/${row.id}/approve`, {});
      toast.success("Bank entry approved and posted to the ledger");
      setApproveRow(null);
      await loadRows();
    } catch (err) {
      toast.error(errMessage(err, "Could not approve the bank entry"));
    } finally {
      setDecidingId(null);
    }
  }

  async function reject(row: BankEntry, note: string) {
    setDecidingId(row.id);
    try {
      await api.post(`/admin/bank-entries/${row.id}/reject`, { note });
      toast.success("Bank entry rejected");
      setRejectRow(null);
      await loadRows();
    } catch (err) {
      toast.error(errMessage(err, "Could not reject the bank entry"));
    } finally {
      setDecidingId(null);
    }
  }

  async function voidFundRequest(row: BankEntry, reason: string) {
    if (!row.fundRequestId) return;
    setDecidingId(row.id);
    try {
      await api.post(`/fund-requests/${row.fundRequestId}/void`, { reason });
      toast.success(`Test entry deleted — ${formatInr(row.amount)} taken back from the agent's wallet`);
      setVoidRow(null);
      await loadRows();
    } catch (err) {
      toast.error(errMessage(err, "Could not delete the test entry"));
    } finally {
      setDecidingId(null);
    }
  }

  async function addReceipt(row: BankEntry, file: File) {
    if (!/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(file.type)) {
      return void toast.error("Receipt must be a PNG, JPG, WEBP image or a PDF");
    }
    if (file.size > MAX_PROOF_BYTES) return void toast.error("Receipt file must be 3 MB or smaller");
    setDecidingId(row.id);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await api.post(`/admin/bank-entries/${row.id}/receipt`, { attachmentName: file.name, attachmentDataUrl: dataUrl });
      toast.success("Receipt added — this entry can be approved now");
      await loadRows();
    } catch (err) {
      toast.error(errMessage(err, "Could not upload the receipt"));
    } finally {
      setDecidingId(null);
    }
  }

  async function setTestMark(row: BankEntry, isTest: boolean) {
    if (!row.fundRequestId) return;
    setDecidingId(row.id);
    try {
      await api.post(`/fund-requests/${row.fundRequestId}/test`, { isTest });
      toast.success(isTest ? "Marked as test entry — Delete is now available" : "Test mark removed");
      setTestRow(null);
      await loadRows();
    } catch (err) {
      toast.error(errMessage(err, "Could not update the test mark"));
    } finally {
      setDecidingId(null);
    }
  }

  async function viewProof(row: BankEntry) {
    try {
      const { dataUrl } = await fetchApi<{ name: string | null; dataUrl: string }>(
        `/admin/bank-entries/${row.id}/attachment`,
      );
      const blob = await (await fetch(dataUrl)).blob();
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (err) {
      toast.error(errMessage(err, "Could not open the proof file"));
    }
  }

  const set = (k: keyof typeof EMPTY_FORM) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <div className="space-y-4 p-4 md:p-5">
        {showForm ? (
          <div
            className="bank-entry-backdrop fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-[2px] md:p-6"
            onClick={() => !saving && setShowForm(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-bank-entry-title"
              className="bank-entry-modal flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4 md:px-6" style={{ borderColor: B.border }}>
            <div>
              <h2 id="new-bank-entry-title" className="text-lg font-bold" style={{ color: B.blue }}>
                New bank entry
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
                Nothing reaches the ledger until the entry is approved.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              disabled={saving}
              onClick={() => setShowForm(false)}
              className="rounded-lg p-1.5 transition hover:rotate-90 hover:bg-red-50 disabled:opacity-50"
              style={{ color: RED }}
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 md:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" required>
              <select
                className={inputCls}
                style={inputStyle}
                value={form.category}
                onChange={(e) => set("category")(e.target.value)}
              >
                <option value="">Select category</option>
                <optgroup label="Money in (credit)">
                  {categories
                    .filter((c) => c.direction === "credit")
                    .map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Money out (debit)">
                  {categories
                    .filter((c) => c.direction === "debit")
                    .map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Outside company bank">
                  {categories
                    .filter((c) => c.direction === "none")
                    .map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                </optgroup>
              </select>
            </Field>

            <Field
              label="Company bank account"
              required={!noBank}
              hint={noBank ? "Not needed — paid from the owner's personal account" : undefined}
            >
              <select
                className={inputCls}
                style={inputStyle}
                value={noBank ? "" : form.bankAccountId}
                disabled={noBank}
                onChange={(e) => set("bankAccountId")(e.target.value)}
              >
                <option value="">Select bank account</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} ••{b.accountNumberLast4} ({b.purpose}){b.isActive ? "" : " — inactive"}
                  </option>
                ))}
              </select>
            </Field>

            {category?.needsProvider ? (
              <Field label="API provider" required>
                <select
                  className={inputCls}
                  style={inputStyle}
                  value={form.providerId}
                  onChange={(e) => set("providerId")(e.target.value)}
                >
                  <option value="">Select provider</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Amount (₹)" required>
              <input
                className={inputCls}
                style={inputStyle}
                inputMode="decimal"
                placeholder="e.g. 4990"
                value={form.amount}
                onChange={(e) => set("amount")(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </Field>

            <Field label="Transaction date" required>
              <input
                type="date"
                className={inputCls}
                style={inputStyle}
                value={form.txnDate}
                onChange={(e) => set("txnDate")(e.target.value)}
              />
            </Field>

            <Field label="Mode" required>
              <select
                className={inputCls}
                style={inputStyle}
                value={form.mode}
                onChange={(e) => set("mode")(e.target.value)}
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="UTR / reference no." hint="12-digit number after UPI/ in the statement">
              <input
                className={`${inputCls} font-mono`}
                style={inputStyle}
                placeholder="e.g. 392778526720"
                value={form.utr}
                onChange={(e) => set("utr")(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
              />
            </Field>

            <Field label={category?.direction === "debit" ? "Paid to (name)" : "Received from (name)"}>
              <input
                className={inputCls}
                style={inputStyle}
                placeholder="e.g. AJAY KUMAR"
                value={form.partyName}
                onChange={(e) => set("partyName")(e.target.value)}
              />
            </Field>

            <Field label="Their bank IFSC">
              <input
                className={`${inputCls} font-mono uppercase placeholder:normal-case`}
                style={inputStyle}
                placeholder="e.g. HDFC0001344"
                maxLength={11}
                value={form.partyIfsc}
                onChange={(e) => set("partyIfsc")(e.target.value.toUpperCase())}
              />
            </Field>

            <Field label="Their A/c last 4 digits">
              <input
                className={`${inputCls} font-mono`}
                style={inputStyle}
                placeholder="e.g. 1400"
                inputMode="numeric"
                maxLength={4}
                value={form.partyAccountLast4}
                onChange={(e) => set("partyAccountLast4")(e.target.value.replace(/\D/g, ""))}
              />
            </Field>

            <ProofPicker
              key={proofInputKey}
              file={proof}
              onChange={(f) => {
                if (f && f.size > MAX_PROOF_BYTES) {
                  toast.error("Proof file must be 3 MB or smaller");
                  return;
                }
                setProof(f);
              }}
            />
          </div>

          <Field label="Statement narration (optional)" hint="Copy the full description line from the bank statement">
            <textarea
              className={inputCls}
              style={inputStyle}
              rows={2}
              maxLength={500}
              placeholder="e.g. HDFC0001344/AJAY KUMAR/XXXXX71400/7837571400-2@ybl/UPI/392778526720/Payment from PhonePe"
              value={form.narration}
              onChange={(e) => set("narration")(e.target.value)}
            />
          </Field>
          </div>

          <div
            className="flex items-center justify-end gap-2 border-t bg-slate-50/70 px-5 py-3.5 md:px-6"
            style={{ borderColor: B.border }}
          >
            <button
              type="button"
              disabled={saving}
              onClick={() => setShowForm(false)}
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-red-50 active:scale-95 disabled:opacity-50"
              style={{ borderColor: "#FCA5A5", color: RED }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-px hover:shadow-lg active:scale-95 disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Saving…" : "Submit for approval"}
            </button>
          </div>
        </form>
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mr-auto inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
              style={{ background: GREEN }}
            >
              <Plus size={15} /> New bank entry
            </button>
            <Field label="Status">
              <select
                className={inputCls}
                style={inputStyle}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "" | EntryStatus)}
              >
                <option value="">All</option>
                <option value="requested">Pending approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </Field>
            <Field label="Bank statement">
              <select
                className={inputCls}
                style={inputStyle}
                value={statementFilter}
                onChange={(e) => setStatementFilter(e.target.value as "" | "matched" | "unmatched")}
              >
                <option value="">All</option>
                <option value="matched">Matched</option>
                <option value="unmatched">Not matched</option>
              </select>
            </Field>
            <Field label="From date">
              <input
                type="date"
                className={inputCls}
                style={inputStyle}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To date">
              <input
                type="date"
                className={inputCls}
                style={inputStyle}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <ExportMenu rows={visibleRows} from={from} to={to} />
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !visibleRows.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No bank entries match this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="py-2 pr-3 font-semibold">Date</th>
                    <th className="py-2 pr-3 font-semibold">Category</th>
                    <th className="py-2 pr-3 font-semibold">Amount</th>
                    <th className="py-2 pr-3 font-semibold">Bank</th>
                    <th className="py-2 pr-3 font-semibold">Party</th>
                    <th className="py-2 pr-3 font-semibold">Bank statement</th>
                    <th className="py-2 pr-3 font-semibold">UTR / mode</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const mine = !canSelfApprove && me?.id && r.requestedBy === me.id;
                    const busy = decidingId === r.id;
                    return (
                      <tr key={r.id} className="border-b align-top last:border-0" style={{ borderColor: B.border }}>
                        <td className="py-3 pr-3 whitespace-nowrap">{formatDate(r.txnDate)}</td>
                        <td className="py-3 pr-3">
                          <div className="font-semibold" style={{ color: B.blue }}>
                            {r.categoryLabel}
                          </div>
                          {r.source === "fund_request" ? (
                            <Link
                              href="/treasury/bank?tab=fund-requests"
                              className="mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                              style={{ background: "rgba(42,92,221,0.1)", color: "#2A5CDD" }}
                            >
                              From fund requests
                            </Link>
                          ) : null}
                          {r.providerName ? (
                            <div className="text-xs" style={{ color: B.muted }}>
                              {r.providerName}
                            </div>
                          ) : null}
                          {r.narration ? (
                            <div className="mt-1 max-w-[260px] break-words text-[11px]" style={{ color: B.muted }}>
                              {r.narration}
                            </div>
                          ) : null}
                        </td>
                        <td
                          className="py-3 pr-3 whitespace-nowrap font-bold tabular-nums"
                          style={{ color: r.direction === "debit" ? RED : r.direction === "credit" ? GREEN : B.blue }}
                        >
                          {r.direction === "debit" ? "− " : r.direction === "credit" ? "+ " : ""}
                          {formatInr(r.amount)}
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          {r.bankName ? `${r.bankName} ••${r.bankLast4 ?? ""}` : "Owner personal account"}
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          <div className="font-semibold">{r.partyName ?? "—"}</div>
                          {r.agent ? (
                            <div style={{ color: B.muted }}>
                              {r.agent.role} · <span className="font-mono">{r.agent.uid}</span> · {r.agent.mobile}
                            </div>
                          ) : null}
                          {r.partyIfsc || r.partyAccountLast4 ? (
                            <div className="font-mono" style={{ color: B.muted }}>
                              {r.partyIfsc ?? ""} {r.partyAccountLast4 ? `••${r.partyAccountLast4}` : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          {r.reversedAt ? (
                            <span style={{ color: B.muted }}>—</span>
                          ) : (
                            <StatementCell row={r} onOpen={onOpenReconciliation} />
                          )}
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          <div className="font-mono">{r.utr ?? "—"}</div>
                          <div style={{ color: B.muted }}>{r.mode.toUpperCase()}</div>
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          {r.reversedAt ? (
                            <span
                              className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
                              style={{ color: "#475569", background: "#E2E8F0" }}
                              title={r.reverseReason ?? undefined}
                            >
                              Reversed
                            </span>
                          ) : (
                            <StatusPill status={r.status} />
                          )}
                          {r.reversedAt && r.reverseReason ? (
                            <div className="mt-1 max-w-[200px]" style={{ color: B.muted }}>
                              {r.reverseReason}
                            </div>
                          ) : null}
                          <div className="mt-1" style={{ color: B.muted }}>
                            By {r.requestedByName}
                          </div>
                          {r.approvedByName ? (
                            <div style={{ color: B.muted }}>
                              {r.status === "rejected" ? "Rejected" : "Approved"} by {r.approvedByName}
                            </div>
                          ) : null}
                          {r.decisionNote ? (
                            <div className="mt-1 max-w-[200px]" style={{ color: RED }}>
                              {r.decisionNote}
                            </div>
                          ) : null}
                          {r.journalId ? (
                            <div className="font-mono text-[11px]" style={{ color: B.muted }}>
                              J#{r.journalId}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            {r.hasAttachment ? (
                              <button
                                type="button"
                                onClick={() => void viewProof(r)}
                                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold"
                                style={{ borderColor: B.border, color: B.blue }}
                              >
                                {r.attachmentName?.toLowerCase().endsWith(".pdf") ? (
                                  <FileText size={13} />
                                ) : (
                                  <Paperclip size={13} />
                                )}
                                Proof
                              </button>
                            ) : null}
                            {r.receiptUrl ? (
                              <a
                                href={r.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold"
                                style={{ borderColor: B.border, color: B.blue }}
                              >
                                <FileText size={13} /> Receipt
                              </a>
                            ) : null}
                            {r.source === "fund_request" && r.fundRequestId && !r.isTest ? (
                              <button
                                type="button"
                                disabled={busy}
                                title="Mark as a test entry so it can be deleted"
                                onClick={() => setTestRow(r)}
                                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold disabled:opacity-40"
                                style={{ borderColor: "#FCD34D", color: "#B45309", background: "#FFFBEB" }}
                              >
                                <FlaskConical size={13} /> Mark test
                              </button>
                            ) : null}
                            {r.source === "fund_request" && r.fundRequestId && r.isTest ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  title="Remove the test mark"
                                  onClick={() => void setTestMark(r, false)}
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold disabled:opacity-40"
                                  style={{ color: "#B45309", background: "#FEF3C7" }}
                                >
                                  <FlaskConical size={12} /> Test
                                  <X size={11} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  title="Delete this test entry (the credit is reversed)"
                                  onClick={() => setVoidRow(r)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                  style={{ background: RED }}
                                >
                                  <Trash2 size={13} /> Delete
                                </button>
                              </>
                            ) : null}
                            {r.source === "bank_entry" && r.status === "requested" ? (
                              <>
                                {!r.hasAttachment ? (
                                  <>
                                    <span
                                      className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold"
                                      style={{ color: "#B45309", background: "#FEF3C7" }}
                                    >
                                      Receipt missing
                                    </span>
                                    <label
                                      className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-white ${busy ? "pointer-events-none opacity-40" : ""}`}
                                      style={{ background: GREEN }}
                                      title="Upload the receipt for this entry (image or PDF, max 3 MB)"
                                    >
                                      <Upload size={13} /> Add receipt
                                      <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,application/pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          e.target.value = "";
                                          if (f) void addReceipt(r, f);
                                        }}
                                      />
                                    </label>
                                  </>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={!!mine || busy || !r.hasAttachment}
                                  title={
                                    !r.hasAttachment
                                      ? "Add the receipt first — approve unlocks after upload"
                                      : mine
                                        ? "Another admin must approve your entry"
                                        : undefined
                                  }
                                  onClick={() => setApproveRow(r)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                  style={{ background: GREEN }}
                                >
                                  <Check size={13} /> Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={!!mine || busy}
                                  title={mine ? "Another admin must decide your entry" : undefined}
                                  onClick={() => setRejectRow(r)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                  style={{ background: RED }}
                                >
                                  <X size={13} /> Reject
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {approveRow ? (
        <ConfirmModal
          title="Approve bank entry?"
          message={
            <>
              {approveRow.categoryLabel} of {formatInr(approveRow.amount)} on {formatDate(approveRow.txnDate)}
              {approveRow.utr ? ` (UTR ${approveRow.utr})` : ""} will be posted to the ledger.
              {me?.id && approveRow.requestedBy === me.id ? (
                <span className="mt-2 block font-semibold" style={{ color: "#B45309" }}>
                  You created this entry. Check the amount, date and UTR against the bank statement before approving —
                  there is no second admin to review it.
                </span>
              ) : null}
            </>
          }
          confirmLabel="Approve"
          tone="info"
          busy={decidingId !== null}
          onConfirm={() => void approve(approveRow)}
          onClose={() => {
            if (!decidingId) setApproveRow(null);
          }}
        />
      ) : null}

      {rejectRow ? (
        <PromptModal
          title="Reject bank entry?"
          message="The admin who entered it will see this note."
          presets={[
            "Amount does not match the statement",
            "UTR not found in the bank statement",
            "Wrong bank account selected",
            "Duplicate entry",
            "Receipt unclear or missing",
            "Other",
          ]}
          placeholder="Add details for the admin who entered it"
          multiline
          tone="danger"
          confirmLabel="Reject"
          busy={decidingId !== null}
          onConfirm={(v) => void reject(rejectRow, v)}
          onClose={() => {
            if (!decidingId) setRejectRow(null);
          }}
        />
      ) : null}

      {testRow ? (
        <ConfirmModal
          title="Mark as test entry?"
          message={
            <>
              {formatInr(testRow.amount)} credited to {testRow.partyName ?? "the agent"} on {formatDate(testRow.txnDate)}
              {testRow.utr ? ` (UTR ${testRow.utr})` : ""} will be tagged as a test. Nothing moves yet — a Delete
              button appears on the row. Only mark entries that were never real money.
            </>
          }
          confirmLabel="Mark as test"
          tone="info"
          busy={decidingId !== null}
          onConfirm={() => void setTestMark(testRow, true)}
          onClose={() => {
            if (!decidingId) setTestRow(null);
          }}
        />
      ) : null}

      {voidRow ? (
        <PromptModal
          title="Delete this test entry?"
          message={
            <>
              {formatInr(voidRow.amount)} credited to {voidRow.partyName ?? "the agent"} on {formatDate(voidRow.txnDate)}{" "}
              will be taken back from their wallet and removed from the bank balance. The matched statement line goes
              back to unmatched. The entry disappears from Bank entries and stays in the audit trail under Fund
              requests → Deleted. This cannot be undone.
            </>
          }
          label="Reason"
          initialValue="Test entry"
          placeholder="e.g. Test entry"
          minLength={5}
          tone="danger"
          confirmLabel="Delete"
          busy={decidingId !== null}
          busyLabel="Deleting…"
          onConfirm={(v) => void voidFundRequest(voidRow, v)}
          onClose={() => {
            if (!decidingId) setVoidRow(null);
          }}
        />
      ) : null}
    </>
  );
}

const inputCls = "w-full rounded-xl border px-3 py-2.5 text-sm";
const inputStyle = { borderColor: B.border };

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: B.muted }}>
        {label}
        {required ? <span style={{ color: RED }}> *</span> : null}
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

function StatementCell({ row, onOpen }: { row: BankEntry; onOpen?: OpenReconciliation }) {
  const { status, line } = row.statement;
  const meta = STATEMENT_META[status];
  const canOpen = !!onOpen && !!row.bankAccountId && (status === "matched" || status === "not_found");
  const pill = (
    <span
      className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ color: meta.color, background: meta.bg }}
    >
      {status === "matched" ? "✓ " : ""}
      {meta.label}
      {canOpen ? <ArrowUpRight className="link-pill__arrow h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
    </span>
  );
  return (
    <div className="max-w-[200px]" title={meta.hint}>
      {canOpen ? (
        <button
          type="button"
          onClick={() =>
            onOpen!({ bankAccountId: row.bankAccountId!, date: line?.date ?? row.txnDate, lineId: line?.id })
          }
          className="link-pill rounded-full"
          title={status === "matched" ? "Open this line in Reconciliation" : "Open Reconciliation for this date"}
        >
          {pill}
        </button>
      ) : (
        pill
      )}
      {line ? (
        <>
          <div className="mt-1" style={{ color: B.muted }}>
            Line {formatDate(line.date)}
            {line.utr ? <span className="font-mono"> · …{line.utr.slice(-6)}</span> : null}
          </div>
          {line.fileName ? (
            <div className="truncate text-[10px]" style={{ color: B.muted }} title={line.fileName}>
              {line.fileName}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// Not wrapped in <label>: a button inside a label re-triggers the file dialog on some browsers.
function ProofPicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: B.muted }}>
        Proof <span style={{ color: RED }}>*</span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: B.border }}>
          {file.type === "application/pdf" ? <FileText size={16} /> : <Paperclip size={16} />}
          <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>
            {file.name}
          </span>
          <span className="text-[11px]" style={{ color: B.muted }}>
            {(file.size / 1024).toFixed(0)} KB
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg p-1 text-white"
            style={{ background: RED }}
            aria-label="Remove proof"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-2 text-sm font-semibold"
          style={{ borderColor: B.border, color: B.blue }}
        >
          <Upload size={15} /> Upload proof
        </button>
      )}
      <span className="mt-1 block text-[11px]" style={{ color: B.muted }}>
        Statement screenshot or PDF, max 3 MB
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: EntryStatus }) {
  const style =
    status === "approved"
      ? { background: "rgba(22,163,74,0.12)", color: "#15803d" }
      : status === "rejected"
      ? { background: "rgba(185,28,28,0.1)", color: "#b91c1c" }
      : { background: "rgba(234,179,8,0.15)", color: "#a16207" };
  return (
    <span className="rounded-lg px-2 py-1 text-xs font-semibold" style={style}>
      {status === "requested" ? "Pending approval" : status === "approved" ? "Approved" : "Rejected"}
    </span>
  );
}
