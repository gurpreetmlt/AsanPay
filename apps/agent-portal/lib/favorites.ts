"use client";

import { create } from "zustand";

export const MAX_FAVORITES = 8;
const EMPTY_CODES: string[] = [];
const STORAGE_KEY = "adhikari-service-favorites";

interface FavoritesState {
  byUser: Record<string, string[]>;
  hydrated: boolean;
  hydrate: () => void;
  toggle: (userId: string, code: string) => { added: boolean; limitReached?: boolean };
  remove: (userId: string, code: string) => void;
  reorder: (userId: string, fromIndex: number, toIndex: number) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(byUser: Record<string, string[]>) {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ byUser }));
  }, 250);
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  byUser: {},
  hydrated: false,

  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          byUser?: Record<string, string[]>;
          state?: { byUser?: Record<string, string[]> };
        };
        const byUser = parsed.state?.byUser ?? parsed.byUser;
        if (byUser && typeof byUser === "object") {
          set({ byUser, hydrated: true });
          return;
        }
      }
    } catch {
      /* use empty */
    }
    set({ hydrated: true });
  },

  toggle: (userId, code) => {
    const current = get().byUser[userId] ?? EMPTY_CODES;
    if (current.includes(code)) {
      const next = current.filter((c) => c !== code);
      const byUser = { ...get().byUser, [userId]: next };
      set({ byUser });
      scheduleSave(byUser);
      return { added: false };
    }
    if (current.length >= MAX_FAVORITES) {
      return { added: false, limitReached: true };
    }
    const next = [...current, code];
    const byUser = { ...get().byUser, [userId]: next };
    set({ byUser });
    scheduleSave(byUser);
    return { added: true };
  },

  remove: (userId, code) => {
    const current = get().byUser[userId] ?? EMPTY_CODES;
    const byUser = { ...get().byUser, [userId]: current.filter((c) => c !== code) };
    set({ byUser });
    scheduleSave(byUser);
  },

  reorder: (userId, fromIndex, toIndex) => {
    const current = [...(get().byUser[userId] ?? EMPTY_CODES)];
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    const byUser = { ...get().byUser, [userId]: current };
    set({ byUser });
    scheduleSave(byUser);
  },
}));

export function selectFavoriteCodes(state: FavoritesState, userId: string): string[] {
  return state.byUser[userId] ?? EMPTY_CODES;
}
