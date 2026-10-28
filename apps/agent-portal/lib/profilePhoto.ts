"use client";

import { useEffect, useSyncExternalStore } from "react";
import api, { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

type PhotoState = { userId: string | null; dataUrl: string | null; loaded: boolean };

let state: PhotoState = { userId: null, dataUrl: null, loaded: false };
let inflight: { userId: string; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function emit(next: PhotoState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function load(userId: string) {
  if (inflight?.userId === userId) return inflight.promise;
  const promise = fetchApi<{ dataUrl: string | null }>("/account/photo")
    .then((r) => emit({ userId, dataUrl: r.dataUrl, loaded: true }))
    .catch(() => emit({ userId, dataUrl: null, loaded: true }));
  inflight = { userId, promise };
  return promise;
}

/** Signed-in agent's profile photo (data URL) shared by the header menu and Settings. */
export function useMyProfilePhoto(): string | null {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const snap = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (userId && (state.userId !== userId || !state.loaded)) void load(userId);
  }, [userId]);
  return snap.userId === userId ? snap.dataUrl : null;
}

export async function saveProfilePhoto(dataUrl: string): Promise<void> {
  const { data } = await api.put<{ data: { dataUrl: string | null } }>("/account/photo", { dataUrl });
  emit({ userId: useAuthStore.getState().user?.id ?? null, dataUrl: data.data.dataUrl, loaded: true });
}

export async function removeProfilePhoto(): Promise<void> {
  await api.delete("/account/photo");
  emit({ userId: useAuthStore.getState().user?.id ?? null, dataUrl: null, loaded: true });
}
