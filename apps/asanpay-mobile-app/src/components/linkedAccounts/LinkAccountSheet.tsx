import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CheckCircle2, Link2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react-native";
import type { LinkCheckResult, LinkedAccountSummary, LinkedAccountsResponse } from "@asanpay/shared-types";
import { ModalSheet } from "../ModalSheet";
import { apiError } from "../../utils/apiError";
import { checkLink, startLink, verifyLink, type OtpSent } from "../../lib/linkedAccounts";
import { colors } from "../../theme/colors";
import { AccountAvatar, CodeField, InlineError, LaButton, PulseIcon, RoleChip, laStyles } from "./parts";

const RESEND_SECONDS = 30;

function AccountMini({ account }: { account: LinkedAccountSummary }) {
  return (
    <View style={styles.mini}>
      <AccountAvatar name={account.name} role={account.role} size={44} />
      <Text style={[laStyles.name, { marginTop: 8 }]} numberOfLines={1}>
        {account.name}
      </Text>
      <RoleChip role={account.role} roleLabel={account.roleLabel} uid={account.uid} />
    </View>
  );
}

/** Link flow: mobile → OTP + other account's MPIN → success. Same copy as web. */
export function LinkAccountSheet({
  onClose,
  onLinked,
  onSwitchNow,
}: {
  onClose: () => void;
  onLinked: (res: LinkedAccountsResponse) => void;
  onSwitchNow: (target: LinkedAccountSummary) => void;
}) {
  const [step, setStep] = useState<"mobile" | "verify" | "done">("mobile");
  const [mobile, setMobile] = useState("");
  const [check, setCheck] = useState<LinkCheckResult | null>(null);
  const [otp, setOtp] = useState("");
  const [mpin, setMpin] = useState("");
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [linked, setLinked] = useState<LinkedAccountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const mobileValid = /^[6-9]\d{9}$/.test(mobile);

  async function runCheck() {
    if (!mobileValid) {
      setError("Enter a valid 10-digit mobile");
      return;
    }
    setBusy(true);
    setError(null);
    let result: LinkCheckResult;
    try {
      result = await checkLink(mobile);
      setCheck(result);
      setStep("verify");
    } catch (err) {
      setError(apiError(err, "Could not verify this account. Try again."));
      setBusy(false);
      return;
    }
    setBusy(false);
    // OTP goes out automatically once every detail matched.
    if (result.eligible) await sendOtp();
  }

  async function sendOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await startLink(mobile);
      setSent(res);
      setOtp(res.otp ?? "");
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setError(apiError(err, "Could not send the OTP. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function submitLink() {
    if (otp.length !== 6 || mpin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await verifyLink({ mobile, otp, mpin });
      setLinked(res);
      onLinked(res);
      setStep("done");
    } catch (err) {
      setError(apiError(err, "Could not link the account. Try again."));
      setMpin("");
    } finally {
      setBusy(false);
    }
  }

  const close = busy ? () => undefined : onClose;

  if (step === "done" && linked) {
    const current = linked.accounts.find((a) => a.isCurrent);
    const other = linked.accounts.find((a) => !a.isCurrent);
    return (
      <ModalSheet visible title="Accounts linked" onClose={onClose}>
        <View style={{ alignItems: "center" }}>
          <View style={styles.successIcon}>
            <CheckCircle2 size={30} color={colors.green} />
          </View>
          <Text style={[laStyles.muted, { textAlign: "center" }]}>
            You can now switch between these accounts with your MPIN.
          </Text>
        </View>
        <View style={styles.miniRow}>
          {current ? <AccountMini account={current} /> : null}
          {other ? <AccountMini account={other} /> : null}
        </View>
        <View style={laStyles.btnRow}>
          <LaButton label="Done" tone="outline" onPress={onClose} />
          <LaButton label="Switch now" tone="blue" onPress={() => other && onSwitchNow(other)} disabled={!other} />
        </View>
      </ModalSheet>
    );
  }

  if (step === "verify" && check) {
    const a = check.account;
    const cells: Array<{ label: string; value: string; full?: boolean }> = a
      ? [
          { label: "UID", value: a.uid },
          { label: "KYC", value: "Verified" },
        ]
      : [{ label: "Mobile", value: `XXXXXX${mobile.slice(-4)}`, full: true }];
    const matchedCount = [check.checks.pan, check.checks.aadhaar, check.checks.name].filter(Boolean).length;
    const matches = [
      { label: "PAN", ok: check.checks.pan },
      { label: "Aadhaar", ok: check.checks.aadhaar },
      { label: "Name", ok: check.checks.name },
    ];
    return (
      <ModalSheet visible title="Verify account" onClose={close}>
        <ScrollView>
          <Text style={styles.step}>Step 2 of 2</Text>
          <View style={styles.verifyHead}>
            <PulseIcon
              bg={check.eligible ? "#E7F8EF" : colors.dangerBg}
              accent={check.eligible ? colors.greenDark : colors.danger}
            >
              {check.eligible ? (
                <ShieldCheck size={22} color={colors.greenDark} />
              ) : (
                <ShieldAlert size={22} color={colors.danger} />
              )}
            </PulseIcon>
            <Text style={[laStyles.muted, { flex: 1, marginTop: 0 }]}>
              {check.eligible
                ? "PAN, Aadhaar and name match your verified KYC."
                : "This account cannot be linked to you."}
            </Text>
          </View>
          {a ? (
            <View style={styles.accountHead}>
              <AccountAvatar name={a.name} role={a.role} size={46} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={laStyles.name} numberOfLines={1}>
                  {a.name}
                </Text>
                <RoleChip role={a.role} roleLabel={a.roleLabel} uid={a.uid} />
                <Text style={[laStyles.muted, { marginTop: 3 }]}>{a.mobileMasked}</Text>
              </View>
            </View>
          ) : null}
          <View style={[styles.grid, a ? styles.gridAttached : null]}>
            {cells.map((c) => (
              <View key={c.label} style={[styles.cell, c.full ? styles.cellFull : styles.cellHalf]}>
                <Text style={styles.cellLabel}>{c.label}</Text>
                <Text style={styles.cellValue} numberOfLines={1}>
                  {c.value}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.matchRow}>
            {matches.map((m) => (
              <View key={m.label} style={[styles.matchChip, m.ok ? styles.matchOk : styles.matchBad]}>
                {m.ok ? <CheckCircle2 size={14} color={colors.greenDark} /> : <XCircle size={14} color={colors.danger} />}
                <View>
                  <Text style={styles.matchLabel}>{m.label}</Text>
                  <Text style={[styles.matchValue, { color: m.ok ? colors.greenDark : colors.danger }]}>
                    {m.ok ? "Matched" : "Not matched"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <View style={[styles.summary, { backgroundColor: check.eligible ? colors.greenDark : colors.danger }]}>
            {check.eligible ? <ShieldCheck size={14} color="#fff" /> : <ShieldAlert size={14} color="#fff" />}
            <Text style={styles.summaryText}>
              {check.eligible ? "All 3 details matched" : `${matchedCount} of 3 details matched`}
            </Text>
          </View>
          <InlineError message={check.message} />

          {check.eligible ? (
            <>
              <Text style={[laStyles.label, { marginTop: 18 }]}>
                {sent ? `Enter 6-digit OTP sent to ${sent.mobileMasked}` : "Sending OTP…"}
              </Text>
              <CodeField length={6} value={otp} onChange={setOtp} autoFocus placeholder="6-digit OTP" />
              <View style={{ alignItems: "flex-end", marginTop: 8 }}>
                {resendIn > 0 ? (
                  <Text style={styles.resendMuted}>Resend OTP in 00:{String(resendIn).padStart(2, "0")}</Text>
                ) : (
                  <Pressable onPress={() => void sendOtp()} disabled={busy} hitSlop={8}>
                    <Text style={styles.resend}>{sent ? "Resend OTP" : "Send OTP"}</Text>
                  </Pressable>
                )}
              </View>

              <Text style={[laStyles.label, { marginTop: 12 }]}>MPIN of the other account</Text>
              <CodeField length={4} value={mpin} onChange={setMpin} masked placeholder="4-digit MPIN" />
              <Text style={laStyles.helper}>The 4-digit MPIN you use to log in to that account.</Text>
            </>
          ) : null}

          <InlineError message={error} />

          <View style={laStyles.btnRow}>
            <LaButton
              label="Back"
              tone="outline"
              onPress={() => {
                setStep("mobile");
                setCheck(null);
                setSent(null);
                setError(null);
                setOtp("");
                setMpin("");
              }}
              disabled={busy}
            />
            <LaButton
              label="Link account"
              tone="green"
              onPress={() => void submitLink()}
              disabled={!check.eligible || otp.length !== 6 || mpin.length !== 4}
              loading={busy}
            />
          </View>
        </ScrollView>
      </ModalSheet>
    );
  }

  return (
    <ModalSheet visible title="Link another account" onClose={close}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.step}>Step 1 of 2</Text>
        <View style={styles.info}>
          <View style={styles.infoIcon}>
            <Link2 size={18} color={colors.blueLight} />
          </View>
          <Text style={[laStyles.muted, { flex: 1, marginTop: 0 }]}>
            Link your other AsanPay account (same PAN and Aadhaar) to switch without logging out.
          </Text>
        </View>

        <Text style={[laStyles.label, { marginTop: 18 }]}>Mobile number of the other account</Text>
        <View style={styles.mobileRow}>
          <Text style={styles.prefix}>+91</Text>
          <TextInput
            value={mobile}
            onChangeText={(t) => {
              setMobile(t.replace(/\D/g, "").slice(0, 10));
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={10}
            autoFocus
            placeholder="10-digit mobile number"
            placeholderTextColor={colors.textLight}
            style={styles.mobileInput}
          />
        </View>
        <Text style={laStyles.helper}>We first check PAN, Aadhaar and name. The OTP is sent after they match.</Text>

        <View style={styles.identity}>
          <ShieldCheck size={20} color={colors.greenDark} />
          <View style={{ flex: 1 }}>
            <Text style={styles.identityTitle}>Identity check</Text>
            <Text style={[laStyles.muted, { marginTop: 2 }]}>The PAN, Aadhaar and name on both accounts must match.</Text>
          </View>
        </View>

        <InlineError message={error} />

        <View style={laStyles.btnRow}>
          <LaButton label="Cancel" tone="red" onPress={onClose} disabled={busy} />
          <LaButton label="Verify" tone="blue" onPress={() => void runCheck()} disabled={!mobileValid} loading={busy} />
        </View>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  step: { fontSize: 11.5, color: colors.textMuted, marginBottom: 14, fontWeight: "600" },
  verifyHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  accountHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(11,42,154,0.12)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: "#F7F9FF",
  },
  gridAttached: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  summaryText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: "rgba(11,42,154,0.12)",
    borderRadius: 16,
    overflow: "hidden",
  },
  cell: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(11,42,154,0.08)",
  },
  cellFull: { width: "100%" },
  cellHalf: { width: "50%" },
  cellLabel: { fontSize: 11, color: colors.textMuted },
  cellValue: { marginTop: 2, fontSize: 13.5, fontWeight: "800", color: colors.blue },
  matchRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  matchChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  matchOk: { backgroundColor: "#F0FBF5", borderColor: "#C8EED9" },
  matchBad: { backgroundColor: colors.dangerBg, borderColor: "#FECACA" },
  matchLabel: { fontSize: 10.5, color: colors.textMuted },
  matchValue: { fontSize: 11.5, fontWeight: "800" },
  info: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: "#F0F4FF" },
  infoIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  mobileRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  prefix: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#F0F4FF",
    color: colors.blue,
    fontWeight: "800",
    fontSize: 15,
  },
  mobileInput: { flex: 1, paddingHorizontal: 14, fontSize: 16, color: colors.blue },
  identity: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#C8EED9",
    backgroundColor: "#F0FBF5",
  },
  identityTitle: { fontSize: 13, fontWeight: "800", color: colors.greenDark },
  resend: { fontSize: 12, fontWeight: "800", color: colors.blueLight },
  resendMuted: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E7F8EF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  miniRow: { flexDirection: "row", gap: 12, marginTop: 18 },
  mini: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F0F4FF",
  },
});
