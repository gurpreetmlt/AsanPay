import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, fetchApi } from "../../lib/api";
import { formatSettlementBankCopy } from "../../lib/bankLogo";
import { formatINR } from "../../lib/format";
import { showAlert } from "../../components/AppAlert";
import { BankDetailCard } from "../../components/BankDetailCard";
import {
  emptyIfscBankDetails,
  IfscBankDetailsFields,
  type IfscBankDetailsValue,
} from "../../components/IfscBankDetailsFields";
import { StatusBadge, toneFromStatus } from "../../components/StatusBadge";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import Clipboard from "@react-native-clipboard/clipboard";
import { BANK_NAME_MATCH_COPY, bankNameMatch, type ApiResponse } from "@asanpay/shared-types";

interface SettlementBank {
  id: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
  isActive: boolean;
  verified: boolean;
  coolingUntil?: string | null;
  bankCheckStatus?: "verified" | "not_confirmed" | "pending" | "error" | null;
  bankHolderName?: string | null;
}

/** Post-change withdrawal hold, e.g. "Withdrawals paused until 2 Nov, 6:35 pm (23 h 10 min left)". */
function holdNote(coolingUntil: string | null | undefined, now: number): string | null {
  if (!coolingUntil) return null;
  const until = new Date(coolingUntil);
  const ms = until.getTime() - now;
  if (!(ms > 0)) return null;
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.max(1, Math.ceil((ms % 3_600_000) / 60_000));
  const left = hours > 0 ? `${hours} h ${mins} min left` : `${mins} min left`;
  const at = until.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `Withdrawals paused until ${at} (${left}) — the settlement bank was changed recently`;
}

interface BankCheckResult {
  status: "verified" | "not_confirmed" | "pending" | "error";
  bankName: string | null;
  message: string;
  charged: string;
  cached: boolean;
}

const NOT_CONFIRMED_COPY = "Bank could not confirm this account. Check the account number and IFSC.";

const rupees = (v: string) => `₹${Number(v).toFixed(2)}`;

const PILL = {
  match: { bg: colors.greenBg, fg: colors.greenDark },
  partial: { bg: "#FFFBEB", fg: "#B45309" },
  mismatch: { bg: colors.dangerBg, fg: colors.dangerDark },
} as const;

function bankNote(b: SettlementBank): string {
  if (b.bankHolderName) return `Waiting for admin verification · Name as per bank: ${b.bankHolderName}`;
  if (b.bankCheckStatus === "not_confirmed") return `Waiting for admin verification · ${NOT_CONFIRMED_COPY}`;
  if (b.bankCheckStatus === "pending") return "Waiting for admin verification · The bank is still confirming this account";
  return "Waiting for admin verification";
}

interface SettlementRequest {
  requestId: string;
  amount: string;
  mode: string;
  status: string;
  bankUtr: string | null;
  failureReason: string | null;
  requestedAt: string;
}

