import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle2, Search } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { formatINR } from "../../lib/format";
import { createAttemptKeyHolder } from "../../lib/idempotencyKey";
import { useTxnPin } from "../../hooks/useTxnPin";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";

type Step = "pick" | "add" | "amount" | "done";
type Mode = "imps" | "neft";

interface Beneficiary {
  id: string;
  name: string;
  mobile: string;
  accountNumber: string;
  ifsc: string;
}

interface DmtScreenProps {
  onBack: () => void;
}

export function DmtScreen({ onBack }: DmtScreenProps) {
  const { tokens } = useTheme();
  const { promptPin, TxnPinPrompt } = useTxnPin();

  const [step, setStep] = useState<Step>("pick");
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [selected, setSelected] = useState<Beneficiary | null>(null);

  const [newName, setNewName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [newIfsc, setNewIfsc] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Mode>("imps");
  const [sending, setSending] = useState(false);
  const [txnRef, setTxnRef] = useState("");
  const transferAttemptKey = React.useRef(createAttemptKeyHolder("dmt"));

  async function addBeneficiary() {
    if (newName.trim().length < 2 || newMobile.length !== 10 || newAccount.length < 6 || !newIfsc) {
      showAlert("Incomplete", "Fill all beneficiary fields correctly.");
      return;
    }
    setAddLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ beneficiaryId: string }>>(
        "/txn/dmt/beneficiary",
        { customerMobile: newMobile, name: newName.trim(), accountNumber: newAccount, ifsc: newIfsc.toUpperCase() },
      );
      if (!data.success) throw new Error(data.message);
      const beneficiary: Beneficiary = {
        id: data.data.beneficiaryId,
        name: newName.trim(),
        mobile: newMobile,
        accountNumber: newAccount,
        ifsc: newIfsc.toUpperCase(),
      };
      setBeneficiaries((prev) => [...prev, beneficiary]);
      setSelected(beneficiary);
      setNewName("");
      setNewMobile("");
      setNewAccount("");
      setNewIfsc("");
      setStep("amount");
    } catch (err) {
      showAlert("Could not add beneficiary", apiError(err, "Please try again"));
    } finally {
      setAddLoading(false);
    }
  }

  async function confirmTransfer() {
    if (!selected || !amount || sending) return;
    try {
      const txnAuth = await promptPin();
      setSending(true);
      const idempotencyKey = transferAttemptKey.current.get();
      const { data } = await api.post<ApiResponse<{ txn: { txnRef: string; status: string } }>>(
        "/txn/dmt/transfer",
        {
          idempotencyKey,
          txnAuth,
          customerMobile: selected.mobile,
          beneficiaryId: selected.id,
          amount,
          mode,
        },
      );
      if (!data.success) throw new Error(data.message);
      transferAttemptKey.current.clear();
      setTxnRef(data.data.txn?.txnRef ?? idempotencyKey);
      setStep("done");
    } catch (err) {
      if (err) showAlert("Transfer failed", apiError(err, "Could not complete transfer"));
    } finally {
      setSending(false);
    }
  }

  const stepLabel =
    step === "pick" || step === "add" ? "Select beneficiary" : step === "amount" ? "Enter amount" : "Complete";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
      <LinearGradient
        colors={[colors.blueLight, colors.blue]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={styles.header}
      >
        <Pressable onPress={() => (step === "pick" ? onBack() : setStep("pick"))} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Money Transfer</Text>
          <Text style={styles.headerSub}>Domestic Money Transfer · {stepLabel}</Text>
        </View>
      </LinearGradient>

      {step === "pick" ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.searchRow, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Search size={16} color={tokens.mute} />
            <Text style={[styles.searchPlaceholder, { color: tokens.mute }]}>
              Search sender mobile or beneficiary
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: tokens.txt }]}>Saved Beneficiaries</Text>
          {beneficiaries.length === 0 ? (
            <Text style={[styles.emptyText, { color: tokens.sub }]}>No beneficiaries yet. Add one below.</Text>
          ) : (
            beneficiaries.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => {
                  setSelected(b);
                  transferAttemptKey.current.clear();
                  setStep("amount");
                }}
                style={[styles.benefRow, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
              >
                <View style={styles.benefAvatar}>
                  <Text style={styles.benefAvatarText}>{b.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.benefName, { color: tokens.txt2 }]}>{b.name}</Text>
                  <Text style={[styles.benefSub, { color: tokens.mute }]}>
                    {b.ifsc} · •••• {b.accountNumber.slice(-4)}
                  </Text>
                </View>
                <Text style={{ color: tokens.mute }}>→</Text>
              </Pressable>
            ))
          )}

          <Pressable onPress={() => setStep("add")} style={[styles.addBtn, { backgroundColor: tokens.softBlue }]}>
            <Text style={styles.addBtnText}>+ Add New Beneficiary</Text>
          </Pressable>
        </ScrollView>
      ) : null}

      {step === "add" ? (
        <ScrollView contentContainerStyle={styles.content}>
          {[
            { label: "BENEFICIARY NAME", value: newName, set: setNewName, kb: "default" as const, ph: "e.g. Ramesh Singh" },
            { label: "MOBILE NUMBER", value: newMobile, set: (t: string) => setNewMobile(t.replace(/\D/g, "").slice(0, 10)), kb: "number-pad" as const, ph: "9876543210" },
            { label: "ACCOUNT NUMBER", value: newAccount, set: (t: string) => setNewAccount(t.replace(/\D/g, "")), kb: "number-pad" as const, ph: "Bank account number" },
            { label: "IFSC CODE", value: newIfsc, set: (t: string) => setNewIfsc(t.toUpperCase()), kb: "default" as const, ph: "SBIN0001234" },
          ].map((f) => (
            <View key={f.label} style={{ marginBottom: 16 }}>
              <Text style={[styles.label, { color: tokens.sub }]}>{f.label}</Text>
              <TextInput
                value={f.value}
                onChangeText={f.set}
                placeholder={f.ph}
                keyboardType={f.kb}
                autoCapitalize="characters"
                placeholderTextColor={tokens.mute}
                style={[styles.input, { color: tokens.txt2, backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder }]}
              />
            </View>
          ))}
          <Pressable onPress={addBeneficiary} disabled={addLoading} style={styles.primaryBtn}>
            {addLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save Beneficiary</Text>}
          </Pressable>
        </ScrollView>
      ) : null}

      {step === "amount" && selected ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.benefRow, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <View style={styles.benefAvatar}>
              <Text style={styles.benefAvatarText}>{selected.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={[styles.benefName, { color: tokens.txt2 }]}>{selected.name}</Text>
              <Text style={[styles.benefSub, { color: tokens.mute }]}>{selected.ifsc}</Text>
            </View>
          </View>

          <View style={styles.amountWrap}>
            <Text style={[styles.label, { color: tokens.sub }]}>ENTER AMOUNT</Text>
            <View style={styles.amountRow}>
              <Text style={[styles.rupee, { color: tokens.txt }]}>₹</Text>
              <TextInput
                value={amount}
                onChangeText={(t) => {
                  setAmount(t.replace(/\D/g, ""));
                  transferAttemptKey.current.clear();
                }}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={tokens.mute}
                style={[styles.amountInput, { color: colors.blueFlat }]}
              />
            </View>
            <View style={[styles.amountUnderline, { backgroundColor: tokens.inputBorder }]} />
          </View>

          <Text style={[styles.label, { color: tokens.sub, marginTop: 22, marginBottom: 9 }]}>TRANSFER MODE</Text>
          <View style={styles.modeRow}>
            {(["imps", "neft"] as Mode[]).map((m) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[
                    styles.modeChip,
                    { borderColor: active ? colors.blue : tokens.cardBorder, backgroundColor: active ? colors.blue : tokens.card },
                  ]}
                >
                  <Text style={[styles.modeTitle, { color: active ? "#fff" : tokens.txt2 }]}>{m.toUpperCase()}</Text>
                  <Text style={[styles.modeDesc, { color: active ? "rgba(255,255,255,.75)" : tokens.mute }]}>
                    {m === "imps" ? "Instant" : "2-4 hours"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={confirmTransfer}
            disabled={!amount || sending}
            style={[styles.primaryBtn, (!amount || sending) && styles.primaryBtnDisabled]}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send {amount ? formatINR(amount) : ""}</Text>}
          </Pressable>
        </ScrollView>
      ) : null}

      {step === "done" && selected ? (
        <View style={styles.doneContent}>
          <LinearGradient colors={[...colors.gradientButton]} style={styles.successIcon}>
            <CheckCircle2 size={40} color="#fff" strokeWidth={2.3} />
          </LinearGradient>
          <Text style={[styles.doneTitle, { color: tokens.txt }]}>Transfer Successful</Text>
          <Text style={styles.doneAmount}>{formatINR(amount)}</Text>
          <Text style={[styles.doneSub, { color: tokens.sub }]}>sent to {selected.name}</Text>

          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            {[
              { k: "Reference No.", v: txnRef },
              { k: "Mode", v: mode.toUpperCase() },
              { k: "Account", v: `•••• ${selected.accountNumber.slice(-4)}` },
              { k: "Date & Time", v: new Date().toLocaleString("en-IN") },
            ].map((r, i, arr) => (
              <View key={r.k} style={[styles.receiptRow, i < arr.length - 1 && { borderBottomColor: tokens.cardBorder, borderBottomWidth: 1 }]}>
                <Text style={[styles.receiptK, { color: tokens.sub }]}>{r.k}</Text>
                <Text style={[styles.receiptV, { color: tokens.txt2 }]}>{r.v}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={onBack} style={[styles.primaryBtn, { marginTop: 18 }]}>
            <Text style={styles.primaryBtnText}>Back to Home</Text>
          </Pressable>
        </View>
      ) : null}

      <TxnPinPrompt />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 22, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,.16)", alignItems: "center", justifyContent: "center" },
  backBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerTitle: { fontFamily: "System", fontWeight: "700", fontSize: 18, color: "#fff" },
  headerSub: { fontSize: 12, color: "#B9C6F2", fontWeight: "500", marginTop: 1 },
  content: { padding: 20, paddingBottom: 30 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 15 },
  searchPlaceholder: { fontSize: 13.5, fontWeight: "500" },
  sectionTitle: { marginTop: 18, marginBottom: 11, fontFamily: "System", fontWeight: "700", fontSize: 14 },
  emptyText: { fontSize: 13, fontWeight: "500", paddingVertical: 8 },
  benefRow: { flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 11 },
  benefAvatar: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  benefAvatarText: { color: "#fff", fontFamily: "System", fontWeight: "700", fontSize: 16 },
  benefName: { fontFamily: "System", fontWeight: "700", fontSize: 15 },
  benefSub: { fontSize: 12, fontWeight: "500", marginTop: 1 },
  addBtn: { marginTop: 6, height: 50, borderRadius: 15, borderWidth: 1.5, borderColor: "#B9C6F2", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  addBtnText: { fontFamily: "System", fontWeight: "700", fontSize: 14.5, color: colors.blueFlat },
  label: { fontSize: 12.5, fontWeight: "700", letterSpacing: 0.3, marginBottom: 8 },
  input: { height: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 15, fontSize: 15, fontWeight: "600" },
  primaryBtn: { marginTop: 8, height: 54, borderRadius: 16, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontFamily: "System", fontWeight: "700", fontSize: 16 },
  amountWrap: { marginTop: 24, alignItems: "center" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rupee: { fontFamily: "System", fontWeight: "700", fontSize: 32 },
  amountInput: { minWidth: 100, textAlign: "center", fontFamily: "System", fontWeight: "800", fontSize: 40 },
  amountUnderline: { height: 2, width: 200, marginTop: 4 },
  modeRow: { flexDirection: "row", gap: 10 },
  modeChip: { flex: 1, borderRadius: 13, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 10 },
  modeTitle: { fontFamily: "System", fontWeight: "700", fontSize: 14 },
  modeDesc: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  doneContent: { flex: 1, alignItems: "center", padding: 22, paddingTop: 40 },
  successIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  doneTitle: { marginTop: 18, fontFamily: "System", fontWeight: "800", fontSize: 22 },
  doneAmount: { marginTop: 6, fontFamily: "System", fontWeight: "800", fontSize: 32, color: colors.greenDark },
  doneSub: { fontSize: 13, fontWeight: "500", marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, marginTop: 22, width: "100%" },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  receiptK: { fontSize: 13, fontWeight: "500" },
  receiptV: { fontSize: 13, fontWeight: "700" },
});
