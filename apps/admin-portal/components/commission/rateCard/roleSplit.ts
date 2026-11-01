import {
  ROLE_LABEL,
  SCHEME_ROLES,
  inr,
  pct,
  samePercent,
  slabLabel,
  type PendingChange,
  type SchemeRole,
  type ServiceRow,
  type Slab,
} from "./types";
import { percentError, type SplitMode } from "./ui";

const num = (v: string) => String(Number(v));

/** The role's one All providers flat ₹ rule for any amount — what the ₹ switch edits. */
export function flatRuleOf(row: ServiceRow, role: SchemeRole) {
  const rules = row.fixedRules.filter((r) => r.role === role && r.providerId === null);
  const only = rules.length === 1 ? rules[0]! : null;
  return only && only.ruleType === "flat" && only.minAmount == null && only.maxAmount == null ? only : null;
}

export function initialModeOf(row: ServiceRow, role: SchemeRole): SplitMode {
  return !row.shares[role] && flatRuleOf(row, role) ? "flat" : "percent";
}

export function modesOf(row: ServiceRow): Record<SchemeRole, SplitMode> {
  return {
    retailer: initialModeOf(row, "retailer"),
    distributor: initialModeOf(row, "distributor"),
    super_distributor: initialModeOf(row, "super_distributor"),
  };
}

export function sharesDraftOf(row: ServiceRow): Record<SchemeRole, string> {
  const valueOf = (role: SchemeRole) => {
    const share = row.shares[role];
    if (share) return num(share.sharePercent);
    const flat = flatRuleOf(row, role);
    return flat ? num(flat.value) : "";
  };
  return {
    retailer: valueOf("retailer"),
    distributor: valueOf("distributor"),
    super_distributor: valueOf("super_distributor"),
  };
}

export function flatError(v: string, label: string): string | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return `${label} flat amount must be 0 or more`;
  if (n > 500) return `${label} flat amount cannot be more than ₹500`;
  return null;
}

export function roleSplitError(role: SchemeRole, mode: SplitMode, value: string): string | null {
  if (value.trim() === "") return null;
  return mode === "flat" ? flatError(value, ROLE_LABEL[role]) : percentError(value, `${ROLE_LABEL[role]} share`);
}

/**
 * Save requests for one role's split. ₹ = All providers flat rule (ends the share); % = share in the
 * current scope (ends the flat rule after the share saves, so the role is never left unpaid).
 */
export function roleSplitChanges(input: {
  row: ServiceRow;
  role: SchemeRole;
  mode: SplitMode;
  value: string;
  providerId: string | null;
  scopeLabel: string;
  nowIso: string;
}): PendingChange[] {
  const { row, role, mode, providerId, scopeLabel, nowIso } = input;
  const svc = row.serviceName;
  const out: PendingChange[] = [];
  const cur = row.shares[role];
  const next = input.value.trim();
  const flatRule = flatRuleOf(row, role);
  const wasFlat = initialModeOf(row, role) === "flat";
  const endFlat: PendingChange[] = flatRule
    ? [
        {
          label: `${svc} · end ${ROLE_LABEL[role]} flat ₹`,
          detail: `${inr(flatRule.value)} per txn stops`,
          method: "patch",
          url: `/admin/commission/rules/${flatRule.id}`,
          body: { effectiveTo: nowIso },
        },
      ]
    : [];

  if (mode === "flat") {
    if (wasFlat && next !== "" && Number(next) === Number(flatRule!.value)) return out;
    if (next !== "") {
      out.push({
        label: `${svc} · ${ROLE_LABEL[role]} flat ₹ (All providers)`,
        detail: `${wasFlat ? inr(flatRule!.value) : cur ? pct(cur.sharePercent) : "none"} → ${inr(next)} per txn`,
        method: "post",
        url: "/admin/commission/rules",
        body: { serviceId: row.serviceId, providerId: null, role, ruleType: "flat", value: next },
      });
    }
    if (cur) {
      out.push({
        label: `${svc} · end ${ROLE_LABEL[role]} share`,
        detail: `${pct(cur.sharePercent)} of provider income stops`,
        method: "delete",
        url: `/admin/rate-card/shares/${cur.id}`,
        body: {},
      });
    }
    out.push(...endFlat);
    return out;
  }

  if (next === "" && cur && providerId && cur.providerId === null) {
    out.push({
      label: `${svc} · ${ROLE_LABEL[role]} share (${scopeLabel})`,
      detail: `${pct(cur.sharePercent)} → 0% for ${scopeLabel} only (All providers share stays)`,
      method: "post",
      url: "/admin/rate-card/shares",
      body: { serviceId: row.serviceId, providerId, role, sharePercent: "0" },
    });
  } else if (next === "" && cur) {
    out.push({
      label: `${svc} · end ${ROLE_LABEL[role]} share`,
      detail: `${pct(cur.sharePercent)} of provider income stops`,
      method: "delete",
      url: `/admin/rate-card/shares/${cur.id}`,
      body: {},
    });
  } else if (next !== "" && (!cur || !samePercent(next, cur.sharePercent))) {
    out.push({
      label: `${svc} · ${ROLE_LABEL[role]} share (${scopeLabel})`,
      detail: `${cur ? pct(cur.sharePercent) : wasFlat ? `${inr(flatRule!.value)} flat` : "none"} → ${pct(next)} of provider income`,
      method: "post",
      url: "/admin/rate-card/shares",
      body: { serviceId: row.serviceId, providerId, role, sharePercent: next },
    });
  }
  // Switched ₹ → %: the new share saves first, then the flat rule ends.
  if (wasFlat) out.push(...endFlat);
  return out;
}

