import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";
import { ArrowLeft, Check, Copy, Info, QrCode, X } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MIN_AMOUNT = 200;
const MAX_AMOUNT = 5000;
const QUICK_AMOUNTS = [
  { amount: 200, hint: "min. limit" },
  { amount: 500, hint: null },
  { amount: 1000, hint: null },
  { amount: 1500, hint: null },
  { amount: 2000, hint: null },
  { amount: 3000, hint: null },
  { amount: 4000, hint: null },
  { amount: 5000, hint: "max limit" },
] as const;
const QR_EXPIRY_SECONDS = 120;

const UPI_APPS = [
  { name: "Google Pay", short: "GPay", color: "#4285F4" },
  { name: "PhonePe", short: "PhonePe", color: "#5F259F" },
  { name: "Paytm", short: "Paytm", color: "#00BAF2" },
  { name: "BHIM", short: "BHIM", color: "#00897B" },
  { name: "CRED", short: "CRED", color: "#1A1A2E" },
  { name: "Amazon Pay", short: "Amazon", color: "#FF9900" },
];

const NOTES = [
  "Daily withdrawal limit per customer is ₹10,000",
  "Minimum gap between 2 transactions of same customer should be 30 minutes",
  "No commission will be paid for transactions made using your own UPI ID",
];

type Stage = "input" | "qr";

function generateMockUpiId(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `asanpay.ucp${num}@yesbankltd`;
}

function amountInWords(n: number): string {
  if (!n || n < 1) return "";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function underThousand(x: number): string {
    if (x < 20) return ones[x]!;
    if (x < 100) return `${tens[Math.floor(x / 10)]} ${ones[x % 10]}`.trim();
    return `${ones[Math.floor(x / 100)]} Hundred ${underThousand(x % 100)}`.trim();
  }
  if (n >= 100000) {
    const lakh = Math.floor(n / 100000);
    const rest = n % 100000;
    return `${underThousand(lakh)} Lakh ${rest ? underThousand(rest) : ""}`.trim() + " only";
  }
  if (n >= 1000) {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    return `${underThousand(th)} Thousand ${rest ? underThousand(rest) : ""}`.trim() + " only";
  }
  return `${underThousand(n)} only`;
}

function amountErrorMessage(n: number): string | null {
  if (!n) return null;
  if (n < MIN_AMOUNT) return `Amount can't be less than ${MIN_AMOUNT}`;
  if (n > MAX_AMOUNT) return `Amount can't be more than ${MAX_AMOUNT}`;
  if (n % 100 !== 0) return "Enter amount in multiples of ₹100";
  return null;
}

function generateQrPattern(): boolean[][] {
  const cells = 21;
  const pattern: boolean[][] = [];
  for (let r = 0; r < cells; r++) {
    pattern[r] = [];
    for (let c = 0; c < cells; c++) {
      const inFinder =
        (r < 7 && c < 7) ||
        (r < 7 && c >= cells - 7) ||
        (r >= cells - 7 && c < 7);
      if (inFinder) {
        const isOuterBorder =
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= cells - 7 && (r === cells - 7 || r === cells - 1)) ||
          (c >= cells - 7 && (c === cells - 7 || c === cells - 1));
        const isInner =
          (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
          (r >= 2 && r <= 4 && c >= cells - 5 && c <= cells - 3) ||
          (r >= cells - 5 && r <= cells - 3 && c >= 2 && c <= 4);
        pattern[r]![c] = isOuterBorder || isInner;
      } else {
        pattern[r]![c] = Math.random() > 0.55;
      }
    }
  }
  return pattern;
}

function QrPlaceholder() {
  const patternRef = useRef<boolean[][]>(generateQrPattern());
  const cells = 21;
  const size = 180;
  const cellSize = size / cells;
  const pattern = patternRef.current;

  const rects: React.ReactNode[] = [];
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (pattern[r]?.[c]) {
        rects.push(
          <Rect
            key={`${r}-${c}`}
            x={c * cellSize}
            y={r * cellSize}
            width={cellSize}
            height={cellSize}
            fill={colors.blue}
          />,
        );
      }
    }
  }

  return (
    <View style={qr.wrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Rect width={size} height={size} fill="white" />
        {rects}
      </Svg>
      <View style={qr.center}>
        <Text style={qr.rupee}>₹</Text>
      </View>
    </View>
  );
}

const qr = StyleSheet.create({
  wrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  center: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  rupee: { fontSize: 18, fontWeight: "900", color: colors.blue },
});

