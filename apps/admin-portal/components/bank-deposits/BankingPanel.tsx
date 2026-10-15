"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { Plus, X } from "lucide-react";
import {
  emptyIfscBankDetails,
  IfscBankDetailsFields,
  type IfscBankDetailsValue,
} from "@/components/banking/IfscBankDetailsFields";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";
import { bankLogoUrl } from "@/lib/bankLogo";
import { lookupIndianIfsc } from "@/lib/ifsc";
import { AgentConfirmModal, ConfirmRow } from "@/components/users/AgentConfirmModal";
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
  holderName?: string | null;
  accountType?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  city?: string | null;
}

type AccountType = "current" | "savings";

const COMPANY_ACCOUNT_NAME = "ASANPAY INNOVATION PRIVATE LIMITED";

const emptyProfile = { holderName: COMPANY_ACCOUNT_NAME, accountType: "current" as AccountType, branchCode: "" };

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
  const [profile, setProfile] = useState(emptyProfile);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [olderThanHours, setOlderThanHours] = useState("48");
  const [vanUserId, setVanUserId] = useState("");
  const [vanConfirm, setVanConfirm] = useState(false);
  const [vanBankId, setVanBankId] = useState("");
  const [vanNumber, setVanNumber] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<BankAccount | null>(null);
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
    if (editingId && bankDetails.accountNumber.trim() && bankDetails.accountNumber !== (bankDetails.accountNumberConfirm ?? "")) {
      toast.error("Account numbers do not match — re-enter the new account number in Confirm account number");
      return;
    }
    if (!profile.holderName.trim()) {
      toast.error("Enter the account name exactly as printed on the passbook");
      return;
    }
    if (profile.branchCode.trim() && !/^[A-Za-z0-9]{1,20}$/.test(profile.branchCode.trim())) {
      toast.error("Branch code must be letters or digits only, e.g. 06738");
      return;
    }
    setReviewOpen(true);
  }

  async function saveBank() {
    const ifsc = bankDetails.ifsc.trim().toUpperCase();
    const profileBody = {
      holderName: profile.holderName.trim(),
      accountType: profile.accountType,
      branchName: bankDetails.branch.trim(),
      branchCode: profile.branchCode.trim(),
      city: bankDetails.city.trim(),
    };
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
          ...profileBody,
        });
        toast.success("Bank account updated");
      } else {
        await api.post("/banking/accounts", {
          bankName: bankDetails.bankName.trim(),
          accountNumber: bankDetails.accountNumber.trim(),
          ifsc,
          purpose,
          supportsVan,
          ...profileBody,
        });
        toast.success("Bank account registered");
      }
      setReviewOpen(false);
      setFormOpen(false);
      setBankDetails(emptyIfscBankDetails());
      setSupportsVan(false);
      setProfile(emptyProfile);
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
      branch: a.branchName ?? "",
      city: a.city ?? "",
      accountNumber: "",
    });
    setPurpose(a.purpose);
    setSupportsVan(a.supportsVan);
    setProfile({
      holderName: a.holderName || COMPANY_ACCOUNT_NAME,
      accountType: a.accountType === "savings" ? "savings" : "current",
      branchCode: a.branchCode ?? "",
    });
    setTab("accounts");
    setFormOpen(true);
  }

  function cancelEdit() {
    setFormOpen(false);
    setEditingId(null);
    setBankDetails(emptyIfscBankDetails());
    setPurpose("collection");
    setSupportsVan(false);
    setProfile(emptyProfile);
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

  function reviewVan(e: FormEvent) {
    e.preventDefault();
    if (!vanUserId.trim() || !vanBankId) {
      toast.error("Enter agent user UUID and select a VAN-capable bank");
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vanUserId.trim())) {
      toast.error("Agent user ID must be a UUID, e.g. 3f2a…-…-…-…-…");
      return;
    }
    if (!vanNumber.trim() && !vpa.trim()) {
      toast.error("Enter a VAN number or a VPA");
      return;
    }
    setVanConfirm(true);
  }

  async function assignVan() {
    setSaving(true);
    try {
      await api.post("/banking/van/assign", {
        userId: vanUserId.trim(),
        bankAccountId: vanBankId,
        vanNumber: vanNumber.trim() || null,
        vpa: vpa.trim() || null,
      });
      toast.success("Virtual account assigned");
      setVanConfirm(false);
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
                  data-active={tab === t.key}
                  className="tab-chip rounded-lg px-3 py-1.5 text-xs font-semibold"
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
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  cancelEdit();
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
                style={{ background: B.green }}
              >
                <Plus size={16} /> Add bank account
              </button>
            </div>

            {formOpen
              ? createPortal(
                  <div
                    className="bank-entry-backdrop fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-[2px] md:p-6"
                    onClick={() => !saving && cancelEdit()}
                  >
                    <div
                      role="dialog"
                      aria-modal="true"
                      className="bank-entry-modal max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
            <form
              onSubmit={registerBank}
              className="space-y-3 bg-[var(--admin-card)] p-5 md:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                  {editingId ? "Edit bank account" : "Add bank account"}
                </h2>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  aria-label="Close"
                  className="rounded-lg p-1.5"
                  style={{ color: B.muted }}
                >
                  <X size={18} />
                </button>
              </div>
              <IfscBankDetailsFields
                value={bankDetails}
                onChange={(patch) => setBankDetails((prev) => ({ ...prev, ...patch }))}
                showHolder={false}
                editableBankBranch
                showConfirmAccount={!editingId || bankDetails.accountNumber.length > 0}
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
                    <ProfileInput
                      label="Account name *"
                      placeholder="As on passbook, e.g. ASANPAY INNOVATION PRIVATE LIMITED"
                      value={profile.holderName}
                      disabled={saving}
                      onChange={(v) => setProfile((p) => ({ ...p, holderName: v }))}
                    />
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
                        Account type
                      </span>
                      <select
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                        style={{ borderColor: B.border, background: "var(--admin-card)", color: "var(--admin-text)" }}
                        value={profile.accountType}
                        onChange={(e) => setProfile((p) => ({ ...p, accountType: e.target.value as AccountType }))}
                        disabled={saving}
                      >
                        <option value="current">Current</option>
                        <option value="savings">Savings</option>
                      </select>
                    </label>
                    <ProfileInput
                      label="Branch code"
                      placeholder="e.g. 06738"
                      hint="Optional · printed on the passbook"
                      value={profile.branchCode}
                      disabled={saving}
                      onChange={(v) => setProfile((p) => ({ ...p, branchCode: v.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) }))}
                    />
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: B.danger }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !bankDetails.bankName.trim() || bankDetails.ifsc.length !== 11}
                  className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: B.badgeGrad }}
                >
                  {saving ? "Saving…" : editingId ? "Review changes" : "Review and register"}
                </button>
              </div>
            </form>
                    </div>
                  </div>,
                  document.body,
                )
              : null}

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
                            onView={() => setViewTarget(a)}
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
              onSubmit={reviewVan}
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
                {saving ? "Assigning…" : "Review and assign VAN"}
              </button>
            </form>
            {vanConfirm ? (
              <AgentConfirmModal
                userId={vanUserId.trim()}
                title="Assign this virtual account?"
                warning={
                  <p>
                    <b>Every deposit into this VAN credits this agent&apos;s wallet automatically.</b> Check the name,
                    mobile and UID — a VAN on the wrong agent sends someone else&apos;s money to them.
                  </p>
                }
                summary={
                  <>
                    <ConfirmRow label="Bank">
                      {(() => {
                        const bank = accounts.find((a) => a.id === vanBankId);
                        return bank ? `${bank.bankName} · ****${bank.accountNumberLast4}` : "—";
                      })()}
                    </ConfirmRow>
                    {vanNumber.trim() ? (
                      <ConfirmRow label="VAN">
                        <span className="font-mono">{vanNumber.trim()}</span>
                      </ConfirmRow>
                    ) : null}
                    {vpa.trim() ? (
                      <ConfirmRow label="VPA">
                        <span className="font-mono">{vpa.trim()}</span>
                      </ConfirmRow>
                    ) : null}
                  </>
                }
                confirmLabel="Assign VAN"
                busy={saving}
                onConfirm={() => void assignVan()}
                onClose={() => {
                  if (!saving) setVanConfirm(false);
                }}
              />
            ) : null}
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
              <BankDetailsCard
                ifsc={deleteTarget.ifsc}
                bankName={deleteTarget.bankName}
                accountNumber={`••••${deleteTarget.accountNumberLast4}`}
                holderName={deleteTarget.holderName}
                accountType={deleteTarget.accountType}
                branchName={deleteTarget.branchName}
                branchCode={deleteTarget.branchCode}
                city={deleteTarget.city}
                showCity
                purpose={deleteTarget.purpose}
                supportsVan={deleteTarget.supportsVan}
                status={deleteTarget.isActive ? "Active" : "Disabled"}
              />
              <p
                className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: "#FEE2E2", color: "#B91C1C" }}
              >
                It will disappear from Banking and Add Money. Linked history stays in the database. This cannot be
                undone from the admin UI.
              </p>
            </>
          }
          confirmText={`${deleteTarget.ifsc}-${deleteTarget.accountNumberLast4}`}
          confirmTextLabel="Type IFSC-last 4 digits to confirm"
          confirmLabel="Yes, delete bank"
          cancelLabel="Cancel"
          busy={saving}
          onConfirm={() => void confirmRemoveBank()}
          onClose={() => {
            if (!saving) setDeleteTarget(null);
          }}
        />
      ) : null}

      {viewTarget ? <BankViewModal bank={viewTarget} onClose={() => setViewTarget(null)} /> : null}

      {reviewOpen ? (
        <ConfirmModal
          tone="info"
          title={editingId ? "Save changes to this bank?" : "Register this bank account?"}
          message={
            <>
              <BankDetailsCard
                ifsc={bankDetails.ifsc.trim().toUpperCase()}
                bankName={bankDetails.bankName.trim()}
                accountNumber={bankDetails.accountNumber.trim() || "Unchanged"}
                holderName={profile.holderName.trim()}
                accountType={profile.accountType}
                branchName={bankDetails.branch.trim()}
                branchCode={profile.branchCode.trim()}
                city={bankDetails.city.trim()}
                showCity
                purpose={purpose}
                supportsVan={supportsVan}
              />
              <p
                className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: "#FEF3C7", color: "#92400E" }}
              >
                Match every line with the passbook. Agents see these details when they add money to this bank.
              </p>
            </>
          }
          confirmLabel={editingId ? "Save changes" : "Register account"}
          busy={saving}
          busyLabel="Saving…"
          onConfirm={() => void saveBank()}
          onClose={() => {
            if (!saving) setReviewOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

const PURPOSE_TEXT: Record<Purpose, string> = { collection: "Collection", payout: "Payout", ops: "Operations" };

interface BankFullDetails {
  accountNumber: string;
  ledgerBalance: string;
  ledgerCode: string;
}

function BankViewModal({ bank, onClose }: { bank: BankAccount; onClose: () => void }) {
  const [full, setFull] = useState<BankFullDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ifscBranch, setIfscBranch] = useState<string | null>(null);

  useEffect(() => {
    if (bank.branchName) return;
    let cancelled = false;
    void lookupIndianIfsc(bank.ifsc).then((place) => {
      if (!cancelled && place?.branch) setIfscBranch(place.branch);
    });
    return () => {
      cancelled = true;
    };
  }, [bank.ifsc, bank.branchName]);

  useEffect(() => {
    let cancelled = false;
    fetchApi<BankFullDetails>(`/admin/treasury/banks/${bank.id}/details`)
      .then((d) => {
        if (!cancelled) setFull(d);
      })
      .catch((err) => {
        if (!cancelled) setError(errMessage(err, `Could not load the full account number for ${bank.bankName}`));
      });
    return () => {
      cancelled = true;
    };
  }, [bank.id, bank.bankName]);

  const accountNumber = full?.accountNumber ?? `••••${bank.accountNumberLast4}`;
  const branch = bank.branchName || ifscBranch;
  const notSaved = !bank.holderName || !bank.accountType || !bank.branchName || !bank.city;

  function copyAll() {
    const lines = [
      bank.accountType ? `Account Type: ${bank.accountType.charAt(0).toUpperCase()}${bank.accountType.slice(1)}` : null,
      `Account Number: ${accountNumber}`,
      bank.holderName ? `Account Name: ${bank.holderName}` : null,
      `Bank Name: ${bank.bankName}`,
      `Bank IFSC: ${bank.ifsc}`,
      bank.branchCode ? `Branch Code: ${bank.branchCode}` : null,
      branch ? `Branch Name: ${branch}` : null,
      bank.city ? `City: ${bank.city}` : null,
    ].filter(Boolean);
    void navigator.clipboard?.writeText(lines.join("\n"));
    toast.success("Bank details copied");
  }

  return (
    <ConfirmModal
      tone="info"
      title={`${bank.bankName} ••${bank.accountNumberLast4}`}
      message={
        <>
          <BankDetailsCard
            ifsc={bank.ifsc}
            bankName={bank.bankName}
            accountNumber={accountNumber}
            holderName={bank.holderName}
            accountType={bank.accountType}
            branchName={bank.branchName || (ifscBranch ? `${ifscBranch} (from IFSC, not saved)` : null)}
            branchCode={bank.branchCode}
            city={bank.city}
            showCity
            purpose={bank.purpose}
            supportsVan={bank.supportsVan}
            status={bank.isActive ? "Active" : "Disabled"}
          />
          {notSaved ? (
            <p
              className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold"
              style={{ background: "#FEF3C7", color: "#92400E" }}
            >
              Passbook details are not saved for this bank yet. Close this, click the pencil (Edit), check Account
              name, Branch and Branch code, then Save changes — the copy will include them after that.
            </p>
          ) : null}
          {full ? (
            <div className="mt-3 rounded-xl border px-4 py-2" style={{ borderColor: B.border }}>
              <ConfirmRow label="Ledger balance">
                ₹{Number(full.ledgerBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </ConfirmRow>
              <ConfirmRow label="Ledger code">
                <span className="break-all font-mono text-xs">{full.ledgerCode}</span>
              </ConfirmRow>
            </div>
          ) : null}
          {error ? (
            <p className="mt-3 text-xs font-semibold" style={{ color: B.danger }}>
              {error}
            </p>
          ) : null}
        </>
      }
      confirmLabel="Copy full bank details"
      cancelLabel="Close"
      onConfirm={copyAll}
      onClose={onClose}
    />
  );
}

function BankDetailsCard(props: {
  ifsc: string;
  bankName: string;
  accountNumber: string;
  holderName?: string | null;
  accountType?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  city?: string | null;
  /** Always show the City / District row (with "Not added" when empty). */
  showCity?: boolean;
  purpose: Purpose;
  supportsVan: boolean;
  status?: string;
}) {
  const missing = <span style={{ color: "#B45309" }}>Not added</span>;
  return (
    <div className="mt-3 rounded-2xl border px-4 py-3" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
      <div className="mb-2 flex items-center gap-3 border-b pb-2" style={{ borderColor: B.border }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bankLogoUrl(props.ifsc)}
          alt=""
          className="h-10 w-10 rounded-xl border bg-white object-contain p-1"
          style={{ borderColor: B.border }}
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
        <div className="min-w-0">
          <p className="truncate text-base font-bold" style={{ color: B.blue }}>
            {props.bankName}
          </p>
          <p className="font-mono text-xs" style={{ color: B.muted }}>
            {props.ifsc}
          </p>
        </div>
      </div>
      <ConfirmRow label="Account type">
        {props.accountType ? props.accountType.charAt(0).toUpperCase() + props.accountType.slice(1) : missing}
      </ConfirmRow>
      <ConfirmRow label="Account number">
        <span className="font-mono">{props.accountNumber}</span>
      </ConfirmRow>
      <ConfirmRow label="Account name">{props.holderName || missing}</ConfirmRow>
      <ConfirmRow label="Branch name">{props.branchName || missing}</ConfirmRow>
      <ConfirmRow label="Branch code">{props.branchCode ? <span className="font-mono">{props.branchCode}</span> : missing}</ConfirmRow>
      {props.showCity || props.city ? <ConfirmRow label="City / District">{props.city || missing}</ConfirmRow> : null}
      <ConfirmRow label="Purpose">{PURPOSE_TEXT[props.purpose]}</ConfirmRow>
      <ConfirmRow label="Virtual accounts (VAN)">{props.supportsVan ? "Supported" : "Not supported"}</ConfirmRow>
      {props.status ? <ConfirmRow label="Status">{props.status}</ConfirmRow> : null}
    </div>
  );
}

function ProfileInput({
  label,
  placeholder,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  hint?: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
        {label}
      </span>
      <input
        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none disabled:opacity-60"
        style={{ borderColor: B.border, background: "var(--admin-card)", color: "var(--admin-text)" }}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? (
        <span className="mt-1 block text-xs" style={{ color: B.muted }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
