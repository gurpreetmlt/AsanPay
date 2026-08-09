"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  Banknote,
  Building2,
  Check,
  ClipboardList,
  Copy,
  FileUp,
  Info,
  Landmark,
  RefreshCcw,
  Wallet,
  Zap,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "react-hot-toast";
import api, { fetchApi } from "@/lib/api";
import { extractApiError } from "@/lib/onboarding";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { B } from "@/lib/brand";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

interface BankAccount {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  ifsc: string;
  isActive?: boolean;
}

interface MyVan {
  id: string;
  vanNumber: string | null;
  vpa: string | null;
  status: string;
  bankAccountId: string;
  bankName: string;
  ifsc: string;
}

export interface FundRequestRow {
  id: string;
  amount: string;
  paymentMode: string;
  referenceNumber: string | null;
  status: string;
  displayStatus: string;
  submittedAt: string;
  creditedAmount: string | null;
}

const AMOUNT_PRESETS = ["500", "1000", "2000", "5000"];

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toOffsetIso(localValue: string): string {
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid deposit date/time");
  return d.toISOString();
}

const formatInr = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : `₹${v}`;
};

type TabId = "upi" | "bank" | "cashClaim" | "ecollect" | "history";
type PaymentMode = "upi" | "neft" | "cash_deposit";

const TABS: {
  id: TabId;
  label: string;
  icon: typeof Wallet;
  mode?: PaymentMode;
  headline: string;
  subtext: string;
}[] = [
  {
    id: "upi",
    label: "UPI",
    icon: Wallet,
    mode: "upi",
    headline: "UPI Deposit",
    subtext: "Scan the QR or pay to your UPI ID, then attach the payment screenshot below.",
  },
  {
    id: "bank",
    label: "Bank Account Transfer",
    icon: Landmark,
    mode: "neft",
    headline: "Bank Account Transfer",
    subtext: "Transfer from your bank to the AsanPay account below, then submit UTR and receipt.",
  },
  {
    id: "cashClaim",
    label: "Deposit Cash & Claim",
    icon: Building2,
    mode: "cash_deposit",
    headline: "Deposit Cash & Claim",
    subtext: "Deposit cash at the bank branch, then upload the slip — credit after verification (15–60 min).",
  },
  {
    id: "ecollect",
    label: "Instant Credit via E-Collect",
    icon: Zap,
    mode: "cash_deposit",
    headline: "Instant Credit via E-Collect",
    subtext: "Deposit cash at an E-Collect machine, then upload the receipt for wallet credit.",
  },
  {
    id: "history",
    label: "Your Request",
    icon: ClipboardList,
    headline: "Your requests",
    subtext: "Track every fund request you submitted — pending, credited, or rejected.",
  },
];

