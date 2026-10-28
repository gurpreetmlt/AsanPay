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

/** Center-crops to a square and re-encodes as a ≤ 512 px JPEG so uploads stay small. */
export function imageFileToPhotoDataUrl(file: File, size = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      reject(new Error("Photo must be a JPG, PNG or WebP image"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error("Photo must be under 10 MB"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const out = Math.min(size, side);
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("This browser cannot resize photos. Try another browser."));
        return;
      }
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this photo. Pick another image."));
    };
    img.src = url;
  });
}
