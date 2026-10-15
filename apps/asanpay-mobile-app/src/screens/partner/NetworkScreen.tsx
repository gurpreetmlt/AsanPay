import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { Bell, Scan } from "lucide-react-native";
import { DownlineCard } from "../../components/DownlineCard";
import { ModalSheet } from "../../components/ModalSheet";
import { ScreenHeader } from "../../components/ScreenHeader";
import { WalletBar } from "../../components/WalletBar";
import { PageEnter } from "../../components/PageEnter";
import { api, fetchApi } from "../../lib/api";
import { createAttemptKeyHolder, newIdempotencyKey } from "../../lib/idempotencyKey";
import { CHILD_ROLE, ROLE_LABEL } from "../../lib/roles";
import { formatINR } from "../../lib/format";
import type { DownlineUser, WalletBalance } from "../../lib/types";
import { useAuthStore } from "../../store/auth";
import { useTxnPin } from "../../hooks/useTxnPin";
import { colors } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import Clipboard from "@react-native-clipboard/clipboard";

const LOW_FLOAT_THRESHOLD = 10000;

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
  const [pullTarget, setPullTarget] = useState<DownlineUser | null>(null);
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
      const [wal, down, dash] = await Promise.all([
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<DownlineUser[]>("/users/downline"),
        fetchApi<{ retailers?: { inactive?: number } }>("/dashboard/stats").catch(() => null),
      ]);
      setWallets(wal);
      setDownline(down);
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
    void loadInvites();
  }, [load, loadInvites]);

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

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <PageEnter>
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader
        variant="profile"
        avatarLetter={initials || user.name.charAt(0).toUpperCase()}
        eyebrow={greetingName(user.name)}
        title={user.name}
        subtitle={`${ROLE_LABEL[user.role]} · ${user.uid}${
          user.kycStatus === "verified"
            ? " · Verified"
            : user.kycStatus === "rejected"
              ? " · KYC Rejected"
              : user.hasKycDocs
                ? " · Under Review"
                : " · KYC Pending"
        }`}
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
        <WalletBar wallets={wallets} single />
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

      {lowFloat ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#FDBA74",
            backgroundColor: "#FFF7ED",
            padding: 12,
          }}
        >
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
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#86EFAC",
            backgroundColor: "#F0FDF4",
            padding: 12,
          }}
        >
          <Text style={{ color: "#166534", fontWeight: "800", fontSize: 13 }}>
            WhatsApp nudge · {inactiveMonth} inactive retailer{inactiveMonth === 1 ? "" : "s"}
          </Text>
          <Text style={{ color: "#15803D", fontSize: 11, marginTop: 2 }}>
            Share login reminder with English template
          </Text>
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
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
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
            {childRole && (
              <Pressable onPress={() => setShowOnboard(true)}>
                <View style={[styles.addBtn, { backgroundColor: colors.green }]}>
                  <Text style={styles.addBtnText}>+ Invite {ROLE_LABEL[childRole]}</Text>
                </View>
              </Pressable>
            )}
          </View>
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

        {childRole ? (
          <InviteList
            invites={invites}
            busyId={inviteBusy}
            onResend={(inv) => void resendInvite(inv)}
            onRevoke={(inv) => void revokeInvite(inv)}
          />
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 24 }} />
        ) : downline.length === 0 ? (
          <Text style={styles.empty}>No downline yet. Tap Invite to add.</Text>
        ) : (
          downline.map((u) => (
            <View key={u.id}>
              {bulkMode && isSd ? (
                <Pressable
                  onPress={() => u.isActive && toggleBulk(u.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
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
                onFund={setFundTarget}
                onReverse={setPullTarget}
                onToggleActive={(target) => void toggleActive(target)}
                toggling={togglingId === u.id}
              />
            </View>
          ))
        )}
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
        <FundModal
          visible={!!fundTarget}
          target={fundTarget}
          onClose={() => setFundTarget(null)}
          onSuccess={() => void load(true)}
        />
      )}

      {pullTarget && (
        <PullModal
          visible={!!pullTarget}
          target={pullTarget}
          onClose={() => setPullTarget(null)}
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

interface Invite {
  id: string;
  role: string;
  name: string;
  mobile: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
}

interface InviteResult {
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

function InviteModal({
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
    <ModalSheet visible={visible} title={result ? "Invite link ready" : `Invite ${label}`} onClose={close}>
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
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const { promptPin, TxnPinPrompt } = useTxnPin();
  const batchRef = useRef(newIdempotencyKey("bulk"));

  async function submit() {
    if (loading) return;
    if (targets.length === 0) {
      showAlert("Select partners", "Select at least one active distributor.");
      return;
    }
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
    const batch = batchRef.current;
    let ok = 0;
    let failed = 0;
    try {
      for (const target of targets) {
        try {
          await api.post("/wallet/transfer", {
            targetUserId: target.id,
            walletType: "main",
            amount,
            txnAuth,
            idempotencyKey: `${batch}-${target.id}`.slice(0, 100),
            description: "Bulk transfer",
          });
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok > 0 && failed === 0) {
        showAlert("Success", `Sent ₹${amount} to ${ok} partner${ok === 1 ? "" : "s"}`);
        onSuccess();
        onClose();
      } else if (ok > 0) {
        showAlert("Partial", `Transferred to ${ok}; failed for ${failed}.`);
        onSuccess();
      } else {
        showAlert("Error", "All transfers failed. Check PIN, balance, and partner status.");
      }
    } finally {
      setLoading(false);
      batchRef.current = newIdempotencyKey("bulk");
    }
  }

  return (
    <>
      <ModalSheet visible={visible} title={`Bulk transfer (${targets.length})`} onClose={onClose}>
        <Text style={{ color: "#64748B", fontSize: 12, marginBottom: 10 }}>
          Same amount to each selected partner
        </Text>
        <Field
          label="Amount each (₹)"
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ""))}
          keyboardType="decimal-pad"
        />
        <Pressable onPress={submit} disabled={loading}>
          <LinearGradient colors={[...colors.gradient]} style={styles.submit}>
            <Text style={styles.submitText}>{loading ? "Sending..." : "Confirm bulk transfer"}</Text>
          </LinearGradient>
        </Pressable>
      </ModalSheet>
      <TxnPinPrompt />
    </>
  );
}

function PullModal({
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
  const [step, setStep] = useState<"amount" | "otp">("amount");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [otp, setOtp] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [maskedMobile, setMaskedMobile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder(`pull-${target.id}`));

  async function requestOtp() {
    if (loading) return;
    if (!amount || parseFloat(amount) <= 0) {
      showAlert("Invalid amount", "Enter a valid amount.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<{
        success: boolean;
        message: string;
        data: { message: string; otp?: string; maskedMobile?: string; expiresInSeconds: number };
      }>("/wallet/pull/request", {
        targetUserId: target.id,
        walletType: "main",
        amount,
      });
      if (!data.success) throw new Error(data.message);
      setDevOtp(data.data.otp ?? null);
      setMaskedMobile(data.data.maskedMobile ?? null);
      setStep("otp");
      showAlert(
        "OTP sent",
        data.data.otp ? `Dev OTP: ${data.data.otp}` : data.data.message || "OTP sent to partner phone",
      );
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Could not send OTP";
      showAlert("Error", msg);
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (loading) return;
    if (otp.length !== 6) {
      showAlert("Invalid OTP", "Enter the 6-digit OTP from the partner phone");
      return;
    }
    if (txnPin.length !== 4) {
      showAlert("Invalid PIN", "Enter your 4-digit transaction PIN");
      return;
    }
    setLoading(true);
    try {
      await api.post("/wallet/pull/confirm", {
        targetUserId: target.id,
        walletType: "main",
        amount,
        otp,
        txnPin,
        idempotencyKey: attemptKey.current.get(),
        ...(note ? { description: note } : {}),
      });
      attemptKey.current.clear();
      showAlert("Success", `₹${amount} reversed from ${target.name}`);
      onSuccess();
      onClose();
      setStep("amount");
      setAmount("");
      setNote("");
      setOtp("");
      setTxnPin("");
      setDevOtp(null);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Reverse failed";
      showAlert("Error", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalSheet visible={visible} title={`Reverse · ${target.name}`} onClose={onClose}>
      {step === "amount" ? (
        <>
          <Text style={styles.help}>
            OTP goes to {target.name}&apos;s phone ({target.mobile}). You enter that OTP + your txn PIN.
          </Text>
          <Text style={styles.help}>Available: {formatINR(target.mainBalance)}</Text>
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
          <Pressable onPress={() => void requestOtp()} disabled={loading}>
            <LinearGradient colors={[...colors.gradient]} style={styles.submit}>
              <Text style={styles.submitText}>{loading ? "Sending OTP…" : "Send OTP to partner"}</Text>
            </LinearGradient>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.help}>
            Reversing ₹{amount} from {target.name}
            {maskedMobile ? ` · OTP sent to ${maskedMobile}` : ""}
          </Text>
          {devOtp ? <Text style={styles.devOtp}>Dev OTP: {devOtp}</Text> : null}
          <Field
            label="6-digit OTP"
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="phone-pad"
            maxLength={6}
          />
          <Field
            label="Your transaction PIN"
            value={txnPin}
            onChangeText={(t) => setTxnPin(t.replace(/\D/g, "").slice(0, 4))}
            keyboardType="phone-pad"
            maxLength={4}
            secureTextEntry
          />
          <Pressable onPress={() => void confirm()} disabled={loading}>
            <LinearGradient colors={[...colors.gradient]} style={styles.submit}>
              <Text style={styles.submitText}>{loading ? "Reversing…" : "Confirm reverse"}</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={() => {
              setStep("amount");
              setOtp("");
              setTxnPin("");
              setDevOtp(null);
              attemptKey.current.clear();
            }}
            style={styles.changeAmount}
          >
            <Text style={styles.changeAmountText}>Change amount</Text>
          </Pressable>
        </>
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
      <Text style={styles.fieldLabel}>{label}</Text>
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
  help: { fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 17 },
  devOtp: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.green,
    backgroundColor: colors.greenBg,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
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
  changeAmount: { marginTop: 12, alignItems: "center" },
  changeAmountText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
});
