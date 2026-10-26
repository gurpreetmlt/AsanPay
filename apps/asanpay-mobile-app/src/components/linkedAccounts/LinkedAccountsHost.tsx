import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ChevronLeft, Link2, Lock, Plus, Settings2, ShieldCheck, Users } from "lucide-react-native";
import { ROLE_LABELS, type LinkedAccountSummary, type LinkedAccountsResponse } from "@asanpay/shared-types";
import { ModalSheet } from "../ModalSheet";
import { showAlert } from "../AppAlert";
import { apiError } from "../../utils/apiError";
import { fetchLinkedAccounts, unlinkAccount } from "../../lib/linkedAccounts";
import { useAuthStore } from "../../store/auth";
import { colors } from "../../theme/colors";
import { AccountAvatar, InlineError, LaButton, RoleChip, laStyles } from "./parts";
import { SwitchFlow } from "./SwitchFlow";
import { LinkAccountSheet } from "./LinkAccountSheet";

export type LinkedAccountsView = "menu" | "manage";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function SwitchPill({ account, onPress }: { account: LinkedAccountSummary; onPress: () => void }) {
  const locked = Boolean(account.switchLockedUntil);
  const blocked = account.status !== "active" || locked;
  return (
    <Pressable onPress={onPress} disabled={blocked} style={[styles.switchPill, blocked && laStyles.disabled]} accessibilityRole="button">
      {locked ? <Lock size={12} color="#fff" /> : null}
      <Text style={styles.switchPillText}>Switch</Text>
    </Pressable>
  );
}

function statusLine(a: LinkedAccountSummary): { text: string; warn: boolean } {
  if (a.status !== "active") return { text: "Needs review", warn: true };
  if (a.switchLockedUntil) return { text: "Switch locked for now", warn: true };
  return { text: a.mobileMasked, warn: false };
}

/**
 * Avatar menu (bottom sheet) + Linked accounts manage screen. One host keeps a single RN Modal
 * on screen at a time (stacked modals misbehave on Android).
 */
