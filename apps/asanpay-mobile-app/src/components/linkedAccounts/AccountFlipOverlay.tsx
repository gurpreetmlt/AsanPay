import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Modal, StyleSheet, Text, View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import type { UserRole } from "@asanpay/shared-types";
import { colors } from "../../theme/colors";
import { AccountAvatar, RoleChip } from "./parts";

export type FlipFace = { name: string; role: UserRole; roleLabel: string; uid: string; mobileMasked?: string };

/** Same timing as web: card pops in, flips after 150 ms for 700 ms, "Switched" holds 350 ms. */
const FLIP_DELAY_MS = 150;
const FLIP_MS = 700;
const REDUCED_MS = 150;
const HOLD_MS = 350;
const REDUCED_HOLD_MS = 250;

function Face({ face, style }: { face: FlipFace; style: object }) {
  return (
    <Animated.View style={[styles.face, style]}>
      <AccountAvatar name={face.name} role={face.role} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {face.name}
        </Text>
        <RoleChip role={face.role} roleLabel={face.roleLabel} uid={face.uid} />
        {face.mobileMasked ? <Text style={styles.mobile}>{face.mobileMasked}</Text> : null}
      </View>
    </Animated.View>
  );
}

/**
 * Brand-blue cover (hides the previous account's numbers) + compact card that flips from the
 * current to the target account, then `onDone`. Reduce-motion → no flip, short fade.
 */
export function AccountFlipOverlay({ from, to, onDone }: { from: FlipFace; to: FlipFace; onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.9)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  const [reduced, setReduced] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void AccessibilityInfo.isReduceMotionEnabled().then((isReduced) => {
      if (cancelled) return;
      setReduced(isReduced);
      const flipEnd = isReduced ? REDUCED_MS : FLIP_DELAY_MS + FLIP_MS;
      const total = flipEnd + (isReduced ? REDUCED_HOLD_MS : HOLD_MS);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: REDUCED_MS, useNativeDriver: true }),
        Animated.timing(bar, { toValue: 1, duration: total, easing: Easing.linear, useNativeDriver: true }),
        ...(isReduced
          ? []
          : [
              Animated.spring(pop, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
              Animated.timing(progress, {
                toValue: 1,
                delay: FLIP_DELAY_MS,
                duration: FLIP_MS,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
      ]).start();
      timers.push(setTimeout(() => setDone(true), flipEnd));
      timers.push(setTimeout(() => onDoneRef.current(), total));
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [fade, progress, pop, bar]);

  const frontRotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backRotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  const accent = to.role === "retailer" ? colors.green : colors.blueLight;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fade }]} accessibilityLiveRegion="polite">
        <Animated.View style={[styles.panel, { transform: [{ scale: reduced ? 1 : pop }] }]}>
          <View style={styles.body}>
            <View style={styles.scene}>
              {reduced ? (
                <Face face={to} style={{}} />
              ) : (
                <>
                  <Face face={from} style={{ transform: [{ perspective: 1000 }, { rotateY: frontRotate }] }} />
                  <Face face={to} style={{ transform: [{ perspective: 1000 }, { rotateY: backRotate }] }} />
                </>
              )}
            </View>
            {done ? (
              <View style={styles.captionRow}>
                <CheckCircle2 size={15} color={colors.green} />
                <Text style={[styles.caption, { color: colors.green, fontWeight: "800" }]}>
                  Switched to your {to.roleLabel} account
                </Text>
              </View>
            ) : (
              <View style={styles.captionRow}>
                <ActivityIndicator size="small" color={colors.blue} />
                <Text style={styles.caption}>Switching to your {to.roleLabel} account…</Text>
              </View>
            )}
          </View>
          <View style={styles.track}>
            <Animated.View style={[styles.bar, { backgroundColor: accent, transform: [{ scaleX: bar }] }]} />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,42,154,0.62)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  panel: {
    width: "100%",
    maxWidth: 320,
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#fff",
    elevation: 14,
    shadowColor: "#041040",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  body: { padding: 16 },
  scene: { width: "100%", height: 84 },
  face: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(42,92,221,0.18)",
    backgroundColor: "#F7F9FF",
    backfaceVisibility: "hidden",
  },
  name: { fontSize: 14, fontWeight: "800", color: colors.blue },
  mobile: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  captionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  caption: { color: colors.blue, fontSize: 12, fontWeight: "700" },
  track: { height: 4, width: "100%", backgroundColor: "rgba(42,92,221,0.1)" },
  bar: { height: 4, width: "100%", transformOrigin: "left" },
});
