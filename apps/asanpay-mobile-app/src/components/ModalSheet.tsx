import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../theme/colors";
import { PopupCloseButton } from "./PopupCloseButton";
import { POPUP_TONE, PulseIcon, type PopupTone } from "./PulseIcon";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Pulsing icon tile left of the title (see popup-design rule). Pass a lucide icon element. */
  icon?: React.ReactElement<{ size?: number; color?: string }>;
  iconTone?: PopupTone;
  /** Small uppercase line above the title, e.g. "Step 2 of 2". */
  eyebrow?: string;
  subtitle?: string;
  /** false when the body has its own FlatList (avoids nested virtualized lists). */
  scroll?: boolean;
}

/** Standard centered popup (same anatomy as web Modal). Body scrolls so footer buttons stay reachable. */
export function ModalSheet({
  visible,
  title,
  onClose,
  children,
  icon,
  iconTone = "blue",
  eyebrow,
  subtitle,
  scroll = true,
}: Props) {
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      return;
    }
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        pop.setValue(1);
        return;
      }
      Animated.timing(pop, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [visible, pop]);

  const tone = POPUP_TONE[iconTone];
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View style={[styles.card, { opacity: pop, transform: [{ scale }] }]}>
          <View style={styles.header}>
            {icon ? (
              <PulseIcon bg={tone.bg} accent={tone.fg}>
                {React.cloneElement(icon, { size: icon.props.size ?? 22, color: icon.props.color ?? tone.fg })}
              </PulseIcon>
            ) : null}
            <View style={styles.headText}>
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <PopupCloseButton onPress={onClose} />
          </View>
          {scroll ? (
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.body, styles.bodyScroll]}>{children}</View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(15,23,42,0.55)" },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    backgroundColor: colors.card,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 16,
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingTop: 20 },
  headText: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", color: colors.blueLight },
  title: { fontSize: 18, fontWeight: "800", color: colors.blue },
  subtitle: { marginTop: 3, fontSize: 12.5, color: colors.textMuted },
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  body: { padding: 20, paddingTop: 16 },
});
