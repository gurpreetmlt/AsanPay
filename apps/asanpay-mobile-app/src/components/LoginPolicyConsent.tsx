import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Download } from "lucide-react-native";
import { PopupCloseButton } from "./PopupCloseButton";
import { EULA_BODY, EULA_SUMMARY, PRIVACY_BODY, TERMS_BODY, buildLegalDownloadText } from "@asanpay/shared-types";
import { colors } from "../theme/colors";
import { showAlert } from "./AppAlert";

type LegalDoc = "terms" | "privacy" | "eula";

const DOCS: Record<LegalDoc, { title: string; body: string }> = {
  terms: { title: "Terms & Conditions", body: TERMS_BODY },
  privacy: { title: "Privacy Policy", body: PRIVACY_BODY },
  eula: { title: "End User Licence Agreement (EULA)", body: EULA_BODY },
};

function LegalDocModal({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  const current = doc ? DOCS[doc] : null;

  async function shareAll() {
    try {
      await Share.share({ title: "AsanPay Terms, Privacy Policy and EULA", message: buildLegalDownloadText() });
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
            {doc === "eula" ? <Text style={styles.summary}>{EULA_SUMMARY}</Text> : null}
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
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(!checked)}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          style={[styles.box, light && styles.boxLight, checked && styles.boxChecked]}
        >
          {checked ? <Text style={styles.tick}>✓</Text> : null}
        </Pressable>
        <Text style={[styles.label, light && styles.labelLight]} onPress={() => onChange(!checked)}>
          I agree to the {link("terms", "Terms & Conditions")}, {link("privacy", "Privacy Policy")} and{" "}
          {link("eula", "EULA")}.
        </Text>
      </View>
      {!checked ? <Text style={[styles.hint, light && styles.hintLight]}>Tick the box to continue.</Text> : null}
      <LegalDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  box: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.green, borderColor: colors.green },
  tick: { color: "#fff", fontSize: 12, fontWeight: "800" },
  label: { flex: 1, fontSize: 12.5, lineHeight: 18, color: "#B9C6F2" },
  link: { color: "#3BE39A", fontWeight: "700", textDecorationLine: "underline" },
  hint: { marginTop: 6, marginLeft: 30, fontSize: 11, color: "rgba(255,255,255,.5)" },
  boxLight: { borderColor: colors.border },
  labelLight: { color: colors.text },
  linkLight: { color: colors.blueLight },
  hintLight: { color: colors.textMuted },
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
  summary: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(36,204,130,.35)",
    backgroundColor: "rgba(36,204,130,.08)",
    fontSize: 13,
    lineHeight: 19,
    color: colors.blue,
  },
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
