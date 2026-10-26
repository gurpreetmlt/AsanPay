import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RefreshCw, ShieldCheck } from "lucide-react-native";
import { POLICY_VERSION, type LinkedAccountSummary } from "@asanpay/shared-types";
import { ModalSheet } from "../ModalSheet";
import { showAlert } from "../AppAlert";
import { PinInput } from "../PinInput";
import { LoginPolicyConsent } from "../LoginPolicyConsent";
import { apiError } from "../../utils/apiError";
import { apiErrorCode, commitSwitch, requestSwitchOtp, switchToAccount, type OtpSent } from "../../lib/linkedAccounts";
import { colors } from "../../theme/colors";
import { AccountFlipOverlay, type FlipFace } from "./AccountFlipOverlay";
import { AccountAvatar, InlineError, LaButton, RoleChip, laStyles } from "./parts";

const RESEND_SECONDS = 30;

type Session = Awaited<ReturnType<typeof switchToAccount>>["session"];

/** MPIN (+ OTP once every 24 h) → card flip → session swap. Same rules and copy as web. */
export function SwitchFlow({
  target,
  current,
  onClose,
  onSwitched,
}: {
  target: LinkedAccountSummary;
  current: FlipFace;
  onClose: () => void;
  /** Called after the session swap so the host can drop the overlay. */
  onSwitched: () => void;
}) {
  const [mpin, setMpin] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(target.otpRequiredForSwitch);
  const [otpSent, setOtpSent] = useState<OtpSent | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [needsPolicy, setNeedsPolicy] = useState(false);
  const [policyChecked, setPolicyChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [switched, setSwitched] = useState<{ session: Session; message: string } | null>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendOtp = useCallback(async () => {
    setSendingOtp(true);
    setError(null);
    try {
      const sent = await requestSwitchOtp(target.userId);
      setOtpSent(sent);
      setOtp(sent.otp ?? "");
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setError(apiError(err, "Could not send the OTP. Try again."));
    } finally {
      setSendingOtp(false);
    }
  }, [target.userId]);

  useEffect(() => {
    if (needsOtp && !autoSent.current) {
      autoSent.current = true;
      void sendOtp();
    }
  }, [needsOtp, sendOtp]);

  const canSubmit = mpin.length === 4 && (!needsOtp || otp.length === 6) && (!needsPolicy || policyChecked) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await switchToAccount({
        targetUserId: target.userId,
        mpin,
        ...(needsOtp ? { otp } : {}),
        ...(needsPolicy && policyChecked ? { acceptedPolicyVersion: POLICY_VERSION } : {}),
      });
      setSwitched(result);
    } catch (err) {
      const code = apiErrorCode(err);
      setError(apiError(err, "Could not switch accounts. Try again."));
      if (code === "SWITCH_OTP_REQUIRED") setNeedsOtp(true);
      else if (code === "POLICY_ACCEPTANCE_REQUIRED") setNeedsPolicy(true);
      else if (code === "MPIN_INCORRECT" || code === "SWITCH_LOCKED") setMpin("");
      else if (code?.startsWith("OTP_")) setOtp("");
      setBusy(false);
    }
  }

  if (switched) {
    return (
      <AccountFlipOverlay
        from={current}
        to={{ name: target.name, role: target.role, roleLabel: target.roleLabel, uid: target.uid, mobileMasked: target.mobileMasked }}
        onDone={() => {
          void commitSwitch(switched.session).then(() => {
            onSwitched();
            showAlert("Account switched", switched.message);
          });
        }}
      />
    );
  }

  return (
    <ModalSheet
      visible
      title={`Switch to ${target.roleLabel} account?`}
      subtitle="Your dashboard, balance and permissions will update."
      icon={<RefreshCw />}
      onClose={busy ? () => undefined : onClose}
    >
        <View style={laStyles.targetCard}>
          <AccountAvatar name={target.name} role={target.role} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={laStyles.name} numberOfLines={1}>
              {target.name}
            </Text>
            <RoleChip role={target.role} roleLabel={target.roleLabel} uid={target.uid} />
            <Text style={laStyles.muted}>{target.mobileMasked}</Text>
          </View>
        </View>

        {needsOtp ? (
          <View style={styles.block}>
            <Text style={laStyles.label}>Enter 6-digit OTP sent to {otpSent?.mobileMasked ?? target.mobileMasked}</Text>
            <PinInput length={6} value={otp} onChange={setOtp} masked={false} autoFocus={false} />
            <View style={styles.otpRow}>
              <Text style={[laStyles.helper, { flex: 1, marginTop: 0 }]}>
                For your security, verify with OTP once every 24 hours.
              </Text>
              {resendIn > 0 ? (
                <Text style={styles.resendMuted}>Resend in 00:{String(resendIn).padStart(2, "0")}</Text>
              ) : (
                <Pressable onPress={() => void sendOtp()} disabled={sendingOtp} hitSlop={8}>
                  <Text style={styles.resend}>{sendingOtp ? "Sending…" : otpSent ? "Resend OTP" : "Send OTP"}</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={laStyles.label}>Enter 4-digit MPIN of the {target.roleLabel} account</Text>
          <PinInput length={4} value={mpin} onChange={setMpin} autoFocus={!needsOtp} />
          <View style={styles.helperRow}>
            <ShieldCheck size={14} color={colors.green} />
            <Text style={[laStyles.helper, { marginTop: 0 }]}>Required to protect your linked accounts</Text>
          </View>
        </View>

        {needsPolicy ? <LoginPolicyConsent checked={policyChecked} onChange={setPolicyChecked} tone="light" /> : null}

        <InlineError message={error} />

        <View style={laStyles.btnRow}>
          <LaButton label="Cancel" tone="red" onPress={onClose} disabled={busy} />
          <LaButton label="Switch account" tone="blue" onPress={() => void submit()} disabled={!canSubmit} loading={busy} />
        </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 18 },
  otpRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  resend: { fontSize: 12, fontWeight: "800", color: colors.blueLight },
  resendMuted: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  helperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 },
});
