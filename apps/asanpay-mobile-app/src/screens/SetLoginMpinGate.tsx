import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { BrandMark } from "../components/BrandMark";
import { PinInput } from "../components/PinInput";
import { showAlert } from "../components/AppAlert";
import { api } from "../lib/api";
import { apiError } from "../utils/apiError";
import { useAuthStore } from "../store/auth";
import { colors } from "../theme/colors";

/** Shown once after login when the account has no login MPIN yet. */
export function SetLoginMpinGate() {
  const accessToken = useAuthStore((s) => s.accessToken)!;
  const refreshToken = useAuthStore((s) => s.refreshToken)!;
  const setAuth = useAuthStore((s) => s.setAuth);
  const skipMpinSetup = useAuthStore((s) => s.skipMpinSetup);

  const [mpin, setMpin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function save() {
    if (mpin.length !== 4) {
      showAlert("Invalid MPIN", "Enter a 4-digit MPIN.");
      return;
    }
    if (mpin !== confirm) {
      showAlert("Mismatch", "MPIN and confirm do not match.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/auth/mpin/set", { mpin });
      if (!data.success) throw new Error(data.message);
      setAuth(data.data.user, { accessToken, refreshToken });
      showAlert("Success", "Login MPIN set. Next time use Welcome back → MPIN.");
    } catch (err) {
      showAlert("Failed", apiError(err, "Could not set MPIN"));
    } finally {
      setLoading(false);
    }
  }

  function skip() {
    skipMpinSetup();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <BrandMark size={72} variant="mark" />
          <Text style={styles.title}>Set your login MPIN</Text>
          <Text style={styles.sub}>
            4-digit MPIN se next time OTP ke bina Welcome back pe unlock kar sakte ho.
          </Text>

          <Text style={styles.label}>New MPIN</Text>
          <PinInput value={mpin} onChange={setMpin} length={4} />
          <Text style={[styles.label, styles.labelSpaced]}>Confirm MPIN</Text>
          <PinInput value={confirm} onChange={setConfirm} length={4} autoFocus={false} />

          <Pressable
            onPress={save}
            disabled={loading || mpin.length !== 4 || confirm.length !== 4}
            style={styles.btnPress}
          >
            <LinearGradient
              colors={[...colors.gradientButton]}
              style={[
                styles.btn,
                (loading || mpin.length !== 4 || confirm.length !== 4) && styles.btnDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Save MPIN</Text>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={skip} style={styles.skip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  flex: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 24 },
  title: {
    marginTop: 22,
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 26,
    color: "#0E1836",
    letterSpacing: -0.4,
  },
  sub: { marginTop: 8, fontSize: 14.5, lineHeight: 22, color: "#5A6DA8", fontWeight: "500" },
  label: { marginTop: 28, marginBottom: 10, fontSize: 12, fontWeight: "700", color: "#5A6DA8", letterSpacing: 0.3 },
  labelSpaced: { marginTop: 18 },
  btnPress: { marginTop: 28, borderRadius: 15, overflow: "hidden" },
  btn: { borderRadius: 15, paddingVertical: 16, alignItems: "center" },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  skip: { marginTop: 16, alignItems: "center", paddingVertical: 10 },
  skipText: { color: "#8892AE", fontWeight: "700", fontSize: 14 },
});
