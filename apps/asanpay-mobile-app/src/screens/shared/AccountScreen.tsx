import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import LinearGradient from "react-native-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import {
  ChevronRight,
  Fingerprint,
  HelpCircle,
  Info,
  KeyRound,
  Landmark,
  LifeBuoy,
  Lock,
  MessageCircle,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
  TrendingUp,
  UserCircle,
  Wallet,
} from "lucide-react-native";
import { isFundRequestEnabled, ROLE_LABELS, type ApiResponse, type AuthUser } from "@asanpay/shared-types";
import { BrandMark } from "../../components/BrandMark";
import { PageEnter } from "../../components/PageEnter";
import { ModalSheet } from "../../components/ModalSheet";
import { PinInput } from "../../components/PinInput";
import { api, fetchApi } from "../../lib/api";
import { formatINR } from "../../lib/format";
import { logoutEverywhere } from "../../lib/logout";
import { apiError } from "../../utils/apiError";
import { useAuthStore } from "../../store/auth";
import { useTheme, type ThemeMode } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import {
  disableBioUnlock,
  enableBioUnlock,
  getBioUnlock,
} from "../../lib/bioUnlock";
import type { LoginRoleChip } from "../LoginScreen";
import { SupportModal } from "./SupportModal";
import { SettlementsModal } from "./SettlementsModal";
import { FundRequestModal } from "./FundRequestScreen";
import { RegisterOutletModal } from "./RegisterOutletModal";
import { NobleAgentOnboardModal } from "./NobleAgentOnboardModal";
import { NobleCmsModal } from "./NobleCmsModal";
import { UpiCashPointScreen } from "../retailer/UpiCashPointScreen";
import { BioKycModal } from "./BioKycModal";
import { BiometricDevicesModal } from "./BiometricDevicesModal";
import { DeviceRepairModal } from "./DeviceRepairModal";

/** Decorative cover art behind the profile banner — waves + soft dots, brand blue/green only. */
function BannerCover() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 400 260"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
    >
      <Circle cx="360" cy="20" r="70" fill="rgba(255,255,255,0.08)" />
      <Circle cx="40" cy="230" r="90" fill="rgba(255,255,255,0.06)" />
      <Circle cx="330" cy="150" r="10" fill={colors.greenLight} opacity={0.5} />
      <Circle cx="300" cy="190" r="5" fill="#fff" opacity={0.4} />
      <Path
        d="M0 190 Q100 150 200 185 T400 175 V260 H0 Z"
        fill="rgba(255,255,255,0.05)"
      />
      <Path
        d="M0 220 Q120 190 220 218 T400 210 V260 H0 Z"
        fill="rgba(255,255,255,0.07)"
      />
    </Svg>
  );
}

function SectionCard({
  tokens,
  children,
}: {
  tokens: ReturnType<typeof useTheme>["tokens"];
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[menuStyles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
      {items.map((child, i) => (
        <View key={i} style={i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: tokens.cardBorder }}>
          {child}
        </View>
      ))}
    </View>
  );
}

function MenuRow({
  icon: Icon,
  label,
  subtitle,
  onPress,
  right,
  tokens,
}: {
  icon: typeof Sun;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  tokens: ReturnType<typeof useTheme>["tokens"];
}) {
  return (
    <Pressable style={menuStyles.item} onPress={onPress} disabled={!onPress}>
      <View style={[menuStyles.iconWrap, { borderColor: tokens.cardBorder }]}>
        <Icon size={19} color={tokens.txt} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[menuStyles.text, { color: tokens.txt }]}>{label}</Text>
        {subtitle ? <Text style={[menuStyles.subtitle, { color: tokens.sub }]}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={tokens.mute} /> : null)}
    </Pressable>
  );
}

const menuStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 20,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: 15, fontWeight: "700" },
  subtitle: { fontSize: 12, fontWeight: "500", marginTop: 2 },
});

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "auto", label: "Auto", icon: Smartphone },
];

