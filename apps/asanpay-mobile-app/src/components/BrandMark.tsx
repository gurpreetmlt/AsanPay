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
  /** Splash: play Y→A once and hold (no reverse loop). */
  playOnce?: boolean;
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
  playOnce = false,
}: BrandLockupProps) {
  const size = iconSize ?? (width ? Math.round(width * 0.29) : 44);
  const wordW = Math.round(size * 2.55);
  const wordH = Math.round(wordW * WORD_ASPECT);
  const visibleH = showTagline ? wordH : Math.round(wordH * 0.62);
  const travel = Math.round(wordW * 0.92);

  const iconX = useRef(new Animated.Value(travel)).current;
  const textX = useRef(new Animated.Value(-wordW)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!animate) {
      iconX.setValue(0);
      textX.setValue(0);
      fadeIn.setValue(1);
      return;
    }

    const ease = Easing.bezier(0.45, 0.05, 0.25, 1);
    const moveMs = 1600;
    const holdMs = 3800;
    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;

    // Defer first paint so cold start doesn't flash wallet at Y
    fadeIn.setValue(0);
    iconX.setValue(travel);
    textX.setValue(-wordW);

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;

        const forward = Animated.parallel([
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
        ]);

        const show = Animated.timing(fadeIn, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        });

        if (playOnce) {
          const once = Animated.parallel([show, forward]);
          loopRef.current = once;
          once.start();
          return;
        }

        const loop = Animated.loop(
          Animated.sequence([
            forward,
            Animated.delay(holdMs),
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

        // Fade in while first Y→A starts (avoids cold-start Y flash)
        show.start();
        loopRef.current = loop;
        loop.start();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      loopRef.current?.stop();
      loopRef.current = null;
    };
  }, [animate, playOnce, iconX, textX, fadeIn, wordW, travel]);

  return (
    <Animated.View
      style={[styles.lockup, { opacity: fadeIn }]}
      accessibilityLabel="AsanPay — Payment Made Easy"
    >
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

      <View style={[styles.mask, { width: wordW, height: visibleH }]}>
        <Animated.View style={{ transform: [{ translateX: textX }] }}>
          <Image
            source={light ? wordmarkLight : wordmarkDark}
            style={{ width: wordW, height: wordH }}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Animated.View>
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
