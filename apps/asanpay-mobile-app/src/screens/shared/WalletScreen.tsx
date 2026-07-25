import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowRightLeft, Landmark } from "lucide-react-native";
import { fetchApi } from "../../lib/api";
import { formatDate, formatINR } from "../../lib/format";
import type { LedgerEntry, WalletBalance } from "../../lib/types";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";

type WalletKind = "main" | "aeps";

export function WalletScreen() {
  const user = useAuthStore((s) => s.user)!;
  const { tokens } = useTheme();
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<WalletKind>("main");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [wal, ledger] = await Promise.all([
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<LedgerEntry[]>("/wallet/ledger", { limit: 20 }),
      ]);
      setWallets(wal);
      setEntries(ledger);
    } catch {
      /* retry on pull */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const main = wallets.find((w) => w.walletType === "main");
  const aeps = wallets.find((w) => w.walletType === "aeps");
  const activeWallet = active === "main" ? main : aeps;
  const activeEntries = useMemo(
    () => entries.filter((e) => e.walletType === active),
    [entries, active],
  );

  const today = new Date().toDateString();
  const { todayIn, todayOut } = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    for (const e of activeEntries) {
      if (new Date(e.createdAt).toDateString() !== today) continue;
      if (e.entryType === "credit") inSum += Number(e.amount);
      else outSum += Number(e.amount);
    }
    return { todayIn: inSum, todayOut: outSum };
  }, [activeEntries, today]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <LinearGradient
        colors={[colors.blueLight, colors.blue]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>My Wallet</Text>
      </LinearGradient>

      <View style={[styles.switcher, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
        {(["main", "aeps"] as WalletKind[]).map((k) => {
          const isActive = active === k;
          const w = k === "main" ? main : aeps;
          return (
            <Pressable
              key={k}
              onPress={() => setActive(k)}
              style={[styles.switchTab, isActive && styles.switchTabActive]}
            >
              <View style={[styles.switchIcon, { backgroundColor: isActive ? "#fff" : tokens.softBlue }]}>
                <Landmark size={13} color={colors.blueFlat} strokeWidth={2.2} />
              </View>
              <View>
                <Text style={[styles.switchName, { color: isActive ? "#fff" : tokens.txt2 }]}>
                  {k === "main" ? "Main" : "AEPS"}
                </Text>
                <Text style={[styles.switchAmount, { color: isActive ? "#fff" : tokens.txt2 }]}>
                  {formatINR(w?.balance ?? "0")}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} colors={[colors.blueLight, colors.green]} />
        }
      >
        <LinearGradient
          colors={active === "main" ? [colors.blueLight, colors.blue] : [colors.greenLight, colors.greenDark]}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>{active === "main" ? "Main Wallet" : "AEPS Wallet"}</Text>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{user.uid}</Text>
            </View>
          </View>
          <Text style={styles.heroAmount}>{formatINR(activeWallet?.balance ?? "0")}</Text>
          <Text style={styles.heroPending}>
            Pending {formatINR(activeWallet?.pendingBalance ?? "0")}
          </Text>
          <Text style={styles.heroNote}>
            {active === "main" ? "Available for services" : "AEPS settlements settle here"}
          </Text>
          <View style={styles.heroActions}>
            <Pressable style={styles.heroBtn} onPress={() => showAlert("Coming soon", "Load wallet flow")}>
              <Text style={styles.heroBtnText}>+ Add Money</Text>
            </Pressable>
            <Pressable style={[styles.heroBtn, styles.heroBtnOutline]} onPress={() => void load(true)}>
              <Text style={styles.heroBtnText}>Refresh</Text>
            </Pressable>
          </View>
        </LinearGradient>

        {active === "aeps" ? (
          <Pressable
            style={[styles.settleBanner, { backgroundColor: tokens.card, borderColor: colors.greenLight }]}
            onPress={() => showAlert("Coming soon", "Instant settlement to Main Wallet is coming soon.")}
          >
            <View style={styles.settleIcon}>
              <ArrowRightLeft size={18} color="#fff" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settleTitle, { color: tokens.txt }]}>Settle to Main Wallet</Text>
              <Text style={[styles.settleSub, { color: tokens.sub }]}>Move AEPS earnings instantly, free</Text>
            </View>
            <View style={styles.settleBtn}>
              <Text style={styles.settleBtnText}>Settle</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Text style={[styles.statLabel, { color: tokens.sub }]}>Today In</Text>
            <Text style={[styles.statValue, { color: colors.greenDark }]}>{formatINR(todayIn)}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Text style={[styles.statLabel, { color: tokens.sub }]}>Today Out</Text>
            <Text style={[styles.statValue, { color: colors.danger }]}>{formatINR(todayOut)}</Text>
          </View>
        </View>

        <Text style={[styles.section, { color: tokens.txt }]}>Passbook</Text>
        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={styles.loader} />
        ) : activeEntries.length === 0 ? (
          <Text style={[styles.empty, { color: tokens.sub }]}>No wallet activity yet.</Text>
        ) : (
          <View style={[styles.listCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            {activeEntries.map((item, i) => {
              const credit = item.entryType === "credit";
              return (
                <View
                  key={item.id}
                  style={[styles.row, i < activeEntries.length - 1 && { borderBottomColor: tokens.cardBorder, borderBottomWidth: 1 }]}
                >
                  <View style={[styles.icon, { backgroundColor: credit ? colors.greenBg : colors.dangerBg }]}>
                    <Text style={[styles.iconText, { color: credit ? colors.greenDark : colors.danger }]}>
                      {credit ? "↓" : "↑"}
                    </Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: tokens.txt2 }]}>{item.description || item.referenceType}</Text>
                    <Text style={[styles.rowDate, { color: tokens.mute }]}>{formatDate(item.createdAt)}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: credit ? colors.green : colors.danger }}>
                    {credit ? "+" : "−"}
                    {formatINR(item.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 78, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  headerTitle: { fontFamily: "System", fontWeight: "700", fontSize: 18, color: "#fff" },
  switcher: { marginHorizontal: 20, marginTop: -58, flexDirection: "row", gap: 9, borderWidth: 1, borderRadius: 15, padding: 5 },
  switchTab: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 11, paddingVertical: 8, paddingHorizontal: 10 },
  switchTabActive: { backgroundColor: colors.blue },
  switchIcon: { width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  switchName: { fontSize: 12, fontWeight: "700" },
  switchAmount: { fontSize: 11.5, fontWeight: "700", opacity: 0.95 },
  content: { padding: 20, paddingTop: 14, paddingBottom: 32 },
  heroCard: { borderRadius: 22, padding: 20 },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroLabel: { fontSize: 12.5, color: "rgba(255,255,255,.82)", fontWeight: "600" },
  heroBadge: { backgroundColor: "rgba(255,255,255,.18)", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  heroBadgeText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  heroAmount: { fontFamily: "System", fontWeight: "800", fontSize: 34, color: "#fff", marginTop: 5, letterSpacing: -0.5 },
  heroPending: { fontSize: 13, color: "#FDE68A", fontWeight: "700", marginTop: 4 },
  heroNote: { fontSize: 12, color: "rgba(255,255,255,.85)", fontWeight: "600", marginTop: 2 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  heroBtn: { flex: 1, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,.16)", alignItems: "center", justifyContent: "center" },
  heroBtnOutline: { borderWidth: 1, borderColor: "rgba(255,255,255,.3)" },
  heroBtnText: { color: "#fff", fontFamily: "System", fontWeight: "700", fontSize: 13 },
  settleBanner: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, borderRadius: 16, padding: 14, borderWidth: 1, borderStyle: "dashed" },
  settleIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.greenDark, alignItems: "center", justifyContent: "center" },
  settleTitle: { fontFamily: "System", fontWeight: "700", fontSize: 13.5 },
  settleSub: { fontSize: 11.5, fontWeight: "500", marginTop: 1 },
  settleBtn: { height: 36, paddingHorizontal: 15, borderRadius: 11, backgroundColor: colors.greenDark, alignItems: "center", justifyContent: "center" },
  settleBtnText: { color: "#fff", fontFamily: "System", fontWeight: "700", fontSize: 12.5 },
  statsRow: { flexDirection: "row", gap: 11, marginTop: 16 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 14 },
  statLabel: { fontSize: 11.5, fontWeight: "600" },
  statValue: { fontFamily: "System", fontWeight: "800", fontSize: 17, marginTop: 3 },
  section: { fontSize: 15, fontWeight: "700", fontFamily: "System", marginTop: 20, marginBottom: 11 },
  loader: { marginTop: 24 },
  empty: { textAlign: "center", marginTop: 24, fontSize: 13 },
  listCard: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", padding: 13 },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", marginRight: 12 },
  iconText: { fontSize: 15, fontWeight: "800" },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 13, fontWeight: "600" },
  rowDate: { fontSize: 11, marginTop: 2 },
});
