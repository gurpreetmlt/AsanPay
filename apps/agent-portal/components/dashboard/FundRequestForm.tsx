"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { ArrowLeft, Banknote, Building2, Check, ChevronRight, Copy, CreditCard, Info, Landmark, Wallet, X, Zap } from "lucide-react";
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

interface FundRequestFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "home" | "upi" | "bank" | "cashSelect" | "confirm";
type ConfirmMode = "upi" | "neft" | "cash_deposit";

interface ConfirmPrefill {
  mode: ConfirmMode;
  bankAccountId?: string;
  headline: string;
  subtext: string;
}

const formatInr = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : `₹${v}`;
};

export function FundRequestForm({ onClose, onSuccess }: FundRequestFormProps) {
  const [step, setStep] = useState<Step>("home");
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [myVan, setMyVan] = useState<MyVan | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmPrefill, setConfirmPrefill] = useState<ConfirmPrefill | null>(null);

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

  function goConfirm(prefill: ConfirmPrefill) {
    setConfirmPrefill(prefill);
    setStep("confirm");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-0 shadow-lg">
        {loading ? (
          <p className="p-8 text-center text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : step === "home" ? (
          <HomeStep
            walletBalance={walletBalance}
            hasUpi={Boolean(myVan?.vpa)}
            onClose={onClose}
            onUpi={() => setStep("upi")}
            onBank={() => setStep("bank")}
            onCash={() => setStep("cashSelect")}
          />
        ) : step === "upi" ? (
          <UpiStep
            van={myVan}
            onBack={() => setStep("home")}
            onContinue={(amount) =>
              goConfirm({
                mode: "upi",
                bankAccountId: myVan?.bankAccountId,
                headline: "Confirm UPI payment",
                subtext: `Paid ${formatInr(amount)} via UPI — attach the payment screenshot to complete.`,
              })
            }
          />
        ) : step === "bank" ? (
          <BankStep
            banks={banks}
            myVan={myVan}
            onBack={() => setStep("home")}
            onContinue={(bankAccountId) =>
              goConfirm({
                mode: "neft",
                bankAccountId,
                headline: "Confirm bank transfer",
                subtext: "Transferred to the account above — attach your bank receipt to complete.",
              })
            }
          />
        ) : step === "cashSelect" ? (
          <CashSelectStep
            onBack={() => setStep("home")}
            onSelect={(kind) =>
              goConfirm({
                mode: "cash_deposit",
                headline: kind === "claim" ? "Deposit Cash & Claim" : "Instant Credit via E-Collect",
                subtext:
                  kind === "claim"
                    ? "Deposit cash at the bank branch, then upload the slip below — wallet loads in 15–60 minutes after verification."
                    : "Deposit cash at an E-Collect machine, then upload the receipt below for instant wallet credit.",
              })
            }
          />
        ) : (
          <ConfirmStep
            banks={banks}
            myVan={myVan}
            prefill={confirmPrefill!}
            onBack={() => setStep("home")}
            onDone={() => {
              onSuccess();
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}

function Top({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose?: () => void }) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: B.border }}>
      {onBack ? (
        <button type="button" onClick={onBack} className="text-gray-400 hover:text-gray-600" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
      ) : (
        <span className="w-[18px]" />
      )}
      <h2 className="text-base font-semibold" style={{ color: B.blue }}>
        {title}
      </h2>
      {onClose ? (
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
          <X size={18} />
        </button>
      ) : (
        <span className="w-[18px]" />
      )}
    </div>
  );
}

function OptionRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof Wallet;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-3.5 text-left">
      <Icon size={20} style={{ color: B.blue }} strokeWidth={1.8} />
      <div className="flex-1">
        <div className="text-sm font-bold" style={{ color: B.blue }}>
          {title}
        </div>
        <div className="text-xs" style={{ color: B.muted }}>
          {subtitle}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: B.muted }} />
    </button>
  );
}

