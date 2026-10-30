import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fingerprint, Lock } from "lucide-react-native";
import { ROLE_LABELS, type ApiResponse, type AuthUser } from "@asanpay/shared-types";
import { api, setAuthHeader } from "../lib/api";
import { getBioUnlock, promptDeviceBiometric, updateBioRefreshToken } from "../lib/bioUnlock";
import { useAuthStore } from "../store/auth";
import { apiError } from "../utils/apiError";
import { getDeviceId } from "../lib/deviceId";
import { PinInput } from "../components/PinInput";
import { BrandMark } from "../components/BrandMark";
import { colors } from "../theme/colors";
import { showAlert } from "../components/AppAlert";
import { setRememberedLogin } from "../lib/rememberedLogin";
import { POLICY_PAYLOAD, hasAcceptedCurrentPolicy, isPolicyRequiredError } from "../lib/policyConsent";
import type { LoginRoleChip } from "./LoginScreen";

interface Props {
  mobile: string;
  role: LoginRoleChip;
  /** Optional display name for "Welcome back {Name}". */
  name?: string;
  /** Trust window lapsed / PIN forgotten / biometric unavailable — fall back to full OTP login. */
  onFallbackToOtp: () => void;
}

function rolePillLabel(role: LoginRoleChip): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Cold-start equivalent of AppLockScreen: shown instead of the full OTP/MPIN/Fingerprint tabbed
 * WelcomeBackScreen when this phone has a remembered trusted login. Fingerprint-first (auto-tried
 * on mount), PIN fallback — no tab switcher, no OTP option front-and-center. Only escape hatch is
 * a de-emphasized "Use OTP instead" link, for when the trust window has actually lapsed or the
 * PIN is forgotten.
 */
export function TrustedUnlockScreen({ mobile, role, name, onFallbackToOtp }: Props) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  const [bioTried, setBioTried] = useState(false);
  const [greetingName, setGreetingName] = useState(name?.trim() || "");

  useEffect(() => {
    if (name?.trim()) setGreetingName(name.trim());
  }, [name]);

  useEffect(() => {
    void getBioUnlock().then((rec) => {
      const ready = Boolean(rec?.enabled && rec.mobile === mobile);
      setBioReady(ready);
      if (ready) void tryBiometric();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryBiometric() {
    if (loading) return;
    setBioTried(true);
    const record = await getBioUnlock();
    if (!record?.enabled || record.mobile !== mobile) return;

    setLoading(true);
    try {
      // Prefetch profile so "Welcome back {Name}" shows before / during the fingerprint prompt.
      const { data } = await api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
        "/auth/refresh",
        { refreshToken: record.refreshToken },
      );
      if (!data.success) throw new Error(data.message);

      setAuthHeader(data.data.accessToken);
      const me = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (!me.data.success) throw new Error(me.data.message);

      const nextName = me.data.data.user.name?.trim() || "";
      if (nextName) {
        setGreetingName(nextName);
        await setRememberedLogin({ mobile, role, name: nextName });
      }

      const result = await promptDeviceBiometric("Unlock AsanPay");
      if (result !== "success") {
        setAuthHeader(null);
        return;
      }

      setAuth(me.data.data.user, {
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
      });
      await updateBioRefreshToken(data.data.refreshToken);
      await setRememberedLogin({
        mobile,
        role,
        name: me.data.data.user.name,
        lastAuthAt: Date.now(),
      });
    } catch {
      setAuthHeader(null);
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
        {
          mobile,
          mpin: pin,
          portal: "agent",
          role,
          deviceId: await getDeviceId(),
          ...((await hasAcceptedCurrentPolicy()) ? POLICY_PAYLOAD : {}),
        },
      );
      if (!data.success) throw new Error(data.message);
      setAuthHeader(data.data.accessToken);
      setAuth(data.data.user, { accessToken: data.data.accessToken, refreshToken: data.data.refreshToken });
      await setRememberedLogin({
        mobile,
        role,
        name: data.data.user.name,
        lastAuthAt: Date.now(),
      });
    } catch (err) {
      if (isPolicyRequiredError(err)) {
        showAlert(
          "Accept updated terms",
          "Log in once with OTP or password and tick the box to accept the Terms & Conditions and Privacy Policy.",
          [{ text: "Use OTP", style: "primary", onPress: onFallbackToOtp }],
        );
        return;
      }
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
        <Text style={styles.subtitle}>
          Welcome back{greetingName.trim() ? ` ${greetingName.trim()}` : ""}
        </Text>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{rolePillLabel(role)}</Text>
        </View>

        <PinInput length={4} value={pin} onChange={setPin} autoFocus={!bioReady || bioTried} />

        {loading ? (
          <ActivityIndicator style={styles.spinner} color={colors.blue} />
        ) : (
          <Pressable style={styles.unlockBtn} disabled={pin.length !== 4} onPress={() => void submitPin()}>
            <Text style={styles.unlockBtnText}>Unlock</Text>
          </Pressable>
        )}

        {bioReady && (
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
  subtitle: { fontSize: 14, fontWeight: "600", color: colors.textMuted, marginBottom: 8 },
  rolePill: {
    borderRadius: 999,
    backgroundColor: colors.blue,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 10,
  },
  rolePillText: { fontSize: 12, fontWeight: "800", color: "#fff" },
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
