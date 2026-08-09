"use client";

import { PrimaryButton } from "@/components/ui/PrimaryButton";

interface Props {
  active: boolean;
  onDone: () => void;
}

export function HomeEditModeBar({ active, onDone }: Props) {
  if (!active) return null;

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-2xl border px-3 py-2.5"
      style={{ borderColor: "rgba(11,42,154,0.2)", background: "#E8EEFB" }}
    >
      <p className="text-[12px] font-semibold" style={{ color: "#5A6DA8" }}>
        − remove · ★ add to Favourites
      </p>
        <PrimaryButton
          type="button"
          variant="secondary"
          size="sm"
          showArrow={false}
          onClick={onDone}
          className="!w-auto"
        >
          Done
        </PrimaryButton>
    </div>
  );
}
