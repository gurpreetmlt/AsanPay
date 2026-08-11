"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Banknote,
  Check,
  ChevronRight,
  CircleDot,
  Eye,
  EyeOff,
  Fingerprint,
  Plus,
  ScanEye,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { B } from "@/lib/brand";
import api from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import type { ApiResponse } from "@asanpay/shared-types";
import { extractApiError } from "@/lib/onboarding";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import {
  captureFingerprintWeb,
  formatRdDeviceLabel,
  warmRdService,
  type RdEndpoint,
} from "@/lib/rdServiceFingerprint";

/* ── Types ─────────────────────────────────────────────────────────── */

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

interface ProviderEnvelope<T> {
  success: boolean;
  status: string;
  message: string;
  data: T;
  providerTxnId?: string | null;
}

type DmtTab = "Transfer" | "Beneficiaries" | "Refund";
const DMT_TABS: DmtTab[] = ["Transfer", "Beneficiaries", "Refund"];

type AuthMode = "fingerprint" | "iris";

interface BiometricDevice {
  id: string;
  name: string;
  color: string;
  letter: string;
}

const BIOMETRIC_DEVICES: BiometricDevice[] = [
  { id: "mantra_mfs110", name: "Mantra MFS110 L1", color: "#1565C0", letter: "M" },
  { id: "startek_fm220", name: "Startek L1", color: "#4A148C", letter: "S" },
  { id: "morpho_mso1300", name: "Morpho MSO L1", color: "#E53935", letter: "M" },
  { id: "visiontek_v600", name: "VisionTek V600 L1", color: "#00695C", letter: "V" },
];

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

/* ── API helper ────────────────────────────────────────────────────── */

async function postProvider<T>(url: string, body: unknown): Promise<ProviderEnvelope<T>> {
  const { data } = await api.post<ApiResponse<ProviderEnvelope<T>>>(url, body);
  if (!data.success) throw new Error(data.message || "Request failed");
  const result = data.data;
  if (!result?.success) throw new Error(result?.message || "Provider failed");
  return result;
}

async function getProvider<T>(url: string): Promise<ProviderEnvelope<T>> {
  const { data } = await api.get<ApiResponse<ProviderEnvelope<T>>>(url);
  if (!data.success) throw new Error(data.message || "Request failed");
  const result = data.data;
  if (!result?.success) throw new Error(result?.message || "Provider failed");
  return result;
}

/* ── Device sidebar ────────────────────────────────────────────────── */

