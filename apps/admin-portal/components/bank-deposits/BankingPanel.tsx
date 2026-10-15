"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  emptyIfscBankDetails,
  IfscBankDetailsFields,
  type IfscBankDetailsValue,
} from "@/components/banking/IfscBankDetailsFields";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";
import { TableActionButtons } from "@/components/ui/TableActionButtons";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useDevOptionsStore } from "@/lib/devOptionsStore";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";

type Tab = "accounts" | "suspense" | "van";
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

export function BankingPanel({ section }: { section: "accounts" | "van" }) {
  const rowDeleteEnabled = useDevOptionsStore((s) => s.rowDeleteEnabled);

  const [tab, setTab] = useState<Tab>(section === "van" ? "van" : "accounts");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [unmatched, setUnmatched] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bankDetails, setBankDetails] = useState<IfscBankDetailsValue>(emptyIfscBankDetails);
  const [purpose, setPurpose] = useState<Purpose>("collection");
  const [supportsVan, setSupportsVan] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [olderThanHours, setOlderThanHours] = useState("48");
  const [vanUserId, setVanUserId] = useState("");
  const [vanBankId, setVanBankId] = useState("");
  const [vanNumber, setVanNumber] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);
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
      const vanBank = rows.find((r) => r.supportsVan && r.isActive);
      if (!vanBankId && vanBank) setVanBankId(vanBank.id);
    } catch (err) {
      toast.error(errMessage(err, "Failed to load banking data"));
    } finally {
      setLoading(false);
    }
  }, [vanBankId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function registerBank(e: FormEvent) {
    e.preventDefault();
    const ifsc = bankDetails.ifsc.trim().toUpperCase();
    if (ifsc.length !== 11 || !bankDetails.bankName.trim()) {
      toast.error("Enter a valid IFSC and wait for bank name to load");
      return;
    }
    if (!editingId && !/^\d{6,18}$/.test(bankDetails.accountNumber.trim())) {
      toast.error("Account number must be 6–18 digits");
      return;
    }
    if (!editingId && bankDetails.accountNumber !== (bankDetails.accountNumberConfirm ?? "")) {
      toast.error("Account numbers do not match");
      return;
    }
    if (editingId && bankDetails.accountNumber.trim() && !/^\d{6,18}$/.test(bankDetails.accountNumber.trim())) {
      toast.error("Account number must be 6–18 digits");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/banking/accounts/${editingId}`, {
          bankName: bankDetails.bankName.trim(),
          ...(bankDetails.accountNumber.trim()
            ? { accountNumber: bankDetails.accountNumber.trim() }
            : {}),
          ifsc,
          purpose,
          supportsVan,
        });
        toast.success("Bank account updated");
      } else {
        await api.post("/banking/accounts", {
          bankName: bankDetails.bankName.trim(),
          accountNumber: bankDetails.accountNumber.trim(),
          ifsc,
          purpose,
          supportsVan,
        });
        toast.success("Bank account registered");
      }
      setBankDetails(emptyIfscBankDetails());
      setSupportsVan(false);
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(errMessage(err, editingId ? "Could not update bank" : "Could not register bank"));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(a: BankAccount) {
    setEditingId(a.id);
    setBankDetails({
      ...emptyIfscBankDetails(),
      ifsc: a.ifsc,
      bankName: a.bankName,
      accountNumber: "",
    });
    setPurpose(a.purpose);
    setSupportsVan(a.supportsVan);
    setTab("accounts");
  }

  function cancelEdit() {
    setEditingId(null);
    setBankDetails(emptyIfscBankDetails());
    setPurpose("collection");
    setSupportsVan(false);
  }

  async function toggleActive(a: BankAccount) {
    setSaving(true);
    try {
      await api.post(`/banking/accounts/${a.id}/active`, { isActive: !a.isActive });
      toast.success(a.isActive ? "Bank account disabled" : "Bank account enabled");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not update bank status"));
    } finally {
      setSaving(false);
    }
  }

  async function removeBank(a: BankAccount) {
    if (!rowDeleteEnabled) {
      toast.error("Turn on Developer → Safety → Enable row delete to show delete actions");
      return;
    }
    setDeleteTarget(a);
  }

  async function confirmRemoveBank() {
    if (!deleteTarget) return;
    const a = deleteTarget;
    setSaving(true);
    try {
      await api.delete(`/banking/accounts/${a.id}`);
      toast.success("Bank account deleted");
      setDeleteTarget(null);
      if (editingId === a.id) cancelEdit();
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Could not delete bank"));
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

  return (
    <>
      <div className="space-y-5 p-4 md:p-5">
        {section === "accounts" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl p-1" style={{ background: "#F1F5F9" }}>
              {(
                [
                  { key: "accounts" as const, label: "Company bank accounts" },
                  { key: "suspense" as const, label: "Park unmatched in suspense" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                  style={
                    tab === t.key
                      ? { background: "#fff", color: B.blueLight, boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }
                      : { color: B.muted }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "#F1F5F9", color: B.muted }}>
              Unmatched bank credits: {unmatched}
            </span>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : tab === "accounts" ? (
          <div className="space-y-5">
            <form
              onSubmit={registerBank}
              className="space-y-3 rounded-2xl border bg-[var(--admin-card)] p-5"
              style={{ borderColor: B.border }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold" style={{ color: B.blue }}>
                  {editingId ? "Edit bank account" : "Register bank account"}
                </h2>
                {editingId ? (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                    style={{ color: "#DC2626", border: `1px solid ${B.border}` }}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              <IfscBankDetailsFields
                value={bankDetails}
                onChange={(patch) => setBankDetails((prev) => ({ ...prev, ...patch }))}
                showHolder={false}
                showConfirmAccount={!editingId}
                accountRequired={!editingId}
                accountPlaceholder={
                  editingId ? "Account number (leave blank to keep)" : "Account number"
                }
                disabled={saving}
                footer={
                  <>
                    <label className="block text-sm">
                      <span
                        className="mb-1 block text-xs font-semibold uppercase"
                        style={{ color: B.muted }}
                      >
                        Purpose
                      </span>
                      <select
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                        style={{
                          borderColor: B.border,
                          background: "var(--admin-card)",
                          color: "var(--admin-text)",
                        }}
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value as Purpose)}
                        disabled={saving}
                      >
                        <option value="collection">Collection</option>
                        <option value="payout">Payout</option>
                        <option value="ops">Ops</option>
                      </select>
                    </label>
                    <label
                      className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2 lg:col-span-2"
                      style={{ color: B.muted }}
                    >
                      <input
                        type="checkbox"
                        checked={supportsVan}
                        onChange={(e) => setSupportsVan(e.target.checked)}
                        disabled={saving}
                      />
                      Supports VAN
                    </label>
                  </>
                }
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || !bankDetails.bankName.trim() || bankDetails.ifsc.length !== 11}
                  className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: B.badgeGrad }}
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Register account"}
                </button>
              </div>
            </form>

            {accounts.length === 0 ? (
              <p className="text-sm" style={{ color: B.muted }}>
                No company bank accounts yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: B.border }}>
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase" style={{ borderColor: B.border, color: B.muted }}>
                      <th className="px-4 py-3">Bank</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">IFSC</th>
                      <th className="px-4 py-3">Purpose</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                        <td className="px-4 py-3 font-medium" style={{ color: B.blue }}>
                          {a.bankName}
                          {a.supportsVan ? (
                            <span className="ml-2 text-[11px] font-semibold text-emerald-700">VAN</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">****{a.accountNumberLast4}</td>
                        <td className="px-4 py-3">{a.ifsc}</td>
                        <td className="px-4 py-3 capitalize">{a.purpose}</td>
                        <td className="px-4 py-3">
                          {a.isActive ? (
                            <span
                              className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                              style={{ background: "rgba(18,183,106,0.15)", color: "#12B76A" }}
                            >
                              Active
                            </span>
                          ) : (
                            <span
                              className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                              style={{ background: "var(--admin-secondary)", color: B.muted }}
                            >
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <TableActionButtons
                            onEdit={() => startEdit(a)}
                            onToggleActive={() => void toggleActive(a)}
                            toggleActiveTitle={a.isActive ? "Disable" : "Enable"}
                            toggleActiveTone={a.isActive ? "amber" : "green"}
                            onDelete={() => void removeBank(a)}
                            deleting={saving}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : tab === "suspense" ? (
          <div className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <p className="text-sm" style={{ color: B.muted }}>
              Park unmatched statement credits older than the window into treasury suspense. Current unmatched:{" "}
              <strong style={{ color: B.blue }}>{unmatched}</strong>
            </p>
            <p
              className="rounded-xl border px-3 py-2 text-xs"
              style={{ borderColor: "#FCD34D", background: "#FFFBEB", color: "#92400E" }}
            >
              Run the Reconciliation tab first and confirm every possible match. A line that belongs to a bank entry or a
              fund request would be counted twice if it is parked here.
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

      {deleteTarget ? (
        <DangerConfirmModal
          title="Delete this bank?"
          message={
            <>
              <p>
                You are about to remove{" "}
                <span className="font-semibold" style={{ color: B.blue }}>
                  {deleteTarget.bankName} ****{deleteTarget.accountNumberLast4}
                </span>{" "}
                ({deleteTarget.ifsc}).
              </p>
              <p className="mt-2">
                It will disappear from Banking and Add Money. Linked history stays in the database.
                This cannot be undone from the admin UI.
              </p>
            </>
          }
          confirmLabel="Yes, delete bank"
          cancelLabel="Cancel"
          busy={saving}
          onConfirm={() => void confirmRemoveBank()}
          onClose={() => {
            if (!saving) setDeleteTarget(null);
          }}
        />
      ) : null}
    </>
  );
}
