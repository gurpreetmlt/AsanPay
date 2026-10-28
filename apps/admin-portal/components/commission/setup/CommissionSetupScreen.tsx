"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HelpCircle, Search, Sparkles, TableProperties, Wand2 } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { SaveConfirmModal } from "../rateCard/SaveConfirmModal";
import { usePendingSave } from "../rateCard/usePendingSave";
import {
  ROLE_LABEL,
  SCHEME_ROLES,
  inr,
  pct,
  ruleLabel,
  slabLabel,
  type FixedRule,
  type PendingChange,
  type RateCardData,
  type SchemeRole,
  type ServiceRow,
  type Slab,
} from "../rateCard/types";
import { Btn, Chip, NumberField, SplitModeSwitch, type SplitMode } from "../rateCard/ui";

type RoleDraft = { mode: SplitMode; value: string };
type ServiceDraft = Record<SchemeRole, RoleDraft>;

/** What pays a role today, read from the all-providers share and fixed rules. */
type RoleCurrent = {
  mode: SplitMode;
  /** "" = role gets nothing (or only an old rule, see `legacy`). */
  value: string;
  shareId: string | null;
  rules: FixedRule[];
  /** Old fixed rules this screen cannot show as one value (% of amount, slabs, several rows). */
  legacy: string | null;
};

const EXAMPLE_AMOUNT = 2000;

const num = (v: string) => String(Number(v));
const toPaise = (v: string | number) => Math.round(Number(v) * 100);
const rupees = (paise: number) => inr(paise / 100);

function emptyDraft(): ServiceDraft {
  return {
    retailer: { mode: "percent", value: "" },
    distributor: { mode: "percent", value: "" },
    super_distributor: { mode: "percent", value: "" },
  };
}

function currentFor(row: ServiceRow, role: SchemeRole): RoleCurrent {
  const share = row.shares[role];
  const rules = row.fixedRules.filter((r) => r.role === role && r.providerId === null);
  if (share) return { mode: "percent", value: num(share.sharePercent), shareId: share.id, rules, legacy: null };
  const only = rules.length === 1 ? rules[0]! : null;
  if (only && only.ruleType === "flat" && only.minAmount == null && only.maxAmount == null) {
    return { mode: "flat", value: num(only.value), shareId: null, rules, legacy: null };
  }
  const legacy = rules.length
    ? rules.map((r) => `${ruleLabel(r.ruleType, r.value)} (${slabLabel(r.minAmount, r.maxAmount)})`).join(", ")
    : null;
  return { mode: "percent", value: "", shareId: null, rules, legacy };
}

function draftOf(row: ServiceRow): ServiceDraft {
  const d = emptyDraft();
  for (const role of SCHEME_ROLES) {
    const c = currentFor(row, role);
    d[role] = { mode: c.mode, value: c.value };
  }
  return d;
}

function roleChanged(cur: RoleCurrent, d: RoleDraft): boolean {
  const v = d.value.trim();
  if (v === "") return cur.value !== "";
  if (cur.value === "") return true;
  return d.mode !== cur.mode || Number(v) !== Number(cur.value);
}

function draftError(role: SchemeRole, d: RoleDraft): string | null {
  const v = d.value.trim();
  if (v === "") return null;
  const n = Number(v);
  const who = ROLE_LABEL[role];
  if (!Number.isFinite(n) || n < 0) return `${who} amount must be 0 or more`;
  if (d.mode === "percent" && n > 100) return `${who} share must be from 0 to 100%`;
  if (d.mode === "flat" && n > 500) return `${who} flat amount cannot be more than ₹500`;
  return null;
}

function describe(cur: RoleCurrent): string {
  if (cur.legacy) return "Old rule";
  if (cur.value === "") return "Off";
  return cur.mode === "percent" ? `${pct(cur.value)} of company income` : `${inr(cur.value)} flat`;
}

/** Role ₹ on one slab: the server's figure while unchanged, else the draft applied to that slab. */
function roleGrossPaise(slab: Slab, role: SchemeRole, cur: RoleCurrent, d: RoleDraft): number {
  if (!roleChanged(cur, d)) return toPaise(slab.roles.find((r) => r.role === role)?.gross ?? 0);
  const v = d.value.trim();
  if (v === "") return 0;
  if (d.mode === "flat") return toPaise(v);
  if (slab.providerIncome == null) return 0;
  return Math.round((toPaise(slab.providerIncome) * Number(v)) / 100);
}

