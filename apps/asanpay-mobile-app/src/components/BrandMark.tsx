import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../theme/brand";
import { colors } from "../theme/colors";

interface BrandMarkProps {
  size?: number;
  /** `mark` = square app icon. `logo` = full wordmark logo. */
  variant?: "mark" | "logo";
}

const markSource = require("../assets/asan-pay-appicon-flat.png");
const logoSource = require("../assets/asan-pay-logo.png");

/** Official AsanPay brand mark / wordmark for auth surfaces. */
export function BrandMark({ size = 72, variant = "mark" }: BrandMarkProps) {
  if (variant === "logo") {
    const height = size;
    const width = Math.round(size * 3.2);
    return (
      <View style={[styles.logoWrap, { height, width }]}>
        <Image source={logoSource} style={{ width, height }} resizeMode="contain" />
      </View>
    );
  }

  const radius = Math.round(size * 0.24);
  return (
    <View style={[styles.shadow, { borderRadius: radius, width: size, height: size }]}>
      <Image
        source={markSource}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
      />
    </View>
  );
}

const brandPrefix = BRAND.appName.endsWith("Pay") ? BRAND.appName.slice(0, -3) : BRAND.appName;
const brandSuffix = BRAND.appName.endsWith("Pay") ? "Pay" : "";

interface BrandLockupProps {
  iconSize?: number;
  /** YouTube-style: icon from left, wordmark from right. */
  animate?: boolean;
  /** Dark blue header / login — white Asan + green Pay */
  light?: boolean;
}

/** Wallet icon + AsanPay wordmark — YouTube-style meet animation. */
export function BrandLockup({ iconSize = 40, animate = true, light = true }: BrandLockupProps) {
  const iconX = useRef(new Animated.Value(-32)).current;
  const textX = useRef(new Animated.Value(36)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      iconX.setValue(0);
      textX.setValue(0);
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(iconX, {
            toValue: 0,
            duration: 780,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(textX, {
            toValue: 0,
            duration: 780,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(1600),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.5, duration: 320, useNativeDriver: true }),
          Animated.timing(iconX, { toValue: -16, duration: 420, useNativeDriver: true }),
          Animated.timing(textX, { toValue: 18, duration: 420, useNativeDriver: true }),
        ]),
        Animated.delay(160),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, iconX, textX, opacity]);

  const asanColor = light ? "#FFFFFF" : colors.blue;
  const payColor = light ? "#3BE39A" : colors.green;
  const fontSize = Math.round(iconSize * 0.55);

  return (
    <View style={styles.lockup} accessibilityLabel="AsanPay">
      <Animated.View style={{ opacity, transform: [{ translateX: iconX }] }}>
        <BrandMark size={iconSize} variant="mark" />
      </Animated.View>
      <Animated.View style={[styles.word, { opacity, transform: [{ translateX: textX }] }]}>
        <Text style={[styles.asan, { color: asanColor, fontSize }]}>{brandPrefix}</Text>
        {brandSuffix ? <Text style={[styles.pay, { color: payColor, fontSize }]}>{brandSuffix}</Text> : null}
      </Animated.View>
    </View>
  );
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
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  word: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: -2,
  },
  asan: { fontWeight: "800", letterSpacing: -0.4 },
  pay: { fontWeight: "800", letterSpacing: -0.4 },
});
