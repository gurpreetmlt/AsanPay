import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fingerprint, Lock } from "lucide-react-native";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { api, setAuthHeader } from "../lib/api";
import { getBioUnlock, promptDeviceBiometric, updateBioRefreshToken } from "../lib/bioUnlock";
import { useAuthStore } from "../store/auth";
import { apiError } from "../utils/apiError";
import { getDeviceId } from "../lib/deviceId";
import { PinInput } from "../components/PinInput";
import { BrandMark } from "../components/BrandMark";
import { colors } from "../theme/colors";
import { showAlert } from "../components/AppAlert";
import { touchRememberedLoginAuth } from "../lib/rememberedLogin";

interface Props {
  onUnlock: () => void;
}

/**
 * Shown when the app returns to the foreground after sitting in the background past the idle
 * threshold (see APP_LOCK_IDLE_MS in RootNavigator) — same "leave it on a table, someone else
 * picks it up" gap that banking apps close. Doesn't touch auth state on its own; only calls
 * onUnlock() once fingerprint or the account's PIN is confirmed.
 */
export function AppLockScreen({ onUnlock }: Props) {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  const [bioTried, setBioTried] = useState(false);

  useEffect(() => {
    void getBioUnlock().then((rec) => {
      const ready = Boolean(rec?.enabled && rec.mobile === user?.mobile);
      setBioReady(ready);
      if (ready) void tryBiometric();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryBiometric() {
    if (loading) return;
    setBioTried(true);
    const record = await getBioUnlock();
    if (!record?.enabled || record.mobile !== user?.mobile) return;

    setLoading(true);
    try {
      const result = await promptDeviceBiometric("Unlock AsanPay");
      if (result !== "success") return;

      const { data } = await api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
        "/auth/refresh",
        { refreshToken: record.refreshToken },
      );
      if (!data.success) throw new Error(data.message);

      setAuthHeader(data.data.accessToken);
      const me = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (!me.data.success) throw new Error(me.data.message);

      setAuth(me.data.data.user, {
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
      });
      await updateBioRefreshToken(data.data.refreshToken);
      await touchRememberedLoginAuth();
      onUnlock();
    } catch {
      // Silent — user can still fall back to PIN below. A stale/revoked token here shouldn't
      // read as "wrong fingerprint".
    } finally {
      setLoading(false);
    }
  }

  async function submitPin() {
    if (pin.length !== 4 || !user) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
        "/auth/mpin/login",
        { mobile: user.mobile, mpin: pin, portal: "agent", role: user.role, deviceId: await getDeviceId() },
      );
      if (!data.success) throw new Error(data.message);
      setAuthHeader(data.data.accessToken);
      setAuth(user, { accessToken: data.data.accessToken, refreshToken: data.data.refreshToken });
      await touchRememberedLoginAuth();
      onUnlock();
    } catch (err) {
      showAlert("Incorrect PIN", apiError(err, "Please try again"));
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <BrandMark size={48} />
        <View style={styles.lockRow}>
          <Lock size={16} color={colors.textMuted} />
          <Text style={styles.title}>App locked</Text>
        </View>
        <Text style={styles.subtitle}>
          {user?.name ? `Welcome back, ${user.name.split(" ")[0]}` : "Unlock to continue"}
        </Text>

        <PinInput length={4} value={pin} onChange={setPin} autoFocus={!bioReady || bioTried} />

        {loading ? (
          <ActivityIndicator style={styles.spinner} color={colors.blue} />
        ) : (
          <Pressable
            style={styles.unlockBtn}
            disabled={pin.length !== 4}
            onPress={() => void submitPin()}
          >
            <Text style={styles.unlockBtnText}>Unlock</Text>
          </Pressable>
        )}

        {bioReady && (
          <Pressable style={styles.bioBtn} onPress={() => void tryBiometric()} disabled={loading}>
            <Fingerprint size={20} color={colors.blue} />
            <Text style={styles.bioBtnText}>Use Fingerprint</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.card },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  title: { fontSize: 18, fontWeight: "700", color: colors.blue },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 10 },
  spinner: { marginTop: 16 },
  unlockBtn: {
    marginTop: 16,
    backgroundColor: colors.blue,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  unlockBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  bioBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 },
  bioBtnText: { color: colors.blue, fontWeight: "600", fontSize: 14 },
});