function keepsPaise(slab: Slab, currents: Record<SchemeRole, RoleCurrent>, draft: ServiceDraft): number | null {
  if (slab.providerIncome == null) return null;
  const roles = SCHEME_ROLES.reduce((s, role) => s + roleGrossPaise(slab, role, currents[role], draft[role]), 0);
  return toPaise(slab.providerIncome) - roles;
}

function exampleSlab(row: ServiceRow): Slab | undefined {
  const withIncome = row.slabs.filter((s) => s.providerIncome != null);
  const pool = withIncome.length > 0 ? withIncome : row.slabs;
  return (
    pool.find(
      (s) =>
        (s.minAmount == null || Number(s.minAmount) <= EXAMPLE_AMOUNT) &&
        (s.maxAmount == null || Number(s.maxAmount) >= EXAMPLE_AMOUNT),
    ) ?? pool[0]
  );
}

function incomeRuleFor(row: ServiceRow, slab: Slab) {
  const sample = Number(slab.sampleAmount);
  return row.providerIncomeRules.find(
    (r) => (r.minAmount == null || Number(r.minAmount) <= sample) && (r.maxAmount == null || Number(r.maxAmount) >= sample),
  );
}

function sheetReady(row: ServiceRow): boolean {
  const rows = row.reference?.incomeRows;
  return row.providerIncomeRules.length === 0 && Boolean(rows?.length) && rows!.every((r) => r.value != null);
}

function askProvider(row: ServiceRow): boolean {
  if (row.providerIncomeRules.length > 0 || sheetReady(row)) return false;
  return Boolean(row.reference?.askProvider || row.reference?.incomeRows?.some((r) => r.value == null));
}

function roleChanges(row: ServiceRow, role: SchemeRole, cur: RoleCurrent, d: RoleDraft, nowIso: string): PendingChange[] {
  const label = `${row.serviceName} · ${ROLE_LABEL[role]}`;
  const v = d.value.trim();
  const endRules: PendingChange[] = cur.rules.map((r) => ({
    label,
    detail: `Old rule ends: ${ruleLabel(r.ruleType, r.value)} (${slabLabel(r.minAmount, r.maxAmount)})`,
    method: "patch",
    url: `/admin/commission/rules/${r.id}`,
    body: { effectiveTo: nowIso },
  }));
  const endShare: PendingChange[] = cur.shareId
    ? [
        {
          label,
          detail: `${pct(cur.value)} of company income ends`,
          method: "delete",
          url: `/admin/rate-card/shares/${cur.shareId}`,
          body: {},
        },
      ]
    : [];

  if (v === "") return [...endShare, ...endRules];
  if (d.mode === "percent") {
    return [
      {
        label,
        detail: `${describe(cur)} → ${pct(v)} of company income`,
        method: "post",
        url: "/admin/rate-card/shares",
        body: { serviceId: row.serviceId, providerId: null, role, sharePercent: v },
      },
      ...endRules,
    ];
  }
  return [
    {
      label,
      detail: `${describe(cur)} → ${inr(v)} flat per txn`,
      method: "post",
      url: "/admin/commission/rules",
      body: { serviceId: row.serviceId, providerId: null, role, ruleType: "flat", value: v },
    },
    ...endShare,
    ...endRules,
  ];
}

