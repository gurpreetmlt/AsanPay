"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Building2 } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type Tab = "accounts" | "import" | "suspense" | "van";
type Purpose = "collection" | "payout" | "ops";

interface BankAccount {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  ifsc: string;
  purpose: Purpose;
  supportsVan: boolean;
  isActive: boolean;
}

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

/** Minimal CSV: direction,amount,txnDate,utr,narration,senderName,bankTxnId */
function parseCsvLines(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const start = lines[0].toLowerCase().includes("direction") ? 1 : 0;
  const out: Array<{
    direction: "DR" | "CR";
    amount: string;
    txnDate: string;
    utr?: string | null;
    narration?: string | null;
    senderName?: string | null;
    bankTxnId?: string | null;
  }> = [];

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const direction = (cols[0] || "").toUpperCase();
    if (direction !== "DR" && direction !== "CR") {
      throw new Error(`Row ${i + 1}: direction must be DR or CR`);
    }
    const amount = cols[1];
    const txnDate = cols[2];
    if (!amount || !txnDate) throw new Error(`Row ${i + 1}: amount and txnDate are required`);
    out.push({
      direction,
      amount,
      txnDate,
      utr: cols[3] || null,
      narration: cols[4] || null,
      senderName: cols[5] || null,
      bankTxnId: cols[6] || null,
    });
  }
  return out;
}

