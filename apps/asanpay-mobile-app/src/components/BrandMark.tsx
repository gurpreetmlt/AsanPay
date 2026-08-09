import React, { useEffect, useRef } from "react";
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

interface BrandLockupProps {
  iconSize?: number;
  /** @deprecated — accepted for older call sites */
  width?: number;
  animate?: boolean;
  light?: boolean;
  showTagline?: boolean;
}

/**
 * YouTube-style: wallet holds; AsanPay + tagline slide out from under the icon.
 * No typing — full tagline. Long still.
 */
export function BrandLockup({
  iconSize,
  width,
  animate = true,
  light = true,
  showTagline = true,
}: BrandLockupProps) {
  const size = iconSize ?? (width ? Math.round(width * 0.24) : 40);
  const cycle = useRef(0);
  const iconScale = useRef(new Animated.Value(1)).current;
  const iconOpacity = useRef(new Animated.Value(1)).current;
  const textX = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(1)).current;
  const textScaleX = useRef(new Animated.Value(1)).current;

  const asanColor = light ? "#FFFFFF" : "#0B2A9A";
  const payColor = light ? "#3BE39A" : "#18B26E";
  const fontSize = Math.round(size * 0.5);

  useEffect(() => {
    if (!animate) {
      iconScale.setValue(1);
      iconOpacity.setValue(1);
      textX.setValue(0);
      textOpacity.setValue(1);
      textScaleX.setValue(1);
      return;
    }

    let alive = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    function runLoop() {
      if (!alive) return;
      cycle.current += 1;

      iconOpacity.setValue(0.65);
      iconScale.setValue(0.9);
      textOpacity.setValue(0);
      textX.setValue(-16);
      textScaleX.setValue(0.92);

      const anim = Animated.sequence([
        // Icon pops first
        Animated.parallel([
          Animated.timing(iconOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(iconScale, {
              toValue: 1.07,
              duration: 320,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(iconScale, { toValue: 1, duration: 220, useNativeDriver: true }),
          ]),
        ]),
        // Text slides out from under wallet
        Animated.parallel([
          Animated.timing(textOpacity, { toValue: 1, duration: 520, useNativeDriver: true }),
          Animated.timing(textX, {
            toValue: 0,
            duration: 620,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(textScaleX, {
            toValue: 1,
            duration: 620,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        // Long still
        Animated.delay(3400),
        // Soft tuck back under icon
        Animated.parallel([
          Animated.timing(textOpacity, { toValue: 0.75, duration: 360, useNativeDriver: true }),
          Animated.timing(textX, { toValue: -8, duration: 360, useNativeDriver: true }),
          Animated.timing(iconScale, { toValue: 0.97, duration: 360, useNativeDriver: true }),
        ]),
        Animated.delay(200),
      ]);

      anim.start(({ finished }) => {
        if (!finished || !alive) return;
        timeoutId = setTimeout(runLoop, 80);
      });
    }

    runLoop();
    return () => {
      alive = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [animate, iconScale, iconOpacity, textX, textOpacity, textScaleX]);

  return (
    <View style={styles.lockup} accessibilityLabel="AsanPay">
      <Animated.View
        style={[
          styles.iconWrap,
          { opacity: iconOpacity, transform: [{ scale: iconScale }] },
        ]}
      >
        <BrandMark size={size} variant="mark" />
      </Animated.View>

      <Animated.View
        style={[
          styles.reveal,
          {
            opacity: textOpacity,
            transform: [{ translateX: textX }, { scaleX: textScaleX }],
          },
        ]}
      >
        <Text style={[styles.wordRow, { fontSize }]} numberOfLines={1}>
          <Text style={[styles.asan, { color: asanColor }]}>{brandPrefix}</Text>
          {brandSuffix ? <Text style={[styles.pay, { color: payColor }]}>{brandSuffix}</Text> : null}
        </Text>
        {showTagline ? (
          <View style={styles.tagBlock}>
            <View style={styles.tagRule} />
            <Text style={styles.tagline}>{TAGLINE}</Text>
          </View>
        ) : null}
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
    alignItems: "flex-start",
    overflow: "visible",
    paddingVertical: 2,
  },
  iconWrap: {
    zIndex: 2,
  },
  reveal: {
    marginLeft: 6,
    paddingTop: 2,
    zIndex: 1,
  },
  wordRow: {
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  asan: { fontWeight: "800" },
  pay: { fontWeight: "800" },
  tagBlock: {
    marginTop: 5,
    gap: 3,
  },
  tagRule: {
    height: 1.5,
    width: 128,
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
});
