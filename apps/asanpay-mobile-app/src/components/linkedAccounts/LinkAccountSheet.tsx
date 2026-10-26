import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CheckCircle2, Link2, ShieldCheck } from "lucide-react-native";
import type { LinkedAccountSummary, LinkedAccountsResponse } from "@asanpay/shared-types";
import { ModalSheet } from "../ModalSheet";
import { PinInput } from "../PinInput";
import { apiError } from "../../utils/apiError";
import { startLink, verifyLink, type OtpSent } from "../../lib/linkedAccounts";
import { colors } from "../../theme/colors";
import { AccountAvatar, InlineError, LaButton, RoleChip, laStyles } from "./parts";

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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mobile, setMobile] = useState("");
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

  async function sendOtp() {
    if (!mobileValid) {
      setError("Enter a valid 10-digit mobile");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await startLink(mobile);
      setSent(res);
      setOtp(res.otp ?? "");
      setResendIn(RESEND_SECONDS);
      setStep(2);
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
      setStep(3);
    } catch (err) {
      setError(apiError(err, "Could not link the account. Try again."));
      setMpin("");
    } finally {
      setBusy(false);
    }
  }

  const close = busy ? () => undefined : onClose;

  if (step === 3 && linked) {
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

  if (step === 2) {
    return (
      <ModalSheet visible title="Link another account" onClose={close}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.step}>Step 2 of 2</Text>
          <Text style={laStyles.label}>Enter 6-digit OTP sent to {sent?.mobileMasked ?? `XXXXXX${mobile.slice(-4)}`}</Text>
          <PinInput length={6} value={otp} onChange={setOtp} masked={false} />
          <View style={{ alignItems: "flex-end", marginTop: 8 }}>
            {resendIn > 0 ? (
              <Text style={styles.resendMuted}>Resend OTP in 00:{String(resendIn).padStart(2, "0")}</Text>
            ) : (
              <Pressable onPress={() => void sendOtp()} disabled={busy} hitSlop={8}>
                <Text style={styles.resend}>Resend OTP</Text>
              </Pressable>
            )}
          </View>

          <Text style={[laStyles.label, { marginTop: 16 }]}>MPIN of the other account</Text>
          <PinInput length={4} value={mpin} onChange={setMpin} autoFocus={false} />
          <Text style={[laStyles.helper, { textAlign: "center" }]}>The 4-digit MPIN you use to log in to that account.</Text>

          <InlineError message={error} />

          <View style={laStyles.btnRow}>
            <LaButton
              label="Back"
              tone="outline"
              onPress={() => {
                setStep(1);
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
              disabled={otp.length !== 6 || mpin.length !== 4}
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
        <Text style={laStyles.helper}>We will send an OTP to this number.</Text>

        <View style={styles.identity}>
          <ShieldCheck size={20} color={colors.greenDark} />
          <View style={{ flex: 1 }}>
            <Text style={styles.identityTitle}>Identity check</Text>
            <Text style={[laStyles.muted, { marginTop: 2 }]}>The PAN and Aadhaar on both accounts must match.</Text>
          </View>
        </View>

        <InlineError message={error} />

        <View style={laStyles.btnRow}>
          <LaButton label="Cancel" tone="red" onPress={onClose} disabled={busy} />
          <LaButton label="Send OTP" tone="blue" onPress={() => void sendOtp()} disabled={!mobileValid} loading={busy} />
        </View>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  step: { fontSize: 11.5, color: colors.textMuted, marginBottom: 14, fontWeight: "600" },
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
