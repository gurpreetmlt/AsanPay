import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, UIManager, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { Bell, Gift, Scan } from "lucide-react-native";
import { CategorySection } from "../../components/CategorySection";
import { FavouritesSection } from "../../components/FavouritesSection";
import { HomeEditModeBar } from "../../components/HomeEditModeBar";
import { ScreenHeader } from "../../components/ScreenHeader";
import { WalletBar } from "../../components/WalletBar";
import { fetchApi } from "../../lib/api";
import { formatDate, formatINR } from "../../lib/format";
import type { CatalogCategoryView, LedgerEntry, WalletBalance } from "../../lib/types";
import { useAuthStore } from "../../store/auth";
import { useFavoritesStore } from "../../store/favorites";
import { useRecentLedger } from "../../hooks/useRecentLedger";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import { AepsScreen } from "./AepsScreen";
import { DmtScreen } from "./DmtScreen";
import { NepalScreen } from "./NepalScreen";
import { UpiCashPointScreen } from "./UpiCashPointScreen";
import { showAlert } from "../../components/AppAlert";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Service codes that route to dedicated full-screen flows instead of the generic "coming soon" tile press. */
const AEPS_CODES = new Set(["AADHAAR_PAY", "CASH_WITHDRAW", "BALANCE_ENQUIRY", "MINI_STATEMENT", "CASH_DEPOSIT"]);
const DMT_CODES = new Set(["MONEY_TRANSFER"]);
const NEPAL_CODES = new Set(["NEPAL", "NEPAL_REMITTANCE"]);
const UPI_CP_CODES = new Set(["UPI_CASH_POINT"]);

