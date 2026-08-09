import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
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

function useMeetSlide() {
  const iconX = useRef(new Animated.Value(-40)).current;
  const textX = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(iconX, {
            toValue: 0,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(textX, {
            toValue: 0,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(1800),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.35, duration: 350, useNativeDriver: true }),
          Animated.timing(iconX, { toValue: -28, duration: 450, useNativeDriver: true }),
          Animated.timing(textX, { toValue: 28, duration: 450, useNativeDriver: true }),
        ]),
        Animated.delay(200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [iconX, textX, opacity]);

  return { iconX, textX, opacity };
}

/** Retailer-style twin wallet cards + Add Money / Reports — shared by home headers. */
export function WalletBar({ wallets, onWalletPress, onAddMoney, onReports }: Props) {
  const main = wallets.find((w) => w.walletType === "main");
  const aeps = wallets.find((w) => w.walletType === "aeps");
  const mainSlide = useMeetSlide();
  const aepsSlide = useMeetSlide();

  function openWallet() {
    if (onWalletPress) {
      onWalletPress();
      return;
    }
    showAlert("Balance", "Open the Balance tab from bottom navigation.");
  }

  return (
    <View>
      <View style={styles.walletRow}>
        <Pressable style={styles.walletCard} onPress={openWallet}>
          <View style={styles.meetRow}>
            <Animated.View
              style={[
                styles.walletCardTopRow,
                { opacity: mainSlide.opacity, transform: [{ translateX: mainSlide.iconX }] },
              ]}
            >
              <View style={styles.walletCardIconLight}>
                <Wallet size={12} color={colors.blue} strokeWidth={2.4} />
              </View>
              <Text style={styles.walletCardLabel}>Main</Text>
            </Animated.View>
            <Animated.Text
              style={[
                styles.walletCardAmount,
                styles.meetAmount,
                { opacity: mainSlide.opacity, transform: [{ translateX: mainSlide.textX }] },
              ]}
            >
              {formatINR(main?.balance ?? "0")}
            </Animated.Text>
          </View>
          <Text style={styles.walletCardDelta}>▲ Today</Text>
        </Pressable>

        <Pressable style={{ flex: 1 }} onPress={openWallet}>
          <LinearGradient
            colors={["rgba(36,204,130,.28)", "rgba(17,163,98,.16)"]}
            style={[styles.walletCard, styles.walletCardAeps]}
          >
            <View style={styles.meetRow}>
              <Animated.View
                style={[
                  styles.walletCardTopRow,
                  { opacity: aepsSlide.opacity, transform: [{ translateX: aepsSlide.iconX }] },
                ]}
              >
                <View style={styles.walletCardIconGreen}>
                  <Fingerprint size={12} color="#fff" strokeWidth={2.4} />
                </View>
                <Text style={styles.walletCardLabelGreen}>AEPS</Text>
              </Animated.View>
              <Animated.Text
                style={[
                  styles.walletCardAmount,
                  styles.meetAmount,
                  { opacity: aepsSlide.opacity, transform: [{ translateX: aepsSlide.textX }] },
                ]}
              >
                {formatINR(aeps?.balance ?? "0")}
              </Animated.Text>
            </View>
            <Text style={styles.walletCardNoteGreen}>Settlement pending</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <View style={styles.quickRow}>
        <Pressable
          onPress={onAddMoney ?? (() => showAlert("Coming soon", "Add money / load balance"))}
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
    overflow: "hidden",
  },
  walletCardAeps: { borderColor: "rgba(59,227,154,.35)" },
  meetRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    minHeight: 36,
  },
  meetAmount: { marginLeft: -4, marginTop: 0 },
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
    fontSize: 22,
    color: "#fff",
    letterSpacing: -0.4,
  },
  walletCardDelta: { fontSize: 11, color: "#3BE39A", fontWeight: "700", marginTop: 6 },
  walletCardNoteGreen: { fontSize: 11, color: "#BFF3D9", fontWeight: "700", marginTop: 6 },
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