function statusTone(status: string, display: string): { bg: string; fg: string; border: string } {
  const s = `${status} ${display}`.toLowerCase();
  if (s.includes("credit") || s.includes("approved") || s.includes("success")) {
    return { bg: "#F0FDF4", fg: "#15803D", border: "#86EFAC" };
  }
  if (s.includes("reject") || s.includes("fail") || s.includes("cancel")) {
    return { bg: "#FEF2F2", fg: "#B91C1C", border: "#FECACA" };
  }
  if (s.includes("pending") || s.includes("review") || s.includes("submit")) {
    return { bg: "#FFF7ED", fg: "#C2410C", border: "#FDBA74" };
  }
  return { bg: `${B.blue}08`, fg: B.blueMid, border: B.border };
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <label className="mb-1.5 block">
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
        {children}
      </span>
      {hint ? (
        <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal" style={{ color: B.muted }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(e: MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b py-3 last:border-0" style={{ borderColor: B.border }}>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-sm font-bold" style={{ color: B.blue }}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
        style={{ background: copied ? `${B.green}18` : `${B.blue}10`, color: copied ? B.green : B.blue }}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function BankCardSlider({
  banks,
  myVan,
  selected,
  onSelect,
}: {
  banks: BankAccount[];
  myVan: MyVan | null;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {banks.map((b) => {
        const active = selected === b.id;
        const isActive = b.isActive !== false;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            className="w-[220px] shrink-0 rounded-2xl border-2 p-4 text-left transition-all"
            style={{
              borderColor: active ? B.blue : B.border,
              background: active ? `${B.blue}0A` : "#fff",
              boxShadow: active ? `0 0 0 3px ${B.blue}14` : undefined,
              opacity: isActive ? 1 : 0.55,
            }}
          >
            <div className="flex items-start gap-2">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: active ? B.badgeGrad : `${B.blue}12` }}
              >
                <Banknote size={16} color={active ? "#fff" : B.blue} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-extrabold" style={{ color: B.blue }}>
                    {b.bankName}
                  </span>
                  {active ? (
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                      style={{ background: B.blue }}
                    >
                      <Check size={10} color="#fff" />
                    </span>
                  ) : null}
                </div>
                {!isActive ? (
                  <p className="mt-1 text-xs font-bold" style={{ color: "#DC2626" }}>
                    Unavailable
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-medium" style={{ color: B.muted }}>
                    ****{b.accountNumberLast4}
                  </p>
                )}
                {myVan?.bankAccountId === b.id && myVan.vanNumber ? (
                  <p className="mt-1 text-[11px] font-bold" style={{ color: B.green }}>
                    Your dedicated account
                  </p>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SelectedBankDetails({ bank, myVan }: { bank: BankAccount | undefined; myVan: MyVan | null }) {
  if (!bank) return null;
  const isMine = myVan?.bankAccountId === bank.id;

  return (
    <div
      className="mt-4 rounded-2xl border-2 p-4 sm:p-5"
      style={{ borderColor: `${B.blue}35`, background: `linear-gradient(180deg, ${B.blue}08, #fff)` }}
    >
      <div className="mb-1 flex items-center gap-2">
        <Landmark size={16} style={{ color: B.blue }} />
        <p className="text-sm font-bold" style={{ color: B.blue }}>
          {bank.bankName} — full details
        </p>
      </div>
      <p className="mb-2 text-xs" style={{ color: B.muted }}>
        Copy these details into your banking app, then return here to submit the request.
      </p>
      {isMine && myVan?.vanNumber ? (
        <CopyField label="Your Virtual A/C No." value={myVan.vanNumber} />
      ) : (
        <CopyField label="Account number (last 4)" value={`****${bank.accountNumberLast4}`} />
      )}
      <CopyField label="IFSC code" value={bank.ifsc} />
      <CopyField label="Account holder" value="AsanPay" />
    </div>
  );
}

function InfoBanner({ tone, children }: { tone: "amber" | "blue"; children: ReactNode }) {
  const amber = tone === "amber";
  return (
    <div
      className="mt-4 flex gap-2.5 rounded-xl border px-3.5 py-3"
      style={{
        background: amber ? "#FFFBEB" : `${B.blue}08`,
        borderColor: amber ? "#FDE68A" : `${B.blue}28`,
      }}
    >
      <Info size={16} style={{ color: amber ? "#B45309" : B.blue }} className="mt-0.5 shrink-0" />
      <p className="text-xs font-medium leading-relaxed" style={{ color: amber ? "#92400E" : B.blue }}>
        {children}
      </p>
    </div>
  );
}

export function FundRequestForm({
  rows,
  historyLoading,
  onRefreshHistory,
  onSuccess,
}: {
  rows: FundRequestRow[];
  historyLoading: boolean;
  onRefreshHistory: () => void;
  onSuccess: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("upi");
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [myVan, setMyVan] = useState<MyVan | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [depositLocal, setDepositLocal] = useState("");
  const [senderName, setSenderName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder("fund-request"));
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [bankRows, vanRows, wallets] = await Promise.all([
          fetchApi<BankAccount[]>("/banking/accounts", { purpose: "collection" }),
          fetchApi<MyVan[]>("/banking/van/mine").catch(() => []),
          fetchApi<{ walletType: string; balance: string }[]>("/wallet/me").catch(() => []),
        ]);
        if (!alive) return;
        setBanks(bankRows);
        setMyVan(vanRows[0] ?? null);
        setBankAccountId(vanRows[0]?.bankAccountId ?? bankRows[0]?.id ?? "");
        setWalletBalance(wallets.find((w) => w.walletType === "main")?.balance ?? null);
      } catch {
        if (alive) toast.error("Failed to load Add Money details");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const tab = TABS.find((t) => t.id === activeTab)!;
  const selectedBank = banks.find((b) => b.id === bankAccountId);
  const upiUri = myVan?.vpa && amount ? `upi://pay?pa=${myVan.vpa}&pn=AsanPay&am=${amount}&cu=INR` : null;
  const pendingCount = rows.filter((r) => {
    const s = `${r.status} ${r.displayStatus}`.toLowerCase();
    return s.includes("pending") || s.includes("review") || s.includes("submit");
  }).length;

  function switchTab(id: TabId) {
    setActiveTab(id);
    if (id === "history") {
      onRefreshHistory();
      return;
    }
    attemptKey.current.clear();
    if (id === "upi" && myVan?.bankAccountId) setBankAccountId(myVan.bankAccountId);
    else if (id !== "upi" && !bankAccountId && banks[0]) setBankAccountId(banks[0].id);
  }

  async function handleSubmit() {
    if (submitting || activeTab === "history" || !tab.mode) return;
    if (!bankAccountId) {
      toast.error("Select the company bank account you deposited to");
      return;
    }
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount) || parseFloat(amount) <= 0) {
      toast.error("Enter a valid amount greater than zero");
      return;
    }
    if (!depositLocal) {
      toast.error("Enter the deposit/payment date and time");
      return;
    }
    if (!receiptFile) {
      toast.error("Attach your deposit / payment receipt (PDF or image)");
      return;
    }
    if (receiptFile.size > 2_000_000) {
      toast.error("Receipt file must be 2 MB or smaller");
      return;
    }

    setSubmitting(true);
    try {
      const receiptSha256 = await sha256Hex(receiptFile);
      const receiptUrl = `https://receipts.asanpay.app/${receiptSha256}`;
      let depositDatetime: string;
      try {
        depositDatetime = toOffsetIso(depositLocal);
      } catch {
        toast.error("Enter a valid deposit date and time");
        setSubmitting(false);
        return;
      }

      await api.post(
        "/fund-requests",
        {
          bankAccountId,
          amount,
          paymentMode: tab.mode,
          referenceNumber: referenceNumber.trim() || null,
          depositDatetime,
          senderName: senderName.trim() || null,
          receiptUrl,
          receiptSha256,
          remarks: remarks.trim() || null,
        },
        { headers: { "Idempotency-Key": attemptKey.current.get() } },
      );
      attemptKey.current.clear();
      toast.success("Fund request submitted");
      setAmount("");
      setReferenceNumber("");
      setDepositLocal("");
      setSenderName("");
      setRemarks("");
      setReceiptFile(null);
      onSuccess();
      setActiveTab("history");
    } catch (err) {
      toast.error(extractApiError(err, "Fund request failed"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border-2 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:ring-2";
  const inputStyle = { borderColor: B.border, color: B.blue } as const;

  if (loading) {
    return (
      <div
        className="rounded-2xl border bg-white p-10 text-center text-sm"
        style={{ borderColor: B.border, color: B.muted }}
      >
        Loading Add Money options…
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: B.blue }}>
            Add Money to Wallet
          </h2>
          {walletBalance !== null ? (
            <p className="mt-1 text-sm font-medium" style={{ color: B.muted }}>
              Main Wallet balance:{" "}
              <span className="font-bold tabular-nums" style={{ color: B.blue }}>
                {formatInr(walletBalance)}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-5 lg:flex-row">
        <div className="w-full shrink-0 lg:w-64">
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
            {TABS.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTab(t.id)}
                  className="flex w-full items-center gap-3 border-b px-4 py-3.5 text-left transition-all last:border-b-0"
                  style={{
                    borderColor: B.border,
                    background: active ? `${B.blue}0A` : "transparent",
                    borderLeft: active ? `3px solid ${B.blue}` : "3px solid transparent",
                  }}
                >
                  <t.icon size={16} style={{ color: active ? B.blue : B.muted }} />
                  <span className="flex-1 text-sm font-semibold" style={{ color: active ? B.blue : B.muted }}>
                    {t.label}
                  </span>
                  {t.id === "history" && pendingCount > 0 ? (
                    <span
                      className="rounded-2xl px-2 py-0.5 text-[10px] font-extrabold text-white"
                      style={{ background: B.blue }}
                    >
                      {pendingCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 flex-1 rounded-2xl border bg-white p-5 shadow-sm sm:p-6" style={{ borderColor: B.border }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold" style={{ color: B.blue }}>
                {tab.headline}
              </h3>
              <p className="mt-0.5 text-xs font-medium" style={{ color: B.muted }}>
                {activeTab === "history" ? "Submitted requests for this account" : "Follow the steps, then submit"}
              </p>
            </div>
            {activeTab === "history" ? (
              <PrimaryButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={onRefreshHistory}
                className="!w-auto"
              >
                <RefreshCcw size={14} />
                Refresh
              </PrimaryButton>
            ) : null}
          </div>

          <InfoBanner tone={activeTab === "upi" || activeTab === "bank" ? "amber" : "blue"}>{tab.subtext}</InfoBanner>

          {activeTab === "history" ? (
            <div className="mt-5 overflow-hidden rounded-2xl border" style={{ borderColor: B.border }}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-[11px] font-semibold uppercase tracking-wider"
                    style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
                  >
                    <th className="px-4 py-3.5">Amount</th>
                    <th className="px-4 py-3.5">Mode / UTR</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center" style={{ color: B.muted }}>
                        Loading requests…
                      </td>
                    </tr>
                  ) : null}
                  {!historyLoading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center">
                        <ClipboardList size={28} className="mx-auto mb-2" style={{ color: B.muted }} />
                        <p className="text-sm font-semibold" style={{ color: B.blue }}>
                          No fund requests yet
                        </p>
                        <p className="mt-1 text-xs" style={{ color: B.muted }}>
                          Deposit via UPI or bank, then submit a request from the other tabs.
                        </p>
                      </td>
                    </tr>
                  ) : null}
                  {!historyLoading &&
                    rows.map((r) => {
                      const tone = statusTone(r.status, r.displayStatus);
                      return (
                        <tr key={r.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                          <td className="px-4 py-3.5 font-semibold tabular-nums" style={{ color: B.blue }}>
                            {formatInr(r.amount)}
                            {r.creditedAmount ? (
                              <div className="text-xs font-medium" style={{ color: B.green }}>
                                Credited {formatInr(r.creditedAmount)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5" style={{ color: B.muted }}>
                            <div className="text-xs font-bold uppercase tracking-wide">
                              {r.paymentMode.replace(/_/g, " ")}
                            </div>
                            <div className="font-mono text-xs">{r.referenceNumber || "—"}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className="inline-flex rounded-2xl border px-2.5 py-1 text-[11px] font-bold"
                              style={{ background: tone.bg, color: tone.fg, borderColor: tone.border }}
                            >
                              {r.displayStatus || r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-xs whitespace-nowrap" style={{ color: B.muted }}>
                            {new Date(r.submittedAt).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              {activeTab === "upi" ? (
                !myVan?.vpa ? (
                  <div
                    className="mt-5 rounded-2xl border border-dashed p-6 text-center"
                    style={{ borderColor: B.border, background: B.bg }}
                  >
                    <Wallet size={24} className="mx-auto mb-2" style={{ color: B.muted }} />
                    <p className="text-sm font-semibold" style={{ color: B.blue }}>
                      No UPI ID assigned yet
                    </p>
                    <p className="mt-1 text-xs" style={{ color: B.muted }}>
                      Ask your distributor or admin to assign one, or use Bank Account Transfer.
                    </p>
                    <PrimaryButton
                      type="button"
                      variant="primary"
                      size="sm"
                      loopGlow
                      onClick={() => switchTab("bank")}
                      className="mt-4 !w-auto mx-auto"
                    >
                      Go to Bank Transfer
                    </PrimaryButton>
                  </div>
                ) : (
                  <div
                    className="mt-5 grid gap-4 rounded-2xl border p-5 lg:grid-cols-[180px_1fr]"
                    style={{ borderColor: B.border, background: B.bg }}
                  >
                    <div className="flex flex-col items-center justify-center rounded-xl bg-white p-4 shadow-sm">
                      {upiUri ? (
                        <QRCodeSVG value={upiUri} size={148} />
                      ) : (
                        <div
                          className="flex h-[148px] w-[148px] items-center justify-center rounded-xl border border-dashed text-center text-xs"
                          style={{ borderColor: B.border, color: B.muted }}
                        >
                          Enter amount to generate QR
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                        Pay to UPI ID
                      </p>
                      <p className="mt-1 font-mono text-base font-bold" style={{ color: B.blue }}>
                        {myVan.vpa}
                      </p>
                      <p className="mt-3 text-xs" style={{ color: B.muted }}>
                        Quick amount
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {AMOUNT_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setAmount(p)}
                            className="rounded-2xl border-2 px-3.5 py-1.5 text-sm font-semibold"
                            style={{
                              borderColor: amount === p ? B.blue : B.border,
                              background: amount === p ? `${B.blue}10` : "#fff",
                              color: B.blue,
                            }}
                          >
                            ₹{p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: B.blue }}>
                    Available banks
                  </p>
                  {banks.length === 0 ? (
                    <p className="text-sm" style={{ color: B.muted }}>
                      No collection accounts available right now.
                    </p>
                  ) : (
                    <>
                      <BankCardSlider
                        banks={banks}
                        myVan={myVan}
                        selected={bankAccountId}
                        onSelect={(id) => {
                          setBankAccountId(id);
                          attemptKey.current.clear();
                        }}
                      />
                      <SelectedBankDetails bank={selectedBank} myVan={myVan} />
                    </>
                  )}
                </div>
              )}

              <div className="mt-6 rounded-2xl border p-4 sm:p-5" style={{ borderColor: B.border, background: "#FAFBFF" }}>
                <p className="mb-4 text-sm font-bold" style={{ color: B.blue }}>
                  Submit fund request
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Amount (₹)</FieldLabel>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value.replace(/[^\d.]/g, ""));
                        attemptKey.current.clear();
                      }}
                      placeholder="5000.00"
                      className={inputClass}
                      style={{ ...inputStyle, boxShadow: "0 0 0 0 transparent" }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = B.blue;
                        e.currentTarget.style.boxShadow = `0 0 0 3px ${B.blue}22`;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = B.border;
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel hint="Optional — helps faster matching">UTR / reference</FieldLabel>
                    <input
                      value={referenceNumber}
                      onChange={(e) => {
                        setReferenceNumber(e.target.value);
                        attemptKey.current.clear();
                      }}
                      placeholder="Bank UTR or reference number"
                      maxLength={60}
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>Deposit / payment date & time</FieldLabel>
                    <input
                      type="datetime-local"
                      value={depositLocal}
                      onChange={(e) => {
                        setDepositLocal(e.target.value);
                        attemptKey.current.clear();
                      }}
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel hint="Optional">Sender name</FieldLabel>
                    <input
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      maxLength={160}
                      placeholder="Name on the transfer"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel hint="PDF or image · max 2 MB — blocks duplicate slips">Receipt file</FieldLabel>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition hover:bg-white"
                      style={{ borderColor: receiptFile ? B.green : B.border, background: "#fff" }}
                    >
                      <FileUp size={22} style={{ color: receiptFile ? B.green : B.blue }} />
                      <span className="text-sm font-semibold" style={{ color: B.blue }}>
                        {receiptFile ? receiptFile.name : "Tap to choose receipt"}
                      </span>
                      <span className="text-xs" style={{ color: B.muted }}>
                        {receiptFile ? `${(receiptFile.size / 1024).toFixed(0)} KB` : "JPG, PNG, WEBP or PDF"}
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        setReceiptFile(e.target.files?.[0] ?? null);
                        attemptKey.current.clear();
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel hint="Optional">Remarks</FieldLabel>
                    <input
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      maxLength={500}
                      placeholder="Any note for the finance team"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <PrimaryButton
                  type="button"
                  variant="primary"
                  loopGlow
                  disabled={submitting || banks.length === 0}
                  loading={submitting}
                  onClick={() => void handleSubmit()}
                  className="mt-5"
                >
                  Submit fund request
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
