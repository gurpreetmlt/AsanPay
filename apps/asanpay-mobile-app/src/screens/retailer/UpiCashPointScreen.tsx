import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import Geolocation from "@react-native-community/geolocation";
import RawQRCode from "react-native-qrcode-svg";
import { ArrowLeft, Check, Copy, Info, QrCode, RefreshCw, X } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";

// Hoisted React 19 types make the library's class component look invalid to TS; it renders fine.
const QRCode = RawQRCode as unknown as React.ComponentType<{
  value: string;
  size: number;
  color?: string;
  backgroundColor?: string;
}>;

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

const UPI_CP_CODES = new Set(["UPI_CASH_POINT", "UPI_QR", "UPIQR"]);

type TxnRow = {
  id: string;
  txnRef: string;
  amount: string;
  status: string;
  serviceCode: string;
  createdAt: string;
  providerTxnId?: string | null;
  metadata?: Record<string, unknown> | null;
};

function statusBucket(status: string): "success" | "pending" | "failed" {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return "success";
  if (s === "failed" || s === "reversed" || s === "refunded") return "failed";
  return "pending";
}

const STATUS_STYLE = {
  success: { bg: "#ECFDF5", fg: "#047857", label: "Success" },
  pending: { bg: "#FFFBEB", fg: "#92400E", label: "Pending" },
  failed: { bg: "#FEF2F2", fg: "#B91C1C", label: "Failed" },
} as const;

function maskedCustomer(row: TxnRow): string {
  const m = row.metadata?.mobileNumber ?? row.metadata?.customerMobile;
  return typeof m === "string" && m.length >= 4 ? `XXXXXX${m.slice(-4)}` : "—";
}

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `upi://pay?pa=<vpa>&...` → `<vpa>` */
function upiIdFromQr(qr: string): string {
  const match = /[?&]pa=([^&]+)/.exec(qr);
  return match ? decodeURIComponent(match[1]!) : "";
}

function currentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  });
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

interface Props {
  onBack: () => void;
}

