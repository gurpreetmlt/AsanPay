"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Banknote, Building2, Check, Copy, Info, Landmark, Wallet, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "react-hot-toast";
import api, { fetchApi } from "@/lib/api";
import { extractApiError } from "@/lib/onboarding";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { B } from "@/lib/brand";

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

type TabId = "upi" | "bank" | "cashClaim" | "ecollect";
type PaymentMode = "upi" | "neft" | "cash_deposit";

const TABS: { id: TabId; label: string; icon: typeof Wallet; mode: PaymentMode; headline: string; subtext: string }[] = [
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
    subtext: "Transfer from a bank account registered with AsanPay to load your wallet instantly.",
  },
  {
    id: "cashClaim",
    label: "Deposit Cash & Claim",
    icon: Building2,
    mode: "cash_deposit",
    headline: "Deposit Cash & Claim",
    subtext: "Deposit cash at the bank branch, then upload the slip below — wallet loads in 15–60 minutes after verification.",
  },
  {
    id: "ecollect",
    label: "Instant Credit via E-Collect",
    icon: Zap,
    mode: "cash_deposit",
    headline: "Instant Credit via E-Collect",
    subtext: "Deposit cash at an E-Collect machine, then upload the receipt below for instant wallet credit.",
  },
];

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(e: MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard permission denied — silently ignore, value is still selectable text */
    }
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <div>
        <p className="text-[10px] font-bold uppercase" style={{ color: B.muted }}>
          {label}
        </p>
        <p className="text-[13px] font-bold" style={{ color: B.blue }}>
          {value}
        </p>
      </div>
      <button type="button" onClick={copy} className="shrink-0 rounded-lg p-1.5 hover:bg-black/5" aria-label={`Copy ${label}`}>
        {copied ? <Check size={14} style={{ color: B.green }} /> : <Copy size={14} style={{ color: B.blue }} />}
      </button>
    </div>
  );
}

