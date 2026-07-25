import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react-native";
import { colors } from "../theme/colors";

export type AppAlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive" | "primary";
  onPress?: () => void;
};

export type AppAlertTone = "info" | "error" | "success";

type AlertState = {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  tone: AppAlertTone;
} | null;

type Listener = (state: AlertState) => void;

const listeners = new Set<Listener>();
let current: AlertState = null;

const SCREEN_H = Dimensions.get("window").height;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.85;

function emit(state: AlertState) {
  current = state;
  listeners.forEach((l) => l(state));
}

function inferTone(title: string, message?: string): AppAlertTone {
  const t = `${title} ${message ?? ""}`.toLowerCase();
  if (
    t.includes("fail") ||
    t.includes("error") ||
    t.includes("invalid") ||
    t.includes("incomplete") ||
    t.includes("could not") ||
    t.includes("wrong role")
  ) {
    return "error";
  }
  if (t.includes("success") || t.includes("onboarded") || t.includes("sent to")) {
    return "success";
  }
  return "info";
}

function polishCopy(title: string, message?: string): { title: string; message?: string } {
  const msg = message ?? "";
  if (/registered as/i.test(msg) && /continue as/i.test(msg)) {
    return {
      title: "Wrong role selected",
      message: msg.replace(/^This number is registered as/, "This mobile is registered as"),
    };
  }
  if (/^otp failed$/i.test(title) && msg) {
    return { title: "Couldn't continue", message: msg };
  }
  return { title, message };
}

/** Drop-in replacement for React Native `Alert.alert` — themed dialog. */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
) {
  const polished = polishCopy(title, message);
  const resolved =
    buttons && buttons.length > 0
      ? buttons
      : [{ text: "Got it", style: "primary" as const }];
  emit({
    title: polished.title,
    message: polished.message,
    buttons: resolved,
    tone: inferTone(polished.title, polished.message),
  });
}

export function hideAlert() {
  emit(null);
}

const TONE: Record<
  AppAlertTone,
  {
    Icon: typeof Info;
    iconColor: string;
    iconBg: string;
    iconBorder: string;
    rail: string;
    badge: string;
    badgeText: string;
    useGreenCta: boolean;
  }
> = {
  info: {
    Icon: Info,
    iconColor: "#2A5CDD",
    iconBg: "#EEF3FF",
    iconBorder: "#D6DEF5",
    rail: "#2A5CDD",
    badge: "Info",
    badgeText: "#2A5CDD",
    useGreenCta: false,
  },
  error: {
    Icon: AlertTriangle,
    iconColor: "#C47A1A",
    iconBg: "#FFF6E8",
    iconBorder: "#F0D4A8",
    rail: "#E8A23A",
    badge: "Action needed",
    badgeText: "#A86410",
    useGreenCta: false,
  },
  success: {
    Icon: CheckCircle2,
    iconColor: "#11A362",
    iconBg: "#E7FBF1",
    iconBorder: "#B7EBD0",
    rail: "#24CC82",
    badge: "Success",
    badgeText: "#0E8A52",
    useGreenCta: true,
  },
};