export function UpiCashPointScreen({ onBack }: Props) {
  const { tokens } = useTheme();
  const [stage, setStage] = useState<Stage>("input");
  const [amount, setAmount] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [earnDismissed, setEarnDismissed] = useState(false);
  const [timer, setTimer] = useState(QR_EXPIRY_SECONDS);
  const [qrValue, setQrValue] = useState("");
  const [txnId, setTxnId] = useState("");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<TxnRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const upiId = upiIdFromQr(qrValue);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get<ApiResponse<TxnRow[]>>("/txn", { params: { limit: 100, offset: 0 } });
      if (data.success) setHistory((data.data ?? []).filter((r) => UPI_CP_CODES.has(r.serviceCode)).slice(0, 20));
    } catch {
      /* list stays empty; pull back into the screen to retry */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);
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
  const canGenerate = amountValid && customerMobile.length === 10 && !busy;
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

  async function handleGenerate() {
    if (busy || !amountValid) return;
    if (customerMobile.length !== 10) {
      showAlert("Customer mobile", "Enter a valid 10-digit customer mobile");
      return;
    }
    setBusy(true);
    try {
      let geo: { latitude: number; longitude: number };
      try {
        geo = await currentPosition();
      } catch {
        showAlert("Location required", "Allow location access before continuing");
        return;
      }
      await api.post("/noble/upi-qr/load", { channel: "APP" });
      const { data } = await api.post<ApiResponse<{ qr: string; transactionId: string }>>(
        "/noble/upi-qr/generate",
        {
          amount: String(amountNum),
          mobileNumber: customerMobile,
          ...geo,
          channel: "APP",
          deviceOsType: "ANDROID",
          deviceOsVersion: String(Platform.Version),
        },
      );
      if (!data.success) throw new Error(data.message);
      if (!data.data.qr) throw new Error("The provider did not return a QR code. Try again.");
      setQrValue(data.data.qr);
      setTxnId(data.data.transactionId || "");
      setStage("qr");
      startTimer();
      void loadHistory();
    } catch (err) {
      showAlert("UPI QR failed", apiError(err, "Could not generate the UPI QR. Try again."));
    } finally {
      setBusy(false);
    }
  }

  function handleNewQr() {
    setStage("input");
    setAmount("");
    setCustomerMobile("");
    setQrValue("");
    setTxnId("");
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

                <View style={s.mobileBlock}>
                  <Text style={s.mobileLabel}>Customer mobile</Text>
                  <TextInput
                    value={customerMobile}
                    onChangeText={(t) => setCustomerMobile(t.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit mobile"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={10}
                    style={s.mobileInput}
                  />
                </View>

                <Pressable
                  onPress={() => void handleGenerate()}
                  disabled={!canGenerate}
                  style={({ pressed }) => [
                    s.generateBtn,
                    !canGenerate && s.generateBtnDisabled,
                    pressed && canGenerate && { opacity: 0.9 },
                  ]}
                >
                  <LinearGradient
                    colors={canGenerate || busy ? [colors.blueLight, colors.blue] : ["#94a3b8", "#94a3b8"]}
                    start={gradientDirection.diagonal.start}
                    end={gradientDirection.diagonal.end}
                    style={s.generateGradient}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={s.generateText}>Generate QR</Text>
                        <QrCode size={18} color="#fff" strokeWidth={2.4} />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
                <Text style={s.geoHint}>Your shop location is captured when you tap Generate QR</Text>

                <View style={s.partnerRow}>
                  <Text style={s.partnerText}>AsanPay</Text>
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

            <View style={[s.notesCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <View style={s.historyHead}>
                <Text style={s.notesTitle}>Recent transactions</Text>
                <Pressable onPress={() => void loadHistory()} hitSlop={10} disabled={historyLoading}>
                  {historyLoading ? (
                    <ActivityIndicator size="small" color={colors.blueFlat} />
                  ) : (
                    <RefreshCw size={16} color={colors.blueFlat} />
                  )}
                </Pressable>
              </View>
              {history.map((r) => {
                const st = STATUS_STYLE[statusBucket(r.status)];
                return (
                  <View key={r.id} style={[s.historyRow, { borderTopColor: tokens.cardBorder }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.historyAmt, { color: tokens.txt }]}>
                        ₹{(parseFloat(r.amount) || 0).toLocaleString("en-IN")}
                      </Text>
                      <Text style={s.historyMeta} numberOfLines={1}>
                        {formatAt(r.createdAt)} · {maskedCustomer(r)}
                      </Text>
                      <Text style={s.historyRef} numberOfLines={1}>
                        {r.txnRef}
                        {r.providerTxnId ? ` · RRN ${r.providerTxnId}` : ""}
                      </Text>
                    </View>
                    <Text style={[s.historyPill, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
                  </View>
                );
              })}
              {!historyLoading && history.length === 0 ? (
                <View style={s.historyEmpty}>
                  <QrCode size={22} color={colors.blueFlat} />
                  <Text style={[s.historyEmptyTitle, { color: tokens.txt }]}>No UPI Cash Point transactions yet</Text>
                  <Text style={s.historyEmptyText}>
                    Paid QR withdrawals will be listed here with their status and bank RRN.
                  </Text>
                </View>
              ) : null}
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
                {qrValue ? <QRCode value={qrValue} size={180} color={colors.blue} backgroundColor="#fff" /> : null}
              </View>

              {upiId ? (
                <View style={s.upiRow}>
                  <Text style={s.upiLabel}>UPI ID: </Text>
                  <Text style={s.upiValue}>{upiId}</Text>
                  <Pressable onPress={handleCopyUpi} hitSlop={10} style={s.copyBtn}>
                    {copied ? <Check size={14} color={colors.green} /> : <Copy size={14} color={tokens.mute} />}
                  </Pressable>
                </View>
              ) : null}
              {txnId ? <Text style={s.txnText}>Txn ID: {txnId}</Text> : null}

              {isExpired && (
                <Pressable
                  onPress={() => void handleGenerate()}
                  disabled={busy}
                  style={[s.regenBtn, busy && { opacity: 0.6 }]}
                >
                  <LinearGradient
                    colors={[colors.blueLight, colors.blue]}
                    start={gradientDirection.diagonal.start}
                    end={gradientDirection.diagonal.end}
                    style={s.regenGradient}
                  >
                    <Text style={s.regenText}>{busy ? "Generating…" : "Regenerate QR"}</Text>
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

  mobileBlock: { alignSelf: "center", width: "100%", maxWidth: 280, marginTop: 24 },
  mobileLabel: { fontSize: 12, fontWeight: "700", color: "#6B7280", textAlign: "center", marginBottom: 6 },
  mobileInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  geoHint: { marginTop: 8, fontSize: 11, color: "#9CA3AF", textAlign: "center", fontWeight: "500" },
  txnText: { marginTop: 8, fontSize: 11, color: "#9CA3AF" },
  generateBtn: { borderRadius: 14, overflow: "hidden", marginTop: 20, alignSelf: "center" },
  generateBtnDisabled: { opacity: 0.55 },
  generateGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 40,
    height: 50,
    borderRadius: 14,
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
  historyHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  historyAmt: { fontSize: 15, fontWeight: "800" },
  historyMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  historyRef: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  historyPill: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  historyEmpty: { alignItems: "center", paddingVertical: 14, gap: 6 },
  historyEmptyTitle: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  historyEmptyText: { fontSize: 12, color: "#6B7280", textAlign: "center", lineHeight: 17 },

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