/** Company bank accounts as a "credit card" slider — clicking one drives the "full details" panel below it. */
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
    <div className="flex gap-3 overflow-x-auto pb-2">
      {banks.map((b) => {
        const active = selected === b.id;
        const isActive = b.isActive !== false;
        return (
          <div
            key={b.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(b.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(b.id)}
            className="w-56 shrink-0 cursor-pointer rounded-2xl border-2 p-4 text-left shadow-sm transition-shadow hover:shadow-md"
            style={{
              borderColor: active ? B.blue : B.border,
              background: active ? `${B.blue}0D` : "#fff",
              opacity: isActive ? 1 : 0.5,
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${B.blue}14` }}
              >
                <Banknote size={16} style={{ color: B.blue }} />
              </div>
              <span className="flex-1 truncate text-sm font-extrabold" style={{ color: B.blue }}>
                {b.bankName}
              </span>
              {active && (
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                  style={{ background: B.blue }}
                >
                  <Check size={11} color="#fff" />
                </span>
              )}
            </div>
            {!isActive ? (
              <p className="mt-2 text-xs font-bold" style={{ color: "#dc2626" }}>
                Currently unavailable
              </p>
            ) : (
              <p className="mt-2 text-xs font-medium" style={{ color: B.muted }}>
                ****{b.accountNumberLast4} · {b.ifsc}
              </p>
            )}
            {myVan?.bankAccountId === b.id && myVan.vanNumber && (
              <p className="mt-1 text-[11px] font-bold" style={{ color: B.green }}>
                Your dedicated account
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The selected card's full details, expanded below the slider — bank name, account/VAN, IFSC, each copyable. */
function SelectedBankDetails({ bank, myVan }: { bank: BankAccount | undefined; myVan: MyVan | null }) {
  if (!bank) return null;
  const isMine = myVan?.bankAccountId === bank.id;

  return (
    <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: B.border, background: `${B.blue}05` }}>
      <div className="mb-1 flex items-center gap-2">
        <Banknote size={16} style={{ color: B.blue }} />
        <p className="text-sm font-bold" style={{ color: B.blue }}>
          {bank.bankName} — full details
        </p>
      </div>
      <div className="divide-y" style={{ borderColor: B.border }}>
        {isMine && myVan?.vanNumber ? (
          <CopyField label="Your Virtual A/C No." value={myVan.vanNumber} />
        ) : (
          <CopyField label="Account number (last 4)" value={`****${bank.accountNumberLast4}`} />
        )}
        <CopyField label="IFSC code" value={bank.ifsc} />
        <CopyField label="Account holder" value="AsanPay" />
      </div>
    </div>
  );
}

export function FundRequestForm({ onSuccess }: { onSuccess: () => void }) {
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

  function switchTab(id: TabId) {
    setActiveTab(id);
    attemptKey.current.clear();
    if (id === "upi" && myVan?.bankAccountId) setBankAccountId(myVan.bankAccountId);
    else if (id !== "upi" && !bankAccountId && banks[0]) setBankAccountId(banks[0].id);
  }

  async function handleSubmit() {
    if (submitting) return;
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
    } catch (err) {
      toast.error(extractApiError(err, "Fund request failed"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
        Loading…
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold" style={{ color: B.blue }}>
        Add Money to Wallet
      </h2>
      {walletBalance !== null && (
        <p className="mt-1 text-sm font-medium" style={{ color: B.muted }}>
          Main Wallet balance: {formatInr(walletBalance)}
        </p>
      )}

      <div className="mt-5 flex gap-5">
        <div className="w-64 flex-shrink-0">
          <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className="flex w-full items-center gap-3 border-b px-4 py-3.5 text-left transition-all"
                style={{
                  borderColor: B.border,
                  background: activeTab === t.id ? `${B.blue}0A` : "transparent",
                  borderLeft: activeTab === t.id ? `3px solid ${B.blue}` : "3px solid transparent",
                }}
              >
                <t.icon size={16} style={{ color: activeTab === t.id ? B.blue : B.muted }} />
                <span className="text-sm font-semibold" style={{ color: activeTab === t.id ? B.blue : B.muted }}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
          <h3 className="text-base font-bold" style={{ color: B.blue }}>
            {tab.headline}
          </h3>
          <div className="mt-3 flex gap-2 rounded-xl p-3" style={{ background: activeTab === "upi" || activeTab === "bank" ? "#FEF3C7" : "#EFF6FF" }}>
            <Info size={16} style={{ color: activeTab === "upi" || activeTab === "bank" ? "#92400E" : B.blue }} className="mt-0.5 shrink-0" />
            <p className="text-xs font-medium" style={{ color: activeTab === "upi" || activeTab === "bank" ? "#92400E" : B.blue }}>
              {tab.subtext}
            </p>
          </div>

          {activeTab === "upi" ? (
            !myVan?.vpa ? (
              <p className="mt-4 text-xs font-medium" style={{ color: B.muted }}>
                No UPI ID is assigned to your account yet. Ask your distributor/admin to assign one, or use Bank
                Account Transfer instead.
              </p>
            ) : (
              <div className="mt-4 flex flex-col items-center rounded-2xl border p-5" style={{ borderColor: B.border }}>
                <p className="text-xs font-medium" style={{ color: B.muted }}>
                  Scan and pay to
                </p>
                <p className="mb-3 text-sm font-bold" style={{ color: B.blue }}>
                  {myVan.vpa}
                </p>
                {upiUri ? (
                  <QRCodeSVG value={upiUri} size={160} />
                ) : (
                  <p className="text-xs" style={{ color: B.muted }}>
                    Enter an amount below to generate the QR
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {AMOUNT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAmount(p)}
                      className="rounded-full border px-4 py-1.5 text-sm font-semibold"
                      style={{ borderColor: B.border, color: B.blue }}
                    >
                      ₹{p}
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
            <>
              <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide" style={{ color: B.blue }}>
                Available banks
              </p>
              {banks.length === 0 ? (
                <p className="text-sm" style={{ color: B.muted }}>
                  No collection accounts
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
            </>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Amount (₹)</label>
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
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">UTR / reference (optional)</label>
              <input
                value={referenceNumber}
                onChange={(e) => {
                  setReferenceNumber(e.target.value);
                  attemptKey.current.clear();
                }}
                placeholder="Bank UTR or reference number"
                maxLength={60}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Deposit / payment date & time</label>
              <input
                type="datetime-local"
                value={depositLocal}
                onChange={(e) => {
                  setDepositLocal(e.target.value);
                  attemptKey.current.clear();
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Sender name (optional)</label>
              <input value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={160} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Receipt file</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  setReceiptFile(e.target.files?.[0] ?? null);
                  attemptKey.current.clear();
                }}
                className="w-full text-sm"
              />
              <p className="mt-1 text-[12px]" style={{ color: B.muted }}>
                Used to block duplicate slips. Max 2 MB.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Remarks (optional)</label>
              <input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} className={inputClass} />
            </div>
          </div>

          <button
            type="button"
            disabled={submitting || banks.length === 0}
            onClick={() => void handleSubmit()}
            className="mt-5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit fund request"}
          </button>
        </div>
      </div>
    </div>
  );
}
