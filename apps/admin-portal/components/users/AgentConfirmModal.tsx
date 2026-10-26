"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { AlertTriangle, BadgeCheck, Check, Copy, Loader2, ShieldAlert, UserRound, X } from "lucide-react";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

interface AgentContext {
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
  upline: { name: string; uid: string | null; role: string | null } | null;
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

export function ConfirmRow({ label, children }: { label: string; children: ReactNode }) {
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
 * Last check before an action that sends money or control to one specific agent. Shows who the
 * agent really is (from the server, not from the form) and requires their UID typed or pasted.
 */
export function AgentConfirmModal({
  userId,
  title,
  warning,
  summary,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  userId: string;
  title: string;
  warning: ReactNode;
  summary?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: (agent: { id: string; uid: string; name: string }) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [ctx, setCtx] = useState<AgentContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typedUid, setTypedUid] = useState("");

  useEffect(() => {
    setMounted(true);
    fetchApi<AgentContext>(`/admin/users/${userId}/fund-request-context`)
      .then(setCtx)
      .catch((err) => setLoadError(errMessage(err, "Could not load agent details — check the agent ID")));
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const kycOk = ctx?.kycStatus === "verified";
  const accountOk = !!ctx && ctx.isActive && !ctx.isFrozen;
  const uidOk = !!ctx && typedUid.trim().toUpperCase() === ctx.uid.toUpperCase();
  const canSubmit = !!ctx && uidOk && !busy;

  function submit() {
    if (!ctx || !canSubmit) return;
    onConfirm({ id: ctx.id, uid: ctx.uid, name: ctx.name });
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="bank-entry-backdrop fixed inset-0 z-[210] flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bank-entry-modal max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: B.border, background: "#FEF2F2" }}
        >
          <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: B.blue }}>
            <ShieldAlert size={20} style={{ color: "#DC2626" }} />
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="popup-close"
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
              <div className="flex gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: "#FECACA", background: "#FEF2F2" }}>
                <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: "#DC2626" }} />
                <div style={{ color: "#B91C1C" }}>{warning}</div>
              </div>

              {summary ? (
                <div className="rounded-xl border px-4 py-2" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
                  {summary}
                </div>
              ) : null}

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
                <ConfirmRow label="UID">
                  <span className="font-mono">{ctx.uid}</span>
                </ConfirmRow>
                <ConfirmRow label="Mobile">{ctx.mobile}</ConfirmRow>
                {ctx.email ? <ConfirmRow label="Email">{ctx.email}</ConfirmRow> : null}
                <ConfirmRow label="KYC">
                  <span className="inline-flex items-center gap-1" style={{ color: kycOk ? "#15803D" : "#B45309" }}>
                    {kycOk ? <BadgeCheck size={14} /> : <AlertTriangle size={14} />}
                    {ctx.kycStatus.charAt(0).toUpperCase() + ctx.kycStatus.slice(1)}
                  </span>
                </ConfirmRow>
                <ConfirmRow label="Account">
                  <span style={{ color: accountOk ? "#15803D" : "#B91C1C" }}>
                    {!ctx.isActive ? "Inactive" : ctx.isFrozen ? "Frozen" : "Active"}
                  </span>
                </ConfirmRow>
                <ConfirmRow label="Upline">
                  {ctx.upline ? `${ctx.upline.name} · ${ctx.upline.uid ?? ""}` : "Admin (direct)"}
                </ConfirmRow>
                <ConfirmRow label="Joined">{new Date(ctx.joinedAt).toLocaleDateString("en-IN")}</ConfirmRow>
              </div>

              <label className="block">
                <span className="text-xs font-semibold" style={{ color: B.muted }}>
                  Type or paste the agent&apos;s UID <b className="font-mono">{ctx.uid}</b>{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      void navigator.clipboard
                        .writeText(ctx.uid)
                        .then(() => toast.success("UID copied — paste it below"))
                        .catch(() => toast.error("Could not copy — your browser blocked clipboard access"));
                    }}
                    className="inline-flex items-center gap-0.5 rounded px-1 align-middle text-[11px] font-semibold"
                    style={{ color: B.blueLight }}
                    title="Copy UID"
                  >
                    <Copy size={11} /> Copy
                  </button>{" "}
                  to confirm
                  <RequiredMark />
                </span>
                <input
                  autoFocus
                  value={typedUid}
                  onChange={(e) => setTypedUid(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
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
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: B.border }}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: B.danger }}
          >
            <X size={15} /> Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: B.blueLight }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
