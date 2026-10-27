import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  CreditCard,
  Crop,
  Image as ImageIcon,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react-native";
import type { KycDocCheckUi } from "@asanpay/shared-types";
import { colors } from "../theme/colors";

/** ID-1 card (PAN / Aadhaar PVC): 85.6 × 54 mm. */
const CARD_ASPECT = 85.6 / 54;

export type KycCardStage = "cropping" | "checking" | null;

type Tokens = { mute: string; card: string; cardBorder: string; txt2: string };

/**
 * One big card-shaped box per KYC photo (PAN / Aadhaar front / back): empty → loading (scan line in
 * the box) → done (photo + status badge + icon action bar) → failed (rejected photo faded behind a
 * "Photo not accepted" panel). Same states as web `KycCardUpload`; mobile offers Camera + Gallery.
 */
export function KycCardUpload({
  label,
  title,
  hint,
  previewUri,
  rejectedUri,
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
  /** Photo the check refused, shown faded behind the failure message */
  rejectedUri?: string | null;
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
          hasPhoto || failed ? st.boxRaised : null,
          {
            borderColor,
            borderStyle: hasPhoto || failed ? "solid" : "dashed",
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
            {check && check.state !== "checking" ? (
              <View style={[st.badge, { backgroundColor: check.state === "pass" ? colors.green : "#F59E0B" }]}>
                <Text style={st.badgeText}>{check.state === "pass" ? "✓" : "!"}</Text>
              </View>
            ) : null}
            <View style={st.actionBar}>
              <IconAction label={`Adjust crop of ${title}`} onPress={onAdjust}>
                <Crop size={16} color={colors.blue} />
              </IconAction>
              <IconAction label="Retake with camera" onPress={onCamera}>
                <Camera size={16} color={colors.blue} />
              </IconAction>
              <IconAction label="Choose from gallery" onPress={onGallery}>
                <ImageIcon size={16} color={colors.blue} />
              </IconAction>
              <View style={st.actionDivider} />
              <IconAction label={`Remove ${title} photo`} onPress={onRemove} danger>
                <Trash2 size={16} color={colors.danger} />
              </IconAction>
            </View>
          </>
        ) : failed && check?.state === "fail" ? (
          <>
            {rejectedUri ? (
              <Image source={{ uri: rejectedUri }} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: 0.16 }]} />
            ) : null}
            <View style={st.failPanel} accessibilityLiveRegion="polite">
              <View style={st.failHead}>
                <XCircle size={18} color={colors.danger} />
                <Text style={st.failTitle}>Photo not accepted</Text>
              </View>
              <Text style={st.failText} numberOfLines={4}>
                {check.message}
              </Text>
              <View style={st.btnRow}>
                <PillButton primary label="Retake" onPress={onCamera}>
                  <Camera size={15} color="#FFFFFF" />
                </PillButton>
                <PillButton label="Gallery" onPress={onGallery} border={tokens.cardBorder}>
                  <ImageIcon size={15} color={colors.blue} />
                </PillButton>
              </View>
            </View>
          </>
        ) : (
          <View style={[st.center, { paddingHorizontal: 14 }]}>
            <View style={[st.iconTile, { backgroundColor: "#E8EEFF" }]}>
              <CreditCard size={24} color={colors.blueLight} />
            </View>
            <Text style={[st.emptyTitle, { color: colors.blue }]}>Upload {title}</Text>
            <Text style={[st.emptyHint, { color: tokens.mute }]}>{hint}</Text>
            <View style={st.btnRow}>
              <PillButton primary label="Camera" onPress={onCamera}>
                <Camera size={15} color="#FFFFFF" />
              </PillButton>
              <PillButton label="Gallery" onPress={onGallery} border={tokens.cardBorder}>
                <ImageIcon size={15} color={colors.blue} />
              </PillButton>
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

function IconAction({
  label,
  onPress,
  danger,
  children,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [st.iconAction, pressed && { backgroundColor: danger ? "#FEF2F2" : "#EEF2FF" }]}
    >
      {children}
    </Pressable>
  );
}

function PillButton({
  label,
  onPress,
  primary,
  border,
  children,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  border?: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        st.pill,
        primary
          ? { backgroundColor: colors.blue, opacity: pressed ? 0.85 : 1 }
          : { backgroundColor: pressed ? "#F7F9FF" : "#FFFFFF", borderColor: border, borderWidth: 1.5 },
      ]}
    >
      {children}
      <Text style={[st.pillText, { color: primary ? "#FFFFFF" : colors.blue }]}>{label}</Text>
    </Pressable>
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
  const summary = amber ? "Needs review" : passed.length ? `All ${passed.length} checks passed` : check.message;
  return (
    <View style={[st.strip, amber ? st.stripAmber : st.stripGreen]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {amber ? <AlertTriangle size={17} color="#B45309" /> : <ShieldCheck size={17} color={colors.greenDark} />}
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
      {amber ? (
        <Text style={[st.item, { color: "#9A3412" }]}>
          {problems.length
            ? "Our team will check the points below. You can continue."
            : "We couldn't read every detail on this photo. You can continue, or retake it in good light for faster approval."}
        </Text>
      ) : null}
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
  boxRaised: {
    elevation: 3,
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
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
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  badgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", lineHeight: 14 },
  actionBar: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  iconAction: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  actionDivider: { width: 1, height: 16, backgroundColor: "rgba(15,23,42,0.15)", marginHorizontal: 2 },
  failPanel: {
    ...StyleSheet.absoluteFillObject,
    margin: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  failHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  failTitle: { color: colors.danger, fontSize: 15, fontWeight: "800" },
  failText: { color: "#991B1B", fontSize: 12.5, fontWeight: "600", textAlign: "center", lineHeight: 17 },
  iconTile: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptyHint: { fontSize: 12, textAlign: "center" },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  pillText: { fontSize: 13.5, fontWeight: "800" },
  missing: { marginTop: 4, color: colors.danger, fontSize: 12, fontWeight: "700" },
  strip: { marginTop: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, gap: 3 },
  stripGreen: { backgroundColor: "#ECFDF3", borderColor: "#BBF7D0" },
  stripAmber: { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" },
  summary: { flex: 1, fontSize: 13, fontWeight: "800" },
  item: { fontSize: 11.5, fontWeight: "600", marginLeft: 25 },
});
