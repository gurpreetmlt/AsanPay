import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Copy, Eye, EyeOff, Landmark } from "lucide-react-native";
import { api, fetchApi } from "../../lib/api";
import { bankLogoUrl, formatSettlementBankCopy } from "../../lib/bankLogo";
import { formatINR } from "../../lib/format";
import { showAlert } from "../../components/AppAlert";
import { StatusBadge, toneFromStatus } from "../../components/StatusBadge";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

interface SettlementBank {
  id: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
  isActive: boolean;
  verified: boolean;
}

interface SettlementRequest {
  requestId: string;
  amount: string;
  mode: string;
  status: string;
  bankUtr: string | null;
  failureReason: string | null;
  requestedAt: string;
}

function newIdemKey() {
  return `settle-mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 100);
}

function BankLogo({ ifsc }: { ifsc: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.bankIconWrap, { backgroundColor: `${colors.blueFlat}14` }]}>
        <Landmark size={16} color={colors.blueFlat} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: bankLogoUrl(ifsc) }}
      style={styles.bankLogo}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

export function SettlementsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [banks, setBanks] = useState<SettlementBank[]>([]);
  const [requests, setRequests] = useState<SettlementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [holderName, setHolderName] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const idemRef = useRef(newIdemKey());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([
        fetchApi<SettlementBank[]>("/settlements/banks"),
        fetchApi<SettlementRequest[]>("/settlements/requests"),
      ]);
      setBanks(b);
      setRequests(r);
    } catch (err) {
      showAlert("Error", (err as Error).message || "Failed to load settlements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setRevealed({});
      void load();
    }
  }, [visible, load]);

  const hasActiveBank = banks.some((b) => b.isActive && b.verified);

  async function fetchReveal(bankId: string): Promise<string> {
    if (revealed[bankId]) return revealed[bankId];
    const data = await fetchApi<{ accountNumber: string }>(`/settlements/banks/${bankId}/reveal`);
    setRevealed((prev) => ({ ...prev, [bankId]: data.accountNumber }));
    return data.accountNumber;
  }

  async function toggleReveal(bank: SettlementBank) {
    if (revealed[bank.id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[bank.id];
        return next;
      });
      return;
    }
    setBusyId(bank.id);
    try {
      await fetchReveal(bank.id);
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not show account number",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function copyBank(bank: SettlementBank) {
    setBusyId(bank.id);
    try {
      const full = await fetchReveal(bank.id);
      Clipboard.setString(
        formatSettlementBankCopy({
          holderName: bank.holderName,
          accountNumber: full,
          ifsc: bank.ifsc,
        }),
      );
      showAlert("Copied", "Bank details copied");
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not copy bank details",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function registerBank() {
    setSaving(true);
    try {
      await api.post("/settlements/banks", {
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        holderName: holderName.trim(),
      });
      showAlert("Submitted", "Bank awaiting admin verification");
      setShowBank(false);
      setAccountNumber("");
      setIfsc("");
      setHolderName("");
      await load();
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not register bank",
      );
    } finally {
      setSaving(false);
    }
  }

  async function requestSettle() {
    if (!hasActiveBank) {
      showAlert("Bank required", "Add and verify a settlement bank first");
      return;
    }
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount) || parseFloat(amount) <= 0) {
      showAlert("Invalid amount", "Enter a valid amount greater than zero");
      return;
    }
    setSaving(true);
    try {
      await api.post(
        "/settlements/requests",
        { amount: amount.trim(), mode: "imps" },
        { headers: { "Idempotency-Key": idemRef.current } },
      );
      idemRef.current = newIdemKey();
      showAlert("Submitted", "Settlement requested");
      setAmount("");
      await load();
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not request settlement",
      );
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
          <Text style={[styles.title, { color: tokens.txt }]}>Settlements</Text>
          <View style={{ width: 48 }} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionRow}>
              <Text style={[styles.section, { color: tokens.txt, marginBottom: 0 }]}>Settlement banks</Text>
              <Pressable onPress={() => setShowBank((v) => !v)}>
                <Text style={{ color: colors.blueFlat, fontWeight: "800", fontSize: 13 }}>
                  {showBank ? "Cancel" : "+ Add bank"}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: tokens.mute }]}>
              Verified accounts used for withdrawals. Add a bank below if needed.
            </Text>

            {banks.length === 0 && !showBank ? (
              <Text style={{ color: tokens.sub, marginBottom: 8 }}>No settlement banks yet.</Text>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4, paddingRight: 8 }}
            >
              {banks.map((b) => {
                const active = b.verified && b.isActive;
                const full = revealed[b.id];
                const busy = busyId === b.id;
                return (
                  <View
                    key={b.id}
                    style={[
                      styles.bankCard,
                      {
                        borderColor: active ? colors.blueFlat : tokens.cardBorder,
                        backgroundColor: active ? `${colors.blueFlat}0D` : tokens.card,
                      },
                    ]}
                  >
                    <View style={styles.bankCardHeader}>
                      <BankLogo ifsc={b.ifsc} />
                      <StatusBadge tone={active ? "success" : b.verified ? "info" : "pending"}>
                        {b.verified ? (b.isActive ? "Active" : "Verified") : "Pending"}
                      </StatusBadge>
                    </View>
                    <Text style={[styles.acctLabel, { color: tokens.mute }]}>Account</Text>
                    <View style={styles.acctRow}>
                      <Text style={[styles.acctNum, { color: tokens.txt, flex: 1 }]} numberOfLines={1}>
                        {full ?? `**** ${b.accountNumberLast4}`}
                      </Text>
                      <Pressable
                        onPress={() => void toggleReveal(b)}
                        disabled={busy}
                        hitSlop={8}
                        style={styles.iconBtn}
                      >
                        {full ? (
                          <EyeOff size={16} color={colors.blueFlat} />
                        ) : (
                          <Eye size={16} color={colors.blueFlat} />
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => void copyBank(b)}
                        disabled={busy}
                        hitSlop={8}
                        style={styles.iconBtn}
                      >
                        <Copy size={16} color={colors.blueFlat} />
                      </Pressable>
                    </View>
                    <Text style={[styles.holder, { color: tokens.txt }]} numberOfLines={1}>
                      {b.holderName}
                    </Text>
                    <Text style={[styles.ifsc, { color: tokens.mute }]}>IFSC · {b.ifsc}</Text>
                  </View>
                );
              })}
            </ScrollView>

            {showBank ? (
              <View style={{ marginTop: 8 }}>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt },
                  ]}
                  placeholder="Account number"
                  placeholderTextColor={tokens.mute}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt },
                  ]}
                  placeholder="IFSC"
                  placeholderTextColor={tokens.mute}
                  autoCapitalize="characters"
                  value={ifsc}
                  onChangeText={setIfsc}
                />
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt },
                  ]}
                  placeholder="Holder name"
                  placeholderTextColor={tokens.mute}
                  value={holderName}
                  onChangeText={setHolderName}
                />
                <Pressable
                  style={[styles.submit, { opacity: saving ? 0.6 : 1 }]}
                  onPress={() => void registerBank()}
                  disabled={saving}
                >
                  <Text style={styles.submitText}>Submit for verification</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={[styles.section, { color: tokens.txt, marginTop: 20 }]}>Withdraw</Text>
            {!hasActiveBank ? (
              <Text style={{ color: tokens.mute, fontSize: 13, marginBottom: 8 }}>
                Add and verify a settlement bank before requesting a withdrawal.
              </Text>
            ) : null}
            <TextInput
              style={[
                styles.input,
                { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt },
              ]}
              placeholder="Amount (₹)"
              placeholderTextColor={tokens.mute}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(v) => {
                idemRef.current = newIdemKey();
                setAmount(v);
              }}
            />
            <Pressable
              style={[styles.submit, { opacity: saving || !hasActiveBank ? 0.6 : 1 }]}
              onPress={() => void requestSettle()}
              disabled={saving || !hasActiveBank}
            >
              <Text style={styles.submitText}>Request settlement</Text>
            </Pressable>

            <Text style={[styles.section, { color: tokens.txt, marginTop: 20 }]}>History</Text>
            {requests.length === 0 ? (
              <Text style={{ color: tokens.sub }}>No settlement requests yet.</Text>
            ) : (
              requests.map((r) => (
                <View
                  key={r.requestId}
                  style={[styles.histCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
                >
                  <Text style={{ color: tokens.txt, fontWeight: "700" }}>{formatINR(r.amount)}</Text>
                  <StatusBadge tone={toneFromStatus(r.status)} style={{ marginTop: 6 }}>
                    {r.status.replace(/_/g, " ")}
                  </StatusBadge>
                  <Text style={{ color: tokens.mute, fontSize: 12, marginTop: 4 }}>
                    {r.mode.toUpperCase()} · {r.bankUtr || r.failureReason || "—"}
                  </Text>
                </View>
              ))
            )}
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
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  section: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 16 },
  bankCard: {
    width: 260,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    marginRight: 12,
    shadowColor: "#0B2A9A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  bankCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bankIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bankLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  acctLabel: { fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", marginTop: 14 },
  acctRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  acctNum: { fontSize: 16, fontWeight: "800", letterSpacing: 1, fontVariant: ["tabular-nums"] },
  iconBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  holder: { fontSize: 14, fontWeight: "700", marginTop: 12 },
  ifsc: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  histCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  submit: {
    marginTop: 8,
    backgroundColor: colors.blue,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
