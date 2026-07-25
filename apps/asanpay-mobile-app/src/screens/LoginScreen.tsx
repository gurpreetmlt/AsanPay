import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Award, Lock, Network, ShieldCheck, Star, Store, Users } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api, API_BASE } from "../lib/api";
import { apiError } from "../utils/apiError";
import { BrandMark } from "../components/BrandMark";
import { colors } from "../theme/colors";
import { showAlert } from "../components/AppAlert";
import { getRememberedLogin } from "../lib/rememberedLogin";

export type LoginRoleChip = "retailer" | "distributor" | "master_distributor";

const ROLE_CHIPS: {
  key: LoginRoleChip;
  short: string;
  desc: string;
  Icon: typeof Store;
}[] = [
  { key: "retailer", short: "Retailer", desc: "Outlet agent", Icon: Store },
  { key: "distributor", short: "Distributor", desc: "Manage retailers", Icon: Users },
  { key: "master_distributor", short: "Super Dist.", desc: "Manage network", Icon: Network },
];

/** Parse backend ROLE_MISMATCH copy → chip key */
function roleFromMismatchMessage(msg: string): LoginRoleChip | null {
  const m = msg.match(/registered as\s+([^./]+)/i);
  if (!m?.[1]) return null;
  const label = m[1].trim().toLowerCase();
  if (label.includes("super") || label.includes("master")) return "master_distributor";
  if (label.includes("distributor") && !label.includes("super")) return "distributor";
  if (label.includes("retailer")) return "retailer";
  return null;
}
const TRUST_BADGES = [
  { icon: ShieldCheck, label: "RBI Compliant" },
  { icon: Lock, label: "256-bit Encrypted" },
  { icon: Award, label: "ISO Certified" },
] as const;

interface LoginScreenProps {
  onOtpSent: (mobile: string, role: LoginRoleChip, devOtp?: string, preferMpin?: boolean) => void;
  onSignup: () => void;
}

