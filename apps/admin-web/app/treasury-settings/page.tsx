"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

const DUAL_OPTIONS = [
  { value: 50_000, label: "₹50,000" },
  { value: 100_000, label: "₹1,00,000" },
  { value: 200_000, label: "₹2,00,000" },
  { value: 500_000, label: "₹5,00,000" },
  { value: 1_000_000, label: "₹10,00,000" },
  { value: 999_999_999, label: "Off (single admin — ₹99,99,99,999)" },
] as const;

const CHARGE_OPTIONS = [
  { value: 0, label: "₹0 (no fee)" },
  { value: 5, label: "₹5" },
  { value: 10, label: "₹10" },
  { value: 15, label: "₹15" },
  { value: 20, label: "₹20" },
  { value: 25, label: "₹25" },
  { value: 50, label: "₹50" },
  { value: 100, label: "₹100" },
] as const;

function nearestOption(options: readonly { value: number }[], current: number): number {
  if (options.some((o) => o.value === current)) return current;
  let best = options[0]!.value;
  let bestDiff = Math.abs(best - current);
  for (const o of options) {
    const d = Math.abs(o.value - current);
    if (d < bestDiff) {
      best = o.value;
      bestDiff = d;
    }
  }
  return best;
}

export default function TreasurySettingsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [dualLimit, setDualLimit] = useState(200_000);
  const [settleCharge, setSettleCharge] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await fetchApi<{
        fundApproveDualRupees: number;
        settlementChargeRupees: number;
      }>("/admin/tenant-settings");
      setDualLimit(nearestOption(DUAL_OPTIONS, settings.fundApproveDualRupees));
      setSettleCharge(nearestOption(CHARGE_OPTIONS, settings.settlementChargeRupees));
    } catch {
      toast.error("Failed to load treasury settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  async function save() {
    setSaving(true);
    try {
      await api.patch("/admin/tenant-settings", {
        fundApproveDualRupees: dualLimit,
        settlementChargeRupees: settleCharge,
      });
      toast.success("Treasury settings saved");
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Could not save settings";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-xl space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            Treasury Settings
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Saved in the database — no Coolify redeploy to change these.
          </p>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : (
          <section
            className="space-y-4 rounded-2xl border bg-white p-5"
            style={{ borderColor: B.border }}
          >
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium" style={{ color: B.muted }}>
                Fund dual-approve limit
              </span>
              <select
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border, color: B.blue }}
                value={dualLimit}
                onChange={(e) => setDualLimit(Number(e.target.value))}
              >
                {DUAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs" style={{ color: B.muted }}>
                Credits at/above this amount need two different admins.
              </span>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium" style={{ color: B.muted }}>
                Settlement charge
              </span>
              <select
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: B.border, color: B.blue }}
                value={settleCharge}
                onChange={(e) => setSettleCharge(Number(e.target.value))}
              >
                {CHARGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs" style={{ color: B.muted }}>
                Flat fee deducted from each settlement withdrawal.
              </span>
            </label>

            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
