"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useAdminTheme, type AdminTheme } from "./AdminThemeProvider";

const ORDER: { id: AdminTheme; letter: string; title: string; icon: typeof Sun }[] = [
  { id: "light", letter: "L", title: "Light mode", icon: Sun },
  { id: "dark", letter: "D", title: "Dark mode", icon: Moon },
  { id: "auto", letter: "A", title: "Auto — 7am–7pm light, 7pm–7am dark", icon: Monitor },
];

export function ThemeTabs() {
  const { theme, setTheme } = useAdminTheme();

  const idx = ORDER.findIndex((t) => t.id === theme);
  const current = ORDER[idx >= 0 ? idx : 2];
  const Icon = current.icon;

  function cycle() {
    const next = ORDER[(Math.max(idx, 0) + 1) % ORDER.length];
    setTheme(next.id, true);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={current.title}
      title={current.title}
      className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition"
      style={{
        background: "var(--admin-bg)",
        color: "var(--admin-text)",
        border: "1px solid var(--admin-border)",
      }}
    >
      <Icon size={16} strokeWidth={2} />
      <span>{current.letter}</span>
    </button>
  );
}
