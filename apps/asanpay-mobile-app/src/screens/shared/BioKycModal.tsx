import React, { useCallback, useEffect, useState } from "react";
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
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { showAlert } from "../../components/AppAlert";
import { apiError } from "../../utils/apiError";
import { captureFingerprint } from "../../lib/rdServiceFingerprint";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

type SpKey = "WAP" | "DMI";

interface BioKycStatus {
  action: string;
  status: string;
  approved: boolean;
  outletAadhaarNumber: string | null;
  isFaceAuthAvailable: boolean;
  isBiometricKycMandatory: boolean;
  pidOptionWadh: string | null;
  referenceKey: string | null;
  referenceKeyType: string | null;
  live: boolean;
}

const RAILS: { key: SpKey; label: string }[] = [
  { key: "WAP", label: "AePS" },
  { key: "DMI", label: "DMT" },
];

export function BioKycModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [spKey, setSpKey] = useState<SpKey>("WAP");
  const [status, setStatus] = useState<BioKycStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [aadhaar, setAadhaar] = useState("");

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<BioKycStatus>>(
        "/onboarding/instantpay/bio-kyc-status",
        { spKey },
      );
      if (!data.success) throw new Error(data.message);
      setStatus(data.data);
    } catch (err) {
      setStatus(null);
      showAlert("Status failed", apiError(err, "Could not load biometric KYC status"));
    } finally {
      setLoading(false);
    }
  }, [spKey]);

  useEffect(() => {
    if (visible) void refreshStatus();
  }, [visible, refreshStatus]);

  const needsCapture =
    status &&
    !status.approved &&
    String(status.action).toUpperCase().includes("ACTION-REQUIRED");
  const needsAadhaar = Boolean(needsCapture && !status?.outletAadhaarNumber);

  async function submitBioKyc() {
    if (!status?.referenceKey) {
      showAlert("Missing key", "Refresh status first — reference key is required");
      return;
    }
    if (needsAadhaar && aadhaar.replace(/\D/g, "").length !== 12) {
      showAlert("Aadhaar required", "Enter the 12-digit Aadhaar linked to this outlet");
      return;
    }
    if (status.live && !status.pidOptionWadh) {
      showAlert("Missing wadh", "Refresh status and try again — wadh is required for capture");
      return;
    }

    setScanning(true);
    try {
      const biometricPayload = await captureFingerprint(undefined, {
        wadh: status.pidOptionWadh || undefined,
      });
      const body: Record<string, string> = {
        referenceKey: status.referenceKey,
        biometricPayload,
      };
      if (needsAadhaar) body.aadhaarNumber = aadhaar.replace(/\D/g, "");

      const { data } = await api.post<ApiResponse<{ message: string }>>(
        "/onboarding/instantpay/bio-kyc",
        body,
      );
      if (!data.success) throw new Error(data.message);
      showAlert("Submitted", data.data.message || "Biometric KYC submitted");
      await refreshStatus();
    } catch (err) {
      showAlert("Biometric KYC failed", apiError(err, "Fingerprint verification failed"));
    } finally {
      setScanning(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.txt }]}>Biometric KYC</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.hint, { color: tokens.sub }]}>
            Fingerprint eKYC on InstantPay. Capture must use the wadh value from status.
          </Text>

          <View style={styles.railRow}>
            {RAILS.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => setSpKey(r.key)}
                style={[
                  styles.railBtn,
                  {
                    borderColor: spKey === r.key ? colors.blueFlat : tokens.cardBorder,
                    backgroundColor: spKey === r.key ? `${colors.blueFlat}14` : tokens.card,
                  },
                ]}
              >
                <Text style={{ color: tokens.txt, fontWeight: "700" }}>{r.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.secondaryBtn, { borderColor: tokens.cardBorder }]}
            onPress={() => void refreshStatus()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.blueFlat} />
            ) : (
              <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Refresh status</Text>
            )}
          </Pressable>

          {status ? (
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.meta, { color: tokens.sub }]}>Action: {status.action || "—"}</Text>
              <Text style={[styles.meta, { color: tokens.txt }]}>
                Status: {status.status || "—"}
                {status.approved ? " · Ready" : ""}
              </Text>
              <Text style={[styles.meta, { color: tokens.sub }]}>
                Aadhaar: {status.outletAadhaarNumber || "Not on file"}
              </Text>
              <Text style={[styles.meta, { color: tokens.sub }]}>
                Mode: {status.live ? "Live InstantPay" : "Auto-approved (not InstantPay)"}
              </Text>
            </View>
          ) : null}

          {needsAadhaar ? (
            <View style={styles.field}>
              <Text style={[styles.label, { color: tokens.sub }]}>Aadhaar (12 digits)</Text>
              <TextInput
                style={[
                  styles.input,
                  { color: tokens.txt, borderColor: tokens.cardBorder, backgroundColor: tokens.card },
                ]}
                keyboardType="number-pad"
                maxLength={12}
                value={aadhaar}
                onChangeText={(t) => setAadhaar(t.replace(/\D/g, "").slice(0, 12))}
                placeholderTextColor={tokens.mute}
              />
            </View>
          ) : null}

          {needsCapture ? (
            <Pressable
              style={[styles.primaryBtn, { opacity: scanning ? 0.6 : 1 }]}
              disabled={scanning}
              onPress={() => void submitBioKyc()}
            >
              {scanning ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Capture & submit</Text>
              )}
            </Pressable>
          ) : status?.approved ? (
            <Text style={{ color: colors.green, fontWeight: "600", marginTop: 8 }}>
              This rail is approved.
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
  content: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  railRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  railBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    marginBottom: 12,
  },
  meta: { fontSize: 13 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: colors.blueFlat,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
