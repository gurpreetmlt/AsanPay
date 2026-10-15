"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import api from "@/lib/api";
import { B } from "@/lib/brand";

interface Props {
  userId: string;
  name: string;
  enabled: boolean;
  onChange?: (enabled: boolean) => void;
  showLabel?: boolean;
}

/** Admin switch: may this agent raise fund requests (cash deposit to company bank)? */
export function FundRequestSwitch({ userId, name, enabled, onChange, showLabel = false }: Props) {
  const [on, setOn] = useState(enabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !on;
    setSaving(true);
    try {
      await api.patch(`/admin/users/${userId}/fund-requests`, { enabled: next });
      setOn(next);
      onChange?.(next);
      toast.success(next ? `Fund requests enabled for ${name}` : `Fund requests disabled for ${name}`);
    } catch (err) {
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
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60"
        style={{ background: on ? "#16A34A" : "#CBD5E1" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
          style={{ left: on ? 22 : 2 }}
        />
      </button>
      {showLabel ? (
        <span className="text-xs font-semibold" style={{ color: on ? "#15803d" : B.muted }}>
          {on ? "Allowed" : "Not allowed"}
        </span>
      ) : null}
    </span>
  );
}
