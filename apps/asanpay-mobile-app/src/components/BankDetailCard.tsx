import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import Clipboard from "@react-native-clipboard/clipboard";
import { Check, Copy, Eye, EyeOff, Landmark } from "lucide-react-native";
import {
  bankBrandTint,
  bankCardCornerTint,
  bankCardFillColors,
  bankCardGlowColor,
  bankLogoUrl,
  bankNameFromIfsc,
  formatSettlementBankCopy,
} from "../lib/bankLogo";
import { showAlert } from "./AppAlert";
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
  label,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionBtn, { opacity: disabled ? 0.55 : 1 }]}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
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
  /** Explicit width for horizontal pickers (avoids screen-edge clipping). */
  cardWidth,
  style,
  onActivate,
  activateLabel = "Set as active",
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
  cardWidth?: number;
  style?: StyleProp<ViewStyle>;
  onActivate?: () => void;
  activateLabel?: string;
}) {
  const { tokens } = useTheme();
  const showFull = revealed && Boolean(accountFull);
  const accountShown = showFull ? (accountFull as string) : accountMasked;
  const canReveal = Boolean(onToggleReveal);
  const resolvedBank = bankName || bankNameFromIfsc(ifsc);
  const bankLine = [resolvedBank, branch].filter(Boolean).join(", ");
  const tint = bankBrandTint(ifsc);
  const glow = bankCardGlowColor(ifsc);
  const fillColors = bankCardFillColors(ifsc);
  const corners = bankCardCornerTint(ifsc);

  const resolvedStatusTone = unavailable ? "pending" : statusTone;
  const statusTagStyle =
    resolvedStatusTone === "success"
      ? { backgroundColor: "#D1FAE5", color: "#047857", borderColor: "#6EE7B7" }
      : resolvedStatusTone === "info"
        ? { backgroundColor: "#DBEAFE", color: "#1D4ED8", borderColor: "#93C5FD" }
        : { backgroundColor: "#FFFAEB", color: "#B54708", borderColor: "#FEC84B" };

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

  const statusText = unavailable ? "Unavailable" : statusLabel;
  const pendingTwoLine = /^pending\s+verification$/i.test(statusText.trim());

  const statusBadge = (
    <View style={[styles.statusTag, statusTagStyle]}>
      {unavailable ? (
        <>
          <Text style={[styles.statusTagText, { color: statusTagStyle.color }]}>Not</Text>
          <Text style={[styles.statusTagText, { color: statusTagStyle.color }]}>available</Text>
        </>
      ) : pendingTwoLine ? (
        <>
          <Text style={[styles.statusTagText, { color: statusTagStyle.color }]}>Pending</Text>
          <Text style={[styles.statusTagText, { color: statusTagStyle.color }]}>verification</Text>
        </>
      ) : (
        <Text style={[styles.statusTagText, { color: statusTagStyle.color }]} numberOfLines={1}>
          {statusText}
        </Text>
      )}
    </View>
  );

  const body = (
    <View style={styles.row}>
      <View style={styles.main}>
        <BankLogo ifsc={ifsc} />

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
        {statusBadge}
        {canReveal ? (
          <ActionBtn
            label={showFull ? "Hide number" : "Show number"}
            onPress={() => onToggleReveal?.()}
            disabled={revealing || unavailable}
          >
            {showFull ? (
              <EyeOff size={17} color={colors.blueFlat} strokeWidth={2.25} />
            ) : (
              <Eye size={17} color={colors.blueFlat} strokeWidth={2.25} />
            )}
          </ActionBtn>
        ) : null}
        <ActionBtn
          label="Copy details"
          onPress={handleCopy}
          disabled={revealing || unavailable}
        >
          <Copy size={17} color={colors.blueFlat} strokeWidth={2.25} />
        </ActionBtn>
        {onActivate ? (
          <ActionBtn
            label={activateLabel === "Set as active" ? "Set active" : activateLabel}
            onPress={onActivate}
            disabled={revealing || unavailable}
          >
            <Check size={17} color={colors.green} strokeWidth={2.5} />
          </ActionBtn>
        ) : null}
        {selected ? (
          <View style={[styles.selectedBtn, { backgroundColor: tint }]}>
            <Check size={17} color="#fff" strokeWidth={2.5} />
          </View>
        ) : null}
      </View>
    </View>
  );

  const isActiveBank =
    !unavailable &&
    (statusLabel.toLowerCase() === "active" ||
      (statusTone === "success" && statusLabel.toLowerCase().includes("active")));

  const isPicker = Boolean(onSelect);
  const shellStyle = [
    styles.card,
    {
      width: cardWidth ?? (isPicker ? 280 : 280),
      borderColor: isActiveBank ? colors.green : selected ? `${tint}55` : corners.border,
      borderWidth: isActiveBank ? 2 : 1,
      opacity: unavailable ? 0.55 : 1,
      shadowColor: isActiveBank ? colors.green : glow,
      shadowOpacity: isActiveBank || selected ? 0.2 : 0.1,
      shadowRadius: isActiveBank || selected ? 12 : 8,
      elevation: isActiveBank || selected ? 3 : 2,
    },
    style,
  ];

  const gradient = (
    <LinearGradient colors={fillColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <View
        pointerEvents="none"
        style={[styles.glowTopRight, { backgroundColor: corners.topRight }]}
      />
      <View
        pointerEvents="none"
        style={[styles.glowBottomLeft, { backgroundColor: corners.bottomLeft }]}
      />
      <View style={styles.bodyWrap}>{body}</View>
    </LinearGradient>
  );

  if (onSelect) {
    return (
      <Pressable onPress={onSelect} style={shellStyle}>
        {gradient}
      </Pressable>
    );
  }
  return <View style={shellStyle}>{gradient}</View>;
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 0,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 6 },
    backgroundColor: "#fff",
  },
  gradient: {
    padding: 18,
    borderRadius: 18,
    overflow: "hidden",
  },
  bodyWrap: { position: "relative", zIndex: 1 },
  glowTopRight: {
    position: "absolute",
    top: -36,
    right: -28,
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.55,
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -40,
    left: -32,
    width: 110,
    height: 110,
    borderRadius: 55,
    opacity: 0.4,
  },
  row: { flexDirection: "row", gap: 10 },
  main: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  statusTag: {
    width: "100%",
    minHeight: 40,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
    lineHeight: 12,
  },
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
  actions: { width: 76, alignItems: "center", gap: 8 },
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
  selectedBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
