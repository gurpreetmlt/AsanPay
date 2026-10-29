"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { CircleCheck, CircleX, DoorClosed, DoorOpen, Network, Repeat, UserCog, Wallet, type LucideIcon } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { Modal } from "@/components/ui/Modal";
import { DetailSection } from "@/components/users/DetailSection";

type AgentRole = "super_distributor" | "distributor" | "retailer";
type Controls = {
  role: AgentRole;
  isActive: boolean;
  hasDownline: boolean;
  pendingTxnRef: string | null;
  hasCustomCommission: boolean;
  wallets: { walletType: string; balance: string; holdBalance: string }[];
  closedAt: string | null;
  closedReason: string | null;
  uplineRoles: Record<AgentRole, string[]>;
};
type Check = { label: string; ok: boolean; hint: string; icon: LucideIcon };

const ROLES: AgentRole[] = ["super_distributor", "distributor", "retailer"];

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

const inr = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const walletName = (t: string) => (t === "main" ? "Main" : t === "aeps" ? "AePS" : t);

function CheckRows({ checks }: { checks: Check[] }) {
  const failed = checks.filter((c) => !c.ok);
  return (
    <div className="space-y-2">
      {checks.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="la-check-row flex items-center gap-3 rounded-xl border px-3 py-2"
            style={{ borderColor: B.border, animationDelay: `${i * 120}ms` }}
          >
            <Icon size={16} style={{ color: c.ok ? B.greenDark : B.danger }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: B.blue }}>
                {c.label}
              </p>
              <p className="text-[11px]" style={{ color: B.muted }}>
                {c.hint}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={c.ok ? { background: "#F0FDF4", color: "#15803D" } : { background: "#FEF2F2", color: "#B91C1C" }}
            >
              {c.ok ? "OK" : "Fix first"}
            </span>
          </div>
        );
      })}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
        style={failed.length === 0 ? { background: "#F0FDF4", color: "#15803D" } : { background: "#FEF2F2", color: "#B91C1C" }}
      >
        {failed.length === 0 ? <CircleCheck size={14} /> : <CircleX size={14} />}
        {failed.length === 0 ? "All checks passed" : `${failed.length} check${failed.length > 1 ? "s" : ""} must be fixed first`}
      </div>
    </div>
  );
}

function ReasonInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const err = value && value.trim().length < 3 ? "Enter a reason (at least 3 characters)" : null;
  return (
    <div>
      <label className="block text-xs font-semibold" style={{ color: B.muted }}>
        Reason
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
          style={{ borderColor: err ? B.danger : B.border, color: B.blue }}
        />
      </label>
      <p className="mt-1 text-[11px]" style={{ color: err ? B.danger : B.muted }}>
        {err ?? "Saved in the audit log with your name"}
      </p>
    </div>
  );
}

