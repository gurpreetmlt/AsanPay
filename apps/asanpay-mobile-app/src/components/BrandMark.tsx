import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

interface BrandMarkProps {
  size?: number;
  /** `mark` = square wallet icon. `logo` = full Final Logo. */
  variant?: "mark" | "logo";
  /** true = light wordmark (white Asan) for dark/blue UI */
  light?: boolean;
}

const iconLight = require("../assets/AsanPay-Light-Icon.png");
const iconDark = require("../assets/AsanPay-Dark-Icon.png");
const wordmarkLight = require("../assets/AsanPay-Light-Wordmark.png");
const wordmarkDark = require("../assets/AsanPay-Dark-Wordmark.png");

/** Official AsanPay brand mark / wordmark for auth surfaces. */
export function BrandMark({ size = 72, variant = "mark", light = true }: BrandMarkProps) {
  if (variant === "logo") {
    const height = size;
    const width = Math.round(size * 2.94);
    return (
      <View style={[styles.logoWrap, { height, width }]}>
        <Image
          source={light ? wordmarkLight : wordmarkDark}
          style={{ width, height }}
          resizeMode="contain"
        />
      </View>
    );
  }

  const radius = Math.round(size * 0.24);
  return (
    <View style={[styles.shadow, { borderRadius: radius, width: size, height: size }]}>
      <Image
        source={light ? iconLight : iconDark}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="contain"
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
 * YouTube-style mask reveal: wallet holds; exact Final Logo wordmark
 * (AsanPay + tagline) slides out from under the icon.
 */
export function BrandLockup({
  iconSize,
  width,
  animate = true,
  light = true,
  showTagline = true,
}: BrandLockupProps) {
  const size = iconSize ?? (width ? Math.round(width * 0.24) : 40);
  const wordW = Math.round(size * 3.05);
  const wordH = Math.round((wordW * 155) / 560);
  const visibleH = showTagline ? wordH : Math.round(wordH * 0.62);
  const cycle = useRef(0);
  const iconScale = useRef(new Animated.Value(1)).current;
  const iconOpacity = useRef(new Animated.Value(1)).current;
  const revealX = useRef(new Animated.Value(0)).current;
  const revealOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate) {
      iconScale.setValue(1);
      iconOpacity.setValue(1);
      revealX.setValue(0);
      revealOpacity.setValue(1);
      return;
    }

    let alive = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    function runLoop() {
      if (!alive) return;
      cycle.current += 1;

      iconOpacity.setValue(0.7);
      iconScale.setValue(0.9);
      revealOpacity.setValue(0);
      revealX.setValue(-wordW);

      const anim = Animated.sequence([
        Animated.parallel([
          Animated.timing(iconOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(iconScale, {
              toValue: 1.06,
              duration: 320,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(iconScale, { toValue: 1, duration: 220, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(revealOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(revealX, {
            toValue: 0,
            duration: 680,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(3400),
        Animated.parallel([
          Animated.timing(revealOpacity, { toValue: 0.9, duration: 360, useNativeDriver: true }),
          Animated.timing(revealX, {
            toValue: -Math.round(wordW * 0.12),
            duration: 360,
            useNativeDriver: true,
          }),
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
  }, [animate, iconScale, iconOpacity, revealX, revealOpacity, wordW]);

  return (
    <View style={styles.lockup} accessibilityLabel="AsanPay — Payment Made Easy">
      <Animated.View
        style={[
          styles.iconWrap,
          { opacity: iconOpacity, transform: [{ scale: iconScale }] },
        ]}
      >
        <BrandMark size={size} variant="mark" light={light} />
      </Animated.View>

      <View style={[styles.mask, { width: wordW, height: visibleH }]}>
        <Animated.View
          style={{
            opacity: revealOpacity,
            transform: [{ translateX: revealX }],
          }}
        >
          <Image
            source={light ? wordmarkLight : wordmarkDark}
            style={{ width: wordW, height: wordH }}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
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
    overflow: "visible",
    paddingVertical: 2,
  },
  iconWrap: {
    zIndex: 2,
  },
  mask: {
    marginLeft: -2,
    zIndex: 1,
    overflow: "hidden",
  },
});
