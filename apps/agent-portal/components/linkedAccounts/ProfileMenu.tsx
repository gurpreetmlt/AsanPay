"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Lock, Plus, Settings2 } from "lucide-react";
import { ROLE_LABELS, type LinkedAccountSummary, type LinkedAccountsResponse } from "@asanpay/shared-types";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { fetchLinkedAccounts } from "@/lib/linkedAccounts";
import { AccountAvatar, RoleChip } from "./parts";
import { useMyProfilePhoto } from "@/lib/profilePhoto";
import { SwitchFlow } from "./SwitchFlow";
import { LinkAccountModal } from "./LinkAccountModal";

/** Header avatar → account switcher: current, linked accounts (Switch), link another, manage. */
export function ProfileMenu() {
  const user = useAuthStore((s) => s.user);
  const myPhoto = useMyProfilePhoto();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LinkedAccountsResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<LinkedAccountSummary | null>(null);
  const [linking, setLinking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchLinkedAccounts()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const others = data?.accounts.filter((a) => !a.isCurrent) ?? [];
  const canLinkMore = data ? data.accounts.length < data.maxLinked : false;
  const currentFace = { name: user.name, role: user.role, roleLabel, uid: user.uid };

  return (
    <div className="relative border-l pl-3" style={{ borderColor: B.border }} ref={ref}>
      <button
        type="button"
        onClick={() => {
          setLoadFailed(false);
          setOpen((v) => !v);
        }}
        className="flex items-center gap-2 rounded-xl py-1 pr-1 text-left transition hover:bg-slate-50"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <AccountAvatar name={user.name} role={user.role} size={36} photo={myPhoto} />
        <div className="hidden sm:block">
          <div className="text-sm font-bold" style={{ color: B.blue }}>
            {user.name}
          </div>
          <RoleChip role={user.role} roleLabel={roleLabel} uid={user.uid} />
        </div>
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} style={{ color: B.muted }} />
      </button>

      {open ? (
        <div
          role="menu"
          className="dropdown-pop-in absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border bg-white shadow-xl"
          style={{ borderColor: B.border }}
        >
          <div className="border-b px-4 py-3" style={{ borderColor: B.border }}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
              Your accounts
            </p>
          </div>

          <div className="flex items-center gap-3 px-4 py-3">
            <AccountAvatar name={user.name} role={user.role} size={40} photo={myPhoto} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                {user.name}
              </p>
              <RoleChip role={user.role} roleLabel={roleLabel} uid={user.uid} />
            </div>
            <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "#E7F8EF" }} aria-label="Current account">
              <Check size={14} style={{ color: B.greenDark }} />
            </span>
          </div>

          {!data && !loadFailed ? (
            <div className="px-4 pb-3">
              <div className="h-12 animate-pulse rounded-xl" style={{ background: B.bg }} />
            </div>
          ) : null}
          {loadFailed ? (
            <p className="px-4 pb-3 text-xs" style={{ color: "#DC2626" }}>
              Could not load linked accounts. Close and open the menu to retry.
            </p>
          ) : null}

          {others.map((a) => {
            const locked = Boolean(a.switchLockedUntil);
            const blocked = a.status !== "active" || locked;
            return (
              <div key={a.userId} className="flex items-center gap-3 border-t px-4 py-3" style={{ borderColor: B.border }}>
                <AccountAvatar name={a.name} role={a.role} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                    {a.name}
                  </p>
                  <RoleChip role={a.role} roleLabel={a.roleLabel} uid={a.uid} />
                  <p className="mt-0.5 text-[11px]" style={{ color: blocked ? "#B45309" : B.muted }}>
                    {a.status !== "active" ? "Needs review" : locked ? "Switch locked for now" : a.mobileMasked}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    setOpen(false);
                    setSwitchTarget(a);
                  }}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-40"
                  style={{ background: B.badgeGrad }}
                >
                  {locked ? <Lock size={12} /> : null}
                  Switch
                </button>
              </div>
            );
          })}

          <div className="border-t py-1" style={{ borderColor: B.border }}>
            {canLinkMore ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setLinking(true);
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
                style={{ color: B.greenDark }}
              >
                <Plus size={16} /> Link another account
              </button>
            ) : null}
            <Link
              href="/linked-accounts"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
              style={{ color: B.blue }}
            >
              <Settings2 size={16} /> Manage linked accounts
            </Link>
          </div>
        </div>
      ) : null}

      {switchTarget ? (
        <SwitchFlow target={switchTarget} current={currentFace} onClose={() => setSwitchTarget(null)} />
      ) : null}
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
    </div>
  );
}
