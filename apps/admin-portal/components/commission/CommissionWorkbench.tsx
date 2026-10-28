"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Calculator, Download, Percent, Plus } from "lucide-react";
import { ConfirmModal, type ConfirmTone } from "@/components/ui/ConfirmModal";
import { TableActionButtons } from "@/components/ui/TableActionButtons";
import { DateField, MonthField } from "@/components/ui/DateField";
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
export type CommissionWorkbenchTab = "schemes" | "payouts" | "registers";
type RegisterKind = "tds" | "dmt_gst";
type ClawbackFilter = "active" | "clawed" | "all";

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

interface CommissionRule {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  categoryName: string;
  providerId: string | null;
  providerName: string | null;
  role: SchemeRole;
  ruleType: RuleType;
  value: string;
  minAmount: string | null;
  maxAmount: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

interface PreviewSplit {
  role: SchemeRole;
  ruleId: string | null;
  ruleType: RuleType | null;
  value: string | null;
  payout: string;
  gross?: string;
  tds?: string;
  net?: string;
  matched: boolean;
}

interface PreviewResult {
  serviceId: string;
  amount: string;
  tax?: {
    tdsApplies: boolean;
    tdsPercent: string;
    gstOnFeeApplies: boolean;
    gstOnFeePercent: string;
  };
  splits: PreviewSplit[];
  totalPayout: string;
  totalGross?: string;
  underwater?: {
    providerPool: string;
    totalGross: string;
    shortfall: string;
    isUnderwater: boolean;
  } | null;
}

interface PayoutRow {
  id: string;
  amount: string;
  role: SchemeRole;
  createdAt: string;
  reversedAt: string | null;
  clawedBack: boolean;
  txnRef: string;
  txnAmount: string;
  serviceName: string;
  serviceCode: string;
  beneficiaryName: string;
  beneficiaryUid: string;
  beneficiaryMobile: string;
}

interface PayoutPayload {
  summary: { total: string; count: number };
  rows: PayoutRow[];
}

interface TdsRegisterRow {
  month: string;
  beneficiaryName: string;
  beneficiaryUid: string;
  beneficiaryMobile: string;
  role: SchemeRole;
  grossAmount: string;
  tdsAmount: string;
  netAmount: string;
  creditCount: number;
  clawedCreditCount: number;
  clawedBack: boolean;
}

interface TdsRegisterPayload {
  summary: { totalGross: string; totalTds: string; totalNet: string; count: number };
  rows: TdsRegisterRow[];
}

interface DmtGstRegisterRow {
  id: string;
  txnRef: string;
  createdAt: string;
  amount: string;
  customerFee: string;
  customerFeeGst: string;
  status: string;
  serviceName: string;
  serviceCode: string;
  agentName: string;
  agentUid: string;
  agentMobile: string;
}

interface DmtGstRegisterPayload {
  summary: { totalFee: string; totalGst: string; count: number };
  rows: DmtGstRegisterRow[];
}

const ROLE_LABEL: Record<SchemeRole, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  super_distributor: "Super Distributor",
};

const CLAWBACK_LABEL: Record<ClawbackFilter, string> = {
  active: "Active",
  clawed: "Clawed back",
  all: "All",
};

function ClawedBackBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: "#FEE2E2", color: "#B91C1C" }}
    >
      Clawed back
    </span>
  );
}

