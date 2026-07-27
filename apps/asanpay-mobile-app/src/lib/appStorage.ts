import type { StateStorage } from "zustand/middleware";

const memory = new Map<string, string>();

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function loadAsyncStorage(): AsyncStorageModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-async-storage/async-storage").default;
  } catch {
    return null;
  }
}

// On a cold start the native AsyncStorage bridge can briefly throw before it's ready. Treating
// that the same as "no value" makes getDeviceId()/getRememberedLogin() think a trusted device's
// stored id is missing and regenerate it — silently untrusting a device the backend still
// considers fresh. Retry briefly before falling back to the (empty, this-session-only) memory map.
async function getItemWithRetry(
  asyncStorage: AsyncStorageModule,
  key: string,
  attempts = 3,
  delayMs = 150,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await asyncStorage.getItem(key);
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

/** Persists when AsyncStorage native module is linked; otherwise in-memory for this session. */
export function createAppStorage(): StateStorage {
  const asyncStorage = loadAsyncStorage();

  return {
    getItem: async (name) => {
      if (asyncStorage) {
        try {
          return await getItemWithRetry(asyncStorage, name);
        } catch {
          /* still not ready after retries */
        }
      }
      return memory.get(name) ?? null;
    },
    setItem: async (name, value) => {
      memory.set(name, value);
      if (asyncStorage) {
        try {
          await asyncStorage.setItem(name, value);
        } catch {
          /* ignore — memory copy still works this session */
        }
      }
    },
    removeItem: async (name) => {
      memory.delete(name);
      if (asyncStorage) {
        try {
          await asyncStorage.removeItem(name);
        } catch {
          /* ignore */
        }
      }
    },
  };
}
