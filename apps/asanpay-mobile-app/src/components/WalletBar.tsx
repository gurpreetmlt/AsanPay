import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { Fingerprint, Wallet } from "lucide-react-native";
import { formatINR } from "../lib/format";
import type { WalletBalance } from "../lib/types";
import { colors } from "../theme/colors";
import { showAlert } from "./AppAlert";

interface Props {
  wallets: WalletBalance[];
  onWalletPress?: () => void;
  onAddMoney?: () => void;
  onReports?: () => void;
}

/** Retailer-style twin wallet cards + Add Money / Reports — shared by home headers. */
export function WalletBar({ wallets, onWalletPress, onAddMoney, onReports }: Props) {
  const main = wallets.find((w) => w.walletType === "main");
  const aeps = wallets.find((w) => w.walletType === "aeps");

  function openWallet() {
    if (onWalletPress) {
      onWalletPress();
      return;
    }
    showAlert("Wallet", "Open Wallet tab from bottom navigation.");
  }

  return (
    <View>
      <View style={styles.walletRow}>
        <Pressable style={styles.walletCard} onPress={openWallet}>
          <View style={styles.walletCardTopRow}>
            <View style={styles.walletCardIconLight}>
              <Wallet size={12} color={colors.blue} strokeWidth={2.4} />
            </View>
            <Text style={styles.walletCardLabel}>Main Wallet</Text>
          </View>
          <Text style={styles.walletCardAmount}>{formatINR(main?.balance ?? "0")}</Text>
          <Text style={styles.walletCardDelta}>▲ Today</Text>
        </Pressable>

        <Pressable style={{ flex: 1 }} onPress={openWallet}>
          <LinearGradient
            colors={["rgba(36,204,130,.28)", "rgba(17,163,98,.16)"]}
            style={[styles.walletCard, styles.walletCardAeps]}
          >
            <View style={styles.walletCardTopRow}>
              <View style={styles.walletCardIconGreen}>
                <Fingerprint size={12} color="#fff" strokeWidth={2.4} />
              </View>
              <Text style={styles.walletCardLabelGreen}>AEPS Wallet</Text>
            </View>
            <Text style={styles.walletCardAmount}>{formatINR(aeps?.balance ?? "0")}</Text>
            <Text style={styles.walletCardNoteGreen}>Settlement pending</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <View style={styles.quickRow}>
        <Pressable
          onPress={onAddMoney ?? (() => showAlert("Coming soon", "Add money / load wallet"))}
          style={styles.quickBtnPress}
        >
          <LinearGradient colors={[...colors.gradientButton]} style={styles.quickBtnFill}>
            <Text style={styles.quickBtnText}>+ Add Money</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          onPress={onReports ?? (() => showAlert("Coming soon", "Reports"))}
          style={styles.quickBtnOutline}
        >
          <Text style={styles.quickBtnText}>Reports</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  walletRow: { flexDirection: "row", gap: 11, marginTop: 6 },
  walletCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.18)",
    borderRadius: 18,
    padding: 14,
  },
  walletCardAeps: { borderColor: "rgba(59,227,154,.35)" },
  walletCardTopRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  walletCardIconLight: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  walletCardIconGreen: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: colors.greenDark,
    alignItems: "center",
    justifyContent: "center",
  },
  walletCardLabel: { fontSize: 11.5, color: "#C7D2F5", fontWeight: "700" },
  walletCardLabelGreen: { fontSize: 11.5, color: "#BFF3D9", fontWeight: "700" },
  walletCardAmount: {
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 24,
    color: "#fff",
    marginTop: 9,
    letterSpacing: -0.4,
  },
  walletCardDelta: { fontSize: 11, color: "#3BE39A", fontWeight: "700", marginTop: 2 },
  walletCardNoteGreen: { fontSize: 11, color: "#BFF3D9", fontWeight: "700", marginTop: 2 },
  quickRow: { flexDirection: "row", gap: 9, marginTop: 11 },
  quickBtnPress: { flex: 1, borderRadius: 12, overflow: "hidden" },
  quickBtnFill: {
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickBtnOutline: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.3)",
    backgroundColor: "rgba(255,255,255,.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickBtnText: { color: "#fff", fontFamily: "System", fontWeight: "700", fontSize: 13.5 },
});
