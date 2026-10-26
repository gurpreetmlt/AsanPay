import React from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { Copy } from "lucide-react-native";
import { PopupCloseButton } from "./PopupCloseButton";
import { bankLogoUrl, formatSettlementBankCopy } from "../lib/bankLogo";
import { showAlert } from "./AppAlert";
import { useTheme } from "../theme/ThemeContext";
import { colors } from "../theme/colors";

export type BankViewDetails = {
  bankName: string;
  ifsc: string;
  accountNumber: string;
  holderName: string;
  accountType?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  city?: string | null;
};

function titleCase(v: string) {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** Full company bank details with per-field copy — matches the web "View details" popup. */
export function BankAccountViewSheet({ bank, onClose }: { bank: BankViewDetails | null; onClose: () => void }) {
  const { tokens } = useTheme();
  if (!bank) return null;

  const rows: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "Account type", value: bank.accountType ? titleCase(bank.accountType) : null },
    { label: "Account number", value: bank.accountNumber, mono: true },
    { label: "Account name", value: bank.holderName },
    { label: "Bank name", value: bank.bankName },
    { label: "IFSC", value: bank.ifsc, mono: true },
    { label: "Branch code", value: bank.branchCode ?? null, mono: true },
    { label: "Branch name", value: bank.branchName ?? null },
    { label: "City / District", value: bank.city ?? null },
  ].filter((r) => r.value);

  const copy = (text: string, what: string) => {
    Clipboard.setString(text);
    showAlert("Copied", `${what} copied`);
  };

  const copyAll = () =>
    copy(
      formatSettlementBankCopy({
        accountType: bank.accountType,
        accountNumber: bank.accountNumber,
        holderName: bank.holderName,
        bankName: bank.bankName,
        ifsc: bank.ifsc,
        branchCode: bank.branchCode,
        branch: bank.branchName,
        city: bank.city || undefined,
      }),
      "Bank details",
    );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: tokens.card }]} onPress={() => undefined}>
          <View style={styles.header}>
            <Image source={{ uri: bankLogoUrl(bank.ifsc) }} style={styles.logo} resizeMode="contain" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: colors.blueFlat }]} numberOfLines={1}>
                {bank.bankName}
              </Text>
              <Text style={[styles.subtitle, { color: tokens.mute }]}>Company bank account details</Text>
            </View>
            <PopupCloseButton onPress={onClose} />
          </View>

          <ScrollView style={[styles.list, { borderColor: tokens.cardBorder }]}>
            {rows.map((r, i) => (
              <View
                key={r.label}
                style={[
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.cardBorder },
                ]}
              >
                <Text style={[styles.label, { color: tokens.mute }]}>{r.label}</Text>
                <Text style={[styles.value, { color: tokens.txt }, r.mono && styles.mono]}>{r.value}</Text>
                <Pressable
                  onPress={() => copy(r.value as string, r.label)}
                  hitSlop={8}
                  accessibilityLabel={`Copy ${r.label.toLowerCase()}`}
                >
                  <Copy size={16} color={colors.blueFlat} />
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.copyAll} onPress={copyAll} accessibilityRole="button">
            <Copy size={16} color="#fff" />
            <Text style={styles.copyAllText}>Copy full bank details</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  sheet: { borderRadius: 20, padding: 16, maxHeight: "85%" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#fff" },
  title: { fontSize: 16, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
  list: { borderWidth: 1, borderRadius: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  label: { width: 104, fontSize: 12, fontWeight: "600" },
  value: { flex: 1, fontSize: 14, fontWeight: "700" },
  mono: { fontFamily: "monospace" },
  copyAll: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.blue,
    borderRadius: 999,
    paddingVertical: 13,
  },
  copyAllText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