export function LoginScreen({ onOtpSent, onSignup }: LoginScreenProps) {
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<LoginRoleChip>("retailer");
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    if (mobile.length !== 10) {
      showAlert("Invalid mobile", "Enter a valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    try {
      // Trusted-device shortcut: if this is the number that last logged in on this phone, go
      // straight to the MPIN "welcome back" unlock WITHOUT sending an OTP. The server still
      // enforces the trust window — if it's lapsed, WelcomeBack falls back and requests an OTP.
      const remembered = await getRememberedLogin();
      if (remembered && remembered.mobile === mobile) {
        onOtpSent(mobile, remembered.role, undefined, true);
        return;
      }
      const { data } = await api.post<ApiResponse<{ message: string; otp?: string }>>(
        "/auth/otp/request",
        { mobile, portal: "agent", role },
      );
      if (!data.success) throw new Error(data.message);
      onOtpSent(mobile, role, data.data.otp, false);
    } catch (err) {
      const msg = apiError(err, "Could not send OTP");
      const suggested = roleFromMismatchMessage(msg);
      if (suggested && suggested !== role) {
        setRole(suggested);
        showAlert("Wrong role selected", `${msg}\n\nCorrect role auto-selected: ${ROLE_CHIPS.find((r) => r.key === suggested)?.short}. Tap Continue again.`, [
          { text: "OK", style: "primary" },
        ]);
      } else {
        showAlert("OTP failed", msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = mobile.length === 10 && !loading;
  const selected = ROLE_CHIPS.find((r) => r.key === role)!;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={["#3564E6", "#0B2A9A", "#06175A"]} style={styles.bg}>
        <View style={styles.orbTop} pointerEvents="none" />
        <View style={styles.orbBottom} pointerEvents="none" />

        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <BrandMark size={44} />
            <Text style={styles.brandText}>
              Adhikari<Text style={styles.brandTextGreen}>Pay</Text>
            </Text>
          </View>
          <View style={styles.secureChip}>
            <ShieldCheck size={13} color="#3BE39A" strokeWidth={2.3} />
            <Text style={styles.secureText}>Secure</Text>
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.trustChip}>
            <Star size={12} color="#FFD84D" fill="#FFD84D" />
            <Text style={styles.trustText}>
              <Text style={styles.trustBold}>4.8</Text> · trusted by{" "}
              <Text style={styles.trustBold}>2 Lakh+</Text> outlets
            </Text>
          </View>

          <Text style={styles.heroTitle}>
            Your business,{"\n"}banked <Text style={styles.heroGreen}>everywhere.</Text>
          </Text>
          <Text style={styles.heroSub}>
            AEPS, money transfer, bills &amp; recharge — one login for retailers, distributors
            &amp; super distributors.
          </Text>

          <View style={styles.panel}>
            <Text style={styles.label}>MOBILE NUMBER</Text>
            <View style={styles.inputRow}>
              <Text style={styles.prefix}>+91</Text>
              <View style={styles.divider} />
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                maxLength={10}
                value={mobile}
                onChangeText={(t) => setMobile(t.replace(/\D/g, ""))}
                placeholder="98765 43210"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <Text style={[styles.label, styles.labelSpaced]}>CONTINUE AS</Text>
            <Text style={styles.roleHint}>
              Select your registered role — wrong role will be rejected for this number.
            </Text>
            <View style={styles.chipRow}>
              {ROLE_CHIPS.map((r) => {
                const active = role === r.key;
                const Icon = r.Icon;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => {
                      // Switching role manually starts a fresh login — clear the number so the
                      // previous role's mobile isn't accidentally submitted under the new role.
                      // (The auto-correction path in sendOtp deliberately keeps the number.)
                      if (r.key !== role) setMobile("");
                      setRole(r.key);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.chipIconWrap, active && styles.chipIconWrapActive]}>
                      <Icon
                        size={16}
                        color={active ? "#3BE39A" : "rgba(255,255,255,0.75)"}
                        strokeWidth={2.2}
                      />
                    </View>
                    <Text style={[styles.chipTitle, active && styles.chipTitleActive]}>{r.short}</Text>
                    <Text style={[styles.chipDesc, active && styles.chipDescActive]}>{r.desc}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.selectedBanner}>
              <Text style={styles.selectedBannerText}>
                Signing in as <Text style={styles.selectedBannerBold}>{selected.short}</Text>
              </Text>
            </View>

            <Pressable onPress={sendOtp} disabled={!canSubmit} style={styles.buttonPress}>
              <LinearGradient
                colors={[...colors.gradientButton]}
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Continue  →</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          <Pressable onPress={onSignup} style={styles.signupRow}>
            <Text style={styles.signupText}>
              New agent? <Text style={styles.signupLink}>Register your outlet</Text>
            </Text>
          </Pressable>

          <View style={styles.trustRow}>
            {TRUST_BADGES.map((tb) => (
              <View key={tb.label} style={styles.trustBadge}>
                <tb.icon size={13} color="#8FA2E0" strokeWidth={2.2} />
                <Text style={styles.trustBadgeText}>{tb.label}</Text>
              </View>
            ))}
          </View>

          {__DEV__ ? <Text style={styles.devHint}>Dev API: {API_BASE}</Text> : null}
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#06175A" },
  bg: { flex: 1, paddingHorizontal: 22, paddingTop: 8 },
  orbTop: {
    position: "absolute",
    top: -90,
    right: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(36,204,130,.25)",
  },
  orbBottom: {
    position: "absolute",
    bottom: 40,
    left: -90,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(90,140,255,.22)",
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandText: {
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 20,
    color: "#fff",
    letterSpacing: -0.4,
  },
  brandTextGreen: { color: "#3BE39A" },
  secureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 18,
  },
  secureText: { fontSize: 11, color: "#DCE6FF", fontWeight: "700" },
  flex: { flex: 1, marginTop: 30 },
  trustChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.16)",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 18,
  },
  trustText: { fontSize: 11.5, color: "#DCE6FF", fontWeight: "600" },
  trustBold: { color: "#fff", fontWeight: "800" },
  heroTitle: {
    marginTop: 16,
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 29,
    color: "#fff",
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  heroGreen: { color: "#3BE39A" },
  heroSub: { marginTop: 9, fontSize: 13.5, color: "#AEC0F0", fontWeight: "500", lineHeight: 19 },
  panel: {
    marginTop: 22,
    backgroundColor: "rgba(255,255,255,.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.16)",
    borderRadius: 22,
    padding: 18,
  },
  label: { fontSize: 11.5, fontWeight: "700", color: "#B9C6F2", letterSpacing: 0.3 },
  labelSpaced: { marginTop: 18, marginBottom: 6 },
  roleHint: {
    fontSize: 11,
    color: "rgba(185,198,242,0.85)",
    fontWeight: "500",
    marginBottom: 10,
    lineHeight: 15,
  },
  inputRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,.08)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,.24)",
    borderRadius: 15,
    paddingHorizontal: 15,
    height: 54,
  },
  prefix: { fontFamily: "System", fontWeight: "700", fontSize: 16, color: "#fff" },
  divider: { width: 1, height: 22, backgroundColor: "rgba(255,255,255,.25)" },
  input: {
    flex: 1,
    color: "#fff",
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 17,
    letterSpacing: 0.5,
  },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,.2)",
    backgroundColor: "rgba(255,255,255,.07)",
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  chipActive: {
    borderColor: "#3BE39A",
    backgroundColor: "rgba(36,204,130,.18)",
  },
  chipIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  chipIconWrapActive: { backgroundColor: "rgba(59,227,154,.18)" },
  chipTitle: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 12,
    color: "#fff",
    textAlign: "center",
  },
  chipTitleActive: { color: "#fff" },
  chipDesc: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "rgba(255,255,255,.65)",
    marginTop: 2,
    textAlign: "center",
  },
  chipDescActive: { color: "rgba(191,243,217,.9)" },
  selectedBanner: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "rgba(59,227,154,.12)",
    borderWidth: 1,
    borderColor: "rgba(59,227,154,.28)",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  selectedBannerText: {
    fontSize: 12,
    color: "#BFF3D9",
    fontWeight: "600",
    textAlign: "center",
  },
  selectedBannerBold: { color: "#3BE39A", fontWeight: "800" },
  buttonPress: { marginTop: 14, borderRadius: 15 },
  button: { borderRadius: 15, paddingVertical: 16, alignItems: "center" },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  signupRow: { marginTop: 16, alignItems: "center" },
  signupText: { fontSize: 13, color: "#8FA2E0", fontWeight: "500" },
  signupLink: { color: "#3BE39A", fontWeight: "700" },
  trustRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  trustBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  trustBadgeText: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.2, color: "#8FA2E0" },
  devHint: { marginTop: 14, fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center" },
});
