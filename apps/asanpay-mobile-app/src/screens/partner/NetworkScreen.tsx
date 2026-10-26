import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { ArrowRight, Clock, Search, Send, Undo2, UserPlus, Zap } from "lucide-react-native";
import { DownlineCard, type WalletActionKind } from "../../components/DownlineCard";
import { ModalSheet } from "../../components/ModalSheet";
import { PartnerTopBar } from "../../components/PartnerTopBar";
import { PageEnter } from "../../components/PageEnter";
import { api, fetchApi } from "../../lib/api";
import { createAttemptKeyHolder, newIdempotencyKey } from "../../lib/idempotencyKey";
import { CHILD_ROLE, ROLE_LABEL } from "../../lib/roles";
import { formatINR } from "../../lib/format";
import type { DownlineUser, LedgerEntry, WalletBalance } from "../../lib/types";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore } from "../../store/auth";
import { PinInput } from "../../components/PinInput";
import { colors } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import { LabelText } from "../../components/RequiredMark";
import Clipboard from "@react-native-clipboard/clipboard";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

const LOW_FLOAT_THRESHOLD = 10000;

export function NetworkScreen() {
  const user = useAuthStore((s) => s.user)!;
  const setSignupContinue = useAuthStore((s) => s.setSignupContinue);
  const navigation = useNavigation<{ navigate: (name: string) => void }>();
  const { tokens } = useTheme();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<LedgerEntry[]>([]);
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [fundTarget, setFundTarget] = useState<{
    user: DownlineUser;
    initialKind: WalletActionKind;
  } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showBulkFund, setShowBulkFund] = useState(false);
  const [inactiveMonth, setInactiveMonth] = useState(0);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);

  const childRole = CHILD_ROLE[user.role];
  const needsKyc = user.kycStatus === "rejected" || !user.hasKycDocs;
  const isSd = user.role === "super_distributor";
  const isDist = user.role === "distributor";
  const mainBal = parseFloat(wallets.find((w) => w.walletType === "main")?.balance ?? "0") || 0;
  const lowFloat = !loading && mainBal < LOW_FLOAT_THRESHOLD;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [wal, down, dash, ledger] = await Promise.all([
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<DownlineUser[]>("/users/downline"),
        fetchApi<{ retailers?: { inactive?: number } }>("/dashboard/stats").catch(() => null),
        fetchApi<LedgerEntry[]>("/wallet/ledger", { limit: 40 }).catch(() => [] as LedgerEntry[]),
      ]);
      setWallets(wal);
      setDownline(down);
      setRecent(
        ledger
          .filter((e) => e.referenceType === "downline_transfer" && e.entryType === "debit")
          .slice(0, 3),
      );
      if (dash?.retailers?.inactive != null) setInactiveMonth(dash.retailers.inactive);
    } catch {
      /* retry on pull */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    if (!CHILD_ROLE[user.role]) return;
    try {
      setInvites(await fetchApi<Invite[]>("/invites"));
    } catch {
      /* list is secondary */
    }
  }, [user.role]);

  useEffect(() => {
    void load();
  }, [load]);

  // Invites are sent from Home, so refresh the list whenever this tab is opened.
  useFocusEffect(
    useCallback(() => {
      void loadInvites();
    }, [loadInvites]),
  );

  async function resendInvite(inv: Invite) {
    setInviteBusy(inv.id);
    try {
      const { data } = await api.post<{ success: boolean; message: string; data: InviteResult }>(
        `/invites/${inv.id}/resend`,
      );
      setInviteResult(data.data);
      setShowOnboard(true);
      void loadInvites();
    } catch (err) {
      showAlert("Error", apiMsg(err, "Could not resend the invite"));
    } finally {
      setInviteBusy(null);
    }
  }

  async function revokeInvite(inv: Invite) {
    setInviteBusy(inv.id);
    try {
      await api.delete(`/invites/${inv.id}`);
      showAlert("Cancelled", "Invite cancelled");
      void loadInvites();
    } catch (err) {
      showAlert("Error", apiMsg(err, "Could not cancel the invite"));
    } finally {
      setInviteBusy(null);
    }
  }

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

  function toggleBulk(id: string) {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function shareInactiveWhatsApp() {
    const loginUrl = "https://asanpay.in/login";
    const text = [
      `Hi, this is ${user.name} from AsanPay.`,
      `${inactiveMonth} retailer${inactiveMonth === 1 ? "" : "s"} in my network have no successful transactions this month.`,
      `Please log in and start serving customers: ${loginUrl}`,
      `Need help? Reply on WhatsApp or open Support in the AsanPay app.`,
    ].join("\n\n");
    void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }

  const bulkTargets = useMemo(
    () => downline.filter((d) => bulkSelected.has(d.id) && d.isActive),
    [downline, bulkSelected],
  );

  const byId = useMemo(() => new Map(downline.map((d) => [d.id, d])), [downline]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return downline;
    return downline.filter(
      (d) => d.name.toLowerCase().includes(q) || d.mobile.includes(q) || d.uid.toLowerCase().includes(q),
    );
  }, [downline, query]);
  const cardStyle = { backgroundColor: tokens.card, borderColor: tokens.cardBorder };
  const childPlural = childRole ? `${ROLE_LABEL[childRole]}s` : "Agents";

  return (
    <PageEnter>
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top"]}>
      <PartnerTopBar title="My Agents" />

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
        <View style={[styles.card, styles.meCard, cardStyle]}>
          <View style={styles.meAvatar}>
            <Text style={styles.meAvatarText}>{user.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.meName, { color: tokens.txt }]} numberOfLines={1}>
              {user.name}
            </Text>
            <View style={styles.meBal}>
              <Text style={styles.meBalText}>My Bal: {formatINR(String(mainBal))}</Text>
            </View>
          </View>
          <Pressable style={styles.historyBtn} onPress={() => navigation.navigate("Ledger")}>
            <Clock size={15} color={colors.blueFlat} strokeWidth={2.3} />
            <Text style={styles.historyText}>History</Text>
          </Pressable>
        </View>

        {user.kycStatus !== "verified" ? (
          <Pressable
            onPress={() => {
              if (needsKyc) setSignupContinue(true);
            }}
            style={[styles.banner, { borderColor: `${colors.blue}33`, backgroundColor: `${colors.blue}14` }]}
          >
            <Text style={{ color: colors.blueFlat, fontWeight: "800", fontSize: 13 }}>
              {user.hasKycDocs && user.kycStatus !== "rejected" ? "KYC under review" : "Complete your KYC for Onboarding"}
            </Text>
            <Text style={{ color: "#8FA2E0", fontSize: 11, marginTop: 2 }}>
              {needsKyc ? "Tap to continue signup KYC." : "Awaiting admin approval."}
            </Text>
          </Pressable>
        ) : null}

        {lowFloat ? (
          <View style={[styles.banner, { borderColor: "#FDBA74", backgroundColor: "#FFF7ED" }]}>
            <Text style={{ color: "#C2410C", fontWeight: "800", fontSize: 13 }}>
              Low float — Add Money / transfer carefully
            </Text>
            <Text style={{ color: "#9A3412", fontSize: 11, marginTop: 2 }}>
              Main balance is under {formatINR(LOW_FLOAT_THRESHOLD)}. Top up before large funding.
            </Text>
          </View>
        ) : null}

        {isDist && inactiveMonth > 0 ? (
          <Pressable
            onPress={shareInactiveWhatsApp}
            style={[styles.banner, { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" }]}
          >
            <Text style={{ color: "#166534", fontWeight: "800", fontSize: 13 }}>
              WhatsApp nudge · {inactiveMonth} inactive retailer{inactiveMonth === 1 ? "" : "s"}
            </Text>
            <Text style={{ color: "#15803D", fontSize: 11, marginTop: 2 }}>
              Share login reminder with English template
            </Text>
          </Pressable>
        ) : null}

        {recent.length > 0 ? (
          <View style={[styles.card, cardStyle]}>
            <View style={styles.recentHead}>
              <Zap size={14} color="#D97706" strokeWidth={2.4} />
              <Text style={[styles.recentTitle, { color: tokens.txt }]}>RECENT TRANSFERS</Text>
            </View>
            {recent.map((e, i) => {
              const party = e.referenceId ? byId.get(e.referenceId) : undefined;
              return (
                <View
                  key={e.id}
                  style={[
                    styles.recentRow,
                    i < recent.length - 1 && { borderBottomWidth: 1, borderBottomColor: tokens.cardBorder },
                  ]}
                >
                  <View style={styles.recentIcon}>
                    <ArrowRight size={16} color={colors.greenDark} strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.recentName, { color: tokens.txt }]} numberOfLines={2}>
                      {party?.name ?? e.description ?? "Partner"}
                    </Text>
                    {party ? <Text style={[styles.recentSub, { color: tokens.sub }]}>{party.mobile}</Text> : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.recentAmt}>+ {formatINR(e.amount)}</Text>
                    <Text style={[styles.recentSub, { color: tokens.sub }]}>
                      {new Date(e.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.card, cardStyle]}>
          <View style={styles.toolbar}>
            <Text style={[styles.sectionTitle, { color: tokens.txt }]}>
              My {childPlural} ({downline.length})
            </Text>
            {isSd ? (
              <Pressable
                onPress={() => {
                  setBulkMode((v) => {
                    if (v) setBulkSelected(new Set());
                    return !v;
                  });
                }}
              >
                <Text style={{ color: colors.blueFlat, fontWeight: "800", fontSize: 12 }}>
                  {bulkMode ? "Cancel bulk" : "Bulk fund"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {bulkMode && isSd ? (
            <Pressable
              disabled={bulkTargets.length === 0}
              onPress={() => setShowBulkFund(true)}
              style={{
                marginBottom: 12,
                borderRadius: 12,
                backgroundColor: bulkTargets.length ? colors.blueFlat : "#CBD5E1",
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                Transfer to {bulkTargets.length} selected
              </Text>
            </Pressable>
          ) : null}

          <View style={[styles.searchBox, { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg }]}>
            <Search size={18} color={colors.blueFlat} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name or mobile."
              placeholderTextColor={tokens.mute}
              style={[styles.searchInput, { color: tokens.txt }]}
            />
          </View>

          {loading ? (
            <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 24 }} />
          ) : filtered.length === 0 ? (
            <Text style={styles.empty}>
              {downline.length === 0 ? "No agents yet. Use Invite on the Home screen to add one." : "No agent matches this search."}
            </Text>
          ) : (
            filtered.map((u, i) => (
              <View key={u.id}>
                {bulkMode && isSd ? (
                  <Pressable
                    onPress={() => u.isActive && toggleBulk(u.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 10,
                      opacity: u.isActive ? 1 : 0.5,
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        borderWidth: 2,
                        borderColor: colors.blueFlat,
                        backgroundColor: bulkSelected.has(u.id) ? colors.blueFlat : "transparent",
                      }}
                    />
                    <Text style={{ color: colors.blueFlat, fontWeight: "700", fontSize: 12 }}>Select</Text>
                  </Pressable>
                ) : null}
                <DownlineCard
                  user={u}
                  onWalletAction={(target, kind) => setFundTarget({ user: target, initialKind: kind })}
                  onToggleActive={(target) => void toggleActive(target)}
                  toggling={togglingId === u.id}
                  last={i === filtered.length - 1}
                />
              </View>
            ))
          )}
        </View>

        {childRole ? (
          <InviteList
            invites={invites}
            busyId={inviteBusy}
            onResend={(inv) => void resendInvite(inv)}
            onRevoke={(inv) => void revokeInvite(inv)}
          />
        ) : null}
      </ScrollView>

      {childRole && (
        <InviteModal
          visible={showOnboard}
          label={ROLE_LABEL[childRole]}
          result={inviteResult}
          onResult={(r) => {
            setInviteResult(r);
            void loadInvites();
          }}
          onClose={() => {
            setShowOnboard(false);
            setInviteResult(null);
          }}
        />
      )}

      {fundTarget && (
        <WalletModal
          visible={!!fundTarget}
          target={fundTarget.user}
          initialKind={fundTarget.initialKind}
          allowReverse={Number(fundTarget.user.mainBalance) > 0 && fundTarget.user.isActive}
          onClose={() => setFundTarget(null)}
          onSuccess={() => void load(true)}
        />
      )}

      {showBulkFund ? (
        <BulkFundModal
          visible={showBulkFund}
          targets={bulkTargets}
          onClose={() => setShowBulkFund(false)}
          onSuccess={() => {
            setBulkMode(false);
            setBulkSelected(new Set());
            void load(true);
          }}
        />
      ) : null}
    </SafeAreaView>
    </PageEnter>
  );
}

export interface Invite {
  id: string;
  role: string;
  name: string;
  mobile: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
}

export interface InviteResult {
  invite: Invite;
  link: string;
  emailSent: boolean;
}

const INVITE_STATUS: Record<Invite["status"], { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#1D4ED8", bg: "#EFF6FF" },
  accepted: { label: "Joined", color: "#047857", bg: "#ECFDF5" },
  revoked: { label: "Cancelled", color: "#64748B", bg: "#F1F5F9" },
  expired: { label: "Expired", color: "#B91C1C", bg: "#FEF2F2" },
};

function apiMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}

function shareInviteWhatsApp(link: string, name: string, roleLabel: string) {
  const text = `Hi ${name}, create your AsanPay ${roleLabel} account using this link: ${link}`;
  void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
}

function InviteLinkView({ result, roleLabel }: { result: InviteResult; roleLabel: string }) {
  return (
    <View>
      <Text style={styles.help}>
        {result.emailSent
          ? `Signup link emailed to ${result.invite.email}. You can also share it on WhatsApp.`
          : "The email could not be sent. Share this link with them on WhatsApp instead."}
      </Text>
      <Text selectable style={styles.linkBox}>
        {result.link}
      </Text>
      <Text style={styles.help}>Works once, only with mobile {result.invite.mobile}. Expires in 7 days.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          style={[styles.secondaryBtn, { flex: 1 }]}
          onPress={() => {
            Clipboard.setString(result.link);
            showAlert("Copied", "Invite link copied");
          }}
        >
          <Text style={styles.secondaryBtnText}>Copy link</Text>
        </Pressable>
        <Pressable
          style={[styles.greenBtn, { flex: 1 }]}
          onPress={() => shareInviteWhatsApp(result.link, result.invite.name, roleLabel)}
        >
          <Text style={styles.submitText}>WhatsApp</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function InviteModal({
  visible,
  label,
  result,
  onResult,
  onClose,
}: {
  visible: boolean;
  label: string;
  result: InviteResult | null;
  onResult: (r: InviteResult) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  function close() {
    setName("");
    setMobile("");
    setEmail("");
    onClose();
  }

  async function submit() {
    if (name.trim().length < 2) return showAlert("Check the form", "Enter the full name");
    if (!/^[6-9]\d{9}$/.test(mobile)) return showAlert("Check the form", "Enter a valid 10-digit mobile");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return showAlert("Check the form", "Enter a valid email address");
    }
    setLoading(true);
    try {
      const { data } = await api.post<{ success: boolean; message: string; data: InviteResult }>("/invites", {
        name,
        mobile,
        email,
      });
      onResult(data.data);
    } catch (err) {
      showAlert("Invite not sent", apiMsg(err, "Could not create the invite"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalSheet
      visible={visible}
      title={result ? "Invite link ready" : `Invite ${label}`}
      icon={<UserPlus />}
      iconTone={result ? "green" : "blue"}
      onClose={close}
    >
      {result ? (
        <InviteLinkView result={result} roleLabel={label} />
      ) : (
        <>
          <Text style={styles.help}>
            They get a signup link by email. The account joins your network automatically.
          </Text>
          <Field label="Full name *" value={name} onChangeText={setName} />
          <Field
            label="Mobile *"
            value={mobile}
            onChangeText={(t) => setMobile(t.replace(/\D/g, "").slice(0, 10))}
            keyboardType="phone-pad"
            maxLength={10}
          />
          <Field label="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Pressable style={[styles.dangerBtn, { flex: 1 }]} onPress={close}>
              <Text style={styles.submitText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.blueBtn, { flex: 1, opacity: loading ? 0.7 : 1 }]} onPress={submit} disabled={loading}>
              <Text style={styles.submitText}>{loading ? "Sending…" : "Send invite"}</Text>
            </Pressable>
          </View>
        </>
      )}
    </ModalSheet>
  );
}

function InviteList({
  invites,
  busyId,
  onResend,
  onRevoke,
}: {
  invites: Invite[];
  busyId: string | null;
  onResend: (inv: Invite) => void;
  onRevoke: (inv: Invite) => void;
}) {
  if (invites.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Invites</Text>
      {invites.map((inv) => {
        const st = INVITE_STATUS[inv.status];
        return (
          <View key={inv.id} style={styles.inviteRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.inviteName} numberOfLines={1}>
                {inv.name}
              </Text>
              <Text style={styles.inviteSub} numberOfLines={1}>
                {inv.mobile} · {inv.email}
              </Text>
            </View>
            <View style={[styles.inviteBadge, { backgroundColor: st.bg }]}>
              <Text style={{ color: st.color, fontSize: 11, fontWeight: "800" }}>{st.label}</Text>
            </View>
            {inv.status !== "accepted" ? (
              <Pressable disabled={busyId === inv.id} onPress={() => onResend(inv)} style={styles.inviteAction}>
                <Text style={{ color: colors.green, fontWeight: "800", fontSize: 12 }}>Resend</Text>
              </Pressable>
            ) : null}
            {inv.status === "pending" ? (
              <Pressable disabled={busyId === inv.id} onPress={() => onRevoke(inv)} style={styles.inviteAction}>
                <Text style={{ color: colors.danger, fontWeight: "800", fontSize: 12 }}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function WalletModal({
  visible,
  target,
  initialKind = "transfer",
  allowReverse,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  target: DownlineUser;
  initialKind?: WalletActionKind;
  allowReverse: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const startKind: WalletActionKind =
    initialKind === "reverse" && allowReverse ? "reverse" : "transfer";
  const [kind, setKind] = useState<WalletActionKind>(startKind);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [loading, setLoading] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder(`wallet-${target.id}`));
  const isReverse = kind === "reverse";

  useEffect(() => {
    if (!visible) return;
    setKind(initialKind === "reverse" && allowReverse ? "reverse" : "transfer");
    setStep("form");
    setAmount("");
    setNote("");
    setTxnPin("");
    attemptKey.current.clear();
  }, [visible, initialKind, allowReverse, target.id]);

  function close() {
    setStep("form");
    setTxnPin("");
    setKind("transfer");
    onClose();
  }

  function setMode(next: "transfer" | "reverse") {
    if (next === "reverse" && !allowReverse) return;
    setKind(next);
    setStep("form");
    setTxnPin("");
    attemptKey.current.clear();
  }

  function review() {
    if (!amount || !(parseFloat(amount) > 0)) {
      showAlert("Invalid amount", "Enter an amount greater than ₹0.");
      return;
    }
    if (isReverse && parseFloat(amount) > Number(target.mainBalance)) {
      showAlert("Amount too high", "Amount is higher than their main wallet balance.");
      return;
    }
    setTxnPin("");
    setStep("confirm");
  }

  async function submit() {
    if (loading) return;
    if (txnPin.length !== 4) {
      showAlert("Invalid PIN", "Enter your 4-digit transaction PIN.");
      return;
    }
    setLoading(true);
    try {
      if (isReverse) {
        await api.post("/wallet/pull/confirm", {
          targetUserId: target.id,
          walletType: "main",
          amount,
          txnPin,
          idempotencyKey: attemptKey.current.get(),
          ...(note ? { description: note } : {}),
        });
        attemptKey.current.clear();
        showAlert("Success", `₹${amount} reversed from ${target.name}`);
      } else {
        await api.post("/wallet/transfer", {
          targetUserId: target.id,
          walletType: "main",
          amount,
          txnPin,
          idempotencyKey: attemptKey.current.get(),
          ...(note ? { description: note } : {}),
        });
        attemptKey.current.clear();
        showAlert("Success", `₹${amount} sent to ${target.name}`);
      }
      onSuccess();
      close();
      setAmount("");
      setNote("");
    } catch (err) {
      setTxnPin("");
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        (isReverse ? "Reverse failed" : "Transfer failed");
      showAlert(isReverse ? "Reverse failed" : "Transfer failed", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalSheet
      visible={visible}
      title={
        step === "confirm"
          ? isReverse
            ? "Confirm reverse"
            : "Confirm transfer"
          : `${isReverse ? "Reverse" : "Transfer"} — ${target.name}`
      }
      subtitle={step === "confirm" ? "Check the details before you confirm." : undefined}
      icon={isReverse ? <Undo2 /> : <Send />}
      iconTone={isReverse ? "amber" : "blue"}
      onClose={close}
    >
      {step === "form" ? (
        <>
          <View style={styles.kindRow}>
            <Pressable
              onPress={() => setMode("transfer")}
              style={[styles.kindBtn, kind === "transfer" && styles.kindBtnOn]}
            >
              <Text style={[styles.kindText, kind === "transfer" && styles.kindTextOn]}>Transfer</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("reverse")}
              disabled={!allowReverse}
              style={[styles.kindBtn, kind === "reverse" && styles.kindBtnOn, !allowReverse && { opacity: 0.4 }]}
            >
              <Text style={[styles.kindText, kind === "reverse" && styles.kindTextOn]}>Reverse</Text>
            </Pressable>
          </View>
          {isReverse ? (
            <Text style={styles.help}>Available on their wallet: {formatINR(target.mainBalance)}</Text>
          ) : null}
          <Field
            label="Amount (₹)"
            value={amount}
            onChangeText={(t) => {
              setAmount(t.replace(/[^\d.]/g, ""));
              attemptKey.current.clear();
            }}
            keyboardType="decimal-pad"
          />
          <Field label="Note (optional)" value={note} onChangeText={setNote} />
          <Pressable onPress={review}>
            <LinearGradient colors={[...colors.gradient]} style={styles.submit}>
              <Text style={styles.submitText}>Continue</Text>
            </LinearGradient>
          </Pressable>
        </>
      ) : (
        <TransferConfirm
          amount={amount}
          amountCaption={isReverse ? "You are reversing" : "You are sending"}
          recipient={{
            name: target.name,
            subtitle: `${ROLE_LABEL[target.role] ?? target.role} · ${target.uid}`,
          }}
          rows={[
            { label: "Mobile", value: target.mobile },
            { label: "Their balance now", value: formatINR(target.mainBalance) },
            {
              label: isReverse ? "To" : "From",
              value: isReverse ? "Your main wallet" : "Main wallet",
            },
            ...(note ? [{ label: "Note", value: note }] : []),
          ]}
          pin={txnPin}
          onPin={setTxnPin}
          pinHint={
            isReverse
              ? "Enter your 4-digit PIN to authorise this reverse"
              : "Enter your 4-digit PIN to authorise this transfer"
          }
          confirmLabel={isReverse ? "Confirm & Reverse" : "Confirm & Send"}
          loading={loading}
          onBack={() => setStep("form")}
          onConfirm={() => void submit()}
        />
      )}
    </ModalSheet>
  );
}

function TransferConfirm({
  amount,
  amountCaption = "You are sending",
  recipient,
  rows,
  pin,
  onPin,
  pinHint = "Enter your 4-digit PIN to authorise this transfer",
  confirmLabel = "Confirm & Send",
  loading,
  onBack,
  onConfirm,
}: {
  amount: string;
  amountCaption?: string;
  recipient?: { name: string; subtitle: string };
  rows: { label: string; value: string }[];
  pin: string;
  onPin: (v: string) => void;
  pinHint?: string;
  confirmLabel?: string;
  loading: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <View style={styles.confirmAmountBox}>
        <Text style={styles.confirmCaption}>{amountCaption}</Text>
        <Text style={styles.confirmAmount}>{formatINR(amount)}</Text>
      </View>
      {recipient ? (
        <View style={styles.confirmRecipient}>
          <View style={styles.confirmAvatar}>
            <Text style={styles.confirmAvatarText}>
              {recipient.name
                .split(/\s+/)
                .map((p) => p[0] ?? "")
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.confirmRecipientName} numberOfLines={1}>{recipient.name}</Text>
            <Text style={styles.confirmRecipientSub} numberOfLines={1}>{recipient.subtitle}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.confirmRows}>
        {rows.map((r, i) => (
          <View
            key={r.label}
            style={[
              styles.confirmRow,
              i === 0 ? null : styles.confirmRowDivider,
              i % 2 === 1 ? { backgroundColor: "#F8FAFC" } : null,
            ]}
          >
            <Text style={styles.confirmLabel}>{r.label}</Text>
            <Text style={styles.confirmValue} numberOfLines={2}>{r.value}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.confirmPinLabel}>{pinHint}</Text>
      <PinInput value={pin} onChange={onPin} />
      <View style={styles.confirmActions}>
        <Pressable onPress={onBack} disabled={loading} style={[styles.confirmBtn, { backgroundColor: colors.danger }]}>
          <Text style={styles.submitText}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          disabled={loading || pin.length !== 4}
          style={[styles.confirmBtn, { backgroundColor: colors.blue, opacity: pin.length === 4 ? 1 : 0.5 }]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{confirmLabel}</Text>}
        </Pressable>
      </View>
    </>
  );
}

function BulkFundModal({
  visible,
  targets,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  targets: DownlineUser[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [amount, setAmount] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [loading, setLoading] = useState(false);
  const batchRef = useRef(newIdempotencyKey("bulk"));

  function close() {
    setStep("form");
    setTxnPin("");
    onClose();
  }

  function review() {
    if (targets.length === 0) {
      showAlert("Select partners", "Select at least one active distributor.");
      return;
    }
    if (!amount || !(parseFloat(amount) > 0)) {
      showAlert("Invalid amount", "Enter an amount greater than ₹0.");
      return;
    }
    setTxnPin("");
    setStep("confirm");
  }

  async function submit() {
    if (loading) return;
    if (txnPin.length !== 4) {
      showAlert("Invalid PIN", "Enter your 4-digit transaction PIN.");
      return;
    }
    setLoading(true);
    const batch = batchRef.current;
    let ok = 0;
    let failed = 0;
    let lastError = "Transfer failed. Check your balance and partner status.";
    try {
      for (const target of targets) {
        try {
          await api.post("/wallet/transfer", {
            targetUserId: target.id,
            walletType: "main",
            amount,
            txnPin,
            idempotencyKey: `${batch}-${target.id}`.slice(0, 100),
            description: "Bulk transfer",
          });
          ok += 1;
        } catch (err) {
          failed += 1;
          lastError =
            (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? lastError;
          if (ok === 0 && /PIN/i.test(lastError)) break;
        }
      }
      if (ok > 0 && failed === 0) {
        showAlert("Success", `Sent ₹${amount} to ${ok} partner${ok === 1 ? "" : "s"}`);
        onSuccess();
        close();
      } else if (ok > 0) {
        showAlert("Partial", `Transferred to ${ok}; failed for ${failed}. Last error: ${lastError}`);
        onSuccess();
        close();
      } else {
        setTxnPin("");
        showAlert("Transfer failed", lastError);
      }
    } finally {
      setLoading(false);
      batchRef.current = newIdempotencyKey("bulk");
    }
  }

  const total = (parseFloat(amount || "0") * targets.length).toFixed(2);
  const names = targets.map((t) => t.name).join(", ");

  return (
    <ModalSheet
      visible={visible}
      title={step === "confirm" ? "Confirm bulk transfer" : `Bulk transfer (${targets.length})`}
      subtitle={step === "confirm" ? "Check the details before you confirm." : undefined}
      icon={<Send />}
      onClose={close}
    >
      {step === "form" ? (
        <>
          <Text style={{ color: "#64748B", fontSize: 12, marginBottom: 10 }}>
            Same amount to each selected partner
          </Text>
          <Field
            label="Amount each (₹)"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ""))}
            keyboardType="decimal-pad"
          />
          <Pressable onPress={review}>
            <LinearGradient colors={[...colors.gradient]} style={styles.submit}>
              <Text style={styles.submitText}>Continue</Text>
            </LinearGradient>
          </Pressable>
        </>
      ) : (
        <TransferConfirm
          amount={total}
          amountCaption="Total to transfer"
          rows={[
            { label: "Each", value: formatINR(amount) },
            { label: "Partners", value: String(targets.length) },
            { label: "To", value: names },
            { label: "From", value: "Main wallet" },
          ]}
          pin={txnPin}
          onPin={setTxnPin}
          loading={loading}
          onBack={() => setStep("form")}
          onConfirm={() => void submit()}
        />
      )}
    </ModalSheet>
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
  keyboardType?: "default" | "phone-pad" | "decimal-pad" | "email-address";
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <LabelText label={label} style={styles.fieldLabel} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : undefined}
        maxLength={maxLength}
        placeholderTextColor={colors.textLight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 14, paddingBottom: 32, gap: 14 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  meCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  meAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EA580C",
    alignItems: "center",
    justifyContent: "center",
  },
  meAvatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  meName: { fontSize: 18, fontWeight: "800" },
  meBal: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: colors.greenBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  meBalText: { color: colors.greenDark, fontSize: 13.5, fontWeight: "800" },
  historyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.blueFlat,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  historyText: { color: colors.blueFlat, fontWeight: "800", fontSize: 13 },
  banner: { borderRadius: 14, borderWidth: 1, padding: 12 },
  recentHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  recentTitle: { fontSize: 12.5, fontWeight: "800", letterSpacing: 0.4 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  recentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.greenBg,
    alignItems: "center",
    justifyContent: "center",
  },
  recentName: { fontSize: 14, fontWeight: "800" },
  recentSub: { fontSize: 11.5, marginTop: 2 },
  recentAmt: { color: colors.greenDark, fontSize: 14, fontWeight: "800" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", flex: 1 },
  addBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
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
  help: { fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 17 },
  kindRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  kindBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  kindBtnOn: { borderColor: colors.blueFlat, backgroundColor: "#EFF6FF" },
  kindText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  kindTextOn: { color: colors.blueFlat },
  confirmAmountBox: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.greenBg,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    marginBottom: 12,
  },
  confirmCaption: { fontSize: 11, color: colors.greenDark, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  confirmAmount: { fontSize: 30, fontWeight: "900", color: colors.greenDark, marginTop: 2 },
  confirmRecipient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  confirmAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blueFlat,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmAvatarText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  confirmRecipientName: { fontSize: 15, fontWeight: "800", color: colors.text },
  confirmRecipientSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  confirmRows: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 14,
  },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  confirmRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  confirmLabel: { fontSize: 13, color: colors.textMuted },
  confirmValue: { flex: 1, textAlign: "right", fontSize: 13, color: colors.text, fontWeight: "700" },
  confirmPinLabel: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginBottom: 10 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  confirmBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  linkBox: {
    fontSize: 12,
    color: colors.blueFlat,
    backgroundColor: "#EEF2FF",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  secondaryBtnText: { color: colors.blueFlat, fontWeight: "700", fontSize: 15 },
  greenBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.green },
  blueBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.blue },
  dangerBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.danger },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  inviteName: { fontSize: 14, fontWeight: "700", color: colors.text },
  inviteSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  inviteBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  inviteAction: { paddingHorizontal: 4, paddingVertical: 4 },
});
