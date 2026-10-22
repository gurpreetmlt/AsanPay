import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { showAlert } from "../../components/AppAlert";
import { apiError } from "../../utils/apiError";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

export function NobleCmsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [merchantId, setMerchantId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [lastTxn, setLastTxn] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post<
        ApiResponse<{ redirectionUrl: string; transactionId: string }>
      >("/noble/cms/start", {
        merchantId: merchantId.trim(),
        ...(transactionId.trim() ? { transactionId: transactionId.trim() } : {}),
      });
      if (!data.success) throw new Error(data.message);
      setLastTxn(data.data.transactionId);
      const url = data.data.redirectionUrl;
      if (url) await Linking.openURL(url);
      showAlert("CMS started", "Complete the payment in the opened bank page, then check status.");
    } catch (err) {
      showAlert("CMS start failed", apiError(err, "Could not start CMS"));
    } finally {
      setBusy(false);
    }
  }

  async function status() {
    const tid = lastTxn || transactionId.trim();
    if (!tid) {
      showAlert("Transaction id required", "Start CMS first or enter a transaction id");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<
        ApiResponse<{ tranStatus: string; amount: string; utr: string }>
      >("/noble/cms/status", { transactionId: tid });
      if (!data.success) throw new Error(data.message);
      showAlert(
        "CMS status",
        `Status: ${data.data.tranStatus || "—"}\nAmount: ${data.data.amount || "—"}\nUTR: ${data.data.utr || "—"}`,
      );
    } catch (err) {
      showAlert("CMS status failed", apiError(err, "Could not fetch CMS status"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.txt }]}>CMS</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          <Text style={[styles.hint, { color: tokens.sub }]}>
            Airtel CMS — start opens the bank plugin, then check status.
          </Text>
          <Text style={[styles.label, { color: tokens.sub }]}>Merchant id</Text>
          <TextInput
            style={[styles.input, { color: tokens.txt, borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
            value={merchantId}
            onChangeText={(t) => setMerchantId(t.replace(/\D/g, "").slice(0, 10))}
            keyboardType="number-pad"
            maxLength={10}
            placeholderTextColor={tokens.mute}
          />
          <Text style={[styles.label, { color: tokens.sub }]}>Transaction id (optional)</Text>
          <TextInput
            style={[styles.input, { color: tokens.txt, borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
            value={transactionId}
            onChangeText={(t) => setTransactionId(t.slice(0, 25))}
            maxLength={25}
            placeholderTextColor={tokens.mute}
          />
          <Pressable style={[styles.primary, { opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={() => void start()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Start CMS</Text>}
          </Pressable>
          <Pressable style={[styles.secondary, { borderColor: tokens.cardBorder }]} disabled={busy} onPress={() => void status()}>
            <Text style={{ color: colors.blueFlat, fontWeight: "700" }}>Check status</Text>
          </Pressable>
        </View>
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
  title: { fontSize: 18, fontWeight: "700" },
  body: { padding: 16, gap: 8 },
  hint: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  primary: {
    marginTop: 12,
    backgroundColor: colors.blueFlat,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondary: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
});
