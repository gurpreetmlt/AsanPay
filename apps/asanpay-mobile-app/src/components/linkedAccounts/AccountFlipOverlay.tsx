import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, StyleSheet, Text, View } from "react-native";
import type { UserRole } from "@asanpay/shared-types";
import { colors } from "../../theme/colors";
import { AccountAvatar, RoleChip } from "./parts";

export type FlipFace = { name: string; role: UserRole; roleLabel: string; uid: string; mobileMasked?: string };

/** Same timing as web: 700 ms flip, 150 ms fade when reduce-motion is on, short hold after. */
const FLIP_MS = 700;
const REDUCED_MS = 150;
const HOLD_MS = 250;

function Face({ face, style }: { face: FlipFace; style: object }) {
  return (
    <Animated.View style={[styles.face, style]}>
      <AccountAvatar name={face.name} role={face.role} size={56} />
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

export function AccountFlipOverlay({ from, to, onDone }: { from: FlipFace; to: FlipFace; onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  const [reduced, setReduced] = React.useState(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((isReduced) => {
      if (done) return;
      setReduced(isReduced);
      const ms = isReduced ? REDUCED_MS : FLIP_MS;
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: REDUCED_MS, useNativeDriver: true }),
        ...(isReduced
          ? []
          : [
              Animated.timing(progress, {
                toValue: 1,
                duration: FLIP_MS,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
      ]).start();
      timer = setTimeout(() => onDoneRef.current(), ms + HOLD_MS);
    });
    return () => {
      done = true;
      if (timer) clearTimeout(timer);
    };
  }, [fade, progress]);

  const frontRotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backRotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fade }]}>
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
        <Text style={styles.caption}>Switching to your {to.roleLabel} account…</Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,42,154,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 24,
  },
  scene: { width: "100%", maxWidth: 360, height: 104 },
  face: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: "#fff",
    backfaceVisibility: "hidden",
    elevation: 12,
    shadowColor: colors.blue,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  name: { fontSize: 16, fontWeight: "800", color: colors.blue },
  mobile: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  caption: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
