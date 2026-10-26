import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Eye,
  EyeOff,
  Fingerprint,
  Plus,
  ScanEye,
  Search,
  Star,
  X,
} from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api, fetchApi } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { formatINR } from "../../lib/format";
import { aepsBankLogoUrl } from "../../lib/bankLogo";
import { createAttemptKeyHolder } from "../../lib/idempotencyKey";
import { captureFingerprint, listInstalledRdPackages } from "../../lib/rdServiceFingerprint";
import { allowAgentAuthUiSkip } from "../../lib/allowAgentAuthUiSkip";
import { getAepsGeoTag } from "../../lib/geoCapture";
import { useTxnPin } from "../../hooks/useTxnPin";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";

const { width: SCREEN_W } = Dimensions.get("window");

/* ── Bank data ─────────────────────────────────────────────────────── */

interface Bank {
  id: string;
  name: string;
  shortName: string;
  color: string;
  letter: string;
  /** NPCI-assigned Bank IIN for AEPS. Overridden at runtime by GET /txn/aeps/banks (live). */
  iin: string;
}

const BANKS: Bank[] = [
  { id: "bob", name: "Bank of Baroda", shortName: "BOB", color: "#E64A19", letter: "B", iin: "606985" },
  { id: "pnb", name: "Punjab National Bank", shortName: "PNB", color: "#D32F2F", letter: "P", iin: "607027" },
  { id: "psb", name: "Punjab & Sind Bank", shortName: "PSB", color: "#7B1FA2", letter: "P", iin: "607087" },
  { id: "sbi", name: "State Bank of India", shortName: "SBI", color: "#1565C0", letter: "S", iin: "607094" },
  { id: "hdfc", name: "HDFC Bank", shortName: "HDFC", color: "#00338D", letter: "H", iin: "607152" },
  { id: "airtel", name: "Airtel Payment Bank", shortName: "Airtel", color: "#E53935", letter: "A", iin: "990320" },
  { id: "icici", name: "ICICI Bank", shortName: "ICICI", color: "#F57C00", letter: "I", iin: "508534" },
  { id: "pgb", name: "Punjab Gramin Bank", shortName: "PGB", color: "#E91E63", letter: "P", iin: "607138" },
  { id: "uco", name: "UCO Bank", shortName: "UCO", color: "#7B1FA2", letter: "U", iin: "607066" },
  { id: "boi", name: "Bank of India", shortName: "BOI", color: "#E65100", letter: "B", iin: "508505" },
  { id: "canara", name: "Canara Bank", shortName: "Canara", color: "#1976D2", letter: "C", iin: "607396" },
  { id: "indian", name: "Indian Bank", shortName: "Indian", color: "#0D47A1", letter: "I", iin: "607105" },
  { id: "union", name: "Union Bank of India", shortName: "Union", color: "#F57C00", letter: "U", iin: "607161" },
  { id: "kotak", name: "Kotak Mahindra Bank", shortName: "Kotak", color: "#E53935", letter: "K", iin: "990309" },
  { id: "axis", name: "Axis Bank", shortName: "Axis", color: "#6A1B9A", letter: "A", iin: "607153" },
  { id: "iob", name: "Indian Overseas Bank", shortName: "IOB", color: "#C62828", letter: "I", iin: "607126" },
  { id: "central", name: "Central Bank of India", shortName: "Central", color: "#B71C1C", letter: "C", iin: "607264" },
  { id: "bom", name: "Bank of Maharashtra", shortName: "BOM", color: "#4A148C", letter: "B", iin: "607387" },
  { id: "idbi", name: "IDBI Bank", shortName: "IDBI", color: "#00695C", letter: "I", iin: "607095" },
  { id: "yes", name: "Yes Bank", shortName: "Yes", color: "#1565C0", letter: "Y", iin: "YES000" },
  { id: "fino", name: "Fino Payments Bank", shortName: "Fino", color: "#FF6F00", letter: "F", iin: "608001" },
  { id: "paytm", name: "Paytm Payments Bank", shortName: "Paytm", color: "#00BCD4", letter: "P", iin: "PAYTM0" },
];

/** Shared with web — persisted via GET/PUT /auth/aeps-favourite-banks */
const DEFAULT_AEPS_FAV_BANKS = ["bob", "pnb", "sbi", "hdfc", "airtel", "icici"] as const;
const AEPS_FAV_LEGACY: Record<string, string> = { bob_vijaya: "bob", pnb_obc: "pnb" };

function sanitizeAepsFavIds(ids: string[], validIds: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = AEPS_FAV_LEGACY[raw] ?? raw;
    if (validIds.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

interface AepsBankRow {
  name: string;
  iin: string;
  aepsEnabled?: boolean;
}

/** Normalize a bank name for fuzzy matching across our list vs provider list. */
function bankKey(name: string): string {
  return name.toLowerCase().replace(/payments?/g, "").replace(/[^a-z]/g, "");
}

const AEPS_TABS = ["Withdraw", "Mini Statement", "Deposit", "Balance Enquiry", "Aadhaar Pay"] as const;
type AepsTab = (typeof AEPS_TABS)[number];

const AEPS_TAB_MAP: Record<string, AepsTab> = {
  CASH_WITHDRAW: "Withdraw",
  MINI_STATEMENT: "Mini Statement",
  CASH_DEPOSIT: "Deposit",
  BALANCE_ENQUIRY: "Balance Enquiry",
  AADHAAR_PAY: "Aadhaar Pay",
};

/** Airtel Payments Bank customers never need the Aadhaar Pay OTP. */
const AIRTEL_BANK_IIN = "990320";

/** POST /onboarding/noble/ap/load — Aadhaar Pay has its own KYC + daily 2FA session. */
interface AadhaarPaySession {
  kycRequired: boolean;
  daily2faRequired: boolean;
  kycWadhValue: string;
  amountForOtp: number | null;
  tranTypeForOtp: string | null;
}

interface AadhaarPayOtp {
  amount: string;
  bankIin: string;
  required: boolean;
  otpReference: string;
  otpTransactionId: string;
  otpTransactionToken: string;
}

const QUICK_AMOUNTS = [1000, 3000, 5000, 10000];

/* ── Biometric L1 devices (UIDAI certified) ───────────────────────── */

interface BiometricDevice {
  id: string;
  name: string;
  rdPackage: string;
  color: string;
  letter: string;
}

const BIOMETRIC_DEVICES: BiometricDevice[] = [
  { id: "mantra_mfs110", name: "Mantra MFS110 L1", rdPackage: "com.mantra.mfs110.rdservice", color: "#1565C0", letter: "M" },
  { id: "startek_fm220", name: "Startek L1", rdPackage: "com.acpl.registersdk", color: "#4A148C", letter: "S" },
  { id: "morpho_mso1300", name: "Morpho MSO L1", rdPackage: "com.idemia.l1rdservice", color: "#E53935", letter: "M" },
  { id: "visiontek_v600", name: "VisionTek V600 L1", rdPackage: "com.linkwell.rdservice", color: "#00695C", letter: "V" },
  { id: "evolute_escan", name: "Evolute eScan L1", rdPackage: "com.evolute.rdservice", color: "#F57C00", letter: "E" },
  { id: "mantra_marc11", name: "Marc 11", rdPackage: "com.mantra.mfs110.rdservice", color: "#1976D2", letter: "M" },
  { id: "precision_pb1000", name: "PB1000 - L1", rdPackage: "com.precision.pb510.rdservice", color: "#7B1FA2", letter: "P" },
];

/** Prefer Morpho, then Mantra, then any other installed allowlisted RD package. */
async function detectConnectedDevice(): Promise<BiometricDevice | null> {
  const installed = await listInstalledRdPackages();
  if (installed.length === 0) return null;
  const lower = installed.map((p) => p.toLowerCase());
  const prefer = ["com.idemia.l1rdservice", "com.mantra.mfs110.rdservice"];
  for (const pkg of prefer) {
    if (lower.includes(pkg)) {
      return BIOMETRIC_DEVICES.find((d) => d.rdPackage === pkg) ?? null;
    }
  }
  for (const pkg of installed) {
    const match = BIOMETRIC_DEVICES.find((d) => d.rdPackage.toLowerCase() === pkg.toLowerCase());
    if (match) return match;
  }
  return null;
}

type AuthMode = "fingerprint" | "iris";

/* ── Device selector modal ─────────────────────────────────────────── */

function DeviceModal({
  visible,
  onClose,
  activeDeviceId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  activeDeviceId: string;
  onSelect: (device: BiometricDevice) => void;
}) {
  const { tokens } = useTheme();
  const slideAnim = useRef(new Animated.Value(SCREEN_W)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(SCREEN_W);
    }
  }, [visible, slideAnim]);

  function handleClose() {
    Animated.timing(slideAnim, {
      toValue: SCREEN_W,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onClose());
  }

  if (!visible) return null;

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible>
      <View style={dm.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <Animated.View
          style={[dm.sheet, { backgroundColor: tokens.card, transform: [{ translateX: slideAnim }] }]}
        >
          <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
            <View style={dm.header}>
              <Text style={[dm.headerTitle, { color: colors.blue }]}>Select Biometric Device</Text>
              <Pressable onPress={handleClose} hitSlop={12} style={dm.closeBtn}>
                <X size={20} color={tokens.mute} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }}>
              {BIOMETRIC_DEVICES.map((device) => {
                const isActive = device.id === activeDeviceId;
                return (
                  <Pressable
                    key={device.id}
                    onPress={() => { onSelect(device); handleClose(); }}
                    style={[dm.row, isActive && { backgroundColor: `${colors.blueFlat}0C` }]}
                  >
                    <View style={[dm.deviceIcon, { backgroundColor: device.color }]}>
                      <Text style={dm.deviceLetter}>{device.letter}</Text>
                    </View>
                    <Text style={[dm.deviceName, { color: tokens.txt }]}>{device.name}</Text>
                    {isActive && (
                      <View style={dm.activeBadge}>
                        <Text style={dm.activeBadgeText}>Currently Active</Text>
                      </View>
                    )}
                    <ChevronRight size={16} color={tokens.mute} />
                  </Pressable>
                );
              })}

              <Pressable onPress={handleClose} style={dm.row}>
                <View style={dm.addIcon}>
                  <Plus size={18} color={tokens.mute} />
                </View>
                <Text style={[dm.deviceName, { color: tokens.mute }]}>Add New Device</Text>
                <View style={{ marginLeft: "auto" }}>
                  <ChevronRight size={16} color={tokens.mute} />
                </View>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const dm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { position: "absolute", top: 0, bottom: 0, right: 0, width: SCREEN_W * 0.88, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: -4, height: 0 }, elevation: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  headerTitle: { fontWeight: "800", fontSize: 17 },
  closeBtn: { padding: 6, borderRadius: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  deviceIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  deviceLetter: { color: "#fff", fontWeight: "800", fontSize: 16 },
  deviceName: { flex: 1, fontSize: 14, fontWeight: "600" },
  activeBadge: { backgroundColor: "#dcfce7", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontSize: 10, fontWeight: "800", color: "#15803d" },
  addIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: "#d1d5db", alignItems: "center", justifyContent: "center" },
});