function newIdemKey() {
  return `settle-mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 100);
}

export function SettlementsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [banks, setBanks] = useState<SettlementBank[]>([]);
  const [requests, setRequests] = useState<SettlementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [bankDetails, setBankDetails] = useState<IfscBankDetailsValue>(emptyIfscBankDetails());
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<{ holderName: string; result: BankCheckResult } | null>(null);
  const [prices, setPrices] = useState<{ standard: string; pennyDrop: string } | null>(null);
  const idemRef = useRef(newIdemKey());

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    api
      .get<ApiResponse<{ standard: string; pennyDrop: string }>>("/txn/dmt/beneficiary/bank-check/price")
      .then(({ data }) => {
        if (!cancelled && data.success) setPrices(data.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([
        fetchApi<SettlementBank[]>("/settlements/banks"),
        fetchApi<SettlementRequest[]>("/settlements/requests"),
      ]);
      setBanks(b);
      setRequests(r);
    } catch (err) {
      showAlert("Error", (err as Error).message || "Failed to load settlements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setRevealed({});
      setLastCheck(null);
      void load();
    }
  }, [visible, load]);

  const hasActiveBank = banks.some((b) => b.isActive && b.verified);
  const [now, setNow] = useState(() => Date.now());
  const activeBankRow = banks.find((b) => b.isActive && b.verified);
  const activeHold = holdNote(activeBankRow?.coolingUntil, now);
  useEffect(() => {
    if (!activeHold) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [activeHold]);

  async function sendOtp() {
    if (!/^\d{6,18}$/.test(bankDetails.accountNumber.trim())) {
      showAlert("Invalid account", "Account number must be 6–18 digits");
      return;
    }
    if (bankDetails.ifsc.trim().length !== 11 || !bankDetails.bankName.trim()) {
      showAlert("Invalid IFSC", "Enter a valid IFSC and wait for bank name to load");
      return;
    }
    if (!bankDetails.holderName.trim() || !/[A-Za-z]/.test(bankDetails.holderName)) {
      showAlert("Invalid holder", "Account holder must be a name (letters), not the account number");
      return;
    }
    setOtpSending(true);
    try {
      const res = await api.post<{
        success: boolean;
        data?: { expiresInSec: number; otp?: string };
        message?: string;
      }>("/settlements/banks/otp");
      setOtpSent(true);
      const testOtp = __DEV__ ? res.data?.data?.otp : undefined;
      if (testOtp) {
        setOtp(testOtp);
        showAlert("OTP ready", `Use code ${testOtp}`);
      } else {
        showAlert("OTP sent", "Check your registered mobile for the 6-digit code");
      }
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not send OTP",
      );
    } finally {
      setOtpSending(false);
    }
  }

  async function fetchReveal(bankId: string): Promise<string> {
    if (revealed[bankId]) return revealed[bankId];
    const data = await fetchApi<{ accountNumber: string }>(`/settlements/banks/${bankId}/reveal`);
    setRevealed((prev) => ({ ...prev, [bankId]: data.accountNumber }));
    return data.accountNumber;
  }

  async function toggleReveal(bank: SettlementBank) {
    if (revealed[bank.id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[bank.id];
        return next;
      });
      return;
    }
    setBusyId(bank.id);
    try {
      await fetchReveal(bank.id);
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not show account number",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function copyBank(bank: SettlementBank) {
    setBusyId(bank.id);
    try {
      const full = await fetchReveal(bank.id);
      Clipboard.setString(
        formatSettlementBankCopy({
          holderName: bank.holderName,
          accountNumber: full,
          ifsc: bank.ifsc,
        }),
      );
      showAlert("Copied", "Bank details copied");
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not copy bank details",
      );
    } finally {
      setBusyId(null);
    }
  }

  function requestActivate(bank: SettlementBank) {
    showAlert(
      "Switch active bank?",
      `Switch active settlement bank to **** ${bank.accountNumberLast4}? Withdrawals pause for 24 hours after the change.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Set as active",
          style: "primary",
          onPress: () => {
            void (async () => {
              setBusyId(bank.id);
              try {
                const res = await api.post<{
                  success: boolean;
                  message?: string;
                }>(`/settlements/banks/${bank.id}/activate`);
                showAlert("Done", res.data?.message || "Settlement bank activated");
                await load();
              } catch (err) {
                showAlert(
                  "Error",
                  (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message || "Could not activate bank",
                );
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ],
    );
  }

  async function registerBank() {
    if (hasActiveBank && !/^\d{6}$/.test(otp.trim())) {
      showAlert("OTP required", "Send OTP, then enter the 6-digit code to change your bank");
      return;
    }
    if (bankDetails.ifsc.trim().length !== 11 || !bankDetails.bankName.trim()) {
      showAlert("Invalid IFSC", "Enter a valid IFSC and wait for bank name to load");
      return;
    }
    if (bankDetails.accountNumber !== (bankDetails.accountNumberConfirm ?? "")) {
      showAlert("Mismatch", "Account numbers do not match");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<ApiResponse<{ bankCheck: BankCheckResult }>>("/settlements/banks", {
        accountNumber: bankDetails.accountNumber.trim(),
        ifsc: bankDetails.ifsc.trim().toUpperCase(),
        holderName: bankDetails.holderName.trim(),
        ...(hasActiveBank ? { otp: otp.trim() } : {}),
      });
      const check = res.data.success ? res.data.data.bankCheck : null;
      if (check) setLastCheck({ holderName: bankDetails.holderName.trim(), result: check });
      if (check?.status === "verified") {
        showAlert("Submitted", `Name as per bank: ${check.bankName ?? "not returned"}. Awaiting admin verification.`);
      } else if (check?.status === "not_confirmed") {
        showAlert("Bank not confirmed", `${NOT_CONFIRMED_COPY} You were not charged.`);
      } else {
        showAlert("Submitted", "Bank awaiting admin verification");
      }
      setShowBank(false);
      setBankDetails(emptyIfscBankDetails());
      setOtp("");
      setOtpSent(false);
      await load();
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not register bank",
      );
    } finally {
      setSaving(false);
    }
  }

  async function requestSettle() {
    if (!hasActiveBank) {
      showAlert("Bank required", "Add and verify a settlement bank first");
      return;
    }
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount) || parseFloat(amount) <= 0) {
      showAlert("Invalid amount", "Enter a valid amount greater than zero");
      return;
    }
    setSaving(true);
    try {
      await api.post(
        "/settlements/requests",
        { amount: amount.trim(), mode: "imps" },
        { headers: { "Idempotency-Key": idemRef.current } },
      );
      idemRef.current = newIdemKey();
      showAlert("Submitted", "Settlement requested");
      setAmount("");
      await load();
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not request settlement",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Text style={[styles.back, { color: colors.blueFlat }]}>Close</Text>
          </Pressable>
          <Text style={[styles.title, { color: tokens.txt }]}>Settlements</Text>
          <View style={{ width: 48 }} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionRow}>
              <Text style={[styles.section, { color: tokens.txt, marginBottom: 0 }]}>Settlement banks</Text>
              <Pressable
                onPress={() => {
                  setShowBank((v) => {
                    if (v) {
                      setBankDetails(emptyIfscBankDetails());
                      setOtp("");
                      setOtpSent(false);
                    }
                    return !v;
                  });
                }}
              >
                <Text
                  style={{
                    color: showBank ? colors.danger : colors.green,
                    fontWeight: "800",
                    fontSize: 13,
                  }}
                >
                  {showBank ? "Cancel" : "+ Add bank"}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: tokens.mute }]}>
              Verified accounts used for withdrawals. Add a bank below if needed.
            </Text>

            {lastCheck ? <BankCheckSummary holderName={lastCheck.holderName} result={lastCheck.result} /> : null}

            {banks.length === 0 && !showBank ? (
              <Text style={{ color: tokens.sub, marginBottom: 8 }}>No settlement banks yet.</Text>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4, paddingRight: 8 }}
            >
              {banks.map((b) => {
                const active = b.verified && b.isActive;
                return (
                  <View key={b.id} style={{ marginRight: 12 }}>
                    <BankDetailCard
                      ifsc={b.ifsc}
                      holderName={b.holderName}
                      accountMasked={`**** ${b.accountNumberLast4}`}
                      accountFull={revealed[b.id]}
                      revealed={Boolean(revealed[b.id])}
                      revealing={busyId === b.id}
                      onToggleReveal={() => void toggleReveal(b)}
                      onCopy={() => void copyBank(b)}
                      statusTone={active ? "success" : b.verified ? "info" : "pending"}
                      statusLabel={
                        active ? "Active" : b.verified ? "Verified" : "Pending verification"
                      }
                      note={!b.verified ? bankNote(b) : undefined}
                      onActivate={b.verified && !b.isActive ? () => requestActivate(b) : undefined}
                    />
                  </View>
                );
              })}
            </ScrollView>

            {activeHold ? (
              <View style={[styles.otpBox, { borderColor: "#FDBA74", backgroundColor: "#FFF7ED" }]}>
                <Text style={styles.otpHint}>{activeHold}</Text>
              </View>
            ) : null}

            {showBank ? (
              <View style={{ marginTop: 8 }}>
                <IfscBankDetailsFields
                  value={bankDetails}
                  onChange={(patch) => setBankDetails((prev) => ({ ...prev, ...patch }))}
                  tokens={tokens}
                  showHolder
                  showConfirmAccount
                />
                {hasActiveBank ? (
                  <View style={[styles.otpBox, { borderColor: "#FDBA74", backgroundColor: "#FFF7ED" }]}>
                    <Text style={styles.otpHint}>
                      Active bank change needs OTP after you confirm the bank details.
                    </Text>
                    {otpSent ? (
                      <>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              backgroundColor: tokens.card,
                              borderColor: tokens.cardBorder,
                              color: tokens.txt,
                              marginBottom: 8,
                            },
                          ]}
                          placeholder="6-digit OTP"
                          placeholderTextColor={tokens.mute}
                          keyboardType="number-pad"
                          maxLength={6}
                          value={otp}
                          onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                        />
                        <Pressable
                          style={[
                            styles.secondaryBtn,
                            { borderColor: colors.blueFlat, opacity: otpSending ? 0.6 : 1 },
                          ]}
                          onPress={() => void sendOtp()}
                          disabled={otpSending}
                        >
                          <Text style={{ color: colors.blueFlat, fontWeight: "800" }}>Resend OTP</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Text style={{ color: "#9A3412", fontSize: 12, marginTop: 6 }}>
                        Fill account, IFSC, and holder name, then tap Verify & send OTP.
                      </Text>
                    )}
                  </View>
                ) : null}
                <Text style={[styles.hint, { color: tokens.mute, marginTop: 4 }]}>
                  On submit we confirm this account with the bank and get the account holder name.{" "}
                  {prices
                    ? `${rupees(prices.standard)} per check, or ${rupees(prices.pennyDrop)} if the bank needs a ₹1 test credit`
                    : "A small fee per check"}{" "}
                  — debited from your main wallet only when the bank confirms. Same account checked within 90 days is free.
                </Text>
                {hasActiveBank && !otpSent ? (
                  <Pressable
                    style={[styles.submit, { opacity: otpSending ? 0.6 : 1 }]}
                    onPress={() => void sendOtp()}
                    disabled={otpSending}
                  >
                    <Text style={styles.submitText}>
                      {otpSending ? "Sending…" : "Verify & send OTP"}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.submit, { opacity: saving ? 0.6 : 1 }]}
                    onPress={() => void registerBank()}
                    disabled={saving}
                  >
                    <Text style={styles.submitText}>Submit for verification</Text>
                  </Pressable>
                )}
              </View>
            ) : null}

            <Text style={[styles.section, { color: tokens.txt, marginTop: 20 }]}>Withdraw</Text>
            {!hasActiveBank ? (
              <Text style={{ color: tokens.mute, fontSize: 13, marginBottom: 8 }}>
                Add and verify a settlement bank before requesting a withdrawal.
              </Text>
            ) : null}
            <TextInput
              style={[
                styles.input,
                { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt },
              ]}
              placeholder="Amount (₹)"
              placeholderTextColor={tokens.mute}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(v) => {
                idemRef.current = newIdemKey();
                setAmount(v);
              }}
            />
            <Pressable
              style={[styles.submit, { opacity: saving || !hasActiveBank ? 0.6 : 1 }]}
              onPress={() => void requestSettle()}
              disabled={saving || !hasActiveBank}
            >
              <Text style={styles.submitText}>Request settlement</Text>
            </Pressable>

            <Text style={[styles.section, { color: tokens.txt, marginTop: 20 }]}>History</Text>
            {requests.length === 0 ? (
              <Text style={{ color: tokens.sub }}>No settlement requests yet.</Text>
            ) : (
              requests.map((r) => (
                <View
                  key={r.requestId}
                  style={[styles.histCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
                >
                  <Text style={{ color: tokens.txt, fontWeight: "700" }}>{formatINR(r.amount)}</Text>
                  <StatusBadge tone={toneFromStatus(r.status)} style={{ marginTop: 6 }}>
                    {r.status.replace(/_/g, " ")}
                  </StatusBadge>
                  <Text style={{ color: tokens.mute, fontSize: 12, marginTop: 4 }}>
                    {r.mode.toUpperCase()} · {r.bankUtr || r.failureReason || "—"}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function BankCheckSummary({ holderName, result }: { holderName: string; result: BankCheckResult }) {
  const match = result.status === "verified" && result.bankName ? bankNameMatch(holderName, result.bankName) : null;
  if (result.status !== "verified") {
    const pending = result.status === "pending" || result.status === "error";
    return (
      <View
        style={[
          styles.checkBox,
          { backgroundColor: pending ? "#FFFBEB" : colors.dangerBg, borderColor: pending ? "#FCD34D" : colors.danger },
        ]}
      >
        <Text style={{ color: pending ? "#B45309" : colors.dangerDark, fontSize: 12, fontWeight: "700" }}>
          {result.status === "not_confirmed"
            ? `${NOT_CONFIRMED_COPY} You were not charged.`
            : result.status === "pending"
              ? "The bank is still confirming this account. Admin will re-check it — you were not charged."
              : "Bank check could not run right now. Admin will re-check it — you were not charged."}
        </Text>
      </View>
    );
  }
  const pill = match ? PILL[match.level] : null;
  return (
    <View style={[styles.checkBox, { backgroundColor: "#F7F9FF", borderColor: "#DCE5FF" }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: "#667085" }}>NAME AS PER BANK</Text>
        {match && pill ? (
          <Text style={[styles.pill, { backgroundColor: pill.bg, color: pill.fg }]}>{match.percent}%</Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 15, fontWeight: "800", color: colors.blue, marginTop: 4 }}>
        {result.bankName ?? "Bank did not return a name"}
      </Text>
      {match && pill ? (
        <Text style={[styles.matchCopy, { backgroundColor: pill.bg, color: pill.fg }]}>
          {BANK_NAME_MATCH_COPY[match.level]}
        </Text>
      ) : null}
      <Text style={{ fontSize: 11, color: "#667085", marginTop: 6 }}>
        {result.cached || Number(result.charged) === 0
          ? "Checked earlier — no charge."
          : `${rupees(result.charged)} debited from your wallet.`}{" "}
        Admin verifies the bank before you can withdraw.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  checkBox: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  pill: { fontSize: 11, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  matchCopy: { fontSize: 12, fontWeight: "700", padding: 8, borderRadius: 8, marginTop: 6, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontWeight: "700", fontSize: 15, width: 48 },
  title: { fontSize: 18, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 40 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  section: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 16 },
  histCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  otpBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  otpHint: { fontSize: 13, fontWeight: "600", color: "#C2410C", marginBottom: 8, lineHeight: 18 },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  submit: {
    marginTop: 8,
    backgroundColor: colors.blue,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
