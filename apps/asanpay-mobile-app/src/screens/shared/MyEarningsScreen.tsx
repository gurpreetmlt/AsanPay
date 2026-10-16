import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Search,
  TrendingUp,
} from "lucide-react-native";
import { fetchApi } from "../../lib/api";
import { formatINR } from "../../lib/format";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import { DateRangeFields, toYmd } from "../../components/DateRangeCard";
import { PageEnter } from "../../components/PageEnter";
import { PanMissingBanner } from "../../components/PanMissingBanner";

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
  grossAmount: string;
  tdsAmount: string;
  creditCount: number;
};

type DownlineRow = {
  userId: string;
  name: string;
  uid: string;
  mobile: string;
  shopLabel: string;
  isActive: boolean;
  volume: string;
  netAmount: string;
  grossAmount: string;
  tdsAmount: string;
  creditCount: number;
};

type TxnRow = {
  id: string;
  netAmount: string;
  grossAmount: string;
  tdsAmount: string;
  txnRef: string;
  txnAmount: string;
  createdAt: string;
};

type Mode = "product" | "downline";
type Params = { from?: string; to?: string };

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function TaxLines({
  gross,
  tds,
  net,
  mute,
}: {
  gross: string;
  tds: string;
  net: string;
  mute: string;
}) {
  return (
    <Text style={[styles.taxLine, { color: mute }]}>
      Gross {formatINR(gross)} · TDS {formatINR(tds)} · Net {formatINR(net)}
    </Text>
  );
}

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
  const [mode, setMode] = useState<Mode>(isPartner ? "downline" : "product");
  const [q, setQ] = useState("");
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [downline, setDownline] = useState<DownlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedDownline, setExpandedDownline] = useState<string | null>(null);
  const [downlineProducts, setDownlineProducts] = useState<ProductRow[]>([]);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [productTxns, setProductTxns] = useState<TxnRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(
    async (r: { from: string; to: string }, search: string, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const tasks: Promise<unknown>[] = [
          fetchApi<EarningsSummary>("/earnings/summary", { from: r.from, to: r.to }),
          fetchApi<{ products: ProductRow[] }>("/earnings/by-product", { from: r.from, to: r.to }),
        ];
        if (isPartner) {
          tasks.push(
            fetchApi<{ rows: DownlineRow[] }>("/earnings/by-downline", {
              from: r.from,
              to: r.to,
              ...(search.trim() ? { q: search.trim() } : {}),
            }),
          );
        }
        const [sum, prod, dl] = (await Promise.all(tasks)) as [
          EarningsSummary,
          { products: ProductRow[] },
          { rows: DownlineRow[] } | undefined,
        ];
        setSummary(sum);
        setProducts(prod.products);
        setDownline(dl?.rows ?? []);
        setExpandedDownline(null);
        setExpandedProduct(null);
        setDownlineProducts([]);
        setProductTxns([]);
      } catch (err) {
        showAlert("Could not load earnings", (err as Error).message || "Check your connection and try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isPartner],
  );

  useEffect(() => {
    void load(range, q);
  }, [load, range.from, range.to]);

  useEffect(() => {
    if (!isPartner || mode !== "downline") return;
    const t = setTimeout(() => void load(range, q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function earningsCsvBody() {
    const header = "Product/Service,Business Volume,Gross,TDS,Net";
    const lines = products.map((p) =>
      [p.serviceName, p.volume, p.grossAmount, p.tdsAmount, p.netAmount]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    return [header, ...lines].join("\n");
  }

  function openExportMenu() {
    if (products.length === 0) {
      showAlert("Nothing to export", "No product earnings in this date range");
      return;
    }
    const title = `AsanPay My Earnings ${range.from} to ${range.to}`;
    showAlert("Export", "Choose PDF, Excel, or CSV", [
      {
        text: "PDF",
        style: "primary",
        onPress: () => {
          void Share.share({
            title,
            message: `${title}\n\n${products
              .map(
                (p) =>
                  `${p.serviceName}\n  Volume ${formatINR(p.volume)} · Gross ${formatINR(p.grossAmount)} · TDS ${formatINR(p.tdsAmount)} · Net ${formatINR(p.netAmount)}`,
              )
              .join("\n\n")}\n\n— AsanPay`,
          });
        },
      },
      {
        text: "Excel",
        onPress: () => {
          void Share.share({
            title: `${title}.xls`,
            message: earningsCsvBody().replace(/,/g, "\t"),
          });
        },
      },
      {
        text: "CSV",
        onPress: () => {
          void Share.share({ title: `${title}.csv`, message: earningsCsvBody() });
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  useEffect(() => {
    const p = route.params;
    if (!p?.from && !p?.to) return;
    setRange({ from: p.from ?? today, to: p.to ?? p.from ?? today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.from, route.params?.to]);

  async function toggleDownline(userId: string) {
    if (expandedDownline === userId) {
      setExpandedDownline(null);
      setDownlineProducts([]);
      setExpandedProduct(null);
      setProductTxns([]);
      return;
    }
    setExpandedDownline(userId);
    setExpandedProduct(null);
    setProductTxns([]);
    setDetailLoading(true);
    try {
      const res = await fetchApi<{ products: ProductRow[] }>("/earnings/by-product", {
        from: range.from,
        to: range.to,
        downlineUserId: userId,
      });
      setDownlineProducts(res.products);
    } catch (err) {
      showAlert("Could not load breakdown", (err as Error).message || "Try again.");
      setExpandedDownline(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleProduct(serviceId: string, downlineUserId?: string) {
    const key = downlineUserId ? `${downlineUserId}:${serviceId}` : serviceId;
    if (expandedProduct === key) {
      setExpandedProduct(null);
      setProductTxns([]);
      return;
    }
    setExpandedProduct(key);
    setDetailLoading(true);
    try {
      const res = await fetchApi<{ rows: TxnRow[] }>("/earnings/product-txns", {
        from: range.from,
        to: range.to,
        serviceId,
        ...(downlineUserId ? { downlineUserId } : {}),
      });
      setProductTxns(res.rows);
    } catch (err) {
      showAlert("Could not load transactions", (err as Error).message || "Try again.");
      setExpandedProduct(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const badgeText =
    mode === "downline" && summary?.activeDownline != null
      ? `${summary.activeDownline} Active ${user.role === "super_distributor" ? "Distributors" : "Retailers"}`
      : `${summary?.activeServices ?? 0} Active Services`;

  function renderProductList(rows: ProductRow[], downlineUserId?: string) {
    if (rows.length === 0) {
      return (
        <View style={styles.nestedEmpty}>
          <Text style={[styles.emptySub, { color: tokens.sub }]}>No product earnings</Text>
        </View>
      );
    }
    return rows.map((p) => {
      const key = downlineUserId ? `${downlineUserId}:${p.serviceId}` : p.serviceId;
      const open = expandedProduct === key;
      return (
        <View key={key}>
          <Pressable
            onPress={() => void toggleProduct(p.serviceId, downlineUserId)}
            style={[styles.row, { borderBottomColor: tokens.cardBorder }]}
          >
            <View style={[styles.svcIcon, { backgroundColor: "#EEF2FF" }]}>
              <TrendingUp size={16} color={colors.blueFlat} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.svcName, { color: tokens.txt }]} numberOfLines={1}>
                {p.serviceName}
              </Text>
              <Text style={[styles.svcMeta, { color: tokens.sub }]}>Vol: {formatINR(p.volume)}</Text>
              {open ? (
                <TaxLines gross={p.grossAmount} tds={p.tdsAmount} net={p.netAmount} mute={tokens.sub} />
              ) : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.earnAmt}>+{formatINR(p.netAmount)}</Text>
              <Text style={[styles.earnTag, { color: tokens.sub }]}>EARNING</Text>
            </View>
            {open ? (
              <ChevronUp size={16} color={tokens.sub} strokeWidth={2.2} />
            ) : (
              <ChevronDown size={16} color={tokens.sub} strokeWidth={2.2} />
            )}
          </Pressable>
          {open ? (
            <View style={[styles.txnWrap, { backgroundColor: tokens.bg }]}>
              {detailLoading && productTxns.length === 0 ? (
                <ActivityIndicator color={colors.blueFlat} style={{ marginVertical: 12 }} />
              ) : productTxns.length === 0 ? (
                <Text style={[styles.emptySub, { color: tokens.sub, padding: 12 }]}>No transactions</Text>
              ) : (
                productTxns.map((t) => (
                  <View key={t.id} style={styles.txnRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.txnRef, { color: tokens.txt }]} numberOfLines={1}>
                        {t.txnRef}
                      </Text>
                      <TaxLines gross={t.grossAmount} tds={t.tdsAmount} net={t.netAmount} mute={tokens.sub} />
                    </View>
                    <Text style={styles.earnAmt}>+{formatINR(t.netAmount)}</Text>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>
      );
    });
  }

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
              onRefresh={() => void load(range, q, true)}
              colors={[colors.blueLight, colors.green]}
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginHorizontal: -16 }}>
            <PanMissingBanner
              onPress={() =>
                (navigation as { navigate: (n: string) => void }).navigate(isPartner ? "Settings" : "Account")
              }
            />
          </View>

          <DateRangeFields from={range.from} to={range.to} onChange={(next) => setRange(next)} />

          <Pressable
            onPress={openExportMenu}
            style={[styles.exportBtn, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
            accessibilityRole="button"
            accessibilityLabel="Export PDF Excel or CSV"
          >
            <Download size={16} color={colors.blueLight} strokeWidth={2.2} />
            <Text style={[styles.exportBtnText, { color: tokens.txt }]}>Export · PDF / Excel / CSV</Text>
          </Pressable>

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

          {mode === "downline" && isPartner ? (
            <View
              style={[
                styles.searchBox,
                { backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder },
              ]}
            >
              <Search size={16} color={tokens.sub} strokeWidth={2.2} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search name, UID, mobile"
                placeholderTextColor={tokens.mute}
                style={[styles.searchInput, { color: tokens.txt }]}
                autoCorrect={false}
              />
            </View>
          ) : null}

          {loading && !summary ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.blueFlat} />
          ) : mode === "downline" && isPartner ? (
            downline.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                <Text style={[styles.emptyTitle, { color: tokens.txt }]}>No earnings in this range</Text>
                <Text style={[styles.emptySub, { color: tokens.sub }]}>
                  Downline agents with commission credits will appear here.
                </Text>
              </View>
            ) : (
              <View style={[styles.listCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                {downline.map((d, i) => {
                  const open = expandedDownline === d.userId;
                  return (
                    <View key={d.userId}>
                      <Pressable
                        onPress={() => void toggleDownline(d.userId)}
                        style={[
                          styles.row,
                          i < downline.length - 1 || open
                            ? { borderBottomWidth: 1, borderBottomColor: tokens.cardBorder }
                            : null,
                        ]}
                      >
                        <View style={[styles.avatar, { backgroundColor: "#EDE9FE" }]}>
                          <Text style={styles.avatarText}>{initials(d.name)}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.svcName, { color: tokens.txt }]} numberOfLines={1}>
                            {d.name}
                          </Text>
                          <Text style={[styles.svcMeta, { color: tokens.sub }]} numberOfLines={1}>
                            {d.shopLabel} · {d.uid}
                          </Text>
                          <Text style={[styles.svcMeta, { color: tokens.sub }]}>{d.mobile}</Text>
                          {open ? (
                            <TaxLines
                              gross={d.grossAmount}
                              tds={d.tdsAmount}
                              net={d.netAmount}
                              mute={tokens.sub}
                            />
                          ) : null}
                        </View>
                        <Text style={styles.earnAmt}>+{formatINR(d.netAmount)}</Text>
                        {open ? (
                          <ChevronUp size={18} color={tokens.sub} strokeWidth={2.2} />
                        ) : (
                          <ChevronRight size={18} color={tokens.sub} strokeWidth={2.2} />
                        )}
                      </Pressable>
                      {open ? (
                        <View style={{ paddingBottom: 4 }}>
                          {detailLoading && downlineProducts.length === 0 ? (
                            <ActivityIndicator color={colors.blueFlat} style={{ marginVertical: 12 }} />
                          ) : (
                            renderProductList(downlineProducts, d.userId)
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )
          ) : products.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.emptyTitle, { color: tokens.txt }]}>No earnings in this range</Text>
              <Text style={[styles.emptySub, { color: tokens.sub }]}>
                Successful transactions that credit commission will show here as net earnings.
              </Text>
            </View>
          ) : (
            <View style={[styles.listCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              {renderProductList(products)}
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
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  exportBtnText: { fontSize: 13, fontWeight: "700" },
  totalCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
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
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "600", padding: 0 },
  empty: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  nestedEmpty: { padding: 14, alignItems: "center" },
  listCard: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 13, fontWeight: "800", color: "#6D28D9" },
  svcIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  svcName: { fontSize: 14, fontWeight: "700" },
  svcMeta: { fontSize: 12, marginTop: 2 },
  taxLine: { fontSize: 11, marginTop: 4, fontWeight: "600" },
  earnAmt: { fontSize: 15, fontWeight: "800", color: colors.green },
  earnTag: { fontSize: 10, fontWeight: "800", marginTop: 2, letterSpacing: 0.4 },
  txnWrap: { paddingHorizontal: 12, paddingBottom: 8 },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  txnRef: { fontSize: 12, fontWeight: "700" },
});
