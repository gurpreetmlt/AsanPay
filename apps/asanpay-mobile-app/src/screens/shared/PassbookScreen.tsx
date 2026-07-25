import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchApi } from "../../lib/api";
import { formatDate, formatINR } from "../../lib/format";
import type { LedgerEntry } from "../../lib/types";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PassbookScreen() {
  const { tokens } = useTheme();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await fetchApi<LedgerEntry[]>("/wallet/ledger", { limit: 100 });
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { totalIn, totalOut, bars, breakdown } = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    const byDay = new Array(7).fill(0);
    const byType = new Map<string, { count: number; amount: number }>();

    for (const e of entries) {
      const amt = Number(e.amount);
      if (e.entryType === "credit") {
        inSum += amt;
        const label = e.referenceType.replace(/_/g, " ");
        const cur = byType.get(label) ?? { count: 0, amount: 0 };
        byType.set(label, { count: cur.count + 1, amount: cur.amount + amt });
      } else {
        outSum += amt;
      }
      const day = new Date(e.createdAt).getDay(); // 0=Sun
      const idx = day === 0 ? 6 : day - 1;
      const daysAgo = Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 86_400_000);
      if (daysAgo < 7) byDay[idx] += amt;
    }

    const maxBar = Math.max(1, ...byDay);
    const bars = byDay.map((v, i) => ({ day: DAY_LABELS[i], h: `${Math.max(4, (v / maxBar) * 100)}%` }));
    const breakdown = Array.from(byType.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    return { totalIn: inSum, totalOut: outSum, bars, breakdown };
  }, [entries]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <LinearGradient
        colors={[colors.blueLight, colors.blue]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Reports &amp; History</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} colors={[colors.blueLight, colors.green]} />
        }
      >
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Text style={[styles.kpiLabel, { color: tokens.sub }]}>Total In</Text>
            <Text style={[styles.kpiValue, { color: colors.greenDark }]}>{formatINR(totalIn)}</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Text style={[styles.kpiLabel, { color: tokens.sub }]}>Total Out</Text>
            <Text style={[styles.kpiValue, { color: colors.danger }]}>{formatINR(totalOut)}</Text>
          </View>
        </View>

        <View style={[styles.chartCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          <View style={styles.chartHeaderRow}>
            <Text style={[styles.chartTitle, { color: tokens.txt }]}>Transaction Volume</Text>
            <Text style={[styles.chartSub, { color: tokens.sub }]}>Last 7 days</Text>
          </View>
          <View style={styles.barsRow}>
            {bars.map((b, i) => (
              <View key={i} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height: b.h as `${number}%` }]} />
                </View>
                <Text style={[styles.barLabel, { color: tokens.mute }]}>{b.day}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[styles.section, { color: tokens.txt }]}>Earnings by Type</Text>
        {breakdown.length === 0 ? (
          <Text style={[styles.empty, { color: tokens.sub }]}>No credits recorded yet.</Text>
        ) : (
          <View style={[styles.listCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            {breakdown.map((c, i) => (
              <View
                key={c.name}
                style={[styles.commRow, i < breakdown.length - 1 && { borderBottomColor: tokens.cardBorder, borderBottomWidth: 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.commName, { color: tokens.txt2 }]}>{c.name}</Text>
                  <Text style={[styles.commCount, { color: tokens.mute }]}>{c.count} transactions</Text>
                </View>
                <Text style={styles.commAmount}>{formatINR(c.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.section, { color: tokens.txt }]}>All Transactions</Text>
        {loading ? (
          <ActivityIndicator size="large" color={colors.blueFlat} style={styles.loader} />
        ) : entries.length === 0 ? (
          <Text style={[styles.empty, { color: tokens.sub }]}>No transactions yet.</Text>
        ) : (
          <View style={[styles.listCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            {entries.map((item, i) => {
              const credit = item.entryType === "credit";
              return (
                <View
                  key={item.id}
                  style={[styles.row, i < entries.length - 1 && { borderBottomColor: tokens.cardBorder, borderBottomWidth: 1 }]}
                >
                  <View style={[styles.icon, { backgroundColor: credit ? colors.greenBg : colors.dangerBg }]}>
                    <Text style={[styles.iconText, { color: credit ? colors.greenDark : colors.danger }]}>
                      {credit ? "↓" : "↑"}
                    </Text>
                  </View>
                  <View style={styles.mid}>
                    <Text style={[styles.desc, { color: tokens.txt2 }]}>
                      {item.description || item.referenceType.replace(/_/g, " ")}
                    </Text>
                    <Text style={[styles.date, { color: tokens.mute }]}>
                      {formatDate(item.createdAt)} · {item.walletType}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: credit ? colors.green : colors.danger }}>
                      {credit ? "+" : "-"}
                      {formatINR(item.amount)}
                    </Text>
                    <Text style={[styles.balAfter, { color: tokens.mute }]}>Bal {formatINR(item.balanceAfter)}</Text>
                  </View>
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
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  headerTitle: { fontFamily: "System", fontWeight: "700", fontSize: 18, color: "#fff" },
  content: { padding: 20, paddingBottom: 30 },
  kpiRow: { flexDirection: "row", gap: 11 },
  kpiCard: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 15 },
  kpiLabel: { fontSize: 11.5, fontWeight: "600" },
  kpiValue: { fontFamily: "System", fontWeight: "800", fontSize: 20, marginTop: 4 },
  chartCard: { marginTop: 18, borderWidth: 1, borderRadius: 18, padding: 18 },
  chartHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chartTitle: { fontFamily: "System", fontWeight: "700", fontSize: 14.5 },
  chartSub: { fontSize: 12, fontWeight: "600" },
  barsRow: { marginTop: 18, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8, height: 130 },
  barCol: { flex: 1, alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" },
  barTrack: { width: "100%", flex: 1, justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 7, backgroundColor: colors.blue, minHeight: 4 },
  barLabel: { fontSize: 10.5, fontWeight: "600" },
  section: { fontSize: 15, fontWeight: "700", fontFamily: "System", marginTop: 20, marginBottom: 11 },
  loader: { marginTop: 24 },
  empty: { textAlign: "center", marginBottom: 8, fontSize: 13 },
  listCard: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  commRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  commName: { fontFamily: "System", fontWeight: "600", fontSize: 14, textTransform: "capitalize" },
  commCount: { fontSize: 11.5, fontWeight: "500", marginTop: 1 },
  commAmount: { fontFamily: "System", fontWeight: "700", fontSize: 14.5, color: colors.greenDark },
  row: { flexDirection: "row", alignItems: "center", padding: 14 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12 },
  iconText: { fontSize: 16, fontWeight: "800" },
  mid: { flex: 1 },
  desc: { fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  date: { fontSize: 11, marginTop: 2 },
  right: { alignItems: "flex-end" },
  balAfter: { fontSize: 10, marginTop: 2 },
});
