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
import { api, fetchApi } from "../../lib/api";
import { showAlert } from "../../components/AppAlert";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

interface BankAccount {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  ifsc: string;
}

const PAYMENT_MODES = ["neft", "rtgs", "imps", "upi", "cash_deposit", "cheque"] as const;

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

export function FundRequestModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<(typeof PAYMENT_MODES)[number]>("neft");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [senderName, setSenderName] = useState("");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const idemRef = useRef(newIdemKey());

  const loadBanks = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchApi<BankAccount[]>("/banking/accounts", { purpose: "collection" });
      setBanks(rows);
      if (rows[0]) setBankAccountId(rows[0].id);
    } catch (err) {
      showAlert("Error", (err as Error).message || "Failed to load collection banks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void loadBanks();
  }, [visible, loadBanks]);

  const bankLabel = useMemo(() => {
    const b = banks.find((x) => x.id === bankAccountId);
    return b ? `${b.bankName} · ****${b.accountNumberLast4}` : "Select bank";
  }, [banks, bankAccountId]);

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
      showAlert("Receipt required", "Attach your deposit receipt image");
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
          paymentMode,
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
      onClose();
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Text style={[styles.back, { color: colors.blueFlat }]}>Close</Text>
          </Pressable>
          <Text style={[styles.title, { color: tokens.txt }]}>Add Money</Text>
          <View style={{ width: 48 }} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: tokens.sub }]}>Company bank</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {banks.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => setBankAccountId(b.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: bankAccountId === b.id ? colors.blue : tokens.card,
                      borderColor: tokens.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: bankAccountId === b.id ? "#fff" : tokens.txt,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {b.bankName} · ****{b.accountNumberLast4}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[styles.hint, { color: tokens.mute }]}>{bankLabel}</Text>

            <Text style={[styles.label, { color: tokens.sub }]}>Amount (₹)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt },
              ]}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(v) => {
                idemRef.current = newIdemKey();
                setAmount(v);
              }}
              placeholder="0.00"
              placeholderTextColor={tokens.mute}
            />

            <Text style={[styles.label, { color: tokens.sub }]}>Payment mode</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {PAYMENT_MODES.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setPaymentMode(m)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: paymentMode === m ? colors.blue : tokens.card,
                      borderColor: tokens.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: paymentMode === m ? "#fff" : tokens.txt,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.label, { color: tokens.sub }]}>UTR / reference (optional)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt },
              ]}
              value={referenceNumber}
              onChangeText={setReferenceNumber}
              placeholderTextColor={tokens.mute}
            />

            <Text style={[styles.label, { color: tokens.sub }]}>Sender name (optional)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt },
              ]}
              value={senderName}
              onChangeText={setSenderName}
              placeholderTextColor={tokens.mute}
            />

            <Pressable
              style={[styles.receiptBtn, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
              onPress={() => void pickReceipt()}
            >
              <Text style={{ color: tokens.txt, fontWeight: "700" }}>
                {receiptName ? `Receipt: ${receiptName}` : "Attach receipt photo"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.submit, { opacity: saving ? 0.6 : 1 }]}
              onPress={() => void submit()}
              disabled={saving}
            >
              <Text style={styles.submitText}>{saving ? "Submitting…" : "Submit fund request"}</Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontWeight: "700", fontSize: 15, width: 48 },
  title: { fontSize: 18, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 8 },
  hint: { fontSize: 11, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 4,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  receiptBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  submit: {
    marginTop: 20,
    backgroundColor: colors.blue,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