export type SlabSplit = { modes: Record<SchemeRole, SplitMode>; values: Record<SchemeRole, string> };

/** What each role earns on this slab today, as the % / ₹ the slab editor starts from. */
export function slabSplitOf(s: Slab): SlabSplit {
  const out: SlabSplit = {
    modes: { retailer: "percent", distributor: "percent", super_distributor: "percent" },
    values: { retailer: "", distributor: "", super_distributor: "" },
  };
  for (const role of SCHEME_ROLES) {
    const r = s.roles.find((x) => x.role === role);
    if (!r) continue;
    // "none" + a saved share = the share is set but Provider pays is not, so nothing pays yet.
    const hasShare = r.source === "share" || r.source === "none";
    if (hasShare && r.shareFlat != null) {
      out.modes[role] = "flat";
      out.values[role] = num(r.shareFlat);
    } else if (hasShare && r.sharePercent != null) {
      out.values[role] = num(r.sharePercent);
    } else if (r.source === "rule" && r.ruleType === "flat" && r.ruleValue != null) {
      out.modes[role] = "flat";
      out.values[role] = num(r.ruleValue);
    }
  }
  return out;
}

const splitLabel = (mode: SplitMode, v: string) =>
  v.trim() === "" ? "₹0" : mode === "flat" ? `${inr(v)} flat` : `${pct(v)} of provider income`;

/**
 * Save requests for one slab's own split — one slab share per changed role (blank = ₹0 on this slab).
 * The slab share wins over the service default and fixed rules for amounts inside the slab.
 */
export function slabSplitChanges(input: {
  row: ServiceRow;
  initial: SlabSplit;
  next: SlabSplit;
  providerId: string | null;
  minAmount: string | null;
  maxAmount: string | null;
}): PendingChange[] {
  const { row, initial, next } = input;
  const range = slabLabel(input.minAmount, input.maxAmount);
  return SCHEME_ROLES.flatMap((role): PendingChange[] => {
    const mode = next.modes[role];
    const v = next.values[role].trim();
    const was = initial.values[role].trim();
    const same = mode === initial.modes[role] && (v === was || (v !== "" && was !== "" && Number(v) === Number(was)));
    if (same || roleSplitError(role, mode, v)) return [];
    return [
      {
        label: `${row.serviceName} · ${ROLE_LABEL[role]} (${range})`,
        detail: `${splitLabel(initial.modes[role], was)} → ${splitLabel(mode, v)} on this slab only`,
        method: "post",
        url: "/admin/rate-card/shares",
        body: {
          serviceId: row.serviceId,
          providerId: input.providerId,
          role,
          sharePercent: mode === "percent" ? v || "0" : "0",
          flatAmount: mode === "flat" ? v || "0" : null,
          minAmount: input.minAmount,
          maxAmount: input.maxAmount,
        },
      },
    ];
  });
}

/** All roles at once (skips roles with an invalid value). */
export function allRoleSplitChanges(input: {
  row: ServiceRow;
  modes: Record<SchemeRole, SplitMode>;
  values: Record<SchemeRole, string>;
  providerId: string | null;
  scopeLabel: string;
}): PendingChange[] {
  const nowIso = new Date().toISOString();
  return SCHEME_ROLES.flatMap((role) =>
    roleSplitError(role, input.modes[role], input.values[role])
      ? []
      : roleSplitChanges({
          row: input.row,
          role,
          mode: input.modes[role],
          value: input.values[role],
          providerId: input.providerId,
          scopeLabel: input.scopeLabel,
          nowIso,
        }),
  );
}
