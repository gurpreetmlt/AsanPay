"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { IndianRupee, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { SaveConfirmModal } from "@/components/commission/rateCard/SaveConfirmModal";
import { usePendingSave } from "@/components/commission/rateCard/usePendingSave";
import { feePayerLabel, ruleLabel, slabLabel } from "@/components/commission/rateCard/types";
import { Btn, Chip } from "@/components/commission/rateCard/ui";
import { B } from "@/lib/brand";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type SchemeRole = "retailer" | "distributor" | "super_distributor";
type RuleType = "flat" | "percentage";
type FeeStatus = "live" | "scheduled" | "ended";

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
};

const STATUS_CHIP: Record<FeeStatus, { tone: "green" | "blue" | "muted"; label: string }> = {
  live: { tone: "green", label: "Live" },
  scheduled: { tone: "blue", label: "Scheduled" },
  ended: { tone: "muted", label: "Ended" },
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

function statusOf(row: ServiceCharge, now: number): FeeStatus {
  if (!row.isActive) return "ended";
  if (row.effectiveTo && new Date(row.effectiveTo).getTime() <= now) return "ended";
  if (new Date(row.effectiveFrom).getTime() > now) return "scheduled";
  return "live";
}

function formError(form: typeof EMPTY_FORM): string | null {
  if (!form.serviceId) return "Select a service";
  const v = form.value.trim();
  if (v === "") return "Enter the customer fee";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "Customer fee must be 0 or more";
  if (form.ruleType === "percentage" && n > 100) return "Percentage cannot exceed 100";
  for (const [label, raw] of [
    ["Min amount", form.minAmount],
    ["Max amount", form.maxAmount],
  ] as const) {
    if (raw.trim() !== "" && !(Number(raw) >= 0)) return `${label} must be a number 0 or more`;
  }
  if (form.minAmount.trim() !== "" && form.maxAmount.trim() !== "" && Number(form.minAmount) > Number(form.maxAmount)) {
    return "Min amount cannot be more than max amount";
  }
  return null;
}

export default function ServiceChargesPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [rows, setRows] = useState<ServiceCharge[]>([]);
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editRow, setEditRow] = useState<ServiceCharge | null>(null);
  const [touched, setTouched] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"" | SchemeRole | "all">("");
  const [statusFilter, setStatusFilter] = useState<"" | FeeStatus>("live");
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const { saveReq, setSaveReq, saving, runSave } = usePendingSave(() => {
    cancelEdit();
    setVersion((v) => v + 1);
  });

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
      const [chargeRows, cats] = await Promise.all([
        fetchApi<ServiceCharge[]>("/admin/service-charges"),
        fetchApi<CatalogCategory[]>("/admin/catalog"),
      ]);
      setRows(chargeRows);
      setNow(Date.now());
      setCatalog(cats);
      setForm((f) =>
        f.serviceId ? f : { ...f, serviceId: cats.find((c) => c.isActive)?.services[0]?.id || "" },
      );
    } catch (err) {
      toast.error(errMessage(err, "Could not load customer fees. Check your connection and refresh."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load, version]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (roleFilter === "all" && r.role != null) return false;
      if (roleFilter && roleFilter !== "all" && r.role !== roleFilter) return false;
      if (statusFilter && statusOf(r, now) !== statusFilter) return false;
      return true;
    });
  }, [rows, roleFilter, statusFilter, now]);

  function startEdit(row: ServiceCharge) {
    setEditRow(row);
    setTouched(false);
    setForm({
      serviceId: row.serviceId,
      role: row.role ?? "",
      ruleType: row.ruleType,
      value: String(Number(row.value)),
      minAmount: row.minAmount ?? "",
      maxAmount: row.maxAmount ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditRow(null);
    setTouched(false);
    setForm((f) => ({ ...EMPTY_FORM, serviceId: f.serviceId }));
  }

  const error = formError(form);
  const serviceLabel = (id: string) => serviceOptions.find((s) => s.id === id)?.label ?? "Service";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (error) {
      toast.error(error);
      return;
    }
    const role = form.role === "" ? null : form.role;
    const minAmount = form.minAmount.trim() || null;
    const maxAmount = form.maxAmount.trim() || null;
    const scope = editRow?.providerName ?? "All providers";
    setSaveReq({
      title: editRow ? "Save customer fee" : "Add customer fee",
      warnings: ["Customer fee changes what agents are charged on every new txn of this service."],
      changes: [
        {
          label: `${editRow ? editRow.serviceName : serviceLabel(form.serviceId)} · customer fee (${scope})`,
          detail: `${slabLabel(minAmount, maxAmount)} · ${feePayerLabel(role)}: ${
            editRow ? `${ruleLabel(editRow.ruleType, editRow.value)} → ` : ""
          }${ruleLabel(form.ruleType, form.value.trim())}`,
          method: "post",
          url: "/admin/rate-card/customer-fee",
          body: {
            serviceId: form.serviceId,
            providerId: editRow?.providerId ?? null,
            role,
            ruleType: form.ruleType,
            value: form.value.trim(),
            minAmount,
            maxAmount,
          },
        },
      ],
    });
  }

  function endRow(row: ServiceCharge) {
    setSaveReq({
      title: "End customer fee",
      warnings: ["Agents stop paying this fee on new txns. A matching wider rule (if any) applies instead."],
      changes: [
        {
          label: `${row.serviceName} · end customer fee (${row.providerName ?? "All providers"})`,
          detail: `${slabLabel(row.minAmount, row.maxAmount)} · ${feePayerLabel(row.role)}: ${ruleLabel(row.ruleType, row.value)}`,
          method: "delete",
          url: `/admin/rate-card/customer-fee/${row.id}`,
          body: {},
        },
      ],
    });
  }

  if (!hydrated || !accessToken) return null;

  const fieldCls = "w-full rounded-xl border px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60";

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
              Every change is versioned with a reason in Rate audit. Same fees are editable per service on the{" "}
              <Link href="/tax-commission/rate-card" className="font-semibold underline-offset-2 hover:underline" style={{ color: B.blueLight }}>
                Rate card
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-2xl border p-5"
            style={{ borderColor: B.border, background: B.card }}
          >
            <div className="flex items-center gap-2">
              {editRow ? <Pencil size={18} style={{ color: B.blue }} /> : <Plus size={18} style={{ color: B.blue }} />}
              <h2 className="text-base font-bold" style={{ color: B.blue }}>
                {editRow ? "Edit customer fee" : "Add customer fee"}
              </h2>
              {editRow ? <Chip tone="blue">{editRow.providerName ?? "All providers"}</Chip> : null}
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Service
              </span>
              <select
                className={fieldCls}
                style={{ borderColor: B.border }}
                value={form.serviceId}
                disabled={Boolean(editRow)}
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
                Charged to
              </span>
              <select
                className={fieldCls}
                style={{ borderColor: B.border }}
                value={form.role}
                disabled={Boolean(editRow)}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "" | SchemeRole }))}
              >
                <option value="">All roles</option>
                {(Object.keys(ROLE_LABEL) as SchemeRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]} only
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
                  className={fieldCls}
                  style={{ borderColor: B.border }}
                  value={form.ruleType}
                  onChange={(e) => setForm((f) => ({ ...f, ruleType: e.target.value as RuleType }))}
                >
                  <option value="flat">Flat (₹)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  {form.ruleType === "flat" ? "Fee (₹)" : "Fee (%)"}
                </span>
                <input
                  className={fieldCls}
                  style={{ borderColor: B.border }}
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={form.ruleType === "flat" ? "e.g. 10" : "e.g. 1"}
                  inputMode="decimal"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Slab from (₹, optional)
                </span>
                <input
                  className={fieldCls}
                  style={{ borderColor: B.border }}
                  value={form.minAmount}
                  disabled={Boolean(editRow)}
                  onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))}
                  placeholder="Any"
                  inputMode="decimal"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Slab to (₹, optional)
                </span>
                <input
                  className={fieldCls}
                  style={{ borderColor: B.border }}
                  value={form.maxAmount}
                  disabled={Boolean(editRow)}
                  onChange={(e) => setForm((f) => ({ ...f, maxAmount: e.target.value }))}
                  placeholder="Any"
                  inputMode="decimal"
                />
              </label>
            </div>

            {editRow ? (
              <p className="text-xs" style={{ color: B.muted }}>
                Service, role and slab stay the same; end this fee and add a new one to change them.
              </p>
            ) : null}
            {touched && error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}

            {editRow ? (
              <div className="grid grid-cols-2 gap-2">
                <Btn variant="destructive" onClick={cancelEdit}>
                  Cancel
                </Btn>
                <Btn variant="primary" type="submit" disabled={saving}>
                  Save changes
                </Btn>
              </div>
            ) : (
              <Btn variant="success" type="submit" className="w-full" disabled={saving}>
                <Plus size={14} /> Add fee
              </Btn>
            )}
          </form>

          <div className="space-y-3 rounded-2xl border p-5" style={{ borderColor: B.border, background: B.card }}>
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              How fees apply
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-sm" style={{ color: B.muted }}>
              <li>Charged on debit balance flows (money transfer, bills, recharge).</li>
              <li>More specific rules win: provider + role → provider → role → all roles.</li>
              <li>Flat is rupees per txn; percentage is of the principal (max 100%).</li>
              <li>No matching live rule means customer fee is ₹0.</li>
              <li>Saving a change ends the old fee and starts a new version from now; history stays in Rate audit.</li>
              <li>GST on the fee follows Tax → Tax settings.</li>
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border p-5" style={{ borderColor: B.border, background: B.card }}>
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
            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Status
              </span>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "" | FeeStatus)}
              >
                <option value="live">Live</option>
                <option value="scheduled">Scheduled</option>
                <option value="ended">Ended</option>
                <option value="">All</option>
              </select>
            </label>
            <Btn variant="secondary" onClick={() => void load()}>
              <RefreshCw size={14} /> Refresh
            </Btn>
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading customer fees…
            </p>
          ) : !filtered.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No customer fees match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="py-2 pr-3 font-semibold">Service</th>
                    <th className="py-2 pr-3 font-semibold">Charged to</th>
                    <th className="py-2 pr-3 font-semibold">Fee</th>
                    <th className="py-2 pr-3 font-semibold">Slab</th>
                    <th className="py-2 pr-3 font-semibold">Effective</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const status = statusOf(row, now);
                    const chip = STATUS_CHIP[status];
                    return (
                      <tr key={row.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                        <td className="py-3 pr-3">
                          <div className="font-medium" style={{ color: B.blue }}>
                            {row.serviceName}
                          </div>
                          <div className="font-mono text-[11px]" style={{ color: B.muted }}>
                            {row.serviceCode}
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <div>{feePayerLabel(row.role)}</div>
                          <div className="text-[11px]" style={{ color: B.muted }}>
                            {row.providerName ?? "All providers"}
                          </div>
                        </td>
                        <td className="py-3 pr-3 font-semibold" style={{ color: B.blue }}>
                          {ruleLabel(row.ruleType, row.value)}
                        </td>
                        <td className="py-3 pr-3 text-xs" style={{ color: B.muted }}>
                          {slabLabel(row.minAmount, row.maxAmount)}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-3 text-xs" style={{ color: B.muted }}>
                          {formatWhen(row.effectiveFrom)}
                          {row.effectiveTo ? ` → ${formatWhen(row.effectiveTo)}` : ""}
                        </td>
                        <td className="py-3 pr-3">
                          <Chip tone={chip.tone}>{chip.label}</Chip>
                        </td>
                        <td className="py-3 text-right">
                          {status === "ended" ? (
                            <span className="text-xs" style={{ color: B.muted }}>
                              —
                            </span>
                          ) : (
                            <div className="flex justify-end gap-1.5">
                              {status === "live" ? (
                                <Btn variant="secondary" className="px-2 py-1 text-xs" onClick={() => startEdit(row)}>
                                  <Pencil size={13} /> Edit
                                </Btn>
                              ) : null}
                              <Btn variant="destructive" className="px-2 py-1 text-xs" onClick={() => endRow(row)}>
                                <Trash2 size={13} /> End
                              </Btn>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {saveReq ? (
        <SaveConfirmModal
          title={saveReq.title}
          changes={saveReq.changes}
          warnings={saveReq.warnings}
          busy={saving}
          onConfirm={(reason) => void runSave(reason)}
          onClose={() => setSaveReq(null)}
        />
      ) : null}
    </AdminShell>
  );
}
