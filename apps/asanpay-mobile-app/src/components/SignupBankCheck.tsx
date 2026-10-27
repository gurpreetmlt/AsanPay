import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, CheckCircle2, Landmark } from "lucide-react-native";
import { BANK_NAME_MATCH_COPY, bankNameMatch, type ApiResponse } from "@asanpay/shared-types";
import { api } from "../lib/api";
import { apiError } from "../utils/apiError";
import { colors } from "../theme/colors";

interface SignupBankCheckResult {
  status: "verified" | "not_confirmed" | "pending";
  bankName: string | null;
  cached: boolean;
  message: string;
}

const AUTO_CHECK_DELAY_MS = 700;

const PILL = {
  match: { bg: colors.greenBg, fg: colors.greenDark },
  partial: { bg: "#FFFBEB", fg: "#B45309" },
  mismatch: { bg: colors.dangerBg, fg: colors.dangerDark },
} as const;

/** Signup bank step: free bank check, runs by itself once account + IFSC are complete. Warn only. */
export function SignupBankCheck({
  accountNumber,
  accountNumberConfirm,
  ifsc,
  panName,
  onUseBankName,
}: {
  accountNumber: string;
  accountNumberConfirm: string;
  ifsc: string;
  panName: string;
  onUseBankName: (name: string) => void;
}) {
  const code = ifsc.trim().toUpperCase();
  const ready =
    /^\d{6,18}$/.test(accountNumber) &&
    accountNumber === accountNumberConfirm &&
    /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code);
  const details = ready ? `${accountNumber}|${code}` : "";

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ details: string; data: SignupBankCheckResult } | null>(null);
  const [error, setError] = useState<{ details: string; message: string } | null>(null);
  const started = useRef("");

  async function run(target: string) {
    started.current = target;
    setBusy(true);
    setError(null);
    try {
      const [acct, ifscCode] = target.split("|");
      const { data } = await api.post<ApiResponse<SignupBankCheckResult>>("/kyc/bank-check", {
        accountNumber: acct,
        ifsc: ifscCode,
      });
      if (!data.success) throw new Error(data.message || "Bank check could not run. Try again.");
      if (started.current === target) setResult({ details: target, data: data.data });
    } catch (err) {
      if (started.current === target) {
        setError({ details: target, message: apiError(err, "Bank check could not run. Try again.") });
      }
    } finally {
      if (started.current === target) setBusy(false);
    }
  }

  useEffect(() => {
    if (!details || started.current === details) return;
    const t = setTimeout(() => void run(details), AUTO_CHECK_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details]);

  if (!ready) return null;

  const current = result?.details === details ? result.data : null;
  const currentError = error?.details === details ? error.message : null;
  const match =
    current?.status === "verified" && current.bankName && panName.trim()
      ? bankNameMatch(panName, current.bankName)
      : null;
  const pill = match ? PILL[match.level] : null;

  return (
    <View style={styles.card}>
      {busy ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.blueFlat} />
          <Text style={styles.verifyText}>Checking account with bank…</Text>
        </View>
      ) : current?.status === "verified" ? (
        <View>
          <View style={styles.row}>
            <CheckCircle2 size={18} color={colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={styles.caption}>NAME AS PER BANK</Text>
              <Text style={styles.bankName} numberOfLines={1}>
                {current.bankName ?? "Bank did not return a name"}
              </Text>
            </View>
            {match && pill ? (
              <View style={[styles.percent, { backgroundColor: pill.bg }]}>
                <Text style={{ color: pill.fg, fontSize: 11, fontWeight: "800" }}>{match.percent}%</Text>
              </View>
            ) : null}
          </View>
          {match && pill ? (
            <Text style={[styles.matchText, { backgroundColor: pill.bg, color: pill.fg }]}>
              {BANK_NAME_MATCH_COPY[match.level]} (compared with your PAN name)
            </Text>
          ) : null}
          {current.bankName ? (
            <Pressable onPress={() => onUseBankName(current.bankName!)} style={styles.useBtn}>
              <Text style={styles.verifyText}>Use bank name as account holder</Text>
            </Pressable>
          ) : null}
        </View>
      ) : current || currentError ? (
        <View>
          <View style={[styles.notice, { backgroundColor: PILL.partial.bg }]}>
            <AlertTriangle size={14} color={PILL.partial.fg} />
            <Text style={[styles.noticeText, { color: PILL.partial.fg }]}>
              {currentError ?? current?.message} You can still continue — admin will check this account.
            </Text>
          </View>
          <Pressable onPress={() => void run(details)} style={styles.useBtn}>
            <View style={styles.row}>
              <Landmark size={14} color={colors.blueFlat} />
              <Text style={styles.verifyText}>Check again</Text>
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    backgroundColor: "#F7F9FF",
  },
  verifyText: { color: colors.blueFlat, fontWeight: "700", fontSize: 14 },
  notice: { flexDirection: "row", gap: 6, borderRadius: 10, padding: 8 },
  noticeText: { flex: 1, fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  caption: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, color: "#64748B" },
  bankName: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  percent: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  matchText: { marginTop: 8, borderRadius: 10, padding: 8, fontSize: 12, fontWeight: "700", overflow: "hidden" },
  useBtn: {
    marginTop: 8,
    height: 42,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
