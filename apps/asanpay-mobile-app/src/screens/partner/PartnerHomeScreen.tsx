import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import {
  ArrowLeftRight,
  Bell,
  BookText,
  ChartColumn,
  ChevronRight,
  CircleArrowUp,
  CreditCard,
  FileText,
  ReceiptText,
  Send,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { fetchApi } from "../../lib/api";
import { formatINR } from "../../lib/format";
import { ROLE_LABEL } from "../../lib/roles";
import type { WalletBalance } from "../../lib/types";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import { PageEnter } from "../../components/PageEnter";
import { BrandLockup } from "../../components/BrandMark";
import { FundRequestModal } from "../shared/FundRequestScreen";

interface PartnerStats {
  revenue?: { todayCommission?: string };
  today?: { commission?: string };
}

interface Tile {
  label: string;
  icon: LucideIcon;
  tint: string;
  onPress: () => void;
}

function comingSoon(feature: string) {
  showAlert("Coming soon", `${feature} will be available soon.`);
}

export function PartnerHomeScreen() {
  const user = useAuthStore((s) => s.user)!;
  const setSignupContinue = useAuthStore((s) => s.setSignupContinue);
  const navigation = useNavigation<{ navigate: (name: string, params?: object) => void }>();
  const { tokens } = useTheme();
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [todayEarnings, setTodayEarnings] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showFund, setShowFund] = useState(false);

  const isSd = user.role === "super_distributor";
  const childPlural = isSd ? "Distributors" : "Retailers";
  const needsKyc = user.kycStatus === "rejected" || !user.hasKycDocs;
  const main = wallets.find((w) => w.walletType === "main");
  const initials =
    user.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "A";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const go = (name: string, params?: object) => navigation.navigate(name, params);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [wal, stats] = await Promise.all([
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<PartnerStats>("/dashboard/stats").catch(() => null),
      ]);
      setWallets(wal);
      setTodayEarnings(stats?.revenue?.todayCommission ?? stats?.today?.commission ?? "0");
    } catch {
      /* retry on pull */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const networkTiles: Tile[] = [
    { label: `View ${childPlural}`, icon: Users, tint: "#6D28D9", onPress: () => go("Network") },
    { label: "Transfer Value", icon: ArrowLeftRight, tint: colors.blueFlat, onPress: () => go("Network") },
    { label: "Transfer Report", icon: ReceiptText, tint: "#EA580C", onPress: () => go("Ledger") },
  ];

  const reportTiles: Tile[] = [
    { label: "Earnings", icon: ChartColumn, tint: "#6D28D9", onPress: () => go("Ledger") },
    { label: "Transfers", icon: ReceiptText, tint: colors.green, onPress: () => go("Ledger") },
    { label: "Referral", icon: Send, tint: "#0D9488", onPress: () => go("Network", { invite: Date.now() }) },
    { label: "Invoices", icon: FileText, tint: colors.blueFlat, onPress: () => comingSoon("Invoices") },
  ];

  const growthTiles: Tile[] = [
    { label: "Raise Request", icon: CircleArrowUp, tint: "#D97706", onPress: () => setShowFund(true) },
    { label: "Payment Gateway", icon: CreditCard, tint: colors.blueFlat, onPress: () => comingSoon("Payment Gateway") },
    { label: "My OD Limit", icon: Zap, tint: "#6D28D9", onPress: () => comingSoon("OD limit") },
    { label: "Profile Settings", icon: Settings, tint: tokens.sub, onPress: () => go("Settings") },
  ];

  const summaryRows: Tile[] = [
    { label: "Account Ledger", icon: BookText, tint: "#6D28D9", onPress: () => go("Ledger") },
    { label: "Earnings Report", icon: TrendingUp, tint: colors.green, onPress: () => go("Ledger") },
    { label: "My Invoices", icon: FileText, tint: colors.blueFlat, onPress: () => comingSoon("Invoices") },
  ];

  const cardStyle = { backgroundColor: tokens.card, borderColor: tokens.cardBorder };

  return (
    <PageEnter>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
        <LinearGradient colors={[...colors.gradient]} style={styles.header}>
          <View style={[styles.bubble, styles.bubbleA]} />
          <View style={[styles.bubble, styles.bubbleB]} />
          <View style={styles.headerRow}>
            <Pressable style={styles.avatar} onPress={() => go("Settings")}>
              <Text style={styles.avatarText}>{initials}</Text>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.greeting} numberOfLines={1}>
                {greeting}, {user.name.split(" ")[0]}
              </Text>
              <View style={styles.rolePill}>
                <Text style={styles.rolePillText} numberOfLines={1}>
                  {ROLE_LABEL[user.role]} · {user.uid}
                </Text>
              </View>
            </View>
            <Pressable style={styles.bellBtn} onPress={() => comingSoon("Notifications")}>
              <Bell size={18} color="#fff" strokeWidth={2.1} />
              <View style={styles.bellDot} />
            </Pressable>
          </View>
          <View style={styles.brandWrap}>
            <BrandLockup iconSize={40} animate light showTagline />
          </View>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              colors={[colors.blueLight, colors.green]}
            />
          }
        >
          {user.kycStatus !== "verified" ? (
            <Pressable
              onPress={() => {
                if (needsKyc) setSignupContinue(true);
              }}
              style={styles.kycBanner}
            >
              <Text style={styles.kycTitle}>
                {user.hasKycDocs && user.kycStatus !== "rejected" ? "KYC under review" : "Complete your KYC"}
              </Text>
              <Text style={styles.kycSub}>{needsKyc ? "Tap to continue signup KYC." : "Awaiting admin approval."}</Text>
            </Pressable>
          ) : null}

          <View style={styles.statRow}>
            <Pressable style={[styles.statCard, cardStyle]} onPress={() => go("Balance")}>
              <View style={[styles.statIcon, { backgroundColor: "#EDE9FE" }]}>
                <Wallet size={18} color="#6D28D9" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.statLabel, { color: tokens.sub }]}>BALANCE</Text>
                <Text style={[styles.statValue, { color: tokens.txt }]} numberOfLines={1}>
                  {formatINR(main?.balance ?? "0")}
                </Text>
              </View>
            </Pressable>
            <Pressable style={[styles.statCard, cardStyle]} onPress={() => go("Ledger")}>
              <View style={[styles.statIcon, { backgroundColor: colors.greenBg }]}>
                <TrendingUp size={18} color={colors.green} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.statLabel, { color: tokens.sub }]}>EARNINGS</Text>
                <Text style={[styles.statValue, { color: tokens.txt }]}>Report</Text>
              </View>
            </Pressable>
          </View>

          <Pressable style={[styles.todayCard, cardStyle]} onPress={() => go("Ledger")}>
            <View style={[styles.statIcon, { backgroundColor: "#EEF2FF" }]}>
              <ChartColumn size={18} color={colors.blueFlat} strokeWidth={2.2} />
            </View>
            <Text style={[styles.todayLabel, { color: tokens.txt }]}>Today&apos;s Earnings:</Text>
            <Text style={styles.todayValue}>{formatINR(todayEarnings ?? "0")}</Text>
            <View style={styles.todayArrow}>
              <ChevronRight size={16} color="#fff" strokeWidth={2.6} />
            </View>
          </Pressable>

          <Text style={[styles.section, { color: tokens.txt }]}>My Network</Text>
          <View style={styles.bigTileRow}>
            {networkTiles.map((t) => (
              <Pressable key={t.label} style={[styles.bigTile, cardStyle]} onPress={t.onPress}>
                <View style={[styles.bigTileIcon, { backgroundColor: t.tint }]}>
                  <t.icon size={22} color="#fff" strokeWidth={2.2} />
                </View>
                <Text style={[styles.bigTileLabel, { color: tokens.txt }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.section, { color: tokens.txt }]}>Reports & Invoices</Text>
          <TileGrid tiles={reportTiles} cardStyle={cardStyle} textColor={tokens.txt} />

          <Text style={[styles.section, { color: tokens.txt }]}>Growth & Funding</Text>
          <TileGrid tiles={growthTiles} cardStyle={cardStyle} textColor={tokens.txt} />

          <Text style={[styles.section, { color: tokens.txt }]}>Account Summary</Text>
          <View style={[styles.listCard, cardStyle]}>
            {summaryRows.map((r, i) => (
              <Pressable
                key={r.label}
                onPress={r.onPress}
                style={[
                  styles.listRow,
                  i < summaryRows.length - 1 && { borderBottomWidth: 1, borderBottomColor: tokens.cardBorder },
                ]}
              >
                <r.icon size={20} color={r.tint} strokeWidth={2.1} />
                <Text style={[styles.listLabel, { color: tokens.txt }]}>{r.label}</Text>
                <ChevronRight size={18} color={tokens.mute} />
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <FundRequestModal
          visible={showFund}
          onClose={() => {
            setShowFund(false);
            void load(true);
          }}
        />
      </SafeAreaView>
    </PageEnter>
  );
}

function TileGrid({
  tiles,
  cardStyle,
  textColor,
}: {
  tiles: Tile[];
  cardStyle: { backgroundColor: string; borderColor: string };
  textColor: string;
}) {
  return (
    <View style={[styles.gridCard, cardStyle]}>
      {tiles.map((t) => (
        <Pressable key={t.label} style={styles.gridItem} onPress={t.onPress}>
          <t.icon size={24} color={t.tint} strokeWidth={2} />
          <Text style={[styles.gridLabel, { color: textColor }]} numberOfLines={2}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: "hidden",
  },
  bubble: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)" },
  bubbleA: { width: 180, height: 180, top: -70, right: -50 },
  bubbleB: { width: 120, height: 120, bottom: -60, left: -30 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  greeting: { color: "#fff", fontSize: 16, fontWeight: "800" },
  rolePill: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "rgba(59,227,154,0.18)",
    borderWidth: 1,
    borderColor: "rgba(59,227,154,0.4)",
  },
  rolePillText: { color: "#BFF3D9", fontSize: 11, fontWeight: "700" },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
    borderWidth: 1.5,
    borderColor: "#1E42B0",
  },
  brandWrap: { alignItems: "center", marginTop: 18 },
  content: { padding: 16, paddingBottom: 32 },
  kycBanner: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${colors.blue}33`,
    backgroundColor: `${colors.blue}14`,
    padding: 12,
    marginBottom: 12,
  },
  kycTitle: { color: colors.blueFlat, fontWeight: "800", fontSize: 13 },
  kycSub: { color: "#8FA2E0", fontSize: 11, marginTop: 2 },
  statRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  statIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4 },
  statValue: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  todayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
  },
  todayLabel: { fontSize: 14, fontWeight: "700" },
  todayValue: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.blueFlat },
  todayArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.blueFlat,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { fontSize: 17, fontWeight: "800", marginTop: 22, marginBottom: 10 },
  bigTileRow: { flexDirection: "row", gap: 10 },
  bigTile: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 6,
    gap: 10,
  },
  bigTileIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  bigTileLabel: { fontSize: 12.5, fontWeight: "700", textAlign: "center" },
  gridCard: { flexDirection: "row", borderWidth: 1, borderRadius: 16, paddingVertical: 16 },
  gridItem: { flex: 1, alignItems: "center", gap: 8, paddingHorizontal: 4 },
  gridLabel: { fontSize: 11.5, fontWeight: "700", textAlign: "center" },
  listCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  listLabel: { flex: 1, fontSize: 15, fontWeight: "700" },
});
