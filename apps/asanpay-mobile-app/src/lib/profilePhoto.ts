import { useEffect, useSyncExternalStore } from "react";
import { api, fetchApi } from "./api";
import { useAuthStore } from "../store/auth";

type PhotoState = { userId: string | null; dataUrl: string | null; loaded: boolean };

let state: PhotoState = { userId: null, dataUrl: null, loaded: false };
let inflightFor: string | null = null;
const listeners = new Set<() => void>();

function emit(next: PhotoState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function load(userId: string) {
  if (inflightFor === userId) return;
  inflightFor = userId;
  fetchApi<{ dataUrl: string | null }>("/account/photo")
    .then((r) => emit({ userId, dataUrl: r.dataUrl, loaded: true }))
    .catch(() => emit({ userId, dataUrl: null, loaded: true }))
    .finally(() => {
      if (inflightFor === userId) inflightFor = null;
    });
}

/** Signed-in agent's profile photo (data URL), shared by every avatar in the app. */
export function useMyProfilePhoto(): string | null {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const snap = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (userId && (state.userId !== userId || !state.loaded)) load(userId);
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
