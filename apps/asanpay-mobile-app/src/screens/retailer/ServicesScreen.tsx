import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, UIManager, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { Bell, Gift, Scan } from "lucide-react-native";
import { CategorySection } from "../../components/CategorySection";
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
import { RechargeScreen } from "./RechargeScreen";
import { showAlert } from "../../components/AppAlert";
import { BrandLockup } from "../../components/BrandMark";
import { SupportCallButton } from "../../components/SupportCallButton";
import { ScanQrModal } from "../shared/ScanQrModal";
import { LinkedAccountsHost, type LinkedAccountsView } from "../../components/linkedAccounts/LinkedAccountsHost";
import { PageEnter } from "../../components/PageEnter";
import { TodayEarningsCard } from "../../components/TodayEarningsCard";
import { PanMissingBanner } from "../../components/PanMissingBanner";
import { ServiceWindowBanner } from "../../components/ServiceWindowBanner";
import { NobleAgentOnboardModal } from "../shared/NobleAgentOnboardModal";
import { CashManagementModal } from "../shared/CashManagementModal";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

function isKycServicesUnlocked(user: { kycStatus: string }) {
  return user.kycStatus === "verified";
}

function needsSignupKycCompletion(user: { kycStatus: string; hasKycDocs: boolean }) {
  if (user.kycStatus === "rejected") return true;
  if (user.kycStatus === "verified" && user.hasKycDocs) return false;
  return !user.hasKycDocs;
}

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Service codes that route to dedicated full-screen flows instead of the generic "coming soon" tile press. */
const AEPS_CODES = new Set(["AADHAAR_PAY", "CASH_WITHDRAW", "BALANCE_ENQUIRY", "MINI_STATEMENT", "CASH_DEPOSIT"]);
const DMT_CODES = new Set(["MONEY_TRANSFER"]);
const NEPAL_CODES = new Set(["NEPAL", "NEPAL_REMITTANCE"]);
const UPI_CP_CODES = new Set(["UPI_CASH_POINT", "UPI_QR", "UPIQR"]);
const RECHARGE_CODES = new Set(["MOBILE_PREPAID", "DTH"]);
const CMS_CODES = new Set(["CASH_COLLECTION", "AGENT_COLLECTION", "CMS", "AIRTEL_CMS"]);

