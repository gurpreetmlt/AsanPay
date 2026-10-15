"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { B } from "@/lib/brand";
import { FundRequestPermissionModal } from "@/components/users/FundRequestPermissionModal";

interface Props {
  userId: string;
  name: string;
  enabled: boolean;
  onChange?: (enabled: boolean) => void;
  showLabel?: boolean;
}

const EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/** Admin switch: may this agent raise fund requests (cash deposit to company bank)? Opens a confirm popup. */
export function FundRequestSwitch({ userId, name, enabled, onChange, showLabel = false }: Props) {
  const [on, setOn] = useState(enabled);
  const [confirming, setConfirming] = useState(false);

  return (
    <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {confirming ? (
        <FundRequestPermissionModal
          userId={userId}
          enable={!on}
          onClose={() => setConfirming(false)}
          onSaved={(next) => {
            setOn(next);
            onChange?.(next);
          }}
        />
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Fund requests for ${name}`}
        onClick={() => setConfirming(true)}
        className="group relative h-6 w-11 shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
        style={{
          background: on ? "#16A34A" : "#CBD5E1",
          boxShadow: on ? "0 0 0 4px rgba(22,163,74,0.15)" : "0 0 0 0 rgba(22,163,74,0)",
          transition: "background-color 250ms ease, box-shadow 300ms ease, transform 150ms ease",
        }}
      >
        <span
          className="absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md group-active:w-6"
          style={{
            transform: on ? "translateX(20px)" : "translateX(0)",
            transition: `transform 350ms ${EASE}, width 150ms ease`,
          }}
        >
          {on ? (
            <Check size={12} strokeWidth={3} style={{ color: "#16A34A" }} />
          ) : (
            <X size={12} strokeWidth={3} style={{ color: "#94A3B8" }} />
          )}
        </span>
      </button>
      {showLabel ? (
        <span
          key={on ? "on" : "off"}
          className="fund-switch-label text-xs font-semibold"
          style={{ color: on ? "#15803d" : B.muted }}
        >
          {on ? "Allowed" : "Not allowed"}
        </span>
      ) : null}
    </span>
  );
}