/** Agent page → Services & limits: change role (with new upline) and close / reopen the account. */
export function RoleAccountCard({
  userId,
  uid,
  agentName,
  onChanged,
}: {
  userId: string;
  uid: string;
  agentName: string;
  onChanged: () => void;
}) {
  const [c, setC] = useState<Controls | null>(null);
  const [mode, setMode] = useState<"role" | "close" | "reopen" | null>(null);
  const [newRole, setNewRole] = useState<AgentRole | null>(null);
  const [upline, setUpline] = useState("");
  const [reason, setReason] = useState("");
  const [confirmUid, setConfirmUid] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setC(await fetchApi<Controls>(`/admin/users/${userId}/account-controls`));
    } catch (err) {
      toast.error(errMsg(err, "Role and account controls did not load. Refresh the page."));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function open(m: "role" | "close" | "reopen") {
    setReason("");
    setUpline("");
    setConfirmUid("");
    setNewRole(null);
    setMode(m);
  }

  if (!c) {
    return (
      <DetailSection title="Role & account" icon={UserCog}>
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      </DetailSection>
    );
  }

  const aeps = c.wallets.find((w) => w.walletType === "aeps");
  const holdTotal = c.wallets.reduce((s, w) => s + Number(w.holdBalance), 0);
  const balanceTotal = c.wallets.reduce((s, w) => s + Number(w.balance) + Number(w.holdBalance), 0);
  const balanceText = c.wallets.map((w) => `${walletName(w.walletType)} ${inr(Number(w.balance) + Number(w.holdBalance))}`).join(" · ");

  const commonChecks: Check[] = [
    { label: "No downline", ok: !c.hasDownline, hint: c.hasDownline ? "Move their agents to another upline first" : "Nobody reports to this agent", icon: Network },
    {
      label: "No pending transaction",
      ok: !c.pendingTxnRef,
      hint: c.pendingTxnRef ? `${c.pendingTxnRef} is still pending` : "Nothing in progress",
      icon: Repeat,
    },
  ];
  const roleChecks: Check[] = [
    ...commonChecks,
    {
      label: "No custom commission",
      ok: !c.hasCustomCommission,
      hint: c.hasCustomCommission ? "Remove it in the Commission tab — rates are set per role" : "Uses the role rate card",
      icon: UserCog,
    },
    {
      label: "Nothing on hold",
      ok: holdTotal === 0,
      hint: holdTotal === 0 ? "No money is held" : `${inr(holdTotal)} is on hold`,
      icon: Wallet,
    },
    ...(c.role === "retailer" && newRole && newRole !== "retailer"
      ? [
          {
            label: "AePS wallet empty",
            ok: Number(aeps?.balance ?? 0) === 0,
            hint: Number(aeps?.balance ?? 0) === 0 ? "Only retailers have an AePS wallet" : `${inr(Number(aeps?.balance ?? 0))} left — move it to Main first`,
            icon: Wallet,
          },
        ]
      : []),
  ];
  const closeChecks: Check[] = [
    ...commonChecks,
    { label: "Wallet balance ₹0", ok: balanceTotal === 0, hint: balanceTotal === 0 ? "All wallets are empty" : `${balanceText} — settle or move it first`, icon: Wallet },
  ];

  const reasonOk = reason.trim().length >= 3;
  const uplineRoles = newRole ? c.uplineRoles[newRole].map((r) => ROLE_LABEL[r] ?? r).join(" or ") : "";
  const roleReady = !!newRole && reasonOk && roleChecks.every((x) => x.ok);
  const closeReady = reasonOk && closeChecks.every((x) => x.ok) && confirmUid.trim().toUpperCase() === uid.toUpperCase();

  async function submit() {
    setBusy(true);
    try {
      if (mode === "role" && newRole) {
        await api.post(`/admin/users/${userId}/role`, { newRole, upline: upline.trim() || null, reason: reason.trim() });
        toast.success(`${agentName} is now a ${ROLE_LABEL[newRole]}. They need to log in again.`);
      } else if (mode === "close") {
        await api.post(`/admin/users/${userId}/close`, { reason: reason.trim(), confirmUid: confirmUid.trim() });
        toast.success(`${agentName}'s account is closed`);
      } else if (mode === "reopen") {
        await api.post(`/admin/users/${userId}/reopen`, { reason: reason.trim() });
        toast.success(`${agentName}'s account is open again`);
      }
      setMode(null);
      await load();
      onChanged();
    } catch (err) {
      toast.error(errMsg(err, "The change was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DetailSection title="Role & account" icon={UserCog}>
      <div className="space-y-3">
        {!c.isActive ? (
          <div className="rounded-2xl border px-3 py-2.5" style={{ borderColor: "#FCA5A5", background: "#FEF2F2" }}>
            <p className="text-sm font-bold" style={{ color: "#B91C1C" }}>
              Account closed{c.closedAt ? ` on ${fmt(c.closedAt)}` : ""}
            </p>
            <p className="text-[11px]" style={{ color: "#B91C1C" }}>
              {c.closedReason ?? "Login is off. KYC and transaction records are kept."}
            </p>
          </div>
        ) : null}

        <div className="flex items-center gap-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: B.border }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}>
            <UserCog size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
              Role
            </p>
            <p className="text-sm font-bold" style={{ color: B.blue }}>
              {ROLE_LABEL[c.role]}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || !c.isActive}
            onClick={() => open("role")}
            className="admin-btn-primary shrink-0 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
            title={c.isActive ? undefined : "Reopen the account before changing the role"}
          >
            Change role
          </button>
        </div>

        {c.isActive ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => open("close")}
            className="admin-btn-danger flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            <DoorClosed size={16} /> Close account
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => open("reopen")}
            className="admin-btn-success flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            <DoorOpen size={16} /> Reopen account
          </button>
        )}
      </div>

      {mode === "role" ? (
        <Modal
          title="Change role"
          eyebrow={agentName}
          subtitle="Wallet balance and history stay with the agent. They are logged out and see the new menu on next login."
          icon={<UserCog size={22} />}
          iconTone="blue"
          wide
          onClose={() => {
            if (!busy) setMode(null);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex h-full flex-col gap-3 rounded-2xl border p-3" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
              <p className="text-xs font-semibold" style={{ color: B.muted }}>
                New role
              </p>
              <div className="grid gap-2">
                {ROLES.filter((r) => r !== c.role).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNewRole(r)}
                    className="rounded-2xl border-2 px-3 py-2 text-left text-sm font-bold transition"
                    style={{
                      borderColor: newRole === r ? B.blueLight : B.border,
                      background: newRole === r ? "rgba(42,92,221,0.06)" : "var(--admin-card)",
                      color: B.blue,
                    }}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
              {newRole && newRole !== "super_distributor" ? (
                <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                  New upline mobile or agent ID
                  <input
                    value={upline}
                    onChange={(e) => setUpline(e.target.value.trim())}
                    placeholder="e.g. 9876543210 or ASPSD0001"
                    className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                    style={{ borderColor: B.border, color: B.blue }}
                  />
                  <span className="mt-1 block text-[11px] font-normal" style={{ color: B.muted }}>
                    Must be a {uplineRoles}. Leave empty to keep the current upline if it fits.
                  </span>
                </label>
              ) : newRole === "super_distributor" ? (
                <p className="text-[11px]" style={{ color: B.muted }}>
                  A Super Distributor reports to Admin — no upline needed.
                </p>
              ) : null}
              <div className="mt-auto">
                <ReasonInput value={reason} onChange={setReason} placeholder="e.g. Promoted after 6 months of good volume" />
              </div>
            </div>
            <CheckRows checks={roleChecks} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode(null)}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: B.danger }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !roleReady}
              onClick={() => void submit()}
              className="admin-btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Changing…" : newRole ? `Make ${ROLE_LABEL[newRole]}` : "Pick a role"}
            </button>
          </div>
        </Modal>
      ) : null}

      {mode === "close" ? (
        <Modal
          title="Close account"
          eyebrow={agentName}
          subtitle="Login stops on web and app. KYC and transaction records are kept, and you can reopen later."
          icon={<DoorClosed size={22} />}
          iconTone="red"
          wide
          onClose={() => {
            if (!busy) setMode(null);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckRows checks={closeChecks} />
            <div className="flex h-full flex-col gap-3 rounded-2xl border p-3" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
              <ReasonInput value={reason} onChange={setReason} placeholder="e.g. Agent asked to close the account" />
              <label className="block text-xs font-semibold" style={{ color: B.muted }}>
                Type the agent ID <strong style={{ color: B.blue }}>{uid}</strong> to confirm
                <input
                  value={confirmUid}
                  onChange={(e) => setConfirmUid(e.target.value)}
                  placeholder={uid}
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm uppercase outline-none"
                  style={{ borderColor: B.border, color: B.blue }}
                />
                {confirmUid && confirmUid.trim().toUpperCase() !== uid.toUpperCase() ? (
                  <span className="mt-1 block text-[11px] font-normal" style={{ color: B.danger }}>
                    Does not match — type {uid} exactly
                  </span>
                ) : null}
              </label>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode(null)}
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy || !closeReady}
              onClick={() => void submit()}
              className="admin-btn-danger rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Closing…" : "Close account"}
            </button>
          </div>
        </Modal>
      ) : null}

      {mode === "reopen" ? (
        <Modal
          title="Reopen account"
          eyebrow={agentName}
          subtitle="The agent can log in again with their existing password."
          icon={<DoorOpen size={22} />}
          iconTone="green"
          onClose={() => {
            if (!busy) setMode(null);
          }}
        >
          <div className="space-y-3">
            <ReasonInput value={reason} onChange={setReason} placeholder="e.g. Closed by mistake" />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: B.danger }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !reasonOk}
                onClick={() => void submit()}
                className="admin-btn-success rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Reopening…" : "Reopen account"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </DetailSection>
  );
}