interface Props {
  onBack: () => void;
}

export function UpiCashPointScreen({ onBack }: Props) {
  const { tokens } = useTheme();
  const [stage, setStage] = useState<Stage>("input");
  const [amount, setAmount] = useState("");
  const [earnDismissed, setEarnDismissed] = useState(false);
  const [timer, setTimer] = useState(QR_EXPIRY_SECONDS);
  const [upiId, setUpiId] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const earnAnim = useRef(new Animated.Value(0)).current;

  const startTimer = useCallback(() => {
    setTimer(QR_EXPIRY_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const amountNum = parseInt(amount, 10) || 0;
  const amountError = amountErrorMessage(amountNum);
  const amountValid = amountNum > 0 && !amountError;
  const showEarnStrip = amountValid && !earnDismissed;
  const isExpired = timer === 0;

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(earnAnim, {
      toValue: showEarnStrip ? 1 : 0,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [showEarnStrip, earnAnim]);

  function setAmountValue(v: string) {
    setAmount(v.replace(/\D/g, "").slice(0, 5));
    setEarnDismissed(false);
  }

  function handleGenerate() {
    if (!amountValid) return;
    setUpiId(generateMockUpiId());
    setStage("qr");
    startTimer();
  }

  function handleNewQr() {
    setStage("input");
    setAmount("");
    setEarnDismissed(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function handleCopyUpi() {
    showAlert("UPI ID Copied", upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const minutes = Math.floor(timer / 60);
  const seconds = timer % 60;
  const timerStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const earnMaxH = earnAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 56] });
  const earnOpacity = earnAnim;
  const earnMargin = earnAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
      <LinearGradient
        colors={[colors.blueLight, colors.blue]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={s.header}
      >
        <Pressable onPress={stage === "qr" ? handleNewQr : onBack} style={s.backBtn}>
          <ArrowLeft size={18} color="#fff" strokeWidth={2.4} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>UPI Cash Point</Text>
          <Text style={s.headerSub}>QR-based cash withdrawal via UPI</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {stage === "input" ? (
          <>
            {/* Main card — matches web layout */}
            <View style={[s.mainCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <View style={s.amberBanner}>
                <Info size={16} color="#D97706" style={{ marginTop: 2 }} />
                <Text style={s.amberText}>
                  QR expires in <Text style={s.amberBold}>30 seconds</Text>. Customer can make
                  payment within <Text style={s.amberBold}>2 minutes</Text>.
                </Text>
              </View>

              <View style={s.cardBody}>
                <Text style={s.amountTitle}>Amount to Withdraw</Text>

                <View style={s.amountBlock}>
                  <View style={[s.amountUnderline, amountError ? { borderBottomColor: "#F87171" } : null]}>
                    <Text style={s.rupeeBig}>₹</Text>
                    <TextInput
                      value={amount}
                      onChangeText={setAmountValue}
                      placeholder="0"
                      placeholderTextColor="#D1D5DB"
                      keyboardType="number-pad"
                      style={s.amountBigInput}
                    />
                  </View>
                  {amountError ? <Text style={s.errorText}>{amountError}</Text> : null}
                  <Text style={s.amountHint}>
                    {amountNum > 0 ? amountInWords(amountNum) : "Enter amount in multiples of ₹100"}
                  </Text>
                </View>

                <View style={s.quickWrap}>
                  {QUICK_AMOUNTS.map(({ amount: a, hint }) => {
                    const active = amount === String(a);
                    return (
                      <Pressable
                        key={a}
                        onPress={() => setAmountValue(String(a))}
                        style={[
                          s.quickChip,
                          active
                            ? { borderColor: colors.blueLight, backgroundColor: colors.bluePale }
                            : { borderColor: "#E5E7EB", backgroundColor: "#fff" },
                        ]}
                      >
                        <Text style={[s.quickChipAmt, { color: active ? colors.blue : "#1F2937" }]}>
                          ₹{a.toLocaleString("en-IN")}
                        </Text>
                        {hint ? <Text style={s.quickHint}>{hint}</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  onPress={handleGenerate}
                  disabled={!amountValid}
                  style={({ pressed }) => [
                    s.generateBtn,
                    !amountValid && s.generateBtnDisabled,
                    pressed && amountValid && { opacity: 0.9 },
                  ]}
                >
                  <LinearGradient
                    colors={amountValid ? [colors.blueLight, colors.blue] : ["#94a3b8", "#94a3b8"]}
                    start={gradientDirection.diagonal.start}
                    end={gradientDirection.diagonal.end}
                    style={s.generateGradient}
                  >
                    <Text style={s.generateText}>Generate QR</Text>
                    <QrCode size={18} color="#fff" strokeWidth={2.4} />
                  </LinearGradient>
                </Pressable>

                <View style={s.partnerRow}>
                  <Text style={s.partnerText}>AsanPay</Text>
                  <Text style={s.partnerDot}>·</Text>
                  <Text style={s.partnerText}>YES BANK</Text>
                  <Text style={s.partnerDot}>·</Text>
                  <Text style={s.partnerText}>UPI</Text>
                </View>

                <Animated.View
                  style={{
                    maxHeight: earnMaxH,
                    opacity: earnOpacity,
                    marginTop: earnMargin,
                    overflow: "hidden",
                  }}
                >
                  <View style={s.earnStrip}>
                    <View style={s.earnLeft}>
                      <View style={s.earnIcon}>
                        <Text style={s.earnIconText}>₹</Text>
                      </View>
                      <Text style={s.earnText}>You will earn ₹2 on this transaction</Text>
                    </View>
                    <Pressable onPress={() => setEarnDismissed(true)} hitSlop={10}>
                      <X size={16} color="rgba(255,255,255,0.7)" />
                    </Pressable>
                  </View>
                </Animated.View>

                <View style={s.appsSection}>
                  <Text style={s.supportedTitle}>SUPPORTED UPI APPS</Text>
                  <View style={s.appsGrid}>
                    {UPI_APPS.map((app) => (
                      <View key={app.name} style={s.appChip}>
                        <View style={[s.appDot, { backgroundColor: app.color }]}>
                          <Text style={s.appDotText}>{app.short[0]}</Text>
                        </View>
                        <Text style={s.appName}>{app.short}</Text>
                      </View>
                    ))}
                    <View style={[s.appChip, { backgroundColor: "#F3F4F6", borderColor: "transparent" }]}>
                      <Text style={s.appOthers}>+50 Others</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Notes */}
            <View style={[s.notesCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={s.notesTitle}>Notes:</Text>
              {NOTES.map((note) => (
                <View key={note} style={s.noteRow}>
                  <View style={s.noteDot} />
                  <Text style={[s.noteText, { color: tokens.txt2 }]}>{note}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, alignItems: "center" }]}>
              <Text style={s.scanLabel}>Scan QR to withdraw</Text>
              <Text style={s.qrAmount}>₹{amountNum.toLocaleString("en-IN")}</Text>

              <View style={[s.timerPill, { backgroundColor: isExpired ? "#FEF2F2" : "#FFFBEB" }]}>
                <Info size={14} color={isExpired ? "#EF4444" : "#D97706"} />
                <Text style={[s.timerText, { color: isExpired ? "#DC2626" : "#B45309" }]}>
                  {isExpired ? "QR Expired" : `QR expiring in ${timerStr}`}
                </Text>
              </View>

              {!isExpired && <Text style={s.refreshWarn}>Do not refresh the page</Text>}

              <View style={[s.qrBorder, isExpired && { opacity: 0.3 }]}>
                <QrPlaceholder />
              </View>

              <View style={s.upiRow}>
                <Text style={s.upiLabel}>UPI ID: </Text>
                <Text style={s.upiValue}>{upiId}</Text>
                <Pressable onPress={handleCopyUpi} hitSlop={10} style={s.copyBtn}>
                  {copied ? <Check size={14} color={colors.green} /> : <Copy size={14} color={tokens.mute} />}
                </Pressable>
              </View>

              {isExpired && (
                <Pressable
                  onPress={() => {
                    setUpiId(generateMockUpiId());
                    startTimer();
                  }}
                  style={s.regenBtn}
                >
                  <LinearGradient
                    colors={[colors.blueLight, colors.blue]}
                    start={gradientDirection.diagonal.start}
                    end={gradientDirection.diagonal.end}
                    style={s.regenGradient}
                  >
                    <Text style={s.regenText}>Regenerate QR</Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>

            <View
              style={[
                s.card,
                {
                  backgroundColor: tokens.card,
                  borderColor: tokens.cardBorder,
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 12,
                  paddingVertical: 12,
                },
              ]}
            >
              <Text style={s.bhimText}>BHIM</Text>
              <Text style={s.upiText}>UPI</Text>
            </View>

            <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={s.supportedTitle}>SUPPORTED UPI APPS</Text>
              <View style={s.appsGrid}>
                {UPI_APPS.map((app) => (
                  <View key={app.name} style={s.appChip}>
                    <View style={[s.appDot, { backgroundColor: app.color }]}>
                      <Text style={s.appDotText}>{app.short[0]}</Text>
                    </View>
                    <Text style={s.appName}>{app.short}</Text>
                  </View>
                ))}
                <View style={[s.appChip, { backgroundColor: "#F3F4F6", borderColor: "transparent" }]}>
                  <Text style={s.appOthers}>+50 Others</Text>
                </View>
              </View>
            </View>

            <Pressable onPress={handleNewQr} style={[s.newTxnBtn, { borderColor: tokens.cardBorder }]}>
              <Text style={[s.newTxnText, { color: tokens.txt2 }]}>New Transaction</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontWeight: "800", fontSize: 19, color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.78)", fontWeight: "500", marginTop: 2 },
  content: { padding: 16, paddingBottom: 40 },

  mainCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 14,
  },
  amberBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  amberText: { flex: 1, fontSize: 13, lineHeight: 19, color: "#78350F", fontWeight: "500" },
  amberBold: { fontWeight: "800", color: "#78350F" },
  cardBody: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20 },
  amountTitle: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 18,
  },
  amountBlock: { alignItems: "center", marginBottom: 4 },
  amountUnderline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 8,
    minWidth: 200,
    gap: 6,
  },
  rupeeBig: { fontSize: 28, fontWeight: "600", color: "#6B7280" },
  amountBigInput: {
    minWidth: 120,
    maxWidth: 200,
    fontSize: 44,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    paddingVertical: 0,
    letterSpacing: -0.5,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#DC2626",
    textAlign: "center",
  },
  amountHint: {
    marginTop: 8,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    fontWeight: "500",
  },

  quickWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
  },
  quickChip: {
    minWidth: 72,
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickChipAmt: { fontWeight: "700", fontSize: 14 },
  quickHint: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: "#9CA3AF",
  },

  generateBtn: { borderRadius: 999, overflow: "hidden", marginTop: 28, alignSelf: "center" },
  generateBtnDisabled: { opacity: 0.55 },
  generateGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 40,
    height: 50,
    borderRadius: 999,
    minWidth: 220,
  },
  generateText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 16,
  },
  partnerText: { fontSize: 12, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.3 },
  partnerDot: { fontSize: 12, color: "#D1D5DB", fontWeight: "700" },

  earnStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  earnLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  earnIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  earnIconText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  earnText: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "700" },

  appsSection: {
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },

  notesCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  notesTitle: { fontSize: 14, fontWeight: "800", color: "#111827", marginBottom: 12 },
  noteRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  noteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#6B7280",
    marginTop: 6,
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "500" },

  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },

  scanLabel: { fontSize: 13, fontWeight: "600", color: "#6B7280", marginBottom: 4 },
  qrAmount: { fontSize: 28, fontWeight: "900", color: colors.blue, marginBottom: 14 },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  timerText: { fontSize: 13, fontWeight: "700" },
  refreshWarn: { fontSize: 11, fontWeight: "500", color: "#9CA3AF", marginBottom: 14 },
  qrBorder: {
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 10,
    marginBottom: 14,
  },
  upiRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  upiLabel: { fontSize: 11, color: "#6B7280" },
  upiValue: { fontSize: 11, fontWeight: "700", color: "#374151", flex: 1 },
  copyBtn: { padding: 4 },
  regenBtn: { borderRadius: 14, overflow: "hidden", marginTop: 14, width: "100%" },
  regenGradient: {
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: 14,
  },
  regenText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  bhimText: { fontSize: 15, fontWeight: "900", color: colors.blue, letterSpacing: 1 },
  upiText: { fontSize: 15, fontWeight: "900", color: "#00897B", letterSpacing: 1 },

  supportedTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    textAlign: "center",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  appsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  appChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    backgroundColor: "#F9FAFB",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  appDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  appDotText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  appName: { fontSize: 11, fontWeight: "600", color: "#4B5563" },
  appOthers: { fontSize: 11, fontWeight: "700", color: "#6B7280" },

  newTxnBtn: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 14,
    backgroundColor: "#fff",
    marginBottom: 14,
  },
  newTxnText: { fontSize: 14, fontWeight: "700" },
});