export function AppAlertHost() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<AlertState>(current);
  const [visible, setVisible] = useState(!!current);
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;
  const dragY = useRef(0);
  const closing = useRef(false);

  function animateOpen() {
    closing.current = false;
    backdrop.setValue(0);
    sheetY.setValue(Math.min(SCREEN_H * 0.45, 320));
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        friction: 8,
        tension: 64,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function animateClose(onDone?: () => void) {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetY, {
        toValue: SCREEN_H * 0.55,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        setState(null);
        closing.current = false;
        onDone?.();
      }
    });
  }

  useEffect(() => {
    const listener: Listener = (next) => {
      if (next) {
        setState(next);
        setVisible(true);
        if (next.tone === "error") Vibration.vibrate(18);
        requestAnimationFrame(() => animateOpen());
      } else {
        animateClose();
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          sheetY.stopAnimation((value) => {
            dragY.current = value;
          });
        },
        onPanResponderMove: (_e, g) => {
          const next = Math.max(0, dragY.current + g.dy);
          sheetY.setValue(next);
          const progress = Math.min(1, next / 220);
          backdrop.setValue(1 - progress * 0.75);
        },
        onPanResponderRelease: (_e, g) => {
          const offset = dragY.current + Math.max(0, g.dy);
          const shouldDismiss =
            g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY || offset > DISMISS_DISTANCE;
          if (shouldDismiss) {
            hideAlert();
            return;
          }
          Animated.parallel([
            Animated.spring(sheetY, {
              toValue: 0,
              friction: 8,
              tension: 70,
              useNativeDriver: true,
            }),
            Animated.timing(backdrop, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [backdrop, sheetY],
  );

  if (!visible || !state) return null;

  const tone = TONE[state.tone];
  const Icon = tone.Icon;
  const buttons = state.buttons;
  const stacked = buttons.length > 1;

  function closeThen(btn?: AppAlertButton) {
    hideAlert();
    requestAnimationFrame(() => btn?.onPress?.());
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => hideAlert()}
      statusBarTranslucent
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => hideAlert()} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16) + 12,
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <View style={[styles.rail, { backgroundColor: tone.rail }]} />
          <View style={styles.handleHit} {...panResponder.panHandlers}>
            <View style={styles.handle} />
            <Text style={styles.swipeHint}>Swipe down to close</Text>
          </View>

          <View style={styles.headerRow}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: tone.iconBg, borderColor: tone.iconBorder },
              ]}
            >
              <Icon size={22} color={tone.iconColor} strokeWidth={2.3} />
            </View>
            <View style={styles.headerText}>
              <View style={[styles.badgePill, { backgroundColor: tone.iconBg }]}>
                <Text style={[styles.badge, { color: tone.badgeText }]}>{tone.badge}</Text>
              </View>
              <Text style={styles.title}>{state.title}</Text>
            </View>
          </View>

          {state.message ? (
            <View style={styles.messageCard}>
              <Text style={styles.message}>{state.message}</Text>
            </View>
          ) : null}

          <View style={[styles.actions, stacked && styles.actionsStack]}>
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              const isPrimary =
                btn.style === "primary" ||
                (!isCancel && !isDestructive && i === buttons.length - 1);

              if (isPrimary && !isDestructive) {
                if (tone.useGreenCta) {
                  return (
                    <Pressable
                      key={`${btn.text}-${i}`}
                      onPress={() => closeThen(btn)}
                      style={({ pressed }) => [styles.btnPress, pressed && styles.pressed]}
                    >
                      <LinearGradient colors={[...colors.gradientButton]} style={styles.btnFill}>
                        <Text style={styles.btnFillText}>{btn.text}</Text>
                      </LinearGradient>
                    </Pressable>
                  );
                }
                return (
                  <Pressable
                    key={`${btn.text}-${i}`}
                    onPress={() => closeThen(btn)}
                    style={({ pressed }) => [styles.btnNavy, pressed && styles.pressed]}
                  >
                    <Text style={styles.btnFillText}>{btn.text}</Text>
                  </Pressable>
                );
              }

              return (
                <Pressable
                  key={`${btn.text}-${i}`}
                  onPress={() => closeThen(btn)}
                  style={({ pressed }) => [
                    styles.btnGhost,
                    isDestructive && styles.btnDestructive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.btnGhostText, isDestructive && styles.btnDestructiveText]}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6, 23, 90, 0.52)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: "rgba(11,42,154,.06)",
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
  },
  rail: {
    position: "absolute",
    top: 0,
    left: 28,
    right: 28,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  handleHit: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 14,
    marginHorizontal: -8,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C9D2EA",
  },
  swipeHint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "600",
    color: "#A0ADD0",
    letterSpacing: 0.2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, paddingTop: 1 },
  badgePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 6,
  },
  badge: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 21,
    color: "#0E1836",
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  messageCard: {
    marginTop: 14,
    backgroundColor: "#F5F7FD",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF8",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  message: {
    fontSize: 14.5,
    lineHeight: 22,
    color: "#4A5C8A",
    fontWeight: "500",
  },
  actions: { marginTop: 20, gap: 10 },
  actionsStack: { flexDirection: "column" },
  btnPress: { borderRadius: 15, overflow: "hidden" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  btnFill: {
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnNavy: {
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: "#0B2A9A",
  },
  btnFillText: { color: "#fff", fontSize: 15.5, fontWeight: "800", letterSpacing: 0.2 },
  btnGhost: {
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: "#F1F4FC",
    borderWidth: 1,
    borderColor: "#E2E7F4",
  },
  btnGhostText: { color: "#0B2A9A", fontSize: 15.5, fontWeight: "700" },
  btnDestructive: {
    backgroundColor: "#FFF0F2",
    borderColor: "#F5C2C8",
  },
  btnDestructiveText: { color: "#C63B4A" },
});
