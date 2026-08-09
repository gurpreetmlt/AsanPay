import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandLockup } from "../components/BrandMark";
import { BRAND } from "../theme/brand";

/** Cold-start splash — richer blue stage + same Final Logo lockup. */
export function SplashScreen() {
  const glowA = useRef(new Animated.Value(0.55)).current;
  const glowB = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = (v: Animated.Value, min: number, max: number, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: max,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: min,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

    const a = pulse(glowA, 0.45, 0.75, 3200);
    const b = pulse(glowB, 0.32, 0.58, 4100);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [glowA, glowB]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#1A4FD6", "#0B2A9A", "#071B6B", "#040F3D"]}
        locations={[0, 0.38, 0.72, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Soft brand glows — depth without clutter */}
      <Animated.View
        pointerEvents="none"
        style={[styles.orbTop, { opacity: glowA }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.orbBottom, { opacity: glowB }]}
      />
      <View pointerEvents="none" style={styles.orbGreen} />

      {/* Thin light wash from top */}
      <LinearGradient
        colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)", "transparent"]}
        locations={[0, 0.35, 1]}
        style={styles.topWash}
        pointerEvents="none"
      />

      {/* Soft bottom depth */}
      <LinearGradient
        colors={["transparent", "rgba(2, 8, 31, 0.45)"]}
        style={styles.bottomWash}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <View style={styles.logoStage}>
            <BrandLockup iconSize={64} animate light showTagline playOnce />
          </View>
          <Text style={styles.hint}>{BRAND.loginSubtitle}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#040F3D",
  },
  safe: { flex: 1 },
  topWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "42%",
  },
  bottomWash: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "36%",
  },
  orbTop: {
    position: "absolute",
    top: -100,
    right: -70,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(42, 92, 221, 0.55)",
  },
  orbBottom: {
    position: "absolute",
    bottom: -60,
    left: -100,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "rgba(18, 58, 158, 0.5)",
  },
  orbGreen: {
    position: "absolute",
    bottom: "20%",
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(36, 204, 130, 0.14)",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  logoStage: {
    paddingVertical: 22,
    paddingHorizontal: 26,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  hint: {
    marginTop: 22,
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});
