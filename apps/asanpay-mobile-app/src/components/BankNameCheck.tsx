import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, CheckCircle2, Clock, Landmark } from "lucide-react-native";
import { BANK_NAME_MATCH_COPY, bankNameMatch, type ApiResponse } from "@asanpay/shared-types";
import { api } from "../lib/api";
import { apiError } from "../utils/apiError";
import { createAttemptKeyHolder } from "../lib/idempotencyKey";
import { colors } from "../theme/colors";

interface BankCheckResult {
  status: "verified" | "not_confirmed" | "pending";
  bankName: string | null;
  method: "bestapi" | "pennyless" | "pennydrop" | null;
  charged: string;
  cached: boolean;
  message: string;
}

interface Prices {
  standard: string;
  pennyDrop: string;
}

const rupees = (v: string) => `₹${Number(v).toFixed(2)}`;

const PILL = {
  match: { bg: colors.greenBg, fg: colors.greenDark },
  partial: { bg: "#FFFBEB", fg: "#B45309" },
  mismatch: { bg: colors.dangerBg, fg: colors.dangerDark },
} as const;

/** Optional bank name check before adding a payee. A result is dropped when the account or IFSC changes. */
export function BankNameCheck({
  accountNumber,
  ifsc,
  typedName,
  onUseBankName,
}: {
  accountNumber: string;
  ifsc: string;
  typedName: string;
  onUseBankName: (name: string) => void;
}) {
  const [prices, setPrices] = useState<Prices | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BankCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** One idempotency key per account + IFSC attempt, reused only for retries of that attempt. */
  const attempt = useRef<{ details: string; key: ReturnType<typeof createAttemptKeyHolder> } | null>(null);
  const details = `${accountNumber}|${ifsc}`;
  const [checkedDetails, setCheckedDetails] = useState(details);
  if (checkedDetails !== details) {
    setCheckedDetails(details);
    setResult(null);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<ApiResponse<Prices>>("/txn/dmt/beneficiary/bank-check/price")
      .then(({ data }) => {
        if (!cancelled && data.success) setPrices(data.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = /^\d{6,18}$/.test(accountNumber) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);

  async function verify() {
    if (!ready) {
      setError("Enter the account number (6–18 digits) and a valid IFSC first");
      return;
    }
    if (attempt.current?.details !== details) {
      attempt.current = { details, key: createAttemptKeyHolder("bank-check") };
    }
    const holder = attempt.current.key;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<ApiResponse<BankCheckResult>>("/txn/dmt/beneficiary/bank-check", {
        accountNumber,
        ifsc,
        idempotencyKey: holder.get(),
      });
      if (!data.success) throw new Error(data.message || "Bank name check failed. Try again.");
      setResult(data.data);
      holder.clear();
    } catch (err) {
      setError(apiError(err, "Bank name check failed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const match = result?.status === "verified" && result.bankName ? bankNameMatch(typedName, result.bankName) : null;
  const pill = match ? PILL[match.level] : null;

  return (
    <View style={styles.card}>
      {!result || result.status !== "verified" ? (
        <>
          <Pressable onPress={() => void verify()} disabled={busy} style={[styles.verifyBtn, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color={colors.blueFlat} /> : <Landmark size={16} color={colors.blueFlat} />}
            <Text style={styles.verifyText}>
              {busy ? "Checking with bank…" : `Verify name with bank${prices ? ` (${rupees(prices.standard)})` : ""}`}
            </Text>
          </Pressable>
          <Text style={styles.hint}>
            Optional. {prices ? `${rupees(prices.standard)} per check` : "Small fee per check"}
            {prices ? `, or ${rupees(prices.pennyDrop)} if the bank needs a ₹1 test credit` : ""} — debited from your
            wallet only when the bank confirms. Same account checked again within 90 days is free.
          </Text>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result?.status === "not_confirmed" || result?.status === "pending" ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: result.status === "pending" ? PILL.partial.bg : PILL.mismatch.bg },
          ]}
        >
          {result.status === "pending" ? (
            <Clock size={14} color={PILL.partial.fg} />
          ) : (
            <AlertTriangle size={14} color={PILL.mismatch.fg} />
          )}
          <Text style={[styles.noticeText, { color: result.status === "pending" ? PILL.partial.fg : PILL.mismatch.fg }]}>
            {result.message}
          </Text>
        </View>
      ) : null}

      {result?.status === "verified" ? (
        <View>
          <View style={styles.row}>
            <CheckCircle2 size={18} color={colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={styles.caption}>NAME AS PER BANK</Text>
              <Text style={styles.bankName} numberOfLines={1}>
                {result.bankName ?? "Bank did not return a name"}
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
              {BANK_NAME_MATCH_COPY[match.level]}
            </Text>
          ) : null}
          {result.bankName && match?.level !== "match" ? (
            <Pressable onPress={() => onUseBankName(result.bankName!)} style={styles.useBtn}>
              <Text style={styles.verifyText}>Use bank name</Text>
            </Pressable>
          ) : null}
          <Text style={styles.hint}>
            {result.cached ? "Checked earlier — no charge." : `${rupees(result.charged)} debited from your wallet.`}
          </Text>
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
    backgroundColor: "#fff",
  },
  verifyBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    backgroundColor: colors.bluePale,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  verifyText: { color: colors.blueFlat, fontWeight: "700", fontSize: 14 },
  hint: { marginTop: 6, fontSize: 11, color: "#64748B" },
  error: { marginTop: 8, fontSize: 12, fontWeight: "700", color: colors.danger },
  notice: { marginTop: 8, flexDirection: "row", gap: 6, borderRadius: 10, padding: 8 },
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
    alignItems: "center",
    justifyContent: "center",
  },
});
