import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, ChevronDown, CreditCard, Crop, Image as ImageIcon } from "lucide-react-native";
import type { KycDocCheckUi } from "@asanpay/shared-types";
import { colors } from "../theme/colors";

/** ID-1 card (PAN / Aadhaar PVC): 85.6 × 54 mm. */
const CARD_ASPECT = 85.6 / 54;

export type KycCardStage = "cropping" | "checking" | null;

type Tokens = { mute: string; card: string; cardBorder: string; txt2: string };

/**
 * One big card-shaped box per KYC photo (PAN / Aadhaar front / back): empty → loading (scan line in
 * the box) → done (photo + crop icon + status badge) → failed (red, retake). Same states as web
 * `KycCardUpload`; mobile offers Camera + Gallery instead of a file chooser.
 */
export function KycCardUpload({
  label,
  title,
  hint,
  previewUri,
  stage,
  check,
  missing,
  tokens,
  onCamera,
  onGallery,
  onAdjust,
  onRemove,
}: {
  label: string;
  title: string;
  hint: string;
  previewUri?: string | null;
  stage: KycCardStage;
  check?: KycDocCheckUi;
  missing?: boolean;
  tokens: Tokens;
  onCamera: () => void;
  onGallery: () => void;
  onAdjust: () => void;
  onRemove: () => void;
}) {
  const busy = stage !== null;
  const failed = check?.state === "fail";
  const hasPhoto = Boolean(previewUri) && !failed;
  const [slowCheck, setSlowCheck] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [boxHeight, setBoxHeight] = useState(0);
  const reduceMotion = useRef(false);
  const scan = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotion.current = v;
    });
  }, []);

  useEffect(() => {
    setSlowCheck(false);
    if (stage !== "checking") return;
    const t = setTimeout(() => setSlowCheck(true), 2500);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (!busy || reduceMotion.current) return;
    scan.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, scan]);

  useEffect(() => {
    setShowDetails(false);
    if (!previewUri || reduceMotion.current) return;
    pop.setValue(0.94);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [previewUri, pop]);

  const busyText = stage === "cropping" ? "Cropping card…" : slowCheck ? "Checking details…" : "Reading card…";
  const borderColor =
    failed || missing ? colors.danger : hasPhoto ? (check?.state === "flag" ? "#F59E0B" : colors.green) : tokens.cardBorder;
  const scanY = scan.interpolate({ inputRange: [0, 1], outputRange: [boxHeight * 0.08, boxHeight * 0.9] });

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[st.label, { color: tokens.mute }]}>{label}</Text>
      <View
        onLayout={(e) => setBoxHeight(e.nativeEvent.layout.height)}
        style={[
          st.box,
          {
            borderColor,
            borderStyle: hasPhoto ? "solid" : "dashed",
            backgroundColor: failed || missing ? colors.dangerBg : hasPhoto ? "#FFFFFF" : "#F7F9FF",
          },
        ]}
      >
        {previewUri && !failed ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: busy ? 0.4 : 1, transform: [{ scale: pop }] }]}>
            <Image source={{ uri: previewUri }} resizeMode="contain" style={StyleSheet.absoluteFill} accessibilityLabel={title} />
          </Animated.View>
        ) : null}

        {busy ? (
          <View style={st.center} accessibilityLiveRegion="polite">
            {!reduceMotion.current ? (
              <Animated.View style={[st.scanLine, { transform: [{ translateY: scanY }] }]} pointerEvents="none" />
            ) : null}
            <ActivityIndicator size="large" color={colors.blue} />
            <Text style={st.busyPill}>{busyText}</Text>
          </View>
        ) : hasPhoto ? (
          <>
            <Pressable
              onPress={onAdjust}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Adjust crop of ${title}`}
              style={({ pressed }) => [st.roundBtn, { left: 10, backgroundColor: pressed ? "#F7F9FF" : "#FFFFFF" }]}
            >
              <Crop size={17} color={colors.blue} />
            </Pressable>
            {check && check.state !== "checking" ? (
              <View style={[st.roundBtn, { right: 10, backgroundColor: check.state === "pass" ? colors.green : "#F59E0B" }]}>
                <Text style={st.badgeText}>{check.state === "pass" ? "✓" : "!"}</Text>
              </View>
            ) : null}
            <View style={st.bottomBar}>
              <Pressable onPress={onCamera} hitSlop={6} accessibilityRole="button">
                <Text style={[st.barLink, { color: colors.blue }]}>Camera</Text>
              </Pressable>
              <Text style={{ color: tokens.cardBorder }}>·</Text>
              <Pressable onPress={onGallery} hitSlop={6} accessibilityRole="button">
                <Text style={[st.barLink, { color: colors.blue }]}>Gallery</Text>
              </Pressable>
              <Text style={{ color: tokens.cardBorder }}>·</Text>
              <Pressable onPress={onRemove} hitSlop={6} accessibilityRole="button">
                <Text style={[st.barLink, { color: colors.danger }]}>Remove</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={[st.center, { paddingHorizontal: 14 }]}>
            <View style={[st.iconTile, { backgroundColor: failed ? "#FEE2E2" : "#E8EEFF" }]}>
              <CreditCard size={24} color={failed ? colors.danger : colors.blueLight} />
            </View>
            {failed && check?.state === "fail" ? (
              <Text style={st.failText} numberOfLines={4}>
                {check.message}
              </Text>
            ) : (
              <>
                <Text style={[st.emptyTitle, { color: colors.blue }]}>Upload {title}</Text>
                <Text style={[st.emptyHint, { color: tokens.mute }]}>{hint}</Text>
              </>
            )}
            <View style={st.btnRow}>
              <Pressable onPress={onCamera} accessibilityRole="button" style={({ pressed }) => [st.pill, st.pillBlue, pressed && { opacity: 0.85 }]}>
                <Camera size={15} color="#FFFFFF" />
                <Text style={st.pillBlueText}>{failed ? "Retake" : "Camera"}</Text>
              </Pressable>
              <Pressable
                onPress={onGallery}
                accessibilityRole="button"
                style={({ pressed }) => [st.pill, { backgroundColor: pressed ? "#F7F9FF" : "#FFFFFF", borderColor: tokens.cardBorder, borderWidth: 1.5 }]}
              >
                <ImageIcon size={15} color={colors.blue} />
                <Text style={[st.pillText, { color: colors.blue }]}>Gallery</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {missing && !hasPhoto && !failed ? <Text style={st.missing}>{title} photo is required</Text> : null}

      {hasPhoto && check && check.state !== "checking" ? (
        <CheckSummary check={check} open={showDetails} onToggle={() => setShowDetails((v) => !v)} mute={tokens.mute} />
      ) : null}
    </View>
  );
}

function CheckSummary({
  check,
  open,
  onToggle,
  mute,
}: {
  check: Exclude<KycDocCheckUi, { state: "checking" }>;
  open: boolean;
  onToggle: () => void;
  mute: string;
}) {
  const passed = check.items.filter((i) => i.tone === "pass");
  const problems = check.items.filter((i) => i.tone !== "pass");
  const amber = check.state === "flag";
  const summary = amber ? check.message : passed.length ? `✓ All ${passed.length} checks passed` : check.message;
  return (
    <View style={{ marginTop: 6, gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Text style={[st.summary, { color: amber ? "#B45309" : colors.greenDark }]} accessibilityLiveRegion="polite">
          {summary}
        </Text>
        {passed.length ? (
          <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Text style={{ color: mute, fontSize: 12, fontWeight: "700" }}>Details</Text>
            <ChevronDown size={14} color={mute} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
          </Pressable>
        ) : null}
      </View>
      {problems.map((item) => (
        <Text key={item.text} style={[st.item, { color: item.tone === "flag" ? "#B45309" : colors.danger }]}>
          {item.text}
        </Text>
      ))}
      {open
        ? passed.map((item) => (
            <Text key={item.text} style={[st.item, { color: colors.greenDark }]}>
              {item.text}
            </Text>
          ))
        : null}
    </View>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 },
  box: { width: "100%", aspectRatio: CARD_ASPECT, borderRadius: 18, borderWidth: 2, overflow: "hidden" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8 },
  scanLine: {
    position: "absolute",
    top: 0,
    left: "6%",
    right: "6%",
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.blueLight,
    shadowColor: colors.blueLight,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  busyPill: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
  },
  roundBtn: {
    position: "absolute",
    top: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  badgeText: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  barLink: { fontSize: 12.5, fontWeight: "700", textDecorationLine: "underline" },
  iconTile: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptyHint: { fontSize: 12, textAlign: "center" },
  failText: { color: colors.danger, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 18 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  pillBlue: { backgroundColor: colors.blue },
  pillBlueText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "800" },
  pillText: { fontSize: 13.5, fontWeight: "800" },
  missing: { marginTop: 4, color: colors.danger, fontSize: 12, fontWeight: "700" },
  summary: { flex: 1, fontSize: 12.5, fontWeight: "700" },
  item: { fontSize: 11.5, fontWeight: "600" },
});