function HomeStep({
  walletBalance,
  hasUpi,
  onClose,
  onUpi,
  onBank,
  onCash,
}: {
  walletBalance: string | null;
  hasUpi: boolean;
  onClose: () => void;
  onUpi: () => void;
  onBank: () => void;
  onCash: () => void;
}) {
  return (
    <div>
      <Top title="Add Money to Wallet" onClose={onClose} />
      <div className="p-5">
        {walletBalance !== null && (
          <p className="mb-4 text-sm font-medium" style={{ color: B.muted }}>
            Main Wallet balance: {formatInr(walletBalance)}
          </p>
        )}

        <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: B.blue }}>
          Add Money Online
        </p>
        <div className="mb-5 divide-y rounded-2xl border px-4" style={{ borderColor: B.border }}>
          <OptionRow icon={Wallet} title="UPI" subtitle={hasUpi ? "No charges" : "Set up by your distributor"} onClick={onUpi} />
          <OptionRow icon={Landmark} title="Bank Account Transfer" subtitle="No charges" onClick={onBank} />
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: B.blue }}>
          Deposit Cash & Get Credit
        </p>
        <div className="divide-y rounded-2xl border px-4" style={{ borderColor: B.border }}>
          <OptionRow icon={Building2} title="At Bank Branch" subtitle="Bank-wise charges & limits" onClick={onCash} />
          <OptionRow icon={CreditCard} title="At Cash Deposit Machine" subtitle="Bank-wise charges & limits" onClick={onCash} />
        </div>
      </div>
    </div>
  );
}

