"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { Paperclip, X } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

export interface BulkLine {
  id: string;
  date: string;
  direction: "CR" | "DR";
  amount: string;
  utr: string | null;
  narration: string | null;
  senderName: string | null;
}

interface Category {
  value: string;
  label: string;
  direction: "credit" | "debit" | "none";
  needsProvider: boolean;
}

interface ProviderRow {
  id: string;
  code: string;
  name: string;
}

interface BulkResult {
  lineId: string;
  entryId: string | null;
  error: string | null;
}

const MAX_PROOF_BYTES = 3 * 1024 * 1024;
const PROOF_TYPES = /^(image\/(png|jpeg|webp)|application\/pdf)$/;

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the receipt file"));
    reader.readAsDataURL(file);
  });
}

function inr(amount: string) {
  return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dmy(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function BulkBankEntryModal({
  bank,
  lines: allLines,
  onClose,
  onDone,
}: {
  bank: { id: string; bankName: string; last4: string };
  lines: BulkLine[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const lines = allLines.filter((l) => !doneIds.includes(l.id));
  const direction = allLines[0]?.direction === "DR" ? "debit" : "credit";
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [category, setCategory] = useState("auto");
  const [providerId, setProviderId] = useState("");
  const [receipts, setReceipts] = useState<Record<string, File>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      try {
        const [cats, providerList] = await Promise.all([
          fetchApi<Category[]>("/admin/bank-entries/categories"),
          fetchApi<ProviderRow[]>("/float/providers"),
        ]);
        setCategories(cats.filter((c) => c.direction === direction));
        setProviders(providerList);
      } catch (err) {
        toast.error(errMessage(err, "Could not load categories and providers"));
      }
    })();
  }, [direction]);

  const lineKey = allLines.map((l) => `${l.id}:${l.utr ?? ""}`).join("|");
  useEffect(() => {
    if (!allLines.length) return;
    void (async () => {
      try {
        const resolved = await api.post<{
          data: Array<{ key: string; label: string | null; category: string | null }>;
        }>("/admin/bank-entry-rules/resolve", {
          bankAccountId: bank.id,
          items: allLines.map((l) => ({ key: l.id, utr: l.utr })),
        });
        const map: Record<string, string> = {};
        for (const r of resolved.data.data ?? []) {
          if (r.label) map[r.key] = r.label;
        }
        setSuggestions(map);
      } catch {
        setSuggestions({});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lineKey captures id+utr
  }, [bank.id, lineKey]);

  const selected = categories.find((c) => c.value === category);
  const isAuto = category === "auto";
  const total = useMemo(() => lines.reduce((n, l) => n + Number(l.amount), 0), [lines]);
  const withReceipt = lines.filter((l) => receipts[l.id]).length;

  function pickReceipt(lineId: string, file: File | undefined) {
    if (!file) return;
    if (!PROOF_TYPES.test(file.type)) return void toast.error("Receipt must be a PNG, JPG, WEBP image or a PDF");
    if (file.size > MAX_PROOF_BYTES) return void toast.error("Receipt file must be 3 MB or smaller");
    setReceipts((prev) => ({ ...prev, [lineId]: file }));
  }

  async function submit() {
    if (!category) return void toast.error("Select a category for these entries");
    if (!isAuto && selected?.needsProvider && !providerId) {
      return void toast.error("Select the API provider for this category");
    }
    setSaving(true);
    try {
      const res = await api.post<{ data: BulkResult[] }>("/admin/bank-entries/bulk", {
        bankAccountId: bank.id,
        category,
        providerId: providerId || null,
        lineIds: lines.map((l) => l.id),
      });
      const results = res.data.data;
      const errors: Record<string, string> = {};
      let receiptFails = 0;
      for (const r of results) {
        if (!r.entryId) {
          errors[r.lineId] = r.error ?? "Could not create this entry";
          continue;
        }
        const file = receipts[r.lineId];
        if (!file) continue;
        try {
          await api.post(`/admin/bank-entries/${r.entryId}/receipt`, {
            attachmentName: file.name,
            attachmentDataUrl: await readFileAsDataUrl(file),
          });
        } catch {
          receiptFails += 1;
        }
      }
      const created = results.filter((r) => r.entryId).length;
      const missing = results.filter((r) => r.entryId && !receipts[r.lineId]).length + receiptFails;
      if (created > 0) {
        toast.success(
          `${created} ${created === 1 ? "entry" : "entries"} created` +
            (missing > 0 ? ` — ${missing} still need a receipt before approval (Bank entries tab → Add receipt)` : " — approve them in Bank entries"),
          { duration: 7000 },
        );
        onDone();
      }
      if (Object.keys(errors).length > 0) {
        setDoneIds((prev) => [...prev, ...results.filter((r) => r.entryId).map((r) => r.lineId)]);
        setFailed(errors);
        toast.error(`${Object.keys(errors).length} line(s) skipped — see the reason on each row`);
      } else {
        onClose();
      }
    } catch (err) {
      toast.error(errMessage(err, "Could not create the bank entries"));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-xl border px-3 py-2 text-sm outline-none";

  return createPortal(
    <div
      className="bank-entry-backdrop fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-[2px] md:p-6"
      onClick={() => !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bank-entry-modal flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: B.border }}>
          <div>
            <h2 className="text-lg font-black" style={{ color: B.blue }}>
              Create {lines.length} bank {lines.length === 1 ? "entry" : "entries"}
            </h2>
            <p className="text-xs" style={{ color: B.muted }}>
              {bank.bankName} ••{bank.last4} · money {direction === "credit" ? "in" : "out"} · total {inr(String(total))}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="popup-close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold" style={{ color: B.blue }}>
              Category*
              <select
                className={`${inputCls} mt-1`}
                style={{ borderColor: B.border }}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="auto">Auto (UTR prefix rules)</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {isAuto ? (
                <span className="mt-1 block text-[11px] font-normal" style={{ color: B.muted }}>
                  Uses Category rules tab. No match → Other credit / Other debit.
                </span>
              ) : null}
            </label>
            {selected?.needsProvider ? (
              <label className="text-xs font-bold" style={{ color: B.blue }}>
                API provider*
                <select
                  className={`${inputCls} mt-1`}
                  style={{ borderColor: B.border }}
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                >
                  <option value="">Select provider</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : isAuto ? (
              <label className="text-xs font-bold" style={{ color: B.blue }}>
                API provider (if a rule needs it)
                <select
                  className={`${inputCls} mt-1`}
                  style={{ borderColor: B.border }}
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                >
                  <option value="">None</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>
            Attach a receipt on each row. A row without a receipt is still created, but shows &quot;Receipt missing&quot; and
            cannot be approved until you upload it.
          </p>

          <div className="space-y-2">
            {lines.map((l) => {
              const file = receipts[l.id];
              const error = failed[l.id];
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                  style={{ borderColor: error ? "#FCA5A5" : B.border, background: error ? "#FEF2F2" : undefined }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold" style={{ color: l.direction === "CR" ? "#15803D" : "#B91C1C" }}>
                      {l.direction === "CR" ? "+" : "−"} {inr(l.amount)}
                      <span className="ml-2 text-xs font-semibold" style={{ color: B.muted }}>
                        {dmy(l.date)} · {l.utr ? `UTR ${l.utr}` : "No UTR"}
                      </span>
                    </p>
                    {l.narration ? (
                      <p className="truncate text-xs" style={{ color: B.muted }} title={l.narration}>
                        {l.narration}
                      </p>
                    ) : null}
                    {isAuto ? (
                      <p className="text-[11px] font-semibold" style={{ color: suggestions[l.id] ? "#15803D" : B.muted }}>
                        {suggestions[l.id]
                          ? `Rule → ${suggestions[l.id]}`
                          : "No rule match → Other credit/debit"}
                      </p>
                    ) : null}
                    {error ? (
                      <p className="text-xs font-semibold" style={{ color: B.danger }}>
                        {error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {file ? (
                      <>
                        <span className="max-w-[160px] truncate text-xs font-semibold" style={{ color: "#15803D" }} title={file.name}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setReceipts((prev) => {
                              const next = { ...prev };
                              delete next[l.id];
                              return next;
                            })
                          }
                          className="rounded-lg px-2 py-1 text-xs font-bold text-white"
                          style={{ background: B.danger }}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] font-bold" style={{ color: "#B45309" }}>
                        Receipt missing
                      </span>
                    )}
                    <label
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-white"
                      style={{ background: B.green }}
                    >
                      <Paperclip size={13} /> {file ? "Change" : "Attach receipt"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          pickReceipt(l.id, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: B.border }}>
          <span className="text-xs font-semibold" style={{ color: B.muted }}>
            Receipts attached: {withReceipt} of {lines.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.danger }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !category}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.cta }}
            >
              {saving ? "Creating…" : `Create ${lines.length} ${lines.length === 1 ? "entry" : "entries"}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
