import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import Clipboard from "@react-native-clipboard/clipboard";
// The monorepo hoists a single node_modules with multiple React copies (web uses 19, this app
// uses 18); react-native-qrcode-svg's class-component types resolve against the wrong React
// namespace as a result, so TS sees an invalid JSX component even though it renders fine.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import RawQRCode from "react-native-qrcode-svg";
const QRCode = RawQRCode as unknown as React.ComponentType<{ value: string; size: number }>;
import {
  ArrowLeft,
  Building2,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  HelpCircle,
  Hourglass,
  Image as ImageIcon,
  Info,
  Landmark,
  Plus,
  Search,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import { PartnerTopBar } from "../../components/PartnerTopBar";
import { LabelText } from "../../components/RequiredMark";
import { DateRangeFields, toYmd } from "../../components/DateRangeCard";
import { api, fetchApi } from "../../lib/api";
import { formatSettlementBankCopy } from "../../lib/bankLogo";
import { formatINR } from "../../lib/format";
import { showAlert } from "../../components/AppAlert";
import { BankDetailCard } from "../../components/BankDetailCard";
import { BankAccountViewSheet, type BankViewDetails } from "../../components/BankAccountViewSheet";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore } from "../../store/auth";
import { isFundRequestEnabled, type ApiResponse, type AuthUser } from "@asanpay/shared-types";
import { colors } from "../../theme/colors";

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber?: string | null;
  accountNumberLast4: string;
  ifsc: string;
  isActive: boolean;
  holderName?: string | null;
  accountType?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  city?: string | null;
}

interface MyVan {
  id: string;
  vanNumber: string | null;
  vpa: string | null;
  status: string;
  bankAccountId: string;
  bankName: string;
  ifsc: string;
}

const AMOUNT_PRESETS = ["500", "1000", "2000", "5000"];