export function LinkedAccountsHost({ view, onClose }: { view: LinkedAccountsView | null; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [current, setCurrent] = useState<LinkedAccountsView | null>(null);
  const [data, setData] = useState<LinkedAccountsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchTarget, setSwitchTarget] = useState<LinkedAccountSummary | null>(null);
  const [linking, setLinking] = useState(false);
  const [returnTo, setReturnTo] = useState<LinkedAccountsView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchLinkedAccounts());
    } catch (err) {
      setError(apiError(err, "Could not load linked accounts"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCurrent(view);
    if (view) void load();
  }, [view, load]);

  if (!user) return null;

  const accounts = data?.accounts ?? [];
  const others = accounts.filter((a) => !a.isCurrent);
  const canLinkMore = data ? accounts.length < data.maxLinked : false;
  const me = accounts.find((a) => a.isCurrent);
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const currentFace = { name: user.name, role: user.role, roleLabel, uid: user.uid, mobileMasked: me?.mobileMasked };

  function closeAll() {
    setCurrent(null);
    setSwitchTarget(null);
    setLinking(false);
    onClose();
  }

  function openSwitch(target: LinkedAccountSummary) {
    setReturnTo(current);
    setCurrent(null);
    setSwitchTarget(target);
  }

  function openLink() {
    setReturnTo(current);
    setCurrent(null);
    setLinking(true);
  }

  function back() {
    if (returnTo) setCurrent(returnTo);
    else closeAll();
  }

  function confirmUnlink(target: LinkedAccountSummary) {
    const other = target.isCurrent ? others[0] : target;
    showAlert(
      other ? `Unlink ${other.roleLabel} account?` : "Unlink account?",
      "You will need OTP and MPIN to link it again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: () => {
            unlinkAccount(target.userId)
              .then((res) => {
                setData(res);
                showAlert("Account unlinked", "You can link it again any time.");
              })
              .catch((err) => showAlert("Could not unlink", apiError(err, "Could not unlink the account")));
          },
        },
      ],
    );
  }

  const listBody = loading && !data ? (
    <ActivityIndicator color={colors.blue} style={{ marginVertical: 24 }} />
  ) : error ? (
    <View style={{ alignItems: "center", paddingVertical: 16 }}>
      <InlineError message={error} />
      <Pressable onPress={() => void load()} style={{ marginTop: 10 }} hitSlop={8}>
        <Text style={styles.link}>Try again</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <>
      <ModalSheet
        visible={current === "menu"}
        title="Your accounts"
        subtitle="Switch without logging out."
        icon={<Users />}
        onClose={closeAll}
      >
        <View style={styles.menuRow}>
          <AccountAvatar name={user.name} role={user.role} size={42} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={laStyles.name} numberOfLines={1}>
              {user.name}
            </Text>
            <RoleChip role={user.role} roleLabel={roleLabel} uid={user.uid} />
          </View>
          <View style={styles.checkDot} accessibilityLabel="Current account">
            <Check size={14} color={colors.greenPayEnd} />
          </View>
        </View>
        {listBody}
        {others.map((a) => {
          const line = statusLine(a);
          return (
            <View key={a.userId} style={[styles.menuRow, styles.rowBorder]}>
              <AccountAvatar name={a.name} role={a.role} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={laStyles.name} numberOfLines={1}>
                  {a.name}
                </Text>
                <RoleChip role={a.role} roleLabel={a.roleLabel} uid={a.uid} />
                <Text style={[styles.meta, line.warn && styles.warn]}>{line.text}</Text>
              </View>
              <SwitchPill account={a} onPress={() => openSwitch(a)} />
            </View>
          );
        })}
        <View style={[styles.rowBorder, { paddingTop: 6 }]}>
          {canLinkMore ? (
            <Pressable style={styles.action} onPress={openLink}>
              <Plus size={18} color={colors.greenDark} />
              <Text style={[styles.actionText, { color: colors.greenDark }]}>Link another account</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.action} onPress={() => setCurrent("manage")}>
            <Settings2 size={18} color={colors.blue} />
            <Text style={styles.actionText}>Manage linked accounts</Text>
          </Pressable>
        </View>
      </ModalSheet>

      <Modal visible={current === "manage"} animationType="slide" onRequestClose={closeAll}>
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
          <View style={styles.topBar}>
            <Pressable onPress={closeAll} hitSlop={10} accessibilityLabel="Back">
              <ChevronLeft size={24} color={colors.blue} />
            </Pressable>
            <Text style={styles.topTitle}>Linked accounts</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={styles.screenBody}>
            <Text style={styles.subtitle}>Switch between your AsanPay accounts without logging out.</Text>

            <View style={styles.banner}>
              <ShieldCheck size={20} color={colors.blueLight} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>One secure identity, multiple business roles</Text>
                <Text style={[laStyles.muted, { marginTop: 2 }]}>
                  Only accounts with the same verified PAN and Aadhaar can be linked.
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Your accounts</Text>
                  <Text style={laStyles.muted}>
                    {accounts.length > 1 ? `${accounts.length} accounts connected to your verified identity` : "Only this account so far"}
                  </Text>
                </View>
                <View style={styles.mpinChip}>
                  <ShieldCheck size={12} color={colors.greenPayEnd} />
                  <Text style={styles.mpinChipText}>Protected by MPIN</Text>
                </View>
              </View>
              {listBody}
              {accounts.map((a) => (
                <View key={a.userId} style={[styles.accountRow, styles.rowBorder]}>
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <AccountAvatar name={a.name} role={a.role} size={46} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={laStyles.name} numberOfLines={1}>
                          {a.name}
                        </Text>
                        {a.isCurrent ? (
                          <View style={styles.currentChip}>
                            <Text style={styles.currentChipText}>Current account</Text>
                          </View>
                        ) : null}
                        {a.status !== "active" ? (
                          <View style={[styles.currentChip, { backgroundColor: "#FFF7ED" }]}>
                            <Text style={[styles.currentChipText, { color: "#B45309" }]}>Needs review</Text>
                          </View>
                        ) : null}
                      </View>
                      <RoleChip role={a.role} roleLabel={a.roleLabel} uid={a.uid} />
                      <Text style={styles.meta}>{a.mobileMasked}</Text>
                    </View>
                  </View>
                  <View style={styles.accountFoot}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.footLabel}>{a.isCurrent ? "Account status" : "Linked on"}</Text>
                      <Text style={styles.footValue}>{a.isCurrent ? "Signed in" : formatDate(a.linkedAt)}</Text>
                    </View>
                    {!a.isCurrent ? <SwitchPill account={a} onPress={() => openSwitch(a)} /> : null}
                    {accounts.length > 1 ? (
                      <Pressable onPress={() => confirmUnlink(a)} hitSlop={8} style={{ marginLeft: 16 }}>
                        <Text style={styles.unlink}>Unlink</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
              {data && accounts.length <= 1 ? (
                <View style={[styles.empty, styles.rowBorder]}>
                  <View style={styles.emptyIcon}>
                    <Users size={26} color={colors.blueLight} />
                  </View>
                  <Text style={styles.cardTitle}>No linked accounts yet</Text>
                  <Text style={[laStyles.muted, { textAlign: "center" }]}>
                    Run a Distributor and a Retailer account? Link them once and switch with your MPIN.
                  </Text>
                </View>
              ) : null}
            </View>

            {canLinkMore ? (
              <View style={{ marginTop: 16, flexDirection: "row" }}>
                <LaButton label="+ Link another account" tone="green" onPress={openLink} />
              </View>
            ) : null}

            <View style={styles.how}>
              <View style={styles.howIcon}>
                <Link2 size={18} color={colors.blueLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>How account linking works</Text>
                <Text style={[laStyles.muted, { marginTop: 2 }]}>
                  We match your PAN, Aadhaar and name, verify your other mobile once, then ask for MPIN whenever you
                  switch. Once every 24 hours we also ask for an OTP. Wallets, ledgers, commission and daily 2FA stay
                  separate for each account.
                </Text>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {switchTarget ? (
        <SwitchFlow
          target={switchTarget}
          current={currentFace}
          onClose={() => {
            setSwitchTarget(null);
            back();
          }}
          onSwitched={closeAll}
        />
      ) : null}
      {linking ? (
        <LinkAccountSheet
          onClose={() => {
            setLinking(false);
            back();
          }}
          onLinked={setData}
          onSwitchNow={(target) => {
            setLinking(false);
            setSwitchTarget(target);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  checkDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#E7F8EF", alignItems: "center", justifyContent: "center" },
  meta: { fontSize: 11.5, color: colors.textMuted, marginTop: 4 },
  warn: { color: "#B45309", fontWeight: "700" },
  switchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.blue,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  switchPillText: { color: "#fff", fontSize: 12.5, fontWeight: "800" },
  action: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  actionText: { fontSize: 14, fontWeight: "700", color: colors.blue },
  link: { fontSize: 13, fontWeight: "800", color: colors.blueLight },
  screen: { flex: 1, backgroundColor: "#F0F4FF" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: colors.blue },
  screenBody: { padding: 16, paddingBottom: 40 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 14 },
  banner: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(42,92,221,0.18)",
    backgroundColor: colors.bluePale,
  },
  bannerTitle: { fontSize: 13.5, fontWeight: "800", color: colors.blue },
  card: { marginTop: 16, borderRadius: 18, backgroundColor: "#fff", paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.blue },
  mpinChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#E7F8EF",
  },
  mpinChipText: { fontSize: 10.5, fontWeight: "700", color: colors.greenPayEnd },
  accountRow: { paddingVertical: 14 },
  currentChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#E7F8EF" },
  currentChipText: { fontSize: 10, fontWeight: "700", color: colors.greenPayEnd },
  accountFoot: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  footLabel: { fontSize: 10.5, color: colors.textMuted },
  footValue: { fontSize: 12.5, fontWeight: "800", color: colors.blue },
  unlink: { fontSize: 13, fontWeight: "800", color: colors.danger },
  empty: { alignItems: "center", gap: 6, paddingVertical: 22 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F0F4FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  how: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.bluePale,
  },
  howIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
});
