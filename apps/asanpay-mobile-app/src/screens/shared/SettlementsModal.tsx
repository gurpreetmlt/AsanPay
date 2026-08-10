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
import { formatSettlementBankCopy } from "../../lib/bankLogo";
import { formatINR } from "../../lib/format";
import { showAlert } from "../../components/AppAlert";
import { BankDetailCard } from "../../components/BankDetailCard";
import { StatusBadge, toneFromStatus } from "../../components/StatusBadge";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import Clipboard from "@react-native-clipboard/clipboard";

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
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
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

  async function sendOtp() {
    setOtpSending(true);
    try {
      const res = await api.post<{
        success: boolean;
        data?: { expiresInSec: number; otp?: string };
        message?: string;
      }>("/settlements/banks/otp");
      setOtpSent(true);
      const testOtp = res.data?.data?.otp;
      if (testOtp) {
        setOtp(testOtp);
        showAlert("OTP ready", `Use code ${testOtp}`);
      } else {
        showAlert("OTP sent", "Check your registered mobile for the 6-digit code");
      }
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not send OTP",
      );
    } finally {
      setOtpSending(false);
    }
  }

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
    if (hasActiveBank && !/^\d{6}$/.test(otp.trim())) {
      showAlert("OTP required", "Send OTP, then enter the 6-digit code to change your bank");
      return;
    }
    setSaving(true);
    try {
      await api.post("/settlements/banks", {
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        holderName: holderName.trim(),
        ...(hasActiveBank ? { otp: otp.trim() } : {}),
      });
      showAlert("Submitted", "Bank awaiting admin verification");
      setShowBank(false);
      setAccountNumber("");
      setIfsc("");
      setHolderName("");
      setOtp("");
      setOtpSent(false);
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
                <Text
                  style={{
                    color: showBank ? colors.danger : colors.green,
                    fontWeight: "800",
                    fontSize: 13,
                  }}
                >
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
                return (
                  <BankDetailCard
                    key={b.id}
                    ifsc={b.ifsc}
                    holderName={b.holderName}
                    accountMasked={`**** ${b.accountNumberLast4}`}
                    accountFull={revealed[b.id]}
                    revealed={Boolean(revealed[b.id])}
                    revealing={busyId === b.id}
                    onToggleReveal={() => void toggleReveal(b)}
                    onCopy={() => void copyBank(b)}
                    statusTone={active ? "success" : b.verified ? "info" : "pending"}
                    statusLabel={b.verified ? (b.isActive ? "Active" : "Verified") : "Pending"}
                  />
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
                {hasActiveBank ? (
                  <View style={[styles.otpBox, { borderColor: "#FDBA74", backgroundColor: "#FFF7ED" }]}>
                    <Text style={styles.otpHint}>
                      Active bank change needs OTP. Tap Send OTP, then enter the code.
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt, marginBottom: 8 },
                      ]}
                      placeholder="6-digit OTP"
                      placeholderTextColor={tokens.mute}
                      keyboardType="number-pad"
                      maxLength={6}
                      value={otp}
                      onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                    />
                    <Pressable
                      style={[styles.secondaryBtn, { borderColor: colors.blueFlat, opacity: otpSending ? 0.6 : 1 }]}
                      onPress={() => void sendOtp()}
                      disabled={otpSending}
                    >
                      <Text style={{ color: colors.blueFlat, fontWeight: "800" }}>
                        {otpSent ? "Resend OTP" : "Send OTP"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
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
  histCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  otpBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  otpHint: { fontSize: 13, fontWeight: "600", color: "#C2410C", marginBottom: 8, lineHeight: 18 },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 4,
  },
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
