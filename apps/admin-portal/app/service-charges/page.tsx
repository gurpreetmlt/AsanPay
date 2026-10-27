"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { IndianRupee, Pencil, Plus } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { ConfirmModal, type ConfirmTone } from "@/components/ui/ConfirmModal";
import { TableActionButtons } from "@/components/ui/TableActionButtons";
import { B } from "@/lib/brand";
import api, { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type PendingConfirm = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone: ConfirmTone;
  action: () => void | Promise<void>;
};

type SchemeRole = "retailer" | "distributor" | "super_distributor";
type RuleType = "flat" | "percentage";

interface CatalogService {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface CatalogCategory {
  id: string;
  name: string;
  isActive: boolean;
  services: CatalogService[];
}

interface ServiceCharge {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  providerId: string | null;
  providerName: string | null;
  role: SchemeRole | null;
  ruleType: RuleType;
  value: string;
  minAmount: string | null;
  maxAmount: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

const ROLE_LABEL: Record<SchemeRole, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  super_distributor: "Super Distributor",
};

const EMPTY_FORM = {
  serviceId: "",
  role: "retailer" as "" | SchemeRole,
  ruleType: "flat" as RuleType,
  value: "",
  minAmount: "",
  maxAmount: "",
  isActive: true,
};

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function roleLabel(role: SchemeRole | null) {
  if (!role) return "All roles";
  return ROLE_LABEL[role] ?? role;
}

function formatFee(ruleType: RuleType, value: string) {
  if (ruleType === "percentage") return `${value}%`;
  return `₹${value}`;
}

export default function ServiceChargesPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [rows, setRows] = useState<ServiceCharge[]>([]);
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"" | SchemeRole | "all">("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const serviceOptions = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const cat of catalog) {
      if (!cat.isActive) continue;
      for (const s of cat.services) {
        out.push({ id: s.id, label: `${cat.name} · ${s.name}` });
      }
    }
    return out;
  }, [catalog]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (activeOnly) params.activeOnly = "1";
      const [chargeRows, cats] = await Promise.all([
        fetchApi<ServiceCharge[]>("/admin/service-charges", params),
        fetchApi<CatalogCategory[]>("/admin/catalog"),
      ]);
      setRows(chargeRows);
      setCatalog(cats);
      setForm((f) =>
        f.serviceId ? f : { ...f, serviceId: cats.find((c) => c.isActive)?.services[0]?.id || "" },
      );
    } catch (err) {
      toast.error(errMessage(err, "Failed to load service charges"));
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load]);

  const filtered = useMemo(() => {
    if (roleFilter === "") return rows;
    if (roleFilter === "all") return rows.filter((r) => r.role == null);
    return rows.filter((r) => r.role === roleFilter);
  }, [rows, roleFilter]);

  function startEdit(row: ServiceCharge) {
    setEditId(row.id);
    setForm({
      serviceId: row.serviceId,
      role: row.role ?? "",
      ruleType: row.ruleType,
      value: row.value,
      minAmount: row.minAmount ?? "",
      maxAmount: row.maxAmount ?? "",
      isActive: row.isActive,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditId(null);
    setForm((f) => ({ ...EMPTY_FORM, serviceId: f.serviceId }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.serviceId) {
      toast.error("Select a service");
      return;
    }
    if (!form.value.trim()) {
      toast.error("Enter a charge value");
      return;
    }
    setSaving(true);
    const body = {
      serviceId: form.serviceId,
      role: form.role === "" ? null : form.role,
      ruleType: form.ruleType,
      value: form.value.trim(),
      minAmount: form.minAmount.trim() || null,
      maxAmount: form.maxAmount.trim() || null,
      isActive: form.isActive,
    };
    try {
      if (editId) {
        await api.patch(`/admin/service-charges/${editId}`, body);
        toast.success("Service charge updated");
      } else {
        await api.post("/admin/service-charges", body);
        toast.success("Service charge created");
      }
      cancelEdit();
      await load();
    } catch (err) {
      toast.error(errMessage(err, editId ? "Could not update service charge" : "Could not create service charge"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: ServiceCharge) {
    try {
      await api.patch(`/admin/service-charges/${row.id}`, { isActive: !row.isActive });
      toast.success(row.isActive ? "Charge deactivated" : "Charge activated");
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, isActive: !r.isActive } : r)),
      );
    } catch (err) {
      toast.error(errMessage(err, "Could not update charge"));
    }
  }

  async function executeRemoveRow(row: ServiceCharge) {
    setConfirmBusy(true);
    try {
      await api.delete(`/admin/service-charges/${row.id}`);
      toast.success("Service charge deleted");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (editId === row.id) cancelEdit();
      setPendingConfirm(null);
    } catch (err) {
      toast.error(errMessage(err, "Could not delete charge"));
    } finally {
      setConfirmBusy(false);
    }
  }

  function removeRow(row: ServiceCharge) {
    setPendingConfirm({
      title: "Delete service charge?",
      message: (
        <>
          Delete charge for{" "}
          <span className="font-semibold" style={{ color: B.blue }}>
            {row.serviceName}
          </span>{" "}
          ({roleLabel(row.role)})?
        </>
      ),
      confirmLabel: "Delete charge",
      tone: "danger",
      action: () => void executeRemoveRow(row),
    });
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-6">
        <SectionTabs group="commission" />
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
            style={{ background: B.badgeGrad }}
          >
            <IndianRupee size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Customer fees
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              Customer fee on debit services (DMT, BBPS, recharge). Applied server-side — not set by agents.
            </p>
            <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
              Same fees are editable per service, next to provider income and shares, on the{" "}
              <a href="/tax-commission/rate-card" className="font-semibold underline-offset-2 hover:underline" style={{ color: B.blueLight }}>
                Rate card
              </a>
              .
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-2xl border bg-white p-5"
            style={{ borderColor: B.border }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {editId ? (
                  <Pencil size={18} style={{ color: B.blue }} />
                ) : (
                  <Plus size={18} style={{ color: B.blue }} />
                )}
                <h2 className="text-base font-bold" style={{ color: B.blue }}>
                  {editId ? "Edit charge" : "Add charge"}
                </h2>
              </div>
              {editId ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-sm font-semibold"
                  style={{ color: B.muted }}
                >
                  Cancel
                </button>
              ) : null}
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Service
              </span>
              <select
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border }}
                value={form.serviceId}
                onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}
              >
                <option value="">Select service</option>
                {serviceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Role
              </span>
              <select
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border }}
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as "" | SchemeRole }))
                }
              >
                <option value="">All roles</option>
                {(Object.keys(ROLE_LABEL) as SchemeRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs" style={{ color: B.muted }}>
                Retailer rows match most agent debit txns.
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Type
                </span>
                <select
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                  value={form.ruleType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ruleType: e.target.value as RuleType }))
                  }
                >
                  <option value="flat">Flat (₹)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Value
                </span>
                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={form.ruleType === "flat" ? "e.g. 10" : "e.g. 0.15"}
                  inputMode="decimal"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Min amount (optional)
                </span>
                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                  value={form.minAmount}
                  onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))}
                  placeholder="No min"
                  inputMode="decimal"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Max amount (optional)
                </span>
                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                  value={form.maxAmount}
                  onChange={(e) => setForm((f) => ({ ...f, maxAmount: e.target.value }))}
                  placeholder="No max"
                  inputMode="decimal"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <span style={{ color: B.blue }}>Active</span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Saving…" : editId ? "Save changes" : "Create charge"}
            </button>
          </form>

          <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              How fees apply
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-sm" style={{ color: B.muted }}>
              <li>Charged on debit balance flows (money transfer, bills, recharge).</li>
              <li>
                More specific rules win: provider + role → provider → role → all roles.
              </li>
              <li>Flat is rupees per txn; percentage is of the principal (max 100%).</li>
              <li>No matching active rule means customer fee is ₹0.</li>
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Role filter
              </span>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "" | SchemeRole | "all")}
              >
                <option value="">All</option>
                <option value="all">All-roles rules only</option>
                {(Object.keys(ROLE_LABEL) as SchemeRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              <span style={{ color: B.muted }}>Active only</span>
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: B.border, color: B.blue }}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !filtered.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No service charges match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="py-2 pr-3 font-semibold">Service</th>
                    <th className="py-2 pr-3 font-semibold">Role</th>
                    <th className="py-2 pr-3 font-semibold">Fee</th>
                    <th className="py-2 pr-3 font-semibold">Slab</th>
                    <th className="py-2 pr-3 font-semibold">Effective</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="py-3 pr-3">
                        <div className="font-medium" style={{ color: B.blue }}>
                          {row.serviceName}
                        </div>
                        <div className="font-mono text-[11px]" style={{ color: B.muted }}>
                          {row.serviceCode}
                        </div>
                      </td>
                      <td className="py-3 pr-3">{roleLabel(row.role)}</td>
                      <td className="py-3 pr-3 font-semibold" style={{ color: B.blue }}>
                        {formatFee(row.ruleType, row.value)}
                      </td>
                      <td className="py-3 pr-3 text-xs" style={{ color: B.muted }}>
                        {row.minAmount || row.maxAmount
                          ? `₹${row.minAmount ?? "0"} – ${row.maxAmount ? `₹${row.maxAmount}` : "∞"}`
                          : "Any amount"}
                      </td>
                      <td className="py-3 pr-3 text-xs whitespace-nowrap" style={{ color: B.muted }}>
                        {formatWhen(row.effectiveFrom)}
                      </td>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold"
                          style={{
                            background: row.isActive ? "rgba(22,163,74,0.12)" : "rgba(100,116,139,0.12)",
                            color: row.isActive ? "#15803d" : B.muted,
                          }}
                        >
                          {row.isActive ? "Active" : "Off"}
                        </button>
                      </td>
                      <td className="py-3 text-right">
                        <TableActionButtons
                          onEdit={() => startEdit(row)}
                          onDelete={() => void removeRow(row)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {pendingConfirm ? (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          tone={pendingConfirm.tone}
          busy={confirmBusy}
          onConfirm={() => void pendingConfirm.action()}
          onClose={() => {
            if (!confirmBusy) setPendingConfirm(null);
          }}
        />
      ) : null}
    </AdminShell>
  );
}
