"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  ArrowUpToLine,
  Fingerprint,
  IdCard,
  Landmark,
  Power,
  PowerOff,
  Smartphone,
  Tv,
  type LucideIcon,
} from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { Modal } from "@/components/ui/Modal";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";

type Section = "kyc" | "bank" | "recharge";
type ProviderRow = {
  code: string;
  name: string;
  note: string;
  position: number;
  enabled: boolean;
  configured: boolean;
  health: { total: number; ok: number } | null;
};
export type VerificationCheck = {
  check: string;
  label: string;
  section: Section;
  usedIn: string;
  fixedOrder: boolean;
  offMessage: string;
  on: boolean;
  providers: ProviderRow[];
};

/** Wallet-charge route for paid bank checks (provider_services under VERIFICATION_RAILS). */
export type ChargeRoute = { providerName: string; isActive: boolean; onTurnOn: () => void } | null;

const SECTIONS: Array<{ id: Section; title: string; hint: string }> = [
  { id: "kyc", title: "KYC checks", hint: "Run once when an agent signs up" },
  { id: "bank", title: "Bank account", hint: "Runs top to bottom, cheapest first — stops at the first step that confirms the name" },
  { id: "recharge", title: "Recharge lookups", hint: "Primary runs first; if it fails or returns nothing, the next provider is tried" },
];

const CHECK_ICON: Record<string, LucideIcon> = {
  pan_verify: IdCard,
  aadhaar_otp: Fingerprint,
  bank_account: Landmark,
  mobile_operator: Smartphone,
  mobile_plans: Smartphone,
  mobile_offers: Smartphone,
  dth_plans: Tv,
  dth_info: Tv,
};

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

type Pending =
  | { kind: "toggle"; check: VerificationCheck; provider: ProviderRow; enable: boolean }
  | { kind: "primary"; check: VerificationCheck; provider: ProviderRow };

