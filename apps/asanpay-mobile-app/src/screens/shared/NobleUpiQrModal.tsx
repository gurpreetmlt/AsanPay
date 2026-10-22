import React, { useEffect, useState } from "react";
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
import Geolocation from "@react-native-community/geolocation";
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { showAlert } from "../../components/AppAlert";
import { apiError } from "../../utils/apiError";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

export function NobleUpiQrModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [form, setForm] = useState({ amount: "", mobileNumber: "", latitude: "", longitude: "" });

  useEffect(() => {
    if (visible && user?.mobile) {
      setForm((f) => ({ ...f, mobileNumber: f.mobileNumber || user.mobile }));
    }
  }, [visible, user]);

  function captureLocation() {
    Geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(4),
          longitude: pos.coords.longitude.toFixed(4),
        }));
        showAlert("Location captured", "Shop geo updated from GPS.");
      },
      (err) => showAlert("Location failed", err.message || "Allow location access before continuing"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function generate() {
    if (busy) return;
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showAlert("Location required", "Allow location access before continuing");
      return;
    }
    setBusy(true);
    setQr("");
    try {
      await api.post("/noble/upi-qr/load", { channel: "APP" });
      const { data } = await api.post<ApiResponse<{ qr: string; transactionId: string }>>(
        "/noble/upi-qr/generate",
        {
          amount: form.amount.trim(),
          mobileNumber: form.mobileNumber.replace(/\D/g, "").slice(0, 10),
          latitude: lat,
          longitude: lng,
          channel: "APP",
        },
      );
      if (!data.success) throw new Error(data.message);
      setQr(data.data.qr || "");
      showAlert("UPI QR generated", data.data.transactionId ? `Txn: ${data.data.transactionId}` : "Scan the QR payload below.");
    } catch (err) {
      showAlert("UPI QR failed", apiError(err, "Could not generate UPI QR"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.txt }]}>UPI QR</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[styles.hint, { color: tokens.sub }]}>
            Generate a UPI QR for collection. Complete AEPS agent onboarding first.
          </Text>
          <Text style={[styles.label, { color: tokens.sub }]}>Amount</Text>
          <TextInput
            style={[styles.input, { color: tokens.txt, borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
            value={form.amount}
            onChangeText={(t) => setForm((f) => ({ ...f, amount: t }))}
            keyboardType="decimal-pad"
            placeholderTextColor={tokens.mute}
          />
          <Text style={[styles.label, { color: tokens.sub }]}>Customer mobile</Text>
          <TextInput
            style={[styles.input, { color: tokens.txt, borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
            value={form.mobileNumber}
            onChangeText={(t) => setForm((f) => ({ ...f, mobileNumber: t.replace(/\D/g, "").slice(0, 10) }))}
            keyboardType="number-pad"
            maxLength={10}
            placeholderTextColor={tokens.mute}
          />
          <Pressable style={[styles.secondary, { borderColor: tokens.cardBorder }]} onPress={captureLocation}>
            <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Use current location</Text>
          </Pressable>
          <Pressable style={[styles.primary, { opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={() => void generate()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Generate QR</Text>}
          </Pressable>
          {qr ? (
            <Text selectable style={[styles.qr, { color: tokens.txt, borderColor: tokens.cardBorder }]}>
              {qr}
            </Text>
          ) : null}
        </ScrollView>
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
  body: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  secondary: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  primary: {
    marginTop: 12,
    backgroundColor: colors.blueFlat,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  qr: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
  },
});
