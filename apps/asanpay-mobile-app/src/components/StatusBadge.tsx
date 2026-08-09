import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

export type StatusTone = "success" | "pending" | "danger" | "info" | "neutral";

const TONE: Record<StatusTone, { bg: string; color: string }> = {
  success: { bg: "#ecfdf5", color: "#047857" },
  pending: { bg: "#f3f4f6", color: "#4b5563" },
  danger: { bg: "#fef2f2", color: "#b91c1c" },
  info: { bg: "#eff6ff", color: "#1d4ed8" },
  neutral: { bg: "#f8fafc", color: "#64748b" },
};

export function toneFromStatus(raw: string | null | undefined): StatusTone {
  const s = (raw ?? "").toLowerCase();
  if (
    s.includes("active") ||
    s.includes("success") ||
    s.includes("verified") ||
    s.includes("approved") ||
    s.includes("completed") ||
    s.includes("paid")
  ) {
    return "success";
  }
  if (
    s.includes("fail") ||
    s.includes("reject") ||
    s.includes("cancel") ||
    s.includes("error") ||
    s.includes("block")
  ) {
    return "danger";
  }
  if (
    s.includes("process") ||
    s.includes("pending") ||
    s.includes("queue") ||
    s.includes("review") ||
    s.includes("submitted")
  ) {
    return "pending";
  }
  return "neutral";
}

export function StatusBadge({
  children,
  tone = "neutral",
  style,
}: {
  children: string;
  tone?: StatusTone;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.text, { color: t.color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: { fontSize: 11, fontWeight: "700" },
});
