import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Check, Download } from "lucide-react-native";
import { PopupCloseButton } from "./PopupCloseButton";
import { PRIVACY_BODY, TERMS_BODY, buildLegalDownloadText } from "@asanpay/shared-types";
import { colors } from "../theme/colors";
import { showAlert } from "./AppAlert";

type LegalDoc = "terms" | "privacy";

const DOCS: Record<LegalDoc, { title: string; body: string }> = {
  terms: { title: "Terms & Conditions", body: TERMS_BODY },
  privacy: { title: "Privacy Policy", body: PRIVACY_BODY },
};

function LegalDocModal({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  const current = doc ? DOCS[doc] : null;

  async function shareAll() {
    try {
      await Share.share({ title: "AsanPay Terms and Privacy Policy", message: buildLegalDownloadText() });
    } catch {
      showAlert("Share failed", "Could not open the share sheet. Try again.");
    }
  }

  return (
    <Modal visible={Boolean(current)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{current?.title}</Text>
            <PopupCloseButton onPress={onClose} />
          </View>
          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 12 }}>
            <Text style={styles.bodyText}>{current?.body}</Text>
          </ScrollView>
          <View style={styles.footer}>
            <Pressable onPress={() => void shareAll()} style={styles.shareBtn}>
              <Download size={14} color={colors.textMuted} />
              <Text style={styles.shareText}>Download all</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Checkbox shown above every login button on the dark login panel. */
export function LoginPolicyConsent({
  checked,
  onChange,
  tone = "dark",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** `light` = on a white card / sheet. */
  tone?: "dark" | "light";
}) {
  const [openDoc, setOpenDoc] = useState<LegalDoc | null>(null);
  const light = tone === "light";

  const link = (doc: LegalDoc, label: string) => (
    <Text style={[styles.link, light && styles.linkLight]} onPress={() => setOpenDoc(doc)} suppressHighlighting>
      {label}
    </Text>
  );

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={[
          styles.row,
          light ? styles.rowLight : styles.rowDark,
          checked && (light ? styles.rowCheckedLight : styles.rowCheckedDark),
        ]}
      >
        <View style={[styles.box, light && styles.boxLight, checked && styles.boxChecked]}>
          {checked ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
        </View>
        <Text style={[styles.label, light && styles.labelLight]}>
          I agree to the {link("terms", "Terms & Conditions")} and {link("privacy", "Privacy Policy")}.
        </Text>
      </Pressable>
      <LegalDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowDark: { borderColor: "rgba(255,255,255,.14)", backgroundColor: "rgba(255,255,255,.05)" },
  rowCheckedDark: { borderColor: "rgba(36,204,130,.55)", backgroundColor: "rgba(36,204,130,.10)" },
  rowLight: { borderColor: colors.border, backgroundColor: "#F8FAFF" },
  rowCheckedLight: { borderColor: "rgba(36,204,130,.45)", backgroundColor: "rgba(36,204,130,.06)" },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.green, borderColor: colors.green },
  label: { flex: 1, fontSize: 12.5, lineHeight: 19, color: "#B9C6F2" },
  link: { color: "#3BE39A", fontWeight: "700", textDecorationLine: "underline" },
  boxLight: { borderColor: "#B8C3E0", backgroundColor: "#fff" },
  labelLight: { color: colors.text },
  linkLight: { color: colors.blueLight },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 14 },
  card: { maxHeight: "88%", borderRadius: 16, backgroundColor: colors.card, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E9F5",
  },
  title: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.blue, paddingRight: 8 },
  body: { paddingHorizontal: 16, paddingTop: 12 },
  bodyText: { fontSize: 12, lineHeight: 18, color: colors.blue },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E9F5",
  },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  shareText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  closeBtn: { backgroundColor: colors.blue, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  closeText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