function DeviceSidebar({
  open,
  onClose,
  activeDeviceId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  activeDeviceId: string;
  onSelect: (device: BiometricDevice) => void;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold" style={{ color: B.blue }}>
            Select Biometric Device
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {BIOMETRIC_DEVICES.map((device) => {
            const isActive = device.id === activeDeviceId;
            return (
              <button
                key={device.id}
                type="button"
                onClick={() => {
                  onSelect(device);
                  onClose();
                }}
                className={clsx(
                  "flex w-full items-center gap-4 border-b border-gray-100 px-6 py-4 text-left transition hover:bg-gray-50",
                  isActive && "bg-blue-50/60",
                )}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white font-bold"
                  style={{ backgroundColor: device.color, fontSize: 16 }}
                >
                  {device.letter}
                </div>
                <span className="flex-1 text-sm font-semibold text-gray-800">{device.name}</span>
                {isActive && (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-[12px] font-bold text-green-700">
                    Active
                  </span>
                )}
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function DmtPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<DmtTab>("Transfer");

  // Agent auth (daily 2FA — required before transfer)
  const [agentAuthReady, setAgentAuthReady] = useState<boolean | null>(null);
  const [agentAuthKycReady, setAgentAuthKycReady] = useState(true);
  const [agentAadhaar, setAgentAadhaar] = useState("");
  const [agentAadhaarVisible, setAgentAadhaarVisible] = useState(false);
  const [agentAuthConsent, setAgentAuthConsent] = useState(false);
  const [agentAuthScanning, setAgentAuthScanning] = useState(false);
  const [activeDevice, setActiveDevice] = useState<BiometricDevice>(BIOMETRIC_DEVICES[0]!);
  const [deviceSidebarOpen, setDeviceSidebarOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("fingerprint");
  const [rdStatus, setRdStatus] = useState<"looking" | "ready" | "missing">("looking");
  const [rdEndpoint, setRdEndpoint] = useState<RdEndpoint | null>(null);

  // Remitter
  const [mobile, setMobile] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [profile, setProfile] = useState<DmtRemitterProfile | null>(null);
  const [regReferenceKey, setRegReferenceKey] = useState("");
  const [needsRegister, setNeedsRegister] = useState(false);

  // Registration
  const [regAadhaar, setRegAadhaar] = useState("");
  const [regOtp, setRegOtp] = useState("");
  const [regStep, setRegStep] = useState<"aadhaar" | "otp" | "kyc" | null>(null);
  const [regBusy, setRegBusy] = useState(false);

  // Banks + beneficiary add
  const [banks, setBanks] = useState<DmtBank[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<DmtBank | null>(null);
  const [beneName, setBeneName] = useState("");
  const [beneAccount, setBeneAccount] = useState("");
  const [beneIfsc, setBeneIfsc] = useState("");
  const [beneMobile, setBeneMobile] = useState("");
  const [beneOtp, setBeneOtp] = useState("");
  const [pendingBeneId, setPendingBeneId] = useState("");
  const [pendingBeneKey, setPendingBeneKey] = useState("");
  const [beneBusy, setBeneBusy] = useState(false);
  const [showAddBene, setShowAddBene] = useState(false);

  // Delete beneficiary
  const [deleteTarget, setDeleteTarget] = useState<DmtBeneficiary | null>(null);
  const [deleteOtp, setDeleteOtp] = useState("");
  const [deleteKey, setDeleteKey] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Transfer
  const [selectedBene, setSelectedBene] = useState<DmtBeneficiary | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"imps" | "neft">("imps");
  const [txnOtp, setTxnOtp] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [txnRefKey, setTxnRefKey] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [txnBusy, setTxnBusy] = useState(false);
  const [lastTxnRef, setLastTxnRef] = useState<string | null>(null);
  const attemptKey = useRef(createAttemptKeyHolder("dmt-xfer"));

  // Refund
  const [refundIpayId, setRefundIpayId] = useState("");
  const [refundOtp, setRefundOtp] = useState("");
  const [refundKey, setRefundKey] = useState("");
  const [refundOtpSent, setRefundOtpSent] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<ApiResponse<{ verifiedToday: boolean; kycReady: boolean; aadhaarNumber?: string | null }>>(
        "/auth/agent-auth/status",
      )
      .then(({ data }) => {
        if (cancelled) return;
        if (data.success) {
          setAgentAuthReady(Boolean(data.data.verifiedToday));
          setAgentAuthKycReady(data.data.kycReady !== false);
          const digits = (data.data.aadhaarNumber ?? "").replace(/\D/g, "").slice(0, 12);
          if (digits.length === 12) setAgentAadhaar(digits);
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
    if (agentAuthReady !== true) return;
    let cancelled = false;
    void (async () => {
      setRdStatus("looking");
      const ep = await warmRdService(true);
      if (cancelled) return;
      if (ep) {
        setRdEndpoint(ep);
        setRdStatus("ready");
      } else {
        setRdEndpoint(null);
        setRdStatus("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentAuthReady, authMode]);

  useEffect(() => {
    if (agentAuthReady !== true) return;
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
  }, [agentAuthReady]);

  const filteredBanks = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    if (!q) return banks.slice(0, 40);
    return banks.filter((b) => b.name.toLowerCase().includes(q) || String(b.bankId).includes(q)).slice(0, 40);
  }, [banks, bankSearch]);

  function formatAadhaar(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 12);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  }

  function maskAadhaar(v: string) {
    const digits = v.replace(/\D/g, "");
    if (digits.length <= 4) return digits;
    return "XXXX XXXX " + digits.slice(-4);
  }

  async function retryRdWarm() {
    setRdStatus("looking");
    const ep = await warmRdService(true);
    if (ep) {
      setRdEndpoint(ep);
      setRdStatus("ready");
    } else {
      setRdEndpoint(null);
      setRdStatus("missing");
    }
  }

  async function verifyDailyAgentAuth() {
    if (agentAuthScanning) return;
    if (!agentAuthKycReady) {
      toast.error("Complete KYC Aadhaar before DMT access");
      return;
    }
    if (agentAadhaar.replace(/\D/g, "").length !== 12) {
      toast.error("Enter retailer's 12-digit Aadhaar");
      return;
    }
    if (!agentAuthConsent) {
      toast.error("Accept Aadhaar consent to continue");
      return;
    }
    if (rdStatus === "looking") {
      toast.error("Scanner still connecting — wait a moment");
      return;
    }
    if (rdStatus === "missing") {
      toast.error("RD Service not found. Open Mantra/Morpho RDService on this PC, then Retry.");
      return;
    }

    setAgentAuthScanning(true);
    try {
      const biometricPayload = await captureFingerprintWeb();
      const { data } = await api.post<ApiResponse<{ verifiedAt: string }>>("/auth/agent-auth", {
        aadhaarNumber: agentAadhaar.replace(/\D/g, ""),
        biometricPayload,
      });
      if (!data.success) throw new Error(data.message);
      setAgentAuthReady(true);
      toast.success("DMT unlocked for today");
    } catch (err) {
      toast.error(extractApiError(err, "Fingerprint verification failed"), { duration: 10_000 });
      void retryRdWarm();
    } finally {
      setAgentAuthScanning(false);
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
    setTxnPin("");
    setTxnRefKey("");
    setOtpSent(false);
    setLastTxnRef(null);
    setShowAddBene(false);
    setPendingBeneId("");
    setPendingBeneKey("");
    setBeneOtp("");
    attemptKey.current.clear();
  }, []);

  async function lookupRemitter() {
    const m = mobile.replace(/\D/g, "");
    if (m.length !== 10) {
      toast.error("Enter 10-digit remitter mobile");
      return;
    }
    setLookingUp(true);
    resetRemitterSession();
    try {
      const res = await postProvider<{
        profile: DmtRemitterProfile | null;
        referenceKey?: string;
        validity?: string;
      }>("/txn/dmt/remitter/profile", { customerMobile: m });

      if (res.data.profile) {
        setProfile(res.data.profile);
        setNeedsRegister(false);
        toast.success(`Remitter found: ${res.data.profile.firstName} ${res.data.profile.lastName}`.trim());
      } else {
        setNeedsRegister(true);
        setRegReferenceKey(res.data.referenceKey || "");
        setRegStep("aadhaar");
        toast("Remitter not registered — complete registration", { icon: "ℹ️" });
      }
    } catch (err) {
      toast.error(extractApiError(err, "Remitter lookup failed"));
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
      toast.error("Missing registration reference — search remitter again");
      return;
    }
    if (aadhaar.length !== 12) {
      toast.error("Enter remitter's 12-digit Aadhaar");
      return;
    }
    setRegBusy(true);
    try {
      await postProvider("/txn/dmt/remitter/register", {
        customerMobile: m,
        aadhaarNumber: aadhaar,
        referenceKey: regReferenceKey,
      });
      setRegStep("otp");
      toast.success("OTP sent to remitter mobile");
    } catch (err) {
      toast.error(extractApiError(err, "Registration failed"));
    } finally {
      setRegBusy(false);
    }
  }

  async function verifyRegistration() {
    const m = mobile.replace(/\D/g, "");
    if (!/^\d{4,8}$/.test(regOtp)) {
      toast.error("Enter OTP from remitter mobile");
      return;
    }
    setRegBusy(true);
    try {
      await postProvider("/txn/dmt/remitter/register/verify", {
        customerMobile: m,
        otp: regOtp,
        referenceKey: regReferenceKey,
      });
      toast.success("Remitter registered");
      setRegStep("kyc");
    } catch (err) {
      toast.error(extractApiError(err, "OTP verification failed"));
    } finally {
      setRegBusy(false);
    }
  }

  async function submitRemitterKyc() {
    const m = mobile.replace(/\D/g, "");
    if (rdStatus !== "ready") {
      toast.error("RD Service not ready — Retry device connection");
      return;
    }
    setRegBusy(true);
    try {
      const biometricPayload = await captureFingerprintWeb();
      await postProvider("/txn/dmt/remitter/kyc", {
        customerMobile: m,
        referenceKey: regReferenceKey,
        biometricPayload,
        captureType: "FINGER",
      });
      toast.success("Remitter eKYC done");
      await refreshProfile();
    } catch (err) {
      toast.error(extractApiError(err, "eKYC failed"));
      void retryRdWarm();
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
      toast.error("Enter valid name, account and IFSC");
      return;
    }
    setBeneBusy(true);
    try {
      const res = await postProvider<{
        beneficiaryId: string;
        referenceKey: string;
        validity: string;
      }>("/txn/dmt/beneficiary", {
        customerMobile: m,
        name: beneName.trim(),
        accountNumber: beneAccount,
        ifsc: beneIfsc.toUpperCase(),
        beneficiaryMobile: beneMobile.replace(/\D/g, "") || undefined,
        bankId: selectedBank ? String(selectedBank.bankId) : undefined,
      });
      setPendingBeneId(res.data.beneficiaryId);
      setPendingBeneKey(res.data.referenceKey);
      toast.success("OTP sent to remitter — verify beneficiary");
    } catch (err) {
      toast.error(extractApiError(err, "Add beneficiary failed"));
    } finally {
      setBeneBusy(false);
    }
  }

  async function verifyBeneficiary() {
    const m = mobile.replace(/\D/g, "");
    if (!pendingBeneId || !pendingBeneKey || !/^\d{4,8}$/.test(beneOtp)) {
      toast.error("Enter OTP to verify beneficiary");
      return;
    }
    setBeneBusy(true);
    try {
      await postProvider("/txn/dmt/beneficiary/verify", {
        customerMobile: m,
        otp: beneOtp,
        beneficiaryId: pendingBeneId,
        referenceKey: pendingBeneKey,
      });
      toast.success("Beneficiary added");
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
      toast.error(extractApiError(err, "Beneficiary verify failed"));
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
        validity: string;
      }>("/txn/dmt/beneficiary/delete", {
        customerMobile: m,
        beneficiaryId: b.id,
      });
      setDeleteKey(res.data.referenceKey);
      toast.success("OTP sent to remitter — confirm delete");
    } catch (err) {
      setDeleteTarget(null);
      toast.error(extractApiError(err, "Delete failed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmDeleteBeneficiary() {
    const m = mobile.replace(/\D/g, "");
    if (!deleteTarget || !deleteKey || !/^\d{4,8}$/.test(deleteOtp)) {
      toast.error("Enter OTP to confirm delete");
      return;
    }
    setDeleteBusy(true);
    try {
      await postProvider("/txn/dmt/beneficiary/delete/verify", {
        customerMobile: m,
        otp: deleteOtp,
        beneficiaryId: deleteTarget.id,
        referenceKey: deleteKey,
      });
      toast.success("Beneficiary deleted");
      if (selectedBene?.id === deleteTarget.id) setSelectedBene(null);
      setDeleteTarget(null);
      setDeleteOtp("");
      setDeleteKey("");
      await refreshProfile();
    } catch (err) {
      toast.error(extractApiError(err, "Delete verify failed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function sendTransferOtp() {
    const m = mobile.replace(/\D/g, "");
    if (!profile?.referenceKey) {
      toast.error("Refresh remitter profile first");
      return;
    }
    if (!selectedBene) {
      toast.error("Select a beneficiary");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt < 1 || amt > 5000) {
      toast.error("Amount must be ₹1 – ₹5,000");
      return;
    }
    setTxnBusy(true);
    try {
      const res = await postProvider<{ referenceKey: string; validity: string }>("/txn/dmt/transfer/otp", {
        customerMobile: m,
        amount: String(amt),
        referenceKey: profile.referenceKey,
      });
      setTxnRefKey(res.data.referenceKey);
      setOtpSent(true);
      toast.success("Transfer OTP sent to remitter");
    } catch (err) {
      toast.error(extractApiError(err, "OTP request failed"));
    } finally {
      setTxnBusy(false);
    }
  }

  async function submitTransfer() {
    const m = mobile.replace(/\D/g, "");
    if (!selectedBene || !txnRefKey) {
      toast.error("Send OTP first");
      return;
    }
    if (!/^\d{4,8}$/.test(txnOtp)) {
      toast.error("Enter remitter OTP");
      return;
    }
    if (txnPin.length !== 4) {
      toast.error("Enter 4-digit transaction PIN");
      return;
    }
    setTxnBusy(true);
    try {
      const { data } = await api.post<
        ApiResponse<{ txn?: { txnRef?: string }; provider?: ProviderEnvelope<Record<string, unknown>> }>
      >("/txn/dmt/transfer", {
        customerMobile: m,
        accountNumber: selectedBene.account,
        ifsc: selectedBene.ifsc,
        amount: String(Number(amount)),
        mode,
        otp: txnOtp,
        referenceKey: txnRefKey,
        beneficiaryId: selectedBene.id,
        txnPin,
        idempotencyKey: attemptKey.current.get(),
      });
      if (!data.success) throw new Error(data.message || "Transfer failed");
      const txnRef = data.data?.txn?.txnRef ?? null;
      setLastTxnRef(txnRef);
      attemptKey.current.clear();
      setOtpSent(false);
      setTxnOtp("");
      setTxnPin("");
      setTxnRefKey("");
      setAmount("");
      toast.success(txnRef ? `Transfer submitted — ${txnRef}` : "Transfer submitted");
      await refreshProfile();
    } catch (err) {
      toast.error(extractApiError(err, "Transfer failed"));
    } finally {
      setTxnBusy(false);
    }
  }

  async function sendRefundOtp() {
    if (refundIpayId.trim().length < 6) {
      toast.error("Enter provider order id (ipayId or equivalent)");
      return;
    }
    setRefundBusy(true);
    try {
      const res = await postProvider<{ referenceKey: string; validity: string }>("/txn/dmt/refund/otp", {
        ipayId: refundIpayId.trim(),
      });
      setRefundKey(res.data.referenceKey);
      setRefundOtpSent(true);
      toast.success("Refund OTP sent to remitter");
    } catch (err) {
      toast.error(extractApiError(err, "Refund OTP failed"));
    } finally {
      setRefundBusy(false);
    }
  }

  async function submitRefund() {
    if (!refundKey || !/^\d{4,8}$/.test(refundOtp)) {
      toast.error("Enter refund OTP");
      return;
    }
    setRefundBusy(true);
    try {
      await postProvider("/txn/dmt/refund", {
        ipayId: refundIpayId.trim(),
        referenceKey: refundKey,
        otp: refundOtp,
      });
      toast.success("Refund authorised — recheck txn for balance credit");
      setRefundOtpSent(false);
      setRefundOtp("");
      setRefundKey("");
    } catch (err) {
      toast.error(extractApiError(err, "Refund failed"));
    } finally {
      setRefundBusy(false);
    }
  }

  /* ── Loading / agent auth gates ──────────────────────────────────── */

  if (agentAuthReady === null) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-gray-500">Checking today&apos;s DMT verification…</p>
        </div>
      </AppShell>
    );
  }

  if (!agentAuthReady) {
    const retailerLabel = user?.name?.trim() || "Retailer";
    const aadhaarDigits = agentAadhaar.replace(/\D/g, "").length;
    const canScan = agentAuthKycReady && agentAuthConsent && aadhaarDigits === 12 && !agentAuthScanning;

    return (
      <AppShell>
        <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border bg-white transition hover:bg-gray-50"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold" style={{ color: B.blue }}>
                Mandatory 2FA for DMT Access
              </h1>
              <p className="text-xs" style={{ color: B.muted }}>
                Verify once daily before money transfer (same as AePS).
              </p>
            </div>
          </div>

          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div
              className="flex items-center gap-3 px-6 py-5"
              style={{ background: `linear-gradient(135deg, ${B.blue}, ${B.blueMid})` }}
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Fingerprint size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Daily retailer verification</h2>
                <p className="mt-0.5 text-xs text-white/70">
                  Enter your KYC Aadhaar, then scan fingerprint on the connected RD device.
                </p>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div>
                <label className="text-xs font-bold tracking-wide text-gray-500">
                  AADHAAR NUMBER OF {retailerLabel.toUpperCase()}
                </label>
                <div
                  className="mt-2 flex items-center gap-2 rounded-xl border-2 px-3.5 py-3 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-50"
                  style={{ borderColor: B.border }}
                >
                  <input
                    value={
                      agentAadhaarVisible
                        ? formatAadhaar(agentAadhaar)
                        : maskAadhaar(agentAadhaar)
                    }
                    onChange={(e) => setAgentAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    onFocus={() => setAgentAadhaarVisible(true)}
                    placeholder={
                      agentAuthKycReady
                        ? agentAadhaar.length === 12
                          ? "From signup KYC"
                          : "Enter 12-digit Aadhaar"
                        : "KYC Aadhaar not found"
                    }
                    disabled={!agentAuthKycReady || agentAuthScanning}
                    inputMode="numeric"
                    className="flex-1 bg-transparent text-sm font-semibold tracking-wide outline-none disabled:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setAgentAadhaarVisible((v) => !v)}
                    className="text-gray-400 transition hover:text-gray-600"
                  >
                    {agentAadhaarVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <label
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm text-gray-700 transition hover:bg-gray-50"
                style={{ borderColor: B.border }}
              >
                <input
                  type="checkbox"
                  checked={agentAuthConsent}
                  onChange={(e) => setAgentAuthConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span>I accept Aadhaar Consent for today&apos;s DMT access.</span>
              </label>

              <div>
                <p className="mb-3 text-xs font-bold tracking-wide text-gray-500">AUTHENTICATION MODE</p>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className="relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 shadow-sm"
                    style={{ borderColor: B.blue, background: `${B.blue}0A` }}
                  >
                    <div className="absolute right-2.5 top-2.5">
                      <CircleDot size={14} className="text-green-600" />
                    </div>
                    <Fingerprint size={28} style={{ color: B.blue }} />
                    <span className="text-sm font-bold" style={{ color: B.blue }}>
                      Fingerprint
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-4 opacity-60">
                    <ScanEye size={28} className="text-gray-400" />
                    <span className="text-sm font-bold text-gray-500">Eye Scan</span>
                    <span className="text-[11px] font-bold tracking-wide text-gray-400">COMING SOON</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border p-3.5" style={{ borderColor: B.border }}>
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                  style={{ backgroundColor: activeDevice.color }}
                >
                  {activeDevice.letter}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {rdEndpoint ? formatRdDeviceLabel(rdEndpoint) : activeDevice.name}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        rdStatus === "ready" ? "bg-green-500" : rdStatus === "looking" ? "bg-amber-400" : "bg-red-400"
                      }`}
                    />
                    {rdStatus === "ready"
                      ? "Device ready"
                      : rdStatus === "looking"
                        ? "Looking for RD Service…"
                        : "RD Service not found"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void retryRdWarm()}
                  className="flex-shrink-0 text-xs font-bold text-blue-600 hover:underline"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceSidebarOpen(true)}
                  className="flex-shrink-0 text-xs font-bold text-blue-600 hover:underline"
                >
                  Change Device
                </button>
              </div>

              <PrimaryButton
                type="button"
                variant="primary"
                disabled={!canScan}
                loading={agentAuthScanning}
                onClick={() => void verifyDailyAgentAuth()}
              >
                <Fingerprint size={18} />
                Scan Finger
              </PrimaryButton>
            </div>
          </div>

          <aside className="min-w-0 space-y-4 md:sticky md:top-4">
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <h3 className="mb-3 text-sm font-bold" style={{ color: B.blue }}>
                How daily 2FA works
              </h3>
              <ol className="space-y-2 text-xs leading-relaxed text-gray-600">
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">1</span>
                  Confirm your signup KYC Aadhaar (auto-filled)
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">2</span>
                  Accept Aadhaar consent for today&apos;s session
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">3</span>
                  Connect Morpho / Mantra L1 RD device
                </li>
                <li className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-50 text-[11px] font-bold text-green-700">✓</span>
                  Scan finger once — DMT unlocks for the day
                </li>
              </ol>
            </div>
            <div className="rounded-2xl border bg-amber-50 p-4" style={{ borderColor: "#FDE68A" }}>
              <p className="text-xs font-semibold leading-relaxed text-amber-800">
                Open the RD Service app on this PC before scanning. Same device must be used for
                DMT after unlock.
              </p>
            </div>
          </aside>
          </div>
        </div>
        <DeviceSidebar
          open={deviceSidebarOpen}
          onClose={() => setDeviceSidebarOpen(false)}
          activeDeviceId={activeDevice.id}
          onSelect={setActiveDevice}
        />
      </AppShell>
    );
  }

  /* ── Main DMT portal ─────────────────────────────────────────────── */

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-gray-50"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              Money Transfer (DMT)
            </h1>
            <p className="text-xs" style={{ color: B.muted }}>
              IMPS / NEFT · ₹5,000 / txn · ₹25,000 / month per remitter
            </p>
          </div>
          <Banknote className="text-green-600" size={28} />
        </div>

        {/* Remitter search */}
        <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <label className="text-xs font-bold tracking-wide text-gray-500">REMITTER MOBILE</label>
          <div className="mt-2 flex gap-2">
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void lookupRemitter();
              }}
              placeholder="10-digit mobile"
              inputMode="numeric"
              className="flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => void lookupRemitter()}
              disabled={lookingUp}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Search size={16} />
              {lookingUp ? "…" : "Search"}
            </button>
          </div>
          {profile && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm">
              <Check size={16} className="text-green-600" />
              <span className="font-semibold text-gray-900">
                {profile.firstName} {profile.lastName}
              </span>
              <span className="text-gray-500">·</span>
              <span className="text-gray-600">
                Limit left ₹{profile.limitAvailable} / ₹{profile.limitTotal}
              </span>
              <span className="text-gray-500">·</span>
              <span className="text-gray-600">₹{profile.limitPerTransaction} / txn</span>
            </div>
          )}
        </div>

        {/* Registration wizard */}
        {needsRegister && regStep && (
          <div className="mb-4 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-amber-700" />
              <h2 className="font-bold text-amber-900">Register remitter</h2>
            </div>

            {regStep === "aadhaar" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Enter remitter Aadhaar to send registration OTP.</p>
                <input
                  value={formatAadhaar(regAadhaar)}
                  onChange={(e) => setRegAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="12-digit Aadhaar"
                  inputMode="numeric"
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold outline-none"
                />
                <button
                  type="button"
                  disabled={regBusy}
                  onClick={() => void startRegistration()}
                  className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {regBusy ? "Sending…" : "Send Registration OTP"}
                </button>
              </div>
            )}

            {regStep === "otp" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Enter OTP received on remitter mobile.</p>
                <input
                  value={regOtp}
                  onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="OTP"
                  inputMode="numeric"
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold outline-none"
                />
                <button
                  type="button"
                  disabled={regBusy}
                  onClick={() => void verifyRegistration()}
                  className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {regBusy ? "Verifying…" : "Verify & Continue"}
                </button>
              </div>
            )}

            {regStep === "kyc" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Optional remitter biometric eKYC (fingerprint). You can skip and complete later.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={regBusy}
                    onClick={() => void submitRemitterKyc()}
                    className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {regBusy ? "Scanning…" : "Scan Finger (eKYC)"}
                  </button>
                  <button
                    type="button"
                    disabled={regBusy}
                    onClick={() => void skipKycForNow()}
                    className="rounded-xl border bg-white px-4 py-2.5 text-sm font-bold text-gray-700"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs — only when remitter loaded */}
        {profile && (
          <>
            <div className="mb-4 flex gap-1 rounded-xl border bg-white p-1">
              {DMT_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={clsx(
                    "flex-1 rounded-lg py-2 text-sm font-bold transition",
                    tab === t ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "Transfer" && (
              <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wide text-gray-500">SELECT BENEFICIARY</p>
                  {profile.beneficiaries.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No beneficiaries — add one from the Beneficiaries tab.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {profile.beneficiaries.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setSelectedBene(b);
                            setOtpSent(false);
                            setTxnRefKey("");
                            setTxnOtp("");
                            attemptKey.current.clear();
                          }}
                          className={clsx(
                            "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                            selectedBene?.id === b.id
                              ? "border-blue-500 bg-blue-50"
                              : "hover:bg-gray-50",
                          )}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                            {b.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-gray-900">{b.name}</p>
                            <p className="truncate text-xs text-gray-500">
                              {b.account} · {b.ifsc}
                            </p>
                          </div>
                          {selectedBene?.id === b.id && <Check size={18} className="text-blue-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedBene && (
                  <>
                    <div>
                      <p className="mb-2 text-xs font-bold tracking-wide text-gray-500">MODE</p>
                      <div className="flex gap-2">
                        {(["imps", "neft"] as const).map((m) => {
                          const allowed =
                            m === "imps" ? profile.isImpsAllowed !== false : profile.isNeftAllowed !== false;
                          return (
                            <button
                              key={m}
                              type="button"
                              disabled={!allowed}
                              onClick={() => setMode(m)}
                              className={clsx(
                                "flex-1 rounded-xl border py-2.5 text-sm font-bold uppercase disabled:opacity-40",
                                mode === m ? "border-blue-500 bg-blue-50 text-blue-700" : "text-gray-600",
                              )}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-bold tracking-wide text-gray-500">AMOUNT (₹)</p>
                      <input
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value.replace(/[^\d.]/g, ""));
                          setOtpSent(false);
                          setTxnRefKey("");
                          attemptKey.current.clear();
                        }}
                        placeholder="Max 5000"
                        inputMode="decimal"
                        className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {QUICK_AMOUNTS.map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => {
                              setAmount(String(a));
                              setOtpSent(false);
                              setTxnRefKey("");
                              attemptKey.current.clear();
                            }}
                            className="rounded-lg border px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50"
                          >
                            ₹{a}
                          </button>
                        ))}
                      </div>
                    </div>

                    {!otpSent ? (
                      <button
                        type="button"
                        disabled={txnBusy}
                        onClick={() => void sendTransferOtp()}
                        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {txnBusy ? "Sending OTP…" : "Send Transfer OTP"}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-bold text-gray-500">REMITTER OTP</label>
                          <input
                            value={txnOtp}
                            onChange={(e) => setTxnOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                            placeholder="OTP"
                            inputMode="numeric"
                            className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500">TRANSACTION PIN</label>
                          <input
                            type="password"
                            value={txnPin}
                            onChange={(e) => setTxnPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            placeholder="4-digit PIN"
                            inputMode="numeric"
                            maxLength={4}
                            className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={txnBusy}
                          onClick={() => void submitTransfer()}
                          className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {txnBusy ? "Processing…" : `Transfer ₹${amount || "0"}`}
                        </button>
                      </div>
                    )}

                    {lastTxnRef && (
                      <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
                        Last txn: <span className="font-bold">{lastTxnRef}</span> — pending pe History se
                        recheck karo.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "Beneficiaries" && (
              <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">
                    Beneficiaries ({profile.beneficiaries.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowAddBene((v) => !v)}
                    className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>

                {showAddBene && (
                  <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                    <input
                      value={beneName}
                      onChange={(e) => setBeneName(e.target.value)}
                      placeholder="Beneficiary name"
                      className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                    />
                    <input
                      value={beneAccount}
                      onChange={(e) => setBeneAccount(e.target.value.replace(/\D/g, "").slice(0, 24))}
                      placeholder="Account number"
                      inputMode="numeric"
                      className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                    />
                    <input
                      value={beneIfsc}
                      onChange={(e) => setBeneIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))}
                      placeholder="IFSC"
                      className="w-full rounded-xl border bg-white px-3 py-2 text-sm font-mono outline-none"
                    />
                    <input
                      value={beneMobile}
                      onChange={(e) => setBeneMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Beneficiary mobile (optional)"
                      inputMode="numeric"
                      className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                    />

                    <div>
                      <input
                        value={bankSearch}
                        onChange={(e) => setBankSearch(e.target.value)}
                        placeholder="Search bank…"
                        className="mb-2 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                      />
                      <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border bg-white p-1">
                        {filteredBanks.map((b) => (
                          <button
                            key={String(b.bankId)}
                            type="button"
                            onClick={() => {
                              setSelectedBank(b);
                              if (b.ifscGlobal && beneIfsc.length < 11) setBeneIfsc(b.ifscGlobal.slice(0, 11));
                            }}
                            className={clsx(
                              "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs",
                              selectedBank?.bankId === b.bankId ? "bg-blue-100 font-bold" : "hover:bg-gray-50",
                            )}
                          >
                            <span>{b.name}</span>
                            {selectedBank?.bankId === b.bankId && <Check size={12} />}
                          </button>
                        ))}
                        {filteredBanks.length === 0 && (
                          <p className="px-2 py-2 text-xs text-gray-400">No banks loaded</p>
                        )}
                      </div>
                    </div>

                    {!pendingBeneId ? (
                      <button
                        type="button"
                        disabled={beneBusy}
                        onClick={() => void addBeneficiary()}
                        className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {beneBusy ? "Sending…" : "Add & Send OTP"}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <input
                          value={beneOtp}
                          onChange={(e) => setBeneOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                          placeholder="OTP from remitter"
                          inputMode="numeric"
                          className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                        />
                        <button
                          type="button"
                          disabled={beneBusy}
                          onClick={() => void verifyBeneficiary()}
                          className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {beneBusy ? "Verifying…" : "Verify Beneficiary"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {profile.beneficiaries.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-xl border px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-gray-900">{b.name}</p>
                        <p className="truncate text-xs text-gray-500">
                          {b.account} · {b.ifsc} · {b.bank}
                        </p>
                      </div>
                      <ActionIconButton
                        title="Delete"
                        tone="red"
                        disabled={deleteBusy}
                        onClick={() => void startDeleteBeneficiary(b)}
                      >
                        <Trash2 size={16} strokeWidth={2.25} />
                      </ActionIconButton>
                    </div>
                  ))}
                </div>

                {deleteTarget && (
                  <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-800">
                      Confirm delete: {deleteTarget.name}
                    </p>
                    <input
                      value={deleteOtp}
                      onChange={(e) => setDeleteOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      placeholder="OTP"
                      inputMode="numeric"
                      className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none"
                    />
                    <div className="flex gap-2">
                      <PrimaryButton
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deleteBusy || deleteOtp.length < 4}
                        loading={deleteBusy}
                        onClick={() => void confirmDeleteBeneficiary()}
                        className="flex-1"
                      >
                        Confirm Delete
                      </PrimaryButton>
                      <PrimaryButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        showArrow={false}
                        onClick={() => {
                          setDeleteTarget(null);
                          setDeleteOtp("");
                          setDeleteKey("");
                        }}
                        className="!w-auto"
                      >
                        Cancel
                      </PrimaryButton>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "Refund" && (
              <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-600">
                  Only when the txn is <strong>pending</strong> and status-check returns{" "}
                  <code className="rounded bg-gray-100 px-1 text-xs">ReversalAuthorisationRequired</code>.
                  After refund, recheck the txn from History — balance is credited automatically.
                </p>
                <div>
                  <label className="text-xs font-bold text-gray-500">INSTANTPAY ORDER ID (ipayId)</label>
                  <input
                    value={refundIpayId}
                    onChange={(e) => {
                      setRefundIpayId(e.target.value.trim());
                      setRefundOtpSent(false);
                      setRefundKey("");
                    }}
                    placeholder="e.g. 1260113092551HCQRL"
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-mono outline-none"
                  />
                </div>
                {!refundOtpSent ? (
                  <button
                    type="button"
                    disabled={refundBusy}
                    onClick={() => void sendRefundOtp()}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {refundBusy ? "Sending…" : "Send Refund OTP"}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <input
                      value={refundOtp}
                      onChange={(e) => setRefundOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      placeholder="OTP from remitter"
                      inputMode="numeric"
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                    />
                    <button
                      type="button"
                      disabled={refundBusy}
                      onClick={() => void submitRefund()}
                      className="w-full rounded-xl bg-amber-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {refundBusy ? "Processing…" : "Confirm Refund"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!profile && !needsRegister && (
          <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">
            Remitter mobile search karo — profile / registration yahan dikhega.
          </div>
        )}
      </div>
    </AppShell>
  );
}
