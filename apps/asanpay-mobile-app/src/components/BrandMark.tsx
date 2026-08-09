import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

interface Props {
  size?: number;
  /** `mark` = square app icon. `logo` = full wordmark logo. */
  variant?: "mark" | "logo";
  /** Soft idle scale + glow — dashboard / splash. */
  animate?: boolean;
}

const markSource = require("../assets/asan-pay-appicon-flat.png");
const logoSource = require("../assets/asan-pay-logo.png");

/** Official AsanPay brand mark / wordmark for auth surfaces. */
export function BrandMark({ size = 72, variant = "mark", animate = false }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, pulse]);

  if (variant === "logo") {
    const height = size;
    const width = Math.round(size * 3.2);
    const body = (
      <View style={[styles.logoWrap, { height, width }]}>
        <Image source={logoSource} style={{ width, height }} resizeMode="contain" />
      </View>
    );
    if (!animate) return body;
    return <Animated.View style={{ transform: [{ scale: pulse }] }}>{body}</Animated.View>;
  }

  const radius = Math.round(size * 0.24);
  const mark = (
    <View style={[styles.shadow, { borderRadius: radius, width: size, height: size }]}>
      <Image
        source={markSource}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
      />
    </View>
  );

  if (!animate) return mark;
  return <Animated.View style={{ transform: [{ scale: pulse }] }}>{mark}</Animated.View>;
}

const styles = StyleSheet.create({
  shadow: {
    overflow: "hidden",
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  logoWrap: {
    justifyContent: "center",
  },
});
