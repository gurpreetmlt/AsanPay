import React from "react";
import { StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandLockup } from "../components/BrandMark";
import { BRAND } from "../theme/brand";
import { colors, gradientDirection } from "../theme/colors";

/**
 * Cold-start splash — same blue gradient + corner glow pattern as ScreenHeader / wallet cards.
 * Logo stays plain (no glass/glow behind the lockup).
 */
export function SplashScreen() {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...colors.gradient]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={StyleSheet.absoluteFill}
      />

      {/* Pattern: soft glowing corners (same as header / wallet cards) */}
      <View style={styles.glowTopRight} pointerEvents="none" />
      <View style={styles.glowTopLeft} pointerEvents="none" />
      <View style={styles.glowBottomLeft} pointerEvents="none" />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <BrandLockup iconSize={64} animate light showTagline playOnce />
          <Text style={styles.hint}>{BRAND.loginSubtitle}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.blue,
  },
  safe: { flex: 1 },
  /** Same recipe as ScreenHeader `glowTop` — lighter translucent circle in the corner */
  glowTopRight: {
    position: "absolute",
    top: -70,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.glow,
  },
  glowTopLeft: {
    position: "absolute",
    top: 80,
    left: -90,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.glowSoft,
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -60,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.glowSoft,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  hint: {
    marginTop: 18,
    color: colors.onGradientMuted,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});
