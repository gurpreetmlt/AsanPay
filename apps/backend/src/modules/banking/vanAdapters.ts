import { HttpError } from "../../utils/httpError";

/** Normalized VAN credit after bank-specific payload adapters. */
export interface NormalizedVanCredit {
  bankTxnId: string;
  amount: string;
  vanNumber?: string | null;
  vpa?: string | null;
  utr?: string | null;
  txnDate?: string;
  narration?: string | null;
  senderName?: string | null;
  collectionAccountLast4?: string | null;
}

type Adapter = (raw: Record<string, unknown>) => NormalizedVanCredit;

function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function requireString(raw: Record<string, unknown>, keys: string[], label: string): string {
  for (const k of keys) {
    const v = asString(raw[k]);
    if (v) return v;
  }
  throw new HttpError(422, `${label} is required in the bank webhook payload`, "VAN_PAYLOAD_INVALID");
}

/** Generic / default AsanPay shape (already documented). */
const genericAdapter: Adapter = (raw) => ({
  bankTxnId: requireString(raw, ["bankTxnId", "bank_txn_id", "txnId"], "bankTxnId"),
  amount: requireString(raw, ["amount"], "amount"),
  vanNumber: asString(raw.vanNumber) ?? asString(raw.van_number) ?? null,
  vpa: asString(raw.vpa) ?? null,
  utr: asString(raw.utr) ?? asString(raw.UTR) ?? null,
  txnDate: asString(raw.txnDate) ?? asString(raw.txn_date),
  narration: asString(raw.narration) ?? null,
  senderName: asString(raw.senderName) ?? asString(raw.sender_name) ?? null,
  collectionAccountLast4:
    asString(raw.collectionAccountLast4) ?? asString(raw.collection_account_last4) ?? null,
});

/** ICICI-style sample field names (extend as bank docs arrive). */
const iciciAdapter: Adapter = (raw) => {
  const inner =
    raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
      ? (raw.data as Record<string, unknown>)
      : raw;
  return {
    bankTxnId: requireString(inner, ["BankTxnId", "bankTxnId", "TxnId", "txn_id"], "bankTxnId"),
    amount: requireString(inner, ["Amount", "amount", "TxnAmount"], "amount"),
    vanNumber: asString(inner.VirtualAccountNumber) ?? asString(inner.vanNumber) ?? null,
    vpa: asString(inner.VPA) ?? asString(inner.vpa) ?? null,
    utr: asString(inner.UTR) ?? asString(inner.utr) ?? null,
    txnDate: asString(inner.TxnDate) ?? asString(inner.txnDate),
    narration: asString(inner.Narration) ?? asString(inner.narration) ?? null,
    senderName: asString(inner.RemitterName) ?? asString(inner.senderName) ?? null,
    collectionAccountLast4:
      asString(inner.CollectionAccountLast4) ?? asString(inner.collectionAccountLast4) ?? null,
  };
};

/** HDFC-style sample field names. */
const hdfcAdapter: Adapter = (raw) => {
  const inner =
    raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload)
      ? (raw.payload as Record<string, unknown>)
      : raw;
  return {
    bankTxnId: requireString(inner, ["transactionId", "bankTxnId", "refNo"], "bankTxnId"),
    amount: requireString(inner, ["txnAmount", "amount"], "amount"),
    vanNumber: asString(inner.virtualAccount) ?? asString(inner.vanNumber) ?? null,
    vpa: asString(inner.upiId) ?? asString(inner.vpa) ?? null,
    utr: asString(inner.utrNumber) ?? asString(inner.utr) ?? null,
    txnDate: asString(inner.transactionDate) ?? asString(inner.txnDate),
    narration: asString(inner.remarks) ?? asString(inner.narration) ?? null,
    senderName: asString(inner.remitterName) ?? asString(inner.senderName) ?? null,
    collectionAccountLast4:
      asString(inner.poolAccountLast4) ?? asString(inner.collectionAccountLast4) ?? null,
  };
};

const ADAPTERS: Record<string, Adapter> = {
  generic: genericAdapter,
  default: genericAdapter,
  icici: iciciAdapter,
  hdfc: hdfcAdapter,
};

/**
 * Pick adapter from `X-Van-Bank` header or `bank` body field (default: generic).
 */
export function normalizeVanWebhookPayload(
  rawBody: unknown,
  bankHint?: string | null,
): NormalizedVanCredit {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new HttpError(422, "Webhook body must be a JSON object", "VAN_PAYLOAD_INVALID");
  }
  const raw = rawBody as Record<string, unknown>;
  const hint = (bankHint || asString(raw.bank) || "generic").toLowerCase();
  const adapter = ADAPTERS[hint] ?? genericAdapter;
  const normalized = adapter(raw);
  if (!normalized.vanNumber && !normalized.vpa) {
    throw new HttpError(422, "Provide vanNumber or vpa so the credit can be matched", "VAN_IDENTIFIER_REQUIRED");
  }
  return normalized;
}
