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

/** Persists when AsyncStorage native module is linked; otherwise in-memory for this session. */
export function createAppStorage(): StateStorage {
  const asyncStorage = loadAsyncStorage();

  return {
    getItem: async (name) => {
      if (asyncStorage) {
        try {
          return await asyncStorage.getItem(name);
        } catch {
          /* native module not ready */
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
