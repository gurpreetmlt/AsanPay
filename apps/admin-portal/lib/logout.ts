import axios from "axios";
import { useAuthStore } from "./store";

/** Revoke all server sessions + clear local auth. */
export async function logoutEverywhere(): Promise<void> {
  const { logout } = useAuthStore.getState();
  try {
    await axios.post("/api/proxy/auth/logout", {}, { timeout: 8000 });
  } catch {
    /* still clear local */
  }
  logout();
}
