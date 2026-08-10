import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { launchImageLibrary } from "react-native-image-picker";
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
  ChevronRight,
  CreditCard,
  HelpCircle,
  Info,
  Landmark,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import { api, fetchApi } from "../../lib/api";
import { formatSettlementBankCopy } from "../../lib/bankLogo";
import { formatINR } from "../../lib/format";
import { showAlert } from "../../components/AppAlert";
import { BankDetailCard } from "../../components/BankDetailCard";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

interface BankAccount {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  ifsc: string;
  isActive: boolean;
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

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("SHA-256 is not available on this device");
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newIdemKey() {
  return `fr-mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 100);
}

type Step = "home" | "upi" | "bank" | "cashSelect" | "confirm";
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

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
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

  useEffect(() => {
    if (visible) {
      setStep("home");
      void loadAll();
    }
  }, [visible, loadAll]);

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
        ) : step === "home" ? (
          <HomeStep
            walletBalance={walletBalance}
            hasUpi={Boolean(myVan?.vpa)}
            onClose={close}
            onUpi={() => setStep("upi")}
            onBank={() => setStep("bank")}
            onCash={() => setStep("cashSelect")}
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
        ) : step === "cashSelect" ? (
          <CashSelectStep
            onBack={() => setStep("home")}
            onSelect={(kind) =>
              goConfirm({
                mode: "cash_deposit",
                headline: kind === "claim" ? "Deposit Cash & Claim" : "Instant Credit via E-Collect",
                subtext:
                  kind === "claim"
                    ? "Deposit cash at the bank branch, then upload the slip below — wallet loads in 15–60 minutes after verification."
                    : "Deposit cash at an E-Collect machine, then upload the receipt below for instant wallet credit.",
              })
            }
          />
        ) : (
          <ConfirmStep
            banks={banks}
            myVan={myVan}
            prefill={confirmPrefill!}
            onBack={() => setStep("home")}
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
  hasUpi,
  onClose,
  onUpi,
  onBank,
  onCash,
}: {
  walletBalance: string | null;
  hasUpi: boolean;
  onClose: () => void;
  onUpi: () => void;
  onBank: () => void;
  onCash: () => void;
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

      <Text style={[styles.groupLabel, { color: tokens.txt }]}>Add Money Online</Text>
      <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
        <OptionRow
          icon={Wallet}
          title="UPI"
          subtitle={hasUpi ? "No charges" : "Set up by your distributor"}
          tokens={tokens}
          onPress={onUpi}
        />
        <View style={[styles.divider, { backgroundColor: tokens.cardBorder }]} />
        <OptionRow icon={Landmark} title="Bank Account Transfer" subtitle="No charges" tokens={tokens} onPress={onBank} />
      </View>

      <Text style={[styles.groupLabel, { color: tokens.txt }]}>Deposit Cash & Get Credit</Text>
      <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
        <OptionRow icon={Building2} title="At Bank Branch" subtitle="Bank-wise charges & limits" tokens={tokens} onPress={onCash} />
        <View style={[styles.divider, { backgroundColor: tokens.cardBorder }]} />
        <OptionRow icon={CreditCard} title="At Cash Deposit Machine" subtitle="Bank-wise charges & limits" tokens={tokens} onPress={onCash} />
      </View>
    </ScrollView>
  );
}

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
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
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
          const fullAccount = isMine && myVan?.vanNumber ? myVan.vanNumber : `****${b.accountNumberLast4}`;
          const masked =
            isMine && myVan?.vanNumber ? maskTail(myVan.vanNumber) : `**** ${b.accountNumberLast4}`;
          const canReveal = isMine && Boolean(myVan?.vanNumber);

          return (
            <BankDetailCard
              key={b.id}
              ifsc={b.ifsc}
              holderName="AsanPay"
              bankName={b.bankName}
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
                    bankName: b.bankName,
                    holderName: "AsanPay",
                    accountNumber: fullAccount.replace(/\s/g, ""),
                    ifsc: b.ifsc,
                  }),
                );
                showAlert("Copied", "Bank details copied");
              }}
              statusTone={isSelected ? "success" : b.isActive ? "info" : "pending"}
              statusLabel={isSelected ? "Selected" : b.isActive ? "Available" : "Unavailable"}
              selected={isSelected}
              onSelect={() => onSelect(b.id)}
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
          subtitle="Deposit cash at bank & claim — 15–60 min load time"
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
  const [saving, setSaving] = useState(false);
  const idemRef = useRef(newIdemKey());

  const needsBankPicker = !prefill.bankAccountId;

  async function pickReceipt() {
    const res = await launchImageLibrary({ mediaType: "photo", selectionLimit: 1, quality: 0.8 });
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    setReceiptUri(asset.uri);
    setReceiptName(asset.fileName || "receipt.jpg");
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
    if (!receiptUri) {
      showAlert("Receipt required", "Attach your deposit / payment receipt image");
      return;
    }

    setSaving(true);
    try {
      const fileRes = await fetch(receiptUri);
      const buf = await fileRes.arrayBuffer();
      if (buf.byteLength > 2_000_000) {
        showAlert("File too large", "Receipt must be 2 MB or smaller");
        setSaving(false);
        return;
      }
      const receiptSha256 = await sha256Hex(buf);
      const receiptUrl = `https://receipts.asanpay.app/${receiptSha256}`;
      await api.post(
        "/fund-requests",
        {
          bankAccountId,
          amount,
          paymentMode: PAYMENT_MODE_MAP[prefill.mode],
          referenceNumber: referenceNumber.trim() || null,
          depositDatetime: new Date().toISOString(),
          senderName: senderName.trim() || null,
          receiptUrl,
          receiptSha256,
        },
        { headers: { "Idempotency-Key": idemRef.current } },
      );
      idemRef.current = newIdemKey();
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

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenTop title={prefill.headline} onBack={onBack} />
      <View style={[styles.noticeBanner, { backgroundColor: "#EFF6FF" }]}>
        <HelpCircle size={16} color={colors.blueFlat} />
        <Text style={[styles.noticeText, { color: colors.blueFlat }]}>{prefill.subtext}</Text>
      </View>

      {needsBankPicker ? (
        <>
          <Text style={[styles.label, { color: tokens.sub }]}>Company bank</Text>
          <View style={{ marginBottom: 4 }}>
            <BankCardSlider banks={banks} myVan={myVan} selected={bankAccountId} onSelect={setBankAccountId} />
          </View>
        </>
      ) : null}

      <Text style={[styles.label, { color: tokens.sub }]}>Amount (₹)</Text>
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

      <Text style={[styles.label, { color: tokens.sub }]}>UTR / reference (optional)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
        value={referenceNumber}
        onChangeText={setReferenceNumber}
        placeholderTextColor={tokens.mute}
      />

      <Text style={[styles.label, { color: tokens.sub }]}>Sender name (optional)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
        value={senderName}
        onChangeText={setSenderName}
        placeholderTextColor={tokens.mute}
      />

      <Pressable
        style={[styles.receiptBtn, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
        onPress={() => void pickReceipt()}
      >
        <Text style={{ color: tokens.txt, fontWeight: "700" }}>
          {receiptName ? `Receipt: ${receiptName}` : "Attach receipt / payment proof"}
        </Text>
      </Pressable>

      <Pressable style={[styles.submit, { opacity: saving ? 0.6 : 1 }]} onPress={() => void submit()} disabled={saving}>
        <Text style={styles.submitText}>{saving ? "Submitting…" : "Submit fund request"}</Text>
      </Pressable>
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
});
