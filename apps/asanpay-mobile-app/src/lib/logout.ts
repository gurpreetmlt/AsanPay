import { API_BASE, setAuthHeader } from "./api";
import { disableBioUnlock } from "./bioUnlock";
import { clearRememberedLogin } from "./rememberedLogin";
import { useAuthStore } from "../store/auth";
import axios from "axios";

/** Server-side session kill + clear local auth/bio. Always succeeds locally. */
export async function logoutEverywhere(): Promise<void> {
  const { accessToken, refreshToken, logout } = useAuthStore.getState();
  try {
    await axios.post(
      `${API_BASE}/auth/logout`,
      { refreshToken: refreshToken ?? undefined },
      accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 }
        : { timeout: 8000 },
    );
  } catch {
    /* still clear local state */
  }
  await disableBioUnlock();
  await clearRememberedLogin();
  setAuthHeader(null);
  logout();
}
