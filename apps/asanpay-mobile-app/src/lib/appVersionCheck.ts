import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "./api";
import { APP_VERSION_CODE } from "./appVersion";
import { useAppUpdateStore } from "./appUpdate";

interface AppVersionInfo {
  minVersionCode: number;
  latestVersionCode: number;
  storeUrl: string;
}

/** Fails open: a network or server error never blocks the app. */
export async function checkAppVersion(): Promise<void> {
  try {
    const { data } = await api.get<ApiResponse<AppVersionInfo>>("/app/version", { timeout: 8_000 });
    if (!data.success || !data.data) return;
    if (APP_VERSION_CODE < Number(data.data.minVersionCode || 0)) {
      useAppUpdateStore.getState().markRequired(data.data.storeUrl);
    }
  } catch {
    /* fail open */
  }
}
