"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AdminTheme = "light" | "dark" | "auto";

interface AdminThemeContextValue {
  theme: AdminTheme;
  isDark: boolean;
  setTheme: (t: AdminTheme, animate?: boolean) => void;
}

const STORAGE_KEY = "asanpay-admin-theme";
const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

function isNightHours(date = new Date()) {
  const h = date.getHours();
  return h >= 19 || h < 7;
}

function resolveAdminTheme(theme: AdminTheme): "light" | "dark" {
  if (theme === "auto") return isNightHours() ? "dark" : "light";
  return theme;
}

function applyTheme(actual: "light" | "dark", animate = false) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-animating");
    window.setTimeout(() => root.classList.remove("theme-animating"), 550);
  }
  root.classList.toggle("dark", actual === "dark");
  root.dataset.adminTheme = actual;
}

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AdminTheme>("auto");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as AdminTheme) || "auto";
    const actual = resolveAdminTheme(saved);
    setThemeState(saved);
    setIsDark(actual === "dark");
    applyTheme(actual);

    const scheduleTimer = window.setInterval(() => {
      const current = (localStorage.getItem(STORAGE_KEY) as AdminTheme) || "auto";
      if (current === "auto") {
        const next = resolveAdminTheme("auto");
        setIsDark(next === "dark");
        applyTheme(next);
      }
    }, 60_000);

    return () => window.clearInterval(scheduleTimer);
  }, []);

  const setTheme = (next: AdminTheme, animate = false) => {
    const actual = resolveAdminTheme(next);
    setThemeState(next);
    setIsDark(actual === "dark");
    applyTheme(actual, animate);
    localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <AdminThemeContext.Provider value={{ theme, isDark, setTheme }}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error("useAdminTheme must be used within AdminThemeProvider");
  return ctx;
}
