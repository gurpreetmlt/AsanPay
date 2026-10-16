import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, TrendingUp } from "lucide-react-native";
import { fetchApi } from "../../lib/api";
import { formatINR } from "../../lib/format";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import { DateRangeFields, toYmd } from "../../components/DateRangeCard";
import { PageEnter } from "../../components/PageEnter";

type EarningsSummary = {
  from: string;
  to: string;
  totalNet: string;
  creditCount: number;
  activeServices: number;
  activeDownline: number | null;
};

type ProductRow = {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  volume: string;
  netAmount: string;
  creditCount: number;
};

type Mode = "product" | "downline";

type Params = { from?: string; to?: string };

export function MyEarningsScreen() {
  const user = useAuthStore((s) => s.user)!;
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Record<string, Params>, string>>();
  const { tokens } = useTheme();
  const today = toYmd(new Date());
  const isPartner = user.role === "super_distributor" || user.role === "distributor";
  const downlineLabel = user.role === "super_distributor" ? "Distributor-wise" : "Retailer-wise";

  const [range, setRange] = useState({
    from: route.params?.from ?? today,
    to: route.params?.to ?? route.params?.from ?? today,
  });
  const [mode, setMode] = useState<Mode>("product");
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (r: { from: string; to: string }, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const [sum, prod] = await Promise.all([
          fetchApi<EarningsSummary>("/earnings/summary", { from: r.from, to: r.to }),
          fetchApi<{ products: ProductRow[] }>("/earnings/by-product", { from: r.from, to: r.to }),
        ]);
        setSummary(sum);
        setProducts(prod.products);
      } catch (err) {
        showAlert("Could not load earnings", (err as Error).message || "Check your connection and try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(range);
  }, [load, range.from, range.to]);

  useEffect(() => {
    const p = route.params;
    if (!p?.from && !p?.to) return;
    setRange({ from: p.from ?? today, to: p.to ?? p.from ?? today });
    // Only when navigation params change (e.g. Home → Today’s Earnings).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.from, route.params?.to]);

  const badgeText =
    mode === "downline" && summary?.activeDownline != null
      ? `${summary.activeDownline} Active ${user.role === "super_distributor" ? "Distributors" : "Retailers"}`
      : `${summary?.activeServices ?? 0} Active Services`;

  return (
    <PageEnter>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
        <View style={[styles.header, { backgroundColor: colors.blue }]}>
          <Pressable
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else {
                (navigation as { navigate: (n: string) => void }).navigate(
                  isPartner ? "Home" : "Services",
                );
              }
            }}
            hitSlop={8}
            style={styles.backBtn}
            accessibilityLabel="Back"
          >
            <ChevronLeft size={24} color="#fff" strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.headerTitle}>My Earnings</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(range, true)}
              colors={[colors.blueLight, colors.green]}
            />
          }
        >
          <DateRangeFields
            from={range.from}
            to={range.to}
            onChange={(next) => setRange(next)}
          />

          <View style={[styles.totalCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <View style={styles.totalTop}>
              <View style={[styles.totalIcon, { backgroundColor: colors.greenBg }]}>
                <TrendingUp size={20} color={colors.green} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.totalLabel, { color: tokens.sub }]}>TOTAL EARNINGS</Text>
                <Text style={[styles.totalValue, { color: tokens.txt }]}>
                  {loading && !summary ? "…" : formatINR(summary?.totalNet ?? "0")}
                </Text>
              </View>
            </View>
            <View style={[styles.badge, { backgroundColor: "#EEF2FF" }]}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          </View>

          {isPartner ? (
            <View style={[styles.toggle, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Pressable
                style={[styles.toggleBtn, mode === "downline" && styles.toggleBtnOn]}
                onPress={() => setMode("downline")}
              >
                <Text style={[styles.toggleText, mode === "downline" && styles.toggleTextOn]}>{downlineLabel}</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, mode === "product" && styles.toggleBtnOn]}
                onPress={() => setMode("product")}
              >
                <Text style={[styles.toggleText, mode === "product" && styles.toggleTextOn]}>Product-wise</Text>
              </Pressable>
            </View>
          ) : null}

          {loading && !summary ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.blueFlat} />
          ) : mode === "downline" && isPartner ? (
            <View style={[styles.empty, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.emptyTitle, { color: tokens.txt }]}>Coming soon</Text>
              <Text style={[styles.emptySub, { color: tokens.sub }]}>
                Downline-wise earnings breakdown will be available soon.
              </Text>
            </View>
          ) : products.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.emptyTitle, { color: tokens.txt }]}>No earnings in this range</Text>
              <Text style={[styles.emptySub, { color: tokens.sub }]}>
                Successful transactions that credit commission will show here as net earnings.
              </Text>
            </View>
          ) : (
            <View style={[styles.listCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              {products.map((p, i) => (
                <View
                  key={p.serviceId}
                  style={[
                    styles.row,
                    i < products.length - 1 && { borderBottomWidth: 1, borderBottomColor: tokens.cardBorder },
                  ]}
                >
                  <View style={[styles.svcIcon, { backgroundColor: "#EEF2FF" }]}>
                    <TrendingUp size={16} color={colors.blueFlat} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.svcName, { color: tokens.txt }]} numberOfLines={1}>
                      {p.serviceName}
                    </Text>
                    <Text style={[styles.svcMeta, { color: tokens.sub }]}>Vol: {formatINR(p.volume)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.earnAmt}>+{formatINR(p.netAmount)}</Text>
                    <Text style={[styles.earnTag, { color: tokens.sub }]}>EARNING</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </PageEnter>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  backBtn: { width: 36, alignItems: "flex-start" },
  headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 18, fontWeight: "800" },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  totalCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  totalTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  totalIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  totalLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  totalValue: { fontSize: 26, fontWeight: "800", marginTop: 2 },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: colors.blueFlat },
  toggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  toggleBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  toggleBtnOn: { backgroundColor: colors.blue },
  toggleText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  toggleTextOn: { color: "#fff" },
  empty: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  listCard: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  svcIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  svcName: { fontSize: 14, fontWeight: "700" },
  svcMeta: { fontSize: 12, marginTop: 2 },
  earnAmt: { fontSize: 15, fontWeight: "800", color: colors.green },
  earnTag: { fontSize: 10, fontWeight: "800", marginTop: 2, letterSpacing: 0.4 },
});
