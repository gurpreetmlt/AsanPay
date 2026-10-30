import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { formatINR } from "../../lib/format";
import { createAttemptKeyHolder } from "../../lib/idempotencyKey";
import { captureFingerprint } from "../../lib/rdServiceFingerprint";
import { useTxnPin } from "../../hooks/useTxnPin";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import { formatEarnEstimateLine, useEarnEstimate } from "../../hooks/useEarnEstimate";
import { useAuthStore } from "../../store/auth";
import { OnboardingPendingBanner } from "../../components/OnboardingPendingBanner";
import { NobleAgentOnboardModal } from "../shared/NobleAgentOnboardModal";
import { BankNameCheck } from "../../components/BankNameCheck";
import { DmtRailChips, useDmtRails } from "../../components/DmtRailChips";
import type { AepsGeoTag } from "../../lib/geoCapture";
import { LOCATION_REQUIRED_MESSAGE, requireTxnLocation } from "../../lib/txnLocation";

interface DmtScreenProps {
  onBack: () => void;
}

interface ProviderEnvelope<T> {
  success: boolean;
  status: string;
  message: string;
  data: T;
  providerTxnId?: string | null;
}

interface DmtBank {
  bankId: string | number;
  name: string;
  ifscAlias: string;
  ifscGlobal: string;
  neftEnabled: boolean;
  impsEnabled: boolean;
}

interface DmtBeneficiary {
  id: string;
  name: string;
  account: string;
  ifsc: string;
  bank: string;
  beneficiaryMobileNumber: string;
  verificationDt: string;
}

interface DmtRemitterProfile {
  registered: boolean;
  pidOptionWadh?: string;
  mobileNumber: string;
  firstName: string;
  lastName: string;
  city: string;
  pincode: string;
  limitPerTransaction: string;
  limitTotal: string;
  limitConsumed: string;
  limitAvailable: string;
  beneficiaries: DmtBeneficiary[];
  isTxnOtpRequired: boolean;
  isImpsAllowed: boolean;
  isNeftAllowed: boolean;
  referenceKey: string;
  validity: string;
}

type DmtTab = "Transfer" | "Beneficiaries" | "Refund";
type Mode = "imps" | "neft";
type RegStep = "aadhaar" | "otp" | "kyc" | null;

const TABS: DmtTab[] = ["Transfer", "Beneficiaries", "Refund"];
const REFUND_COMING_SOON = "DMT refund is coming soon";
const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

async function postProvider<T>(url: string, body: unknown): Promise<ProviderEnvelope<T>> {
  const { data } = await api.post<ApiResponse<ProviderEnvelope<T>>>(url, body);
  if (!data.success) throw new Error(data.message || "Request failed");
  if (!data.data?.success) throw new Error(data.data?.message || "Provider request failed");
  return data.data;
}

async function getProvider<T>(url: string): Promise<ProviderEnvelope<T>> {
  const { data } = await api.get<ApiResponse<ProviderEnvelope<T>>>(url);
  if (!data.success) throw new Error(data.message || "Request failed");
  if (!data.data?.success) throw new Error(data.data?.message || "Provider request failed");
  return data.data;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  editable,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad" | "numeric";
  autoCapitalize?: "none" | "characters";
  editable?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
    </View>
  );
}

