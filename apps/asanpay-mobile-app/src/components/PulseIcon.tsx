import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

export type PopupTone = "blue" | "green" | "red" | "amber";

export const POPUP_TONE: Record<PopupTone, { bg: string; fg: string }> = {
  blue: { bg: colors.bluePale, fg: colors.blueLight },
  green: { bg: "#E7F8EF", fg: colors.greenPayEnd },
  red: { bg: colors.dangerBg, fg: colors.danger },
  amber: { bg: "#FFF7ED", fg: "#D97706" },
};

/** Icon tile with the same 1.4 s pulse as web popups; still when reduce-motion is on. */
export function PulseIcon({ children, bg, accent }: { children: React.ReactNode; bg: string; accent: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.08, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [scale]);
  return (
    <Animated.View style={[styles.tile, { backgroundColor: bg, shadowColor: accent, transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
