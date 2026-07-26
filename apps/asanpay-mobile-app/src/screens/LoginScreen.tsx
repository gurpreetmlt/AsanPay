import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff, Lock, Network, Store, Users } from "lucide-react-native";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { api, API_BASE, setAuthHeader } from "../lib/api";
import { apiError } from "../utils/apiError";
import { BrandMark } from "../components/BrandMark";
import { PinInput } from "../components/PinInput";
import { colors } from "../theme/colors";
import { BRAND } from "../theme/brand";
import { showAlert } from "../components/AppAlert";
import { setRememberedLogin } from "../lib/rememberedLogin";
import { getDeviceId, getDeviceLabel } from "../lib/deviceId";
import { useAuthStore } from "../store/auth";

// Single source of truth for the wordmark: BRAND.appName (theme/brand.ts). Splits off a
// trailing "Pay" so it renders in the accent green, same as web's Logo.tsx — falls back to
// plain text if a future brand name doesn't end in "Pay".
const brandPrefix = BRAND.appName.endsWith("Pay") ? BRAND.appName.slice(0, -3) : BRAND.appName;
const brandSuffix = BRAND.appName.endsWith("Pay") ? "Pay" : "";

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

interface LoginScreenProps {
  onSignup: () => void;
}

interface PendingSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export function LoginScreen({ onSignup }: LoginScreenProps) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<LoginRoleChip>("retailer");
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<"otp" | "password">("otp");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [pin, setPin] = useState("");
  const [otpStep, setOtpStep] = useState<"mobile" | "otp">("mobile");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);

  function finishLogin(session: PendingSession) {
    setAuthHeader(session.accessToken);
    void setRememberedLogin({ mobile: session.user.mobile, role: role });
    setAuth(session.user, { accessToken: session.accessToken, refreshToken: session.refreshToken });
  }

  async function requestOtp() {
    if (mobile.length !== 10) {
      showAlert("Invalid mobile", "Enter a valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ message: string; otp?: string }>>(
        "/auth/otp/request",
        { mobile, portal: "agent", role },
      );
      if (!data.success) throw new Error(data.message);
      setDevOtp(data.data.otp ?? null);
      setOtp(data.data.otp ?? "");
      setOtpStep("otp");
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

  async function verifyOtp() {
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<PendingSession>>("/auth/otp/verify", {
        mobile,
        otp,
        portal: "agent",
        role,
        deviceId: await getDeviceId(),
        deviceLabel: getDeviceLabel(),
      });
      if (!data.success) throw new Error(data.message);

      if (data.data.user.hasTxnPin) {
        setPendingSession(data.data);
      } else {
        finishLogin(data.data);
      }
    } catch (err) {
      showAlert("Verification failed", apiError(err, "Invalid OTP"));
      setOtp("");
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPassword() {
    if (mobile.length !== 10 || !password) {
      showAlert("Missing details", "Enter your mobile number and password");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<PendingSession>>("/auth/login", {
        mobile,
        password,
        portal: "agent",
        deviceId: await getDeviceId(),
        deviceLabel: getDeviceLabel(),
      });
      if (!data.success) throw new Error(data.message);

      if (data.data.user.hasTxnPin) {
        // Extra checkpoint before granting access — same as the OTP flow's post-verify PIN step.
        setPendingSession(data.data);
      } else {
        finishLogin(data.data);
      }
    } catch (err) {
      showAlert("Login failed", apiError(err, "Incorrect mobile number or password"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyPinAndFinish() {
    if (!pendingSession || pin.length !== 4) return;
    setLoading(true);
    try {
      await api.post(
        "/auth/txn-pin/verify",
        { pin },
        { headers: { Authorization: `Bearer ${pendingSession.accessToken}` } },
      );
      finishLogin(pendingSession);
    } catch (err) {
      showAlert("Incorrect PIN", apiError(err, "Please try again"));
      setPin("");
    } finally {
      setLoading(false);
    }
  }


  const canSubmit = mobile.length === 10 && !loading;

  if (pendingSession) {
    return (
      <SafeAreaView style={styles.lockSafe}>
        <View style={styles.lockContent}>
          <BrandMark size={48} />
          <View style={styles.lockRow}>
            <Lock size={16} color={colors.textMuted} />
            <Text style={styles.lockTitle}>Enter your PIN</Text>
          </View>
          <Text style={styles.lockSubtitle}>Welcome, {pendingSession.user.name}</Text>

          <View style={styles.pinWrap}>
            <PinInput length={4} value={pin} onChange={setPin} />
          </View>

          {loading ? (
            <ActivityIndicator style={styles.lockSpinner} color={colors.blue} />
          ) : (
            <Pressable
              style={styles.lockUnlockBtn}
              disabled={pin.length !== 4}
              onPress={() => void verifyPinAndFinish()}
            >
              <Text style={styles.lockUnlockBtnText}>Unlock</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              setPendingSession(null);
              setPin("");
            }}
            style={styles.lockBackBtn}
          >
            <Text style={styles.lockBackText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={["#3564E6", "#0B2A9A", "#06175A"]} style={styles.bg}>
        <View style={styles.brandRow}>
          <BrandMark size={40} />
          <Text style={styles.brandText}>
            {brandPrefix}
            {brandSuffix ? <Text style={styles.brandTextGreen}>{brandSuffix}</Text> : null}
          </Text>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Text style={styles.heroTitleMinimal}>Sign in to your account</Text>

          <View style={styles.panel}>
            <>
                <View style={styles.methodRow}>
                  {(["otp", "password"] as const).map((m) => {
                    const active = method === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => {
                          setMethod(m);
                          setOtpStep("mobile");
                          setOtp("");
                          setDevOtp(null);
                        }}
                        style={[styles.methodPill, active && styles.methodPillActive]}
                      >
                        <Text style={[styles.methodPillText, active && styles.methodPillTextActive]}>
                          {m === "otp" ? "OTP" : "Password"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>MOBILE NUMBER</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.prefix}>+91</Text>
                  <View style={styles.divider} />
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={10}
                    editable={otpStep === "mobile"}
                    value={mobile}
                    onChangeText={(t) => setMobile(t.replace(/\D/g, ""))}
                    placeholder="98765 43210"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                  />
                </View>

                {method === "otp" && otpStep === "otp" ? (
                  <>
                    {devOtp && (
                      <View style={styles.devOtpBanner}>
                        <Text style={styles.devOtpText}>Dev OTP: {devOtp}</Text>
                      </View>
                    )}
                    <Text style={[styles.label, styles.labelSpaced]}>6-DIGIT OTP</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.input}
                        keyboardType="number-pad"
                        maxLength={6}
                        value={otp}
                        onChangeText={(t) => setOtp(t.replace(/\D/g, ""))}
                        placeholder="••••••"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                      />
                    </View>

                    <Pressable
                      onPress={() => void verifyOtp()}
                      disabled={otp.length !== 6 || loading}
                      style={styles.buttonPress}
                    >
                      <LinearGradient
                        colors={[...colors.gradientButton]}
                        style={[styles.button, (otp.length !== 6 || loading) && styles.buttonDisabled]}
                      >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify OTP  →</Text>}
                      </LinearGradient>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setOtpStep("mobile");
                        setOtp("");
                        setDevOtp(null);
                      }}
                      style={styles.signupRow}
                    >
                      <Text style={styles.signupText}>Change mobile</Text>
                    </Pressable>
                  </>
                ) : method === "password" ? (
                  <>
                    <Text style={[styles.label, styles.labelSpaced]}>PASSWORD</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.input}
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Enter password"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                      />
                      <Pressable onPress={() => setShowPassword((v) => !v)}>
                        {showPassword ? (
                          <EyeOff size={17} color="rgba(255,255,255,0.6)" />
                        ) : (
                          <Eye size={17} color="rgba(255,255,255,0.6)" />
                        )}
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => void loginWithPassword()}
                      disabled={mobile.length !== 10 || !password || loading}
                      style={styles.buttonPress}
                    >
                      <LinearGradient
                        colors={[...colors.gradientButton]}
                        style={[
                          styles.button,
                          (mobile.length !== 10 || !password || loading) && styles.buttonDisabled,
                        ]}
                      >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login  →</Text>}
                      </LinearGradient>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={[styles.label, styles.labelSpaced]}>CONTINUE AS</Text>
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
                              // (The auto-correction path in requestOtp deliberately keeps the number.)
                              if (r.key !== role) setMobile("");
                              setRole(r.key);
                            }}
                            style={[styles.chip, active && styles.chipActive]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                          >
                            <Icon
                              size={16}
                              color={active ? "#3BE39A" : "rgba(255,255,255,0.75)"}
                              strokeWidth={2.2}
                            />
                            <Text style={[styles.chipTitle, active && styles.chipTitleActive]}>{r.short}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Pressable onPress={() => void requestOtp()} disabled={!canSubmit} style={styles.buttonPress}>
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
                  </>
                )}
              </>
          </View>

          <Pressable onPress={onSignup} style={styles.signupRow}>
            <Text style={styles.signupText}>
              New agent? <Text style={styles.signupLink}>Register your outlet</Text>
            </Text>
          </Pressable>

          {__DEV__ ? <Text style={styles.devHint}>Dev API: {API_BASE}</Text> : null}
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#06175A" },
  bg: { flex: 1, paddingHorizontal: 22, paddingTop: 8 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandText: {
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 20,
    color: "#fff",
    letterSpacing: -0.4,
  },
  brandTextGreen: { color: "#3BE39A" },
  flex: { flex: 1, marginTop: 30 },
  heroTitleMinimal: {
    marginTop: 8,
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 24,
    color: "#fff",
    letterSpacing: -0.4,
  },
  panel: {
    marginTop: 22,
    backgroundColor: "rgba(255,255,255,.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.16)",
    borderRadius: 22,
    padding: 18,
  },
  lockSafe: { flex: 1, backgroundColor: colors.card },
  lockContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  lockTitle: { fontSize: 18, fontWeight: "700", color: colors.blue },
  lockSubtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 10 },
  lockSpinner: { marginTop: 16 },
  lockUnlockBtn: {
    marginTop: 16,
    backgroundColor: colors.blue,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  lockUnlockBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  lockBackBtn: { marginTop: 18 },
  lockBackText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  methodRow: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  methodPill: { flex: 1, borderRadius: 11, paddingVertical: 9, alignItems: "center" },
  methodPillActive: { backgroundColor: "rgba(255,255,255,.16)" },
  methodPillText: { fontSize: 12.5, fontWeight: "700", color: "rgba(255,255,255,.65)" },
  methodPillTextActive: { color: "#fff" },
  pinWrap: { marginTop: 10, marginBottom: 4, alignItems: "center" },
  devOtpBanner: {
    marginTop: 10,
    backgroundColor: "rgba(59,227,154,.15)",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  devOtpText: { fontSize: 12, fontWeight: "700", color: "#3BE39A" },
  label: { fontSize: 11.5, fontWeight: "700", color: "#B9C6F2", letterSpacing: 0.3 },
  labelSpaced: { marginTop: 18, marginBottom: 6 },
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
    gap: 6,
  },
  chipActive: {
    borderColor: "#3BE39A",
    backgroundColor: "rgba(36,204,130,.18)",
  },
  chipTitle: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 12,
    color: "#fff",
    textAlign: "center",
  },
  chipTitleActive: { color: "#fff" },
  buttonPress: { marginTop: 14, borderRadius: 15 },
  button: { borderRadius: 15, paddingVertical: 16, alignItems: "center" },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  signupRow: { marginTop: 16, alignItems: "center" },
  signupText: { fontSize: 13, color: "#8FA2E0", fontWeight: "500" },
  signupLink: { color: "#3BE39A", fontWeight: "700" },
  devHint: { marginTop: 14, fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center" },
});