function newIdemKey() {
  return `fr-mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 100);
}

type Step = "home" | "upi" | "bank" | "cashSelect" | "confirm" | "history";

interface FundRequestRow {
  id: string;
  amount: string;
  paymentMode: string;
  referenceNumber: string | null;
  status: string;
  displayStatus: string;
  submittedAt: string;
  creditedAmount: string | null;
}

function statusTone(status: string, display: string): { bg: string; fg: string; border: string } {
  const s = `${status} ${display}`.toLowerCase();
  if (s.includes("credit") || s.includes("approved") || s.includes("success")) {
    return { bg: "#F0FDF4", fg: "#15803D", border: "#86EFAC" };
  }
  if (s.includes("reject") || s.includes("fail") || s.includes("cancel") || s.includes("void") || s.includes("revers")) {
    return { bg: "#FEF2F2", fg: "#B91C1C", border: "#FECACA" };
  }
  if (s.includes("pending") || s.includes("review") || s.includes("submit") || s.includes("verif")) {
    return { bg: "#FFF7ED", fg: "#C2410C", border: "#FDBA74" };
  }
  return { bg: "#EEF2FF", fg: colors.blueFlat, border: "#C7D2FE" };
}
type ConfirmMode = "upi" | "neft" | "cash_deposit";

interface ConfirmPrefill {
  mode: ConfirmMode;
  bankAccountId?: string;
  headline: string;
  subtext: string;
}

export function FundRequestModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [step, setStep] = useState<Step>("home");
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [myVan, setMyVan] = useState<MyVan | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmPrefill, setConfirmPrefill] = useState<ConfirmPrefill | null>(null);

  const user = useAuthStore((s) => s.user);
  const enabled = user ? isFundRequestEnabled(user.role, user.fundRequestEnabled) : false;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api
        .get<ApiResponse<{ user: AuthUser }>>("/auth/me")
        .then(({ data }) => (data.success ? data.data.user : null))
        .catch(() => null);
      if (me) useAuthStore.getState().updateUser(me);
      const [bankRows, vanRows, wallets] = await Promise.all([
        fetchApi<BankAccount[]>("/banking/accounts", { purpose: "collection" }),
        fetchApi<MyVan[]>("/banking/van/mine").catch(() => []),
        fetchApi<{ walletType: string; balance: string }[]>("/wallet/me").catch(() => []),
      ]);
      setBanks(bankRows);
      setMyVan(vanRows[0] ?? null);
      const main = wallets.find((w) => w.walletType === "main");
      setWalletBalance(main?.balance ?? null);
    } catch (err) {
      showAlert("Error", (err as Error).message || "Failed to load Add Money details");
    } finally {
      setLoading(false);
    }
  }, []);

  const isPartner = user?.role === "super_distributor" || user?.role === "distributor";
  const cashPrefill: ConfirmPrefill = {
    mode: "cash_deposit",
    headline: "Deposit Cash & Claim",
    subtext:
      "Deposit cash at the bank branch, select the bank below and upload the bank receipt — wallet loads after verification.",
  };

  useEffect(() => {
    if (visible) {
      // Partners see their history on the Requests tab, so skip the chooser.
      if (isPartner) {
        setConfirmPrefill(cashPrefill);
        setStep("confirm");
      } else {
        setStep("home");
      }
      void loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, loadAll, isPartner]);

  function close() {
    setStep("home");
    onClose();
  }

  function goConfirm(prefill: ConfirmPrefill) {
    setConfirmPrefill(prefill);
    setStep("confirm");
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 60 }} />
        ) : !enabled ? (
          <ScrollView contentContainerStyle={styles.content}>
            <ScreenTop title="" onClose={close} />
            <Text style={[styles.h1, { color: tokens.txt }]}>Add Money to Wallet</Text>
            <View style={[styles.noticeBanner, { backgroundColor: "#FEF3C7" }]}>
              <Info size={16} color="#92400E" />
              <Text style={styles.noticeText}>
                Fund requests are not enabled for your account. Contact your sales manager to enable them.
              </Text>
            </View>
          </ScrollView>
        ) : step === "home" ? (
          <HomeStep
            walletBalance={walletBalance}
            onClose={close}
            onHistory={() => setStep("history")}
            onCash={() =>
              goConfirm({
                mode: "cash_deposit",
                headline: "Deposit Cash & Claim",
                subtext:
                  "Deposit cash at the bank branch, select the bank below and upload the bank receipt — wallet loads after verification.",
              })
            }
          />
        ) : step === "upi" ? (
          <UpiStep
            van={myVan}
            onBack={() => setStep("home")}
            onContinue={(amount) =>
              goConfirm({
                mode: "upi",
                bankAccountId: myVan?.bankAccountId,
                headline: "Confirm UPI payment",
                subtext: `Paid ₹${amount} via UPI — attach the payment screenshot to complete.`,
              })
            }
          />
        ) : step === "bank" ? (
          <BankStep
            banks={banks}
            myVan={myVan}
            onBack={() => setStep("home")}
            onContinue={(bankAccountId) =>
              goConfirm({
                mode: "neft",
                bankAccountId,
                headline: "Confirm bank transfer",
                subtext: "Transferred to the account above — attach your bank receipt to complete.",
              })
            }
          />
        ) : step === "history" ? (
          <HistoryStep onBack={() => setStep("home")} />
        ) : step === "cashSelect" ? (
          <CashSelectStep
            onBack={() => setStep("home")}
            onSelect={(kind) =>
              goConfirm({
                mode: "cash_deposit",
                headline: kind === "claim" ? "Deposit Cash & Claim" : "Instant Credit via E-Collect",
                subtext:
                  kind === "claim"
                    ? "Deposit cash at the bank branch, then upload the slip below — your wallet is credited once our team verifies the deposit."
                    : "Deposit cash at an E-Collect machine, then upload the receipt below for instant wallet credit.",
              })
            }
          />
        ) : (
          <ConfirmStep
            banks={banks}
            myVan={myVan}
            prefill={confirmPrefill ?? cashPrefill}
            onBack={isPartner ? close : () => setStep("home")}
            onDone={close}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function ScreenTop({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const { tokens } = useTheme();
  return (
    <View style={topStyles.row}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={topStyles.iconBtn}>
          <ArrowLeft size={20} color={tokens.txt} />
        </Pressable>
      ) : (
        <View style={topStyles.iconBtn} />
      )}
      <Text style={[topStyles.title, { color: tokens.txt }]}>{title}</Text>
      {onClose ? (
        <Pressable onPress={onClose} hitSlop={10} style={topStyles.iconBtn}>
          <X size={20} color={tokens.txt} />
        </Pressable>
      ) : (
        <View style={topStyles.iconBtn} />
      )}
    </View>
  );
}

const topStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800" },
});

function HomeStep({
  walletBalance,
  onClose,
  onCash,
  onHistory,
}: {
  walletBalance: string | null;
  onClose: () => void;
  onCash: () => void;
  onHistory: () => void;
}) {
  const { tokens } = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTop title="" onClose={onClose} />
      <Text style={[styles.h1, { color: tokens.txt }]}>Add Money to Wallet</Text>
      {walletBalance !== null ? (
        <Text style={[styles.h1Sub, { color: tokens.sub }]}>
          Main Wallet balance: {formatINR(walletBalance)}
        </Text>
      ) : null}

      <Text style={[styles.groupLabel, { color: tokens.txt }]}>Deposit Cash & Get Credit</Text>
      <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
        <OptionRow
          icon={Building2}
          title="Deposit Cash & Claim"
          subtitle="Deposit at a company bank branch, then upload the bank receipt"
          tokens={tokens}
          onPress={onCash}
        />
      </View>

      <Text style={[styles.groupLabel, { color: tokens.txt }]}>History</Text>
      <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
        <OptionRow
          icon={ClipboardList}
          title="My fund requests"
          subtitle="Status of every request — credited, under review, rejected or reversed"
          tokens={tokens}
          onPress={onHistory}
        />
      </View>
    </ScrollView>
  );
}

/** Partner "Requests" tab — raise a fund request + full history. */
type HistoryFilter = "all" | "pending" | "credited" | "rejected";

const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "credited", label: "Credited" },
  { key: "rejected", label: "Rejected" },
];

function matchesHistoryFilter(row: FundRequestRow, filter: HistoryFilter): boolean {
  if (filter === "all") return true;
  const s = `${row.status} ${row.displayStatus}`.toLowerCase();
  if (filter === "credited") return s.includes("credit") || s.includes("approved");
  if (filter === "rejected")
    return s.includes("reject") || s.includes("cancel") || s.includes("void");
  return (
    !s.includes("credit") &&
    !s.includes("approved") &&
    !s.includes("reject") &&
    !s.includes("cancel") &&
    !s.includes("void")
  );
}

export function FundRequestsScreen() {
  const { tokens } = useTheme();
  const today = toYmd(new Date());
  const [showFund, setShowFund] = useState(false);
  const [range, setRange] = useState({ from: today, to: today });
  const [applied, setApplied] = useState({ from: today, to: today });
  const [statusFilter, setStatusFilter] = useState<HistoryFilter>("all");
  const [rows, setRows] = useState<FundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<FundRequestRow[]>("/fund-requests", { status: "all", limit: 100 }));
    } catch (err) {
      showAlert("Could not load requests", (err as Error).message || "Check your connection and tap Search again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        const day = toYmd(new Date(r.submittedAt));
        if (day < applied.from || day > applied.to) return false;
        return matchesHistoryFilter(r, statusFilter);
      }),
    [rows, applied, statusFilter],
  );

  const cardStyle = { backgroundColor: tokens.card, borderColor: tokens.cardBorder };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <PartnerTopBar title="My deposits" />
      <ScrollView
        contentContainerStyle={requestsStyles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
      >
        <View style={[requestsStyles.card, cardStyle]}>
          <View style={requestsStyles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[requestsStyles.h1, { color: tokens.txt }]}>My deposits</Text>
              <Text style={[requestsStyles.sub, { color: tokens.sub }]}>
                Only your own fund requests — raise a new one anytime
              </Text>
            </View>
            <Pressable style={requestsStyles.raiseBtn} onPress={() => setShowFund(true)}>
              <Plus size={16} color="#fff" strokeWidth={2.6} />
              <Text style={requestsStyles.raiseText}>Raise</Text>
            </Pressable>
          </View>
          <View style={[requestsStyles.filterBox, { borderColor: tokens.cardBorder }]}>
            <DateRangeFields from={range.from} to={range.to} onChange={setRange} />
            <View style={requestsStyles.statusRow}>
              {HISTORY_FILTERS.map((f) => {
                const active = statusFilter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setStatusFilter(f.key)}
                    style={[
                      requestsStyles.statusChip,
                      {
                        backgroundColor: active ? colors.blueFlat : tokens.card,
                        borderColor: active ? colors.blueFlat : tokens.cardBorder,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? "#fff" : tokens.sub, fontWeight: "700", fontSize: 11 }}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={requestsStyles.searchBtn}
              onPress={() => {
                setApplied(range);
                void load();
              }}
            >
              <Search size={17} color="#fff" />
              <Text style={requestsStyles.searchText}>Search</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 24 }} />
        ) : visible.length === 0 ? (
          <View style={[requestsStyles.card, requestsStyles.empty, cardStyle]}>
            <Hourglass size={30} color={colors.blueFlat} />
            <Text style={[requestsStyles.emptyTitle, { color: tokens.txt }]}>No requests found</Text>
            <Text style={[requestsStyles.sub, { color: tokens.sub, textAlign: "center" }]}>
              Try changing the date range or raise a new request.
            </Text>
          </View>
        ) : (
          visible.map((r) => {
            const tone = statusTone(r.status, r.displayStatus);
            return (
              <View key={r.id} style={[historyStyles.row, cardStyle]}>
                <View style={{ flex: 1 }}>
                  <Text style={[historyStyles.amount, { color: tokens.txt }]}>{formatINR(r.amount)}</Text>
                  {r.creditedAmount ? (
                    <Text style={historyStyles.credited}>Credited {formatINR(r.creditedAmount)}</Text>
                  ) : null}
                  <Text style={[historyStyles.meta, { color: tokens.sub }]}>
                    {r.paymentMode.replace(/_/g, " ").toUpperCase()} · {r.referenceNumber || "No UTR"}
                  </Text>
                  <Text style={[historyStyles.meta, { color: tokens.mute }]}>
                    {new Date(r.submittedAt).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={[historyStyles.pill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                  <Text style={[historyStyles.pillText, { color: tone.fg }]}>{r.displayStatus || r.status}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <FundRequestModal
        visible={showFund}
        onClose={() => {
          setShowFund(false);
          void load();
        }}
      />
    </SafeAreaView>
  );
}

const requestsStyles = StyleSheet.create({
  content: { padding: 14, paddingBottom: 32, gap: 14 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  h1: { fontSize: 20, fontWeight: "800" },
  sub: { fontSize: 12.5, marginTop: 3 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  statusChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  raiseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.green,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  raiseText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  filterBox: { borderWidth: 1, borderRadius: 14, padding: 12 },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.blueFlat,
    borderRadius: 999,
    paddingVertical: 13,
    marginTop: 12,
  },
  searchText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  empty: { alignItems: "center", paddingVertical: 30, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
});

function HistoryStep({ onBack }: { onBack: () => void }) {
  const { tokens } = useTheme();
  const [rows, setRows] = useState<FundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchApi<FundRequestRow[]>("/fund-requests", { status: "all", limit: 30 }));
    } catch (err) {
      setError((err as Error).message || "Could not load your fund requests. Pull down or tap Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
    >
      <ScreenTop title="My fund requests" onBack={onBack} />
      {error ? (
        <View style={[styles.noticeBanner, { backgroundColor: "#FEE2E2" }]}>
          <Info size={16} color="#B91C1C" />
          <Text style={[styles.noticeText, { color: "#B91C1C" }]}>{error}</Text>
        </View>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <View style={historyStyles.empty}>
          <ClipboardList size={28} color={tokens.mute} />
          <Text style={[historyStyles.emptyTitle, { color: tokens.txt }]}>No fund requests yet</Text>
          <Text style={[historyStyles.emptySub, { color: tokens.sub }]}>
            Deposit at a company bank, then submit a request from Add Money.
          </Text>
        </View>
      ) : null}
      {rows.map((r) => {
        const tone = statusTone(r.status, r.displayStatus);
        return (
          <View
            key={r.id}
            style={[historyStyles.row, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[historyStyles.amount, { color: tokens.txt }]}>{formatINR(r.amount)}</Text>
              {r.creditedAmount ? (
                <Text style={historyStyles.credited}>Credited {formatINR(r.creditedAmount)}</Text>
              ) : null}
              <Text style={[historyStyles.meta, { color: tokens.sub }]}>
                {r.paymentMode.replace(/_/g, " ").toUpperCase()} · {r.referenceNumber || "No UTR"}
              </Text>
              <Text style={[historyStyles.meta, { color: tokens.mute }]}>
                {new Date(r.submittedAt).toLocaleString("en-IN")}
              </Text>
            </View>
            <View style={[historyStyles.pill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <Text style={[historyStyles.pillText, { color: tone.fg }]}>{r.displayStatus || r.status}</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const historyStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  amount: { fontSize: 16, fontWeight: "800" },
  credited: { fontSize: 12, fontWeight: "600", color: "#15803D", marginTop: 2 },
  meta: { fontSize: 12, marginTop: 3 },
  pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 150 },
  pillText: { fontSize: 11, fontWeight: "800", textAlign: "center" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "700" },
  emptySub: { fontSize: 12, textAlign: "center" },
});

function OptionRow({
  icon: Icon,
  title,
  subtitle,
  tokens,
  onPress,
}: {
  icon: typeof Wallet;
  title: string;
  subtitle: string;
  tokens: ReturnType<typeof useTheme>["tokens"];
  onPress: () => void;
}) {
  return (
    <Pressable style={optionStyles.row} onPress={onPress}>
      <Icon size={22} color={colors.blueFlat} strokeWidth={1.8} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[optionStyles.title, { color: tokens.txt }]}>{title}</Text>
        <Text style={[optionStyles.subtitle, { color: tokens.sub }]}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={tokens.mute} />
    </Pressable>
  );
}

const optionStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  title: { fontSize: 15, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
});

function UpiStep({
  van,
  onBack,
  onContinue,
}: {
  van: MyVan | null;
  onBack: () => void;
  onContinue: (amount: string) => void;
}) {
  const { tokens } = useTheme();
  const [amount, setAmount] = useState("");
  const upiUri = van?.vpa && amount ? `upi://pay?pa=${van.vpa}&pn=AsanPay&am=${amount}&cu=INR` : null;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTop title="UPI Deposit" onBack={onBack} />

      {!van?.vpa ? (
        <View style={[styles.noticeBanner, { backgroundColor: "#FEF3C7" }]}>
          <Info size={16} color="#92400E" />
          <Text style={styles.noticeText}>
            No UPI ID is assigned to your account yet. Ask your distributor/admin to assign one, or use Bank
            Account Transfer instead.
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.centerLabel, { color: tokens.sub }]}>Enter amount to add</Text>
          <TextInput
            style={[styles.amountInput, { color: tokens.txt }]}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={tokens.mute}
          />
          <View style={styles.presetRow}>
            {AMOUNT_PRESETS.map((p) => (
              <Pressable key={p} onPress={() => setAmount(p)} style={[styles.presetChip, { borderColor: tokens.cardBorder }]}>
                <Text style={{ color: tokens.txt, fontWeight: "700", fontSize: 13 }}>₹{p}</Text>
              </Pressable>
            ))}
          </View>

          {upiUri ? (
            <View style={[styles.qrWrap, { borderColor: tokens.cardBorder }]}>
              <Text style={[styles.qrLabel, { color: tokens.sub }]}>Scan and pay to</Text>
              <Text style={[styles.qrVpa, { color: tokens.txt }]}>{van.vpa}</Text>
              <View style={styles.qrBox}>
                <QRCode value={upiUri} size={180} />
              </View>
            </View>
          ) : (
            <Text style={[styles.hint, { color: tokens.mute, textAlign: "center", marginTop: 12 }]}>
              Enter an amount to generate the QR code
            </Text>
          )}

          <Pressable
            style={[styles.submit, { opacity: amount ? 1 : 0.5 }]}
            disabled={!amount}
            onPress={() => onContinue(amount)}
          >
            <Text style={styles.submitText}>I've paid — continue</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

/** Company bank accounts — same card design as settlement / web Add Money. */
function maskTail(value: string): string {
  const digits = value.replace(/\s/g, "");
  if (digits.length <= 4) return `**** ${digits}`;
  return `**** ${digits.slice(-4)}`;
}

function BankCardSlider({
  banks,
  myVan,
  selected,
  onSelect,
}: {
  banks: BankAccount[];
  myVan: MyVan | null;
  /** Omit both to show cards without a select tick (bank is picked in the form). */
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [viewBank, setViewBank] = useState<BankViewDetails | null>(null);
  const [trackW, setTrackW] = useState(0);
  /** Full card stays inside screen; ~22px peek of the next bank. */
  const GAP = 12;
  const SIDE_PAD = 16;
  const PEEK = 22;
  const cardWidth = trackW > 0 ? Math.round(trackW - SIDE_PAD - PEEK) : undefined;

  return (
    <View
      style={{ marginHorizontal: -16 }}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
    >
      <BankAccountViewSheet bank={viewBank} onClose={() => setViewBank(null)} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth ? cardWidth + GAP : undefined}
        snapToAlignment="start"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD, paddingVertical: 12 }}
      >
        {banks.map((b) => {
          const isSelected = selected === b.id;
          const isMine = myVan?.bankAccountId === b.id && Boolean(myVan?.vanNumber);
          const fullAccount =
            isMine && myVan?.vanNumber ? myVan.vanNumber : b.accountNumber || `****${b.accountNumberLast4}`;
          const masked =
            isMine && myVan?.vanNumber ? maskTail(myVan.vanNumber) : `**** ${b.accountNumberLast4}`;
          const canReveal = (isMine && Boolean(myVan?.vanNumber)) || Boolean(b.accountNumber);

          return (
            <BankDetailCard
              key={b.id}
              ifsc={b.ifsc}
              holderName={b.holderName || "AsanPay"}
              bankName={b.bankName}
              branch={b.branchName || undefined}
              accountMasked={masked}
              accountFull={canReveal ? fullAccount : undefined}
              revealed={Boolean(revealedIds[b.id])}
              onToggleReveal={
                canReveal
                  ? () => setRevealedIds((prev) => ({ ...prev, [b.id]: !prev[b.id] }))
                  : undefined
              }
              onCopy={() => {
                Clipboard.setString(
                  formatSettlementBankCopy({
                    accountType: b.accountType,
                    bankName: b.bankName,
                    holderName: b.holderName || "AsanPay",
                    accountNumber: fullAccount.replace(/\s/g, ""),
                    ifsc: b.ifsc,
                    branch: b.branchName,
                    branchCode: b.branchCode,
                    city: b.city || undefined,
                  }),
                );
                showAlert("Copied", "Bank details copied");
              }}
              onView={() =>
                setViewBank({
                  bankName: b.bankName,
                  ifsc: b.ifsc,
                  accountNumber: fullAccount.replace(/\s/g, ""),
                  holderName: b.holderName || "AsanPay",
                  accountType: b.accountType,
                  branchName: b.branchName,
                  branchCode: b.branchCode,
                  city: b.city,
                })
              }
              statusTone={isSelected ? "success" : b.isActive ? "info" : "pending"}
              statusLabel={isSelected ? "Selected" : b.isActive ? "Available" : "Unavailable"}
              selected={isSelected}
              onSelect={onSelect ? () => onSelect(b.id) : undefined}
              unavailable={!b.isActive}
              note={isMine ? "Your dedicated account" : undefined}
              cardWidth={cardWidth}
              style={{ marginRight: GAP }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function BankStep({
  banks,
  myVan,
  onBack,
  onContinue,
}: {
  banks: BankAccount[];
  myVan: MyVan | null;
  onBack: () => void;
  onContinue: (bankAccountId: string) => void;
}) {
  const { tokens } = useTheme();
  const [selected, setSelected] = useState(banks[0]?.id ?? "");

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTop title="Bank Account Transfer" onBack={onBack} />
      <View style={[styles.noticeBanner, { backgroundColor: "#FEF3C7" }]}>
        <Info size={16} color="#92400E" />
        <Text style={styles.noticeText}>
          Transfer from a bank account registered with AsanPay to load your wallet instantly.
        </Text>
      </View>

      <Text style={[styles.groupLabel, { color: tokens.txt, marginTop: 16 }]}>Available banks</Text>
      <BankCardSlider banks={banks} myVan={myVan} selected={selected} onSelect={setSelected} />

      <Pressable
        style={[styles.submit, { opacity: selected ? 1 : 0.5 }]}
        disabled={!selected}
        onPress={() => onContinue(selected)}
      >
        <Text style={styles.submitText}>I've transferred — continue</Text>
      </Pressable>
    </ScrollView>
  );
}

function CashSelectStep({
  onBack,
  onSelect,
}: {
  onBack: () => void;
  onSelect: (kind: "claim" | "ecollect") => void;
}) {
  const { tokens } = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTop title="Select Mode" onBack={onBack} />
      <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
        <OptionRow
          icon={Building2}
          title="Deposit Cash & Claim"
          subtitle="Deposit cash at bank & claim — credited after verification"
          tokens={tokens}
          onPress={() => onSelect("claim")}
        />
        <View style={[styles.divider, { backgroundColor: tokens.cardBorder }]} />
        <OptionRow
          icon={Zap}
          title="Instant Credit via E-Collect"
          subtitle="For deposits under ₹10 Lac — instant wallet load"
          tokens={tokens}
          onPress={() => onSelect("ecollect")}
        />
      </View>
    </ScrollView>
  );
}

const PAYMENT_MODE_MAP: Record<ConfirmMode, string> = {
  upi: "upi",
  neft: "neft",
  cash_deposit: "cash_deposit",
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toHour12(h24: number): number {
  const h = h24 % 12;
  return h === 0 ? 12 : h;
}

function fromHour12(h12: number, isPm: boolean): number {
  if (h12 === 12) return isPm ? 12 : 0;
  return isPm ? h12 + 12 : h12;
}

function formatDepositDigits(raw: string): string {
  const upper = raw.toUpperCase();
  const ampm = upper.includes("PM") ? "PM" : upper.includes("AM") ? "AM" : "";
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const hh = digits.slice(8, 10);
  const mi = digits.slice(10, 12);
  let out = dd;
  if (digits.length > 2) out += `/${mm}`;
  if (digits.length > 4) out += `/${yyyy}`;
  if (digits.length > 8) out += ` ${hh}`;
  if (digits.length > 10) out += `:${mi}`;
  if (ampm && digits.length >= 10) out += ` ${ampm}`;
  return out;
}

function parseDepositDisplay(text: string): Date | null {
  const m =
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  let hour = m[4] != null ? Number(m[4]) : 12;
  const minute = m[5] != null ? Number(m[5]) : 0;
  const ampm = m[6]?.toUpperCase();
  if (year < 2020 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (minute > 59) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    hour = fromHour12(hour, ampm === "PM");
  } else if (hour > 23) {
    return null;
  }
  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return dt;
}

function dateToDisplay(d: Date): string {
  const h12 = toHour12(d.getHours());
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(h12)}:${pad2(d.getMinutes())} ${ampm}`;
}

function bumpHour12(h24: number, delta: number): number {
  const next12 = ((toHour12(h24) - 1 + delta + 12) % 12) + 1;
  return fromHour12(next12, h24 >= 12);
}

function bumpMinute(m: number, delta: number): number {
  return (m + delta + 60) % 60;
}

/** JS modal date+time — no native DateTimePicker (avoids Android crash on some devices). */
function DepositDateTimeField({
  value,
  onChange,
  tokens,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  tokens: { sub: string; txt: string; mute: string; card: string; cardBorder: string; bg: string };
}) {
  const [open, setOpen] = useState(false);
  const seed = value ?? new Date();
  const [viewYear, setViewYear] = useState(seed.getFullYear());
  const [viewMonth, setViewMonth] = useState(seed.getMonth());
  const [day, setDay] = useState(seed.getDate());
  const [hour, setHour] = useState(seed.getHours());
  const [minute, setMinute] = useState(seed.getMinutes());
  const [typed, setTyped] = useState(value ? dateToDisplay(value) : "");
  const [pickerLevel, setPickerLevel] = useState<"day" | "month" | "year">("day");
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!open) {
      setKbHeight(0);
      return;
    }
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [open]);

  function syncTyped(nextHour: number, nextMinute: number, nextDay = day, nextMonth = viewMonth, nextYear = viewYear) {
    setTyped(dateToDisplay(new Date(nextYear, nextMonth, nextDay, nextHour, nextMinute, 0, 0)));
  }

  function openModal() {
    const s = value ?? new Date();
    setViewYear(s.getFullYear());
    setViewMonth(s.getMonth());
    setDay(s.getDate());
    setHour(s.getHours());
    setMinute(s.getMinutes());
    setTyped(value ? dateToDisplay(value) : "");
    setPickerLevel("day");
    setKbHeight(0);
    setOpen(true);
  }

  function applyPick() {
    const dt = new Date(viewYear, viewMonth, day, hour, minute, 0, 0);
    if (dt.getTime() > Date.now()) {
      showAlert("Invalid date", "Deposit date and time cannot be in the future");
      return;
    }
    onChange(dt);
    setTyped(dateToDisplay(dt));
    setOpen(false);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const maxYear = new Date().getFullYear();
  const yearBlockStart = Math.floor(viewYear / 12) * 12;
  const yearOptions = Array.from({ length: 12 }, (_, i) => yearBlockStart + i);

  function shiftNav(delta: number) {
    if (pickerLevel === "day") {
      if (delta < 0) {
        if (viewMonth === 0) {
          setViewMonth(11);
          setViewYear((y) => y - 1);
        } else setViewMonth((m) => m - 1);
      } else {
        if (viewYear > maxYear || (viewYear === maxYear && viewMonth >= new Date().getMonth())) return;
        if (viewMonth === 11) {
          setViewMonth(0);
          setViewYear((y) => y + 1);
        } else setViewMonth((m) => m + 1);
      }
      return;
    }
    if (pickerLevel === "month") {
      const next = viewYear + delta;
      if (next > maxYear || next < 2020) return;
      setViewYear(next);
      return;
    }
    setViewYear((y) => Math.min(Math.max(y + delta * 12, 2020), maxYear));
  }

  const headerLabel =
    pickerLevel === "year"
      ? `${yearBlockStart} – ${yearBlockStart + 11}`
      : pickerLevel === "month"
        ? String(viewYear)
        : `${MONTH_SHORT[viewMonth]} ${viewYear}`;

  return (
    <>
      <Pressable
        style={[
          styles.input,
          {
            backgroundColor: tokens.card,
            borderColor: tokens.cardBorder,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        ]}
        onPress={openModal}
        accessibilityRole="button"
        accessibilityLabel="Select deposit date and time"
      >
        <Text style={{ color: value ? tokens.txt : tokens.mute, flex: 1 }}>
          {value
            ? value.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
            : "Select date and time"}
        </Text>
        <Calendar size={16} color={tokens.sub} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.dtKav}>
          <Pressable
            style={styles.dtBackdropFill}
            onPress={() => {
              Keyboard.dismiss();
              setOpen(false);
            }}
          />
          <View
            style={[
              styles.dtSheet,
              {
                backgroundColor: tokens.bg,
                borderColor: tokens.cardBorder,
                marginBottom: kbHeight,
                maxHeight: Math.max(
                  280,
                  Dimensions.get("window").height - kbHeight - (kbHeight > 0 ? 12 : 40),
                ),
              },
            ]}
          >
              <View style={styles.dtHeader}>
                <Text style={[styles.dtTitle, { color: tokens.txt }]}>Deposit date & time</Text>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setOpen(false);
                  }}
                  hitSlop={12}
                >
                  <X size={20} color={tokens.sub} />
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.dtScrollContent}
              >
                <Text style={[styles.label, { color: tokens.sub }]}>Type DD/MM/YYYY hh:mm AM/PM</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
                  value={typed}
                  onChangeText={(raw) => {
                    const formatted = formatDepositDigits(raw);
                    setTyped(formatted);
                    const parsed = parseDepositDisplay(formatted);
                    if (parsed && parsed.getTime() <= Date.now()) {
                      setViewYear(parsed.getFullYear());
                      setViewMonth(parsed.getMonth());
                      setDay(parsed.getDate());
                      setHour(parsed.getHours());
                      setMinute(parsed.getMinutes());
                    }
                  }}
                  autoCapitalize="characters"
                  placeholder="e.g. 16/10/2026 02:30 PM"
                  placeholderTextColor={tokens.mute}
                  maxLength={22}
                />

                <Pressable onPress={Keyboard.dismiss}>
                  <View style={styles.dtCalPanel}>
                    <View style={styles.dtMonthRow}>
                      <Pressable
                        onPress={() => {
                          Keyboard.dismiss();
                          shiftNav(-1);
                        }}
                        style={styles.dtNavBtn}
                      >
                        <Text style={{ color: colors.blueFlat, fontWeight: "800" }}>‹</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          Keyboard.dismiss();
                          if (pickerLevel === "day") setPickerLevel("month");
                          else if (pickerLevel === "month") setPickerLevel("year");
                        }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                      >
                        <Text style={{ color: tokens.txt, fontWeight: "800" }}>{headerLabel}</Text>
                        {pickerLevel !== "year" ? (
                          <Text style={{ color: colors.blueFlat, fontWeight: "800", fontSize: 10 }}>▼</Text>
                        ) : null}
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          Keyboard.dismiss();
                          shiftNav(1);
                        }}
                        style={styles.dtNavBtn}
                      >
                        <Text style={{ color: colors.blueFlat, fontWeight: "800" }}>›</Text>
                      </Pressable>
                    </View>

                    {pickerLevel === "year" ? (
                      <View style={styles.dtGrid}>
                        {yearOptions.map((y) => {
                          const on = y === viewYear;
                          const disabled = y > maxYear || y < 2020;
                          return (
                            <Pressable
                              key={y}
                              disabled={disabled}
                              onPress={() => {
                                Keyboard.dismiss();
                                setViewYear(y);
                                setPickerLevel("month");
                              }}
                              style={[styles.dtDay, { width: "33.33%" }, disabled && { opacity: 0.3 }]}
                            >
                              <View
                                style={[
                                  styles.dtDayInner,
                                  on && styles.dtDayInnerSelected,
                                  { width: "90%", borderRadius: 10 },
                                ]}
                              >
                                <Text style={{ fontWeight: "700", color: on ? "#fff" : tokens.txt }}>{y}</Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : pickerLevel === "month" ? (
                      <View style={styles.dtGrid}>
                        {MONTH_SHORT.map((name, i) => {
                          const on = i === viewMonth;
                          const disabled = viewYear === maxYear && i > new Date().getMonth();
                          return (
                            <Pressable
                              key={name}
                              disabled={disabled}
                              onPress={() => {
                                Keyboard.dismiss();
                                setViewMonth(i);
                                setPickerLevel("day");
                              }}
                              style={[styles.dtDay, { width: "33.33%" }, disabled && { opacity: 0.3 }]}
                            >
                              <View
                                style={[
                                  styles.dtDayInner,
                                  on && styles.dtDayInnerSelected,
                                  { width: "90%", borderRadius: 10 },
                                ]}
                              >
                                <Text style={{ fontWeight: "700", color: on ? "#fff" : tokens.txt }}>{name}</Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <>
                        <View style={styles.dtWeekRow}>
                          {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
                            <Text key={i} style={[styles.dtWeek, { color: tokens.mute }]}>
                              {w}
                            </Text>
                          ))}
                        </View>
                        <View style={styles.dtGrid}>
                          {Array.from({ length: startWeekday }).map((_, i) => (
                            <View key={`e-${i}`} style={[styles.dtDay, { width: "14.28%" }]} />
                          ))}
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                            const candidate = new Date(viewYear, viewMonth, d);
                            const disabled = candidate.getTime() > Date.now();
                            const selected = d === day;
                            return (
                              <Pressable
                                key={d}
                                disabled={disabled}
                                onPress={() => {
                                  Keyboard.dismiss();
                                  setDay(d);
                                  syncTyped(hour, minute, d);
                                }}
                                style={[styles.dtDay, { width: "14.28%" }, disabled && { opacity: 0.3 }]}
                              >
                                <View style={[styles.dtDayInner, selected && styles.dtDayInnerSelected]}>
                                  <Text
                                    style={{
                                      fontWeight: selected ? "800" : "700",
                                      color: selected ? "#fff" : tokens.txt,
                                    }}
                                  >
                                    {d}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      </>
                    )}
                  </View>
                </Pressable>

                <View style={styles.dtTimePanel}>
                  <Text style={[styles.label, { color: tokens.sub, marginTop: 0 }]}>Time (12h) — tap + / −</Text>
                  <View style={styles.dtTimeRow}>
                    <View style={styles.dtStepper}>
                      <Pressable
                        style={styles.dtStepBtn}
                        onPress={() => {
                          Keyboard.dismiss();
                          const next = bumpHour12(hour, 1);
                          setHour(next);
                          syncTyped(next, minute);
                        }}
                      >
                        <Text style={styles.dtStepBtnTxt}>+</Text>
                      </Pressable>
                      <View style={styles.dtStepValue}>
                        <Text style={[styles.dtStepValueTxt, { color: tokens.txt }]}>{pad2(toHour12(hour))}</Text>
                      </View>
                      <Pressable
                        style={styles.dtStepBtn}
                        onPress={() => {
                          Keyboard.dismiss();
                          const next = bumpHour12(hour, -1);
                          setHour(next);
                          syncTyped(next, minute);
                        }}
                      >
                        <Text style={styles.dtStepBtnTxt}>−</Text>
                      </Pressable>
                    </View>
                    <Text style={{ color: tokens.txt, fontWeight: "800", fontSize: 18, marginHorizontal: 2 }}>:</Text>
                    <View style={styles.dtStepper}>
                      <Pressable
                        style={styles.dtStepBtn}
                        onPress={() => {
                          Keyboard.dismiss();
                          const next = bumpMinute(minute, 1);
                          setMinute(next);
                          syncTyped(hour, next);
                        }}
                      >
                        <Text style={styles.dtStepBtnTxt}>+</Text>
                      </Pressable>
                      <View style={styles.dtStepValue}>
                        <Text style={[styles.dtStepValueTxt, { color: tokens.txt }]}>{pad2(minute)}</Text>
                      </View>
                      <Pressable
                        style={styles.dtStepBtn}
                        onPress={() => {
                          Keyboard.dismiss();
                          const next = bumpMinute(minute, -1);
                          setMinute(next);
                          syncTyped(hour, next);
                        }}
                      >
                        <Text style={styles.dtStepBtnTxt}>−</Text>
                      </Pressable>
                    </View>
                    <View style={styles.dtAmPmRow}>
                      {(["AM", "PM"] as const).map((label) => {
                        const on = (hour >= 12 ? "PM" : "AM") === label;
                        return (
                          <Pressable
                            key={label}
                            onPress={() => {
                              Keyboard.dismiss();
                              const next = fromHour12(toHour12(hour), label === "PM");
                              setHour(next);
                              syncTyped(next, minute);
                            }}
                            style={[styles.dtAmPmChip, on && styles.dtAmPmChipOn]}
                          >
                            <Text style={{ color: on ? "#fff" : colors.blueFlat, fontWeight: "800", fontSize: 13 }}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <Pressable
                  style={styles.submit}
                  onPress={() => {
                    Keyboard.dismiss();
                    applyPick();
                  }}
                >
                  <Text style={styles.submitText}>Use this date & time</Text>
                </Pressable>
              </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ConfirmStep({
  banks,
  myVan,
  prefill,
  onBack,
  onDone,
}: {
  banks: BankAccount[];
  myVan: MyVan | null;
  prefill: ConfirmPrefill;
  onBack: () => void;
  onDone: () => void;
}) {
  const { tokens } = useTheme();
  const [bankAccountId, setBankAccountId] = useState(prefill.bankAccountId ?? banks[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [senderName, setSenderName] = useState("");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [bankMenuOpen, setBankMenuOpen] = useState(false);
  const [receiptSourceOpen, setReceiptSourceOpen] = useState(false);
  const [depositAt, setDepositAt] = useState<Date | null>(null);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const idemRef = useRef(newIdemKey());

  const needsBankPicker = !prefill.bankAccountId;
  const activeBanks = banks.filter((b) => b.isActive);
  const selectedBank = activeBanks.find((b) => b.id === bankAccountId);
  const selectedBankLabel = selectedBank
    ? `${selectedBank.bankName}${selectedBank.branchName ? `, ${selectedBank.branchName}` : ""} · ****${selectedBank.accountNumberLast4}`
    : "Select the bank you deposited to";

  function applyReceiptAsset(asset: {
    uri?: string;
    base64?: string;
    type?: string;
    fileName?: string;
  } | undefined) {
    if (!asset?.uri || !asset.base64) {
      showAlert("Upload failed", "No image selected. Try again.");
      return;
    }
    const mime = asset.type === "image/png" || asset.type === "image/webp" ? asset.type : "image/jpeg";
    setReceiptUri(asset.uri);
    setReceiptName(asset.fileName || "receipt.jpg");
    setReceiptDataUrl(`data:${mime};base64,${asset.base64}`);
  }

  async function pickReceiptFromGallery() {
    setReceiptSourceOpen(false);
    try {
      const res = await launchImageLibrary({
        mediaType: "photo",
        selectionLimit: 1,
        quality: 0.7,
        maxWidth: 1600,
        maxHeight: 1600,
        includeBase64: true,
      });
      if (res.didCancel) return;
      if (res.errorCode) {
        const permissionDenied =
          res.errorCode === "permission" || /permission/i.test(res.errorMessage || "");
        showAlert(
          permissionDenied ? "Photos required" : "Upload failed",
          permissionDenied
            ? "Allow photo access in phone Settings → Apps → AsanPay → Permissions, then try again."
            : res.errorMessage || "Could not open gallery. Try again.",
        );
        return;
      }
      applyReceiptAsset(res.assets?.[0]);
    } catch (err) {
      showAlert("Upload failed", err instanceof Error ? err.message : "Could not open gallery");
    }
  }

  async function pickReceiptFromCamera() {
    setReceiptSourceOpen(false);
    try {
      if (Platform.OS === "android") {
        const cam = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
          title: "Camera Permission",
          message: "AsanPay needs the camera to capture your deposit receipt.",
          buttonPositive: "Allow",
          buttonNegative: "Deny",
        });
        if (cam !== PermissionsAndroid.RESULTS.GRANTED) {
          showAlert("Camera required", "Allow camera access to capture a receipt photo");
          return;
        }
      }
      const res = await launchCamera({
        mediaType: "photo",
        cameraType: "back",
        saveToPhotos: false,
        quality: 0.7,
        maxWidth: 1600,
        maxHeight: 1600,
        includeBase64: true,
        presentationStyle: "fullScreen",
      });
      if (res.didCancel) return;
      if (res.errorCode) {
        showAlert(
          "Camera failed",
          res.errorMessage || "Could not open camera. Check camera permission and try again.",
        );
        return;
      }
      applyReceiptAsset(res.assets?.[0]);
    } catch (err) {
      showAlert("Camera unavailable", err instanceof Error ? err.message : "Could not open camera");
    }
  }

  async function submit() {
    if (saving) return;
    if (!bankAccountId) {
      showAlert("Bank required", "Select the company bank account you deposited to");
      return;
    }
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount) || parseFloat(amount) <= 0) {
      showAlert("Invalid amount", "Enter a valid amount greater than zero");
      return;
    }
    if (!referenceNumber.trim()) {
      showAlert("UTR / slip number required", "Enter the UTR, journal or slip number printed on your receipt");
      return;
    }
    if (!depositAt) {
      showAlert("Date required", "Select the deposit / payment date and time");
      return;
    }
    if (depositAt.getTime() > Date.now()) {
      showAlert("Invalid date", "Deposit date and time cannot be in the future");
      return;
    }
    if (!senderName.trim()) {
      showAlert("Sender name required", "Enter the sender name — the person who deposited");
      return;
    }
    if (!remarks.trim()) {
      showAlert("Remarks required", "Enter remarks for the finance team");
      return;
    }
    if (!receiptUri || !receiptDataUrl) {
      showAlert("Receipt required", "Attach your deposit / payment receipt image");
      return;
    }
    if (receiptDataUrl.length > 2_700_000) {
      showAlert("File too large", "Receipt must be 2 MB or smaller");
      return;
    }

    setSaving(true);
    try {
      await api.post(
        "/fund-requests",
        {
          bankAccountId,
          amount,
          paymentMode: PAYMENT_MODE_MAP[prefill.mode],
          referenceNumber: referenceNumber.trim(),
          depositDatetime: depositAt.toISOString(),
          senderName: senderName.trim(),
          remarks: remarks.trim(),
          receiptDataUrl,
          receiptName: (receiptName || "receipt.jpg").slice(0, 200),
        },
        { headers: { "Idempotency-Key": idemRef.current } },
      );
      idemRef.current = newIdemKey();
      setFormOpen(false);
      showAlert("Submitted", "Fund request submitted for review");
      onDone();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error).message ||
        "Could not submit fund request";
      showAlert("Error", msg);
    } finally {
      setSaving(false);
    }
  }

  const fields = (
    <>
      <LabelText label="Amount (₹) *" color={tokens.sub} style={styles.label} />
      <TextInput
        style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(v) => {
          idemRef.current = newIdemKey();
          setAmount(v);
        }}
        placeholder="0.00"
        placeholderTextColor={tokens.mute}
      />

      <LabelText label="UTR / slip number *" color={tokens.sub} style={styles.label} />
      <TextInput
        style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
        value={referenceNumber}
        onChangeText={(v) => {
          idemRef.current = newIdemKey();
          setReferenceNumber(v);
        }}
        maxLength={60}
        placeholder="UTR, journal or slip number on the receipt"
        placeholderTextColor={tokens.mute}
      />

      <LabelText label="Deposit / payment date & time *" color={tokens.sub} style={styles.label} />
      <DepositDateTimeField
        value={depositAt}
        onChange={(d) => {
          idemRef.current = newIdemKey();
          setDepositAt(d);
        }}
        tokens={tokens}
      />

      <LabelText label="Sender name *" color={tokens.sub} style={styles.label} />
      <TextInput
        style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
        value={senderName}
        onChangeText={setSenderName}
        maxLength={160}
        placeholder="Name of the person who deposited"
        placeholderTextColor={tokens.mute}
      />

      <LabelText label="Remarks *" color={tokens.sub} style={styles.label} />
      <TextInput
        style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
        value={remarks}
        onChangeText={setRemarks}
        maxLength={500}
        placeholder="e.g. Cash deposited at Malout branch counter"
        placeholderTextColor={tokens.mute}
      />

      <LabelText label="Receipt *" color={tokens.sub} style={styles.label} />
      <Pressable
        style={[styles.receiptBtn, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
        onPress={() => setReceiptSourceOpen(true)}
      >
        <Text style={{ color: tokens.txt, fontWeight: "700" }}>
          {receiptName ? `Receipt: ${receiptName}` : "Attach receipt / payment proof"}
        </Text>
        <Text style={{ color: tokens.sub, fontSize: 12, fontWeight: "600", marginTop: 4 }}>
          Gallery or Camera
        </Text>
      </Pressable>
      <Modal
        visible={receiptSourceOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptSourceOpen(false)}
      >
        <View style={styles.receiptSourceRoot}>
          <Pressable style={styles.receiptSourceScrim} onPress={() => setReceiptSourceOpen(false)} />
          <View style={[styles.receiptSourceSheet, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Text style={{ color: tokens.txt, fontWeight: "800", fontSize: 16, marginBottom: 4 }}>
              Attach receipt
            </Text>
            <Text style={{ color: tokens.sub, fontSize: 12, fontWeight: "600", marginBottom: 12 }}>
              Choose gallery or camera
            </Text>
            <Pressable
              style={[styles.receiptSourceOption, { borderColor: tokens.cardBorder }]}
              onPress={() => void pickReceiptFromGallery()}
            >
              <ImageIcon size={18} color={colors.blueFlat} />
              <Text style={{ color: tokens.txt, fontWeight: "700", flex: 1 }}>Upload from gallery</Text>
            </Pressable>
            <Pressable
              style={[styles.receiptSourceOption, { borderColor: tokens.cardBorder }]}
              onPress={() => void pickReceiptFromCamera()}
            >
              <Camera size={18} color={colors.blueFlat} />
              <Text style={{ color: tokens.txt, fontWeight: "700", flex: 1 }}>Take photo with camera</Text>
            </Pressable>
            <Pressable
              style={[styles.receiptSourceCancel, { borderColor: colors.danger }]}
              onPress={() => setReceiptSourceOpen(false)}
            >
              <Text style={{ color: colors.danger, fontWeight: "800" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );

  const submitBtn = (
    <Pressable
      style={[styles.submit, { flex: needsBankPicker ? 1 : undefined, opacity: saving ? 0.6 : 1 }]}
      onPress={() => void submit()}
      disabled={saving}
    >
      <Text style={styles.submitText}>{saving ? "Submitting…" : "Submit fund request"}</Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenTop title={prefill.headline} onBack={onBack} />
      <View style={[styles.noticeBanner, { backgroundColor: "#EFF6FF" }]}>
        <HelpCircle size={16} color={colors.blueFlat} />
        <Text style={[styles.noticeText, { color: colors.blueFlat }]}>{prefill.subtext}</Text>
      </View>

      {needsBankPicker ? (
        <>
          <Pressable
            style={[styles.submit, { marginTop: 14, backgroundColor: colors.green, opacity: banks.length ? 1 : 0.5 }]}
            disabled={!banks.length}
            onPress={() => setFormOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>+ Create fund request</Text>
          </Pressable>
          <Text style={[styles.label, { color: tokens.sub }]}>Available banks</Text>
          <View style={{ marginBottom: 4 }}>
            <BankCardSlider banks={banks} myVan={myVan} />
          </View>

          <Modal visible={formOpen} animationType="slide" onRequestClose={() => !saving && setFormOpen(false)}>
            <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]}>
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <ScreenTop title="Create fund request" onBack={() => !saving && setFormOpen(false)} />
                <LabelText label="Deposited to bank *" color={tokens.sub} style={{ ...styles.label, marginTop: 0 }} />
                <Pressable
                  onPress={() => setBankMenuOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Select deposited bank"
                  style={[
                    styles.input,
                    styles.bankSelect,
                    {
                      backgroundColor: tokens.card,
                      borderColor: bankAccountId ? colors.blue : tokens.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      flex: 1,
                      color: selectedBank ? tokens.txt : tokens.mute,
                      fontWeight: selectedBank ? "700" : "600",
                    }}
                    numberOfLines={1}
                  >
                    {selectedBankLabel}
                  </Text>
                  <ChevronDown size={18} color={tokens.sub} />
                </Pressable>
                <Modal
                  visible={bankMenuOpen}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setBankMenuOpen(false)}
                >
                  <View style={styles.bankMenuRoot}>
                    <Pressable style={styles.bankMenuScrim} onPress={() => setBankMenuOpen(false)} />
                    <View style={[styles.bankMenuSheet, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                      <Text style={{ color: tokens.txt, fontWeight: "800", fontSize: 16, marginBottom: 8 }}>
                        Deposited to bank
                      </Text>
                      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
                        {activeBanks.map((b) => {
                          const on = b.id === bankAccountId;
                          const label = `${b.bankName}${b.branchName ? `, ${b.branchName}` : ""} · ****${b.accountNumberLast4}`;
                          return (
                            <Pressable
                              key={b.id}
                              onPress={() => {
                                idemRef.current = newIdemKey();
                                setBankAccountId(b.id);
                                setBankMenuOpen(false);
                              }}
                              style={[styles.bankMenuOption, on && { backgroundColor: `${colors.blue}14` }]}
                            >
                              <Text
                                style={{ flex: 1, color: on ? colors.blue : tokens.txt, fontWeight: on ? "700" : "500" }}
                                numberOfLines={2}
                              >
                                {label}
                              </Text>
                              {on ? <Check size={16} color={colors.blue} /> : null}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                </Modal>
                {fields}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    style={[styles.submit, { flex: 1, backgroundColor: colors.danger }]}
                    onPress={() => setFormOpen(false)}
                    disabled={saving}
                  >
                    <Text style={styles.submitText}>Cancel</Text>
                  </Pressable>
                  {submitBtn}
                </View>
              </ScrollView>
            </SafeAreaView>
          </Modal>
        </>
      ) : (
        <>
          {fields}
          {submitBtn}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 21, fontWeight: "800", marginTop: 4 },
  h1Sub: { fontSize: 13, fontWeight: "600", marginTop: 4, marginBottom: 18 },
  groupLabel: { fontSize: 13.5, fontWeight: "800", marginBottom: 8, marginTop: 6 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, marginBottom: 18 },
  divider: { height: 1 },
  centerLabel: { fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 8 },
  amountInput: { fontSize: 40, fontWeight: "800", textAlign: "center", marginTop: 8 },
  presetRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 14, flexWrap: "wrap" },
  presetChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  qrWrap: { borderWidth: 1, borderRadius: 16, padding: 20, marginTop: 22, alignItems: "center" },
  qrLabel: { fontSize: 12, fontWeight: "600" },
  qrVpa: { fontSize: 14, fontWeight: "800", marginTop: 2, marginBottom: 14 },
  qrBox: { padding: 12, backgroundColor: "#fff", borderRadius: 12 },
  noticeBanner: { flexDirection: "row", gap: 8, borderRadius: 12, padding: 12, alignItems: "flex-start" },
  noticeText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#92400E", lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 8 },
  hint: { fontSize: 11, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 4 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  receiptBtn: { marginTop: 16, borderWidth: 1, borderRadius: 12, padding: 14 },
  submit: { marginTop: 20, backgroundColor: colors.blue, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  bankSelect: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  bankMenuRoot: { flex: 1, justifyContent: "center", padding: 24 },
  bankMenuScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  bankMenuSheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bankMenuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 4,
  },
  receiptSourceRoot: { flex: 1, justifyContent: "flex-end" },
  receiptSourceScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  receiptSourceSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
    gap: 8,
  },
  receiptSourceOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  receiptSourceCancel: {
    marginTop: 4,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  dtKav: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  dtBackdropFill: { ...StyleSheet.absoluteFillObject },
  dtSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  dtScrollContent: { paddingBottom: 28 },
  dtHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  dtTitle: { fontSize: 17, fontWeight: "800" },
  dtStepper: { alignItems: "center", gap: 4 },
  dtStepBtn: {
    width: 40,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  dtStepBtnTxt: { color: colors.blueFlat, fontWeight: "900", fontSize: 18, lineHeight: 20 },
  dtStepValue: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#C7D2FE",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  dtStepValueTxt: { fontSize: 18, fontWeight: "800" },
  dtCalPanel: {
    marginTop: 12,
    backgroundColor: "#F5F8FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D6E0F5",
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 10,
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  dtMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 8,
  },
  dtNavBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  dtWeekRow: { flexDirection: "row", marginBottom: 4 },
  dtWeek: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700" },
  dtGrid: { flexDirection: "row", flexWrap: "wrap" },
  dtDay: { aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dtDayInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dtDayInnerSelected: {
    backgroundColor: colors.blueFlat,
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: colors.blueFlat,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dtTimePanel: {
    marginTop: 14,
    backgroundColor: "#EEF2FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  dtTimeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" },
  dtAmPmRow: { flexDirection: "row", gap: 6, marginLeft: 4 },
  dtAmPmChip: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.blueFlat,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  dtAmPmChipOn: {
    backgroundColor: colors.blueFlat,
    borderColor: colors.blueFlat,
  },
});
