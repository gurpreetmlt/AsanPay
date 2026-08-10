import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ChevronDown, Download, X } from "lucide-react-native";
import { TERMS_BODY, PRIVACY_BODY, buildLegalDownloadText } from "@asanpay/shared-types";
import { colors } from "../theme/colors";
import { showAlert } from "./AppAlert";

type Props = {
  visible: boolean;
  latitude: string;
  longitude: string;
  onAccept: () => void;
  onCancel: () => void;
  /** Theme tokens from signup screen */
  tokens: {
    card: string;
    cardBorder: string;
    txt: string;
    txt2: string;
    mute: string;
  };
};

function AccordionSection({
  title,
  body,
  open,
  onToggle,
  accepted,
  onAcceptSection,
  tokens,
}: {
  title: string;
  body: string;
  open: boolean;
  onToggle: () => void;
  accepted: boolean;
  onAcceptSection: () => void;
  tokens: Props["tokens"];
}) {
  return (
    <View style={[styles.section, { borderColor: tokens.cardBorder }]}>
      <Pressable
        onPress={onToggle}
        style={[
          styles.sectionHeader,
          { backgroundColor: open ? `${colors.green}14` : tokens.card },
        ]}
      >
        <View
          style={[
            styles.checkBox,
            {
              borderColor: accepted ? colors.green : tokens.cardBorder,
              backgroundColor: accepted ? colors.green : tokens.card,
            },
          ]}
        >
          {accepted ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <Text style={[styles.sectionTitle, { color: tokens.txt, flex: 1 }]}>{title}</Text>
        <ChevronDown
          size={18}
          color={tokens.mute}
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </Pressable>

      {open ? (
        <View style={[styles.sectionBody, { borderTopColor: tokens.cardBorder, backgroundColor: tokens.card }]}>
          <Text style={[styles.sectionHeading, { color: colors.greenDark }]}>{title}</Text>
          <ScrollView style={styles.bodyScroll} nestedScrollEnabled>
            <Text style={[styles.bodyText, { color: tokens.txt2 }]}>{body}</Text>
          </ScrollView>
          <View style={styles.sectionAcceptRow}>
            <Pressable
              onPress={onAcceptSection}
              disabled={accepted}
              style={[
                styles.sectionAcceptBtn,
                { backgroundColor: accepted ? tokens.mute : colors.green, opacity: accepted ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.sectionAcceptText}>{accepted ? "Accepted" : "Accept"}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Same flow as agent-portal TermsAcceptModal (web). */
export function TermsAcceptModal({
  visible,
  latitude,
  longitude,
  onAccept,
  onCancel,
  tokens,
}: Props) {
  const [openSection, setOpenSection] = useState<"terms" | "privacy" | null>("terms");
  const [termsOk, setTermsOk] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const bothOk = termsOk && privacyOk;
  const canAccept = bothOk && Boolean(latitude && longitude);

  async function shareLegalDocs() {
    try {
      await Share.share({
        title: "AsanPay Terms and Privacy Policy",
        message: buildLegalDownloadText(),
      });
    } catch {
      showAlert("Share failed", "Could not open the share sheet. Try again.");
    }
  }

  function handleClose() {
    setOpenSection("terms");
    setTermsOk(false);
    setPrivacyOk(false);
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          <View style={[styles.header, { borderBottomColor: tokens.cardBorder }]}>
            <View style={styles.headerTop}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.title, { color: tokens.txt }]}>Terms & Privacy Policy</Text>
                <Text style={[styles.subtitle, { color: tokens.mute }]}>
                  Please read the information below and confirm your agreement.
                </Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={8}>
                <X size={18} color={tokens.mute} />
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: tokens.mute }]}>
              Expand each section, read, then Accept.
            </Text>
            <Pressable
              onPress={() => void shareLegalDocs()}
              style={[styles.downloadBtn, { borderColor: tokens.cardBorder }]}
            >
              <Download size={14} color={tokens.mute} />
              <Text style={[styles.downloadText, { color: tokens.mute }]}>
                Download Privacy Policy and Terms & Conditions
              </Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            <AccordionSection
              title="Terms & Conditions"
              body={TERMS_BODY}
              open={openSection === "terms"}
              onToggle={() => setOpenSection((s) => (s === "terms" ? null : "terms"))}
              accepted={termsOk}
              onAcceptSection={() => {
                setTermsOk(true);
                setOpenSection("privacy");
              }}
              tokens={tokens}
            />
            <AccordionSection
              title="Privacy Policy"
              body={PRIVACY_BODY}
              open={openSection === "privacy"}
              onToggle={() => setOpenSection((s) => (s === "privacy" ? null : "privacy"))}
              accepted={privacyOk}
              onAcceptSection={() => setPrivacyOk(true)}
              tokens={tokens}
            />
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: tokens.cardBorder, backgroundColor: tokens.card }]}>
            <View style={{ marginBottom: 10 }}>
              <Text style={[styles.coords, { color: tokens.txt }]}>
                Latitude : <Text style={{ fontWeight: "700" }}>{latitude || "—"}</Text>
              </Text>
              <Text style={[styles.coords, { color: tokens.txt }]}>
                Longitude : <Text style={{ fontWeight: "700" }}>{longitude || "—"}</Text>
              </Text>
            </View>
            <View style={styles.footerActions}>
              <Pressable
                onPress={handleClose}
                style={[styles.cancelBtn, { borderColor: colors.green, flex: 1 }]}
              >
                <Text style={{ color: colors.greenDark, fontWeight: "700", textAlign: "center" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!canAccept) {
                    showAlert(
                      "Accept both sections",
                      !bothOk
                        ? "Accept both Terms and Privacy Policy first"
                        : "Allow location access before continuing",
                    );
                    return;
                  }
                  setOpenSection("terms");
                  setTermsOk(false);
                  setPrivacyOk(false);
                  onAccept();
                }}
                style={[
                  styles.acceptBtn,
                  { flex: 1, backgroundColor: canAccept ? colors.blueFlat : "#9CA3AF", opacity: canAccept ? 1 : 0.7 },
                ]}
              >
                <Text style={styles.acceptBtnText}>Accept</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 14,
  },
  card: {
    maxHeight: "92%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  hint: { fontSize: 12, marginBottom: 8 },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  downloadText: { fontSize: 11, fontWeight: "600", flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingVertical: 12, maxHeight: 360 },
  section: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { color: "#fff", fontSize: 11, fontWeight: "800" },
  sectionTitle: { fontSize: 13, fontWeight: "700" },
  sectionBody: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 10,
  },
  sectionHeading: { fontSize: 13, fontWeight: "800", marginBottom: 8 },
  bodyScroll: { maxHeight: 140, marginBottom: 10 },
  bodyText: { fontSize: 12, lineHeight: 18 },
  sectionAcceptRow: { alignItems: "flex-end" },
  sectionAcceptBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sectionAcceptText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  coords: { fontSize: 11, fontFamily: "monospace", marginBottom: 2 },
  footerActions: { flexDirection: "row", gap: 8 },
  cancelBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
  },
  acceptBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  acceptBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
