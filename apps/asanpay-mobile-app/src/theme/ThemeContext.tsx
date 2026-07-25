import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { createAppStorage } from "../lib/appStorage";
import { darkTokens, lightTokens, type ThemeTokens } from "./tokens";

export type ThemeMode = "light" | "dark" | "auto";

interface ThemeContextValue {
  mode: ThemeMode;
  scheme: "light" | "dark";
  tokens: ThemeTokens;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = "adhikari-theme-mode";
const storage = createAppStorage();

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("auto");

  useEffect(() => {
    async function loadSaved() {
      const saved = await storage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "auto") {
        setModeState(saved);
      }
    }
    void loadSaved();
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    void storage.setItem(STORAGE_KEY, next);
  }

  const scheme: "light" | "dark" =
    mode === "auto" ? (systemScheme === "dark" ? "dark" : "light") : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      tokens: scheme === "dark" ? darkTokens : lightTokens,
      setMode,
    }),
    [mode, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
