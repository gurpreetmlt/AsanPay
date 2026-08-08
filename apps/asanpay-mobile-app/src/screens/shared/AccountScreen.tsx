import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { ChevronRight, Moon, ShieldCheck, Smartphone, Sun } from "lucide-react-native";
import { ROLE_LABELS, type ApiResponse, type AuthUser } from "@asanpay/shared-types";
import { ModalSheet } from "../../components/ModalSheet";
import { PinInput } from "../../components/PinInput";
import { ScreenHeader } from "../../components/ScreenHeader";
import { api } from "../../lib/api";
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
import { BioKycModal } from "./BioKycModal";
import { BiometricDevicesModal } from "./BiometricDevicesModal";
import { DeviceRepairModal } from "./DeviceRepairModal";

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
  const [showSetPin, setShowSetPin] = useState(false);
  const [showSetMpin, setShowSetMpin] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [showBiometricDevices, setShowBiometricDevices] = useState(false);
  const [showDeviceRepair, setShowDeviceRepair] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showSettlements, setShowSettlements] = useState(false);
  const [showFund, setShowFund] = useState(false);
  const [showRegisterOutlet, setShowRegisterOutlet] = useState(false);
  const [showBioKyc, setShowBioKyc] = useState(false);

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

  const rows = [
    { label: "Name", value: user.name },
    { label: "Mobile", value: user.mobile },
    { label: "UID", value: user.uid },
    { label: "Role", value: ROLE_LABELS[user.role] },
    { label: "KYC", value: user.kycStatus },
    { label: "Status", value: user.isActive ? "Active" : "Inactive" },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <ScreenHeader
        variant="profile"
        avatarLetter={user.name.charAt(0).toUpperCase()}
        title={user.name}
        subtitle={ROLE_LABELS[user.role]}
      />

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

        <Text style={[styles.section, { color: tokens.sub }]}>Account details</Text>
        <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: tokens.cardBorder }]}>
              <Text style={[styles.rowLabel, { color: tokens.sub }]}>{r.label}</Text>
              <Text style={[styles.rowValue, { color: tokens.txt }]}>{r.value}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.section, { color: tokens.sub }]}>Settings</Text>
        <Pressable
          style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          onPress={() => void toggleFingerprint()}
        >
          <Text style={[styles.menuText, { color: tokens.txt }]}>
            {bioEnabled ? "Disable fingerprint unlock" : "Enable fingerprint unlock"}
          </Text>
          <ChevronRight size={18} color={tokens.mute} />
        </Pressable>
        <Pressable
          style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          onPress={() => setShowSetMpin(true)}
        >
          <Text style={[styles.menuText, { color: tokens.txt }]}>
            {user.hasLoginMpin ? "Change login MPIN" : "Set login MPIN"}
          </Text>
          <ChevronRight size={18} color={tokens.mute} />
        </Pressable>
        <Pressable style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]} onPress={() => setShowSetPin(true)}>
          <Text style={[styles.menuText, { color: tokens.txt }]}>Set transaction PIN</Text>
          <ChevronRight size={18} color={tokens.mute} />
        </Pressable>
        <Pressable
          style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          onPress={() => setShowDevices(true)}
        >
          <Text style={[styles.menuText, { color: tokens.txt }]}>Trusted devices</Text>
          <ChevronRight size={18} color={tokens.mute} />
        </Pressable>
        {(user.role === "retailer" || user.role === "distributor") ? (
          <Pressable
            style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
            onPress={() => setShowBiometricDevices(true)}
          >
            <Text style={[styles.menuText, { color: tokens.txt }]}>Biometric devices</Text>
            <ChevronRight size={18} color={tokens.mute} />
          </Pressable>
        ) : null}
        {(user.role === "retailer" || user.role === "distributor") ? (
          <Pressable
            style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
            onPress={() => setShowDeviceRepair(true)}
          >
            <Text style={[styles.menuText, { color: tokens.txt }]}>Device repair</Text>
            <ChevronRight size={18} color={tokens.mute} />
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          onPress={() => setShowSettlements(true)}
        >
          <Text style={[styles.menuText, { color: tokens.txt }]}>Settlements</Text>
          <ChevronRight size={18} color={tokens.mute} />
        </Pressable>
        {user.role === "retailer" ? (
          <Pressable
            style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
            onPress={() => setShowFund(true)}
          >
            <Text style={[styles.menuText, { color: tokens.txt }]}>Add Money</Text>
            <ChevronRight size={18} color={tokens.mute} />
          </Pressable>
        ) : null}
        {user.role === "retailer" && !user.hasInstantpayOutlet ? (
          <Pressable
            style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
            onPress={() => setShowRegisterOutlet(true)}
          >
            <Text style={[styles.menuText, { color: tokens.txt }]}>Register InstantPay outlet</Text>
            <ChevronRight size={18} color={tokens.mute} />
          </Pressable>
        ) : null}
        {user.role === "retailer" && user.hasInstantpayOutlet ? (
          <Pressable
            style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
            onPress={() => setShowBioKyc(true)}
          >
            <Text style={[styles.menuText, { color: tokens.txt }]}>Outlet biometric KYC</Text>
            <ChevronRight size={18} color={tokens.mute} />
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.menuItem, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          onPress={() => setShowSupport(true)}
        >
          <Text style={[styles.menuText, { color: tokens.txt }]}>Help & support</Text>
          <ChevronRight size={18} color={tokens.mute} />
        </Pressable>

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
      <TrustedDevicesModal visible={showDevices} onClose={() => setShowDevices(false)} />
      <BiometricDevicesModal
        visible={showBiometricDevices}
        onClose={() => setShowBiometricDevices(false)}
      />
      <DeviceRepairModal visible={showDeviceRepair} onClose={() => setShowDeviceRepair(false)} />
      <SupportModal visible={showSupport} onClose={() => setShowSupport(false)} />
      <SettlementsModal visible={showSettlements} onClose={() => setShowSettlements(false)} />
      <FundRequestModal visible={showFund} onClose={() => setShowFund(false)} />
      <RegisterOutletModal visible={showRegisterOutlet} onClose={() => setShowRegisterOutlet(false)} />
      <BioKycModal visible={showBioKyc} onClose={() => setShowBioKyc(false)} />
    </SafeAreaView>
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
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontSize: 13, color: colors.textMuted },
  rowValue: { fontSize: 13, fontWeight: "700", color: colors.text, maxWidth: "58%", textAlign: "right" },
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