export function DmtScreen({ onBack }: DmtScreenProps) {
  const { tokens } = useTheme();
  const { promptPin, TxnPinPrompt } = useTxnPin();
  const attemptKey = useRef(createAttemptKeyHolder("dmt-mobile"));

  const [tab, setTab] = useState<DmtTab>("Transfer");
  // Skipped onboarding: no 2FA gate (provider 2FA needs the agent id); sending money opens the form.
  const onboardingPending = useAuthStore((s) => Boolean(s.user?.aepsOnboardingRequired));
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [agentAuthReady, setAgentAuthReady] = useState<boolean | null>(null);
  const [agentAuthKycReady, setAgentAuthKycReady] = useState(true);
  const [agentAadhaar, setAgentAadhaar] = useState("");
  /** Last 4 of the signup KYC Aadhaar — the server fills the full number for daily 2FA. */
  const [agentAadhaarLastFour, setAgentAadhaarLastFour] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [mobile, setMobile] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [profile, setProfile] = useState<DmtRemitterProfile | null>(null);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [regStep, setRegStep] = useState<RegStep>(null);
  const [regReferenceKey, setRegReferenceKey] = useState("");
  const [regAadhaar, setRegAadhaar] = useState("");
  const [regOtp, setRegOtp] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regKycWadh, setRegKycWadh] = useState("");
  const dmtRails = useDmtRails();
  const rail = dmtRails.selected || "airtel";

  const [banks, setBanks] = useState<DmtBank[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<DmtBank | null>(null);

  const [selectedBene, setSelectedBene] = useState<DmtBeneficiary | null>(null);
  const [showAddBene, setShowAddBene] = useState(false);
  const [beneName, setBeneName] = useState("");
  const [beneAccount, setBeneAccount] = useState("");
  const [beneIfsc, setBeneIfsc] = useState("");
  const [beneMobile, setBeneMobile] = useState("");
  const [beneOtp, setBeneOtp] = useState("");
  const [pendingBeneId, setPendingBeneId] = useState("");
  const [pendingBeneKey, setPendingBeneKey] = useState("");
  const [beneBusy, setBeneBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DmtBeneficiary | null>(null);
  const [deleteOtp, setDeleteOtp] = useState("");
  const [deleteKey, setDeleteKey] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const earnEstimate = useEarnEstimate("dmt", amount);
  const earnLine = formatEarnEstimateLine(earnEstimate);
  const [mode, setMode] = useState<Mode>("imps");
  const [txnOtp, setTxnOtp] = useState("");
  const [txnRefKey, setTxnRefKey] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [txnBusy, setTxnBusy] = useState(false);
  const [lastTxnRef, setLastTxnRef] = useState<string | null>(null);

  const [refundIpayId, setRefundIpayId] = useState("");
  const [refundOtp, setRefundOtp] = useState("");
  const [refundKey, setRefundKey] = useState("");
  const [refundOtpSent, setRefundOtpSent] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);

  const filteredBanks = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    if (!q) return banks.slice(0, 30);
    return banks
      .filter((b) => b.name.toLowerCase().includes(q) || String(b.bankId).includes(q))
      .slice(0, 30);
  }, [banks, bankSearch]);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<ApiResponse<{ verifiedToday: boolean; kycReady: boolean; aadhaarLastFour?: string | null }>>(
        "/auth/agent-auth/status",
      )
      .then(({ data }) => {
        if (cancelled) return;
        if (data.success) {
          setAgentAuthReady(Boolean(data.data.verifiedToday));
          setAgentAuthKycReady(data.data.kycReady !== false);
          const last4 = String(data.data.aadhaarLastFour ?? "")
            .replace(/\D/g, "")
            .slice(-4);
          setAgentAadhaarLastFour(last4.length === 4 ? last4 : null);
        } else {
          setAgentAuthReady(false);
        }
      })
      .catch(() => {
        if (!cancelled) setAgentAuthReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (agentAuthReady !== true && !onboardingPending) return;
    let cancelled = false;
    void getProvider<{ banks: DmtBank[] }>("/txn/dmt/banks")
      .then((res) => {
        if (!cancelled) setBanks(res.data.banks ?? []);
      })
      .catch(() => {
        /* banks optional until add-beneficiary */
      });
    return () => {
      cancelled = true;
    };
  }, [agentAuthReady, onboardingPending]);

  async function verifyDailyAuth() {
    if (!agentAuthKycReady) {
      showAlert("KYC pending", "Complete retailer KYC Aadhaar before DMT access.");
      return;
    }
    const typedAadhaar = agentAadhaar.replace(/\D/g, "");
    if (!agentAadhaarLastFour && typedAadhaar.length !== 12) {
      showAlert("Aadhaar required", "Enter retailer 12-digit Aadhaar.");
      return;
    }
    setAuthBusy(true);
    try {
      const biometricPayload = await captureFingerprint();
      const { data } = await api.post<ApiResponse<{ verifiedAt: string }>>(
        "/auth/agent-auth",
        agentAadhaarLastFour ? { biometricPayload } : { aadhaarNumber: typedAadhaar, biometricPayload },
      );
      if (!data.success) throw new Error(data.message);
      setAgentAuthReady(true);
      showAlert("Verification complete", "Money Transfer unlocked for today.");
    } catch (err) {
      showAlert("Verification failed", apiError(err, "Fingerprint verification failed"));
    } finally {
      setAuthBusy(false);
    }
  }

  const resetRemitterSession = useCallback(() => {
    setProfile(null);
    setNeedsRegister(false);
    setRegReferenceKey("");
    setRegStep(null);
    setRegAadhaar("");
    setRegOtp("");
    setSelectedBene(null);
    setAmount("");
    setTxnOtp("");
    setTxnRefKey("");
    setOtpSent(false);
    setLastTxnRef(null);
    setShowAddBene(false);
    setPendingBeneId("");
    setPendingBeneKey("");
    setBeneOtp("");
    attemptKey.current.clear();
  }, []);

  // Remitters, OTPs and limits belong to one bank: switching the chip starts a fresh search.
  useEffect(() => {
    resetRemitterSession();
  }, [rail, resetRemitterSession]);

  async function lookupRemitter() {
    const m = mobile.replace(/\D/g, "");
    if (m.length !== 10) {
      showAlert("Invalid mobile", "Enter a valid 10-digit remitter mobile.");
      return;
    }
    setLookingUp(true);
    resetRemitterSession();
    try {
      const res = await postProvider<{
        profile: DmtRemitterProfile | null;
        referenceKey?: string;
        validity?: string;
      }>("/txn/dmt/remitter/profile", { customerMobile: m, rail });

      if (res.data.profile) {
        setProfile(res.data.profile);
        setNeedsRegister(false);
        showAlert(
          "Remitter found",
          `${res.data.profile.firstName} ${res.data.profile.lastName}`.trim() || m,
        );
      } else {
        setNeedsRegister(true);
        setRegReferenceKey(res.data.referenceKey || "");
        setRegStep("aadhaar");
        showAlert("Registration required", "Remitter is not registered. Complete registration OTP.");
      }
    } catch (err) {
      showAlert("Lookup failed", apiError(err, "Remitter lookup failed"));
    } finally {
      setLookingUp(false);
    }
  }

  async function refreshProfile() {
    const m = mobile.replace(/\D/g, "");
    if (m.length !== 10) return;
    try {
      const res = await postProvider<{ profile: DmtRemitterProfile | null }>("/txn/dmt/remitter/profile", {
        customerMobile: m,
        rail,
      });
      if (res.data.profile) {
        setProfile(res.data.profile);
        setNeedsRegister(false);
        setRegStep(null);
      }
    } catch {
      /* silent */
    }
  }

  async function startRegistration() {
    const m = mobile.replace(/\D/g, "");
    const aadhaar = regAadhaar.replace(/\D/g, "");
    if (!regReferenceKey) {
      showAlert("Missing reference", "Search remitter again to get a registration key.");
      return;
    }
    if (aadhaar.length !== 12) {
      showAlert("Aadhaar required", "Enter remitter 12-digit Aadhaar.");
      return;
    }
    setRegBusy(true);
    try {
      await postProvider("/txn/dmt/remitter/register", {
        rail,
        customerMobile: m,
        aadhaarNumber: aadhaar,
        referenceKey: regReferenceKey,
      });
      setRegStep("otp");
      showAlert("OTP sent", "Enter the OTP sent to remitter mobile.");
    } catch (err) {
      showAlert("Registration failed", apiError(err, "Could not start remitter registration"));
    } finally {
      setRegBusy(false);
    }
  }

  async function verifyRegistration() {
    const m = mobile.replace(/\D/g, "");
    if (!/^\d{4,8}$/.test(regOtp)) {
      showAlert("Invalid OTP", "Enter the OTP from remitter mobile.");
      return;
    }
    setRegBusy(true);
    try {
      const res = await postProvider<{ referenceId?: string; pidOptionWadh?: string }>(
        "/txn/dmt/remitter/register/verify",
        {
          rail,
          customerMobile: m,
          otp: regOtp,
          referenceKey: regReferenceKey,
        },
      );
      setRegKycWadh(res.data?.pidOptionWadh?.trim() ?? "");
      setRegStep("kyc");
      showAlert("Registered", "Complete remitter eKYC, or skip for later.");
    } catch (err) {
      showAlert("OTP failed", apiError(err, "OTP verification failed"));
    } finally {
      setRegBusy(false);
    }
  }

  async function submitRemitterKyc() {
    const m = mobile.replace(/\D/g, "");
    setRegBusy(true);
    try {
      const wadh = regKycWadh || profile?.pidOptionWadh?.trim() || "";
      const biometricPayload = await captureFingerprint(undefined, wadh ? { wadh } : undefined);
      await postProvider("/txn/dmt/remitter/kyc", {
        rail,
        customerMobile: m,
        referenceKey: regReferenceKey,
        biometricPayload,
        captureType: "FINGER",
      });
      showAlert("eKYC done", "Remitter eKYC completed.");
      await refreshProfile();
    } catch (err) {
      showAlert("eKYC failed", apiError(err, "Remitter eKYC failed"));
    } finally {
      setRegBusy(false);
    }
  }

  async function skipKycForNow() {
    setNeedsRegister(false);
    setRegStep(null);
    await refreshProfile();
  }

  async function addBeneficiary() {
    const m = mobile.replace(/\D/g, "");
    if (!beneName.trim() || beneAccount.length < 6 || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(beneIfsc)) {
      showAlert(
        "Invalid beneficiary",
        "Enter a valid name, account number, and IFSC (e.g. SBIN0001234).",
      );
      return;
    }
    setBeneBusy(true);
    try {
      const res = await postProvider<{
        beneficiaryId: string;
        referenceKey: string;
        validity: string;
      }>("/txn/dmt/beneficiary", {
        rail,
        customerMobile: m,
        name: beneName.trim(),
        accountNumber: beneAccount,
        ifsc: beneIfsc.toUpperCase(),
        beneficiaryMobile: beneMobile.replace(/\D/g, "") || undefined,
        bankId: selectedBank ? String(selectedBank.bankId) : undefined,
      });
      if (!res.data.referenceKey) {
        showAlert("Beneficiary added", "Beneficiary added successfully.");
        setShowAddBene(false);
        setBeneName("");
        setBeneAccount("");
        setBeneIfsc("");
        setBeneMobile("");
        setSelectedBank(null);
        await refreshProfile();
        return;
      }
      setPendingBeneId(res.data.beneficiaryId);
      setPendingBeneKey(res.data.referenceKey);
      showAlert("OTP sent", "Enter the OTP sent to remitter to verify beneficiary.");
    } catch (err) {
      showAlert("Add failed", apiError(err, "Could not add beneficiary"));
    } finally {
      setBeneBusy(false);
    }
  }

  async function verifyBeneficiary() {
    const m = mobile.replace(/\D/g, "");
    if (!pendingBeneId || !pendingBeneKey || !/^\d{4,8}$/.test(beneOtp)) {
      showAlert("OTP required", "Enter the OTP to verify beneficiary.");
      return;
    }
    setBeneBusy(true);
    try {
      await postProvider("/txn/dmt/beneficiary/verify", {
        rail,
        customerMobile: m,
        otp: beneOtp,
        beneficiaryId: pendingBeneId,
        referenceKey: pendingBeneKey,
      });
      showAlert("Beneficiary added", "Beneficiary verified successfully.");
      setShowAddBene(false);
      setBeneName("");
      setBeneAccount("");
      setBeneIfsc("");
      setBeneMobile("");
      setBeneOtp("");
      setPendingBeneId("");
      setPendingBeneKey("");
      setSelectedBank(null);
      await refreshProfile();
    } catch (err) {
      showAlert("Verify failed", apiError(err, "Beneficiary verification failed"));
    } finally {
      setBeneBusy(false);
    }
  }

  async function startDeleteBeneficiary(b: DmtBeneficiary) {
    const m = mobile.replace(/\D/g, "");
    setDeleteBusy(true);
    setDeleteTarget(b);
    setDeleteOtp("");
    setDeleteKey("");
    try {
      const res = await postProvider<{
        beneficiaryId: string;
        referenceKey: string;
      }>("/txn/dmt/beneficiary/delete", {
        rail,
        customerMobile: m,
        beneficiaryId: b.id,
      });
      if (!res.data.referenceKey) {
        showAlert("Deleted", "Beneficiary removed.");
        if (selectedBene?.id === b.id) setSelectedBene(null);
        setDeleteTarget(null);
        await refreshProfile();
        return;
      }
      setDeleteKey(res.data.referenceKey);
      showAlert("OTP sent", "Enter remitter OTP to confirm delete.");
    } catch (err) {
      setDeleteTarget(null);
      showAlert("Delete failed", apiError(err, "Could not start delete"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmDeleteBeneficiary() {
    const m = mobile.replace(/\D/g, "");
    if (!deleteTarget || !deleteKey || !/^\d{4,8}$/.test(deleteOtp)) {
      showAlert("OTP required", "Enter OTP to confirm delete.");
      return;
    }
    setDeleteBusy(true);
    try {
      await postProvider("/txn/dmt/beneficiary/delete/verify", {
        rail,
        customerMobile: m,
        otp: deleteOtp,
        beneficiaryId: deleteTarget.id,
        referenceKey: deleteKey,
      });
      showAlert("Deleted", "Beneficiary removed.");
      if (selectedBene?.id === deleteTarget.id) setSelectedBene(null);
      setDeleteTarget(null);
      setDeleteOtp("");
      setDeleteKey("");
      await refreshProfile();
    } catch (err) {
      showAlert("Delete failed", apiError(err, "Delete verification failed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function sendTransferOtp() {
    if (onboardingPending) {
      setOnboardOpen(true);
      return;
    }
    const m = mobile.replace(/\D/g, "");
    if (!profile?.referenceKey) {
      showAlert("Refresh profile", "Look up remitter again to get a fresh profile key.");
      return;
    }
    if (!selectedBene) {
      showAlert("Select beneficiary", "Choose a beneficiary before sending OTP.");
      return;
    }
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt < 100 || amt > 5000) {
      showAlert("Invalid amount", "Amount must be whole rupees between ₹100 and ₹5,000 per transfer.");
      return;
    }
    setTxnBusy(true);
    try {
      const res = await postProvider<{ referenceKey: string }>("/txn/dmt/transfer/otp", {
        rail,
        customerMobile: m,
        amount: String(amt),
        referenceKey: profile.referenceKey,
      });
      setTxnRefKey(res.data.referenceKey);
      setOtpSent(true);
      showAlert("OTP sent", "Transfer OTP sent to remitter mobile.");
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Could not send transfer OTP"));
    } finally {
      setTxnBusy(false);
    }
  }

  async function submitTransfer() {
    const m = mobile.replace(/\D/g, "");
    if (!selectedBene || !txnRefKey) {
      showAlert("Send OTP first", "Request transfer OTP before submitting.");
      return;
    }
    if (!/^\d{4,8}$/.test(txnOtp)) {
      showAlert("Invalid OTP", "Enter remitter OTP.");
      return;
    }
    setTxnBusy(true);
    let geo: AepsGeoTag;
    try {
      geo = await requireTxnLocation();
    } catch (err) {
      setTxnBusy(false);
      showAlert("Location required", err instanceof Error ? err.message : LOCATION_REQUIRED_MESSAGE);
      return;
    }
    try {
      const txnAuth = await promptPin();
      const body: Record<string, unknown> = {
        rail,
        customerMobile: m,
        accountNumber: selectedBene.account,
        ifsc: selectedBene.ifsc,
        amount: String(Number(amount)),
        mode,
        otp: txnOtp,
        referenceKey: txnRefKey,
        beneficiaryId: selectedBene.id,
        idempotencyKey: attemptKey.current.get(),
        latitude: geo.latitude,
        longitude: geo.longitude,
      };
      if (txnAuth) body.txnAuth = txnAuth;

      const { data } = await api.post<
        ApiResponse<{ txn?: { txnRef?: string }; provider?: ProviderEnvelope<Record<string, unknown>> }>
      >("/txn/dmt/transfer", body);
      if (!data.success) throw new Error(data.message || "Transfer failed");
      const txnRef = data.data?.txn?.txnRef ?? null;
      const receiptEarn = earnLine;
      setLastTxnRef(txnRef);
      attemptKey.current.clear();
      setOtpSent(false);
      setTxnOtp("");
      setTxnRefKey("");
      setAmount("");
      showAlert(
        "Transfer submitted",
        (txnRef ? `Reference ${txnRef}` : "Transfer submitted.") +
          (receiptEarn ? `\n${receiptEarn}` : ""),
      );
      await refreshProfile();
    } catch (err) {
      if (err) showAlert("Transfer failed", apiError(err, "Could not complete transfer"));
    } finally {
      setTxnBusy(false);
    }
  }

  async function sendRefundOtp() {
    if (refundIpayId.trim().length < 6) {
      showAlert("Order ID required", "Enter the provider order ID of the pending transfer.");
      return;
    }
    setRefundBusy(true);
    try {
      const res = await postProvider<{ referenceKey: string }>("/txn/dmt/refund/otp", {
        ipayId: refundIpayId.trim(),
      });
      setRefundKey(res.data.referenceKey);
      setRefundOtpSent(true);
      showAlert("OTP sent", "Refund OTP sent to remitter.");
    } catch (err) {
      showAlert("Refund OTP failed", apiError(err, "Could not send refund OTP"));
    } finally {
      setRefundBusy(false);
    }
  }

  async function submitRefund() {
    if (!refundKey || !/^\d{4,8}$/.test(refundOtp)) {
      showAlert("OTP required", "Enter refund OTP.");
      return;
    }
    setRefundBusy(true);
    try {
      await postProvider("/txn/dmt/refund", {
        ipayId: refundIpayId.trim(),
        referenceKey: refundKey,
        otp: refundOtp,
      });
      showAlert("Refund authorised", "Recheck the transaction for balance credit.");
      setRefundOtpSent(false);
      setRefundOtp("");
      setRefundKey("");
    } catch (err) {
      showAlert("Refund failed", apiError(err, "Could not complete refund"));
    } finally {
      setRefundBusy(false);
    }
  }

  const remitterLabel = profile
    ? `${profile.firstName} ${profile.lastName}`.trim() || profile.mobileNumber
    : "";
  const beneficiaries = profile?.beneficiaries ?? [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
      <LinearGradient
        colors={[colors.blueLight, colors.blue]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={styles.header}
      >
        <Pressable onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={18} color="#fff" strokeWidth={2.5} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Money Transfer</Text>
          <Text style={styles.headerSub}>Domestic DMT · provider via backend rail</Text>
        </View>
        {profile ? (
          <Pressable onPress={() => void refreshProfile()} style={styles.headerIconBtn}>
            <RefreshCw size={16} color="#fff" strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {onboardingPending ? <OnboardingPendingBanner onComplete={() => setOnboardOpen(true)} /> : null}
        {agentAuthReady === null && !onboardingPending ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.blueFlat} />
            <Text style={[styles.muted, { color: tokens.mute }]}>Checking DMT verification for today…</Text>
          </View>
        ) : agentAuthReady !== true && !onboardingPending ? (
          <View style={[styles.heroCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <View style={styles.heroIconWrap}>
              <ShieldCheck size={24} color={colors.blueLight} strokeWidth={2.2} />
            </View>
            <Text style={[styles.heroTitle, { color: tokens.txt }]}>Daily retailer verification</Text>
            <Text style={[styles.heroSub, { color: tokens.sub }]}>
              Verify once daily with Aadhaar and fingerprint before money transfer (same as AePS /
              Nepal).
            </Text>
            <Field
              label="RETAILER AADHAAR"
              value={agentAadhaarLastFour ? `XXXX XXXX ${agentAadhaarLastFour}` : agentAadhaar}
              onChangeText={(v) => setAgentAadhaar(v.replace(/\D/g, "").slice(0, 12))}
              placeholder={agentAuthKycReady ? "12-digit Aadhaar" : "KYC Aadhaar not found"}
              keyboardType="number-pad"
              editable={!agentAadhaarLastFour}
            />
            <Pressable onPress={() => void verifyDailyAuth()} disabled={authBusy} style={styles.primaryBtn}>
              {authBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify now</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            <DmtRailChips rails={dmtRails.rails} selected={dmtRails.selected} onSelect={dmtRails.setSelected} />
            <View style={styles.tabRow}>
              {TABS.map((item) => {
                const active = item === tab;
                return (
                  <Pressable
                    key={item}
                    onPress={() =>
                      item === "Refund" ? showAlert("Coming soon", REFUND_COMING_SOON) : setTab(item)
                    }
                    style={[styles.tabBtn, active && styles.tabBtnActive]}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{item}</Text>
                    {item === "Refund" ? <Text style={styles.soonText}>Coming soon</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Remitter mobile</Text>
              <View style={styles.lookupRow}>
                <TextInput
                  value={mobile}
                  onChangeText={(v) => setMobile(v.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile"
                  keyboardType="number-pad"
                  placeholderTextColor="#94A3B8"
                  style={[styles.lookupInput, { color: tokens.txt2, borderColor: tokens.inputBorder }]}
                />
                <Pressable onPress={() => void lookupRemitter()} disabled={lookingUp} style={styles.lookupBtn}>
                  {lookingUp ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.lookupBtnText}>Lookup</Text>
                  )}
                </Pressable>
              </View>
              {profile ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={[styles.benefName, { color: tokens.txt2 }]}>{remitterLabel}</Text>
                  <Text style={[styles.muted, { color: tokens.mute }]}>
                    Limit left ₹{profile.limitAvailable || "—"} · Per txn ₹
                    {profile.limitPerTransaction || "—"}
                  </Text>
                </View>
              ) : null}
            </View>

            {needsRegister && regStep ? (
              <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Remitter registration</Text>
                {regStep === "aadhaar" ? (
                  <>
                    <Field
                      label="REMITTER AADHAAR"
                      value={regAadhaar}
                      onChangeText={(v) => setRegAadhaar(v.replace(/\D/g, "").slice(0, 12))}
                      placeholder="12-digit Aadhaar"
                      keyboardType="number-pad"
                    />
                    <Pressable onPress={() => void startRegistration()} disabled={regBusy} style={styles.primaryBtn}>
                      {regBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send OTP</Text>}
                    </Pressable>
                  </>
                ) : null}
                {regStep === "otp" ? (
                  <>
                    <Field
                      label="OTP"
                      value={regOtp}
                      onChangeText={(v) => setRegOtp(v.replace(/\D/g, "").slice(0, 8))}
                      placeholder="OTP from remitter SMS"
                      keyboardType="number-pad"
                    />
                    <Pressable onPress={() => void verifyRegistration()} disabled={regBusy} style={styles.primaryBtn}>
                      {regBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify OTP</Text>}
                    </Pressable>
                  </>
                ) : null}
                {regStep === "kyc" ? (
                  <>
                    <Text style={[styles.muted, { color: tokens.sub, marginBottom: 10 }]}>
                  Capture remitter fingerprint for eKYC when the active provider requires it,
                  or skip for later if the rail allows.
                </Text>
                    <Pressable onPress={() => void submitRemitterKyc()} disabled={regBusy} style={styles.primaryBtn}>
                      {regBusy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Capture fingerprint eKYC</Text>
                      )}
                    </Pressable>
                    <Pressable onPress={() => void skipKycForNow()} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>Skip eKYC for now</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}

            {tab === "Transfer" && profile ? (
              <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Transfer</Text>
                {beneficiaries.length === 0 ? (
                  <Text style={[styles.muted, { color: tokens.mute }]}>
                    No beneficiaries yet. Add one on the Beneficiaries tab.
                  </Text>
                ) : (
                  beneficiaries.map((b) => {
                    const active = selectedBene?.id === b.id;
                    return (
                      <Pressable
                        key={b.id}
                        onPress={() => {
                          setSelectedBene(b);
                          attemptKey.current.clear();
                          setOtpSent(false);
                          setTxnOtp("");
                          setTxnRefKey("");
                        }}
                        style={[
                          styles.benefRow,
                          {
                            borderColor: active ? colors.blue : tokens.cardBorder,
                            backgroundColor: active ? colors.bluePale : tokens.bg,
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.benefName, { color: tokens.txt2 }]}>{b.name}</Text>
                          <Text style={[styles.muted, { color: tokens.mute }]}>
                            {b.ifsc} · •••• {b.account.slice(-4)}
                          </Text>
                        </View>
                        {active ? <CheckCircle2 size={18} color={colors.greenDark} /> : null}
                      </Pressable>
                    );
                  })
                )}

                <Text style={[styles.label, { marginTop: 8 }]}>AMOUNT (₹100 – ₹5,000)</Text>
                <TextInput
                  value={amount}
                  onChangeText={(t) => {
                    setAmount(t.replace(/[^\d.]/g, ""));
                    attemptKey.current.clear();
                    setOtpSent(false);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  style={[styles.input, { color: tokens.txt2 }]}
                />
                <View style={styles.quickRow}>
                  {QUICK_AMOUNTS.map((q) => (
                    <Pressable
                      key={q}
                      onPress={() => {
                        setAmount(String(q));
                        attemptKey.current.clear();
                        setOtpSent(false);
                      }}
                      style={styles.quickChip}
                    >
                      <Text style={styles.quickChipText}>₹{q}</Text>
                    </Pressable>
                  ))}
                </View>
                {earnLine ? (
                  <Text style={{ color: colors.greenDark, fontSize: 12, fontWeight: "700", marginTop: 8 }}>
                    {earnLine}
                  </Text>
                ) : null}

                <Text style={[styles.label, { marginTop: 10 }]}>MODE</Text>
                <View style={styles.modeRow}>
                  {(["imps", "neft"] as Mode[]).map((m) => {
                    const allowed =
                      m === "imps" ? profile.isImpsAllowed !== false : profile.isNeftAllowed !== false;
                    const active = mode === m;
                    return (
                      <Pressable
                        key={m}
                        disabled={!allowed}
                        onPress={() => setMode(m)}
                        style={[
                          styles.modeChip,
                          {
                            opacity: allowed ? 1 : 0.4,
                            borderColor: active ? colors.blue : tokens.cardBorder,
                            backgroundColor: active ? colors.blue : tokens.bg,
                          },
                        ]}
                      >
                        <Text style={{ color: active ? "#fff" : tokens.txt2, fontWeight: "700" }}>
                          {m.toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {!otpSent ? (
                  <Pressable
                    onPress={() => void sendTransferOtp()}
                    disabled={txnBusy || !selectedBene}
                    style={[styles.primaryBtn, (!selectedBene || txnBusy) && styles.primaryBtnDisabled]}
                  >
                    {txnBusy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Send transfer OTP</Text>
                    )}
                  </Pressable>
                ) : (
                  <>
                    <Field
                      label="REMITTER OTP"
                      value={txnOtp}
                      onChangeText={(v) => setTxnOtp(v.replace(/\D/g, "").slice(0, 8))}
                      placeholder="OTP from SMS"
                      keyboardType="number-pad"
                    />
                    <Pressable
                      onPress={() => void submitTransfer()}
                      disabled={txnBusy}
                      style={[styles.primaryBtn, txnBusy && styles.primaryBtnDisabled]}
                    >
                      {txnBusy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>
                          Send {amount ? formatINR(amount) : ""}
                        </Text>
                      )}
                    </Pressable>
                  </>
                )}

                {lastTxnRef ? (
                  <Text style={[styles.muted, { color: colors.greenDark, marginTop: 10 }]}>
                    Last ref: {lastTxnRef}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {tab === "Beneficiaries" && profile ? (
              <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Beneficiaries</Text>
                  <Pressable onPress={() => setShowAddBene((v) => !v)} style={styles.iconBtn}>
                    <UserPlus size={18} color={colors.blueFlat} />
                  </Pressable>
                </View>

                {beneficiaries.map((b) => (
                  <View
                    key={b.id}
                    style={[styles.benefRow, { borderColor: tokens.cardBorder, backgroundColor: tokens.bg }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.benefName, { color: tokens.txt2 }]}>{b.name}</Text>
                      <Text style={[styles.muted, { color: tokens.mute }]}>
                        {b.bank || b.ifsc} · {b.account}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        showAlert(
                          "Delete beneficiary?",
                          `Remove ${b.name || "this beneficiary"} (${b.account} · ${b.ifsc}) from this remitter?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => void startDeleteBeneficiary(b),
                            },
                          ],
                        )
                      }
                      disabled={deleteBusy}
                      style={styles.iconBtn}
                    >
                      <Trash2 size={16} color="#b91c1c" />
                    </Pressable>
                  </View>
                ))}

                {deleteTarget && deleteKey ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.muted, { color: tokens.sub }]}>
                      Confirm delete {deleteTarget.name}
                    </Text>
                    <Field
                      label="DELETE OTP"
                      value={deleteOtp}
                      onChangeText={(v) => setDeleteOtp(v.replace(/\D/g, "").slice(0, 8))}
                      placeholder="OTP"
                      keyboardType="number-pad"
                    />
                    <Pressable
                      onPress={() => void confirmDeleteBeneficiary()}
                      disabled={deleteBusy}
                      style={styles.primaryBtn}
                    >
                      {deleteBusy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Confirm delete</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}

                {showAddBene ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Add beneficiary</Text>
                    <Field
                      label="NAME"
                      value={beneName}
                      onChangeText={setBeneName}
                      placeholder="Account holder name"
                    />
                    <Field
                      label="ACCOUNT NUMBER"
                      value={beneAccount}
                      onChangeText={(v) => setBeneAccount(v.replace(/\D/g, ""))}
                      placeholder="Bank account"
                      keyboardType="number-pad"
                    />
                    <Field
                      label="IFSC"
                      value={beneIfsc}
                      onChangeText={(v) => setBeneIfsc(v.toUpperCase())}
                      placeholder="SBIN0001234"
                      autoCapitalize="characters"
                    />
                    <BankNameCheck
                      accountNumber={beneAccount}
                      ifsc={beneIfsc}
                      typedName={beneName}
                      onUseBankName={setBeneName}
                    />
                    <Field
                      label="BENEFICIARY MOBILE (optional)"
                      value={beneMobile}
                      onChangeText={(v) => setBeneMobile(v.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit mobile"
                      keyboardType="number-pad"
                    />
                    <Field
                      label="BANK SEARCH (optional)"
                      value={bankSearch}
                      onChangeText={setBankSearch}
                      placeholder="Filter bank list"
                    />
                    {filteredBanks.slice(0, 8).map((b) => {
                      const active = selectedBank?.bankId === b.bankId;
                      return (
                        <Pressable
                          key={String(b.bankId)}
                          onPress={() => {
                            setSelectedBank(b);
                            if (b.ifscGlobal && !beneIfsc) setBeneIfsc(b.ifscGlobal.toUpperCase());
                          }}
                          style={[
                            styles.bankChip,
                            {
                              borderColor: active ? colors.blue : tokens.cardBorder,
                              backgroundColor: active ? colors.bluePale : tokens.bg,
                            },
                          ]}
                        >
                          <Text style={{ color: tokens.txt2, fontSize: 12, fontWeight: "600" }}>{b.name}</Text>
                        </Pressable>
                      );
                    })}

                    {!pendingBeneId ? (
                      <Pressable onPress={() => void addBeneficiary()} disabled={beneBusy} style={styles.primaryBtn}>
                        {beneBusy ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.primaryBtnText}>Add & send OTP</Text>
                        )}
                      </Pressable>
                    ) : (
                      <>
                        <Field
                          label="VERIFY OTP"
                          value={beneOtp}
                          onChangeText={(v) => setBeneOtp(v.replace(/\D/g, "").slice(0, 8))}
                          placeholder="OTP from remitter"
                          keyboardType="number-pad"
                        />
                        <Pressable
                          onPress={() => void verifyBeneficiary()}
                          disabled={beneBusy}
                          style={styles.primaryBtn}
                        >
                          {beneBusy ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={styles.primaryBtnText}>Verify beneficiary</Text>
                          )}
                        </Pressable>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}

            {tab === "Refund" ? (
              <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Refund</Text>
                <Text style={[styles.muted, { color: tokens.sub, marginBottom: 10 }]}>
                  Use the provider order id (ipayId / equivalent) from a failed or pending DMT.
                  OTP is sent to the remitter when the rail supports it.
                </Text>
                <Field
                  label="IPAY ID"
                  value={refundIpayId}
                  onChangeText={setRefundIpayId}
                  placeholder="Provider order ID"
                />
                {!refundOtpSent ? (
                  <Pressable onPress={() => void sendRefundOtp()} disabled={refundBusy} style={styles.primaryBtn}>
                    {refundBusy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Send refund OTP</Text>
                    )}
                  </Pressable>
                ) : (
                  <>
                    <Field
                      label="REFUND OTP"
                      value={refundOtp}
                      onChangeText={(v) => setRefundOtp(v.replace(/\D/g, "").slice(0, 8))}
                      placeholder="OTP"
                      keyboardType="number-pad"
                    />
                    <Pressable onPress={() => void submitRefund()} disabled={refundBusy} style={styles.primaryBtn}>
                      {refundBusy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Authorise refund</Text>
                      )}
                    </Pressable>
                  </>
                )}
              </View>
            ) : null}

            {tab === "Transfer" && !profile && !needsRegister ? (
              <Text style={[styles.muted, { color: tokens.mute, textAlign: "center", marginTop: 12 }]}>
                Lookup a remitter mobile to start transfer.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
      <TxnPinPrompt />
      <NobleAgentOnboardModal visible={onboardOpen} onClose={() => setOnboardOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontWeight: "700", fontSize: 18, color: "#fff" },
  headerSub: { fontSize: 12, color: "#B9C6F2", fontWeight: "500", marginTop: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centerBox: { alignItems: "center", gap: 12, paddingVertical: 40 },
  heroCard: { borderWidth: 1, borderRadius: 18, padding: 16 },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.bluePale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroTitle: { fontSize: 18, fontWeight: "800" },
  heroSub: { fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 12 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tabBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#E8EEF9",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: { backgroundColor: colors.blue },
  tabText: { fontSize: 12.5, fontWeight: "700", color: "#475569" },
  tabTextActive: { color: "#fff" },
  soonText: { fontSize: 9, fontWeight: "800", color: "#B45309", marginTop: 1 },
  infoCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  infoTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10 },
  label: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#64748B",
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: "#D6DEEB",
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "600",
    backgroundColor: "#fff",
    color: "#0F172A",
  },
  lookupRow: { flexDirection: "row", gap: 8 },
  lookupInput: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "600",
    backgroundColor: "#fff",
  },
  lookupBtn: {
    minWidth: 88,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  lookupBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  primaryBtn: {
    marginTop: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    marginTop: 8,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#B9C6F2",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: colors.blueFlat, fontWeight: "700", fontSize: 14 },
  benefRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  benefName: { fontWeight: "700", fontSize: 14.5 },
  muted: { fontSize: 12.5, fontWeight: "500", marginTop: 2 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  modeChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 4 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.bluePale,
  },
  quickChipText: { color: colors.blueFlat, fontWeight: "700", fontSize: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(11,42,154,0.12)",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  bankChip: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6 },
});
