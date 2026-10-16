"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { RequiredMark } from "@/components/ui/RequiredMark";

interface Category {
  value: string;
  label: string;
  direction: "credit" | "debit" | "none";
}

interface BankAccount {
  id: string;
  bankName: string;
  accountNumberLast4: string;
}

interface RuleRow {
  id: string;
  utrPrefix: string;
  category: string;
  categoryLabel: string;
  bankAccountId: string | null;
  bankName: string | null;
  last4: string | null;
  isActive: boolean;
  note: string | null;
}

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

export function CategoryRulesPanel() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [category, setCategory] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, cats, accounts] = await Promise.all([
        fetchApi<RuleRow[]>("/admin/bank-entry-rules"),
        fetchApi<Category[]>("/admin/bank-entries/categories"),
        fetchApi<BankAccount[]>("/banking/accounts", { purpose: "all" }),
      ]);
      setRules(list);
      setCategories(cats.filter((c) => c.direction !== "none"));
      setBanks(accounts);
    } catch (err) {
      toast.error(errMessage(err, "Could not load category rules"));
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addRule() {
    if (!prefix.trim()) return void toast.error("Enter a UTR prefix");
    if (!category) return void toast.error("Select a category");
    setBusy(true);
    try {
      await api.post("/admin/bank-entry-rules", {
        utrPrefix: prefix.trim(),
        category,
        bankAccountId: bankAccountId || null,
        note: note.trim() || null,
      });
      toast.success("Category rule saved");
      setPrefix("");
      setNote("");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not save the rule"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(rule: RuleRow) {
    setBusy(true);
    try {
      await api.patch(`/admin/bank-entry-rules/${rule.id}`, { isActive: !rule.isActive });
      toast.success(rule.isActive ? "Rule paused" : "Rule active");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not update the rule"));
    } finally {
      setBusy(false);
    }
  }

  async function removeRule(rule: RuleRow) {
    if (!window.confirm(`Remove rule ${rule.utrPrefix} → ${rule.categoryLabel}?`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/bank-entry-rules/${rule.id}`);
      toast.success("Rule removed");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not remove the rule"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 p-4 md:p-5">
      <div>
        <h2 className="text-base font-bold" style={{ color: B.blue }}>
          Category rules
        </h2>
        <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
          Map a UTR prefix to a bank entry category. Longest match wins; bank-specific beats all-banks.
          Bulk create can use Auto to apply these rules.
        </p>
      </div>

      <div className="rounded-2xl border p-4" style={{ borderColor: B.border }}>
        <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
          Add rule
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
              UTR prefix <RequiredMark />
            </span>
            <input
              className="w-full rounded-xl border px-3 py-2.5 font-mono text-sm uppercase"
              style={{ borderColor: B.border }}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32))}
              placeholder="e.g. YESB"
              maxLength={32}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
              Category <RequiredMark />
            </span>
            <select
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: B.border }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} ({c.direction})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
              Bank (optional)
            </span>
            <select
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: B.border }}
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">All banks</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bankName} ••{b.accountNumberLast4}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
              Note (optional)
            </span>
            <input
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: B.border }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Yes Bank interest"
              maxLength={500}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void addRule()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: B.badgeGrad }}
        >
          <Plus size={15} /> Add rule
        </button>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading rules…
        </p>
      ) : rules.length === 0 ? (
        <p className="rounded-2xl border px-4 py-8 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
          No rules yet. Add a prefix like INT or YESB to auto-categorise matching UTRs.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: B.border }}>
          <table className="w-full text-sm">
            <thead style={{ background: "#F8FAFC" }}>
              <tr>
                {["Prefix", "Category", "Bank", "Status", ""].map((h) => (
                  <th
                    key={h || "act"}
                    className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                    style={{ color: B.muted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: B.border }}>
                  <td className="px-4 py-3 font-mono font-bold" style={{ color: B.blue }}>
                    {r.utrPrefix}
                  </td>
                  <td className="px-4 py-3">{r.categoryLabel}</td>
                  <td className="px-4 py-3" style={{ color: B.muted }}>
                    {r.bankName ? `${r.bankName} ••${r.last4}` : "All banks"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleActive(r)}
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        color: r.isActive ? "#15803D" : "#B45309",
                        background: r.isActive ? "#DCFCE7" : "#FEF3C7",
                      }}
                    >
                      {r.isActive ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeRule(r)}
                      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-50"
                      style={{ borderColor: "#FCA5A5", color: B.danger }}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
