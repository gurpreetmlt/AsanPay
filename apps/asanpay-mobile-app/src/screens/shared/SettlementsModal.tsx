import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { api, fetchApi } from "../../lib/api";
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
    if (visible) void load();
  }, [visible, load]);

  const hasActiveBank = banks.some((b) => b.isActive && b.verified);

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
            <Text style={[styles.section, { color: tokens.txt }]}>Banks</Text>
            {banks.map((b) => (
              <View
                key={b.id}
                style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
              >
                <Text style={{ color: tokens.txt, fontWeight: "700" }}>
                  {b.holderName} · ****{b.accountNumberLast4}
                </Text>
                <Text style={{ color: tokens.mute, fontSize: 12, marginTop: 4 }}>{b.ifsc}</Text>
                <StatusBadge
                  tone={b.verified && b.isActive ? "success" : b.verified ? "info" : "pending"}
                  style={{ marginTop: 6 }}
                >
                  {b.verified ? (b.isActive ? "Active" : "Verified") : "Pending verification"}
                </StatusBadge>
              </View>
            ))}
            <Pressable
              style={[styles.secondaryBtn, { borderColor: colors.blue }]}
              onPress={() => setShowBank((v) => !v)}
            >
              <Text style={{ color: colors.blue, fontWeight: "800" }}>
                {showBank ? "Cancel" : "Add bank"}
              </Text>
            </Pressable>
            {showBank ? (
              <View style={{ marginTop: 8 }}>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
                  placeholder="Account number"
                  placeholderTextColor={tokens.mute}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
                  placeholder="IFSC"
                  placeholderTextColor={tokens.mute}
                  autoCapitalize="characters"
                  value={ifsc}
                  onChangeText={setIfsc}
                />
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
                  placeholder="Holder name"
                  placeholderTextColor={tokens.mute}
                  value={holderName}
                  onChangeText={setHolderName}
                />
                <Pressable style={[styles.submit, { opacity: saving ? 0.6 : 1 }]} onPress={() => void registerBank()} disabled={saving}>
                  <Text style={styles.submitText}>Submit bank</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={[styles.section, { color: tokens.txt, marginTop: 20 }]}>Withdraw</Text>
            <TextInput
              style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
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
                  style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
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
  section: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
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