/* ── Bank icon ─────────────────────────────────────────────────────── */

function BankIcon({ bank, size = 44 }: { bank: Bank; size?: number }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = aepsBankLogoUrl(bank);

  if (logoUrl && !failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#fff",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(15,23,42,0.08)",
          shadowColor: "#0F172A",
          shadowOpacity: 0.08,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size * 0.68, height: size * 0.68 }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bank.color,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#0F172A",
        shadowOpacity: 0.12,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.38 }}>
        {bank.letter}
      </Text>
    </View>
  );
}

/** Round bank chip with spring select animation (matches agent Layout 3). */
function AnimatedBankChip({
  bank,
  active,
  onPress,
  labelColor,
}: {
  bank: Bank;
  active: boolean;
  onPress: () => void;
  labelColor: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const check = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: active ? 1.08 : 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(check, {
        toValue: active ? 1 : 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, check, scale]);

  return (
    <Pressable onPress={onPress} style={s.bankItemWrap}>
      <Animated.View
        style={[
          s.bankItem,
          active && s.bankItemActive,
          { transform: [{ scale }] },
        ]}
      >
        <View style={s.bankIconWrap}>
          <View style={[s.bankRing, active && s.bankRingActive]}>
            <BankIcon bank={bank} size={48} />
          </View>
          <Animated.View
            style={[
              s.bankCheckBadge,
              {
                opacity: check,
                transform: [
                  {
                    scale: check.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Check size={11} color="#fff" strokeWidth={3} />
          </Animated.View>
        </View>
        <Text
          style={[
            s.bankShort,
            { color: active ? colors.blue : labelColor },
            active && s.bankShortActive,
          ]}
          numberOfLines={1}
        >
          {bank.shortName.replace(/\.\.\.$/, "")}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/* ── Bank selector modal (full-screen bottom sheet style) ──────────── */

function BankModal({
  visible,
  onClose,
  onSelect,
  favouriteIds,
  onToggleFav,
  banks,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (bank: Bank) => void;
  favouriteIds: string[];
  onToggleFav: (id: string) => void;
  banks: Bank[];
}) {
  const { tokens } = useTheme();
  const [search, setSearch] = useState("");
  const slideAnim = useRef(new Animated.Value(SCREEN_W)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(SCREEN_W);
      setSearch("");
    }
  }, [visible, slideAnim]);

  const favBanks = useMemo(() => {
    const byId = new Map(banks.map((b) => [b.id, b]));
    return favouriteIds.map((id) => byId.get(id)).filter((b): b is Bank => Boolean(b));
  }, [favouriteIds, banks]);

  const filtered = useMemo(
    () =>
      search.trim()
        ? banks.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
        : banks,
    [search, banks],
  );

  function handleClose() {
    Animated.timing(slideAnim, {
      toValue: SCREEN_W,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onClose());
  }

  if (!visible) return null;

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible>
      <View style={ms.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <Animated.View
          style={[ms.sheet, { backgroundColor: tokens.card, transform: [{ translateX: slideAnim }] }]}
        >
          <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
            {/* Header */}
            <View style={ms.header}>
              <Text style={[ms.headerTitle, { color: colors.blue }]}>Select Customer's Bank</Text>
              <Pressable onPress={handleClose} hitSlop={12} style={ms.closeBtn}>
                <X size={20} color={tokens.mute} />
              </Pressable>
            </View>

            {/* Search */}
            <View style={ms.searchWrap}>
              <View style={[ms.searchBox, { borderColor: tokens.cardBorder, backgroundColor: tokens.inputBg }]}>
                <Search size={16} color={tokens.mute} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search a bank"
                  placeholderTextColor={tokens.mute}
                  style={[ms.searchInput, { color: tokens.txt }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
              {/* Favourite/Recent banks */}
              {favBanks.length > 0 && !search && (
                <View style={{ marginBottom: 18 }}>
                  <Text style={[ms.sectionTitle, { color: tokens.txt }]}>Recent / Favourite Banks</Text>
                  <View style={ms.favGrid}>
                    {favBanks.map((bank) => (
                      <Pressable
                        key={bank.id}
                        onPress={() => {
                          onSelect(bank);
                          handleClose();
                        }}
                        style={ms.favItem}
                      >
                        <BankIcon bank={bank} size={42} />
                        <Text style={[ms.favName, { color: tokens.txt2 }]} numberOfLines={2}>
                          {bank.shortName}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* All banks */}
              <Text style={[ms.sectionTitle, { color: tokens.txt }]}>All Banks</Text>
              {filtered.map((bank) => (
                <View key={bank.id} style={[ms.bankRow, { borderBottomColor: tokens.cardBorder }]}>
                  <Pressable
                    style={ms.bankRowPress}
                    onPress={() => {
                      onSelect(bank);
                      handleClose();
                    }}
                  >
                    <BankIcon bank={bank} size={34} />
                    <Text style={[ms.bankRowName, { color: tokens.txt2 }]}>{bank.name}</Text>
                  </Pressable>
                  <Pressable onPress={() => onToggleFav(bank.id)} hitSlop={10}>
                    <Star
                      size={16}
                      strokeWidth={2}
                      color={favouriteIds.includes(bank.id) ? "#F59E0B" : tokens.mute}
                      fill={favouriteIds.includes(bank.id) ? "#F59E0B" : "none"}
                    />
                  </Pressable>
                </View>
              ))}
              {filtered.length === 0 && (
                <Text style={[ms.empty, { color: tokens.mute }]}>No banks found for "{search}"</Text>
              )}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { position: "absolute", top: 0, bottom: 0, right: 0, width: SCREEN_W * 0.88, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: -4, height: 0 }, elevation: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  headerTitle: { fontWeight: "800", fontSize: 17 },
  closeBtn: { padding: 6, borderRadius: 10 },
  searchWrap: { paddingHorizontal: 18, paddingVertical: 10 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "500", paddingVertical: 0 },
  sectionTitle: { fontWeight: "800", fontSize: 14, marginBottom: 10 },
  favGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  favItem: { alignItems: "center", width: 68, paddingVertical: 6 },
  favName: { fontSize: 10, fontWeight: "600", textAlign: "center", marginTop: 4 },
  bankRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1 },
  bankRowPress: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  bankRowName: { fontSize: 14, fontWeight: "600" },
  empty: { textAlign: "center", paddingVertical: 30, fontSize: 13 },
});

/* ── Main AEPS screen ──────────────────────────────────────────────── */

interface AepsScreenProps {
  onBack: () => void;
  initialTab?: AepsTab;
  serviceCode?: string;
}

export function AepsScreen({ onBack, initialTab, serviceCode }: AepsScreenProps) {
  const { tokens } = useTheme();
  const { promptPin, TxnPinPrompt } = useTxnPin();
  const userName = useAuthStore((s) => s.user?.name?.trim() || "Retailer");

  const resolvedInitial = useMemo(() => {
    if (initialTab) return initialTab;
    if (serviceCode && AEPS_TAB_MAP[serviceCode]) return AEPS_TAB_MAP[serviceCode];
    return "Withdraw" as AepsTab;
  }, [initialTab, serviceCode]);

  const [tab, setTab] = useState<AepsTab>(resolvedInitial);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  /** Next View-All insert index (0–3); advances each new pick. */
  const [insertSlot, setInsertSlot] = useState(0);
  /** Slot used for the current non-fav selected bank. */
  const [selectedInsertAt, setSelectedInsertAt] = useState(0);
  const bankScrollRef = useRef<ScrollView>(null);
  const bankViewportW = useRef(280);
  const bankScrollX = useRef(0);
  /** Delay before scroll — longer after View All so modal close finishes first. */
  const bankScrollDelayMs = useRef(32);
  /** Must match styles.bankItemWrap width + bankStrip.gap */
  const BANK_ITEM_W = 72;
  const BANK_GAP = 8;
  const BANK_STRIDE = BANK_ITEM_W + BANK_GAP;

  // Live IIN overrides from GET /txn/aeps/banks (keyed by normalized bank name).
  const [liveIinByName, setLiveIinByName] = useState<Record<string, string>>({});
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [aadhaar, setAadhaar] = useState("");
  const [mobile, setMobile] = useState("");
  const [amount, setAmount] = useState("");
  const [aadhaarVisible, setAadhaarVisible] = useState(false);
  const [aadhaarFocused, setAadhaarFocused] = useState(false);
  const [consent, setConsent] = useState(true);
  const [activeDevice, setActiveDevice] = useState<BiometricDevice>(BIOMETRIC_DEVICES[0]);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("fingerprint");
  const [agentAuthReady, setAgentAuthReady] = useState<boolean | null>(null);
  const [agentAuthKycReady, setAgentAuthKycReady] = useState(true);
  const [agentAadhaar, setAgentAadhaar] = useState("");
  /** True when signup KYC Aadhaar is on file — field prefilled / scan without re-type. */
  const [agentAadhaarFromKyc, setAgentAadhaarFromKyc] = useState(false);
  const [agentAadhaarLastFour, setAgentAadhaarLastFour] = useState<string | null>(null);
  const [agentAadhaarVisible, setAgentAadhaarVisible] = useState(false);
  const [agentAuthConsent, setAgentAuthConsent] = useState(false);
  const [agentAuthScanning, setAgentAuthScanning] = useState(false);
  const [favBanks, setFavBanks] = useState<string[]>([...DEFAULT_AEPS_FAV_BANKS]);
  const favHydrated = useRef(false);
  const favSkipNextSave = useRef(true);
  const favSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // ₹5,000+ withdrawals: the provider needs an SMS Transaction OTP. referenceKey goes in the
  // withdraw body; the OTP the customer receives rides inside the PID capture (RD otp attr).
  const [txnOtp, setTxnOtp] = useState("");
  const [otpRef, setOtpRef] = useState<{ referenceKey: string; amount: string } | null>(null);
  const withdrawAttemptKey = useRef(createAttemptKeyHolder("aeps-wd"));
  const [apSession, setApSession] = useState<AadhaarPaySession | null>(null);
  const [apLoading, setApLoading] = useState(false);
  const [apError, setApError] = useState<string | null>(null);
  const [apScanning, setApScanning] = useState(false);
  const [apOtp, setApOtp] = useState<AadhaarPayOtp | null>(null);
  const apAttemptKey = useRef(createAttemptKeyHolder("aeps-ap"));
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!scanning) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanning, scanAnim]);

  useEffect(() => {
    let mounted = true;
    void detectConnectedDevice().then((device) => {
      if (mounted && device) setActiveDevice(device);
    });
    void fetchApi<{
      verifiedToday: boolean;
      kycReady: boolean;
      aadhaarNumber?: string | null;
      outlet?: { aadhaarLastFour?: string | null } | null;
    }>("/auth/agent-auth/status")
      .then((payload) => {
        if (!mounted) return;
        setAgentAuthReady(Boolean(payload.verifiedToday));
        setAgentAuthKycReady(payload.kycReady !== false);
        const digits = String(payload.aadhaarNumber ?? "")
          .replace(/\D/g, "")
          .slice(0, 12);
        const last4 = String(payload.outlet?.aadhaarLastFour ?? "")
          .replace(/\D/g, "")
          .slice(-4);
        if (digits.length === 12) {
          setAgentAadhaar(digits);
          setAgentAadhaarFromKyc(true);
          setAgentAadhaarLastFour(digits.slice(-4));
        } else if (payload.kycReady) {
          setAgentAadhaarFromKyc(true);
          if (last4.length === 4) setAgentAadhaarLastFour(last4);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        Alert.alert("Unable to check AePS access", apiError(err, "Please try again."));
        onBack();
      });
    return () => {
      mounted = false;
    };
  }, [onBack]);

  useEffect(() => {
    if (!deviceModalOpen) return;
    void detectConnectedDevice().then((device) => {
      if (device) setActiveDevice(device);
    });
  }, [deviceModalOpen]);

  const toggleFavBank = useCallback((id: string) => {
    setFavBanks((prev) => {
      const valid = new Set(BANKS.map((b) => b.id));
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return sanitizeAepsFavIds(next, valid);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchApi<{ bankIds: string[] | null }>("/auth/aeps-favourite-banks")
      .then((payload) => {
        if (cancelled) return;
        const fromServer = payload.bankIds;
        favSkipNextSave.current = true;
        if (fromServer && fromServer.length > 0) {
          const valid = new Set(BANKS.map((b) => b.id));
          setFavBanks(sanitizeAepsFavIds(fromServer, valid));
        }
        favHydrated.current = true;
      })
      .catch(() => {
        favHydrated.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!favHydrated.current) return;
    if (favSkipNextSave.current) {
      favSkipNextSave.current = false;
      return;
    }
    if (favSaveTimer.current) clearTimeout(favSaveTimer.current);
    favSaveTimer.current = setTimeout(() => {
      void api.put("/auth/aeps-favourite-banks", { bankIds: favBanks }).catch(() => {
        /* non-fatal */
      });
    }, 400);
    return () => {
      if (favSaveTimer.current) clearTimeout(favSaveTimer.current);
    };
  }, [favBanks]);

  const showAmount = tab === "Withdraw" || tab === "Deposit" || tab === "Aadhaar Pay";
  const isAadhaarPay = tab === "Aadhaar Pay";

  const loadApSession = useCallback(async () => {
    setApLoading(true);
    setApError(null);
    try {
      const { data } = await api.post<ApiResponse<AadhaarPaySession>>("/onboarding/noble/ap/load", {});
      if (!data.success) throw new Error(data.message);
      setApSession(data.data);
    } catch (err) {
      setApError(apiError(err, "Could not load Aadhaar Pay status. Tap Retry."));
    } finally {
      setApLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAadhaarPay || agentAuthReady !== true) return;
    if (apSession || apLoading || apError) return;
    void loadApSession();
  }, [isAadhaarPay, agentAuthReady, apSession, apLoading, apError, loadApSession]);

  const apNeedsSetup = Boolean(apSession && (apSession.kycRequired || apSession.daily2faRequired));

  useEffect(() => {
    apAttemptKey.current.clear();
  }, [selectedBank?.id, aadhaar, mobile]);

  // Fetch the provider bank directory once; override our static IINs with live ones by name.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<ApiResponse<{ data?: { banks?: AepsBankRow[] } }>>("/txn/aeps/banks");
        const rows = data.data?.data?.banks ?? [];
        if (cancelled || rows.length === 0) return;
        const map: Record<string, string> = {};
        for (const r of rows) {
          if (r.iin) map[bankKey(r.name)] = r.iin;
        }
        setLiveIinByName(map);
      } catch {
        // Non-fatal — fall back to static IINs.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedBanks = useMemo(
    () => BANKS.map((b) => ({ ...b, iin: liveIinByName[bankKey(b.name)] ?? b.iin })),
    [liveIinByName],
  );

  const stripBanks = useMemo(() => {
    const byId = new Map(resolvedBanks.map((b) => [b.id, b]));
    const favs = favBanks
      .map((id) => byId.get(id))
      .filter((b): b is (typeof resolvedBanks)[number] => Boolean(b));
    const base =
      favs.length > 0
        ? favs
        : resolvedBanks.slice(0, Math.max(8, resolvedBanks.length));

    if (!selectedBank) return base;
    if (base.some((b) => b.id === selectedBank.id)) return base;

    const slot = Math.min(selectedInsertAt % 4, base.length);
    return [...base.slice(0, slot), selectedBank, ...base.slice(slot)];
  }, [favBanks, resolvedBanks, selectedBank, selectedInsertAt]);

  const selectBank = useCallback(
    (bank: Bank, fromViewAll: boolean) => {
      const byId = new Map(resolvedBanks.map((b) => [b.id, b]));
      const favs = favBanks
        .map((id) => byId.get(id))
        .filter((b): b is (typeof resolvedBanks)[number] => Boolean(b));
      const base = favs.length > 0 ? favs : resolvedBanks;
      const already = base.some((b) => b.id === bank.id);
      if (fromViewAll && !already) {
        setSelectedInsertAt(insertSlot);
        setInsertSlot((s) => (s + 1) % 4);
      }
      // One scroll after layout/modal — avoid stacked animated scrolls
      bankScrollDelayMs.current = fromViewAll ? 320 : 40;
      setSelectedBank(bank);
    },
    [favBanks, resolvedBanks, insertSlot],
  );

  useEffect(() => {
    if (!selectedBank) return;
    const idx = stripBanks.findIndex((b) => b.id === selectedBank.id);
    if (idx < 0) return;

    const itemLeft = idx * BANK_STRIDE;
    const itemRight = itemLeft + BANK_ITEM_W;
    const viewW = Math.max(bankViewportW.current, 1);
    const viewLeft = bankScrollX.current;

    let target: number | null = null;
    if (itemLeft < viewLeft) {
      target = Math.max(0, itemLeft);
    } else if (itemRight > viewLeft + viewW) {
      target = Math.max(0, itemRight - viewW);
    }
    if (target === null) return;
    if (Math.abs(target - viewLeft) < 2) return;

    const delay = bankScrollDelayMs.current;
    bankScrollDelayMs.current = 40;
    const t = setTimeout(() => {
      bankScrollRef.current?.scrollTo({ x: target!, animated: true });
      bankScrollX.current = target!;
    }, delay);
    return () => clearTimeout(t);
  }, [selectedBank?.id, selectedInsertAt, stripBanks]);

  function formatAadhaar(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 12);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  }

  // Mask for display overlay only — never put "X" into TextInput (Android opens QWERTY for letters).
  function maskAadhaarDisplay(v: string) {
    const digits = v.replace(/\D/g, "");
    if (digits.length <= 4) return digits;
    return `XXXX XXXX ${digits.slice(-4)}`;
  }

  const showAadhaarPlain = aadhaarFocused || aadhaarVisible;
  const aadhaarInputRef = useRef<TextInput>(null);

  const canScan =
    !!selectedBank &&
    aadhaar.length >= 8 &&
    mobile.length === 10 &&
    consent &&
    (!showAmount || !!amount) &&
    !scanning &&
    !submitting;

  async function verifyDailyAgentAuth() {
    if (!agentAuthConsent || agentAuthScanning || !agentAuthKycReady) return;
    const digits = agentAadhaar.replace(/\D/g, "");
    if (!agentAadhaarFromKyc && digits.length !== 12) return;
    setAgentAuthScanning(true);
    try {
      const detected = await detectConnectedDevice();
      const device = detected ?? activeDevice;
      if (detected) setActiveDevice(detected);

      const biometricPayload = await captureFingerprint(device.rdPackage);
      const body: { biometricPayload: string; aadhaarNumber?: string } = { biometricPayload };
      if (digits.length === 12) body.aadhaarNumber = digits;
      const { data } = await api.post<ApiResponse<{ verifiedAt: string }>>("/auth/agent-auth", body);
      if (!data.success) throw new Error(data.message);
      setAgentAuthReady(true);
    } catch (err) {
      Alert.alert("Daily verification failed", apiError(err, "Fingerprint verification failed."));
    } finally {
      setAgentAuthScanning(false);
    }
  }

  const needsTxnOtp = tab === "Withdraw" && Number(amount || 0) > 5000;
  const otpRequested = otpRef !== null && otpRef.amount === amount;

  // Aadhaar Pay OTP: only for MT at or above the provider's amountForOtp, never for Airtel.
  const needsApOtp =
    isAadhaarPay &&
    !!apSession &&
    apSession.amountForOtp != null &&
    (apSession.tranTypeForOtp ?? "").toUpperCase() === "MT" &&
    !!selectedBank &&
    selectedBank.iin !== AIRTEL_BANK_IIN &&
    Number(amount || 0) >= apSession.amountForOtp;
  const apOtpFresh =
    apOtp !== null && !!selectedBank && apOtp.amount === amount && apOtp.bankIin === selectedBank.iin;
  const useApOtp = needsApOtp && apOtpFresh && apOtp !== null && apOtp.required;
  const showOtpField = needsTxnOtp || (needsApOtp && !(apOtpFresh && apOtp !== null && !apOtp.required));
  const otpSent = needsTxnOtp ? otpRequested : apOtpFresh;

  function updateAmount(v: string) {
    setAmount(v.replace(/\D/g, ""));
    // Amount changed → old OTP/referenceKey is no longer valid for this txn.
    setOtpRef(null);
    setApOtp(null);
    setTxnOtp("");
    apAttemptKey.current.clear();
  }

  async function requestApOtp() {
    if (!selectedBank || submitting) return;
    setSubmitting(true);
    try {
      const geo = await getAepsGeoTag();
      const { data } = await api.post<
        ApiResponse<{ otpRequired: boolean; otpReference: string; otpTransactionId: string; otpTransactionToken: string }>
      >("/txn/aeps/aadhaar-pay/otp", {
        aadhaarNumber: aadhaar,
        bankIin: selectedBank.iin,
        mobile,
        amount,
        ...(geo ?? {}),
      });
      if (!data.success) throw new Error(data.message);
      setApOtp({
        amount,
        bankIin: selectedBank.iin,
        required: data.data.otpRequired,
        otpReference: data.data.otpReference,
        otpTransactionId: data.data.otpTransactionId,
        otpTransactionToken: data.data.otpTransactionToken,
      });
      setTxnOtp("");
      Alert.alert(
        data.data.otpRequired ? "OTP Sent" : "No OTP needed",
        data.data.otpRequired
          ? "An OTP was sent to the customer's mobile. Enter it, then tap Scan Finger."
          : "This payment does not need an OTP. Tap Scan Finger to continue.",
      );
    } catch (err) {
      Alert.alert("OTP request failed", apiError(err, "Could not send the Aadhaar Pay OTP. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function runApSetupScan() {
    if (!apSession || apScanning) return;
    const isKyc = apSession.kycRequired;
    setApScanning(true);
    try {
      const detected = await detectConnectedDevice();
      const device = detected ?? activeDevice;
      if (detected) setActiveDevice(detected);
      const geoPromise = getAepsGeoTag();
      const biometricPayload = await captureFingerprint(
        device.rdPackage,
        isKyc && apSession.kycWadhValue ? { wadh: apSession.kycWadhValue } : undefined,
      );
      const geo = await geoPromise;
      const { data } = await api.post<ApiResponse<unknown>>(
        isKyc ? "/onboarding/noble/ap/kyc" : "/onboarding/noble/ap/2fa",
        {
          biometricPayload,
          ...(geo ? { latitude: geo.latitude, longitude: geo.longitude } : {}),
        },
      );
      if (!data.success) throw new Error(data.message);
      Alert.alert(
        isKyc ? "Aadhaar Pay KYC completed" : "Aadhaar Pay unlocked",
        isKyc ? "One more fingerprint unlocks Aadhaar Pay for today." : "You can take Aadhaar Pay payments today.",
      );
      await loadApSession();
    } catch (err) {
      Alert.alert(
        isKyc ? "Aadhaar Pay KYC failed" : "Aadhaar Pay verification failed",
        apiError(err, "Fingerprint verification failed. Try again."),
      );
    } finally {
      setApScanning(false);
    }
  }

  async function requestWithdrawOtp() {
    if (!selectedBank || submitting) return;
    setSubmitting(true);
    try {
      const geo = await getAepsGeoTag();
      const { data } = await api.post<ApiResponse<{ data?: { referenceKey?: string } }>>(
        "/txn/aeps/withdraw/otp",
        {
          aadhaarNumber: aadhaar,
          bankIin: selectedBank.iin,
          mobile,
          amount,
          ...(geo ?? {}),
        },
      );
      const referenceKey = data.data?.data?.referenceKey;
      if (!data.success || !referenceKey) throw new Error(data.message || "OTP request failed");
      setOtpRef({ referenceKey, amount });
      setTxnOtp("");
      Alert.alert("OTP Sent", "An OTP was sent to the customer's mobile. Enter it, then tap Scan Finger.");
    } catch (err) {
      Alert.alert("OTP request failed", apiError(err, "Please try again"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleScan() {
    if (!canScan || !selectedBank) return;

    // High-value withdrawal: OTP must be requested first and typed before the finger scan,
    // because the RD service embeds it inside the PID block.
    if (needsTxnOtp) {
      if (!otpRequested) {
        await requestWithdrawOtp();
        return;
      }
      if (txnOtp.replace(/\D/g, "").length < 4) {
        Alert.alert("OTP required", "Enter the OTP the customer received (₹5,000+ withdrawal).");
        return;
      }
    }

    if (isAadhaarPay) {
      if (aadhaar.length !== 12) {
        Alert.alert("Aadhaar required", "Enter the customer's 12-digit Aadhaar number");
        return;
      }
      if (!Number(amount) || Number(amount) <= 0) {
        Alert.alert("Amount required", "Enter an amount greater than ₹0");
        return;
      }
      if (!apSession) {
        Alert.alert("Aadhaar Pay", apError ?? "Checking Aadhaar Pay status — wait a moment");
        return;
      }
      if (apNeedsSetup) {
        Alert.alert("Activate Aadhaar Pay", "Complete Aadhaar Pay activation above before taking a payment");
        return;
      }
      if (needsApOtp) {
        if (!apOtpFresh) {
          await requestApOtp();
          return;
        }
        if (useApOtp && txnOtp.replace(/\D/g, "").length < 4) {
          Alert.alert("OTP required", "Enter the OTP the customer received (4–8 digits)");
          return;
        }
      }
    }

    setScanning(true);
    // Kicked off alongside the fingerprint capture (not after) so the ~5s location timeout
    // overlaps with the capture instead of adding to it. Never blocks the transaction — see
    // getAepsGeoTag's contract.
    const geoPromise = getAepsGeoTag();
    let pidData: string;
    try {
      pidData = await captureFingerprint(
        activeDevice.rdPackage,
        needsTxnOtp || useApOtp ? txnOtp : undefined,
      );
    } catch (err) {
      setScanning(false);
      const detail = err instanceof Error ? err.message : "Unknown error";
      const lines = detail.split("\n");
      const short =
        lines.length > 8 ? `${lines.slice(0, 6).join("\n")}\n… (${lines.length - 6} more lines)` : detail;
      Alert.alert("Capture failed", short);
      return;
    }
    setScanning(false);

    try {
      if (tab === "Withdraw" || tab === "Deposit") {
        let txnAuth: string;
        try {
          txnAuth = await promptPin();
        } catch {
          return;
        }
        setSubmitting(true);
        const isDeposit = tab === "Deposit";
        const idempotencyKey = withdrawAttemptKey.current.get();
        const geo = await geoPromise;
        const { data } = await api.post<ApiResponse<{ txn: { txnRef: string; status: string } }>>(
          isDeposit ? "/txn/aeps/deposit" : "/txn/aeps/withdraw",
          {
            idempotencyKey,
            txnAuth,
            aadhaarNumber: aadhaar,
            bankIin: selectedBank.iin,
            mobile,
            biometricPayload: pidData,
            amount,
            ...(needsTxnOtp && otpRef ? { otpReferenceKey: otpRef.referenceKey } : {}),
            ...(geo ?? {}),
          },
        );
        if (!data.success) throw new Error(data.message);
        withdrawAttemptKey.current.clear();
        Alert.alert(
          isDeposit ? "Deposit Successful" : "Withdrawal Successful",
          `${formatINR(amount)} — Ref: ${data.data.txn?.txnRef ?? idempotencyKey}`,
        );
        setAmount("");
        setOtpRef(null);
        setTxnOtp("");
      } else if (isAadhaarPay) {
        let txnAuth: string;
        try {
          txnAuth = await promptPin();
        } catch {
          return;
        }
        setSubmitting(true);
        const idempotencyKey = apAttemptKey.current.get();
        const geo = await geoPromise;
        const { data } = await api.post<ApiResponse<{ txn: { txnRef: string; status: string } }>>(
          "/txn/aeps/aadhaar-pay",
          {
            idempotencyKey,
            txnAuth,
            aadhaarNumber: aadhaar,
            bankIin: selectedBank.iin,
            mobile,
            biometricPayload: pidData,
            amount,
            ...(useApOtp && apOtp
              ? {
                  otpReferenceKey: apOtp.otpReference,
                  otpTransactionId: apOtp.otpTransactionId,
                  otpTransactionToken: apOtp.otpTransactionToken,
                }
              : {}),
            ...(geo ?? {}),
          },
        );
        if (!data.success) throw new Error(data.message);
        apAttemptKey.current.clear();
        const ref = data.data.txn?.txnRef ?? idempotencyKey;
        if ((data.data.txn?.status ?? "").toLowerCase() === "pending") {
          Alert.alert(
            "Aadhaar Pay Pending",
            `${formatINR(amount)} — Ref: ${ref}\nCheck Transactions for the final status.`,
          );
        } else {
          Alert.alert("Aadhaar Pay Successful", `${formatINR(amount)} — Ref: ${ref}`);
        }
        setAmount("");
        setApOtp(null);
        setTxnOtp("");
      } else if (tab === "Balance Enquiry" || tab === "Mini Statement") {
        setSubmitting(true);
        const isMini = tab === "Mini Statement";
        const path = isMini ? "/txn/aeps/mini-statement" : "/txn/aeps/balance-enquiry";
        const geo = await geoPromise;
        const { data } = await api.post<
          ApiResponse<{
            data?: {
              balance?: string;
              statement?: { date: string; narration: string; amount: string; type: "credit" | "debit" }[];
            };
          }>
        >(path, {
          aadhaarNumber: aadhaar,
          bankIin: selectedBank.iin,
          mobile,
          biometricPayload: pidData,
          ...(geo ?? {}),
        });
        if (!data.success) throw new Error(data.message);
        if (isMini) {
          const rows = data.data?.data?.statement ?? [];
          const body = rows.length
            ? rows
                .map(
                  (r) =>
                    `${r.date}  ${r.type === "credit" ? "+" : "-"}${formatINR(r.amount)}\n${r.narration}`,
                )
                .join("\n\n")
            : "No recent transactions found.";
          Alert.alert("Mini Statement", body);
        } else {
          const balance = data.data?.data?.balance;
          Alert.alert(tab, balance ? `Available balance: ${formatINR(balance)}` : "Request completed successfully.");
        }
      } else {
        Alert.alert("Coming soon", `${tab} is not available yet.`);
      }
    } catch (err) {
      if (err) {
        const title =
          tab === "Withdraw"
            ? "Withdrawal failed"
            : tab === "Deposit"
              ? "Deposit failed"
              : tab === "Aadhaar Pay"
                ? "Aadhaar Pay failed"
                : "Request failed";
        Alert.alert(title, apiError(err, "Please try again"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const scanTranslate = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [-38, 38] });

  if (agentAuthReady === null) {
    return (
      <SafeAreaView style={[s.safe, s.authLoading, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color={colors.blueFlat} />
        <Text style={[s.authLoadingText, { color: tokens.sub }]}>Checking today's AePS verification…</Text>
      </SafeAreaView>
    );
  }

  if (!agentAuthReady) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <LinearGradient
          colors={[colors.blueLight, colors.blue]}
          start={gradientDirection.diagonal.start}
          end={gradientDirection.diagonal.end}
          style={s.header}
        >
          <Pressable onPress={onBack} style={s.backBtn}>
            <ArrowLeft size={18} color="#fff" strokeWidth={2.4} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Mandatory 2FA for AePS Access</Text>
            <Text style={s.headerSub}>Verify once daily before your first AePS or Aadhaar Pay transaction.</Text>
          </View>
        </LinearGradient>

        <ScrollView contentContainerStyle={s.dailyAuthContent} showsVerticalScrollIndicator={false}>
          <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Text style={[s.dailyAuthTitle, { color: tokens.txt }]}>Daily retailer verification</Text>
            <Text style={[s.dailyAuthCopy, { color: tokens.sub }]}>
              Your registered KYC Aadhaar will be matched through the selected UIDAI L1 RD service.
            </Text>

            <Text style={[s.fieldLabel, s.fieldLabelSpaced, { color: tokens.sub }]}>
              {`AADHAAR NUMBER OF ${userName.toUpperCase()}`}
            </Text>
            <View style={[s.inputRow, { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg }]}>
              {agentAadhaar.length === 12 || (agentAadhaarFromKyc && agentAadhaarLastFour) ? (
                <>
                  {/* Text (not TextInput) — same as web mask; Android TextInput often blanked autofill */}
                  <Text style={[s.dailyAadhaar, { color: tokens.txt, flex: 1 }]}>
                    {agentAadhaar.length === 12
                      ? agentAadhaarVisible
                        ? formatAadhaar(agentAadhaar)
                        : maskAadhaarDisplay(agentAadhaar)
                      : `XXXX XXXX ${agentAadhaarLastFour}`}
                  </Text>
                  {agentAadhaar.length === 12 ? (
                    <Pressable onPress={() => setAgentAadhaarVisible((v) => !v)} hitSlop={10}>
                      {agentAadhaarVisible ? (
                        <EyeOff size={18} color={tokens.mute} />
                      ) : (
                        <Eye size={18} color={tokens.mute} />
                      )}
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <TextInput
                  value={formatAadhaar(agentAadhaar)}
                  onChangeText={(value) => setAgentAadhaar(value.replace(/\D/g, "").slice(0, 12))}
                  placeholder={
                    agentAuthKycReady ? "Enter 12-digit Aadhaar" : "KYC Aadhaar not found"
                  }
                  placeholderTextColor={tokens.mute}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={14}
                  editable={agentAuthKycReady && !agentAuthScanning}
                  style={[s.dailyAadhaar, { color: tokens.txt, flex: 1 }]}
                />
              )}
            </View>
            {agentAadhaarFromKyc ? (
              <Text style={{ marginTop: 6, fontSize: 11, color: tokens.mute }}>
                Auto-filled from Aadhaar saved at retailer signup
              </Text>
            ) : null}

            <Pressable onPress={() => setAgentAuthConsent((v) => !v)} style={s.consentRow}>
              <View style={[s.checkbox, agentAuthConsent && s.checkboxChecked]}>
                {agentAuthConsent ? <Text style={s.checkmark}>✓</Text> : null}
              </View>
              <Text style={[s.consentText, { color: tokens.txt2 }]}>
                I consent to Aadhaar biometric authentication for today's AePS access.
              </Text>
            </Pressable>

            <View style={[s.dailyModeCard, { borderColor: tokens.cardBorder }]}>
              <Text style={[s.fieldLabel, { color: tokens.sub }]}>AUTHENTICATION MODE</Text>
              <View style={s.dailyModeRow}>
                <View style={s.dailyModeSelected}>
                  <Fingerprint size={34} color={colors.blueFlat} />
                  <Text style={[s.authModeText, { color: colors.blue }]}>Fingerprint</Text>
                  <CircleDot size={15} color={colors.green} />
                </View>
                <View style={s.dailyModeDisabled}>
                  <ScanEye size={34} color={tokens.mute} />
                  <Text style={[s.authModeText, { color: tokens.mute }]}>Eye Scan</Text>
                  <Text style={[s.dailySoon, { color: tokens.mute }]}>Coming soon</Text>
                </View>
              </View>
            </View>

            <View style={s.dailyDeviceRow}>
              <View style={[s.bioIconCircle, { backgroundColor: activeDevice.color }]}>
                <Text style={s.bioIconLetter}>{activeDevice.letter}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.bioDevice, { color: tokens.txt }]}>{activeDevice.name}</Text>
                <Pressable onPress={() => setDeviceModalOpen(true)}>
                  <Text style={[s.bioChange, { color: colors.blueLight }]}>Change Device</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={() => void verifyDailyAgentAuth()}
              disabled={
                !agentAuthConsent ||
                !agentAuthKycReady ||
                (!agentAadhaarFromKyc && agentAadhaar.length !== 12) ||
                agentAuthScanning
              }
              style={[
                s.scanBtn,
                (!agentAuthConsent ||
                  !agentAuthKycReady ||
                  (!agentAadhaarFromKyc && agentAadhaar.length !== 12) ||
                  agentAuthScanning) &&
                  s.scanBtnDisabled,
              ]}
            >
              <LinearGradient
                colors={[colors.greenLight, colors.greenDark]}
                start={gradientDirection.diagonal.start}
                end={gradientDirection.diagonal.end}
                style={s.scanBtnGradient}
              >
                {agentAuthScanning ? <ActivityIndicator color="#fff" /> : <Fingerprint size={18} color="#fff" />}
                <Text style={s.scanBtnText}>
                  {agentAuthScanning ? "Place finger on scanner…" : "Scan Finger"}
                </Text>
              </LinearGradient>
            </Pressable>
            {allowAgentAuthUiSkip() ? (
              <>
                <Pressable
                  onPress={() => {
                    setAgentAuthReady(true);
                    Alert.alert(
                      "AePS UI unlocked (dev)",
                      "This session only. Real transactions still need fingerprint verification.",
                    );
                  }}
                  style={s.devSkipBtn}
                >
                  <Text style={s.devSkipBtnText}>Skip for now (dev)</Text>
                </Pressable>
                <Text style={s.devSkipHint}>
                  Dev only — money moves will still fail until Scan Finger succeeds.
                </Text>
              </>
            ) : null}
          </View>
        </ScrollView>

        <DeviceModal
          visible={deviceModalOpen}
          onClose={() => setDeviceModalOpen(false)}
          activeDeviceId={activeDevice.id}
          onSelect={setActiveDevice}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.blueLight, colors.blue]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={s.header}
      >
        <Pressable onPress={onBack} style={s.backBtn}>
          <ArrowLeft size={18} color="#fff" strokeWidth={2.4} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>AePS</Text>
          <Text style={s.headerSub}>Aadhaar Enabled Payment System</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Tabs — segmented pill track (matches web Layout 3) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabTrackWrap}
        >
          <View style={s.tabTrack}>
            {AEPS_TABS.map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[s.tabSeg, active && s.tabSegActive]}
                >
                  <Text style={[s.tabSegText, active && s.tabSegTextActive]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {isAadhaarPay && (apNeedsSetup || apError || (apLoading && !apSession)) ? (
          <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <View style={s.apHeader}>
              <View style={s.apHeaderIcon}>
                <Fingerprint size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.apHeaderTitle}>Activate Aadhaar Pay</Text>
                <Text style={s.apHeaderSub}>
                  Aadhaar Pay needs its own retailer fingerprint — KYC once, then one scan each day.
                </Text>
              </View>
            </View>

            {apLoading && !apSession ? (
              <View style={s.apLoadingRow}>
                <ActivityIndicator color={colors.blueFlat} />
                <Text style={[s.apStepText, { color: tokens.sub }]}>Checking Aadhaar Pay status…</Text>
              </View>
            ) : null}

            {apError ? (
              <View style={s.apErrorBox}>
                <Text style={s.apErrorText}>{apError}</Text>
                <Pressable onPress={() => void loadApSession()} style={s.apRetryBtn}>
                  <Text style={s.apRetryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {apSession ? (
              <>
                {[
                  { pending: apSession.kycRequired, n: "1", label: "One-time Aadhaar Pay KYC" },
                  { pending: apSession.daily2faRequired, n: "2", label: "Today's Aadhaar Pay fingerprint" },
                ].map((step) => (
                  <View key={step.n} style={s.apStepRow}>
                    {step.pending ? (
                      <View style={s.apStepNum}>
                        <Text style={s.apStepNumText}>{step.n}</Text>
                      </View>
                    ) : (
                      <CheckCircle2 size={20} color={colors.green} />
                    )}
                    <Text style={[s.apStepText, { color: step.pending ? tokens.txt : tokens.mute }]}>
                      {step.label}
                    </Text>
                  </View>
                ))}

                <View style={s.dailyDeviceRow}>
                  <View style={[s.bioIconCircle, { backgroundColor: activeDevice.color }]}>
                    <Text style={s.bioIconLetter}>{activeDevice.letter}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.bioDevice, { color: tokens.txt }]}>{activeDevice.name}</Text>
                    <Pressable onPress={() => setDeviceModalOpen(true)}>
                      <Text style={[s.bioChange, { color: colors.blueLight }]}>Change Device</Text>
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  onPress={() => void runApSetupScan()}
                  disabled={apScanning}
                  style={[s.scanBtn, apScanning && s.scanBtnDisabled]}
                >
                  <LinearGradient
                    colors={[colors.greenLight, colors.greenDark]}
                    start={gradientDirection.diagonal.start}
                    end={gradientDirection.diagonal.end}
                    style={s.scanBtnGradient}
                  >
                    {apScanning ? <ActivityIndicator color="#fff" /> : <Fingerprint size={18} color="#fff" />}
                    <Text style={s.scanBtnText}>
                      {apScanning
                        ? "Place finger on scanner…"
                        : apSession.kycRequired
                          ? "Scan Finger for Aadhaar Pay KYC"
                          : "Scan Finger to unlock Aadhaar Pay"}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}

        {/* Bank selector strip — Layout 3 style + spring select */}
        <View style={[s.bankCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          <View style={s.cardLabelRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.cardLabel, { color: tokens.sub, marginBottom: 0 }]}>SELECT BANK</Text>
            </View>
            <Pressable onPress={() => setBankModalOpen(true)} style={s.viewAllPill}>
              <Text style={s.viewAllText}>View All</Text>
              <ChevronRight size={14} color={colors.blueLight} />
            </Pressable>
          </View>

          <View style={s.bankStripWell}>
            <ScrollView
              ref={bankScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.bankStrip}
              onLayout={(e) => {
                bankViewportW.current = e.nativeEvent.layout.width;
              }}
              onScroll={(e) => {
                bankScrollX.current = e.nativeEvent.contentOffset.x;
              }}
              scrollEventThrottle={16}
            >
              {stripBanks.map((bank) => (
                <AnimatedBankChip
                  key={bank.id}
                  bank={bank}
                  active={selectedBank?.id === bank.id}
                  onPress={() => selectBank(bank, false)}
                  labelColor={tokens.txt2}
                />
              ))}
            </ScrollView>
          </View>

          {selectedBank ? (
            <View style={s.selectedBankGreenStrip}>
              <BankIcon bank={selectedBank} size={30} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.selectedBankGreenName} numberOfLines={1}>
                  {selectedBank.name}
                </Text>
                <Text style={s.selectedBankGreenHint}>Selected bank for this transaction</Text>
              </View>
              <View style={s.selectedBankGreenBadge}>
                <Text style={s.selectedBankGreenBadgeText}>Selected</Text>
              </View>
            </View>
          ) : (
            <View style={s.selectedBankStripEmpty}>
              <Text style={{ fontSize: 12, color: tokens.mute, fontWeight: "600" }}>
                Tap a bank above to select
              </Text>
            </View>
          )}
        </View>

        {/* Form fields */}
        <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          {/* Aadhaar — TextInput always digits-only so Android stays on number-pad */}
          <Text style={[s.fieldLabel, { color: tokens.sub }]}>AADHAAR / VID NUMBER</Text>
          <View style={[s.inputRow, { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg }]}>
            <View style={{ flex: 1, position: "relative", justifyContent: "center" }}>
              <TextInput
                ref={aadhaarInputRef}
                value={formatAadhaar(aadhaar)}
                onChangeText={(v) => setAadhaar(v.replace(/\D/g, "").slice(0, 12))}
                onFocus={() => setAadhaarFocused(true)}
                onBlur={() => setAadhaarFocused(false)}
                placeholder="XXXX XXXX XXXX"
                placeholderTextColor={tokens.mute}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={14}
                style={[
                  s.input,
                  { color: showAadhaarPlain ? tokens.txt : "transparent" },
                ]}
              />
              {!showAadhaarPlain && aadhaar.length > 0 && (
                <Pressable
                  style={StyleSheet.absoluteFillObject}
                  onPress={() => {
                    setAadhaarFocused(true);
                    aadhaarInputRef.current?.focus();
                  }}
                >
                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text style={[s.input, { color: tokens.txt }]}>
                      {maskAadhaarDisplay(aadhaar)}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => {
                setAadhaarVisible((v) => !v);
                // Keep number-pad — never remount as text field
                requestAnimationFrame(() => aadhaarInputRef.current?.focus());
              }}
              hitSlop={10}
            >
              {aadhaarVisible ? (
                <EyeOff size={18} color={tokens.mute} />
              ) : (
                <Eye size={18} color={tokens.mute} />
              )}
            </Pressable>
          </View>

          {/* Mobile */}
          <Text style={[s.fieldLabel, s.fieldLabelSpaced, { color: tokens.sub }]}>MOBILE NUMBER</Text>
          <View style={[s.inputRow, { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg }]}>
            <TextInput
              value={mobile}
              onChangeText={(v) => setMobile(v.replace(/\D/g, "").slice(0, 10))}
              placeholder="Mobile Number"
              placeholderTextColor={tokens.mute}
              keyboardType="phone-pad"
              maxLength={10}
              style={[s.input, { color: tokens.txt }]}
            />
          </View>

          {/* Amount (conditional) */}
          {showAmount && (
            <>
              <Text style={[s.fieldLabel, s.fieldLabelSpaced, { color: tokens.sub }]}>
                AMOUNT TO {tab.toUpperCase()}
              </Text>
              <View style={[s.inputRow, { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg }]}>
                <Text style={{ color: colors.blueFlat, fontWeight: "800", fontSize: 16, marginRight: 4 }}>₹</Text>
                <TextInput
                  value={amount}
                  onChangeText={updateAmount}
                  placeholder="Enter amount"
                  placeholderTextColor={tokens.mute}
                  keyboardType="number-pad"
                  style={[s.input, { color: tokens.txt }]}
                />
              </View>
              <View style={s.quickRow}>
                {QUICK_AMOUNTS.map((a) => {
                  const active = amount === String(a);
                  return (
                    <Pressable
                      key={a}
                      onPress={() => updateAmount(String(a))}
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

              {/* Customer OTP — ₹5,000+ withdrawal, or Aadhaar Pay at/above the provider limit */}
              {showOtpField && (
                <>
                  <Text style={[s.fieldLabel, s.fieldLabelSpaced, { color: tokens.sub }]}>
                    {needsTxnOtp ? "TRANSACTION OTP (₹5,000+ WITHDRAWAL)" : "CUSTOMER OTP (AADHAAR PAY)"}
                  </Text>
                  {otpSent ? (
                    <View style={[s.inputRow, { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg }]}>
                      <TextInput
                        value={txnOtp}
                        onChangeText={(v) => setTxnOtp(v.replace(/\D/g, "").slice(0, 8))}
                        placeholder="OTP received by customer"
                        placeholderTextColor={tokens.mute}
                        keyboardType="number-pad"
                        maxLength={8}
                        style={[s.input, { color: tokens.txt }]}
                      />
                      <Pressable
                        onPress={() => void (needsTxnOtp ? requestWithdrawOtp() : requestApOtp())}
                        disabled={submitting}
                      >
                        <Text style={{ color: colors.blueLight, fontWeight: "700", fontSize: 12 }}>Resend</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={{ color: tokens.mute, fontSize: 12, marginTop: 2 }}>
                      Tapping Scan Finger first sends an OTP to the customer's mobile.
                    </Text>
                  )}
                </>
              )}
            </>
          )}

          {/* Consent */}
          <Pressable onPress={() => setConsent((v) => !v)} style={s.consentRow}>
            <View style={[s.checkbox, consent && s.checkboxChecked]}>
              {consent && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={[s.consentText, { color: tokens.txt2 }]}>
              I (the customer) accept{" "}
              <Text style={{ color: colors.blueLight, fontWeight: "700" }}>Aadhaar Consent</Text>
              {" "}and have read the{" "}
              <Text style={{ color: colors.blueLight, fontWeight: "700" }}>AePS Advisory</Text>
            </Text>
          </Pressable>
        </View>

        {/* Authentication Mode */}
        <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          <Text style={[s.fieldLabel, { color: tokens.sub, marginBottom: 10 }]}>AUTHENTICATION MODE</Text>
          <View style={s.authModeRow}>
            <Pressable
              onPress={() => setAuthMode("fingerprint")}
              style={[
                s.authModeBtn,
                {
                  borderColor: authMode === "fingerprint" ? colors.blueLight : tokens.cardBorder,
                  backgroundColor: authMode === "fingerprint" ? colors.bluePale : tokens.card,
                },
              ]}
            >
              <Fingerprint size={20} color={authMode === "fingerprint" ? colors.blue : tokens.mute} />
              <Text style={[s.authModeText, { color: authMode === "fingerprint" ? colors.blue : tokens.txt2 }]}>
                Fingerprint
              </Text>
              {authMode === "fingerprint" && <CircleDot size={14} color={colors.green} />}
            </Pressable>
            <Pressable
              onPress={() => setAuthMode("iris")}
              style={[
                s.authModeBtn,
                {
                  borderColor: authMode === "iris" ? colors.blueLight : tokens.cardBorder,
                  backgroundColor: authMode === "iris" ? colors.bluePale : tokens.card,
                },
              ]}
            >
              <ScanEye size={20} color={authMode === "iris" ? colors.blue : tokens.mute} />
              <Text style={[s.authModeText, { color: authMode === "iris" ? colors.blue : tokens.txt2 }]}>
                Iris
              </Text>
              {authMode === "iris" && <CircleDot size={14} color={colors.green} />}
            </Pressable>
          </View>
        </View>

        {/* Biometric device + Scan */}
        <View style={[s.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          <View style={s.bioRow}>
            <View style={[s.bioIconCircle, { backgroundColor: activeDevice.color }]}>
              <Text style={s.bioIconLetter}>{activeDevice.letter}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.bioDevice, { color: tokens.txt }]}>{activeDevice.name}</Text>
              <Pressable onPress={() => setDeviceModalOpen(true)}>
                <Text style={[s.bioChange, { color: colors.blueLight }]}>Change Device</Text>
              </Pressable>
            </View>
          </View>

          {/* Scan area */}
          <View style={s.scanArea}>
            <View style={[s.scanCircle, { backgroundColor: colors.bluePale }]}>
              {authMode === "fingerprint" ? (
                <Fingerprint size={48} color={colors.blueFlat} strokeWidth={1.6} />
              ) : (
                <ScanEye size={48} color={colors.blueFlat} strokeWidth={1.6} />
              )}
              {scanning && (
                <Animated.View
                  style={[s.scanLine, { transform: [{ translateY: scanTranslate }] }]}
                />
              )}
            </View>
          </View>

          <Pressable
            onPress={handleScan}
            disabled={!canScan}
            style={({ pressed }) => [s.scanBtn, !canScan && s.scanBtnDisabled, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={canScan ? [colors.greenLight, colors.greenDark] : ["#94a3b8", "#94a3b8"]}
              start={gradientDirection.diagonal.start}
              end={gradientDirection.diagonal.end}
              style={s.scanBtnGradient}
            >
              {authMode === "fingerprint" ? (
                <Fingerprint size={18} color="#fff" strokeWidth={2.4} />
              ) : (
                <ScanEye size={18} color="#fff" strokeWidth={2.4} />
              )}
              <Text style={s.scanBtnText}>
                {scanning
                  ? "Place finger on scanner..."
                  : submitting
                    ? "Processing..."
                    : authMode === "fingerprint"
                      ? "Scan Finger"
                      : "Scan Iris"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Commission info card */}
        <View style={[s.card, { backgroundColor: `${colors.green}0C`, borderColor: `${colors.green}30` }]}>
          <Text style={[s.commTitle, { color: colors.greenDark }]}>Commission Info</Text>
          {[
            { label: "Cash Withdraw", value: "Upto ₹3.50" },
            { label: "Balance Enquiry", value: "₹1.00" },
            { label: "Mini Statement", value: "₹1.00" },
            { label: "Aadhaar Pay", value: "₹2.00" },
          ].map((r) => (
            <View key={r.label} style={s.commRow}>
              <Text style={[s.commLabel, { color: tokens.txt2 }]}>{r.label}</Text>
              <Text style={[s.commValue, { color: colors.greenDark }]}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* Warning */}
        <View style={[s.card, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
          <Text style={s.warningText}>
            ⚠️ Ensure biometric device is connected before scanning. Customer must be physically present for Aadhaar authentication.
          </Text>
        </View>
      </ScrollView>

      <TxnPinPrompt />

      {/* Bank modal */}
      <BankModal
        visible={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        onSelect={(bank) => selectBank(bank, true)}
        favouriteIds={favBanks}
        onToggleFav={toggleFavBank}
        banks={resolvedBanks}
      />

      <DeviceModal
        visible={deviceModalOpen}
        onClose={() => setDeviceModalOpen(false)}
        activeDeviceId={activeDevice.id}
        onSelect={setActiveDevice}
      />

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  authLoading: { alignItems: "center", justifyContent: "center", gap: 12 },
  authLoadingText: { fontSize: 13, fontWeight: "600" },
  dailyAuthContent: { padding: 16, paddingBottom: 40 },
  dailyAuthTitle: { fontSize: 20, fontWeight: "800" },
  dailyAuthCopy: { fontSize: 12.5, lineHeight: 19, marginTop: 5 },
  dailyAadhaar: { flex: 1, fontSize: 15, fontWeight: "700" },
  dailyModeCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 20 },
  dailyModeRow: { flexDirection: "row", marginTop: 14 },
  dailyModeSelected: { flex: 1, alignItems: "center", gap: 6 },
  dailyModeDisabled: { flex: 1, alignItems: "center", gap: 6, opacity: 0.65 },
  dailySoon: { fontSize: 9, fontWeight: "700" },
  dailyDeviceRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 18 },
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

  // Tabs
  tabRow: { gap: 8, paddingBottom: 6, marginBottom: 14 },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  tabText: { fontSize: 13, fontWeight: "700", color: "#6b7280" },
  tabTextActive: { color: "#fff" },
  tabTrackWrap: { paddingBottom: 12, paddingRight: 4 },
  tabTrack: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8EEF8",
    borderRadius: 999,
    padding: 4,
    gap: 2,
  },
  tabSeg: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  tabSegActive: {
    backgroundColor: "#fff",
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabSegText: { fontSize: 12.5, fontWeight: "700", color: colors.blueLight },
  tabSegTextActive: { fontWeight: "800", color: colors.blue },

  // Card
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  cardLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 10 },
  cardLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  bankCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  viewAllPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  bankStripWell: {
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  // Bank strip — width + gap must match scroll centering math
  bankStrip: { gap: 8, alignItems: "flex-start", paddingBottom: 2, paddingRight: 4 },
  bankItemWrap: { alignItems: "center", width: 72 },
  bankItem: {
    alignItems: "center",
    width: 68,
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 2,
    borderRadius: 16,
  },
  bankItemActive: {
    backgroundColor: "#fff",
    shadowColor: "#2A5CDD",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bankIconWrap: { position: "relative" },
  bankRing: {
    borderRadius: 999,
    padding: 2,
  },
  bankRingActive: {
    borderWidth: 3,
    borderColor: colors.blue,
    padding: 0,
  },
  bankCheckBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  bankShort: { fontSize: 10, fontWeight: "600", textAlign: "center", marginTop: 6 },
  bankShortActive: { fontWeight: "800" },
  bankCaretSlot: {
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
  },
  selectedBankStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedBankStripEmpty: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  selectedBankName: { fontWeight: "800", fontSize: 13 },
  selectedBankHint: { fontSize: 10, color: "#64748B", marginTop: 1, fontWeight: "500" },
  selectedBankGreenStrip: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#6EE7B7",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  selectedBankGreenName: { fontWeight: "800", fontSize: 13.5, color: "#065F46" },
  selectedBankGreenHint: { fontSize: 11, fontWeight: "600", color: "#047857", marginTop: 1 },
  selectedBankGreenBadge: {
    borderRadius: 999,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectedBankGreenBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#065F46",
    textTransform: "uppercase",
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 2,
    flexShrink: 0,
  },
  viewAllText: { fontSize: 12, fontWeight: "800", color: colors.blueLight },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  fieldLabelSpaced: { marginTop: 16 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    marginTop: 6,
  },
  input: { flex: 1, fontSize: 15, fontWeight: "600", paddingVertical: 0 },

  // Quick amounts
  quickRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  quickChip: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  quickChipText: { fontWeight: "700", fontSize: 12.5 },

  // Consent
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 18 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.blue, borderColor: colors.blue },
  checkmark: { color: "#fff", fontSize: 12, fontWeight: "800" },
  consentText: { flex: 1, fontSize: 12, lineHeight: 18 },

  // Auth mode
  authModeRow: { flexDirection: "row", gap: 10 },
  authModeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
  },
  authModeText: { fontWeight: "700", fontSize: 13 },

  // Biometric
  bioRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bioIconCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  bioIconLetter: { color: "#fff", fontWeight: "800", fontSize: 16 },
  bioDevice: { fontWeight: "700", fontSize: 14 },
  bioChange: { fontSize: 12, fontWeight: "700", marginTop: 1 },
  scanArea: { alignItems: "center", paddingVertical: 20 },
  scanCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#C9D8FA",
  },
  scanLine: { position: "absolute", left: 0, right: 0, height: 4, backgroundColor: colors.green },
  scanBtn: { borderRadius: 16, overflow: "hidden" },
  scanBtnDisabled: { opacity: 0.55 },
  scanBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
  },
  scanBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  devSkipBtn: {
    marginTop: 10,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#B9C6F2",
    alignItems: "center",
    justifyContent: "center",
  },
  devSkipBtnText: { color: colors.blueFlat, fontWeight: "700", fontSize: 14 },
  devSkipHint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "600",
    color: "#B45309",
    textAlign: "center",
    lineHeight: 16,
  },

  // Aadhaar Pay activation
  apHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    backgroundColor: colors.blue,
  },
  apHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  apHeaderTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  apHeaderSub: { color: "rgba(255,255,255,0.78)", fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  apLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  apErrorBox: {
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  apErrorText: { color: "#991B1B", fontSize: 12.5, fontWeight: "600", lineHeight: 18 },
  apRetryBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.blue,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  apRetryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  apStepRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
  apStepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.bluePale,
    alignItems: "center",
    justifyContent: "center",
  },
  apStepNumText: { fontSize: 11, fontWeight: "800", color: colors.blue },
  apStepText: { fontSize: 13, fontWeight: "600" },

  // Commission
  commTitle: { fontWeight: "800", fontSize: 14, marginBottom: 10 },
  commRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  commLabel: { fontSize: 12.5, fontWeight: "500" },
  commValue: { fontSize: 12.5, fontWeight: "700" },

  // Warning
  warningText: { fontSize: 12, fontWeight: "600", color: "#92400E", lineHeight: 18 },
});
