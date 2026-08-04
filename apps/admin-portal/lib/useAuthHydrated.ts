import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// zustand's `persist` hydrates synchronously from localStorage on store creation in the
// browser, but the very first client render must still match the server's (token-less)
// markup. useSyncExternalStore's client/server snapshots give us that without an effect.
export function useAuthHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
