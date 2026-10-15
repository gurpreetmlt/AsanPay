"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { AlertTriangle, BadgeCheck, Ban, Check, Loader2, ShieldAlert, UserRound, X } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

interface PermissionContext {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
  kycStatus: string;
  isActive: boolean;
  isFrozen: boolean;
  joinedAt: string;
  fundRequestEnabled: boolean;
  upline: { name: string; uid: string | null; role: string | null } | null;
  creditedCount: number;
  creditedTotal: string;
  openCount: number;
}

const ROLE_LABEL: Record<string, string> = {
  super_distributor: "Super Distributor",
  distributor: "Distributor",
  retailer: "Retailer",
};

function errMessage(err: unknown, fallback: string) {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e.response?.data?.message ?? e.message ?? fallback;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span style={{ color: B.muted }}>{label}</span>
      <span className="text-right font-semibold" style={{ color: B.blue }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Confirm before changing who may raise fund requests. Turning it ON lets an agent receive real
 * money on approval, so the admin sees the full identity and must type the agent's UID.
 */
export function FundRequestPermissionModal({
  userId,
  enable,
  onClose,
  onSaved,
}: {
  userId: string;
  enable: boolean;
  onClose: () => void;
  onSaved: (enabled: boolean) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [ctx, setCtx] = useState<PermissionContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typedUid, setTypedUid] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchApi<PermissionContext>(`/admin/users/${userId}/fund-request-context`)
      .then(setCtx)
      .catch((err) => setLoadError(errMessage(err, "Could not load agent details")));
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const kycOk = ctx?.kycStatus === "verified";
  const accountOk = !!ctx && ctx.isActive && !ctx.isFrozen;
  const uidOk = !!ctx && typedUid.trim().toUpperCase() === ctx.uid.toUpperCase();
  const blockers: string[] = [];
  if (enable && ctx) {
    if (!kycOk) blockers.push(`KYC is ${ctx.kycStatus} — verify KYC first`);
    if (!ctx.isActive) blockers.push("Account is inactive");
  }
  const canSubmit = !!ctx && !saving && (enable ? blockers.length === 0 && uidOk : true);

  async function save() {
    if (!ctx || !canSubmit) return;
    setSaving(true);
    try {
      await api.patch(`/admin/users/${userId}/fund-requests`, {
        enabled: enable,
        ...(enable ? { confirmUid: typedUid.trim() } : {}),
      });
      toast.success(enable ? `Fund requests allowed for ${ctx.name} (${ctx.uid})` : `Fund requests turned off for ${ctx.name}`);
      onSaved(enable);
      onClose();
    } catch (err) {
      toast.error(errMessage(err, `Could not update fund requests for ${ctx.name}`));
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="bank-entry-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        e.stopPropagation();
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bank-entry-modal w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: B.border, background: enable ? "#F0FDF4" : "#FFFBEB" }}
        >
          <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: B.blue }}>
            {enable ? <ShieldAlert size={20} style={{ color: "#DC2626" }} /> : <Ban size={20} style={{ color: "#D97706" }} />}
            {enable ? "Allow fund requests?" : "Turn off fund requests?"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg p-1.5 transition hover:rotate-90 hover:bg-slate-100"
            style={{ color: B.muted }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {loadError ? (
            <p className="text-sm font-semibold text-red-600">{loadError}</p>
          ) : !ctx ? (
            <p className="flex items-center gap-2 text-sm" style={{ color: B.muted }}>
              <Loader2 size={16} className="animate-spin" /> Loading agent details…
            </p>
          ) : (
            <>
              {enable ? (
                <div className="flex gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: "#FECACA", background: "#FEF2F2" }}>
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: "#DC2626" }} />
                  <p style={{ color: "#B91C1C" }}>
                    <b>You are allowing this agent to request funds.</b> Every approved request credits real money to their
                    wallet. Check the name, mobile and UID with the agent before allowing — the wrong agent would receive
                    the money.
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: B.muted }}>
                  {ctx.name} will not be able to raise new fund requests.
                  {ctx.openCount > 0 ? ` ${ctx.openCount} open request(s) stay in your queue.` : ""}
                </p>
              )}

              <div className="rounded-xl border px-4 py-2" style={{ borderColor: B.border }}>
                <div className="mb-1 flex items-center gap-2 border-b pb-2" style={{ borderColor: B.border }}>
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ background: "#EEF2FF", color: B.blue }}
                  >
                    <UserRound size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold" style={{ color: B.blue }}>
                      {ctx.name}
                    </p>
                    <p className="text-xs" style={{ color: B.muted }}>
                      {ROLE_LABEL[ctx.role] ?? ctx.role}
                    </p>
                  </div>
                </div>
                <Row label="UID">
                  <span className="font-mono">{ctx.uid}</span>
                </Row>
                <Row label="Mobile">{ctx.mobile}</Row>
                {ctx.email ? <Row label="Email">{ctx.email}</Row> : null}
                <Row label="KYC">
                  <span className="inline-flex items-center gap-1" style={{ color: kycOk ? "#15803D" : "#B45309" }}>
                    {kycOk ? <BadgeCheck size={14} /> : <AlertTriangle size={14} />}
                    {ctx.kycStatus.charAt(0).toUpperCase() + ctx.kycStatus.slice(1)}
                  </span>
                </Row>
                <Row label="Account">
                  <span style={{ color: accountOk ? "#15803D" : "#B91C1C" }}>
                    {!ctx.isActive ? "Inactive" : ctx.isFrozen ? "Frozen" : "Active"}
                  </span>
                </Row>
                <Row label="Upline">
                  {ctx.upline ? `${ctx.upline.name} · ${ctx.upline.uid ?? ""}` : "Admin (direct)"}
                </Row>
                <Row label="Joined">{new Date(ctx.joinedAt).toLocaleDateString("en-IN")}</Row>
                <Row label="Fund requests credited">
                  {ctx.creditedCount} · ₹{Number(ctx.creditedTotal).toLocaleString("en-IN")}
                </Row>
              </div>

              {enable && blockers.length > 0 ? (
                <div className="space-y-1 rounded-xl border p-3 text-sm font-semibold" style={{ borderColor: "#FECACA", color: "#B91C1C" }}>
                  {blockers.map((b) => (
                    <p key={b}>✗ {b}</p>
                  ))}
                </div>
              ) : null}

              {enable && blockers.length === 0 ? (
                <label className="block">
                  <span className="text-xs font-semibold" style={{ color: B.muted }}>
                    Type the agent&apos;s UID <b className="font-mono">{ctx.uid}</b> to confirm *
                  </span>
                  <input
                    autoFocus
                    value={typedUid}
                    onChange={(e) => setTypedUid(e.target.value)}
                    onPaste={(e) => e.preventDefault()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void save();
                    }}
                    placeholder={ctx.uid}
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 font-mono text-sm uppercase"
                    style={{ borderColor: typedUid && !uidOk ? "#FCA5A5" : uidOk ? "#86EFAC" : B.border }}
                  />
                  {typedUid && !uidOk ? (
                    <span className="mt-1 block text-xs font-semibold text-red-600">UID does not match this agent</span>
                  ) : null}
                </label>
              ) : null}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: B.border }}>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
            style={{ background: B.danger }}
          >
            <X size={15} /> Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            style={{ background: enable ? "#16A34A" : "#D97706" }}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : enable ? <Check size={15} /> : <Ban size={15} />}
            {saving ? "Saving…" : enable ? "Allow fund requests" : "Turn off"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
