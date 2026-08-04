"use client";

interface Props {
  active: boolean;
  onDone: () => void;
}

export function HomeEditModeBar({ active, onDone }: Props) {
  if (!active) return null;

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5"
      style={{ borderColor: "rgba(11,42,154,0.2)", background: "#E8EEFB" }}
    >
      <p className="text-[11px] font-semibold" style={{ color: "#5A6DA8" }}>
        − remove · ★ add to Favourites
      </p>
      <button
        type="button"
        onClick={onDone}
        className="text-sm font-extrabold"
        style={{ color: "#0B2A9A" }}
      >
        Done
      </button>
    </div>
  );
}