const EMPTY_FORM = {
  serviceId: "",
  role: "retailer" as SchemeRole,
  ruleType: "percentage" as RuleType,
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

function downloadCsv(filename: string, header: string[], lines: string[][]) {
  const body = [header, ...lines]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, "'")}"`).join(","))
    .join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function currentMonthYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function CommissionWorkbench({
  tab,
  initialServiceId = "",
}: {
  tab: CommissionWorkbenchTab;
  /** Deep-link from underwater report → filter schemes. */
  initialServiceId?: string;
}) {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [roleFilter, setRoleFilter] = useState<"" | SchemeRole>("");
  const [serviceFilter, setServiceFilter] = useState(initialServiceId);
  const [previewServiceId, setPreviewServiceId] = useState("");
  const [previewAmount, setPreviewAmount] = useState("1000");
  const [previewPool, setPreviewPool] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const [payouts, setPayouts] = useState<PayoutPayload | null>(null);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutRole, setPayoutRole] = useState<"" | SchemeRole>("");
  const [payoutClawback, setPayoutClawback] = useState<ClawbackFilter>("active");
  const [payoutQ, setPayoutQ] = useState("");
  const [payoutSince, setPayoutSince] = useState("");
  const [payoutUntil, setPayoutUntil] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [registerKind, setRegisterKind] = useState<RegisterKind>("tds");
  const [regMonth, setRegMonth] = useState(currentMonthYmd());
  const [regRole, setRegRole] = useState<"" | SchemeRole>("");
  const [regClawback, setRegClawback] = useState<ClawbackFilter>("active");
  const [regQ, setRegQ] = useState("");
  const [regSince, setRegSince] = useState("");
  const [regUntil, setRegUntil] = useState("");
  const [tdsReg, setTdsReg] = useState<TdsRegisterPayload | null>(null);
  const [dmtGstReg, setDmtGstReg] = useState<DmtGstRegisterPayload | null>(null);
  const [regLoading, setRegLoading] = useState(false);

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
      const [ruleRows, cats] = await Promise.all([
        fetchApi<CommissionRule[]>("/admin/commission/rules"),
        fetchApi<CatalogCategory[]>("/admin/catalog"),
      ]);
      setRules(ruleRows);
      setCatalog(cats);
      setPreviewServiceId((prev) => prev || cats.find((c) => c.isActive)?.services[0]?.id || "");
      setForm((f) =>
        f.serviceId ? f : { ...f, serviceId: cats.find((c) => c.isActive)?.services[0]?.id || "" },
      );
    } catch (err) {
      toast.error(errMessage(err, "Failed to load commission schemes"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    setPayoutsLoading(true);
    try {
      const params: Record<string, string> = { limit: "100", clawback: payoutClawback };
      if (payoutRole) params.role = payoutRole;
      if (payoutQ.trim()) params.q = payoutQ.trim();
      if (payoutSince) params.since = new Date(payoutSince).toISOString();
      if (payoutUntil) {
        const end = new Date(payoutUntil);
        end.setHours(23, 59, 59, 999);
        params.until = end.toISOString();
      }
      setPayouts(await fetchApi<PayoutPayload>("/admin/commission/payouts", params));
    } catch (err) {
      toast.error(errMessage(err, "Failed to load commission payouts"));
    } finally {
      setPayoutsLoading(false);
    }
  }, [payoutRole, payoutClawback, payoutQ, payoutSince, payoutUntil]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load]);

  useEffect(() => {
    if (!hydrated || !accessToken || tab !== "payouts") return;
    void loadPayouts();
  }, [hydrated, accessToken, tab, loadPayouts]);

  const loadRegisters = useCallback(async () => {
    setRegLoading(true);
    try {
      if (registerKind === "tds") {
        const params: Record<string, string> = { limit: "200", clawback: regClawback };
        if (regMonth) params.month = regMonth;
        if (regRole) params.role = regRole;
        if (regQ.trim()) params.q = regQ.trim();
        setTdsReg(await fetchApi<TdsRegisterPayload>("/admin/commission/tax-registers/tds", params));
      } else {
        const params: Record<string, string> = { limit: "200" };
        if (regQ.trim()) params.q = regQ.trim();
        if (regSince) params.since = new Date(regSince).toISOString();
        if (regUntil) {
          const end = new Date(regUntil);
          end.setHours(23, 59, 59, 999);
          params.until = end.toISOString();
        }
        setDmtGstReg(
          await fetchApi<DmtGstRegisterPayload>("/admin/commission/tax-registers/dmt-gst", params),
        );
      }
    } catch (err) {
      toast.error(errMessage(err, "Failed to load tax register"));
    } finally {
      setRegLoading(false);
    }
  }, [registerKind, regMonth, regRole, regClawback, regQ, regSince, regUntil]);

  useEffect(() => {
    if (!hydrated || !accessToken || tab !== "registers") return;
    void loadRegisters();
  }, [hydrated, accessToken, tab, loadRegisters]);

  useEffect(() => {
    if (!initialServiceId) return;
    setServiceFilter(initialServiceId);
    if (tab === "schemes") {
      setPreviewServiceId(initialServiceId);
      setForm((f) => ({ ...f, serviceId: initialServiceId }));
    }
  }, [tab, initialServiceId]);

  const filteredRules = useMemo(() => {
    let rows = rules;
    if (serviceFilter) rows = rows.filter((r) => r.serviceId === serviceFilter);
    if (roleFilter) rows = rows.filter((r) => r.role === roleFilter);
    return rows;
  }, [rules, roleFilter, serviceFilter]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.serviceId) {
      toast.error("Select a service");
      return;
    }
    if (!form.value.trim()) {
      toast.error("Enter a commission value");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/commission/rules", {
        serviceId: form.serviceId,
        role: form.role,
        ruleType: form.ruleType,
        value: form.value.trim(),
        minAmount: form.minAmount.trim() || null,
        maxAmount: form.maxAmount.trim() || null,
        isActive: form.isActive,
      });
      toast.success("Commission rule created");
      setForm((f) => ({ ...EMPTY_FORM, serviceId: f.serviceId }));
      const ruleRows = await fetchApi<CommissionRule[]>("/admin/commission/rules");
      setRules(ruleRows);
    } catch (err) {
      toast.error(errMessage(err, "Could not create commission rule"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(rule: CommissionRule) {
    try {
      await api.patch(`/admin/commission/rules/${rule.id}`, { isActive: !rule.isActive });
      toast.success(rule.isActive ? "Rule deactivated" : "Rule activated");
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)),
      );
    } catch (err) {
      toast.error(errMessage(err, "Could not update rule"));
    }
  }

  async function executeRemoveRule(rule: CommissionRule) {
    setConfirmBusy(true);
    try {
      await api.delete(`/admin/commission/rules/${rule.id}`);
      toast.success("Commission rule deleted");
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      setPendingConfirm(null);
    } catch (err) {
      toast.error(errMessage(err, "Could not delete rule"));
    } finally {
      setConfirmBusy(false);
    }
  }

  function removeRule(rule: CommissionRule) {
    setPendingConfirm({
      title: "Delete commission rule?",
      message: (
        <>
          Delete {ROLE_LABEL[rule.role]} rule for{" "}
          <span className="font-semibold" style={{ color: B.blue }}>
            {rule.serviceName}
          </span>
          ?
        </>
      ),
      confirmLabel: "Delete rule",
      tone: "danger",
      action: () => void executeRemoveRule(rule),
    });
  }

  async function runPreview() {
    if (!previewServiceId) {
      toast.error("Select a service for preview");
      return;
    }
    if (!previewAmount.trim() || Number(previewAmount) <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    setPreviewing(true);
    try {
      const result = await api
        .post("/admin/commission/preview", {
          serviceId: previewServiceId,
          amount: previewAmount.trim(),
          ...(previewPool.trim() ? { providerPool: previewPool.trim() } : {}),
        })
        .then((r) => {
          if (!r.data.success) throw new Error(r.data.message || "Preview failed");
          return r.data.data as PreviewResult;
        });
      setPreview(result);
    } catch (err) {
      toast.error(errMessage(err, "Preview failed"));
    } finally {
      setPreviewing(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  const titles: Record<CommissionWorkbenchTab, { h: string; p: string }> = {
    schemes: {
      h: "Schemes",
      p: "Role-default slabs and preview. Per-agent overrides stay on agent detail.",
    },
    registers: {
      h: "Tax registers",
      p: "TDS by agent/month and DMT fee GST lines for CA export.",
    },
    payouts: {
      h: "Payouts",
      p: "Commission ledger credits paid to agents.",
    },
  };

  return (
    <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
            style={{ background: B.badgeGrad }}
          >
            <Percent size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              {titles[tab].h}
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              {titles[tab].p}
            </p>
          </div>
        </div>

        {tab === "registers" ? (
          <div className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <p className="text-sm" style={{ color: B.muted }}>
              TDS register groups commission credits by agent and month. DMT GST register lists customer fee GST
              lines for CA export (CSV).
            </p>
            <div className="flex gap-1 rounded-xl border p-1" style={{ borderColor: B.border }}>
              {(
                [
                  { id: "tds" as const, label: "TDS by agent / month" },
                  { id: "dmt_gst" as const, label: "DMT fee GST" },
                ] as const
              ).map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setRegisterKind(k.id)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{
                    background: registerKind === k.id ? B.badgeGrad : "transparent",
                    color: registerKind === k.id ? "#fff" : B.muted,
                  }}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {registerKind === "tds" ? (
                <>
                  <div className="block text-sm">
                    <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                      Month
                    </span>
                    <MonthField value={regMonth} onChange={setRegMonth} />
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                      Role
                    </span>
                    <select
                      className="rounded-xl border px-3 py-2 text-sm"
                      style={{ borderColor: B.border }}
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value as "" | SchemeRole)}
                    >
                      <option value="">All roles</option>
                      {(Object.keys(ROLE_LABEL) as SchemeRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                      Clawback
                    </span>
                    <select
                      className="rounded-xl border px-3 py-2 text-sm"
                      style={{ borderColor: B.border }}
                      value={regClawback}
                      onChange={(e) => setRegClawback(e.target.value as ClawbackFilter)}
                    >
                      {(Object.keys(CLAWBACK_LABEL) as ClawbackFilter[]).map((k) => (
                        <option key={k} value={k}>
                          {CLAWBACK_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <div className="block text-sm">
                    <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                      From
                    </span>
                    <DateField
                      value={regSince}
                      rangePeer={regUntil}
                      rangeRole="start"
                      max={regUntil || undefined}
                      onChange={setRegSince}
                    />
                  </div>
                  <div className="block text-sm">
                    <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                      To
                    </span>
                    <DateField
                      value={regUntil}
                      rangePeer={regSince}
                      rangeRole="end"
                      min={regSince || undefined}
                      onChange={setRegUntil}
                    />
                  </div>
                </>
              )}
              <label className="block min-w-[180px] flex-1 text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Search
                </span>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: B.border }}
                  value={regQ}
                  onChange={(e) => setRegQ(e.target.value)}
                  placeholder="Name / UID / mobile…"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadRegisters()}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-white"
                style={{ background: B.badgeGrad }}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  if (registerKind === "tds") {
                    if (!tdsReg?.rows.length) {
                      toast.error("No TDS rows to download.");
                      return;
                    }
                    downloadCsv(
                      `asanpay-tds-${regMonth || "all"}.csv`,
                      [
                        "Month",
                        "Name",
                        "UID",
                        "Mobile",
                        "Role",
                        "Gross",
                        "TDS",
                        "Net",
                        "Credits",
                        "Clawed credits",
                        "Status",
                      ],
                      tdsReg.rows.map((r) => [
                        r.month,
                        r.beneficiaryName,
                        r.beneficiaryUid,
                        r.beneficiaryMobile,
                        ROLE_LABEL[r.role] ?? r.role,
                        r.grossAmount,
                        r.tdsAmount,
                        r.netAmount,
                        String(r.creditCount),
                        String(r.clawedCreditCount ?? 0),
                        r.clawedBack ? "Clawed back" : "Active",
                      ]),
                    );
                    return;
                  }
                  if (!dmtGstReg?.rows.length) {
                    toast.error("No DMT GST rows to download.");
                    return;
                  }
                  downloadCsv(
                    "asanpay-dmt-fee-gst.csv",
                    ["When", "Txn", "Agent", "UID", "Mobile", "Service", "Amount", "Fee", "GST", "Status"],
                    dmtGstReg.rows.map((r) => [
                      formatWhen(r.createdAt),
                      r.txnRef,
                      r.agentName,
                      r.agentUid,
                      r.agentMobile,
                      r.serviceName,
                      r.amount,
                      r.customerFee,
                      r.customerFeeGst,
                      r.status,
                    ]),
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-bold"
                style={{ borderColor: B.border, color: B.blue }}
              >
                <Download size={14} />
                CSV
              </button>
            </div>

            {registerKind === "tds" ? (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="rounded-xl border px-4 py-3" style={{ borderColor: B.border }}>
                    <div className="text-xs" style={{ color: B.muted }}>
                      Credits
                    </div>
                    <div className="text-lg font-bold" style={{ color: B.blue }}>
                      {tdsReg?.summary.count ?? 0}
                    </div>
                  </div>
                  <div className="rounded-xl border px-4 py-3" style={{ borderColor: B.border }}>
                    <div className="text-xs" style={{ color: B.muted }}>
                      Total TDS
                    </div>
                    <div className="text-lg font-bold" style={{ color: B.blue }}>
                      ₹{tdsReg?.summary.totalTds ?? "0"}
                    </div>
                  </div>
                  <div className="rounded-xl border px-4 py-3" style={{ borderColor: B.border }}>
                    <div className="text-xs" style={{ color: B.muted }}>
                      Total net
                    </div>
                    <div className="text-lg font-bold" style={{ color: B.blue }}>
                      ₹{tdsReg?.summary.totalNet ?? "0"}
                    </div>
                  </div>
                </div>
                {regLoading ? (
                  <p className="text-sm" style={{ color: B.muted }}>
                    Loading…
                  </p>
                ) : !tdsReg?.rows.length ? (
                  <p className="text-sm" style={{ color: B.muted }}>
                    No TDS rows for these filters.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left text-sm">
                      <thead>
                        <tr
                          className="border-b text-xs uppercase tracking-wide"
                          style={{ borderColor: B.border, color: B.muted }}
                        >
                          <th className="py-2 pr-3 font-semibold">Month</th>
                          <th className="py-2 pr-3 font-semibold">Agent</th>
                          <th className="py-2 pr-3 font-semibold">Role</th>
                          <th className="py-2 pr-3 font-semibold">Status</th>
                          <th className="py-2 pr-3 font-semibold text-right">Gross</th>
                          <th className="py-2 pr-3 font-semibold text-right">TDS</th>
                          <th className="py-2 pr-3 font-semibold text-right">Net</th>
                          <th className="py-2 font-semibold text-right">Credits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tdsReg.rows.map((row) => (
                          <tr
                            key={`${row.month}-${row.beneficiaryUid}-${row.role}`}
                            className="border-b last:border-0"
                            style={{ borderColor: B.border }}
                          >
                            <td className="py-3 pr-3 whitespace-nowrap">{row.month}</td>
                            <td className="py-3 pr-3">
                              <div className="font-medium" style={{ color: B.blue }}>
                                {row.beneficiaryName}
                              </div>
                              <div className="text-xs" style={{ color: B.muted }}>
                                {row.beneficiaryUid} · {row.beneficiaryMobile}
                              </div>
                            </td>
                            <td className="py-3 pr-3">{ROLE_LABEL[row.role] ?? row.role}</td>
                            <td className="py-3 pr-3">
                              {row.clawedBack ? (
                                <div className="space-y-1">
                                  <ClawedBackBadge />
                                  {(row.clawedCreditCount ?? 0) > 0 &&
                                  (row.clawedCreditCount ?? 0) < row.creditCount ? (
                                    <div className="text-[11px]" style={{ color: B.muted }}>
                                      {row.clawedCreditCount} of {row.creditCount}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-xs" style={{ color: B.muted }}>
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-3 text-right">₹{row.grossAmount}</td>
                            <td className="py-3 pr-3 text-right font-semibold">₹{row.tdsAmount}</td>
                            <td className="py-3 pr-3 text-right">₹{row.netAmount}</td>
                            <td className="py-3 text-right">{row.creditCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="rounded-xl border px-4 py-3" style={{ borderColor: B.border }}>
                    <div className="text-xs" style={{ color: B.muted }}>
                      Txns
                    </div>
                    <div className="text-lg font-bold" style={{ color: B.blue }}>
                      {dmtGstReg?.summary.count ?? 0}
                    </div>
                  </div>
                  <div className="rounded-xl border px-4 py-3" style={{ borderColor: B.border }}>
                    <div className="text-xs" style={{ color: B.muted }}>
                      Total fee GST
                    </div>
                    <div className="text-lg font-bold" style={{ color: B.blue }}>
                      ₹{dmtGstReg?.summary.totalGst ?? "0"}
                    </div>
                  </div>
                </div>
                {regLoading ? (
                  <p className="text-sm" style={{ color: B.muted }}>
                    Loading…
                  </p>
                ) : !dmtGstReg?.rows.length ? (
                  <p className="text-sm" style={{ color: B.muted }}>
                    No DMT fee GST rows for these filters.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead>
                        <tr
                          className="border-b text-xs uppercase tracking-wide"
                          style={{ borderColor: B.border, color: B.muted }}
                        >
                          <th className="py-2 pr-3 font-semibold">When</th>
                          <th className="py-2 pr-3 font-semibold">Agent</th>
                          <th className="py-2 pr-3 font-semibold">Service</th>
                          <th className="py-2 pr-3 font-semibold">Txn</th>
                          <th className="py-2 pr-3 font-semibold text-right">Fee</th>
                          <th className="py-2 pr-3 font-semibold text-right">GST</th>
                          <th className="py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dmtGstReg.rows.map((row) => (
                          <tr key={row.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                            <td className="py-3 pr-3 whitespace-nowrap" style={{ color: B.muted }}>
                              {formatWhen(row.createdAt)}
                            </td>
                            <td className="py-3 pr-3">
                              <div className="font-medium" style={{ color: B.blue }}>
                                {row.agentName}
                              </div>
                              <div className="text-xs" style={{ color: B.muted }}>
                                {row.agentUid} · {row.agentMobile}
                              </div>
                            </td>
                            <td className="py-3 pr-3">
                              <div>{row.serviceName}</div>
                              <div className="font-mono text-[11px]" style={{ color: B.muted }}>
                                {row.serviceCode}
                              </div>
                            </td>
                            <td className="py-3 pr-3 font-mono text-xs">{row.txnRef}</td>
                            <td className="py-3 pr-3 text-right">₹{row.customerFee}</td>
                            <td className="py-3 pr-3 text-right font-semibold">₹{row.customerFeeGst}</td>
                            <td className="py-3">{row.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        ) : tab === "payouts" ? (
          <div className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Role
                </span>
                <select
                  className="rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: B.border }}
                  value={payoutRole}
                  onChange={(e) => setPayoutRole(e.target.value as "" | SchemeRole)}
                >
                  <option value="">All roles</option>
                  {(Object.keys(ROLE_LABEL) as SchemeRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Clawback
                </span>
                <select
                  className="rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: B.border }}
                  value={payoutClawback}
                  onChange={(e) => setPayoutClawback(e.target.value as ClawbackFilter)}
                >
                  {(Object.keys(CLAWBACK_LABEL) as ClawbackFilter[]).map((k) => (
                    <option key={k} value={k}>
                      {CLAWBACK_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  From
                </span>
                <DateField
                  value={payoutSince}
                  rangePeer={payoutUntil}
                  rangeRole="start"
                  max={payoutUntil || undefined}
                  onChange={setPayoutSince}
                />
              </div>
              <div className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  To
                </span>
                <DateField
                  value={payoutUntil}
                  rangePeer={payoutSince}
                  rangeRole="end"
                  min={payoutSince || undefined}
                  onChange={setPayoutUntil}
                />
              </div>
              <label className="block min-w-[180px] flex-1 text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Search (name / UID / mobile / txn)
                </span>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: B.border }}
                  value={payoutQ}
                  onChange={(e) => setPayoutQ(e.target.value)}
                  placeholder="Search…"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadPayouts()}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-white"
                style={{ background: B.badgeGrad }}
              >
                Apply
              </button>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <div className="rounded-xl border px-4 py-3" style={{ borderColor: B.border }}>
                <div className="text-xs" style={{ color: B.muted }}>
                  Matching payouts
                </div>
                <div className="text-lg font-bold" style={{ color: B.blue }}>
                  {payouts?.summary.count ?? 0}
                </div>
              </div>
              <div className="rounded-xl border px-4 py-3" style={{ borderColor: B.border }}>
                <div className="text-xs" style={{ color: B.muted }}>
                  Total paid
                </div>
                <div className="text-lg font-bold" style={{ color: B.blue }}>
                  ₹{payouts?.summary.total ?? "0"}
                </div>
              </div>
            </div>

            {payoutsLoading ? (
              <p className="text-sm" style={{ color: B.muted }}>
                Loading…
              </p>
            ) : !payouts?.rows.length ? (
              <p className="text-sm" style={{ color: B.muted }}>
                No commission payouts match these filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr
                      className="border-b text-xs uppercase tracking-wide"
                      style={{ borderColor: B.border, color: B.muted }}
                    >
                      <th className="py-2 pr-3 font-semibold">When</th>
                      <th className="py-2 pr-3 font-semibold">Beneficiary</th>
                      <th className="py-2 pr-3 font-semibold">Role</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 pr-3 font-semibold">Service</th>
                      <th className="py-2 pr-3 font-semibold">Txn</th>
                      <th className="py-2 font-semibold text-right">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                        <td className="py-3 pr-3 whitespace-nowrap" style={{ color: B.muted }}>
                          {formatWhen(row.createdAt)}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="font-medium" style={{ color: B.blue }}>
                            {row.beneficiaryName}
                          </div>
                          <div className="text-xs" style={{ color: B.muted }}>
                            {row.beneficiaryUid} · {row.beneficiaryMobile}
                          </div>
                        </td>
                        <td className="py-3 pr-3">{ROLE_LABEL[row.role] ?? row.role}</td>
                        <td className="py-3 pr-3">
                          {row.clawedBack ? (
                            <div className="space-y-1">
                              <ClawedBackBadge />
                              {row.reversedAt ? (
                                <div className="text-[11px]" style={{ color: B.muted }}>
                                  {formatWhen(row.reversedAt)}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: B.muted }}>
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <div>{row.serviceName}</div>
                          <div className="font-mono text-[11px]" style={{ color: B.muted }}>
                            {row.serviceCode}
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <div className="font-mono text-xs">{row.txnRef}</div>
                          <div className="text-xs" style={{ color: B.muted }}>
                            ₹{row.txnAmount}
                          </div>
                        </td>
                        <td className="py-3 text-right font-semibold" style={{ color: B.blue }}>
                          ₹{row.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <>
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={onCreate}
            className="space-y-4 rounded-2xl border bg-white p-5"
            style={{ borderColor: B.border }}
          >
            <div className="flex items-center gap-2">
              <Plus size={18} style={{ color: B.blue }} />
              <h2 className="text-base font-bold" style={{ color: B.blue }}>
                Add role slab
              </h2>
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

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Role
                </span>
                <select
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as SchemeRole }))}
                >
                  {(Object.keys(ROLE_LABEL) as SchemeRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Type
                </span>
                <select
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                  value={form.ruleType}
                  onChange={(e) => setForm((f) => ({ ...f, ruleType: e.target.value as RuleType }))}
                >
                  <option value="percentage">Percentage</option>
                  <option value="flat">Flat (₹)</option>
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Value {form.ruleType === "percentage" ? "(%)" : "(₹)"}
              </span>
              <input
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border }}
                inputMode="decimal"
                placeholder={form.ruleType === "percentage" ? "e.g. 0.5" : "e.g. 5"}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Min amount (optional)
                </span>
                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                  inputMode="decimal"
                  placeholder="0"
                  value={form.minAmount}
                  onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                  Max amount (optional)
                </span>
                <input
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                  inputMode="decimal"
                  placeholder="No max"
                  value={form.maxAmount}
                  onChange={(e) => setForm((f) => ({ ...f, maxAmount: e.target.value }))}
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Saving…" : "Create rule"}
            </button>
          </form>

          <div className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <div className="flex items-center gap-2">
              <Calculator size={18} style={{ color: B.blue }} />
              <h2 className="text-base font-bold" style={{ color: B.blue }}>
                Preview calculator
              </h2>
            </div>
            <p className="text-xs" style={{ color: B.muted }}>
              Enter a txn amount to see role-default payouts (ignores per-agent overrides).
            </p>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Service
              </span>
              <select
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border }}
                value={previewServiceId}
                onChange={(e) => setPreviewServiceId(e.target.value)}
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
                Amount (₹)
              </span>
              <input
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border }}
                inputMode="decimal"
                value={previewAmount}
                onChange={(e) => setPreviewAmount(e.target.value)}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Provider pool ₹ (optional)
              </span>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={previewPool}
                onChange={(e) => setPreviewPool(e.target.value)}
                placeholder="e.g. 12.50"
              />
            </label>

            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={previewing}
              className="w-full rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-60"
              style={{ borderColor: B.blue, color: B.blue }}
            >
              {previewing ? "Calculating…" : "Calculate split"}
            </button>

            {preview && (
              <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: B.border }}>
                {preview.tax ? (
                  <p className="text-xs" style={{ color: B.muted }}>
                    Tax: TDS {preview.tax.tdsApplies ? `${preview.tax.tdsPercent}%` : "off"}
                    {preview.tax.gstOnFeeApplies
                      ? ` · Fee GST ${preview.tax.gstOnFeePercent}%`
                      : " · Fee GST off"}
                  </p>
                ) : null}
                {preview.underwater?.isUnderwater ? (
                  <div
                    className="rounded-xl border px-3 py-2 text-xs font-semibold"
                    style={{ borderColor: "#FDBA74", background: "#FFF7ED", color: "#C2410C" }}
                  >
                    Underwater: scheme gross ₹{preview.underwater.totalGross} exceeds provider pool ₹
                    {preview.underwater.providerPool} by ₹{preview.underwater.shortfall}. Lower slabs or raise
                    the pool before going live.
                  </div>
                ) : preview.underwater ? (
                  <p className="text-xs font-semibold" style={{ color: "#15803D" }}>
                    Pool OK: gross ₹{preview.underwater.totalGross} ≤ provider pool ₹
                    {preview.underwater.providerPool}.
                  </p>
                ) : null}
                {preview.splits.map((s) => (
                  <div key={s.role} className="flex items-center justify-between gap-2 text-sm">
                    <span style={{ color: B.muted }}>
                      {ROLE_LABEL[s.role]}
                      {s.matched
                        ? ` · ${s.ruleType === "flat" ? `₹${s.value}` : `${s.value}%`}`
                        : " · no rule"}
                    </span>
                    <span className="text-right font-semibold" style={{ color: B.blue }}>
                      {s.matched && s.gross != null ? (
                        <>
                          <span className="block text-[11px] font-medium" style={{ color: B.muted }}>
                            Gross ₹{s.gross} · TDS ₹{s.tds ?? "0.00"}
                          </span>
                          Net ₹{s.net ?? s.payout}
                        </>
                      ) : (
                        <>₹{s.payout}</>
                      )}
                    </span>
                  </div>
                ))}
                <div
                  className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-bold"
                  style={{ borderColor: B.border, color: B.blue }}
                >
                  <span>Total net payout</span>
                  <span>₹{preview.totalPayout}</span>
                </div>
                {preview.totalGross ? (
                  <div className="flex items-center justify-between text-xs font-semibold" style={{ color: B.muted }}>
                    <span>Total gross (before TDS)</span>
                    <span>₹{preview.totalGross}</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Active schemes
            </h2>
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
              >
                <option value="">All services</option>
                {serviceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "" | SchemeRole)}
              >
                <option value="">All roles</option>
                {(Object.keys(ROLE_LABEL) as SchemeRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : filteredRules.length === 0 ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No role-default rules yet. Add a slab above — successful retailer transactions will credit matching ancestors.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: B.border, color: B.muted }}>
                    <th className="py-2 pr-3 font-semibold">Service</th>
                    <th className="py-2 pr-3 font-semibold">Role</th>
                    <th className="py-2 pr-3 font-semibold">Rate</th>
                    <th className="py-2 pr-3 font-semibold">Slab</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map((rule) => (
                    <tr key={rule.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="py-3 pr-3">
                        <div className="font-medium" style={{ color: B.blue }}>
                          {rule.serviceName}
                        </div>
                        <div className="text-xs" style={{ color: B.muted }}>
                          {rule.categoryName}
                          {rule.providerName ? ` · ${rule.providerName}` : ""}
                        </div>
                      </td>
                      <td className="py-3 pr-3">{ROLE_LABEL[rule.role]}</td>
                      <td className="py-3 pr-3">
                        {rule.ruleType === "flat" ? `₹${rule.value}` : `${rule.value}%`}
                      </td>
                      <td className="py-3 pr-3" style={{ color: B.muted }}>
                        {rule.minAmount || rule.maxAmount
                          ? `₹${rule.minAmount ?? "0"} – ${rule.maxAmount ? `₹${rule.maxAmount}` : "∞"}`
                          : "Any amount"}
                      </td>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => void toggleActive(rule)}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold"
                          style={{
                            background: rule.isActive ? "#ecfdf5" : "#f3f4f6",
                            color: rule.isActive ? "#047857" : "#6b7280",
                          }}
                        >
                          {rule.isActive ? "Active" : "Off"}
                        </button>
                      </td>
                      <td className="py-3">
                        <TableActionButtons onDelete={() => void removeRule(rule)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </>
        )}

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
    </div>
  );
}
