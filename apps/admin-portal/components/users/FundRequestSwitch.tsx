"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Check, Loader2, X } from "lucide-react";
import api from "@/lib/api";
import { B } from "@/lib/brand";

interface Props {
  userId: string;
  name: string;
  enabled: boolean;
  onChange?: (enabled: boolean) => void;
  showLabel?: boolean;
}

const EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/** Admin switch: may this agent raise fund requests (cash deposit to company bank)? */
export function FundRequestSwitch({ userId, name, enabled, onChange, showLabel = false }: Props) {
  const [on, setOn] = useState(enabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    try {
      await api.patch(`/admin/users/${userId}/fund-requests`, { enabled: next });
      onChange?.(next);
      toast.success(next ? `Fund requests enabled for ${name}` : `Fund requests disabled for ${name}`);
    } catch (err) {
      setOn(!next);
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(msg ?? `Could not update fund requests for ${name}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Fund requests for ${name}`}
        disabled={saving}
        onClick={() => void toggle()}
        className="group relative h-6 w-11 shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 disabled:cursor-wait"
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
          {saving ? (
            <Loader2 size={12} className="animate-spin" style={{ color: on ? "#16A34A" : "#94A3B8" }} />
          ) : on ? (
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