export default function AdminBankingPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [unmatched, setUnmatched] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("collection");
  const [supportsVan, setSupportsVan] = useState(false);

  const [importBankId, setImportBankId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [olderThanHours, setOlderThanHours] = useState("48");
  const [vanUserId, setVanUserId] = useState("");
  const [vanBankId, setVanBankId] = useState("");
  const [vanNumber, setVanNumber] = useState("");
  const [vpa, setVpa] = useState("");
  const [vanRows, setVanRows] = useState<
    Array<{
      id: string;
      vanNumber: string | null;
      vpa: string | null;
      status: string;
      bankName: string;
      ownerCode: string;
    }>
  >([]);

  const importKey = useRef(createAttemptKeyHolder("stmt-import"));
  const parkKey = useRef(createAttemptKeyHolder("park-suspense"));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, count, vans] = await Promise.all([
        fetchApi<BankAccount[]>("/banking/accounts", { purpose: "all" }),
        fetchApi<{ count: number }>("/banking/unmatched-count"),
        fetchApi<
          Array<{
            id: string;
            vanNumber: string | null;
            vpa: string | null;
            status: string;
            bankName: string;
            ownerCode: string;
          }>
        >("/banking/van"),
      ]);
      setAccounts(rows);
      setUnmatched(count.count);
      setVanRows(vans);
      if (!importBankId && rows[0]) setImportBankId(rows[0].id);
      const vanBank = rows.find((r) => r.supportsVan && r.isActive);
      if (!vanBankId && vanBank) setVanBankId(vanBank.id);
    } catch (err) {
      toast.error(errMessage(err, "Failed to load banking data"));
    } finally {
      setLoading(false);
    }
  }, [importBankId, vanBankId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, accessToken, router]);

  async function registerBank(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/banking/accounts", {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        purpose,
        supportsVan,
      });
      toast.success("Bank account registered");
      setBankName("");
      setAccountNumber("");
      setIfsc("");
      setSupportsVan(false);
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not register bank"));
    } finally {
      setSaving(false);
    }
  }

  async function importStatements(e: FormEvent) {
    e.preventDefault();
    if (!importBankId) {
      toast.error("Select a bank account");
      return;
    }
    let lines: ReturnType<typeof parseCsvLines>;
    try {
      lines = parseCsvLines(csvText);
    } catch (err) {
      toast.error((err as Error).message);
      return;
    }
    if (lines.length === 0) {
      toast.error("Paste at least one statement line");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post(
        "/banking/statements/import",
        { bankAccountId: importBankId, lines },
        { headers: { "Idempotency-Key": importKey.current.get() } },
      );
      if (!data.success) throw new Error(data.message);
      toast.success(
        `Imported ${data.data.imported}, skipped ${data.data.skipped}, rematched ${data.data.rematched ?? 0}`,
      );
      importKey.current.clear();
      setCsvText("");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Import failed"));
    } finally {
      setSaving(false);
    }
  }

  async function parkSuspense() {
    const hours = Number(olderThanHours);
    if (!Number.isFinite(hours) || hours < 1) {
      toast.error("Enter hours as a positive number");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post(
        "/banking/park-suspense",
        { olderThanHours: hours },
        { headers: { "Idempotency-Key": parkKey.current.get() } },
      );
      if (!data.success) throw new Error(data.message);
      toast.success(`Parked ${data.data.parked ?? 0} unmatched credit(s) in suspense`);
      parkKey.current.clear();
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Park suspense failed"));
    } finally {
      setSaving(false);
    }
  }

  async function assignVan(e: FormEvent) {
    e.preventDefault();
    if (!vanUserId.trim() || !vanBankId) {
      toast.error("Enter agent user UUID and select a VAN-capable bank");
      return;
    }
    if (!vanNumber.trim() && !vpa.trim()) {
      toast.error("Provide vanNumber or vpa");
      return;
    }
    setSaving(true);
    try {
      await api.post("/banking/van/assign", {
        userId: vanUserId.trim(),
        bankAccountId: vanBankId,
        vanNumber: vanNumber.trim() || null,
        vpa: vpa.trim() || null,
      });
      toast.success("Virtual account assigned");
      setVanNumber("");
      setVpa("");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not assign VAN"));
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
              style={{ background: B.badgeGrad }}
            >
              <Building2 size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
                Banking
              </h1>
              <p className="text-sm" style={{ color: B.muted }}>
                Company bank accounts, statement import, unmatched suspense
              </p>
            </div>
          </div>
          <div
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: B.border, color: B.blue }}
          >
            Unmatched credits: {unmatched}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "accounts" as const, label: "Bank accounts" },
              { key: "import" as const, label: "Import statement" },
              { key: "suspense" as const, label: "Park suspense" },
              { key: "van" as const, label: "Assign VAN" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="rounded-xl px-3 py-2 text-sm font-semibold"
              style={{
                background: tab === t.key ? B.badgeGrad : "#fff",
                color: tab === t.key ? "#fff" : B.muted,
                border: `1px solid ${B.border}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : tab === "accounts" ? (
          <div className="space-y-5">
            <form
              onSubmit={registerBank}
              className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-2"
              style={{ borderColor: B.border }}
            >
              <h2 className="md:col-span-2 text-base font-bold" style={{ color: B.blue }}>
                Register bank account
              </h2>
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="Bank name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                required
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="Account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                required
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm uppercase"
                style={{ borderColor: B.border }}
                placeholder="IFSC"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value)}
                required
              />
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as Purpose)}
              >
                <option value="collection">Collection</option>
                <option value="payout">Payout</option>
                <option value="ops">Ops</option>
              </select>
              <label className="flex items-center gap-2 text-sm md:col-span-2" style={{ color: B.muted }}>
                <input
                  type="checkbox"
                  checked={supportsVan}
                  onChange={(e) => setSupportsVan(e.target.checked)}
                />
                Supports VAN
              </label>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 md:col-span-2"
                style={{ background: B.badgeGrad }}
              >
                {saving ? "Saving…" : "Register account"}
              </button>
            </form>

            {accounts.length === 0 ? (
              <p className="text-sm" style={{ color: B.muted }}>
                No company bank accounts yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: B.border }}>
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase" style={{ borderColor: B.border, color: B.muted }}>
                      <th className="px-4 py-3">Bank</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">IFSC</th>
                      <th className="px-4 py-3">Purpose</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                        <td className="px-4 py-3 font-medium" style={{ color: B.blue }}>
                          {a.bankName}
                          {a.supportsVan ? (
                            <span className="ml-2 text-[10px] font-semibold text-emerald-700">VAN</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">****{a.accountNumberLast4}</td>
                        <td className="px-4 py-3">{a.ifsc}</td>
                        <td className="px-4 py-3 capitalize">{a.purpose}</td>
                        <td className="px-4 py-3">{a.isActive ? "Active" : "Inactive"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : tab === "import" ? (
          <form
            onSubmit={importStatements}
            className="space-y-4 rounded-2xl border bg-white p-5"
            style={{ borderColor: B.border }}
          >
            <p className="text-sm" style={{ color: B.muted }}>
              CSV columns: direction,amount,txnDate,utr,narration,senderName,bankTxnId — one credit/debit per
              line (txnDate = YYYY-MM-DD).
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Bank account
              </span>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={importBankId}
                onChange={(e) => {
                  importKey.current.clear();
                  setImportBankId(e.target.value);
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bankName} · ****{a.accountNumberLast4} ({a.purpose})
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className="min-h-[180px] w-full rounded-xl border px-3 py-2 font-mono text-xs"
              style={{ borderColor: B.border }}
              placeholder={"CR,1000.00,2026-08-03,UTR123,Deposit,Sender Name,TXN1"}
              value={csvText}
              onChange={(e) => {
                importKey.current.clear();
                setCsvText(e.target.value);
              }}
            />
            <button
              type="submit"
              disabled={saving || accounts.length === 0}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Importing…" : "Import lines"}
            </button>
          </form>
        ) : tab === "suspense" ? (
          <div className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <p className="text-sm" style={{ color: B.muted }}>
              Park unmatched statement credits older than the window into treasury suspense. Current unmatched:{" "}
              <strong style={{ color: B.blue }}>{unmatched}</strong>
            </p>
            <label className="block max-w-xs text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Older than (hours)
              </span>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={olderThanHours}
                onChange={(e) => {
                  parkKey.current.clear();
                  setOlderThanHours(e.target.value);
                }}
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void parkSuspense()}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Parking…" : "Park unmatched in suspense"}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <form
              onSubmit={assignVan}
              className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-2"
              style={{ borderColor: B.border }}
            >
              <h2 className="md:col-span-2 text-base font-bold" style={{ color: B.blue }}>
                Assign virtual account
              </h2>
              <input
                className="rounded-xl border px-3 py-2 text-sm md:col-span-2"
                style={{ borderColor: B.border }}
                placeholder="Agent user UUID"
                value={vanUserId}
                onChange={(e) => setVanUserId(e.target.value)}
                required
              />
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={vanBankId}
                onChange={(e) => setVanBankId(e.target.value)}
                required
              >
                <option value="">Collection bank (supports VAN)</option>
                {accounts
                  .filter((a) => a.supportsVan && a.isActive)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bankName} · ****{a.accountNumberLast4}
                    </option>
                  ))}
              </select>
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                placeholder="VAN number (optional if VPA set)"
                value={vanNumber}
                onChange={(e) => setVanNumber(e.target.value)}
              />
              <input
                className="rounded-xl border px-3 py-2 text-sm md:col-span-2"
                style={{ borderColor: B.border }}
                placeholder="VPA e.g. agent@bank (optional if VAN set)"
                value={vpa}
                onChange={(e) => setVpa(e.target.value)}
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 md:col-span-2"
                style={{ background: B.badgeGrad }}
              >
                {saving ? "Assigning…" : "Assign VAN"}
              </button>
            </form>
            <div className="overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: B.border }}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ color: B.muted }}>
                    <th className="px-3 py-2 text-left font-medium">Owner</th>
                    <th className="px-3 py-2 text-left font-medium">VAN</th>
                    <th className="px-3 py-2 text-left font-medium">VPA</th>
                    <th className="px-3 py-2 text-left font-medium">Bank</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vanRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4" colSpan={5} style={{ color: B.muted }}>
                        No virtual accounts yet
                      </td>
                    </tr>
                  ) : (
                    vanRows.map((v) => (
                      <tr key={v.id} className="border-t" style={{ borderColor: B.border }}>
                        <td className="px-3 py-2 font-mono text-xs">{v.ownerCode}</td>
                        <td className="px-3 py-2">{v.vanNumber ?? "—"}</td>
                        <td className="px-3 py-2">{v.vpa ?? "—"}</td>
                        <td className="px-3 py-2">{v.bankName}</td>
                        <td className="px-3 py-2">{v.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
