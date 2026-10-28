"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { MonthField } from "@/components/ui/DateField";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { apiErrorMessage, currentMonthYm, formatWhen } from "@/lib/taxCommissionUtils";

type LockRow = {
  id: string;
  yearMonth: string;
  lockedAt: string;
  lockedByName: string | null;
  unlockedAt: string | null;
  unlockReason: string | null;
  isLocked: boolean;
};

type Locks = { currentMonth: string; rows: LockRow[] };

export default function TaxCommissionMonthLockPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<Locks | null>(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(currentMonthYm());
  const [locking, setLocking] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchApi<Locks>("/admin/commission/month-locks"));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load month locks"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load]);

  async function lockMonth(target: string) {
    if (!/^\d{4}-\d{2}$/.test(target)) {
      toast.error("Pick a month to lock (YYYY-MM)");
      return;
    }
    if (
      !window.confirm(
        `Lock ${target}? Commission rate changes, overrides, and scheme imports will be blocked until it is unlocked.`,
      )
    ) {
      return;
    }
    setLocking(true);
    try {
      await api.post("/admin/commission/month-locks", { yearMonth: target });
      toast.success(`Locked ${target}`);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, `Could not lock ${target}`));
    } finally {
      setLocking(false);
    }
  }

  async function unlockMonth() {
    if (!unlockTarget) return;
    if (reason.trim().length < 5) {
      toast.error("Unlock reason must be at least 5 characters");
      return;
    }
    setUnlocking(true);
    try {
      await api.post(`/admin/commission/month-locks/${unlockTarget}/unlock`, { reason: reason.trim() });
      toast.success(`Unlocked ${unlockTarget}`);
      setUnlockTarget(null);
      setReason("");
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, `Could not unlock ${unlockTarget}`));
    } finally {
      setUnlocking(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="tax" />

        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Month lock
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Lock a closed month after filing so rates and tax settings cannot change under the books. Unlocking
            needs a written reason and is audit-logged.
          </p>
        </div>

        <div
          className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5"
          style={{ borderColor: B.border }}
        >
          <div className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              Month to lock
            </span>
            <MonthField value={month} onChange={setMonth} max={data?.currentMonth ?? currentMonthYm()} />
          </div>
          <button
            type="button"
            onClick={() => void lockMonth(month)}
            disabled={locking}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: B.badgeGrad }}
          >
            {locking ? "Locking…" : "Lock month"}
          </button>
        </div>

        {unlockTarget ? (
          <div
            className="space-y-3 rounded-2xl border bg-white p-5"
            style={{ borderColor: B.danger }}
          >
            <h2 className="text-base font-bold" style={{ color: B.danger }}>
              Unlock {unlockTarget}
            </h2>
            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: B.muted }}>
                Reason (at least 5 characters)
              </span>
              <textarea
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: B.border }}
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Correcting a wrong TDS rate found by CA"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void unlockMonth()}
                disabled={unlocking}
                className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                style={{ background: B.danger }}
              >
                {unlocking ? "Unlocking…" : "Unlock month"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUnlockTarget(null);
                  setReason("");
                }}
                className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                style={{ background: B.danger }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Locks
          </h2>
          {loading && !data ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !data?.rows.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No months have been locked yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="py-2 pr-3 font-semibold">Month</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 pr-3 font-semibold">Locked</th>
                    <th className="py-2 pr-3 font-semibold">Unlocked / reason</th>
                    <th className="py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="py-3 pr-3 font-mono font-semibold" style={{ color: B.blue }}>
                        {r.yearMonth}
                      </td>
                      <td
                        className="py-3 pr-3 font-semibold"
                        style={{ color: r.isLocked ? "#0F9E5C" : "#B45309" }}
                      >
                        {r.isLocked ? "Locked" : "Unlocked"}
                      </td>
                      <td className="py-3 pr-3" style={{ color: B.muted }}>
                        {formatWhen(r.lockedAt)}
                        {r.lockedByName ? ` · ${r.lockedByName}` : ""}
                      </td>
                      <td className="py-3 pr-3" style={{ color: B.muted }}>
                        {r.unlockedAt ? `${formatWhen(r.unlockedAt)} · ${r.unlockReason ?? ""}` : "—"}
                      </td>
                      <td className="py-3 text-right">
                        {r.isLocked ? (
                          <button
                            type="button"
                            onClick={() => {
                              setUnlockTarget(r.yearMonth);
                              setReason("");
                            }}
                            className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                            style={{ background: B.danger }}
                          >
                            Unlock
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void lockMonth(r.yearMonth)}
                            disabled={locking}
                            className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                            style={{ background: B.cta }}
                          >
                            Lock again
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
