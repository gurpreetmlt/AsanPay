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
import type { LoginRoleChip } from "./LoginScreen";

interface Props {
  mobile: string;
  role: LoginRoleChip;
  /** Trust window lapsed / PIN forgotten / biometric unavailable — fall back to full OTP login. */
  onFallbackToOtp: () => void;
}

/**
 * Cold-start equivalent of AppLockScreen: shown instead of the full OTP/MPIN/Fingerprint tabbed
 * WelcomeBackScreen when this phone has a remembered trusted login. Fingerprint-first (auto-tried
 * on mount), PIN fallback — no tab switcher, no OTP option front-and-center. Only escape hatch is
 * a de-emphasized "Use OTP instead" link, for when the trust window has actually lapsed or the
 * PIN is forgotten.
 */
export function TrustedUnlockScreen({ mobile, role, onFallbackToOtp }: Props) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  const [bioTried, setBioTried] = useState(false);
  const [bioFailCount, setBioFailCount] = useState(0);
  const MAX_BIO_ATTEMPTS = 2;

  useEffect(() => {
    void getBioUnlock().then((rec) => {
      const ready = Boolean(rec?.enabled && rec.mobile === mobile);
      setBioReady(ready);
      if (ready) void tryBiometric();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryBiometric() {
    if (loading || bioFailCount >= MAX_BIO_ATTEMPTS) return;
    setBioTried(true);
    const record = await getBioUnlock();
    if (!record?.enabled || record.mobile !== mobile) return;

    setLoading(true);
    try {
      const result = await promptDeviceBiometric("Unlock AsanPay");
      if (result !== "success") {
        setBioFailCount((n) => n + 1);
        return;
      }

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
    } catch {
      // Silent — session may have expired since last use. PIN (or "Use OTP instead") still works.
    } finally {
      setLoading(false);
    }
  }

  async function submitPin() {
    if (pin.length !== 4) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ user: AuthUser; accessToken: string; refreshToken: string }>>(
        "/auth/mpin/login",
        { mobile, mpin: pin, portal: "agent", role, deviceId: await getDeviceId() },
      );
      if (!data.success) throw new Error(data.message);
      setAuthHeader(data.data.accessToken);
      setAuth(data.data.user, { accessToken: data.data.accessToken, refreshToken: data.data.refreshToken });
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === "DEVICE_NOT_TRUSTED" || code === "MPIN_NOT_SET") {
        showAlert("Verify with OTP", "This device needs a fresh OTP login before PIN unlock works again.", [
          { text: "Use OTP", style: "primary", onPress: onFallbackToOtp },
        ]);
        return;
      }
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
        <Text style={styles.subtitle}>Welcome back</Text>

        <PinInput
          length={4}
          value={pin}
          onChange={setPin}
          autoFocus={!bioReady || bioTried || bioFailCount >= MAX_BIO_ATTEMPTS}
        />

        {loading ? (
          <ActivityIndicator style={styles.spinner} color={colors.blue} />
        ) : (
          <Pressable style={styles.unlockBtn} disabled={pin.length !== 4} onPress={() => void submitPin()}>
            <Text style={styles.unlockBtnText}>Unlock</Text>
          </Pressable>
        )}

        {bioReady && bioFailCount < MAX_BIO_ATTEMPTS && (
          <Pressable style={styles.bioBtn} onPress={() => void tryBiometric()} disabled={loading}>
            <Fingerprint size={20} color={colors.blue} />
            <Text style={styles.bioBtnText}>Use Fingerprint</Text>
          </Pressable>
        )}

        <Pressable style={styles.otpLink} onPress={onFallbackToOtp} disabled={loading}>
          <Text style={styles.otpLinkText}>Use OTP instead</Text>
        </Pressable>
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
  otpLink: { marginTop: 22 },
  otpLinkText: { color: colors.textMuted, fontSize: 12, fontWeight: "500" },
});
