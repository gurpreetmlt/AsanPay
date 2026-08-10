import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { Check, Copy, Eye, EyeOff, Landmark } from "lucide-react-native";
import { bankBrandTint, bankLogoUrl, bankNameFromIfsc, formatSettlementBankCopy } from "../lib/bankLogo";
import { showAlert } from "./AppAlert";
import { StatusBadge } from "./StatusBadge";
import { useTheme } from "../theme/ThemeContext";
import { colors } from "../theme/colors";

function BankLogo({ ifsc }: { ifsc: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={styles.logoFallback}>
        <Landmark size={18} color={colors.blueFlat} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: bankLogoUrl(ifsc) }}
      style={styles.logo}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

function ActionBtn({
  onPress,
  disabled,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionBtn, { opacity: disabled ? 0.55 : 1 }]}
      hitSlop={4}
    >
      {children}
    </Pressable>
  );
}

/** Premium bank card — matches web settlement / Add Money card. */
export function BankDetailCard({
  ifsc,
  holderName,
  accountMasked,
  accountFull,
  revealed = false,
  revealing = false,
  onToggleReveal,
  onCopy,
  statusTone = "success",
  statusLabel = "Active",
  selected = false,
  onSelect,
  note,
  bankName,
  branch,
  unavailable = false,
}: {
  ifsc: string;
  holderName: string;
  accountMasked: string;
  accountFull?: string;
  revealed?: boolean;
  revealing?: boolean;
  onToggleReveal?: () => void;
  onCopy?: () => void;
  statusTone?: "success" | "info" | "pending";
  statusLabel?: string;
  selected?: boolean;
  onSelect?: () => void;
  note?: string;
  bankName?: string;
  branch?: string;
  unavailable?: boolean;
}) {
  const { tokens } = useTheme();
  const showFull = revealed && Boolean(accountFull);
  const accountShown = showFull ? (accountFull as string) : accountMasked;
  const canReveal = Boolean(onToggleReveal);
  const resolvedBank = bankName || bankNameFromIfsc(ifsc);
  const bankLine = [resolvedBank, branch].filter(Boolean).join(" · ");
  const tint = bankBrandTint(ifsc);

  function handleCopy() {
    if (onCopy) {
      onCopy();
      return;
    }
    Clipboard.setString(
      formatSettlementBankCopy({
        bankName: resolvedBank,
        branch,
        holderName,
        accountNumber: (accountFull || accountMasked).replace(/\s/g, ""),
        ifsc,
      }),
    );
    showAlert("Copied", "Bank details copied");
  }

  const body = (
    <View style={styles.row}>
      <View style={styles.main}>
        <View style={styles.header}>
          <BankLogo ifsc={ifsc} />
          <StatusBadge tone={unavailable ? "pending" : statusTone}>
            {unavailable ? "Unavailable" : statusLabel}
          </StatusBadge>
        </View>

        <Text style={[styles.acctLabel, { color: tokens.mute }]}>Account</Text>
        <Text style={[styles.acctNum, { color: tokens.txt }]} numberOfLines={1}>
          {accountShown}
        </Text>
        <Text style={[styles.holder, { color: tokens.txt }]} numberOfLines={1}>
          {holderName}
        </Text>
        <Text style={[styles.ifsc, { color: colors.blueFlat }]}>IFSC · {ifsc}</Text>
        {bankLine ? <Text style={[styles.bankLine, { color: tokens.mute }]}>{bankLine}</Text> : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>

      <View style={styles.actions}>
        {canReveal ? (
          <ActionBtn onPress={() => onToggleReveal?.()} disabled={revealing || unavailable}>
            {showFull ? (
              <EyeOff size={17} color={colors.blueFlat} strokeWidth={2.25} />
            ) : (
              <Eye size={17} color={colors.blueFlat} strokeWidth={2.25} />
            )}
          </ActionBtn>
        ) : null}
        <ActionBtn onPress={handleCopy} disabled={revealing || unavailable}>
          <Copy size={17} color={colors.blueFlat} strokeWidth={2.25} />
        </ActionBtn>
        {selected ? (
          <View style={styles.selectedDot}>
            <Check size={11} color="#fff" />
          </View>
        ) : null}
      </View>
    </View>
  );

  const cardStyle = [
    styles.card,
    {
      borderColor: selected ? colors.blueFlat : `${tint}44`,
      backgroundColor: `${tint}14`,
      opacity: unavailable ? 0.55 : 1,
      shadowOpacity: selected ? 0.14 : 0.08,
    },
  ];

  if (onSelect) {
    return (
      <Pressable onPress={onSelect} style={cardStyle}>
        {body}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 18,
    marginRight: 12,
    shadowColor: "#0B2A9A",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 3,
  },
  row: { flexDirection: "row", gap: 10 },
  main: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  acctLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 16,
  },
  acctNum: { fontSize: 20, fontWeight: "800", letterSpacing: 1.2, marginTop: 4, fontVariant: ["tabular-nums"] },
  holder: { fontSize: 15, fontWeight: "700", marginTop: 12 },
  ifsc: { fontSize: 13, fontWeight: "700", marginTop: 8 },
  bankLine: { fontSize: 12, fontWeight: "500", marginTop: 4 },
  note: { fontSize: 11, fontWeight: "800", color: colors.green, marginTop: 8 },
  actions: { justifyContent: "center", gap: 10, paddingTop: 4 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  selectedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.blueFlat,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
});
