import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";
import { ArrowLeft, Copy, Check, Info } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
const QUICK_AMOUNTS = [500, 1000, 2000, 5000];
const QR_EXPIRY_SECONDS = 120;

const UPI_APPS = [
  { name: "Google Pay", short: "GPay", color: "#4285F4" },
  { name: "PhonePe", short: "PhonePe", color: "#5F259F" },
  { name: "Paytm", short: "Paytm", color: "#00BAF2" },
  { name: "BHIM", short: "BHIM", color: "#00897B" },
  { name: "CRED", short: "CRED", color: "#1A1A2E" },
  { name: "Amazon Pay", short: "Amazon", color: "#FF9900" },
  { name: "MobiKwik", short: "MobiKwik", color: "#2196F3" },
  { name: "Kotak", short: "Kotak", color: "#E53935" },
];

type Stage = "input" | "qr";

function generateMockUpiId(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `asanpay.ucp${num}@yesbankltd`;
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
  const [timer, setTimer] = useState(QR_EXPIRY_SECONDS);
  const [upiId, setUpiId] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  function handleGenerate() {
    const amt = parseInt(amount, 10);
    if (!amt || amt < 1) return;
    setUpiId(generateMockUpiId());
    setStage("qr");
    startTimer();
  }

  function handleNewQr() {
    setStage("input");
    setAmount("");
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
  const amountNum = parseInt(amount, 10) || 0;
  const isExpired = timer === 0;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
      {/* Header */}
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
        {/* Branding strip */}
        <View style={s.brandStrip}>
          <View style={s.brandItem}>
            <View style={s.brandIcon}>
              <Text style={s.brandIconText}>AP</Text>
            </View>
            <Text style={s.brandLabel}>AsanPay</Text>
          </View>
          <View style={s.brandDivider} />
          <View style={s.brandItem}>
            <View style={s.brandIcon}>
              <Text style={s.brandIconText}>YB</Text>
            </View>
            <Text style={s.brandLabel}>YES Bank</Text>
          </View>
          <View style={s.brandDivider} />
          <View style={s.ucpBadge}>
            <Text style={s.ucpBadgeText}>UPI CASH POINT</Text>
          </View>
        </View>

        {stage === "input" ? (
          /* ── Amount Input Stage ──────────────────────── */
          <>
            <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[s.fieldLabel, { color: tokens.sub }]}>WITHDRAWAL AMOUNT</Text>
              <View style={[s.amountRow, { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg }]}>
                <Text style={s.rupeePrefix}>₹</Text>
                <TextInput
                  value={amount}
                  onChangeText={(v) => setAmount(v.replace(/\D/g, ""))}
                  placeholder="Enter amount"
                  placeholderTextColor={tokens.mute}
                  keyboardType="number-pad"
                  style={[s.amountInput, { color: colors.blue }]}
                />
              </View>

              <View style={s.quickRow}>
                {QUICK_AMOUNTS.map((a) => {
                  const active = amount === String(a);
                  return (
                    <Pressable
                      key={a}
                      onPress={() => setAmount(String(a))}
                      style={[
                        s.quickChip,
                        {
                          borderColor: active ? colors.blueLight : tokens.cardBorder,
                          backgroundColor: active ? colors.bluePale : tokens.card,
                        },
                      ]}
                    >
                      <Text style={[s.quickChipText, { color: active ? colors.blue : tokens.txt2 }]}>
                        ₹{a.toLocaleString("en-IN")}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={handleGenerate}
                disabled={amountNum < 1}
                style={({ pressed }) => [s.generateBtn, amountNum < 1 && s.generateBtnDisabled, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient
                  colors={amountNum >= 1 ? [colors.greenLight, colors.greenDark] : ["#94a3b8", "#94a3b8"]}
                  start={gradientDirection.diagonal.start}
                  end={gradientDirection.diagonal.end}
                  style={s.generateGradient}
                >
                  <Text style={s.generateText}>Generate QR Code</Text>
                </LinearGradient>
              </Pressable>
            </View>

            {/* How it works */}
            <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[s.infoTitle, { color: colors.blue }]}>How UPI Cash Point Works</Text>
              {[
                "Enter withdrawal amount",
                "QR code is generated with payment details",
                "Customer scans QR from any UPI app",
                "Payment received — hand over cash",
                "Commission credited to your wallet",
              ].map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <View style={[s.stepNum, { backgroundColor: i === 4 ? "#ECFDF5" : colors.bluePale }]}>
                    <Text style={[s.stepNumText, { color: i === 4 ? "#059669" : colors.blueLight }]}>
                      {i === 4 ? "✓" : String(i + 1)}
                    </Text>
                  </View>
                  <Text style={[s.stepText, { color: tokens.txt2 }]}>{step}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          /* ── QR Display Stage ───────────────────────── */
          <>
            <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, alignItems: "center" }]}>
              <Text style={s.scanLabel}>Scan QR to withdraw</Text>
              <Text style={s.qrAmount}>₹{amountNum.toLocaleString("en-IN")}</Text>

              {/* Timer */}
              <View style={[s.timerPill, { backgroundColor: isExpired ? "#FEF2F2" : "#FFFBEB" }]}>
                <Info size={14} color={isExpired ? "#EF4444" : "#D97706"} />
                <Text style={[s.timerText, { color: isExpired ? "#DC2626" : "#B45309" }]}>
                  {isExpired ? "QR Expired" : `QR expiring in ${timerStr}`}
                </Text>
              </View>

              {!isExpired && (
                <Text style={s.refreshWarn}>Do not refresh the page</Text>
              )}

              {/* QR Code */}
              <View style={[s.qrBorder, isExpired && { opacity: 0.3 }]}>
                <QrPlaceholder />
              </View>

              {/* UPI ID */}
              <View style={s.upiRow}>
                <Text style={s.upiLabel}>UPI ID: </Text>
                <Text style={s.upiValue}>{upiId}</Text>
                <Pressable onPress={handleCopyUpi} hitSlop={10} style={s.copyBtn}>
                  {copied ? (
                    <Check size={14} color={colors.green} />
                  ) : (
                    <Copy size={14} color={tokens.mute} />
                  )}
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
                    colors={[colors.greenLight, colors.greenDark]}
                    start={gradientDirection.diagonal.start}
                    end={gradientDirection.diagonal.end}
                    style={s.regenGradient}
                  >
                    <Text style={s.regenText}>Regenerate QR</Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>

            {/* BHIM UPI */}
            <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 12 }]}>
              <Text style={s.bhimText}>BHIM</Text>
              <Text style={s.upiText}>UPI</Text>
            </View>

            {/* Supported UPI Apps */}
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
                <View style={[s.appChip, { backgroundColor: "#F3F4F6" }]}>
                  <Text style={s.appOthers}>+50 Others</Text>
                </View>
              </View>
            </View>

            {/* New Transaction */}
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

  // Branding strip
  brandStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.blue,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  brandItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandIconText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  brandLabel: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "700" },
  brandDivider: { width: 1, height: 18, backgroundColor: "rgba(255,255,255,0.3)" },
  ucpBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ucpBadgeText: { color: "rgba(255,255,255,0.9)", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  // Card
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },

  // Input stage
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3, marginBottom: 8 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 56,
  },
  rupeePrefix: { fontSize: 22, fontWeight: "900", color: colors.blue, marginRight: 6 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: "800", paddingVertical: 0 },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  quickChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  quickChipText: { fontWeight: "700", fontSize: 12.5 },
  generateBtn: { borderRadius: 16, overflow: "hidden", marginTop: 20 },
  generateBtnDisabled: { opacity: 0.55 },
  generateGradient: {
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 16,
  },
  generateText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  // Info
  infoTitle: { fontWeight: "800", fontSize: 14, marginBottom: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontSize: 10, fontWeight: "800" },
  stepText: { fontSize: 12, fontWeight: "500", flex: 1, lineHeight: 17 },

  // QR stage
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

  // BHIM UPI
  bhimText: { fontSize: 15, fontWeight: "900", color: colors.blue, letterSpacing: 1 },
  upiText: { fontSize: 15, fontWeight: "900", color: "#00897B", letterSpacing: 1 },

  // Supported apps
  supportedTitle: { fontSize: 10, fontWeight: "700", color: "#9CA3AF", textAlign: "center", letterSpacing: 0.5, marginBottom: 10 },
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
  appName: { fontSize: 10.5, fontWeight: "600", color: "#4B5563" },
  appOthers: { fontSize: 10.5, fontWeight: "700", color: "#6B7280" },

  // New txn
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