export function VerificationsPanel({
  chargeRoute,
  onLoaded,
}: {
  chargeRoute: ChargeRoute;
  onLoaded?: (checks: VerificationCheck[]) => void;
}) {
  const [checks, setChecks] = useState<VerificationCheck[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (list: VerificationCheck[]) => {
      setChecks(list);
      onLoaded?.(list);
    },
    [onLoaded],
  );

  const load = useCallback(async () => {
    try {
      apply(await fetchApi<VerificationCheck[]>("/admin/verifications"));
    } catch (err) {
      toast.error(errMsg(err, "Verifications did not load. Refresh the page."));
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const reasonError = reason.trim().length < 3 ? "Enter a reason (at least 3 characters)" : null;
  const turnsCheckOff =
    pending?.kind === "toggle" && !pending.enable && pending.check.providers.filter((p) => p.enabled).length === 1;

  async function save() {
    if (!pending || reasonError) return;
    setBusy(true);
    try {
      const res =
        pending.kind === "toggle"
          ? await api.put<{ data: VerificationCheck[]; message?: string }>(
              `/admin/verifications/${pending.check.check}/providers/${pending.provider.code}`,
              { enabled: pending.enable, reason: reason.trim() },
            )
          : await api.put<{ data: VerificationCheck[]; message?: string }>(`/admin/verifications/${pending.check.check}/primary`, {
              provider: pending.provider.code,
              reason: reason.trim(),
            });
      apply(res.data.data);
      toast.success(res.data.message ?? "Saved");
      setPending(null);
    } catch (err) {
      toast.error(errMsg(err, "The change was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!checks) {
    return (
      <p className="py-6 text-sm" style={{ color: B.muted }}>
        Loading verifications…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => {
        const list = checks.filter((c) => c.section === section.id);
        if (list.length === 0) return null;
        return (
          <section key={section.id}>
            <div className="mb-2">
              <h2 className="text-base font-semibold" style={{ color: B.blue }}>
                {section.title}
              </h2>
              <p className="text-xs" style={{ color: B.muted }}>
                {section.hint}
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((c) => {
                const Icon = CHECK_ICON[c.check] ?? IdCard;
                return (
                  <div
                    key={c.check}
                    className={`overflow-hidden rounded-2xl border ${c.section === "bank" ? "lg:col-span-2" : ""}`}
                    style={{ borderColor: c.on ? B.border : "#FCA5A5", background: B.card }}
                  >
                    <div className="flex items-start gap-3 px-4 py-3" style={{ background: c.on ? B.secondary : "#FEF2F2" }}>
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={c.on ? { background: "rgba(42,92,221,0.12)", color: B.blueLight } : { background: "rgba(220,38,38,0.12)", color: B.danger }}
                      >
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: B.blue }}>
                          {c.label}
                        </p>
                        <p className="text-xs" style={{ color: B.muted }}>
                          {c.usedIn}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={c.on ? { background: "rgba(34,197,94,0.12)", color: "#16a34a" } : { background: "rgba(239,68,68,0.12)", color: "#dc2626" }}
                      >
                        {c.on ? "On" : "Off"}
                      </span>
                    </div>

                    {!c.on ? (
                      <p className="border-t px-4 py-2 text-xs" style={{ borderColor: "#FCA5A5", color: "#B91C1C" }}>
                        Agents see: “{c.offMessage}”
                      </p>
                    ) : null}

                    <div className="divide-y" style={{ borderColor: B.border }}>
                      {c.providers.map((p, i) => (
                        <div key={p.code} className="flex items-center gap-3 px-4 py-2.5" style={{ borderColor: B.border }}>
                          <span
                            className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
                            style={
                              p.enabled
                                ? { background: "rgba(42,92,221,0.12)", color: B.blueLight }
                                : { background: B.secondary, color: B.muted }
                            }
                            title={c.fixedOrder ? `Step ${p.position}` : p.position === 1 ? "Primary" : "Fallback"}
                          >
                            {p.position}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium" style={{ color: p.enabled ? B.blue : B.muted }}>
                              {p.name}
                              {!c.fixedOrder ? (
                                <span className="ml-2 text-[11px] font-normal" style={{ color: B.muted }}>
                                  {i === 0 ? "Primary" : "Fallback"}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-[11px]" style={{ color: B.muted }}>
                              {p.note}
                              {p.health
                                ? ` · 24h: ${p.health.total === 0 ? "no checks" : `${p.health.ok}/${p.health.total} confirmed`}`
                                : ""}
                            </p>
                            {!p.configured ? (
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#B45309" }}>
                                <AlertTriangle size={12} /> Not configured on the backend — calls will fail
                              </p>
                            ) : null}
                          </div>
                          {!c.fixedOrder && i > 0 ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setReason("");
                                setPending({ kind: "primary", check: c, provider: p });
                              }}
                              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition hover:bg-[rgba(42,92,221,0.08)] disabled:opacity-50"
                              style={{ color: B.blueLight }}
                            >
                              <ArrowUpToLine size={12} /> Make primary
                            </button>
                          ) : null}
                          <ToggleSwitch
                            checked={p.enabled}
                            disabled={busy}
                            label={`${p.name} for ${c.label}`}
                            onChange={(on) => {
                              setReason("");
                              setPending({ kind: "toggle", check: c, provider: p, enable: on });
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    {c.section === "bank" && chargeRoute ? (
                      <div
                        className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-[11px]"
                        style={{ borderColor: B.border, color: chargeRoute.isActive ? B.muted : "#B91C1C" }}
                      >
                        <span>
                          Wallet charge route for paid checks: <strong>{chargeRoute.providerName}</strong> ·{" "}
                          {chargeRoute.isActive ? "active" : "off — paid bank checks will fail"}
                        </span>
                        {!chargeRoute.isActive ? (
                          <button
                            type="button"
                            onClick={chargeRoute.onTurnOn}
                            className="admin-btn-success rounded-lg px-2 py-0.5 text-[11px] font-semibold"
                          >
                            Turn on
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {pending ? (
        <Modal
          title={
            pending.kind === "primary"
              ? `Run ${pending.provider.name} first?`
              : `${pending.enable ? "Turn on" : "Turn off"} ${pending.provider.name}?`
          }
          eyebrow={pending.check.label}
          subtitle={
            pending.kind === "primary"
              ? "It becomes the primary provider; the others are tried only if it fails."
              : pending.enable
                ? "This provider is used again for this check right away."
                : turnsCheckOff
                  ? "This is the last provider that is on — the whole check stops."
                  : "The other providers that are on keep this check working."
          }
          icon={
            pending.kind === "primary" ? <ArrowUpToLine size={22} /> : pending.enable ? <Power size={22} /> : <PowerOff size={22} />
          }
          iconTone={pending.kind === "primary" ? "blue" : pending.enable ? "green" : turnsCheckOff ? "red" : "amber"}
          onClose={() => {
            if (!busy) setPending(null);
          }}
        >
          <div className="space-y-3">
            {turnsCheckOff ? (
              <div className="rounded-2xl border px-3 py-2 text-xs" style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: "#B91C1C" }}>
                Agents will see: “{pending.check.offMessage}”
              </div>
            ) : null}
            <div className="rounded-2xl border p-3" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
              <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                Reason
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Provider is down since 10 AM"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </label>
              <p className="mt-1.5 text-[11px]" style={{ color: reason && reasonError ? B.danger : B.muted }}>
                {reason && reasonError ? reasonError : "Saved in the audit log with your name"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy || !!reasonError}
                onClick={() => void save()}
                className={`${
                  pending.kind === "primary" ? "admin-btn-primary" : pending.enable ? "admin-btn-success" : "admin-btn-danger"
                } rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50`}
              >
                {busy ? "Saving…" : pending.kind === "primary" ? "Make primary" : pending.enable ? "Turn on" : "Turn off"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
