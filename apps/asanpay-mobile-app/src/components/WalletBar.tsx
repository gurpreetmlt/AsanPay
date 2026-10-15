import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Eye, EyeOff, Fingerprint, Wallet } from "lucide-react-native";
import { formatINR } from "../lib/format";
import type { WalletBalance } from "../lib/types";
import { colors } from "../theme/colors";
import { showAlert } from "./AppAlert";

const BALANCE_VISIBLE_KEY = "asanpay_balance_visible";

interface Props {
  wallets: WalletBalance[];
  onWalletPress?: () => void;
  onAddMoney?: () => void;
  onReports?: () => void;
  /** Super Distributor / Distributor hold only the main wallet (no AEPS). */
  single?: boolean;
}

/** Retailer-style twin wallet cards + Add Money / Reports — shared by home headers. */
export function WalletBar({ wallets, onWalletPress, onAddMoney, onReports, single }: Props) {
  const main = wallets.find((w) => w.walletType === "main");
  const aeps = wallets.find((w) => w.walletType === "aeps");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    void AsyncStorage.getItem(BALANCE_VISIBLE_KEY).then((v) => {
      if (v === "0") setVisible(false);
    });
  }, []);

  async function toggleVisible() {
    setVisible((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(BALANCE_VISIBLE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function openWallet() {
    if (onWalletPress) {
      onWalletPress();
      return;
    }
    showAlert("Balance", "Open the Balance tab from bottom navigation.");
  }

  function amount(raw: string | undefined) {
    return visible ? formatINR(raw ?? "0") : "₹ ••••••";
  }

  return (
    <View>
      <View style={styles.walletRow}>
        <Pressable style={styles.walletCard} onPress={openWallet}>
          <View style={styles.walletCardTopRow}>
            <View style={styles.walletCardIconLight}>
              <Wallet size={12} color={colors.blue} strokeWidth={2.4} />
            </View>
            <Text style={styles.walletCardLabel}>Main</Text>
            <Pressable
              onPress={(e) => {
                e?.stopPropagation?.();
                void toggleVisible();
              }}
              hitSlop={8}
              style={styles.eyeBtn}
              accessibilityLabel={visible ? "Hide balances" : "Show balances"}
            >
              {visible ? <EyeOff size={14} color="#C7D2F5" /> : <Eye size={14} color="#C7D2F5" />}
            </Pressable>
          </View>
          <Text style={styles.walletCardAmount}>{amount(main?.balance)}</Text>
          <Text style={styles.walletCardDelta}>Main wallet</Text>
        </Pressable>

        {single ? null : (
        <Pressable style={{ flex: 1, minWidth: 0 }} onPress={openWallet}>
          <LinearGradient
            colors={["rgba(36,204,130,.28)", "rgba(17,163,98,.16)"]}
            style={[styles.walletCard, styles.walletCardAeps]}
          >
            <View style={styles.walletCardTopRow}>
              <View style={styles.walletCardIconGreen}>
                <Fingerprint size={12} color="#fff" strokeWidth={2.4} />
              </View>
              <Text style={styles.walletCardLabelGreen}>AEPS</Text>
              <Pressable
                onPress={(e) => {
                  e?.stopPropagation?.();
                  void toggleVisible();
                }}
                hitSlop={8}
                style={styles.eyeBtn}
                accessibilityLabel={visible ? "Hide balances" : "Show balances"}
              >
                {visible ? <EyeOff size={14} color="#BFF3D9" /> : <Eye size={14} color="#BFF3D9" />}
              </Pressable>
            </View>
            <Text style={styles.walletCardAmount}>{amount(aeps?.balance)}</Text>
            <Text style={styles.walletCardNoteGreen}>Settlement pending</Text>
          </LinearGradient>
        </Pressable>
        )}
      </View>

      <View style={styles.quickRow}>
        <Pressable
          onPress={onAddMoney ?? (() => showAlert("Coming soon", "Add money / load balance"))}
          style={[styles.quickBtnWhite, { backgroundColor: colors.green }]}
        >
          <Text style={[styles.quickBtnTextDark, { color: "#fff" }]}>+ Add Money</Text>
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
  walletRow: { flexDirection: "row", gap: 11, marginTop: 6, width: "100%" },
  walletCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "rgba(255,255,255,.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.18)",
    borderRadius: 18,
    padding: 14,
  },
  walletCardAeps: { borderColor: "rgba(59,227,154,.35)", minWidth: 0 },
  walletCardTopRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  eyeBtn: { marginLeft: "auto", padding: 2 },
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
  quickBtnWhite: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
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
  quickBtnTextDark: { color: colors.blue, fontFamily: "System", fontWeight: "700", fontSize: 13.5 },
});
