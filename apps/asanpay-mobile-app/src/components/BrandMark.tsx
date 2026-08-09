import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../theme/brand";

interface BrandMarkProps {
  size?: number;
  /** `mark` = square app icon. `logo` = full wordmark logo. */
  variant?: "mark" | "logo";
}

const markSource = require("../assets/asan-pay-appicon-flat.png");
const logoSource = require("../assets/asan-pay-logo.png");

const TAGLINE = "Payment Made Easy";
const LOGO_LOOP_MS = 5600;

const brandPrefix = BRAND.appName.endsWith("Pay") ? BRAND.appName.slice(0, -3) : BRAND.appName;
const brandSuffix = BRAND.appName.endsWith("Pay") ? "Pay" : "";

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
      }, 42);
    }, 700);
    return () => {
      clearTimeout(start);
      if (intervalId) clearInterval(intervalId);
    };
  }, [cycle]);

  return (
    <Text style={styles.tagline} accessibilityLabel={TAGLINE} numberOfLines={1}>
      {TAGLINE.slice(0, n)}
      {n < TAGLINE.length ? <Text style={styles.caret}>|</Text> : null}
    </Text>
  );
}

interface BrandLockupProps {
  /** Wallet icon size (wordmark scales with it). */
  iconSize?: number;
  /** @deprecated use iconSize — kept so older call sites still compile */
  width?: number;
  animate?: boolean;
  /** true = white Asan + green Pay (dark/blue header) */
  light?: boolean;
  showTagline?: boolean;
}

/**
 * Wallet icon + AsanPay wordmark + typed tagline under AsanPay only.
 * No image crop / no overflow clip — tagline never under the icon.
 */
export function BrandLockup({
  iconSize,
  width,
  animate = true,
  light = true,
  showTagline = true,
}: BrandLockupProps) {
  const size = iconSize ?? (width ? Math.round(width * 0.24) : 40);
  const [cycle, setCycle] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const asanColor = light ? "#FFFFFF" : "#0B2A9A";
  const payColor = light ? "#3BE39A" : "#18B26E";
  const fontSize = Math.round(size * 0.52);

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setCycle((c) => c + 1), LOGO_LOOP_MS);
    return () => clearInterval(id);
  }, [animate]);

  useEffect(() => {
    if (!animate) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }
    // In-bounds only (opacity + soft scale) — no translateX so edges never clip.
    opacity.setValue(0);
    scale.setValue(0.96);
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.03,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, { toValue: 1, duration: 260, useNativeDriver: true }),
        ]),
      ]),
      Animated.delay(3600),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0.94, duration: 280, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.98, duration: 280, useNativeDriver: true }),
      ]),
      Animated.delay(180),
    ]);
    anim.start();
    return () => anim.stop();
  }, [animate, cycle, opacity, scale]);

  return (
    <Animated.View
      style={[styles.lockup, { opacity, transform: [{ scale }] }]}
      accessibilityLabel="AsanPay"
    >
      <BrandMark size={size} variant="mark" />
      <View style={styles.wordCol}>
        <Text style={[styles.wordRow, { fontSize }]} numberOfLines={1}>
          <Text style={[styles.asan, { color: asanColor }]}>{brandPrefix}</Text>
          {brandSuffix ? <Text style={[styles.pay, { color: payColor }]}>{brandSuffix}</Text> : null}
        </Text>
        {showTagline ? (
          <View style={styles.tagBlock}>
            <View style={styles.tagRule} />
            {animate ? <TypeTagline cycle={cycle} /> : <Text style={styles.tagline}>{TAGLINE}</Text>}
          </View>
        ) : null}
      </View>
    </Animated.View>
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
    alignItems: "flex-start",
    gap: 9,
    overflow: "visible",
    paddingVertical: 2,
  },
  wordCol: {
    flexShrink: 1,
    paddingTop: 2,
    minWidth: 0,
  },
  wordRow: {
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: undefined,
  },
  asan: { fontWeight: "800" },
  pay: { fontWeight: "800" },
  tagBlock: {
    marginTop: 4,
    gap: 3,
    alignSelf: "stretch",
  },
  tagRule: {
    height: 1.5,
    width: "100%",
    maxWidth: 132,
    borderRadius: 1,
    backgroundColor: "#5B8CFF",
  },
  tagline: {
    color: "#FF8400",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.9,
    lineHeight: 13,
  },
  caret: {
    color: "#FF8400",
    fontWeight: "400",
  },
});
