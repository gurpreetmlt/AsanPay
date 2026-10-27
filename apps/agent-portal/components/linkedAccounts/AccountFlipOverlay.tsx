"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { UserRole } from "@asanpay/shared-types";
import { B } from "@/lib/brand";
import { AccountAvatar, RoleChip } from "./parts";

export type FlipFace = { name: string; role: UserRole; roleLabel: string; uid: string; mobileMasked?: string };

/** Same timing on mobile: card pops in, flips after 150 ms for 700 ms, "Switched" holds 350 ms. */
const FLIP_DELAY_MS = 150;
export const FLIP_MS = 700;
const REDUCED_MS = 150;
const HOLD_MS = 350;
const REDUCED_HOLD_MS = 250;

function Face({ face, className }: { face: FlipFace; className: string }) {
  return (
    <div
      className={`la-flip-face ${className} flex items-center gap-3 rounded-2xl border p-3`}
      style={{ background: "#F7F9FF", borderColor: "rgba(42,92,221,0.18)" }}
    >
      <AccountAvatar name={face.name} role={face.role} size={44} />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
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

/**
 * Brand-blue blurred cover (hides the previous account's numbers) + compact card that flips from the
 * current to the target account, then `onDone`. Reduce-motion → no flip, short fade.
 */
export function AccountFlipOverlay({ from, to, onDone }: { from: FlipFace; to: FlipFace; onDone: () => void }) {
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const flipEnd = reduced ? REDUCED_MS : FLIP_DELAY_MS + FLIP_MS;
    const doneTimer = setTimeout(() => setDone(true), flipEnd);
    const exitTimer = setTimeout(() => onDoneRef.current(), flipEnd + (reduced ? REDUCED_HOLD_MS : HOLD_MS));
    return () => {
      clearTimeout(doneTimer);
      clearTimeout(exitTimer);
    };
  }, []);

  const accent = to.role === "retailer" ? B.green : B.blueLight;

  const overlay = (
    <div
      className="la-flip-overlay fixed inset-0 z-[90] flex items-center justify-center px-6"
      style={{ background: "rgba(11,42,154,0.5)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      role="status"
      aria-live="polite"
    >
      <div
        className="la-flip-panel w-full max-w-[320px] overflow-hidden rounded-3xl bg-white"
        style={{ boxShadow: "0 24px 60px rgba(4,16,64,0.35)" }}
      >
        <div className="p-4">
          <div className="la-flip-scene h-[84px] w-full">
            <div className="la-flip-card relative h-full w-full">
              <Face face={from} className="la-flip-front" />
              <Face face={to} className="la-flip-back" />
            </div>
          </div>
          {done ? (
            <p
              className="la-flip-done mt-3 flex items-center justify-center gap-1.5 text-xs font-bold"
              style={{ color: B.green }}
            >
              <CheckCircle2 size={15} /> Switched to your {to.roleLabel} account
            </p>
          ) : (
            <p
              className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold"
              style={{ color: B.blueMid }}
            >
              <Loader2 size={14} className="animate-spin" /> Switching to your {to.roleLabel} account…
            </p>
          )}
        </div>
        <div className="h-1 w-full" style={{ background: "rgba(42,92,221,0.1)" }}>
          <div className="la-flip-progress h-full w-full" style={{ background: accent }} />
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
