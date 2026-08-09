import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

interface BrandMarkProps {
  size?: number;
  /** `mark` = square wallet icon. `logo` = Final Logo wordmark. */
  variant?: "mark" | "logo";
  /** true = light wordmark (white Asan) for dark/blue UI */
  light?: boolean;
}

const iconLight = require("../assets/AsanPay-Light-Icon.png");
const iconDark = require("../assets/AsanPay-Dark-Icon.png");
const wordmarkLight = require("../assets/AsanPay-Light-Wordmark.png");
const wordmarkDark = require("../assets/AsanPay-Dark-Wordmark.png");

/** Wordmark crop aspect from Final Logo (620×200). */
const WORD_ASPECT = 200 / 620;

/** Official AsanPay brand mark / wordmark for auth surfaces. */
export function BrandMark({ size = 72, variant = "mark", light = true }: BrandMarkProps) {
  if (variant === "logo") {
    const height = size;
    const width = Math.round(size / WORD_ASPECT);
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
 * Perfect loop (no blink):
 * slow Y→A + text slide-reveal → long hold → slow A→Y reverse.
 * Only translateX (native driver) — no opacity fade, no width animation.
 */
export function BrandLockup({
  iconSize,
  width,
  animate = true,
  light = true,
  showTagline = true,
}: BrandLockupProps) {
  const size = iconSize ?? (width ? Math.round(width * 0.29) : 44);
  const wordW = Math.round(size * 2.55);
  const wordH = Math.round(wordW * WORD_ASPECT);
  const visibleH = showTagline ? wordH : Math.round(wordH * 0.62);
  const travel = Math.round(wordW * 0.92);

  const iconX = useRef(new Animated.Value(travel)).current;
  const textX = useRef(new Animated.Value(-wordW)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!animate) {
      iconX.setValue(0);
      textX.setValue(0);
      return;
    }

    const ease = Easing.bezier(0.45, 0.05, 0.25, 1);
    const moveMs = 1600;
    const holdMs = 3800;

    iconX.setValue(travel);
    textX.setValue(-wordW);

    const loop = Animated.loop(
      Animated.sequence([
        // Y → A + text reveal (left → right under mask)
        Animated.parallel([
          Animated.timing(iconX, {
            toValue: 0,
            duration: moveMs,
            easing: ease,
            useNativeDriver: true,
          }),
          Animated.timing(textX, {
            toValue: 0,
            duration: moveMs,
            easing: ease,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(holdMs),
        // A → Y reverse (smooth, no fade blink)
        Animated.parallel([
          Animated.timing(iconX, {
            toValue: travel,
            duration: moveMs,
            easing: ease,
            useNativeDriver: true,
          }),
          Animated.timing(textX, {
            toValue: -wordW,
            duration: moveMs,
            easing: ease,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(200),
      ]),
    );

    loopRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, [animate, iconX, textX, wordW, travel]);

  return (
    <View style={styles.lockup} accessibilityLabel="AsanPay — Payment Made Easy">
      <Animated.View
        style={[
          styles.iconWrap,
          {
            transform: [{ translateX: iconX }],
          },
        ]}
      >
        <BrandMark size={size} variant="mark" light={light} />
      </Animated.View>

      {/* Fixed mask width — text slides inside (no width anim = no Android blink) */}
      <View style={[styles.mask, { width: wordW, height: visibleH }]}>
        <Animated.View style={{ transform: [{ translateX: textX }] }}>
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
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
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
    zIndex: 3,
  },
  mask: {
    marginLeft: 6,
    zIndex: 1,
    overflow: "hidden",
  },
});