function greetingName(name: string): string {
  const first = name.split(" ")[0] ?? name;
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

export function ServicesScreen() {
  const user = useAuthStore((s) => s.user)!;
  const { tokens } = useTheme();
  const [categories, setCategories] = useState<CatalogCategoryView[]>([]);
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [homeEditMode, setHomeEditMode] = useState(false);
  const [activeScreen, setActiveScreen] = useState<"home" | "aeps" | "dmt" | "nepal" | "upi_cp">("home");
  const [aepsServiceCode, setAepsServiceCode] = useState<string | undefined>();

  const { entries: recent, loading: recentLoading, reload: reloadRecent } = useRecentLedger(6);

  const enterHomeEditMode = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHomeEditMode(true);
  }, []);

  const exitHomeEditMode = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHomeEditMode(false);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [cat, wal] = await Promise.all([
        fetchApi<CatalogCategoryView[]>("/catalog"),
        fetchApi<WalletBalance[]>("/wallet/me"),
      ]);
      setCategories(cat);
      setWallets(wal);
    } catch {
      /* silent — pull to retry */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void useFavoritesStore.getState().hydrate();
  }, []);

  function handleOpenService(code: string) {
    if (AEPS_CODES.has(code)) {
      setAepsServiceCode(code);
      setActiveScreen("aeps");
    } else if (DMT_CODES.has(code)) {
      setActiveScreen("dmt");
    } else if (NEPAL_CODES.has(code)) {
      setActiveScreen("nepal");
    } else if (UPI_CP_CODES.has(code)) {
      setActiveScreen("upi_cp");
    }
  }

  function backToHome() {
    setActiveScreen("home");
    setAepsServiceCode(undefined);
    void load(true);
    void reloadRecent();
  }

  if (activeScreen === "aeps") return <AepsScreen onBack={backToHome} serviceCode={aepsServiceCode} />;
  if (activeScreen === "dmt") return <DmtScreen onBack={backToHome} />;
  if (activeScreen === "nepal") return <NepalScreen onBack={backToHome} />;
  if (activeScreen === "upi_cp") return <UpiCashPointScreen onBack={backToHome} />;

  const firstName = user.name.split(" ")[0] ?? user.name;
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <ScreenHeader
        variant="profile"
        avatarLetter={initials || firstName.charAt(0).toUpperCase()}
        eyebrow={greetingName(user.name)}
        title={user.name}
        topRight={
          <View style={styles.headerIconRow}>
            <Pressable style={styles.headerIconBtn} onPress={() => showAlert("Coming soon", "QR scan")}>
              <Scan size={18} color="#fff" strokeWidth={2.1} />
            </Pressable>
            <Pressable style={styles.headerIconBtn} onPress={() => showAlert("Coming soon", "Notifications")}>
              <Bell size={18} color="#fff" strokeWidth={2.1} />
              <View style={styles.headerIconDot} />
            </Pressable>
          </View>
        }
      >
        <WalletBar wallets={wallets} />
      </ScreenHeader>

      <HomeEditModeBar active={homeEditMode} onDone={exitHomeEditMode} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load(true);
              void reloadRecent();
            }}
            colors={[colors.blueLight, colors.green]}
            enabled={!homeEditMode}
          />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.blueFlat} style={styles.loader} />
        ) : (
          <>
            <FavouritesSection
              userId={user.id}
              categories={categories}
              homeEditMode={homeEditMode}
              onEnterEditMode={enterHomeEditMode}
              onOpenService={handleOpenService}
            />
            {categories.map((c, i) => (
              <CategorySection
                key={c.id}
                category={c}
                userId={user.id}
                defaultOpen={i === 0}
                homeEditMode={homeEditMode}
                onEnterEditMode={enterHomeEditMode}
                onOpenService={handleOpenService}
              />
            ))}
          </>
        )}

        <View style={[styles.promo, { backgroundColor: tokens.promoBg, borderColor: tokens.promoBorder }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.promoTitle, { color: tokens.promoTitle }]}>VIP Agent Plan</Text>
            <Text style={[styles.promoSub, { color: tokens.sub }]}>
              Extra commission on every transaction — coming soon
            </Text>
          </View>
          <LinearGradient colors={[...colors.gradientButton]} style={styles.promoIcon}>
            <Gift size={20} color="#fff" strokeWidth={2.1} />
          </LinearGradient>
        </View>

        <View style={styles.recentHeaderRow}>
          <Text style={[styles.recentTitle, { color: tokens.txt }]}>Recent</Text>
          <Pressable onPress={() => showAlert("Coming soon", "Full reports")}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>
        <View style={[styles.recentCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          {recentLoading ? (
            <ActivityIndicator color={colors.blueFlat} style={{ paddingVertical: 20 }} />
          ) : recent.length === 0 ? (
            <Text style={[styles.recentEmpty, { color: tokens.sub }]}>No recent activity yet.</Text>
          ) : (
            recent.map((tx: LedgerEntry, i) => {
              const credit = tx.entryType === "credit";
              return (
                <View
                  key={tx.id}
                  style={[
                    styles.recentRow,
                    i < recent.length - 1 && { borderBottomColor: tokens.cardBorder, borderBottomWidth: 1 },
                  ]}
                >
                  <View style={[styles.recentIcon, { backgroundColor: credit ? colors.greenBg : colors.dangerBg }]}>
                    <Text style={{ color: credit ? colors.greenDark : colors.danger, fontWeight: "800" }}>
                      {credit ? "↓" : "↑"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recentDesc, { color: tokens.txt2 }]}>
                      {tx.description || tx.referenceType.replace(/_/g, " ")}
                    </Text>
                    <Text style={[styles.recentDate, { color: tokens.mute }]}>{formatDate(tx.createdAt)}</Text>
                  </View>
                  <Text style={{ color: credit ? colors.green : colors.danger, fontFamily: "System", fontWeight: "700" }}>
                    {credit ? "+" : "−"}
                    {formatINR(tx.amount)}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  loader: { marginTop: 40 },
  headerIconRow: { flexDirection: "row", gap: 9, marginTop: 2 },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
    borderWidth: 1.5,
    borderColor: "#1E42B0",
  },
  promo: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 16, marginTop: 8, borderWidth: 1 },
  promoTitle: { fontSize: 14.5, fontWeight: "700", fontFamily: "System" },
  promoSub: { fontSize: 12, marginTop: 3, lineHeight: 17, maxWidth: 190 },
  promoIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  recentHeaderRow: {
    marginTop: 22,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recentTitle: { fontFamily: "System", fontWeight: "700", fontSize: 16 },
  seeAll: { fontSize: 12.5, color: colors.blueLight, fontWeight: "700" },
  recentCard: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  recentEmpty: { textAlign: "center", padding: 20, fontSize: 13 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13 },
  recentIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  recentDesc: { fontFamily: "System", fontWeight: "600", fontSize: 14, textTransform: "capitalize" },
  recentDate: { fontSize: 11.5, fontWeight: "500", marginTop: 1 },
});
