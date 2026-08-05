"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Percent, ChevronRight } from "lucide-react";
import { DetailSection } from "@/components/users/DetailSection";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

type RuleType = "flat" | "percentage";

interface CommissionServiceRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  hasOverride: boolean;
  ruleType: RuleType;
  value: string;
  rateActive: boolean;
}

interface CommissionCategory {
  id: string;
  code: string;
  name: string;
  services: CommissionServiceRow[];
}

interface CommissionPayload {
  user: { id: string; name: string; uid: string; role: string };
  categories: CommissionCategory[];
}

type Draft = {
  ruleType: RuleType;
  value: string;
  rateActive: boolean;
  dirty: boolean;
  clear: boolean;
};

export function AgentCommissionPanel({ userId }: { userId: string }) {
  const [categories, setCategories] = useState<CommissionCategory[]>([]);
  const [categoryCollapsed, setCategoryCollapsed] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyPayload = useCallback((data: CommissionPayload) => {
    setCategories(data.categories);
    const next: Record<string, Draft> = {};
    for (const cat of data.categories) {
      for (const s of cat.services) {
        next[s.id] = {
          ruleType: s.ruleType,
          value: s.value,
          rateActive: s.rateActive,
          dirty: false,
          clear: false,
        };
      }
    }
    setDrafts(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<CommissionPayload>(`/admin/users/${userId}/commissions`);
      applyPayload(data);
    } catch {
      toast.error("Failed to load commissions");
    } finally {
      setLoading(false);
    }
  }, [userId, applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchDraft(serviceId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        ...patch,
        dirty: true,
        clear: patch.clear ?? false,
      },
    }));
  }

  async function saveAll() {
    const rates = Object.entries(drafts)
      .filter(([, d]) => d.dirty)
      .map(([serviceId, d]) => {
        if (d.clear || !d.value.trim()) {
          return { serviceId, ruleType: d.ruleType, value: "0", clear: true as const };
        }
        return {
          serviceId,
          ruleType: d.ruleType,
          value: d.value.trim(),
          isActive: d.rateActive,
          clear: false as const,
        };
      });

    if (rates.length === 0) {
      toast.error("No changes to save");
      return;
    }

    setSaving(true);
    try {
      const data = await api.put(`/admin/users/${userId}/commissions`, { rates }).then((r) => {
        if (!r.data.success) throw new Error(r.data.message);
        return r.data.data as CommissionPayload;
      });
      applyPayload(data);
      toast.success("Commission rates saved");
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Save failed",
      );
    } finally {
      setSaving(false);
    }
  }

  const dirtyCount = Object.values(drafts).filter((d) => d.dirty).length;

  return (
    <DetailSection title="Service Commission" icon={Percent}>
      <p className="mb-4 text-sm" style={{ color: B.muted }}>
        Set this agent’s cut per service (flat ₹ or %). Empty / Clear uses the role default. AEPS
        applies one shared rate to all AEPS operations.
      </p>

      {loading ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const catCollapsed = !!categoryCollapsed[cat.id];
            return (
              <div key={cat.id} className="overflow-hidden rounded-xl border" style={{ borderColor: B.border }}>
                <button
                  type="button"
                  onClick={() => setCategoryCollapsed((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-black/[0.02]"
                  style={{ background: B.secondary }}
                >
                  <ChevronRight
                    size={14}
                    style={{
                      color: B.muted,
                      transform: catCollapsed ? "none" : "rotate(90deg)",
                      transition: "transform 0.15s ease",
                    }}
                  />
                  <h3 className="text-sm font-semibold" style={{ color: B.blue }}>
                    {cat.name}
                  </h3>
                  <span className="font-mono text-[13px]" style={{ color: B.muted }}>
                    {cat.code}
                  </span>
                  <span className="ml-auto text-[14px]" style={{ color: B.muted }}>
                    {cat.services.length} services
                  </span>
                </button>
                {!catCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr
                          className="border-b text-xs uppercase tracking-wider"
                          style={{
                            borderColor: B.border,
                            background: B.secondary,
                            color: B.muted,
                          }}
                        >
                          <th className="px-3 py-2.5 font-semibold">Service</th>
                          <th className="px-3 py-2.5 font-semibold">Type</th>
                          <th className="px-3 py-2.5 font-semibold">Value</th>
                          <th className="px-3 py-2.5 text-center font-semibold">On</th>
                          <th className="px-3 py-2.5 text-right font-semibold"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.services.map((s) => {
                          const d =
                            drafts[s.id] ?? {
                              ruleType: s.ruleType,
                              value: s.value,
                              rateActive: s.rateActive,
                              dirty: false,
                              clear: false,
                            };
                          const isAepsGroup = s.code === "AEPS";
                          return (
                            <tr
                              key={s.id}
                              className="transition-colors hover:bg-black/[0.02]"
                              style={{ borderBottom: `1px solid ${B.border}` }}
                            >
                              <td className="px-3 py-2.5">
                                <div className="font-medium" style={{ color: B.blue }}>
                                  {s.name}
                                </div>
                                <div className="font-mono text-[13px]" style={{ color: B.muted }}>
                                  {isAepsGroup
                                    ? "shared rate → withdraw · mini · deposit · balance"
                                    : s.code}
                                  {s.hasOverride && !d.clear ? " · custom" : ""}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <select
                                  value={d.ruleType}
                                  onChange={(e) =>
                                    patchDraft(s.id, {
                                      ruleType: e.target.value as RuleType,
                                      clear: false,
                                    })
                                  }
                                  className="rounded-lg border-2 bg-[var(--admin-bg)] px-2 py-1.5 text-sm outline-none"
                                  style={{ borderColor: B.border, color: B.blue }}
                                >
                                  <option value="percentage">%</option>
                                  <option value="flat">Flat ₹</option>
                                </select>
                              </td>
                              <td className="px-3 py-2.5">
                                <input
                                  value={d.clear ? "" : d.value}
                                  onChange={(e) =>
                                    patchDraft(s.id, {
                                      value: e.target.value,
                                      clear: false,
                                    })
                                  }
                                  placeholder={d.ruleType === "flat" ? "₹" : "%"}
                                  inputMode="decimal"
                                  className="w-24 rounded-lg border-2 bg-[var(--admin-bg)] px-2 py-1.5 text-sm outline-none"
                                  style={{ borderColor: B.border, color: B.blue }}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex justify-center">
                                  <ToggleSwitch
                                    checked={d.rateActive && !d.clear}
                                    onChange={(next) =>
                                      patchDraft(s.id, { rateActive: next, clear: false })
                                    }
                                    label={`${s.name} commission`}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    patchDraft(s.id, { value: "", clear: true, rateActive: true })
                                  }
                                  className="text-xs font-semibold hover:underline"
                                  style={{ color: B.muted }}
                                >
                                  Clear
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {dirtyCount > 0 ? (
              <span className="text-xs" style={{ color: B.muted }}>
                {dirtyCount} change{dirtyCount === 1 ? "" : "s"}
              </span>
            ) : null}
            <button
              type="button"
              disabled={saving || dirtyCount === 0}
              onClick={() => void saveAll()}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Saving…" : "Save commissions"}
            </button>
          </div>
        </div>
      )}
    </DetailSection>
  );
}
