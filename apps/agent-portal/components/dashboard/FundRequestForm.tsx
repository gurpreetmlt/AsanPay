"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
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
}

const PAYMENT_MODES = [
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "imps", label: "IMPS" },
  { value: "upi", label: "UPI" },
  { value: "cash_deposit", label: "Cash deposit" },
  { value: "cheque", label: "Cheque" },
] as const;

interface FundRequestFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

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

export function FundRequestForm({ onClose, onSuccess }: FundRequestFormProps) {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<(typeof PAYMENT_MODES)[number]["value"]>("neft");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [depositLocal, setDepositLocal] = useState("");
  const [senderName, setSenderName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const attemptKey = useRef(createAttemptKeyHolder("fund-request"));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await fetchApi<BankAccount[]>("/banking/accounts", { purpose: "collection" });
        if (!alive) return;
        setBanks(rows);
        if (rows[0]) setBankAccountId(rows[0].id);
      } catch {
        if (alive) toast.error("Failed to load collection bank accounts");
      } finally {
        if (alive) setLoadingBanks(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
      toast.error("Attach your deposit receipt (PDF or image)");
      return;
    }
    if (receiptFile.size > 2_000_000) {
      toast.error("Receipt file must be 2 MB or smaller");
      return;
    }

    setLoading(true);
    try {
      const receiptSha256 = await sha256Hex(receiptFile);
      const resolvedUrl =
        receiptUrl.trim() ||
        `https://receipts.asanpay.app/${receiptSha256}`;
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
          paymentMode,
          referenceNumber: referenceNumber.trim() || null,
          depositDatetime,
          senderName: senderName.trim() || null,
          receiptUrl: resolvedUrl,
          receiptSha256,
          remarks: remarks.trim() || null,
        },
        { headers: { "Idempotency-Key": attemptKey.current.get() } },
      );
      attemptKey.current.clear();
      toast.success("Fund request submitted");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(extractApiError(err, "Fund request failed"));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-3xl rounded-2xl bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Add money — fund request</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
      <form
        onSubmit={handleSubmit}
        className="grid max-h-[85vh] grid-cols-1 gap-x-4 gap-y-3 overflow-y-auto pr-1 sm:grid-cols-2"
      >
        <p className="text-xs sm:col-span-2" style={{ color: B.muted }}>
          Deposit to a company collection account, then submit UTR and receipt for credit.
        </p>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Company bank account</label>
          <select
            required
            value={bankAccountId}
            disabled={loadingBanks}
            onChange={(e) => {
              setBankAccountId(e.target.value);
              attemptKey.current.clear();
            }}
            className={inputClass}
          >
            {banks.length === 0 && <option value="">No collection accounts</option>}
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bankName} ·····{b.accountNumberLast4} ({b.ifsc})
              </option>
            ))}
          </select>
        </div>

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
          <label className="mb-1 block text-sm font-medium text-gray-700">Payment mode</label>
          <select
            value={paymentMode}
            onChange={(e) => {
              setPaymentMode(e.target.value as (typeof PAYMENT_MODES)[number]["value"]);
              attemptKey.current.clear();
            }}
            className={inputClass}
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
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
          <input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            maxLength={160}
            className={inputClass}
          />
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
          <p className="mt-1 text-[14px]" style={{ color: B.muted }}>
            Used to block duplicate slips. Max 2 MB.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Receipt URL (optional)</label>
          <input
            type="url"
            value={receiptUrl}
            onChange={(e) => setReceiptUrl(e.target.value)}
            placeholder="https://… if already hosted"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Remarks (optional)</label>
          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            maxLength={500}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading || loadingBanks || banks.length === 0}
          className="mt-1 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60 sm:col-span-2"
        >
          {loading ? "Submitting…" : "Submit fund request"}
        </button>
      </form>
      </div>
    </div>
  );
}
