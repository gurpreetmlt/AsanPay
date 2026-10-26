import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import type { UserRole } from "@asanpay/shared-types";
import { initialsOf, roleTheme } from "../../lib/linkedAccounts";
import { colors, gradientDirection } from "../../theme/colors";

export function AccountAvatar({ name, role, size = 44 }: { name: string; role: UserRole; size?: number }) {
  return (
    <LinearGradient
      colors={[...roleTheme(role).avatar]}
      start={gradientDirection.diagonal.start}
      end={gradientDirection.diagonal.end}
      style={[styles.avatar, { width: size, height: size, borderRadius: size * 0.28 }]}
    >
      <Text style={[styles.avatarText, { fontSize: Math.round(size * 0.32) }]}>{initialsOf(name)}</Text>
    </LinearGradient>
  );
}

export function RoleChip({ role, roleLabel, uid }: { role: UserRole; roleLabel: string; uid: string }) {
  const t = roleTheme(role);
  return (
    <View style={[styles.chip, { backgroundColor: t.chipBg }]}>
      <Text style={[styles.chipText, { color: t.chipText }]} numberOfLines={1}>
        {roleLabel} · {uid}
      </Text>
    </View>
  );
}

export { PulseIcon } from "../PulseIcon";

/** Blue = submit / switch, green = link, red = cancel (button colour rule). */
export function LaButton({
  label,
  onPress,
  tone,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  tone: "blue" | "green" | "red" | "outline";
  disabled?: boolean;
  loading?: boolean;
}) {
  const off = disabled || loading;
  const content = loading ? (
    <ActivityIndicator color={tone === "outline" ? colors.blue : "#fff"} />
  ) : (
    <Text style={tone === "outline" ? laStyles.btnOutlineText : laStyles.btnText}>{label}</Text>
  );
  return (
    <Pressable onPress={onPress} disabled={off} style={[{ flex: 1 }, off && laStyles.disabled]} accessibilityRole="button" accessibilityLabel={label}>
      {tone === "blue" ? (
        <LinearGradient colors={[...colors.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={laStyles.btn}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            laStyles.btn,
            tone === "green" ? laStyles.btnGreen : tone === "red" ? laStyles.btnRed : laStyles.btnOutline,
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

/** Single numeric field (same look as the mobile number field) for OTP / MPIN. */
export function CodeField({
  length,
  value,
  onChange,
  masked = false,
  autoFocus = false,
  placeholder,
}: {
  length: number;
  value: string;
  onChange: (next: string) => void;
  masked?: boolean;
  autoFocus?: boolean;
  placeholder: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
      keyboardType="number-pad"
      maxLength={length}
      secureTextEntry={masked}
      autoFocus={autoFocus}
      placeholder={placeholder}
      placeholderTextColor={colors.textLight}
      textContentType={masked ? "none" : "oneTimeCode"}
      importantForAutofill={masked ? "no" : "auto"}
      style={[styles.codeField, value ? styles.codeFieldFilled : null]}
    />
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export const laStyles = StyleSheet.create({
  label: { fontSize: 12.5, fontWeight: "700", color: colors.blue, marginBottom: 10 },
  helper: { fontSize: 11.5, color: colors.textMuted, marginTop: 8 },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 22 },
  btn: { flex: 1, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  btnRed: { backgroundColor: colors.danger },
  btnGreen: { backgroundColor: colors.green },
  btnOutline: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.border },
  btnOutlineText: { color: colors.blue, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  targetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(42,92,221,0.18)",
    backgroundColor: "#F0F4FF",
  },
  name: { fontSize: 15, fontWeight: "800", color: colors.blue },
  muted: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800" },
  chip: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  chipText: { fontSize: 11, fontWeight: "700" },
  error: { marginTop: 10, fontSize: 12.5, fontWeight: "600", color: colors.danger },
  codeField: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.blue,
  },
  codeFieldFilled: { fontWeight: "800", letterSpacing: 6 },
});
