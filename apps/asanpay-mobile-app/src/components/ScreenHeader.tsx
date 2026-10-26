import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { colors, gradientDirection } from "../theme/colors";

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  variant?: "default" | "profile";
  avatarLetter?: string;
  /** Replaces letter avatar when set (e.g. animated BrandMark). */
  leading?: React.ReactNode;
  /** Optional brand lockup above the title row (YouTube-style logo). */
  brand?: React.ReactNode;
  /** Optional element on the brand row, opposite the logo (e.g. support call pill). */
  brandRight?: React.ReactNode;
  /** Optional icon row rendered top-right, alongside the title/avatar block. */
  topRight?: React.ReactNode;
  /** Tap on the letter avatar (profile variant) — e.g. account switcher. */
  onAvatarPress?: () => void;
  children?: React.ReactNode;
  style?: ViewStyle;
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  variant = "default",
  avatarLetter,
  leading,
  brand,
  brandRight,
  topRight,
  onAvatarPress,
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

      {brand && brandRight ? (
        <View style={styles.brandRow}>
          <View style={[styles.brandSlot, styles.brandSlotInRow]}>{brand}</View>
          {brandRight}
        </View>
      ) : brand ? (
        <View style={styles.brandSlot}>{brand}</View>
      ) : null}

      {variant === "profile" ? (
        <View style={styles.profile}>
          {leading ?? (
            <Pressable
              style={styles.avatar}
              onPress={onAvatarPress}
              disabled={!onAvatarPress}
              hitSlop={6}
              accessibilityRole={onAvatarPress ? "button" : undefined}
              accessibilityLabel={onAvatarPress ? "Your accounts" : undefined}
            >
              <Text style={styles.avatarText}>{avatarLetter ?? "?"}</Text>
            </Pressable>
          )}
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
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    // Keep visible so brand lockup / tagline are never clipped by the header shell.
    overflow: "visible",
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
  brandSlot: {
    marginBottom: 12,
    marginRight: 8,
    overflow: "visible",
    zIndex: 2,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    zIndex: 2,
  },
  brandSlotInRow: { marginBottom: 0, flexShrink: 1 },
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
