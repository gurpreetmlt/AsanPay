import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { Eye, EyeOff } from "lucide-react-native";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { BrandMark } from "../components/BrandMark";
import { showAlert } from "../components/AppAlert";
import { api } from "../lib/api";
import { apiError } from "../utils/apiError";
import { useAuthStore } from "../store/auth";
import { colors } from "../theme/colors";

function passwordRuleError(value: string): string | null {
  if (value.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(value)) return "Password must contain a letter";
  if (!/\d/.test(value)) return "Password must contain a number";
  return null;
}

/** First login with the emailed temporary password — the agent must choose their own. */
export function SetPasswordGate() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const ruleError = password ? passwordRuleError(password) : null;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !passwordRuleError(password) && confirm === password && !loading;

  async function save() {
    const err = passwordRuleError(password);
    if (err) {
      showAlert("Check password", err);
      return;
    }
    if (confirm !== password) {
      showAlert("Check password", "Confirm password does not match the new password");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/auth/password/initial", {
        newPassword: password,
      });
      if (!data.success) throw new Error(data.message);
      updateUser(data.data.user);
      showAlert("Password set", "Use your new password next time you log in.");
    } catch (e) {
      showAlert("Could not save password", apiError(e, "Could not save the new password. Try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bounces={false}>
          <BrandMark size={72} variant="mark" />
          <Text style={styles.title}>Set your password</Text>
          <Text style={styles.sub}>
            {user?.name ? `Welcome, ${user.name}. ` : ""}You logged in with a temporary password. Choose your own to
            continue.
          </Text>

          <Text style={styles.label}>New password</Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!show}
              placeholder="e.g. Test1234"
              placeholderTextColor="#8892AE"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, ruleError ? styles.inputError : null]}
            />
            <Pressable
              onPress={() => setShow((v) => !v)}
              style={styles.eyeBtn}
              hitSlop={10}
              accessibilityLabel={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff size={18} color="#8892AE" /> : <Eye size={18} color="#8892AE" />}
            </Pressable>
          </View>
          <Text style={[styles.hint, ruleError ? styles.hintError : null]}>
            {ruleError ?? "Min 8 characters · include a letter and a number (e.g. Test1234)"}
          </Text>

          <Text style={[styles.label, styles.labelSpaced]}>Confirm password</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!show}
            placeholder="Type the new password again"
            placeholderTextColor="#8892AE"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, mismatch ? styles.inputError : null]}
          />
          {mismatch ? (
            <Text style={[styles.hint, styles.hintError]}>Confirm password does not match the new password</Text>
          ) : null}

          <Pressable onPress={save} disabled={!canSubmit} style={styles.btnPress}>
            <LinearGradient
              colors={[...colors.gradientButton]}
              style={[styles.btn, !canSubmit && styles.btnDisabled]}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save password</Text>}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={logout} style={styles.skip}>
            <Text style={styles.skipText}>Log out</Text>
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
  inputWrap: { position: "relative", justifyContent: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#DCE3F5",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    paddingRight: 44,
    fontSize: 15,
    color: "#0E1836",
    backgroundColor: "#fff",
  },
  inputError: { borderColor: "#DC2626" },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 36,
  },
  hint: { marginTop: 6, fontSize: 12, color: "#8892AE", fontWeight: "500" },
  hintError: { color: "#DC2626", fontWeight: "700" },
  btnPress: { marginTop: 28, borderRadius: 15, overflow: "hidden" },
  btn: { borderRadius: 15, paddingVertical: 16, alignItems: "center" },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  skip: { marginTop: 16, alignItems: "center", paddingVertical: 10 },
  skipText: { color: "#8892AE", fontWeight: "700", fontSize: 14 },
});