function UpiStep({
  van,
  onBack,
  onContinue,
}: {
  van: MyVan | null;
  onBack: () => void;
  onContinue: (amount: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const upiUri = van?.vpa && amount ? `upi://pay?pa=${van.vpa}&pn=AsanPay&am=${amount}&cu=INR` : null;

  return (
    <div>
      <Top title="UPI Deposit" onBack={onBack} />
      <div className="p-5">
        {!van?.vpa ? (
          <div className="flex gap-2 rounded-xl p-3" style={{ background: "#FEF3C7" }}>
            <Info size={16} style={{ color: "#92400E" }} className="mt-0.5 shrink-0" />
            <p className="text-xs font-medium" style={{ color: "#92400E" }}>
              No UPI ID is assigned to your account yet. Ask your distributor/admin to assign one, or use Bank
              Account Transfer instead.
            </p>
          </div>
        ) : (
          <>
            <p className="text-center text-sm font-medium" style={{ color: B.muted }}>
              Enter amount to add
            </p>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0"
              className="mt-2 w-full border-none bg-transparent text-center text-4xl font-extrabold outline-none"
              style={{ color: B.blue }}
            />
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

            {upiUri ? (
              <div className="mt-6 flex flex-col items-center rounded-2xl border p-5" style={{ borderColor: B.border }}>
                <p className="text-xs font-medium" style={{ color: B.muted }}>
                  Scan and pay to
                </p>
                <p className="mb-3 text-sm font-bold" style={{ color: B.blue }}>
                  {van.vpa}
                </p>
                <QRCodeSVG value={upiUri} size={180} />
              </div>
            ) : (
              <p className="mt-4 text-center text-xs" style={{ color: B.muted }}>
                Enter an amount to generate the QR code
              </p>
            )}

            <button
              type="button"
              disabled={!amount}
              onClick={() => onContinue(amount)}
              className="mt-6 w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: B.badgeGrad }}
            >
              I&apos;ve paid — continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Company bank accounts as a "credit card" slider — shared by Bank Transfer and the Cash Deposit confirm step. */
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
        const isMine = myVan?.bankAccountId === b.id;
        const isActive = b.isActive !== false;
        return (
          <div
            key={b.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(b.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(b.id)}
            className="w-64 shrink-0 cursor-pointer rounded-2xl border-2 p-4 text-left shadow-sm transition-shadow hover:shadow-md"
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
              <div className="divide-y" style={{ borderColor: B.border }}>
                {isMine && myVan?.vanNumber ? (
                  <CopyField label="Your Virtual A/C No." value={myVan.vanNumber} />
                ) : (
                  <CopyField label="A/C No. (last 4)" value={`****${b.accountNumberLast4}`} />
                )}
                <CopyField label="IFSC Code" value={b.ifsc} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BankStep({
  banks,
  myVan,
  onBack,
  onContinue,
}: {
  banks: BankAccount[];
  myVan: MyVan | null;
  onBack: () => void;
  onContinue: (bankAccountId: string) => void;
}) {
  const [selected, setSelected] = useState(banks[0]?.id ?? "");

  return (
    <div>
      <Top title="Bank Account Transfer" onBack={onBack} />
      <div className="p-5">
        <div className="mb-4 flex gap-2 rounded-xl p-3" style={{ background: "#FEF3C7" }}>
          <Info size={16} style={{ color: "#92400E" }} className="mt-0.5 shrink-0" />
          <p className="text-xs font-medium" style={{ color: "#92400E" }}>
            Transfer from a bank account registered with AsanPay to load your wallet instantly.
          </p>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: B.blue }}>
          Available banks
        </p>
        <BankCardSlider banks={banks} myVan={myVan} selected={selected} onSelect={setSelected} />

        <button
          type="button"
          disabled={!selected}
          onClick={() => onContinue(selected)}
          className="mt-5 w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: B.badgeGrad }}
        >
          I&apos;ve transferred — continue
        </button>
      </div>
    </div>
  );
}

function CashSelectStep({ onBack, onSelect }: { onBack: () => void; onSelect: (kind: "claim" | "ecollect") => void }) {
  return (
    <div>
      <Top title="Select Mode" onBack={onBack} />
      <div className="p-5">
        <div className="divide-y rounded-2xl border px-4" style={{ borderColor: B.border }}>
          <OptionRow
            icon={Building2}
            title="Deposit Cash & Claim"
            subtitle="Deposit cash at bank & claim — 15–60 min load time"
            onClick={() => onSelect("claim")}
          />
          <OptionRow
            icon={Zap}
            title="Instant Credit via E-Collect"
            subtitle="For deposits under ₹10 Lac — instant wallet load"
            onClick={() => onSelect("ecollect")}
          />
        </div>
      </div>
    </div>
  );
}

const PAYMENT_MODE_MAP: Record<ConfirmMode, string> = { upi: "upi", neft: "neft", cash_deposit: "cash_deposit" };

function ConfirmStep({
  banks,
  myVan,
  prefill,
  onBack,
  onDone,
}: {
  banks: BankAccount[];
  myVan: MyVan | null;
  prefill: ConfirmPrefill;
  onBack: () => void;
  onDone: () => void;
}) {
  const [bankAccountId, setBankAccountId] = useState(prefill.bankAccountId ?? banks[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [depositLocal, setDepositLocal] = useState("");
  const [senderName, setSenderName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder("fund-request"));
  const needsBankPicker = !prefill.bankAccountId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!bankAccountId) {
      toast.error("Select the company bank account you deposited to");
      return;
    }
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount) || parseFloat(amount) <= 0) {
      toast.error("Enter a valid amount greater than zero");
      return;
    }
    if (!depositLocal) {
      toast.error("Enter the deposit date and time");
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

    setLoading(true);
    try {
      const receiptSha256 = await sha256Hex(receiptFile);
      const receiptUrl = `https://receipts.asanpay.app/${receiptSha256}`;
      let depositDatetime: string;
      try {
        depositDatetime = toOffsetIso(depositLocal);
      } catch {
        toast.error("Enter a valid deposit date and time");
        setLoading(false);
        return;
      }

      await api.post(
        "/fund-requests",
        {
          bankAccountId,
          amount,
          paymentMode: PAYMENT_MODE_MAP[prefill.mode],
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
      onDone();
    } catch (err) {
      toast.error(extractApiError(err, "Fund request failed"));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

  return (
    <div>
      <Top title={prefill.headline} onBack={onBack} />
      <form onSubmit={handleSubmit} className="grid gap-3 p-5 sm:grid-cols-2">
        <div className="flex gap-2 rounded-xl p-3 sm:col-span-2" style={{ background: "#EFF6FF" }}>
          <Info size={16} style={{ color: B.blue }} className="mt-0.5 shrink-0" />
          <p className="text-xs font-medium" style={{ color: B.blue }}>
            {prefill.subtext}
          </p>
        </div>

        {needsBankPicker && (
          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">Company bank account</label>
            {banks.length === 0 ? (
              <p className="text-sm" style={{ color: B.muted }}>
                No collection accounts
              </p>
            ) : (
              <BankCardSlider
                banks={banks}
                myVan={myVan}
                selected={bankAccountId}
                onSelect={(id) => {
                  setBankAccountId(id);
                  attemptKey.current.clear();
                }}
              />
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Amount (₹)</label>
          <input
            required
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
          <label className="mb-1 block text-sm font-medium text-gray-700">UTR / reference</label>
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Deposit date & time</label>
          <input
            required
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
            required
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

        <button
          type="submit"
          disabled={loading || banks.length === 0}
          className="mt-1 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60 sm:col-span-2"
        >
          {loading ? "Submitting…" : "Submit fund request"}
        </button>
      </form>
    </div>
  );
}
