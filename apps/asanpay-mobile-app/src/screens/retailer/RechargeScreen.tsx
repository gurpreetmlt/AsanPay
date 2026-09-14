import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { createAttemptKeyHolder } from "../../lib/idempotencyKey";
import { apiError } from "../../utils/apiError";
import { showAlert } from "../../components/AppAlert";
import { useTxnPin } from "../../hooks/useTxnPin";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

type ServiceCode = "MOBILE_PREPAID" | "DTH";

const MOBILE_OPS = [
  { code: "JIO", label: "Reliance JIO" },
  { code: "AT", label: "Airtel" },
  { code: "VI", label: "Vi" },
  { code: "BL", label: "BSNL" },
  { code: "JPL", label: "Jio Lite" },
  { code: "TESTOP", label: "TestOperator" },
] as const;

const DTH_OPS = [
  { code: "TTV", label: "Tata Play" },
  { code: "ATV", label: "Airtel Digital TV" },
  { code: "DTV", label: "Dish TV" },
  { code: "STV", label: "Sun Direct" },
  { code: "VTV", label: "d2h" },
] as const;

type Props = {
  serviceCode: ServiceCode;
  onBack: () => void;
};

export function RechargeScreen({ serviceCode, onBack }: Props) {
  const { tokens } = useTheme();
  const { promptPin, TxnPinPrompt } = useTxnPin();
  const ops = serviceCode === "DTH" ? DTH_OPS : MOBILE_OPS;
  const [accountRef, setAccountRef] = useState("");
  const [operatorCode, setOperatorCode] = useState(ops[0]!.code);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder("recharge"));

  const title = useMemo(
    () => (serviceCode === "DTH" ? "DTH recharge" : "Mobile prepaid"),
    [serviceCode],
  );

  async function onSubmit() {
    if (loading) return;
    const number = accountRef.replace(/\D/g, "");
    if (serviceCode === "MOBILE_PREPAID" && number.length !== 10) {
      showAlert("Mobile number", "Enter a valid 10-digit mobile");
      return;
    }
    if (serviceCode === "DTH" && number.length < 8) {
      showAlert("Subscriber ID", "Enter a valid DTH subscriber number");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) {
      showAlert("Amount", "Enter a valid recharge amount");
      return;
    }

    setLoading(true);
    try {
      const txnAuth = await promptPin();
      const body: Record<string, string> = {
        serviceCode,
        operatorCode,
        accountRef: number,
        amount: amount.trim(),
        idempotencyKey: attemptKey.current.get(),
      };
      if (txnAuth) body.txnAuth = txnAuth;

      const { data } = await api.post<
        ApiResponse<{ txn?: { txnRef?: string; status?: string }; provider?: { message?: string } }>
      >("/txn/recharge", body);

      if (!data.success) throw new Error(data.message || "Recharge failed");
      const status = data.data?.txn?.status ?? "pending";
      const ref = data.data?.txn?.txnRef ?? "";
      attemptKey.current.clear();
      if (status === "success") {
        showAlert("Recharge successful", ref ? `Ref: ${ref}` : "Done");
      } else if (status === "failed") {
        showAlert("Recharge failed", data.data?.provider?.message || data.message || "Failed");
      } else {
        showAlert("Recharge submitted", ref ? `Pending — ref ${ref}` : "Status pending. Check Transactions.");
      }
      setAmount("");
    } catch (err) {
      showAlert("Recharge failed", apiError(err, "Recharge failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <ArrowLeft size={22} color={colors.blue} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.txt }]}>{title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: tokens.txt }]}>
          {serviceCode === "DTH" ? "Subscriber ID" : "Mobile number"}
        </Text>
        <TextInput
          style={[styles.input, { borderColor: tokens.inputBorder, color: tokens.txt, backgroundColor: tokens.inputBg }]}
          keyboardType="number-pad"
          maxLength={serviceCode === "DTH" ? 20 : 10}
          value={accountRef}
          onChangeText={(t) => setAccountRef(t.replace(/\D/g, ""))}
          placeholder={serviceCode === "DTH" ? "DTH number" : "10-digit mobile"}
          placeholderTextColor={tokens.mute}
        />

        <Text style={[styles.label, { color: tokens.txt }]}>Operator</Text>
        <View style={styles.opRow}>
          {ops.map((o) => {
            const on = o.code === operatorCode;
            return (
              <Pressable
                key={o.code}
                onPress={() => setOperatorCode(o.code)}
                style={[
                  styles.opChip,
                  {
                    borderColor: on ? colors.blue : tokens.cardBorder,
                    backgroundColor: on ? `${colors.blue}14` : tokens.card,
                  },
                ]}
              >
                <Text style={{ color: on ? colors.blue : tokens.txt, fontWeight: "600", fontSize: 13 }}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: tokens.txt }]}>Amount (₹)</Text>
        <TextInput
          style={[styles.input, { borderColor: tokens.inputBorder, color: tokens.txt, backgroundColor: tokens.inputBg }]}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="e.g. 199"
          placeholderTextColor={tokens.mute}
        />

        <Pressable
          onPress={() => void onSubmit()}
          disabled={loading}
          style={[styles.cta, { backgroundColor: colors.blue, opacity: loading ? 0.7 : 1 }]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Recharge</Text>}
        </Pressable>
      </ScrollView>
      <TxnPinPrompt />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: "700" },
  body: { padding: 16, paddingBottom: 40, gap: 8 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  opRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  opChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  cta: { marginTop: 20, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
