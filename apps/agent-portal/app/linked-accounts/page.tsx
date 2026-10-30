"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Link2, Lock, Plus, ShieldCheck, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import { ROLE_LABELS, type LinkedAccountSummary, type LinkedAccountsResponse, type UnlinkScope } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AccountAvatar, RoleChip } from "@/components/linkedAccounts/parts";
import { SwitchFlow } from "@/components/linkedAccounts/SwitchFlow";
import { LinkAccountModal } from "@/components/linkedAccounts/LinkAccountModal";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { fetchLinkedAccounts, unlinkAccount } from "@/lib/linkedAccounts";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function AccountRow({
  account,
  linkedCount,
  onSwitch,
  onUnlink,
}: {
  account: LinkedAccountSummary;
  linkedCount: number;
  onSwitch: () => void;
  onUnlink: () => void;
}) {
  const locked = account.switchLockedUntil;
  const needsReview = account.status !== "active";
  return (
    <div className="flex flex-col gap-4 border-t px-5 py-5 sm:flex-row sm:items-center sm:px-6" style={{ borderColor: B.border }}>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <AccountAvatar name={account.name} role={account.role} size={48} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
              {account.name}
            </p>
            {account.isCurrent ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "#E7F8EF", color: B.greenDark }}>
                <CheckCircle2 size={11} /> Current account
              </span>
            ) : null}
            {needsReview ? (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "#FFF7ED", color: "#B45309" }}>
                Needs review
              </span>
            ) : null}
          </div>
          <div className="mt-1">
            <RoleChip role={account.role} roleLabel={account.roleLabel} uid={account.uid} />
          </div>
          <p className="mt-1 text-xs" style={{ color: B.muted }}>
            {account.mobileMasked}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-6 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="text-[10px]" style={{ color: B.muted }}>
            {account.isCurrent ? "Account status" : "Linked on"}
          </p>
          <p className="text-xs font-bold" style={{ color: B.blue }}>
            {account.isCurrent ? "Signed in" : formatDate(account.linkedAt)}
          </p>
          <p className="text-[10px]" style={{ color: B.muted }}>
            {locked ? `Switch locked until ${formatTime(locked)}` : "Via OTP verification"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {!account.isCurrent ? (
            <PrimaryButton size="sm" onClick={onSwitch} disabled={needsReview || Boolean(locked)} showArrow={false}>
              {locked ? <Lock size={13} /> : null}
              Switch
            </PrimaryButton>
          ) : null}
          {linkedCount > 1 ? (
            <button type="button" onClick={onUnlink} className="text-xs font-bold" style={{ color: "#DC2626" }}>
              {account.isCurrent && linkedCount > 2 ? "Leave group" : "Unlink"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function LinkedAccountsPage() {
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<LinkedAccountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<LinkedAccountSummary | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<{ account: LinkedAccountSummary; scope: UnlinkScope } | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchLinkedAccounts());
    } catch (err) {
      setError(extractApiError(err, "Could not load linked accounts"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated && accessToken) void load();
  }, [hydrated, accessToken, load]);

  async function confirmUnlink() {
    if (!unlinkTarget) return;
    setUnlinking(true);
    try {
      setData(await unlinkAccount(unlinkTarget.account.userId, unlinkTarget.scope));
      toast.success(unlinkTarget.scope === "all" ? "All accounts unlinked" : "Account unlinked");
      setUnlinkTarget(null);
    } catch (err) {
      toast.error(extractApiError(err, "Could not unlink the account"));
    } finally {
      setUnlinking(false);
    }
  }

  if (!hydrated || !accessToken || !user) return null;

  const accounts = data?.accounts ?? [];
  const linkedCount = accounts.length;
  const canLinkMore = data ? linkedCount < data.maxLinked : false;
  const current = accounts.find((a) => a.isCurrent);
  const currentFace = {
    name: user.name,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] ?? user.role,
    uid: user.uid,
    mobileMasked: current?.mobileMasked,
  };
  const unlinkCopy = (() => {
    if (!unlinkTarget) return null;
    const { account, scope } = unlinkTarget;
    if (scope === "all" || linkedCount <= 2) {
      const other = account.isCurrent ? accounts.find((a) => !a.isCurrent) : account;
      return scope === "all" && linkedCount > 2
        ? {
            title: `Unlink all ${linkedCount} accounts?`,
            message: "Every account becomes separate. You will need OTP and MPIN to link them again.",
            confirm: "Unlink all",
          }
        : {
            title: other ? `Unlink ${other.roleLabel} account?` : "Unlink account?",
            message: "You will need OTP and MPIN to link it again.",
            confirm: "Unlink",
          };
    }
    return account.isCurrent
      ? {
          title: "Leave the linked group?",
          message: `This account stops switching to the other ${linkedCount - 1}. They stay linked to each other.`,
          confirm: "Leave group",
        }
      : {
          title: `Unlink ${account.roleLabel} account ${account.uid}?`,
          message: "Your other accounts stay linked. You will need OTP and MPIN to link this one again.",
          confirm: "Unlink",
        };
  })();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <nav className="text-xs" style={{ color: B.muted }} aria-label="Breadcrumb">
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
          <span className="mx-2">/</span>
          <span>Linked accounts</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Linked accounts
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              Switch between your AsanPay accounts without logging out.
            </p>
          </div>
          {canLinkMore ? (
            <PrimaryButton variant="success" onClick={() => setLinking(true)}>
              <Plus size={16} /> Link another account
            </PrimaryButton>
          ) : null}
        </div>

        <div className="flex items-start gap-3 rounded-2xl border p-4" style={{ background: B.secondary, borderColor: "rgba(42,92,221,0.18)" }}>
          <ShieldCheck size={20} className="mt-0.5 shrink-0" style={{ color: B.blueLight }} />
          <div>
            <p className="text-sm font-bold" style={{ color: B.blue }}>
              One secure identity, multiple business roles
            </p>
            <p className="text-xs" style={{ color: B.muted }}>
              Only accounts with the same verified PAN and Aadhaar can be linked.
            </p>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-bold" style={{ color: B.blue }}>
                Your accounts
              </h2>
              <p className="text-xs" style={{ color: B.muted }}>
                {loading
                  ? "Loading…"
                  : linkedCount > 1
                    ? `${linkedCount} of ${data?.maxLinked ?? 3} accounts connected to your verified identity`
                    : "Only this account so far"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {linkedCount > 2 && current ? (
                <button
                  type="button"
                  onClick={() => setUnlinkTarget({ account: current, scope: "all" })}
                  className="rounded-full border px-3 py-1 text-[11px] font-bold transition hover:bg-[#FEF2F2]"
                  style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
                >
                  Unlink all
                </button>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: "#E7F8EF", color: B.greenDark }}>
                <ShieldCheck size={13} /> Protected by MPIN
              </span>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 border-t px-5 py-5 sm:px-6" style={{ borderColor: B.border }}>
              {[0, 1].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl" style={{ background: B.bg }} />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 border-t px-6 py-10 text-center" style={{ borderColor: B.border }}>
              <p className="text-sm font-semibold" style={{ color: "#DC2626" }}>
                {error}
              </p>
              <PrimaryButton variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </PrimaryButton>
            </div>
          ) : (
            <>
              {accounts.map((a) => (
                <AccountRow
                  key={a.userId}
                  account={a}
                  linkedCount={linkedCount}
                  onSwitch={() => setSwitchTarget(a)}
                  onUnlink={() => setUnlinkTarget({ account: a, scope: "one" })}
                />
              ))}
              {linkedCount <= 1 ? (
                <div className="flex flex-col items-center gap-3 border-t px-6 py-10 text-center" style={{ borderColor: B.border }}>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: B.bg, color: B.blueLight }}>
                    <Users size={26} />
                  </div>
                  <p className="text-sm font-bold" style={{ color: B.blue }}>
                    No linked accounts yet
                  </p>
                  <p className="max-w-sm text-xs" style={{ color: B.muted }}>
                    Run more than one role — Super Distributor, Distributor or Retailer? Link up to 3 accounts once and
                    switch with your MPIN.
                  </p>
                  {canLinkMore ? (
                    <PrimaryButton variant="success" size="sm" onClick={() => setLinking(true)}>
                      <Plus size={14} /> Link another account
                    </PrimaryButton>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="rounded-2xl border p-4 sm:p-5" style={{ background: B.secondary, borderColor: B.border }}>
          <button type="button" onClick={() => setHowOpen((v) => !v)} className="flex w-full items-center gap-3 text-left" aria-expanded={howOpen}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white" style={{ color: B.blueLight }}>
              <Link2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold" style={{ color: B.blue }}>
                How account linking works
              </p>
              <p className="text-xs" style={{ color: B.muted }}>
                We match your PAN, Aadhaar and name, verify your other mobile once, then ask for MPIN whenever you switch.
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold sm:inline-flex" style={{ color: B.blue }}>
              Learn more <ChevronDown size={14} className={howOpen ? "rotate-180" : ""} />
            </span>
          </button>
          {howOpen ? (
            <ol className="mt-4 list-decimal space-y-1.5 pl-16 text-xs" style={{ color: B.muted }}>
              <li>
                Enter the mobile number of your other AsanPay account. We check that its verified PAN, Aadhaar and name match
                every account you have already linked. One account per role, up to 3.
              </li>
              <li>Confirm the OTP sent to that number and enter that account&apos;s MPIN.</li>
              <li>Switch any time with that account&apos;s MPIN. Once every 24 hours we also ask for an OTP.</li>
              <li>Wallets, ledgers, commission and daily 2FA stay separate for each account.</li>
            </ol>
          ) : null}
        </section>
      </div>

      {linking ? (
        <LinkAccountModal
          onClose={() => setLinking(false)}
          onLinked={setData}
          onSwitchNow={(target) => {
            setLinking(false);
            setSwitchTarget(target);
          }}
        />
      ) : null}
      {switchTarget ? <SwitchFlow target={switchTarget} current={currentFace} onClose={() => setSwitchTarget(null)} /> : null}
      {unlinkTarget && unlinkCopy ? (
        <ConfirmModal
          title={unlinkCopy.title}
          message={unlinkCopy.message}
          confirmLabel={unlinkCopy.confirm}
          busy={unlinking}
          busyLabel="Unlinking…"
          tone="danger"
          onConfirm={() => void confirmUnlink()}
          onClose={() => setUnlinkTarget(null)}
        />
      ) : null}
    </AppShell>
  );
}