function RoleEditor({
  role,
  draft,
  cur,
  slab,
  onChange,
}: {
  role: SchemeRole;
  draft: RoleDraft;
  cur: RoleCurrent | null;
  slab: Slab | undefined;
  onChange: (d: RoleDraft) => void;
}) {
  const error = draftError(role, draft);
  const v = draft.value.trim();
  let hint: string;
  if (!cur || !slab) {
    hint = draft.mode === "percent" ? "% of what the company gets" : "Flat ₹ per transaction";
  } else if (v === "" && cur.legacy) {
    hint = `Old rule pays now: ${cur.legacy}`;
  } else if (v === "") {
    hint = "Gets nothing";
  } else if (draft.mode === "percent" && slab.providerIncome == null) {
    hint = "₹0 until Company gets is set";
  } else {
    hint = `≈ ${rupees(roleGrossPaise(slab, role, cur, draft))} on ${inr(slab.sampleAmount)}`;
  }
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: B.blue }}>
          {ROLE_LABEL[role]}
        </span>
        <SplitModeSwitch label={ROLE_LABEL[role]} mode={draft.mode} onChange={(mode) => onChange({ ...draft, mode })} />
      </div>
      <NumberField
        label=""
        value={draft.value}
        onChange={(value) => onChange({ ...draft, value })}
        prefix={draft.mode === "flat" ? "₹" : undefined}
        suffix={draft.mode === "percent" ? "%" : undefined}
        placeholder={cur?.legacy ? "Old rule" : "Off"}
        error={error}
      />
      {!error ? (
        <p className="mt-1 text-[11px]" style={{ color: v === "" && cur?.legacy ? "#B45309" : B.muted }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function CommissionSetupScreen() {
  const [data, setData] = useState<RateCardData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ServiceDraft>>({});
  const [quick, setQuick] = useState<ServiceDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const { saveReq, setSaveReq, saving, runSave } = usePendingSave(() => setVersion((v) => v + 1));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchApi<RateCardData>("/admin/rate-card");
      setData(d);
      setDrafts(Object.fromEntries(d.services.map((s) => [s.serviceId, draftOf(s)])));
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Could not load commission setup. Check your connection and refresh."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const currents = useMemo(() => {
    const out: Record<string, Record<SchemeRole, RoleCurrent>> = {};
    for (const s of data?.services ?? []) {
      out[s.serviceId] = Object.fromEntries(SCHEME_ROLES.map((r) => [r, currentFor(s, r)])) as Record<SchemeRole, RoleCurrent>;
    }
    return out;
  }, [data]);

  const services = data?.services ?? [];
  const changedIds = services
    .filter((s) => {
      const d = drafts[s.serviceId];
      const c = currents[s.serviceId];
      return d && c && SCHEME_ROLES.some((r) => roleChanged(c[r], d[r]));
    })
    .map((s) => s.serviceId);
  const hasErrors = services.some((s) => {
    const d = drafts[s.serviceId];
    return d && SCHEME_ROLES.some((r) => draftError(r, d[r]));
  });
  const sheetRows = services.filter(sheetReady);
  const askCount = services.filter(askProvider).length;
  const quickReady = SCHEME_ROLES.some((r) => quick[r].value.trim() !== "") && !SCHEME_ROLES.some((r) => draftError(r, quick[r]));

  const q = query.trim().toLowerCase();
  const visible = q
    ? services.filter((s) => `${s.serviceName} ${s.serviceCode} ${s.categoryName}`.toLowerCase().includes(q))
    : services;

  function setRole(serviceId: string, role: SchemeRole, d: RoleDraft) {
    setDrafts((prev) => ({ ...prev, [serviceId]: { ...(prev[serviceId] ?? emptyDraft()), [role]: d } }));
  }

  function applyQuickToAll() {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of services) {
        const d = { ...(next[s.serviceId] ?? emptyDraft()) };
        for (const role of SCHEME_ROLES) {
          if (quick[role].value.trim() !== "") d[role] = { ...quick[role] };
        }
        next[s.serviceId] = d;
      }
      return next;
    });
  }

  function discard() {
    setDrafts(Object.fromEntries(services.map((s) => [s.serviceId, draftOf(s)])));
  }

  function fillFromSheet() {
    const changes: PendingChange[] = sheetRows.flatMap((s) =>
      s.reference!.incomeRows!.map((r) => ({
        label: `${s.serviceName} · Company gets`,
        detail: `${slabLabel(r.minAmount, r.maxAmount)}: ${ruleLabel(r.ruleType, r.value, r.capAmount)}`,
        method: "post" as const,
        url: "/admin/rate-card/provider-income",
        body: {
          serviceId: s.serviceId,
          providerId: null,
          ruleType: r.ruleType,
          value: r.value,
          capAmount: r.capAmount,
          minAmount: r.minAmount,
          maxAmount: r.maxAmount,
        },
      })),
    );
    setSaveReq({
      title: "Fill Company gets from provider sheet",
      changes,
      warnings: askCount > 0 ? [`${askCount} service${askCount === 1 ? "" : "s"} still need the rate from the provider.`] : [],
    });
  }

  function saveAll() {
    const nowIso = new Date().toISOString();
    const changes: PendingChange[] = [];
    const warnings: string[] = [];
    for (const row of services) {
      if (!changedIds.includes(row.serviceId)) continue;
      const d = drafts[row.serviceId]!;
      const c = currents[row.serviceId]!;
      for (const role of SCHEME_ROLES) {
        if (roleChanged(c[role], d[role])) changes.push(...roleChanges(row, role, c[role], d[role], nowIso));
      }
      const losing = row.slabs.find((slab) => (keepsPaise(slab, c, d) ?? 0) < 0);
      if (losing) {
        warnings.push(
          `${row.serviceName} (${slabLabel(losing.minAmount, losing.maxAmount)}): roles get more than the company gets — company loses ${rupees(-(keepsPaise(losing, c, d) ?? 0))} per txn.`,
        );
      }
      if (row.providerIncomeRules.length === 0 && SCHEME_ROLES.some((r) => d[r].mode === "percent" && d[r].value.trim() !== "")) {
        warnings.push(`${row.serviceName}: Company gets is not set, so % splits pay ₹0 until it is.`);
      }
    }
    setSaveReq({ title: "Save commission split", changes, warnings });
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-2xl border p-5" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              Commission setup
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              See what the company gets on each service, then split it: % of that income or a flat ₹ per transaction.
              The company keeps the rest. Amounts are before TDS.
            </p>
          </div>
          <Link
            href="/tax-commission/rate-card"
            className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition hover:brightness-105"
            style={{ borderColor: B.border, background: "var(--admin-secondary)", color: B.blueLight }}
          >
            <TableProperties size={15} /> Detailed rate card
          </Link>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex h-full flex-col rounded-2xl border p-4" style={{ borderColor: B.border, background: "var(--admin-secondary)" }}>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
              <Sparkles size={14} /> Step 1 · Company gets
            </p>
            <p className="mt-2 text-xs" style={{ color: B.muted }}>
              Fill what the provider pays the company, straight from the provider sheet. You review it before it saves.
            </p>
            <div className="mt-auto space-y-2 pt-3">
              <Btn
                variant="success"
                className="w-full"
                disabled={sheetRows.length === 0 || changedIds.length > 0}
                onClick={fillFromSheet}
                title={changedIds.length > 0 ? "Save or discard the split changes first" : undefined}
              >
                <Sparkles size={14} />
                {sheetRows.length > 0
                  ? `Fill ${sheetRows.length} service${sheetRows.length === 1 ? "" : "s"} from provider sheet`
                  : "All sheet rates are filled"}
              </Btn>
              {askCount > 0 ? (
                <p className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#B45309" }}>
                  <HelpCircle size={12} /> {askCount} service{askCount === 1 ? "" : "s"} need the rate from the provider
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex h-full flex-col rounded-2xl border p-4" style={{ borderColor: B.border, background: "var(--admin-secondary)" }}>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
              <Wand2 size={14} /> Step 2 · Same split for every service (optional)
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {SCHEME_ROLES.map((role) => (
                <RoleEditor
                  key={role}
                  role={role}
                  draft={quick[role]}
                  cur={null}
                  slab={undefined}
                  onChange={(d) => setQuick((qd) => ({ ...qd, [role]: d }))}
                />
              ))}
            </div>
            <div className="mt-auto pt-3">
              <Btn variant="primary" className="w-full" disabled={!quickReady || services.length === 0} onClick={applyQuickToAll}>
                <Wand2 size={14} /> Apply to all services
              </Btn>
              <p className="mt-1 text-[11px]" style={{ color: B.muted }}>
                Fills every service below. Blank roles are left as they are. Nothing saves until you tap Save.
              </p>
            </div>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 rounded-xl border px-3" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
        <Search size={15} style={{ color: B.muted }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search service"
          className="w-full bg-transparent py-2.5 text-sm outline-none"
        />
      </label>

      {loading && !data ? <p className="text-sm" style={{ color: B.muted }}>Loading commission setup…</p> : null}
      {loadError ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}>
          <span>{loadError}</span>
          <Btn variant="secondary" onClick={() => void load()}>
            Retry
          </Btn>
        </div>
      ) : null}
      {data && visible.length === 0 ? (
        <p className="text-sm" style={{ color: B.muted }}>
          No service matches “{query}”.
        </p>
      ) : null}

      {visible.map((row, i) => {
        const draft = drafts[row.serviceId] ?? emptyDraft();
        const cur = currents[row.serviceId]!;
        const example = exampleSlab(row);
        const changed = changedIds.includes(row.serviceId);
        const showCategory = visible[i - 1]?.categoryName !== row.categoryName;
        return (
          <Fragment key={row.serviceId}>
            {showCategory ? (
              <p className="px-1 pt-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                {row.categoryName}
              </p>
            ) : null}
            <div
              className="rounded-2xl border p-4"
              style={{ borderColor: changed ? "#93C5FD" : B.border, background: "var(--admin-card)" }}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold" style={{ color: B.blue }}>
                  {row.serviceName}
                </p>
                {changed ? <Chip tone="blue">Unsaved</Chip> : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
                <div className="h-full rounded-xl border p-3" style={{ borderColor: B.border, background: "var(--admin-secondary)" }}>
                  <p className="mb-2 text-xs font-bold" style={{ color: B.blueLight }}>
                    Company gets
                  </p>
                  {row.providerIncomeRules.length === 0 ? (
                    sheetReady(row) ? (
                      <Chip tone="blue">
                        <Sparkles size={11} /> Sheet rate ready · use Fill from provider sheet
                      </Chip>
                    ) : askProvider(row) ? (
                      <Chip tone="amber">
                        <HelpCircle size={11} /> Ask provider for the rate
                      </Chip>
                    ) : (
                      <p className="text-xs" style={{ color: B.muted }}>
                        Not set ·{" "}
                        <Link href="/tax-commission/rate-card" className="font-semibold underline-offset-2 hover:underline" style={{ color: B.blueLight }}>
                          set it in the detailed rate card
                        </Link>
                      </p>
                    )
                  ) : (
                    <ul className="space-y-1.5">
                      {row.slabs.map((slab) => {
                        const rule = incomeRuleFor(row, slab);
                        const keeps = keepsPaise(slab, cur, draft);
                        return (
                          <li key={`${slab.minAmount ?? ""}|${slab.maxAmount ?? ""}`} className="text-xs">
                            <p className="font-semibold" style={{ color: B.blue }}>
                              {rule ? ruleLabel(rule.ruleType, rule.value, rule.capAmount) : "Not set"}
                              <span className="font-normal" style={{ color: B.muted }}>
                                {" "}
                                · {slabLabel(slab.minAmount, slab.maxAmount)}
                              </span>
                            </p>
                            <p style={{ color: B.muted }}>
                              {inr(slab.providerIncome)} on {inr(slab.sampleAmount)} · Company keeps{" "}
                              <span className="font-bold" style={{ color: keeps != null && keeps < 0 ? B.danger : B.greenDark }}>
                                {keeps == null ? "—" : keeps < 0 ? `loses ${rupees(-keeps)}` : rupees(keeps)}
                              </span>
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {SCHEME_ROLES.map((role) => (
                  <RoleEditor
                    key={role}
                    role={role}
                    draft={draft[role]}
                    cur={cur[role]}
                    slab={example}
                    onChange={(d) => setRole(row.serviceId, role, d)}
                  />
                ))}
              </div>
            </div>
          </Fragment>
        );
      })}

      {changedIds.length > 0 ? (
        <div
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 shadow-lg"
          style={{ borderColor: "#93C5FD", background: "var(--admin-card)" }}
        >
          <p className="text-sm font-semibold" style={{ color: B.blueLight }}>
            {changedIds.length} service{changedIds.length === 1 ? "" : "s"} changed
            {hasErrors ? <span className="ml-2 text-red-600">Fix the fields in red to save</span> : null}
          </p>
          <div className="flex gap-2">
            <Btn variant="destructive" onClick={discard} disabled={saving}>
              Discard
            </Btn>
            <Btn variant="primary" onClick={saveAll} disabled={hasErrors || saving}>
              Save
            </Btn>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}
