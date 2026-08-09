import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";

interface BrandMarkProps {
  size?: number;
  /** `mark` = square app icon. `logo` = full wordmark logo. */
  variant?: "mark" | "logo";
}

const markSource = require("../assets/asan-pay-appicon-flat.png");
const logoSource = require("../assets/asan-pay-logo.png");
const finalLight = require("../assets/asanpay-final-light.png");
const finalDark = require("../assets/asanpay-final-dark.png");

const TAGLINE = "Payment Made Easy";
const LOGO_LOOP_MS = 5600;

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

function TypeTagline({ cycle }: { cycle: number }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    setN(0);
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      let i = 0;
      intervalId = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= TAGLINE.length && intervalId) clearInterval(intervalId);
      }, 48);
    }, 900);
    return () => {
      clearTimeout(start);
      if (intervalId) clearInterval(intervalId);
    };
  }, [cycle]);

  return (
    <Text style={styles.tagline} accessibilityLabel={TAGLINE}>
      {TAGLINE.slice(0, n)}
      {n < TAGLINE.length ? <Text style={styles.caret}>|</Text> : null}
    </Text>
  );
}

interface BrandLockupProps {
  /** Logo image width (icon + AsanPay). */
  width?: number;
  animate?: boolean;
  /** true = light logo (white Asan) for dark blue UI */
  light?: boolean;
  showTagline?: boolean;
}

/** Official Final-Logo + typed orange tagline — long still, no clip. */
export function BrandLockup({
  width = 168,
  animate = true,
  light = true,
  showTagline = true,
}: BrandLockupProps) {
  const [cycle, setCycle] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const cropH = Math.round(width * 0.205);
  const source = light ? finalLight : finalDark;

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setCycle((c) => c + 1), LOGO_LOOP_MS);
    return () => clearInterval(id);
  }, [animate]);

  useEffect(() => {
    if (!animate) {
      opacity.setValue(1);
      scale.setValue(1);
      tx.setValue(0);
      return;
    }
    opacity.setValue(0);
    scale.setValue(0.94);
    tx.setValue(-8);
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(tx, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.03,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, { toValue: 1, duration: 280, useNativeDriver: true }),
        ]),
      ]),
      Animated.delay(3400),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0.92, duration: 320, useNativeDriver: true }),
        Animated.timing(tx, { toValue: -3, duration: 320, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.98, duration: 320, useNativeDriver: true }),
      ]),
      Animated.delay(200),
    ]);
    anim.start();
    return () => anim.stop();
  }, [animate, cycle, opacity, scale, tx]);

  return (
    <View style={styles.lockup} accessibilityLabel="AsanPay">
      <Animated.View
        style={[
          styles.crop,
          { width, height: cropH, opacity, transform: [{ translateX: tx }, { scale }] },
        ]}
      >
        <Image
          source={source}
          style={{ width, height: Math.round(width * (340 / 1000)), position: "absolute", top: 0, left: 0 }}
          resizeMode="contain"
        />
      </Animated.View>
      {showTagline ? (animate ? <TypeTagline cycle={cycle} /> : <Text style={styles.tagline}>{TAGLINE}</Text>) : null}
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
    alignItems: "flex-start",
    overflow: "visible",
    gap: 3,
  },
  crop: {
    overflow: "hidden",
    position: "relative",
  },
  tagline: {
    color: "#FF8400",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
    minHeight: 14,
    paddingLeft: 2,
  },
  caret: {
    color: "#FF8400",
    fontWeight: "400",
  },
});
