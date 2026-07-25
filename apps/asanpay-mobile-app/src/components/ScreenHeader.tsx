import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { colors, gradientDirection } from "../theme/colors";

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  variant?: "default" | "profile";
  avatarLetter?: string;
  /** Optional icon row rendered top-right, alongside the title/avatar block. */
  topRight?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  variant = "default",
  avatarLetter,
  topRight,
  children,
  style,
}: Props) {
  return (
    <LinearGradient
      colors={[...colors.gradient]}
      start={gradientDirection.diagonal.start}
      end={gradientDirection.diagonal.end}
      style={[styles.wrap, style]}
    >
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.rail} pointerEvents="none" />

      {variant === "profile" ? (
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarLetter ?? "?"}</Text>
          </View>
          <View style={styles.profileText}>
            {eyebrow ? (
              <Text style={styles.eyebrow} numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {topRight}
        </View>
      ) : (
        <View style={styles.topRow}>
          <View style={styles.textBlock}>
            {eyebrow ? (
              <Text style={styles.eyebrow} numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {topRight}
        </View>
      )}

      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: "hidden",
  },
  glowTop: {
    position: "absolute",
    top: -50,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.glow,
  },
  rail: {
    position: "absolute",
    top: 10,
    left: 0,
    width: 3,
    height: 32,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: colors.greenLight,
    opacity: 0.9,
  },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  textBlock: { marginBottom: 2, flexShrink: 1 },
  eyebrow: {
    color: colors.onGradientMuted,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 1,
  },
  title: {
    color: colors.onGradient,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.taglineOnGradient,
    fontSize: 11,
    marginTop: 1,
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontSize: 17, fontWeight: "800" },
  profileText: { flex: 1 },
});
