import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { Bell, Scan } from "lucide-react-native";
import type { UserRole } from "@asanpay/shared-types";
import { DownlineCard } from "../../components/DownlineCard";
import { ModalSheet } from "../../components/ModalSheet";
import { ScreenHeader } from "../../components/ScreenHeader";
import { WalletBar } from "../../components/WalletBar";
import { api, fetchApi } from "../../lib/api";
import { createAttemptKeyHolder } from "../../lib/idempotencyKey";
import { CHILD_ROLE, ROLE_LABEL } from "../../lib/roles";
import type { DownlineUser, WalletBalance } from "../../lib/types";
import { useAuthStore } from "../../store/auth";
import { useTxnPin } from "../../hooks/useTxnPin";
import { colors } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";

function greetingName(name: string): string {
  const first = name.split(" ")[0] ?? name;
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

export function NetworkScreen() {
  const user = useAuthStore((s) => s.user)!;
  const setSignupContinue = useAuthStore((s) => s.setSignupContinue);
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [fundTarget, setFundTarget] = useState<DownlineUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const childRole = CHILD_ROLE[user.role];
  const needsKyc =
    user.kycStatus !== "verified" && (user.kycStatus === "rejected" || !user.hasKycDocs);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [wal, down] = await Promise.all([
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<DownlineUser[]>("/users/downline"),
      ]);
      setWallets(wal);
      setDownline(down);
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

  async function toggleActive(target: DownlineUser) {
    setTogglingId(target.id);
    try {
      await api.patch(`/users/${target.id}/active`, { isActive: !target.isActive });
      showAlert("Updated", target.isActive ? "Deactivated" : "Activated");
      await load(true);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed";
      showAlert("Error", msg);
    } finally {
      setTogglingId(null);
    }
  }

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader
        variant="profile"
        avatarLetter={initials || user.name.charAt(0).toUpperCase()}
        eyebrow={greetingName(user.name)}
        title={user.name}
        subtitle={`${ROLE_LABEL[user.role]} · ${user.uid}`}
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

      {user.kycStatus !== "verified" ? (
        <Pressable
          onPress={() => {
            if (needsKyc) setSignupContinue(true);
          }}
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: `${colors.blue}33`,
            backgroundColor: `${colors.blue}14`,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.blueFlat, fontWeight: "800", fontSize: 13 }}>
              {user.hasKycDocs && user.kycStatus !== "rejected"
                ? "KYC under review"
                : "Complete your KYC for Onboarding"}
            </Text>
            <Text style={{ color: "#8FA2E0", fontSize: 11, marginTop: 2 }}>
              {needsKyc ? "Tap to continue signup KYC." : "Awaiting admin approval."}
            </Text>
          </View>
        </Pressable>
      ) : null}

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
        <View style={styles.toolbar}>
          <Text style={styles.sectionTitle}>
            My Downline {childRole ? `(${ROLE_LABEL[childRole]}s)` : ""}
          </Text>
          {childRole && (
            <Pressable onPress={() => setShowOnboard(true)}>
              <LinearGradient colors={[...colors.gradient]} style={styles.addBtn}>
                <Text style={styles.addBtnText}>+ Onboard</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 24 }} />
        ) : downline.length === 0 ? (
          <Text style={styles.empty}>No downline yet. Tap Onboard to add.</Text>
        ) : (
          downline.map((u) => (
            <DownlineCard
              key={u.id}
              user={u}
              onFund={setFundTarget}
              onToggleActive={(target) => void toggleActive(target)}
              toggling={togglingId === u.id}
            />
          ))
        )}
      </ScrollView>

      {childRole && (
        <OnboardModal
          visible={showOnboard}
          childRole={childRole}
          label={ROLE_LABEL[childRole]}
          onClose={() => setShowOnboard(false)}
          onSuccess={() => void load(true)}
        />
      )}

      {fundTarget && (
        <FundModal
          visible={!!fundTarget}
          target={fundTarget}
          onClose={() => setFundTarget(null)}
          onSuccess={() => void load(true)}
        />
      )}
    </SafeAreaView>
  );
}

function OnboardModal({
  visible,
  childRole,
  label,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  childRole: UserRole;
  label: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      await api.post("/auth/register", { name, mobile, password, role: childRole });
      showAlert("Success", `${label} onboarded successfully`);
      onSuccess();
      onClose();
      setName("");
      setMobile("");
      setPassword("");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Failed";
      showAlert("Error", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalSheet visible={visible} title={`Onboard ${label}`} onClose={onClose}>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Mobile" value={mobile} onChangeText={(t) => setMobile(t.replace(/\D/g, ""))} keyboardType="phone-pad" maxLength={10} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable onPress={submit} disabled={loading}>
        <LinearGradient colors={[...colors.gradient]} style={styles.submit}>
          <Text style={styles.submitText}>{loading ? "Saving..." : "Create Account"}</Text>
        </LinearGradient>
      </Pressable>
    </ModalSheet>
  );
}

function FundModal({
  visible,
  target,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  target: DownlineUser;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const { promptPin, TxnPinPrompt } = useTxnPin();
  const attemptKey = useRef(createAttemptKeyHolder(`xfer-${target.id}`));

  async function submit() {
    if (loading) return;
    if (!amount || parseFloat(amount) <= 0) {
      showAlert("Invalid amount", "Enter a valid amount.");
      return;
    }
    let txnAuth: string;
    try {
      txnAuth = await promptPin();
    } catch {
      return;
    }
    setLoading(true);
    try {
      await api.post("/wallet/transfer", {
        targetUserId: target.id,
        walletType: "main",
        amount,
        txnAuth,
        idempotencyKey: attemptKey.current.get(),
        ...(note ? { description: note } : {}),
      });
      attemptKey.current.clear();
      showAlert("Success", `₹${amount} sent to ${target.name}`);
      onSuccess();
      onClose();
      setAmount("");
      setNote("");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Transfer failed";
      showAlert("Error", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ModalSheet visible={visible} title={`Fund ${target.name}`} onClose={onClose}>
      <Field label="Amount (₹)" value={amount} onChangeText={(t) => { setAmount(t.replace(/[^\d.]/g, "")); attemptKey.current.clear(); }} keyboardType="decimal-pad" />
      <Field label="Note (optional)" value={note} onChangeText={setNote} />
      <Pressable onPress={submit} disabled={loading}>
        <LinearGradient colors={[...colors.gradient]} style={styles.submit}>
          <Text style={styles.submitText}>{loading ? "Sending..." : "Send Funds"}</Text>
        </LinearGradient>
      </Pressable>
    </ModalSheet>
    <TxnPinPrompt />
    </>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "phone-pad" | "decimal-pad";
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        maxLength={maxLength}
        placeholderTextColor={colors.textLight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 32 },
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
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, flex: 1 },
  addBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 24 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  submit: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