function greetingName(name: string): string {
  const first = name.split(" ")[0] ?? name;
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

export function ServicesScreen() {
  const user = useAuthStore((s) => s.user)!;
  const setSignupContinue = useAuthStore((s) => s.setSignupContinue);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  useEffect(() => {
    if (user.kycStatus !== "rejected") return;
    let cancelled = false;
    fetchApi<{ profile: { rejectReason?: string | null } }>("/kyc/me")
      .then((r) => {
        if (!cancelled) setRejectReason(r.profile.rejectReason ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user.kycStatus]);
  const navigation = useNavigation<BottomTabNavigationProp<Record<string, undefined>>>();
  const { tokens } = useTheme();
  const servicesUnlocked = isKycServicesUnlocked(user);
  const [categories, setCategories] = useState<CatalogCategoryView[]>([]);
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [todayEarnings, setTodayEarnings] = useState("0");
  const [todayGross, setTodayGross] = useState<string | null>(null);
  const [todayTds, setTodayTds] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [accountsView, setAccountsView] = useState<LinkedAccountsView | null>(null);
  const [homeEditMode, setHomeEditMode] = useState(false);
  const [activeScreen, setActiveScreen] = useState<"home" | "aeps" | "dmt" | "nepal" | "upi_cp" | "recharge">("home");
  const [aepsServiceCode, setAepsServiceCode] = useState<string | undefined>();
  const [pendingAepsCode, setPendingAepsCode] = useState<string | null>(null);
  const [onboardingSkipped, setOnboardingSkipped] = useState(false);
  const [showCms, setShowCms] = useState(false);
  const [rechargeServiceCode, setRechargeServiceCode] = useState<"MOBILE_PREPAID" | "DTH">("MOBILE_PREPAID");

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
      const [cat, wal, dash] = await Promise.all([
        fetchApi<CatalogCategoryView[]>("/catalog"),
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<{
          today?: { commissionEarned?: string };
          revenue?: { todayCommission?: string };
          todayCommissionGross?: string;
          todayCommissionTds?: string;
        }>("/dashboard/stats").catch(() => null),
      ]);
      setCategories(cat);
      setWallets(wal);
      setTodayEarnings(
        dash?.today?.commissionEarned ?? dash?.revenue?.todayCommission ?? "0",
      );
      setTodayGross(dash?.todayCommissionGross ?? null);
      setTodayTds(dash?.todayCommissionTds ?? null);
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
    if (!servicesUnlocked) {
      showAlert(
        "KYC required",
        user.hasKycDocs
          ? "KYC under review — services unlock after admin approval"
          : "First complete your KYC",
      );
      return;
    }
    // These need the provider agent id: daily 2FA (and AEPS itself) fail without onboarding,
    // so the onboarding form opens instead of the service until it is done.
    if (AEPS_CODES.has(code) || UPI_CP_CODES.has(code) || DMT_CODES.has(code)) {
      if (user.aepsOnboardingRequired && !onboardingSkipped) {
        setPendingAepsCode(code);
        return;
      }
      openAepsFamily(code);
      return;
    }
    if (NEPAL_CODES.has(code)) {
      setActiveScreen("nepal");
      return;
    }
    if (CMS_CODES.has(code)) {
      setShowCms(true);
      return;
    }
    if (RECHARGE_CODES.has(code) || code === "MOBILE_RECHARGE") {
      setRechargeServiceCode(code === "DTH" ? "DTH" : "MOBILE_PREPAID");
      setActiveScreen("recharge");
      return;
    }
    showAlert(code.replace(/_/g, " "), "This service will be available soon.");
  }

  function openAepsFamily(code: string) {
    if (DMT_CODES.has(code)) {
      setActiveScreen("dmt");
      return;
    }
    if (UPI_CP_CODES.has(code)) {
      setActiveScreen("upi_cp");
      return;
    }
    setAepsServiceCode(code);
    setActiveScreen("aeps");
  }

  function closeAepsOnboarding() {
    const code = pendingAepsCode;
    setPendingAepsCode(null);
    if (code && !useAuthStore.getState().user?.aepsOnboardingRequired) openAepsFamily(code);
  }

  /** Skip opens the service screen; it hides the 2FA gate and asks for onboarding on transactions. */
  function skipAepsOnboarding() {
    const code = pendingAepsCode;
    setPendingAepsCode(null);
    setOnboardingSkipped(true);
    if (code) openAepsFamily(code);
  }

  function backToHome() {
    setActiveScreen("home");
    setAepsServiceCode(undefined);
    void load(true);
    void reloadRecent();
  }

  if (activeScreen === "aeps") return <AepsScreen onBack={backToHome} serviceCode={aepsServiceCode} />;
  if (activeScreen === "dmt") return <DmtScreen onBack={backToHome} />;
  if (activeScreen === "nepal") {
    return <NepalScreen onBack={backToHome} onOpenDmt={() => setActiveScreen("dmt")} />;
  }
  if (activeScreen === "upi_cp") return <UpiCashPointScreen onBack={backToHome} />;
  if (activeScreen === "recharge") {
    return <RechargeScreen serviceCode={rechargeServiceCode} onBack={backToHome} />;
  }

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const firstName = user.name.split(" ")[0] ?? user.name;
  return (
    <PageEnter>
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <ScreenHeader
        variant="profile"
        brand={<BrandLockup iconSize={44} animate light showTagline />}
        brandRight={<SupportCallButton />}
        avatarLetter={initials || firstName.charAt(0).toUpperCase()}
        onAvatarPress={() => setAccountsView("menu")}
        eyebrow={greetingName(user.name)}
        title={user.name}
        subtitle={
          user.kycStatus === "verified"
            ? "KYC Verified"
            : user.kycStatus === "rejected"
              ? "KYC Rejected"
              : user.hasKycDocs
                ? "KYC Under Review"
                : "KYC Pending"
        }
        topRight={
          <View style={styles.headerIconRow}>
            <Pressable
              style={styles.headerIconBtn}
              onPress={() => setScanOpen(true)}
              accessibilityLabel="Scan QR"
            >
              <Scan size={18} color="#fff" strokeWidth={2.1} />
            </Pressable>
            <Pressable style={styles.headerIconBtn} onPress={() => showAlert("Coming soon", "Notifications")}>
              <Bell size={18} color="#fff" strokeWidth={2.1} />
              <View style={styles.headerIconDot} />
            </Pressable>
          </View>
        }
      >
        <WalletBar
          wallets={wallets}
          onWalletPress={() => navigation.navigate("Balance")}
        />
      </ScreenHeader>

      <TodayEarningsCard
        net={todayEarnings}
        gross={todayGross}
        tds={todayTds}
        onReport={() => {
          const d = new Date();
          const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          (navigation as { navigate: (n: string, p?: object) => void }).navigate("MyEarnings", {
            from: ymd,
            to: ymd,
          });
        }}
      />
      <ServiceWindowBanner />
      <PanMissingBanner onPress={() => navigation.navigate("Account")} />

      {user.kycStatus !== "verified" ? (
        <Pressable
          onPress={() => {
            if (needsSignupKycCompletion(user) || user.kycStatus === "rejected") {
              setSignupContinue(true);
            }
          }}
          style={[
            styles.kycBanner,
            user.kycStatus === "rejected"
              ? { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }
              : user.hasKycDocs
                ? { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" }
                : { backgroundColor: "#FFF7ED", borderColor: "#FDBA74" },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 0.4,
                marginBottom: 4,
                color:
                  user.kycStatus === "rejected"
                    ? "#991B1B"
                    : user.hasKycDocs
                      ? "#166534"
                      : "#9A3412",
              }}
            >
              {user.kycStatus === "rejected"
                ? "REJECTED"
                : user.hasKycDocs
                  ? "UNDER REVIEW"
                  : "ACTION NEEDED"}
            </Text>
            <Text
              style={[
                styles.kycBannerTitle,
                {
                  color:
                    user.kycStatus === "rejected"
                      ? "#991B1B"
                      : user.hasKycDocs
                        ? "#14532D"
                        : "#9A3412",
                },
              ]}
            >
              {user.kycStatus === "rejected"
                ? "KYC rejected — resubmit"
                : user.hasKycDocs
                  ? "KYC under review"
                  : "Complete your KYC for Onboarding"}
            </Text>
            <Text
              style={[
                styles.kycBannerBody,
                {
                  color:
                    user.kycStatus === "rejected"
                      ? "#B91C1C"
                      : user.hasKycDocs
                        ? "#15803D"
                        : "#C2410C",
                },
              ]}
            >
              {user.kycStatus === "rejected" && rejectReason
                ? `Reason: ${rejectReason}. Tap to fix and resubmit.`
                : user.hasKycDocs && user.kycStatus !== "rejected"
                  ? "Services stay locked until admin approval."
                  : "Tap to continue signup KYC where you left off."}
            </Text>
          </View>
          {needsSignupKycCompletion(user) || user.kycStatus === "rejected" ? (
            <Text
              style={{
                color: user.kycStatus === "rejected" ? "#DC2626" : "#EA580C",
                fontWeight: "800",
                fontSize: 12,
              }}
            >
              Continue
            </Text>
          ) : null}
        </Pressable>
      ) : null}

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
            {categories.map((c) => (
              <CategorySection
                key={c.id}
                category={c}
                userId={user.id}
                defaultOpen
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
      <NobleAgentOnboardModal
        visible={pendingAepsCode !== null}
        onClose={closeAepsOnboarding}
        onSkip={skipAepsOnboarding}
      />
      <CashManagementModal visible={showCms} onClose={() => setShowCms(false)} />
      <ScanQrModal visible={scanOpen} onClose={() => setScanOpen(false)} />
      <LinkedAccountsHost view={accountsView} onClose={() => setAccountsView(null)} />
    </SafeAreaView>
    </PageEnter>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  loader: { marginTop: 40 },
  kycBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  kycBannerTitle: { fontSize: 13, fontWeight: "800" },
  kycBannerBody: { fontSize: 11, marginTop: 2, lineHeight: 15 },
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
  todayEarnCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  todayEarnIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  todayEarnLabel: { flex: 1, fontSize: 14, fontWeight: "700" },
  todayEarnValue: { fontSize: 15, fontWeight: "800", color: colors.blueFlat },
  todayEarnArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.blueFlat,
    alignItems: "center",
    justifyContent: "center",
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
