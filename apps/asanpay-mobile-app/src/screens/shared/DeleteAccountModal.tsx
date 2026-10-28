import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { CheckCircle2, Trash2 } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { ModalSheet } from "../../components/ModalSheet";
import { showAlert } from "../../components/AppAlert";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { colors, gradientDirection } from "../../theme/colors";

const REASON_MAX = 300;

const DELETION_FACTS = [
  "Your login, profile and saved devices are removed within 30 days.",
  "Transaction and KYC records are kept for 5 years as required by law, then deleted.",
  "Withdraw or settle your wallet balance before you send this request.",
];

type DeletionStatus = { status: "none" | "requested"; requestedAt: string | null };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function DeleteAccountModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [requestedAt, setRequestedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setReason("");
    setLoading(true);
    void api
      .get<ApiResponse<DeletionStatus>>("/account/deletion-request")
      .then(({ data }) => {
        if (alive) setRequestedAt(data.success && data.data.status === "requested" ? data.data.requestedAt : null);
      })
      .catch(() => {
        if (alive) setRequestedAt(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  async function submit() {
    if (submitting) return;
    if (reason.trim().length > REASON_MAX) {
      showAlert("Reason too long", `Reason must be ${REASON_MAX} characters or less`);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<ApiResponse<{ requestedAt: string }>>("/account/deletion-request", {
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (!data.success) throw new Error(data.message);
      setRequestedAt(data.data.requestedAt);
    } catch (err) {
      showAlert(
        "Request not sent",
        apiError(err, "Could not send the deletion request. Check your internet connection and try again."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (requestedAt) {
    return (
      <ModalSheet
        visible={visible}
        title="Deletion requested"
        subtitle="We will delete your account within 30 days"
        icon={<CheckCircle2 />}
        iconTone="green"
        onClose={onClose}
      >
        <View style={[styles.card, styles.successCard]}>
          <Text style={styles.successTitle}>Request received on {formatDate(requestedAt)}</Text>
          <Text style={styles.successText}>
            Our support team may call your registered mobile number to confirm. Transaction and KYC records are
            kept for 5 years as required by law.
          </Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button">
          <LinearGradient
            colors={[...colors.gradient]}
            start={gradientDirection.diagonal.start}
            end={gradientDirection.diagonal.end}
            style={styles.btn}
          >
            <Text style={styles.btnTextLight}>Done</Text>
          </LinearGradient>
        </Pressable>
      </ModalSheet>
    );
  }

  return (
    <ModalSheet
      visible={visible}
      title="Delete account"
      subtitle="Request permanent deletion of your AsanPay account"
      icon={<Trash2 />}
      iconTone="red"
      onClose={onClose}
    >
      {loading ? (
        <ActivityIndicator color={colors.blueFlat} style={{ marginVertical: 24 }} />
      ) : (
        <>
          <View style={styles.card}>
            {DELETION_FACTS.map((fact) => (
              <View key={fact} style={styles.factRow}>
                <View style={styles.factDot} />
                <Text style={styles.factText}>{fact}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.label}>Reason (optional)</Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Tell us why you are leaving"
            placeholderTextColor={colors.textLight}
            maxLength={REASON_MAX}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.helper}>
            {reason.length}/{REASON_MAX} characters
          </Text>

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={[styles.btn, styles.btnSecondary, styles.footerBtn]}
              accessibilityRole="button"
            >
              <Text style={styles.btnTextSecondary}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={submitting}
              style={[styles.footerBtn, { opacity: submitting ? 0.6 : 1 }]}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={[colors.danger, colors.dangerDark]}
                start={gradientDirection.diagonal.start}
                end={gradientDirection.diagonal.end}
                style={styles.btn}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.btnTextLight}>Request deletion</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F7F9FF",
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  factRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  factDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger, marginTop: 7 },
  factText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.text },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 84,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  helper: { fontSize: 11.5, color: colors.textMuted, marginTop: 4, textAlign: "right" },
  footer: { flexDirection: "row", gap: 10, marginTop: 18 },
  footerBtn: { flex: 1 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", minHeight: 50 },
  btnSecondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  btnTextLight: { color: colors.white, fontSize: 15, fontWeight: "800" },
  btnTextSecondary: { color: colors.text, fontSize: 15, fontWeight: "700" },
  successCard: { backgroundColor: colors.greenBg, borderColor: colors.greenBg },
  successTitle: { fontSize: 14, fontWeight: "800", color: colors.greenDark },
  successText: { fontSize: 13, lineHeight: 19, color: colors.greenDark },
});
