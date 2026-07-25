import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Delete, ScanFace } from "lucide-react-native";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { api, setAuthHeader } from "../lib/api";
import {
  enableBioUnlock,
  getBioUnlock,
  promptDeviceBiometric,
  updateBioRefreshToken,
} from "../lib/bioUnlock";
import { useAuthStore } from "../store/auth";
import { apiError } from "../utils/apiError";
import { getDeviceId, getDeviceLabel } from "../lib/deviceId";
import { setRememberedLogin } from "../lib/rememberedLogin";
import { BrandMark } from "../components/BrandMark";
import { CodeGrid } from "../components/CodeGrid";
import { colors } from "../theme/colors";
import type { LoginRoleChip } from "./LoginScreen";
import { showAlert } from "../components/AppAlert";

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

interface Props {
  mobile: string;
  role: LoginRoleChip;
  devOtp?: string;
  /** True when arriving via the trusted-device shortcut (no OTP was sent) → open MPIN first. */
  preferMpin?: boolean;
  onBack: () => void;
}

type AuthTab = "mpin" | "otp" | "fingerprint";

const ROLE_SHORT: Record<LoginRoleChip, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  master_distributor: "Super Dist.",
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "back"] as const;

/** Design 1b — light “Welcome back” unlock (MPIN / OTP / Fingerprint). */
export function WelcomeBackScreen({ mobile, role, devOtp: initialDevOtp, preferMpin, onBack }: Props) {
  const setAuth = useAuthStore((s) => s.setAuth);
  // Trusted-device shortcut opens MPIN; a fresh OTP send opens the OTP tab (the code was just sent).
  const [tab, setTab] = useState<AuthTab>(preferMpin ? "mpin" : initialDevOtp ? "otp" : "mpin");
  const [mpin, setMpin] = useState("");
  const [otp, setOtp] = useState(initialDevOtp ?? "");
  const [devOtp, setDevOtp] = useState(initialDevOtp ?? "");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  const autoSubmitRef = useRef("");
  const pendingLoginRef = useRef<LoginResponse | null>(null);
  // Trusted-device shortcut (preferMpin) skips the OTP send — request one lazily
  // the first time the user opens the OTP tab, or verify will say "not requested".
  const otpRequestedRef = useRef(!preferMpin);

  const mpinLen = 4;
  const otpLen = 6;

  useEffect(() => {
    if (initialDevOtp) {
      setDevOtp(initialDevOtp);
      setOtp(initialDevOtp);
      // Keep MPIN as default tab; OTP stays prefilled on OTP tab.
    }
  }, [initialDevOtp]);

  useEffect(() => {
    void getBioUnlock().then((rec) => {
      setBioReady(Boolean(rec?.enabled && rec.mobile === mobile));
    });
  }, [mobile]);

  function commitLogin(session: LoginResponse) {
    setAuthHeader(session.accessToken);
    // Remember this number+role so next login on this phone opens MPIN directly (skips OTP send).
    void setRememberedLogin({ mobile, role });
    setAuth(session.user, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  }

  async function finishLogin(session: LoginResponse) {
    await updateBioRefreshToken(session.refreshToken);

    const existing = await getBioUnlock();
    if (existing?.enabled && existing.mobile === mobile) {
      await enableBioUnlock({
        mobile,
        role,
        refreshToken: session.refreshToken,
      });
      commitLogin(session);
      return;
    }

    // Ask BEFORE setAuth so WelcomeBack stays mounted and Enable can run.
    pendingLoginRef.current = session;
    showAlert("Enable fingerprint?", "Next time Fingerprint tab se jaldi unlock.", [
      {
        text: "Not now",
        style: "cancel",
        onPress: () => {
          const s = pendingLoginRef.current;
          pendingLoginRef.current = null;
          if (s) commitLogin(s);
        },
      },
      {
        text: "Enable",
        style: "primary",
        onPress: () => {
          const s = pendingLoginRef.current;
          pendingLoginRef.current = null;
          if (!s) return;
          void enableBioUnlock({
            mobile,
            role,
            refreshToken: s.refreshToken,
          }).then(() => {
            setBioReady(true);
            commitLogin(s);
          });
        },
      },
    ]);
  }

  function pressDigit(d: string) {
    if (tab === "mpin") {
      setMpin((prev) => (prev.length >= mpinLen ? prev : prev + d));
      return;
    }
    if (tab === "otp") {
      setOtp((prev) => (prev.length >= otpLen ? prev : prev + d));
    }
  }

  function pressBackspace() {
    if (tab === "mpin") setMpin((prev) => prev.slice(0, -1));
    else if (tab === "otp") setOtp((prev) => prev.slice(0, -1));
  }

  async function unlockWithFingerprint() {
    if (loading) return;
    const record = await getBioUnlock();
    if (!record?.enabled || record.mobile !== mobile) {
      showAlert(
        "Fingerprint not enabled",
        "Pehle OTP ya MPIN se login karo, phir fingerprint enable karo. Account → Fingerprint unlock se bhi on kar sakte ho.",
      );
      return;
    }

    setLoading(true);
    try {
      const result = await promptDeviceBiometric("Unlock AsanPay");
      if (result === "cancel") return;
      if (result === "unavailable") {
        showAlert(
          "Unavailable",
          "Is device pe biometric nahi mila. MPIN / OTP use karo, ya Mac Terminal mein `react-native-biometrics` install + rebuild karo.",
        );
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
    } catch (err) {
      showAlert(
        "Fingerprint unlock failed",
        apiError(err, "Session expired — OTP ya MPIN se login karke fingerprint dobara enable karo."),
      );
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (resendLoading) return;
    otpRequestedRef.current = true;
    setResendLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ message: string; otp?: string }>>(
        "/auth/otp/request",
        { mobile, portal: "agent", role },
      );
      if (!data.success) throw new Error(data.message);
      if (data.data.otp) {
        setDevOtp(data.data.otp);
        setOtp(data.data.otp);
      } else {
        setOtp("");
      }
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Could not resend OTP"));
    } finally {
      setResendLoading(false);
    }
  }

  async function verifyOtp() {
    const value = otp.trim();
    if (value.length !== otpLen) {
      showAlert("Invalid OTP", "Enter the 6-digit OTP.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponse>>("/auth/otp/verify", {
        mobile,
        otp: value,
        portal: "agent",
        role,
        deviceId: await getDeviceId(),
        deviceLabel: getDeviceLabel(),
      });
      if (!data.success) throw new Error(data.message);
      await finishLogin(data.data);
    } catch (err) {
      showAlert("Verification failed", apiError(err, "Invalid OTP"));
      setOtp("");
      autoSubmitRef.current = "";
    } finally {
      setLoading(false);
    }
  }

  async function submitMpin() {
    if (mpin.length !== mpinLen) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponse>>("/auth/mpin/login", {
        mobile,
        mpin,
        portal: "agent",
        role,
        deviceId: await getDeviceId(),
      });
      if (!data.success) throw new Error(data.message);
      await finishLogin(data.data);
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      const msg = apiError(err, "Incorrect MPIN");
      if (code === "DEVICE_NOT_TRUSTED") {
        showAlert(
          "Verify this device",
          "Is device pe pehle OTP ya password se login karein — uske baad 24h tak MPIN chalega.",
          [
            {
              text: "Open OTP",
              style: "primary",
              onPress: () => {
                setTab("otp");
                setMpin("");
                void resendOtp();
              },
            },
          ],
        );
      } else if (code === "MPIN_NOT_SET" || msg.toLowerCase().includes("not set")) {
        showAlert("MPIN not set", "Pehle OTP tab se login karo, phir 4-digit MPIN set karo.", [
          {
            text: "Open OTP",
            style: "primary",
            onPress: () => {
              setTab("otp");
              setMpin("");
            },
          },
        ]);
      } else {
        showAlert("MPIN login failed", msg);
      }
      setMpin("");
      autoSubmitRef.current = "";
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (tab === "mpin" && mpin.length === mpinLen) {
      const key = `mpin:${mpin}`;
      if (autoSubmitRef.current === key) return;
      autoSubmitRef.current = key;
      void submitMpin();
    }
    if (tab === "otp" && otp.length === otpLen) {
      const key = `otp:${otp}`;
      if (autoSubmitRef.current === key) return;
      autoSubmitRef.current = key;
      void verifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpin, otp, tab, loading]);

  useEffect(() => {
    if (tab === "fingerprint" && bioReady) {
      void unlockWithFingerprint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, bioReady]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.body}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.change}>
          <Text style={styles.changeText}>← Change number</Text>
        </Pressable>

        <BrandMark size={64} variant="mark" />

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          Enter your{" "}
          {tab === "otp" ? "OTP" : tab === "fingerprint" ? "fingerprint" : "MPIN"} to continue as{" "}
          <Text style={styles.role}>{ROLE_SHORT[role]}</Text>
        </Text>
        <Text style={styles.mobile}>+91 {mobile}</Text>
        {role === "master_distributor" ? (
          <Text style={styles.roleNote}>Super Distributor account — continue as Super Dist. selected ✓</Text>
        ) : null}

        <View style={styles.tabRow}>
          {(
            [
              ["mpin", "MPIN"],
              ["otp", "OTP"],
              ["fingerprint", "Fingerprint"],
            ] as const
          ).map(([key, label]) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  setTab(key);
                  autoSubmitRef.current = "";
                  if (key === "otp" && !otpRequestedRef.current) {
                    void resendOtp();
                  }
                }}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "fingerprint" ? (
          <View style={styles.bioBlock}>
            <Pressable onPress={() => void unlockWithFingerprint()} style={styles.bioCircle}>
              <ScanFace size={42} color={colors.blueFlat} strokeWidth={1.8} />
            </Pressable>
            <Text style={styles.bioHint}>Tap to unlock with fingerprint / face</Text>
            <Text style={styles.bioSoon}>
              {bioReady ? "Ready on this device" : "Enable after OTP / MPIN login"}
            </Text>
          </View>
        ) : (
          <>
            {tab === "otp" && devOtp && __DEV__ ? (
              <View style={styles.devBox}>
                <Text style={styles.devLabel}>Dev OTP</Text>
                <Text style={styles.devCode}>{devOtp.split("").join(" ")}</Text>
              </View>
            ) : null}

            <View style={styles.codeArea}>
              {tab === "mpin" ? (
                <PinDots length={mpinLen} value={mpin} />
              ) : (
                <CodeGrid length={otpLen} value={otp} tone="light" />
              )}
            </View>

            {tab === "otp" ? (
              <Pressable onPress={resendOtp} disabled={resendLoading} style={styles.linkBtn}>
                <Text style={styles.linkMuted}>
                  {resendLoading ? "Sending…" : "Didn’t get OTP?"}{" "}
                  {!resendLoading ? <Text style={styles.linkAction}>Resend</Text> : null}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() =>
                  showAlert(
                    "Reset MPIN",
                    "Login with OTP first. Then open Account → Set login MPIN to create or change your 4-digit MPIN.",
                  )
                }
                style={styles.linkBtn}
              >
                <Text style={styles.linkMuted}>
                  Forgot MPIN? <Text style={styles.linkAction}>Reset now</Text>
                </Text>
              </Pressable>
            )}

            <View style={styles.keypad}>
              {KEYS.map((k) => {
                if (k === "bio") {
                  return (
                    <Pressable
                      key={k}
                      onPress={() => {
                        setTab("fingerprint");
                      }}
                      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                    >
                      <ScanFace size={22} color={colors.blueFlat} strokeWidth={2} />
                    </Pressable>
                  );
                }
                if (k === "back") {
                  return (
                    <Pressable
                      key={k}
                      onPress={pressBackspace}
                      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                    >
                      <Delete size={20} color="#5A6DA8" strokeWidth={2.2} />
                    </Pressable>
                  );
                }
                return (
                  <Pressable
                    key={k}
                    onPress={() => pressDigit(k)}
                    style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                  >
                    <Text style={styles.keyText}>{k}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.blueFlat} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function PinDots({ length, value }: { length: number; value: string }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length }).map((_, i) => {
        const filled = i < value.length;
        return <View key={i} style={[styles.dot, filled && styles.dotFilled]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  body: { flex: 1, paddingHorizontal: 28, paddingTop: 8, paddingBottom: 20 },
  change: { alignSelf: "flex-start", marginBottom: 18 },
  changeText: { color: "#5A6DA8", fontWeight: "700", fontSize: 13.5 },
  title: {
    marginTop: 20,
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 28,
    color: "#0E1836",
    letterSpacing: -0.5,
  },
  subtitle: { marginTop: 6, fontSize: 15, color: "#5A6DA8", fontWeight: "500", lineHeight: 22 },
  role: { color: "#0B2A9A", fontWeight: "700" },
  mobile: { marginTop: 4, fontSize: 13, color: "#8892AE", fontWeight: "600" },
  roleNote: {
    marginTop: 6,
    fontSize: 12,
    color: "#11A362",
    fontWeight: "700",
  },
  tabRow: {
    marginTop: 28,
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#F1F4FC",
    padding: 5,
    borderRadius: 14,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10 },
  tabActive: {
    backgroundColor: "#fff",
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: { fontFamily: "System", fontWeight: "700", fontSize: 13.5, color: "#8892AE" },
  tabTextActive: { color: "#0B2A9A" },
  codeArea: { marginTop: 34, alignItems: "center", minHeight: 56, justifyContent: "center" },
  dotsRow: { flexDirection: "row", gap: 16, justifyContent: "center" },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E2E7F4",
  },
  dotFilled: { backgroundColor: "#2A5CDD" },
  linkBtn: { alignItems: "center", marginTop: 18 },
  linkMuted: { fontSize: 13, color: "#8892AE", fontWeight: "600" },
  linkAction: { color: "#2A5CDD", fontWeight: "700" },
  keypad: {
    marginTop: 28,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "space-between",
  },
  key: {
    width: "30%",
    aspectRatio: 1.55,
    borderRadius: 16,
    backgroundColor: "#F4F6FB",
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  keyText: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 24,
    color: "#0B2A9A",
  },
  bioBlock: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 40 },
  bioCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#EEF3FF",
    borderWidth: 1.5,
    borderColor: "#D6DEF5",
    alignItems: "center",
    justifyContent: "center",
  },
  bioHint: { marginTop: 18, fontSize: 14, color: "#5A6DA8", fontWeight: "600", textAlign: "center" },
  bioSoon: { marginTop: 6, fontSize: 12, color: "#8892AE", fontWeight: "700" },
  devBox: {
    marginTop: 18,
    alignItems: "center",
    backgroundColor: "#E7FBF1",
    borderWidth: 1,
    borderColor: "#11A362",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  devLabel: { fontSize: 10, fontWeight: "700", color: "#11A362" },
  devCode: { fontSize: 18, fontWeight: "800", color: "#0E1836", letterSpacing: 3, marginTop: 2 },
  loading: { position: "absolute", bottom: 28, alignSelf: "center" },
});