export function AccountScreen() {
  const user = useAuthStore((s) => s.user)!;
  const updateUser = useAuthStore((s) => s.updateUser);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const { tokens, mode, setMode } = useTheme();
  const navigation = useNavigation();
  const [showSetPin, setShowSetPin] = useState(false);
  const [showSetMpin, setShowSetMpin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [showBiometricDevices, setShowBiometricDevices] = useState(false);
  const [showDeviceRepair, setShowDeviceRepair] = useState(false);
  const [showDevicesHub, setShowDevicesHub] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showSettlements, setShowSettlements] = useState(false);
  const [showFund, setShowFund] = useState(false);
  const [showRegisterOutlet, setShowRegisterOutlet] = useState(false);
  const [showNobleOnboard, setShowNobleOnboard] = useState(false);
  const [showNobleCms, setShowNobleCms] = useState(false);
  const [showNobleUpiQr, setShowNobleUpiQr] = useState(false);
  const [showBioKyc, setShowBioKyc] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [tdsSummary, setTdsSummary] = useState<{
    month: string;
    totalGross: string;
    totalTds: string;
    totalNet: string;
    hasPan: boolean;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchApi<{
      month: string;
      totalGross: string;
      totalTds: string;
      totalNet: string;
      hasPan: boolean;
    }>("/earnings/tds-summary")
      .then((data) => {
        if (alive) setTdsSummary(data);
      })
      .catch(() => {
        /* non-blocking */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function linkTelegram() {
    if (telegramBusy) return;
    setTelegramBusy(true);
    try {
      const res = await api.post<ApiResponse<{ deepLink: string; expiresInSeconds: number }>>(
        "/auth/telegram/link",
      );
      if (!res.data.success || !res.data.data?.deepLink) {
        throw new Error(res.data.message || "Could not create Telegram link");
      }
      await Linking.openURL(res.data.data.deepLink);
      showAlert(
        "Finish in Telegram",
        "Tap Start in Telegram. Then come back here and tap Refresh Telegram status.",
      );
    } catch (err) {
      showAlert("Link failed", apiError(err, "Could not start Telegram link"));
    } finally {
      setTelegramBusy(false);
    }
  }

  async function unlinkTelegram() {
    if (telegramBusy) return;
    setTelegramBusy(true);
    try {
      const res = await api.delete<ApiResponse<{ user: AuthUser }>>("/auth/telegram/link");
      if (!res.data.success || !res.data.data?.user) {
        throw new Error(res.data.message || "Could not unlink");
      }
      updateUser(res.data.data.user);
      showAlert("Done", "Telegram unlinked");
    } catch (err) {
      showAlert("Unlink failed", apiError(err, "Could not unlink Telegram"));
    } finally {
      setTelegramBusy(false);
    }
  }

  async function refreshTelegramStatus() {
    try {
      const res = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (res.data.success && res.data.data?.user) {
        updateUser(res.data.data.user);
        showAlert(
          "Telegram",
          res.data.data.user.telegramLinked
            ? "Linked — login OTPs can be sent to Telegram."
            : "Not linked yet. Open Telegram and tap Start, then refresh again.",
        );
      }
    } catch (err) {
      showAlert("Refresh failed", apiError(err, "Could not refresh status"));
    }
  }

  function goManageWallet() {
    navigation.navigate("Balance" as never);
  }

  function goMyEarnings() {
    navigation.navigate("MyEarnings" as never);
  }

  const fundOn = isFundRequestEnabled(user.role, user.fundRequestEnabled);

  function goRequestFunds() {
    if (!fundOn) {
      showAlert(
        "Not enabled",
        "Fund requests are not enabled for your account. Contact your sales manager to enable them.",
      );
      return;
    }
    setShowFund(true);
  }

  useEffect(() => {
    void getBioUnlock().then((rec) => {
      setBioEnabled(Boolean(rec?.enabled && rec.mobile === user.mobile));
    });
  }, [user.mobile]);

  async function toggleFingerprint() {
    if (bioEnabled) {
      await disableBioUnlock();
      setBioEnabled(false);
      showAlert("Fingerprint off", "Fingerprint unlock disabled on this device.");
      return;
    }
    if (!refreshToken) {
      showAlert("Unavailable", "Session missing — logout and login again.");
      return;
    }
    const agentRoles = ["retailer", "distributor", "super_distributor"] as const;
    const role = agentRoles.includes(user.role as (typeof agentRoles)[number])
      ? (user.role as LoginRoleChip)
      : null;
    if (!role) {
      showAlert("Unavailable", "Fingerprint unlock is only for agent accounts.");
      return;
    }
    await enableBioUnlock({
      mobile: user.mobile,
      role,
      refreshToken,
    });
    setBioEnabled(true);
    showAlert("Fingerprint on", "Welcome back → Fingerprint se unlock kar sakte ho.");
  }

  function handleLogout() {
    showAlert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          void logoutEverywhere();
        },
      },
    ]);
  }

  const QUICK_ACTIONS = [
    { icon: Wallet, label: "Manage\nWallet", action: goManageWallet },
    { icon: Landmark, label: "Bank\nSettlement", action: () => setShowSettlements(true) },
    ...(fundOn ? [{ icon: KeyRound, label: "Request\nFunds", action: goRequestFunds }] : []),
    { icon: ShieldCheck, label: "My\nEarnings", action: goMyEarnings },
  ];

  return (
    <PageEnter>
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <LinearGradient
        colors={[...colors.gradient]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={styles.banner}
      >
        <BannerCover />
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle} numberOfLines={1}>
              {user.name}
            </Text>
            <Text style={styles.bannerSubtitle} numberOfLines={1}>
              {ROLE_LABELS[user.role]}
            </Text>
          </View>
        </View>
        <View style={styles.brandRow}>
          <BrandMark size={26} variant="mark" />
          <Text style={styles.poweredBy}>Powered by AsanPay</Text>
        </View>
        <View style={styles.quickActions}>
          {QUICK_ACTIONS.map((qa) => (
            <Pressable key={qa.label} onPress={qa.action} style={styles.quickAction}>
              <View style={styles.quickActionIcon}>
                <qa.icon size={18} color={colors.white} />
              </View>
              <Text style={styles.quickActionLabel}>{qa.label}</Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.themeCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          <View style={styles.themeHeaderRow}>
            <Sun size={16} color={colors.blueFlat} />
            <Text style={[styles.themeTitle, { color: tokens.txt }]}>Appearance</Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.themeHint, { color: tokens.sub }]}>
              {mode === "auto" ? "Follows system" : mode === "dark" ? "Dark" : "Light"}
            </Text>
          </View>
          <View style={[styles.themeTrack, { backgroundColor: tokens.segTrack }]}>
            {THEME_OPTIONS.map((opt) => {
              const active = mode === opt.key;
              const Icon = opt.icon;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setMode(opt.key)}
                  style={[styles.themeOption, active && { backgroundColor: tokens.card }]}
                >
                  <Icon size={15} color={active ? colors.blueFlat : tokens.sub} strokeWidth={2.2} />
                  <Text style={[styles.themeOptionText, { color: active ? colors.blueFlat : tokens.sub }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {tdsSummary ? (
          <>
            <Text style={[styles.section, { color: tokens.sub }]}>Tax</Text>
            {!tdsSummary.hasPan ? (
              <Pressable
                onPress={() => setShowProfile(true)}
                style={[
                  styles.panBanner,
                  { backgroundColor: "#FFF7ED", borderColor: "#FDBA74" },
                ]}
              >
                <Text style={styles.panBannerTitle}>Add PAN for TDS</Text>
                <Text style={styles.panBannerSub}>
                  PAN is missing on your profile. TDS still applies at the configured rate — complete KYC /
                  PAN so your tax records stay accurate.
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => goMyEarnings()}
              style={[styles.tdsCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
            >
              <View style={[styles.tdsIcon, { backgroundColor: colors.greenBg }]}>
                <TrendingUp size={18} color={colors.green} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.tdsLabel, { color: tokens.sub }]}>
                  TDS this month ({tdsSummary.month})
                </Text>
                <Text style={[styles.tdsValue, { color: tokens.txt }]}>
                  {formatINR(tdsSummary.totalTds)}
                </Text>
                <Text style={[styles.tdsMeta, { color: tokens.sub }]}>
                  Gross {formatINR(tdsSummary.totalGross)} · Net {formatINR(tdsSummary.totalNet)}
                </Text>
              </View>
              <ChevronRight size={18} color={tokens.mute} />
            </Pressable>
          </>
        ) : null}

        <Text style={[styles.section, { color: tokens.sub }]}>Manage</Text>
        <SectionCard tokens={tokens}>
          <MenuRow
            icon={UserCircle}
            label="Profile & KYC"
            subtitle="view your personal details"
            tokens={tokens}
            onPress={() => setShowProfile(true)}
          />
          <MenuRow
            icon={Smartphone}
            label="Devices"
            subtitle="add, activate or repair your devices"
            tokens={tokens}
            onPress={() => setShowDevicesHub(true)}
          />
          {user.role === "retailer" && !user.hasNobleAgent ? (
            <MenuRow
              icon={ShieldCheck}
              label="AEPS agent onboarding"
              subtitle="one-time setup for AEPS services"
              tokens={tokens}
              onPress={() => setShowNobleOnboard(true)}
            />
          ) : null}
          {user.role === "retailer" ? (
            <MenuRow
              icon={ShieldCheck}
              label="UPI Cash Point"
              subtitle="QR-based cash withdrawal via UPI"
              tokens={tokens}
              onPress={() => setShowNobleUpiQr(true)}
            />
          ) : null}
          {user.role === "retailer" ? (
            <MenuRow
              icon={ShieldCheck}
              label="Cash Collection"
              subtitle="Start a collection and check status"
              tokens={tokens}
              onPress={() => setShowNobleCms(true)}
            />
          ) : null}
          {user.role === "retailer" && !user.hasInstantpayOutlet ? (
            <MenuRow
              icon={ShieldCheck}
              label="Register InstantPay outlet"
              subtitle="onboard your outlet for InstantPay"
              tokens={tokens}
              onPress={() => setShowRegisterOutlet(true)}
            />
          ) : null}
          {user.role === "retailer" && user.hasInstantpayOutlet ? (
            <MenuRow
              icon={Fingerprint}
              label="Outlet biometric KYC"
              subtitle="verify your outlet with biometrics"
              tokens={tokens}
              onPress={() => setShowBioKyc(true)}
            />
          ) : null}
        </SectionCard>

        <Text style={[styles.section, { color: tokens.sub }]}>Security</Text>
        <SectionCard tokens={tokens}>
          <MenuRow
            icon={KeyRound}
            label={user.hasLoginMpin ? "Change login PIN" : "Set login PIN"}
            subtitle="reset your 4-digit login PIN"
            tokens={tokens}
            onPress={() => setShowSetMpin(true)}
          />
          <MenuRow
            icon={Lock}
            label="Change password"
            subtitle="update your login password"
            tokens={tokens}
            onPress={() => setShowChangePassword(true)}
          />
          <MenuRow
            icon={MessageCircle}
            label={user.telegramLinked ? "Telegram OTP (linked)" : "Link Telegram for OTP"}
            subtitle={
              user.telegramLinked
                ? "login OTPs are sent to Telegram"
                : "receive login OTPs until SMS is enabled"
            }
            tokens={tokens}
            onPress={() => {
              if (telegramBusy) return;
              if (user.telegramLinked) {
                showAlert("Telegram", "Choose an action", [
                  { text: "Refresh status", onPress: () => void refreshTelegramStatus() },
                  { text: "Unlink", style: "destructive", onPress: () => void unlinkTelegram() },
                  { text: "Cancel", style: "cancel" },
                ]);
                return;
              }
              void linkTelegram();
            }}
            right={
              telegramBusy ? <ActivityIndicator color={colors.blueFlat} /> : undefined
            }
          />
          {!user.telegramLinked ? (
            <MenuRow
              icon={MessageCircle}
              label="Refresh Telegram status"
              subtitle="after you tap Start in Telegram"
              tokens={tokens}
              onPress={() => void refreshTelegramStatus()}
            />
          ) : null}
          <MenuRow
            icon={KeyRound}
            label="Transaction PIN"
            subtitle="PIN required for balance transfers"
            tokens={tokens}
            onPress={() => setShowSetPin(true)}
          />
          <MenuRow
            icon={Fingerprint}
            label="Enable fingerprint unlock"
            subtitle="unlock the app with your fingerprint"
            tokens={tokens}
            right={
              <Switch
                value={bioEnabled}
                onValueChange={() => void toggleFingerprint()}
                trackColor={{ true: colors.blueFlat }}
              />
            }
          />
        </SectionCard>

        <Text style={[styles.section, { color: tokens.sub }]}>Legal and Help</Text>
        <SectionCard tokens={tokens}>
          <MenuRow
            icon={Info}
            label="About us"
            subtitle="learn about AsanPay"
            tokens={tokens}
            onPress={() => void Linking.openURL("https://asanpay.in/about")}
          />
          <MenuRow
            icon={ShieldCheck}
            label="Privacy policy"
            subtitle="learn how we protect your data"
            tokens={tokens}
            onPress={() => void Linking.openURL("https://asanpay.in/privacy")}
          />
          <MenuRow
            icon={HelpCircle}
            label="Frequently asked questions"
            subtitle="find solutions to your questions"
            tokens={tokens}
            onPress={() => setShowSupport(true)}
          />
          <MenuRow
            icon={LifeBuoy}
            label="Help & support"
            subtitle="talk to our support team"
            tokens={tokens}
            onPress={() => setShowSupport(true)}
          />
        </SectionCard>

        <Pressable onPress={handleLogout} style={styles.logoutWrap}>
          <LinearGradient
            colors={[colors.danger, colors.dangerDark]}
            start={gradientDirection.diagonal.start}
            end={gradientDirection.diagonal.end}
            style={styles.logout}
          >
            <Text style={styles.logoutText}>Logout</Text>
          </LinearGradient>
        </Pressable>

        <Text style={[styles.version, { color: tokens.mute }]}>AsanPay v4.2.1 · Made in India 🇮🇳</Text>
      </ScrollView>

      <SetLoginMpinModal
        visible={showSetMpin}
        hasMpin={Boolean(user.hasLoginMpin)}
        onClose={() => setShowSetMpin(false)}
        onSaved={(nextUser) => {
          updateUser(nextUser);
          setShowSetMpin(false);
        }}
      />
      <SetTxnPinModal visible={showSetPin} onClose={() => setShowSetPin(false)} />
      <ChangePasswordModal visible={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <TrustedDevicesModal visible={showDevices} onClose={() => setShowDevices(false)} />
      <BiometricDevicesModal
        visible={showBiometricDevices}
        onClose={() => setShowBiometricDevices(false)}
      />
      <DeviceRepairModal visible={showDeviceRepair} onClose={() => setShowDeviceRepair(false)} />
      <DevicesHubModal
        visible={showDevicesHub}
        onClose={() => setShowDevicesHub(false)}
        showBiometric={user.role === "retailer" || user.role === "distributor"}
        onTrusted={() => {
          setShowDevicesHub(false);
          setShowDevices(true);
        }}
        onBiometric={() => {
          setShowDevicesHub(false);
          setShowBiometricDevices(true);
        }}
        onRepair={() => {
          setShowDevicesHub(false);
          setShowDeviceRepair(true);
        }}
      />
      <ProfileModal
        visible={showProfile}
        onClose={() => setShowProfile(false)}
        user={user}
        onBioKyc={() => {
          setShowProfile(false);
          setShowBioKyc(true);
        }}
        onRegisterOutlet={() => {
          setShowProfile(false);
          setShowRegisterOutlet(true);
        }}
        onNobleOnboard={() => {
          setShowProfile(false);
          setShowNobleOnboard(true);
        }}
      />
      <SupportModal visible={showSupport} onClose={() => setShowSupport(false)} />
      <SettlementsModal visible={showSettlements} onClose={() => setShowSettlements(false)} />
      <FundRequestModal visible={showFund} onClose={() => setShowFund(false)} />
      <RegisterOutletModal visible={showRegisterOutlet} onClose={() => setShowRegisterOutlet(false)} />
      <NobleAgentOnboardModal visible={showNobleOnboard} onClose={() => setShowNobleOnboard(false)} />
      <Modal visible={showNobleUpiQr} animationType="slide" onRequestClose={() => setShowNobleUpiQr(false)}>
        <UpiCashPointScreen onBack={() => setShowNobleUpiQr(false)} />
      </Modal>
      <NobleCmsModal visible={showNobleCms} onClose={() => setShowNobleCms(false)} />
      <BioKycModal visible={showBioKyc} onClose={() => setShowBioKyc(false)} />
    </SafeAreaView>
    </PageEnter>
  );
}

function formatKycDate(value: string | null | undefined): string {
  if (!value || !String(value).trim()) return "—";
  const raw = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return raw;
}

type KycMeProfile = {
  uid: string;
  mobile: string;
  fullName: string | null;
  email: string | null;
  dob: string | null;
  anniversaryDate: string | null;
  gender: string | null;
  fatherName: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  aadhaarMasked: string | null;
  panMasked: string | null;
  bankAccountName: string | null;
  bankAccountMasked: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  bankBranch: string | null;
  businessName: string | null;
  businessType: string | null;
};

function ProfileDetailRow({
  label,
  value,
  last,
  tokens,
  badge,
}: {
  label: string;
  value: string;
  last?: boolean;
  tokens: ReturnType<typeof useTheme>["tokens"];
  badge?: React.ReactNode;
}) {
  const empty = !value || value === "—";
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: tokens.cardBorder },
      ]}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <Text style={[styles.rowLabel, { color: tokens.sub }]}>{label}</Text>
          {badge}
        </View>
        <Text
          style={[styles.rowValueLeft, { color: empty ? tokens.mute : tokens.txt }]}
          numberOfLines={4}
        >
          {value || "—"}
        </Text>
      </View>
    </View>
  );
}

function LimitCard({
  label,
  used,
  total,
  pct,
  tokens,
}: {
  label: string;
  used: string;
  total: string;
  pct: number;
  tokens: ReturnType<typeof useTheme>["tokens"];
}) {
  const barColor = pct >= 80 ? colors.danger : colors.green;
  return (
    <View style={[styles.limitCard, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}>
      <View style={styles.limitTop}>
        <Text style={[styles.limitLabel, { color: tokens.sub }]}>{label}</Text>
        <Text style={[styles.limitPct, { color: tokens.txt }]}>{pct}%</Text>
      </View>
      <Text style={[styles.limitUsed, { color: tokens.txt }]}>{used}</Text>
      <Text style={[styles.limitOf, { color: tokens.mute }]}>of {total}</Text>
      <View style={[styles.limitTrack, { backgroundColor: tokens.segTrack }]}>
        <View style={[styles.limitFill, { width: `${Math.min(100, pct)}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

function ProfileModal({
  visible,
  onClose,
  user,
  onBioKyc,
  onRegisterOutlet,
  onNobleOnboard,
}: {
  visible: boolean;
  onClose: () => void;
  user: AuthUser;
  onBioKyc: () => void;
  onRegisterOutlet: () => void;
  onNobleOnboard: () => void;
}) {
  const { tokens } = useTheme();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<KycMeProfile | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{ profile: KycMeProfile & { kycStatus: string; hasKycDocs: boolean } }>
        >("/kyc/me");
        if (cancelled) return;
        if (data.success) setProfile(data.data.profile);
        else setProfile(null);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const emailValue = profile?.email || user.email || "—";
  const emailVerified =
    Boolean(user.emailVerifiedAt) &&
    Boolean(user.email) &&
    (user.email ?? "").toLowerCase() === String(emailValue).toLowerCase();

  const addressLine =
    [profile?.address, profile?.city || profile?.district, profile?.state, profile?.pincode]
      .filter(Boolean)
      .join(", ") || "—";

  const verifiedBadge = (
    <View style={styles.verifiedPill}>
      <Text style={styles.verifiedPillText}>Verified</Text>
    </View>
  );

  const allRows: { label: string; value: string; badge?: React.ReactNode }[] = [
    { label: "Mobile", value: user.mobile, badge: verifiedBadge },
    {
      label: "Email",
      value: emailValue,
      badge: emailVerified ? verifiedBadge : undefined,
    },
    { label: "Full name", value: user.name },
    { label: "UID", value: user.uid },
    { label: "Role", value: ROLE_LABELS[user.role] },
    { label: "Account status", value: user.isActive ? "Active" : "Inactive" },
    { label: "KYC status", value: user.kycStatus },
    { label: "PAN No.", value: profile?.panMasked || "—" },
    { label: "Aadhaar No.", value: profile?.aadhaarMasked || "—" },
    { label: "DOB", value: formatKycDate(profile?.dob) },
    { label: "Anniversary", value: formatKycDate(profile?.anniversaryDate) },
    { label: "Gender", value: profile?.gender || "—" },
    { label: "Father name", value: profile?.fatherName || "—" },
    { label: "Address", value: addressLine },
    { label: "Business", value: profile?.businessName || "—" },
    { label: "Business type", value: profile?.businessType || "—" },
    { label: "Bank", value: profile?.bankName || "—" },
    { label: "Branch", value: profile?.bankBranch || "—" },
    { label: "IFSC", value: profile?.bankIfsc || "—" },
    { label: "Account holder", value: profile?.bankAccountName || "—" },
    { label: "Account", value: profile?.bankAccountMasked || "—" },
  ];

  const limits = [
    { label: "Daily limit", used: "₹1,82,400", total: "₹2,00,000", pct: 91 },
    { label: "Monthly limit", used: "₹8,40,000", total: "₹50,00,000", pct: 17 },
    { label: "Max single", used: "₹25,000", total: "₹50,000", pct: 50 },
  ];

  return (
    <ModalSheet visible={visible} title="Profile & KYC" onClose={onClose}>
      <ScrollView
        style={{ maxHeight: 520 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.pinSub, { color: tokens.sub, marginBottom: 10 }]}>
          KYC details cannot be edited here. Contact support to update verified identity.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginVertical: 16 }} />
        ) : (
          <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            {allRows.map((r, i) => (
              <ProfileDetailRow
                key={r.label}
                label={r.label}
                value={r.value}
                badge={r.badge}
                last={i === allRows.length - 1}
                tokens={tokens}
              />
            ))}
          </View>
        )}

        {user.role === "retailer" && !user.hasNobleAgent ? (
          <Pressable
            onPress={onNobleOnboard}
            style={[styles.linkRow, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkTitle, { color: tokens.txt }]}>AEPS agent onboarding</Text>
              <Text style={{ color: tokens.mute, fontSize: 12 }}>One-time setup for AEPS services</Text>
            </View>
            <ChevronRight size={16} color={colors.blueFlat} />
          </Pressable>
        ) : null}

        {user.role === "retailer" && !user.hasInstantpayOutlet ? (
          <Pressable
            onPress={onRegisterOutlet}
            style={[styles.linkRow, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkTitle, { color: tokens.txt }]}>Register outlet</Text>
              <Text style={{ color: tokens.mute, fontSize: 12 }}>InstantPay Min-KYC</Text>
            </View>
            <ChevronRight size={16} color={colors.blueFlat} />
          </Pressable>
        ) : null}

        {user.role === "retailer" && user.hasInstantpayOutlet ? (
          <Pressable
            onPress={onBioKyc}
            style={[styles.linkRow, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Fingerprint size={18} color={colors.blueFlat} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.linkTitle, { color: tokens.txt }]}>Biometric KYC</Text>
                <Text style={{ color: tokens.mute, fontSize: 12 }}>Fingerprint eKYC for AePS / DMT</Text>
              </View>
            </View>
            <ChevronRight size={16} color={colors.blueFlat} />
          </Pressable>
        ) : null}

        <Text style={[styles.sectionTiny, { color: tokens.sub, marginTop: 8 }]}>Transaction limits</Text>
        <View style={styles.limitsWrap}>
          {limits.map((l) => (
            <LimitCard key={l.label} {...l} tokens={tokens} />
          ))}
        </View>
      </ScrollView>
    </ModalSheet>
  );
}

function DevicesHubModal({
  visible,
  onClose,
  showBiometric,
  onTrusted,
  onBiometric,
  onRepair,
}: {
  visible: boolean;
  onClose: () => void;
  showBiometric: boolean;
  onTrusted: () => void;
  onBiometric: () => void;
  onRepair: () => void;
}) {
  const { tokens } = useTheme();
  return (
    <ModalSheet visible={visible} title="Devices" onClose={onClose}>
      <SectionCard tokens={tokens}>
        <MenuRow
          icon={Smartphone}
          label="Trusted devices"
          subtitle="app login sessions on this device"
          tokens={tokens}
          onPress={onTrusted}
        />
        {showBiometric ? (
          <>
            <MenuRow
              icon={Fingerprint}
              label="Biometric devices"
              subtitle="UIDAI scanners linked to your account"
              tokens={tokens}
              onPress={onBiometric}
            />
            <MenuRow
              icon={Smartphone}
              label="Device repair"
              subtitle="report a broken device"
              tokens={tokens}
              onPress={onRepair}
            />
          </>
        ) : null}
      </SectionCard>
    </ModalSheet>
  );
}

function SetLoginMpinModal({
  visible,
  hasMpin,
  onClose,
  onSaved,
}: {
  visible: boolean;
  hasMpin: boolean;
  onClose: () => void;
  onSaved: (user: AuthUser) => void;
}) {
  const [currentMpin, setCurrentMpin] = useState("");
  const [mpin, setMpin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (mpin.length !== 4) {
      showAlert("Invalid MPIN", "Enter a 4-digit login MPIN.");
      return;
    }
    if (mpin !== confirm) {
      showAlert("Mismatch", "MPIN and confirm MPIN do not match.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/auth/mpin/set", {
        mpin,
        ...(hasMpin ? { currentMpin } : {}),
      });
      if (!data.success) throw new Error(data.message);
      showAlert("Success", "Login MPIN saved. Use it on Welcome back next time.");
      setCurrentMpin("");
      setMpin("");
      setConfirm("");
      onSaved(data.data.user);
    } catch (err) {
      showAlert("Failed", apiError(err, "Could not set login MPIN"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalSheet visible={visible} title={hasMpin ? "Change login MPIN" : "Set login MPIN"} onClose={onClose}>
      <Text style={styles.pinSub}>
        4-digit MPIN se Welcome back screen pe jaldi login hoga. Transaction PIN alag hai.
      </Text>
      {hasMpin ? (
        <>
          <Text style={styles.fieldLabel}>Current MPIN</Text>
          <PinInput value={currentMpin} onChange={setCurrentMpin} length={4} autoFocus={false} />
        </>
      ) : null}
      <Text style={styles.fieldLabel}>New MPIN</Text>
      <PinInput value={mpin} onChange={setMpin} length={4} autoFocus={false} />
      <Text style={styles.fieldLabel}>Confirm MPIN</Text>
      <PinInput value={confirm} onChange={setConfirm} length={4} autoFocus={false} />
      <Pressable
        onPress={submit}
        disabled={loading || mpin.length !== 4 || confirm.length !== 4 || (hasMpin && currentMpin.length !== 4)}
      >
        <LinearGradient colors={[...colors.gradient]} style={styles.setPinBtn}>
          <Text style={styles.setPinBtnText}>{loading ? "Saving..." : "Save MPIN"}</Text>
        </LinearGradient>
      </Pressable>
    </ModalSheet>
  );
}

interface DeviceRow {
  id: string;
  label: string | null;
  trustedAt: string;
  lastAuthAt: string;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function TrustedDevicesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ devices: DeviceRow[] }>>("/auth/devices");
      if (!data.success) throw new Error(data.message);
      setDevices(data.data.devices);
    } catch (err) {
      showAlert("Failed", apiError(err, "Could not load trusted devices"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function confirmRevoke(device: DeviceRow) {
    showAlert("Sign out this device?", `${device.label ?? "This device"} will need to verify with OTP again to log in.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => void revoke(device.id),
      },
    ]);
  }

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      const { data } = await api.post<ApiResponse<null>>(`/auth/devices/${id}/revoke`);
      if (!data.success) throw new Error(data.message);
      setDevices((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      showAlert("Failed", apiError(err, "Could not sign out device"));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <ModalSheet visible={visible} title="Trusted devices" onClose={onClose}>
      <Text style={styles.pinSub}>
        Ye devices bina OTP ke sirf MPIN se login kar sakte hain (12 ghante rolling window). Naya
        device pehli baar OTP maangega.
      </Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.blueFlat} />
      ) : devices.length === 0 ? (
        <Text style={[styles.pinSub, { marginTop: 8 }]}>Koi trusted device nahi hai abhi.</Text>
      ) : (
        devices.map((d) => (
          <View
            key={d.id}
            style={[deviceStyles.row, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          >
            <ShieldCheck size={18} color={colors.blueFlat} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[deviceStyles.label, { color: tokens.txt }]}>{d.label ?? "Unknown device"}</Text>
              <Text style={[deviceStyles.sub, { color: tokens.sub }]}>Last used {timeAgo(d.lastAuthAt)}</Text>
            </View>
            <Pressable onPress={() => confirmRevoke(d)} disabled={revokingId === d.id} hitSlop={8}>
              <Text style={deviceStyles.signOut}>
                {revokingId === d.id ? "…" : "Sign out"}
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </ModalSheet>
  );
}

const deviceStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  label: { fontSize: 14, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 2 },
  signOut: { fontSize: 12.5, fontWeight: "800", color: "#DC2626" },
});

function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!currentPassword) {
      showAlert("Current password required", "Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      showAlert("Password too short", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("Mismatch", "New password and confirm password do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
      // The backend revokes every session (including this one) on a password change.
      showAlert("Password changed", "Please log in again with your new password.", [
        { text: "OK", onPress: () => void logoutEverywhere() },
      ]);
    } catch (err) {
      showAlert("Failed", apiError(err, "Could not change password"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalSheet visible={visible} title="Change Password" onClose={onClose}>
      <Text style={styles.fieldLabel}>Current Password</Text>
      <TextInput
        style={styles.fieldInput}
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.textLight}
      />
      <Text style={styles.fieldLabel}>New Password</Text>
      <TextInput
        style={styles.fieldInput}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder="At least 8 characters"
        placeholderTextColor={colors.textLight}
      />
      <Text style={styles.fieldLabel}>Confirm New Password</Text>
      <TextInput
        style={styles.fieldInput}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.textLight}
      />
      <Pressable
        onPress={submit}
        disabled={loading || !currentPassword || newPassword.length < 8 || !confirmPassword}
      >
        <LinearGradient colors={[...colors.gradient]} style={styles.setPinBtn}>
          <Text style={styles.setPinBtnText}>{loading ? "Saving..." : "Update Password"}</Text>
        </LinearGradient>
      </Pressable>
    </ModalSheet>
  );
}

function SetTxnPinModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (pin.length !== 4) {
      showAlert("Invalid PIN", "Enter a 4-digit transaction PIN.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/txn-pin", { password, pin });
      showAlert("Success", "Transaction PIN set successfully.");
      setPassword("");
      setPin("");
      onClose();
    } catch (err) {
      showAlert("Failed", apiError(err, "Could not set transaction PIN"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalSheet visible={visible} title="Set Transaction PIN" onClose={onClose}>
      <Text style={styles.pinSub}>Login password confirm karein, phir naya 4-digit PIN set karein</Text>
      <Text style={styles.fieldLabel}>Login Password</Text>
      <TextInput
        style={styles.fieldInput}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.textLight}
      />
      <Text style={styles.fieldLabel}>New Transaction PIN</Text>
      <PinInput value={pin} onChange={setPin} autoFocus={false} />
      <Pressable onPress={submit} disabled={loading || !password || pin.length < 4}>
        <LinearGradient colors={[...colors.gradient]} style={styles.setPinBtn}>
          <Text style={styles.setPinBtnText}>{loading ? "Saving..." : "Save PIN"}</Text>
        </LinearGradient>
      </Pressable>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  banner: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: "hidden",
  },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarText: { color: colors.white, fontSize: 18, fontWeight: "800" },
  bannerTitle: { color: colors.white, fontSize: 17, fontWeight: "800" },
  bannerSubtitle: { color: colors.onGradientMuted, fontSize: 12.5, fontWeight: "600", marginTop: 1 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  poweredBy: { color: colors.onGradientMuted, fontSize: 11.5, fontWeight: "600" },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.16)",
  },
  quickAction: { alignItems: "center", flex: 1, gap: 6 },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    color: colors.onGradient,
    fontSize: 10.5,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 13,
  },
  content: { padding: 16, paddingBottom: 32 },
  themeCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 20 },
  themeHeaderRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 13 },
  themeTitle: { fontFamily: "System", fontWeight: "700", fontSize: 14.5 },
  themeHint: { fontSize: 11.5, fontWeight: "600" },
  themeTrack: { flexDirection: "row", gap: 8, padding: 5, borderRadius: 14 },
  themeOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  themeOptionText: { fontSize: 12.5, fontWeight: "700" },
  version: { textAlign: "center", marginTop: 16, fontSize: 12, fontWeight: "600" },
  section: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
  panBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 4,
  },
  panBannerTitle: { fontSize: 14, fontWeight: "800", color: "#C2410C" },
  panBannerSub: { fontSize: 12, fontWeight: "600", color: "#9A3412", lineHeight: 17 },
  tdsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  tdsIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tdsLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  tdsValue: { fontSize: 20, fontWeight: "800", marginTop: 2 },
  tdsMeta: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase" },
  rowValue: { fontSize: 13, fontWeight: "700", color: colors.text, maxWidth: "58%", textAlign: "right" },
  rowValueLeft: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  verifiedPill: {
    backgroundColor: "rgba(18,183,106,0.14)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  verifiedPillText: { color: colors.green, fontSize: 10, fontWeight: "800" },
  sectionTiny: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  moreBtn: {
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  linkTitle: { fontSize: 14, fontWeight: "800" },
  limitsWrap: { gap: 10, marginTop: 4 },
  limitCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  limitTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  limitLabel: { fontSize: 13, fontWeight: "600" },
  limitPct: { fontSize: 12, fontWeight: "800" },
  limitUsed: { fontSize: 14, fontWeight: "800", marginTop: 6 },
  limitOf: { fontSize: 11, marginTop: 2 },
  limitTrack: { height: 8, borderRadius: 999, marginTop: 10, overflow: "hidden" },
  limitFill: { height: "100%", borderRadius: 999 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuText: { fontSize: 15, fontWeight: "600", color: colors.text },
  logoutWrap: { marginTop: 20 },
  logout: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  logoutText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  pinSub: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  setPinBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  setPinBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
