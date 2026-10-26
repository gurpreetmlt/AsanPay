"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { UserRole } from "@asanpay/shared-types";
import { B } from "@/lib/brand";
import { AccountAvatar, RoleChip } from "./parts";

export type FlipFace = { name: string; role: UserRole; roleLabel: string; uid: string; mobileMasked?: string };

export const FLIP_MS = 700;
const REDUCED_MS = 150;
const HOLD_MS = 250;

function Face({ face, className }: { face: FlipFace; className: string }) {
  return (
    <div
      className={`la-flip-face ${className} flex items-center gap-4 rounded-[20px] bg-white p-5`}
      style={{ boxShadow: "0 24px 60px rgba(11,42,154,0.28)" }}
    >
      <AccountAvatar name={face.name} role={face.role} size={56} />
      <div className="min-w-0">
        <p className="truncate text-base font-bold" style={{ color: B.blue }}>
          {face.name}
        </p>
        <div className="mt-1">
          <RoleChip role={face.role} roleLabel={face.roleLabel} uid={face.uid} />
        </div>
        {face.mobileMasked ? (
          <p className="mt-1 text-xs" style={{ color: B.muted }}>
            {face.mobileMasked}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Full-screen 3D card flip (current → target account), then `onDone`. Reduce-motion → short fade. */
export function AccountFlipOverlay({ from, to, onDone }: { from: FlipFace; to: FlipFace; onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => onDoneRef.current(), (reduced ? REDUCED_MS : FLIP_MS) + HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  const overlay = (
    <div
      className="la-flip-overlay fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 px-6"
      style={{ background: "rgba(11,42,154,0.55)", backdropFilter: "blur(6px)" }}
      role="status"
      aria-live="polite"
    >
      <div className="la-flip-scene h-[112px] w-full max-w-[360px]">
        <div className="la-flip-card relative h-full w-full">
          <Face face={from} className="la-flip-front" />
          <Face face={to} className="la-flip-back" />
        </div>
      </div>
      <p className="text-sm font-semibold text-white">Switching to your {to.roleLabel} account…</p>
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
