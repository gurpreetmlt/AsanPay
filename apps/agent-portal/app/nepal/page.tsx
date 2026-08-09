"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDot,
  Eye,
  EyeOff,
  Fingerprint,
  Globe2,
  Plus,
  ScanEye,
  Search,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
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

interface ProviderEnvelope<T> {
  success: boolean;
  status: string;
  message: string;
  data: T;
  providerTxnId?: string | null;
}

interface StaticOption {
  label: string;
  value: string;
}

interface StateDistrictRow {
  state: string;
  district: string;
  stateCode: string;
}

interface NepalOutletStatus {
  ready: boolean;
  actcode: string | null;
  message: string;
  cspStatus: string | null;
  cspCode: string | null;
  statuscode: string;
}

interface NepalBeneficiary {
  id: string;
  name: string;
  gender: string;
  relationship: string;
  address: string;
  mobile: string;
  paymentMode: string;
  bankBranchId: string;
  bankName: string;
  bankBranchName: string;
  acNumber: string;
}

interface NepalRemitterProfile {
  id: string;
  mobile: string;
  firstName: string;
  gender: string;
  dob: string;
  address: string;
  city: string;
  state: string;
  district: string;
  nationality: string;
  employer: string;
  incomeSource: string;
  status: string;
  eKycStatus: string;
  transactionCount: { day: string; month: string; year: string };
  beneficiaries: NepalBeneficiary[];
}

interface NepalPaymentLocation {
  locationId: string | number;
  locationName: string;
  bankBranchId: string | number;
  bankName: string;
  branchName: string;
  state: string;
  district: string;
  city: string;
}

interface NepalServiceChargeQuote {
  transferAmount: string;
  serviceCharge: string;
  collectionAmount: string;
  collectionCurrency: string;
  exchangeRate: string;
  payoutAmount: string;
  payoutCurrency: string;
}

interface NepalTxnStatus {
  statuscode: string;
  actcode: string | null;
  message: string;
  ready: boolean;
  data: Record<string, unknown> | null;
}

type NepalTab = "Outlet" | "Transfer" | "Status";
const NEPAL_TABS: NepalTab[] = ["Outlet", "Transfer", "Status"];

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

const QUICK_AMOUNTS = [1000, 5000, 10000, 25000];

const REMITTER_TYPE_OPTIONS = [
  { value: 1, label: "1 — Individual" },
  { value: 2, label: "2 — Business" },
  { value: 3, label: "3 — Other" },
  { value: 4, label: "4 — Other" },
];

const INCOME_SOURCE_TYPE_OPTIONS = [
  { value: 1, label: "1 — Government" },
  { value: 2, label: "2 — Self employed" },
  { value: 3, label: "3 — Private sector" },
  { value: 4, label: "4 — Public sector" },
  { value: 5, label: "5 — Dependent" },
  { value: 6, label: "6 — Other" },
];

const ANNUAL_INCOME_OPTIONS = [
  { value: 1, label: "1 — Up to ₹2L" },
  { value: 2, label: "2 — ₹2L–5L" },
  { value: 3, label: "3 — ₹5L–10L" },
  { value: 4, label: "4 — Above ₹10L" },
];

/* ── Helpers ───────────────────────────────────────────────────────── */

async function postProvider<T>(url: string, body: unknown): Promise<ProviderEnvelope<T>> {
  const { data } = await api.post<ApiResponse<ProviderEnvelope<T>>>(url, body);
  if (!data.success) throw new Error(data.message || "Request failed");
  const result = data.data;
  if (!result?.success) throw new Error(result?.message || "Provider failed");
  return result;
}

function getCoords(): Promise<{ latitude: string; longitude: string }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ latitude: "28.6139", longitude: "77.2090" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
        }),
      () => resolve({ latitude: "28.6139", longitude: "77.2090" }),
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

function isRemitterEkycPending(profile: NepalRemitterProfile): boolean {
  const s = (profile.eKycStatus ?? "").trim().toLowerCase();
  return !s || s === "unverified" || s === "pending";
}

function inputCls() {
  return "w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";
}

function selectCls() {
  return "w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";
}

function labelCls() {
  return "text-xs font-bold tracking-wide text-gray-500";
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

export default function NepalPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<NepalTab>("Outlet");

  // Agent auth
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

  // Outlet
  const [outlet, setOutlet] = useState<NepalOutletStatus | null>(null);
  const [outletBusy, setOutletBusy] = useState(false);
  const [outletOtpRef, setOutletOtpRef] = useState("");
  const [outletOtp, setOutletOtp] = useState("");
  const [outletRegBusy, setOutletRegBusy] = useState(false);
  const [outletEkycBusy, setOutletEkycBusy] = useState(false);
  const [outletReg, setOutletReg] = useState({
    gender: "Male" as "Male" | "Female" | "Other",
    category: "General" as "General" | "OBC" | "ST" | "SC",
    fatherOrSpouseName: "",
    physicallyHandicapped: "Not Handicapped" as "Handicapped" | "Not Handicapped",
    alternateOccupationType: "None" as "Government" | "Self Employed" | "Public Sector" | "Private" | "Other" | "None",
    alternateOccupationDescription: "",
    highestEducation: "Graduate" as "Under 10th" | "10th" | "12th" | "Graduate" | "Post Graduate",
    operatingHoursFrom: "09:00 AM",
    operatingHoursTo: "06:00 PM",
    course: "None" as "IIBF Advance" | "IIBF Basic" | "Certified by Bank" | "None",
    courseCompletionDate: "",
    instituteName: "",
    deviceName: "Handheld" as "Laptop" | "Handheld",
    connectivityType: "Mobile" as "Landline" | "Mobile" | "VSAT",
    connectionProvider: "Airtel",
    weeklyOff: "Sunday",
    expectedAnnualTurnover: "500000",
    expectedAnnualIncome: "300000",
    bankAccountNo: "",
    bankIfsc: "",
    accountName: "",
  });

  // Transfer — remitter
  const [mobile, setMobile] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [profile, setProfile] = useState<NepalRemitterProfile | null>(null);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [regOtpRef, setRegOtpRef] = useState("");
  const [regOtp, setRegOtp] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [staticCache, setStaticCache] = useState<Record<string, StaticOption[]>>({});
  const [stateRows, setStateRows] = useState<StateDistrictRow[]>([]);
  const [regForm, setRegForm] = useState({
    name: "",
    gender: "",
    dob: "",
    address: "",
    city: "",
    state: "",
    district: "",
    nationality: "",
    email: "",
    employer: "",
    idType: "",
    idNumber: "",
    incomeSource: "",
    remitterType: 1 as 1 | 2 | 3 | 4,
    incomeSourceType: 1 as 1 | 2 | 3 | 4 | 5 | 6,
    annualIncome: 1 as 1 | 2 | 3 | 4,
  });

  // Remitter eKYC
  const [remitterEkycKey, setRemitterEkycKey] = useState("");
  const [remitterEkycBusy, setRemitterEkycBusy] = useState(false);

  // Beneficiary
  const [showAddBene, setShowAddBene] = useState(false);
  const [beneBusy, setBeneBusy] = useState(false);
  const [paymentLocations, setPaymentLocations] = useState<NepalPaymentLocation[]>([]);
  const [beneForm, setBeneForm] = useState({
    name: "",
    gender: "",
    mobile: "",
    relationship: "",
    address: "",
    paymentMode: "Cash Payment" as "Cash Payment" | "Account Deposit",
    bankBranchId: "",
    accountNumber: "",
    locationId: "",
  });

  // Transfer
  const [selectedBene, setSelectedBene] = useState<NepalBeneficiary | null>(null);
  const [amount, setAmount] = useState("");
  const [remittanceReason, setRemittanceReason] = useState("");
  const [quote, setQuote] = useState<NepalServiceChargeQuote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [txnOtpRef, setTxnOtpRef] = useState("");
  const [txnOtp, setTxnOtp] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [txnBusy, setTxnBusy] = useState(false);
  const [lastTxnRef, setLastTxnRef] = useState<string | null>(null);
  const [lastPoolRef, setLastPoolRef] = useState<string | null>(null);
  const attemptKey = useRef(createAttemptKeyHolder("nepal-xfer"));

  // Status
  const [statusIpayId, setStatusIpayId] = useState("");
  const [statusResult, setStatusResult] = useState<NepalTxnStatus | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const stateGroups = useMemo(() => {
    const map = new Map<string, { stateCode: string; districts: string[] }>();
    for (const row of stateRows) {
      const existing = map.get(row.state);
      if (existing) {
        if (!existing.districts.includes(row.district)) existing.districts.push(row.district);
      } else {
        map.set(row.state, { stateCode: row.stateCode, districts: [row.district] });
      }
    }
    return map;
  }, [stateRows]);

  const districtsForState = useMemo(() => {
    if (!regForm.state) return [];
    return stateGroups.get(regForm.state)?.districts ?? [];
  }, [regForm.state, stateGroups]);

  const loadStatic = useCallback(async (type: string) => {
    if (staticCache[type]?.length) return staticCache[type]!;
    const res = await postProvider<{ items: StaticOption[]; type: string }>("/txn/nepal/static-data", {
      type,
    });
    const items = res.data.items ?? [];
    setStaticCache((prev) => ({ ...prev, [type]: items }));
    return items;
  }, [staticCache]);

  const refreshOutletStatus = useCallback(async (checkOtpStatus = false) => {
    setOutletBusy(true);
    try {
      const res = await postProvider<{ outlet: NepalOutletStatus }>("/txn/nepal/outlet-status", {
        ...(checkOtpStatus ? { checkOtpStatus: true } : {}),
      });
      setOutlet(res.data.outlet);
    } catch (err) {
      toast.error(extractApiError(err, "Outlet status failed"));
    } finally {
      setOutletBusy(false);
    }
  }, []);

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
    void refreshOutletStatus();
  }, [agentAuthReady, refreshOutletStatus]);

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
      toast.error("Complete KYC Aadhaar before Nepal access");
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
      toast.success("Nepal remittance unlocked for today");
    } catch (err) {
      toast.error(extractApiError(err, "Fingerprint verification failed"), { duration: 10_000 });
      void retryRdWarm();
    } finally {
      setAgentAuthScanning(false);
    }
  }

  async function sendOutletOtp() {
    setOutletBusy(true);
    try {
      const res = await postProvider<{ otpReference: string }>("/txn/nepal/otp", {
        operation: "AgentRegistration",
        paymentMode: "Cash Payment",
      });
      setOutletOtpRef(res.data.otpReference);
      toast.success("Outlet registration OTP sent");
    } catch (err) {
      toast.error(extractApiError(err, "OTP request failed"));
    } finally {
      setOutletBusy(false);
    }
  }

  async function submitOutletRegistration() {
    if (!outletOtpRef || !/^\d{4,8}$/.test(outletOtp)) {
      toast.error("Send OTP and enter valid OTP");
      return;
    }
    if (!outletReg.bankAccountNo || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(outletReg.bankIfsc)) {
      toast.error("Enter valid bank account and IFSC");
      return;
    }
    setOutletRegBusy(true);
    try {
      const res = await postProvider<{ registration: { needsEkyc: boolean; message: string } }>(
        "/txn/nepal/outlet-registration",
        { otpReference: outletOtpRef, otp: outletOtp, ...outletReg },
      );
      toast.success(res.data.registration.message || "Outlet registered");
      await refreshOutletStatus();
    } catch (err) {
      toast.error(extractApiError(err, "Outlet registration failed"));
    } finally {
      setOutletRegBusy(false);
    }
  }

  async function initiateOutletEkyc() {
    setOutletEkycBusy(true);
    try {
      const res = await postProvider<{ ekyc: { redirectUrl: string } }>("/txn/nepal/outlet-ekyc/initiate", {});
      const url = res.data.ekyc.redirectUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Complete eKYC in the opened window, then poll status");
    } catch (err) {
      toast.error(extractApiError(err, "eKYC initiate failed"));
    } finally {
      setOutletEkycBusy(false);
    }
  }

  async function pollOutletEkycStatus() {
    setOutletEkycBusy(true);
    try {
      const res = await postProvider<{ ekycStatus: { ready: boolean; message: string } }>(
        "/txn/nepal/outlet-ekyc/status",
        {},
      );
      if (res.data.ekycStatus.ready) {
        toast.success("eKYC status ready — scan fingerprint to complete");
      } else {
        toast(res.data.ekycStatus.message || "eKYC not ready yet", { icon: "ℹ️" });
      }
    } catch (err) {
      toast.error(extractApiError(err, "eKYC status failed"));
    } finally {
      setOutletEkycBusy(false);
    }
  }

  async function processOutletEkyc() {
    if (rdStatus !== "ready") {
      toast.error("RD Service not ready");
      return;
    }
    setOutletEkycBusy(true);
    try {
      const biometricPayload = await captureFingerprintWeb();
      await postProvider("/txn/nepal/outlet-ekyc/process", { biometricPayload });
      toast.success("Outlet eKYC biometric submitted");
      await refreshOutletStatus();
    } catch (err) {
      toast.error(extractApiError(err, "eKYC process failed"));
      void retryRdWarm();
    } finally {
      setOutletEkycBusy(false);
    }
  }

  const resetRemitterSession = useCallback(() => {
    setProfile(null);
    setNeedsRegister(false);
    setRegOtpRef("");
    setRegOtp("");
    setRemitterEkycKey("");
    setSelectedBene(null);
    setAmount("");
    setQuote(null);
    setTxnOtpRef("");
    setTxnOtp("");
    setTxnPin("");
    setOtpSent(false);
    setLastTxnRef(null);
    setLastPoolRef(null);
    setShowAddBene(false);
    attemptKey.current.clear();
  }, []);

  async function ensureTransferStatic() {
    await Promise.all([
      loadStatic("Gender"),
      loadStatic("Nationality"),
      loadStatic("IDType"),
      loadStatic("IncomeSource"),
      loadStatic("Relationship"),
      loadStatic("RemittanceReason"),
    ]);
    if (!stateRows.length) {
      const res = await postProvider<{ items: StateDistrictRow[] }>("/txn/nepal/state-district", {
        country: "India",
      });
      setStateRows(res.data.items ?? []);
    }
  }

  async function lookupRemitter() {
    const m = mobile.replace(/\D/g, "");
    if (m.length !== 10) {
      toast.error("Enter 10-digit remitter mobile");
      return;
    }
    setLookingUp(true);
    resetRemitterSession();
    try {
      await ensureTransferStatic();
      const res = await postProvider<{ profile: NepalRemitterProfile | null }>("/txn/nepal/remitter/profile", {
        customerMobile: m,
      });
      if (res.data.profile) {
        setProfile(res.data.profile);
        setNeedsRegister(false);
        toast.success(`Remitter: ${res.data.profile.firstName}`);
      } else {
        setNeedsRegister(true);
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
      const res = await postProvider<{ profile: NepalRemitterProfile | null }>("/txn/nepal/remitter/profile", {
        customerMobile: m,
      });
      if (res.data.profile) {
        setProfile(res.data.profile);
        setNeedsRegister(false);
      }
    } catch {
      /* silent */
    }
  }

  async function sendRemitterRegOtp() {
    const m = mobile.replace(/\D/g, "");
    setRegBusy(true);
    try {
      const res = await postProvider<{ otpReference: string }>("/txn/nepal/otp", {
        operation: "RemitterRegistration",
        mobile: m,
      });
      setRegOtpRef(res.data.otpReference);
      toast.success("Registration OTP sent");
    } catch (err) {
      toast.error(extractApiError(err, "OTP failed"));
    } finally {
      setRegBusy(false);
    }
  }

  async function submitRemitterRegistration() {
    const m = mobile.replace(/\D/g, "");
    if (!regOtpRef || !/^\d{4,8}$/.test(regOtp)) {
      toast.error("Send OTP and enter valid OTP");
      return;
    }
    if (!regForm.name.trim() || !regForm.dob || !regForm.state || !regForm.district) {
      toast.error("Fill required remitter fields");
      return;
    }
    setRegBusy(true);
    try {
      const res = await postProvider<{ profile: NepalRemitterProfile }>("/txn/nepal/remitter/register", {
        ...regForm,
        mobile: m,
        otpReference: regOtpRef,
        otp: regOtp,
      });
      setProfile(res.data.profile);
      setNeedsRegister(false);
      toast.success("Remitter registered");
    } catch (err) {
      toast.error(extractApiError(err, "Registration failed"));
    } finally {
      setRegBusy(false);
    }
  }

  async function initiateRemitterEkyc() {
    if (!profile?.id) return;
    setRemitterEkycBusy(true);
    try {
      const res = await postProvider<{ ekyc: { redirectUrl: string; referenceKey: string } }>(
        "/txn/nepal/remitter/ekyc/initiate",
        { remitterId: profile.id },
      );
      setRemitterEkycKey(res.data.ekyc.referenceKey);
      const url = res.data.ekyc.redirectUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Complete remitter eKYC in opened window");
    } catch (err) {
      toast.error(extractApiError(err, "Remitter eKYC initiate failed"));
    } finally {
      setRemitterEkycBusy(false);
    }
  }

  async function pollRemitterEkycStatus() {
    if (!profile?.id || !remitterEkycKey) {
      toast.error("Initiate eKYC first");
      return;
    }
    setRemitterEkycBusy(true);
    try {
      const res = await postProvider<{ ekycStatus: { ready: boolean; message: string } }>(
        "/txn/nepal/remitter/ekyc/status",
        { remitterId: profile.id, referenceKey: remitterEkycKey },
      );
      if (res.data.ekycStatus.ready) {
        toast.success("Remitter eKYC ready — scan fingerprint");
      } else {
        toast(res.data.ekycStatus.message || "Not ready yet", { icon: "ℹ️" });
      }
    } catch (err) {
      toast.error(extractApiError(err, "eKYC status failed"));
    } finally {
      setRemitterEkycBusy(false);
    }
  }

  async function processRemitterEkyc() {
    if (!profile?.id || !remitterEkycKey) {
      toast.error("Initiate eKYC first");
      return;
    }
    if (rdStatus !== "ready") {
      toast.error("RD Service not ready");
      return;
    }
    setRemitterEkycBusy(true);
    try {
      const biometricPayload = await captureFingerprintWeb();
      await postProvider("/txn/nepal/remitter/ekyc/process", {
        remitterId: profile.id,
        referenceKey: remitterEkycKey,
        biometricPayload,
      });
      toast.success("Remitter eKYC done");
      await refreshProfile();
    } catch (err) {
      toast.error(extractApiError(err, "Remitter eKYC failed"));
      void retryRdWarm();
    } finally {
      setRemitterEkycBusy(false);
    }
  }

  async function loadBeneLocations(mode: "Cash Payment" | "Account Deposit") {
    try {
      const type = mode === "Account Deposit" ? "ACCOUNTPAY" : "CASHPAY";
      const body =
        mode === "Account Deposit"
          ? { type, country: "NEPAL" }
          : { type };
      const res = await postProvider<{ locations: NepalPaymentLocation[] }>("/txn/nepal/payment-locations", body);
      setPaymentLocations(res.data.locations ?? []);
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load payment locations"));
    }
  }

  async function submitBeneficiary() {
    const m = mobile.replace(/\D/g, "");
    if (!beneForm.name.trim() || !beneForm.mobile || !beneForm.relationship) {
      toast.error("Fill beneficiary details");
      return;
    }
    if (beneForm.paymentMode === "Account Deposit" && (!beneForm.bankBranchId || !beneForm.accountNumber)) {
      toast.error("Account Deposit requires branch and account number");
      return;
    }
    setBeneBusy(true);
    try {
      const res = await postProvider<{ profile: NepalRemitterProfile; beneficiaryId: string }>(
        "/txn/nepal/beneficiary/register",
        {
          remitterMobile: m,
          name: beneForm.name.trim(),
          gender: beneForm.gender,
          mobile: beneForm.mobile,
          relationship: beneForm.relationship,
          address: beneForm.address,
          paymentMode: beneForm.paymentMode,
          bankBranchId: beneForm.bankBranchId || undefined,
          accountNumber: beneForm.accountNumber || undefined,
        },
      );
      setProfile(res.data.profile);
      setShowAddBene(false);
      setBeneForm({
        name: "",
        gender: "",
        mobile: "",
        relationship: "",
        address: "",
        paymentMode: "Cash Payment",
        bankBranchId: "",
        accountNumber: "",
        locationId: "",
      });
      toast.success(`Beneficiary added (${res.data.beneficiaryId})`);
    } catch (err) {
      toast.error(extractApiError(err, "Add beneficiary failed"));
    } finally {
      setBeneBusy(false);
    }
  }

  async function fetchQuote() {
    const m = mobile.replace(/\D/g, "");
    if (!selectedBene) {
      toast.error("Select beneficiary");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt < 1 || amt > 50_000) {
      toast.error("Amount must be ₹1 – ₹50,000");
      return;
    }
    setQuoteBusy(true);
    try {
      const body: Record<string, string> = {
        remitterMobile: m,
        paymentMode: selectedBene.paymentMode,
        transferAmount: String(amt),
        beneficiaryId: selectedBene.id,
      };
      if (/account\s*deposit/i.test(selectedBene.paymentMode) && selectedBene.bankBranchId) {
        body.bankBranchId = String(selectedBene.bankBranchId);
      }
      const res = await postProvider<{ quote: NepalServiceChargeQuote }>("/txn/nepal/service-charge", body);
      setQuote(res.data.quote);
    } catch (err) {
      toast.error(extractApiError(err, "Quote failed"));
      setQuote(null);
    } finally {
      setQuoteBusy(false);
    }
  }

  async function sendTransferOtp() {
    const m = mobile.replace(/\D/g, "");
    if (!selectedBene) {
      toast.error("Select beneficiary");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt < 1 || amt > 50_000) {
      toast.error("Amount must be ₹1 – ₹50,000");
      return;
    }
    if (!quote) {
      toast.error("Get quote first");
      return;
    }
    setTxnBusy(true);
    try {
      const payload: Record<string, string> = {
        operation: "FundTransfer",
        mobile: m,
        beneficiaryId: selectedBene.id,
        paymentMode: selectedBene.paymentMode,
        transferAmount: String(amt),
      };
      if (/account\s*deposit/i.test(selectedBene.paymentMode)) {
        if (selectedBene.bankBranchId) payload.bankBranchId = String(selectedBene.bankBranchId);
        if (selectedBene.acNumber) payload.accountNumber = selectedBene.acNumber;
      }
      const res = await postProvider<{ otpReference: string }>("/txn/nepal/otp", payload);
      setTxnOtpRef(res.data.otpReference);
      setOtpSent(true);
      toast.success("Transfer OTP sent");
    } catch (err) {
      toast.error(extractApiError(err, "OTP request failed"));
    } finally {
      setTxnBusy(false);
    }
  }

  async function submitTransfer() {
    const m = mobile.replace(/\D/g, "");
    if (!selectedBene || !txnOtpRef) {
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
    if (!remittanceReason) {
      toast.error("Select remittance reason");
      return;
    }
    setTxnBusy(true);
    try {
      const coords = await getCoords();
      const { data } = await api.post<
        ApiResponse<{
          txn?: { txnRef?: string };
          provider?: ProviderEnvelope<Record<string, unknown>>;
        }>
      >("/txn/nepal/fund-transfer", {
        remitterMobile: m,
        beneficiaryId: selectedBene.id,
        transferAmount: String(Number(amount)),
        remittanceReason,
        otpReference: txnOtpRef,
        otp: txnOtp,
        latitude: coords.latitude,
        longitude: coords.longitude,
        txnPin,
        idempotencyKey: attemptKey.current.get(),
      });
      if (!data.success) throw new Error(data.message || "Transfer failed");
      const txnRef = data.data?.txn?.txnRef ?? null;
      const poolRef =
        (data.data?.provider?.data?.poolReferenceId as string | undefined) ??
        (data.data?.provider?.providerTxnId as string | undefined) ??
        null;
      setLastTxnRef(txnRef);
      setLastPoolRef(poolRef);
      attemptKey.current.clear();
      setOtpSent(false);
      setTxnOtp("");
      setTxnPin("");
      setTxnOtpRef("");
      setAmount("");
      setQuote(null);
      toast.success(txnRef ? `Transfer submitted — ${txnRef}` : "Transfer submitted");
      await refreshProfile();
    } catch (err) {
      toast.error(extractApiError(err, "Transfer failed"));
    } finally {
      setTxnBusy(false);
    }
  }

  async function checkTxnStatus() {
    if (statusIpayId.trim().length < 4) {
      toast.error("Enter InstantPay order id (ipayId)");
      return;
    }
    setStatusBusy(true);
    setStatusResult(null);
    try {
      const coords = await getCoords();
      const res = await postProvider<{ txnStatus: NepalTxnStatus }>("/txn/nepal/txn-status", {
        ipayId: statusIpayId.trim(),
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      setStatusResult(res.data.txnStatus);
    } catch (err) {
      toast.error(extractApiError(err, "Status check failed"));
    } finally {
      setStatusBusy(false);
    }
  }

  const showOutletRegister = outlet?.actcode === "OUTLETREGISTER";
  const showOutletEkyc =
    outlet?.actcode === "OUTLETEKYC" || (outlet && !outlet.ready && outlet.actcode !== "OTPVERFCTN" && outlet.actcode !== "OUTLETREGISTER");

  /* ── Agent auth gate ─────────────────────────────────────────────── */

  if (agentAuthReady === null) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-gray-500">Checking today&apos;s Nepal verification…</p>
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
                Mandatory 2FA for Nepal Access
              </h1>
              <p className="text-xs" style={{ color: B.muted }}>
                Verify once daily before Nepal remittance (same as DMT / AePS).
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
                <span>I accept Aadhaar Consent for today&apos;s Nepal access.</span>
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
                loopGlow
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
                  Scan finger once — Nepal unlocks for the day
                </li>
              </ol>
            </div>
            <div className="rounded-2xl border bg-amber-50 p-4" style={{ borderColor: "#FDE68A" }}>
              <p className="text-xs font-semibold leading-relaxed text-amber-800">
                Open the RD Service app on this PC before scanning. Same device must be used for
                Nepal remittance after unlock.
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

  /* ── Main portal ─────────────────────────────────────────────────── */

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
              Nepal Remittance
            </h1>
            <p className="text-xs" style={{ color: B.muted }}>
              Cross-border to Nepal · ₹50,000 / txn · 3/day · 5/month · 6/year per remitter
            </p>
          </div>
          <Globe2 className="text-blue-600" size={28} />
        </div>

        <div className="mb-4 flex gap-1 rounded-xl border bg-white p-1">
          {NEPAL_TABS.map((t) => (
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

        {/* ── Outlet tab ── */}
        {tab === "Outlet" && (
          <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Outlet onboarding</h2>
              <button
                type="button"
                disabled={outletBusy}
                onClick={() => void refreshOutletStatus()}
                className="text-xs font-bold text-blue-600 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {outletBusy && !outlet && (
              <p className="text-sm text-gray-500">Loading outlet status…</p>
            )}

            {outlet?.ready && (
              <div className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
                <Check size={16} className="mr-1 inline text-green-600" />
                Outlet ready — CSP: <span className="font-bold">{outlet.cspCode ?? "—"}</span>
              </div>
            )}

            {outlet && !outlet.ready && (
              <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {outlet.message || "Outlet not ready"} · actcode:{" "}
                <span className="font-mono font-bold">{outlet.actcode ?? "—"}</span>
              </div>
            )}

            {outlet?.actcode === "OTPVERFCTN" && (
              <button
                type="button"
                disabled={outletBusy}
                onClick={() => void refreshOutletStatus(true)}
                className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                Recheck OTP verification
              </button>
            )}

            {showOutletRegister && (
              <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                <p className="text-sm font-semibold text-gray-800">Outlet registration</p>
                {!outletOtpRef ? (
                  <button
                    type="button"
                    disabled={outletBusy}
                    onClick={() => void sendOutletOtp()}
                    className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Send registration OTP
                  </button>
                ) : (
                  <>
                    <input
                      value={outletOtp}
                      onChange={(e) => setOutletOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      placeholder="OTP"
                      inputMode="numeric"
                      className={inputCls()}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls()}>Gender</label>
                        <select
                          value={outletReg.gender}
                          onChange={(e) =>
                            setOutletReg((f) => ({ ...f, gender: e.target.value as typeof f.gender }))
                          }
                          className={clsx(selectCls(), "mt-1")}
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls()}>Category</label>
                        <select
                          value={outletReg.category}
                          onChange={(e) =>
                            setOutletReg((f) => ({ ...f, category: e.target.value as typeof f.category }))
                          }
                          className={clsx(selectCls(), "mt-1")}
                        >
                          {(["General", "OBC", "ST", "SC"] as const).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls()}>Father / spouse name</label>
                        <input
                          value={outletReg.fatherOrSpouseName}
                          onChange={(e) => setOutletReg((f) => ({ ...f, fatherOrSpouseName: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div>
                        <label className={labelCls()}>Education</label>
                        <select
                          value={outletReg.highestEducation}
                          onChange={(e) =>
                            setOutletReg((f) => ({
                              ...f,
                              highestEducation: e.target.value as typeof f.highestEducation,
                            }))
                          }
                          className={clsx(selectCls(), "mt-1")}
                        >
                          {(["Under 10th", "10th", "12th", "Graduate", "Post Graduate"] as const).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls()}>Device</label>
                        <select
                          value={outletReg.deviceName}
                          onChange={(e) =>
                            setOutletReg((f) => ({ ...f, deviceName: e.target.value as typeof f.deviceName }))
                          }
                          className={clsx(selectCls(), "mt-1")}
                        >
                          <option value="Handheld">Handheld</option>
                          <option value="Laptop">Laptop</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls()}>Hours from</label>
                        <input
                          value={outletReg.operatingHoursFrom}
                          onChange={(e) => setOutletReg((f) => ({ ...f, operatingHoursFrom: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div>
                        <label className={labelCls()}>Hours to</label>
                        <input
                          value={outletReg.operatingHoursTo}
                          onChange={(e) => setOutletReg((f) => ({ ...f, operatingHoursTo: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div>
                        <label className={labelCls()}>Bank account</label>
                        <input
                          value={outletReg.bankAccountNo}
                          onChange={(e) =>
                            setOutletReg((f) => ({ ...f, bankAccountNo: e.target.value.replace(/\D/g, "").slice(0, 24) }))
                          }
                          inputMode="numeric"
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div>
                        <label className={labelCls()}>IFSC</label>
                        <input
                          value={outletReg.bankIfsc}
                          onChange={(e) =>
                            setOutletReg((f) => ({
                              ...f,
                              bankIfsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11),
                            }))
                          }
                          className={clsx(inputCls(), "mt-1 font-mono")}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls()}>Account name</label>
                        <input
                          value={outletReg.accountName}
                          onChange={(e) => setOutletReg((f) => ({ ...f, accountName: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={outletRegBusy}
                      onClick={() => void submitOutletRegistration()}
                      className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {outletRegBusy ? "Submitting…" : "Submit outlet registration"}
                    </button>
                  </>
                )}
              </div>
            )}

            {showOutletEkyc && (
              <div className="space-y-2 rounded-xl border border-purple-100 bg-purple-50/40 p-3">
                <p className="text-sm font-semibold text-gray-800">Outlet eKYC</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={outletEkycBusy}
                    onClick={() => void initiateOutletEkyc()}
                    className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Initiate eKYC
                  </button>
                  <button
                    type="button"
                    disabled={outletEkycBusy}
                    onClick={() => void pollOutletEkycStatus()}
                    className="rounded-xl border bg-white px-4 py-2 text-xs font-bold text-gray-700 disabled:opacity-50"
                  >
                    Poll status
                  </button>
                  <button
                    type="button"
                    disabled={outletEkycBusy}
                    onClick={() => void processOutletEkyc()}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Scan finger & process
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Transfer tab ── */}
        {tab === "Transfer" && (
          <div className="space-y-4">
            {outlet && !outlet.ready && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Outlet not ready — complete Outlet tab first. Transfers may fail until CSP is approved.
              </div>
            )}

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <label className={labelCls()}>REMITTER MOBILE</label>
              <div className="mt-2 flex gap-2">
                <input
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void lookupRemitter();
                  }}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  className={clsx(inputCls(), "flex-1 font-semibold")}
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
                  <span className="font-semibold text-gray-900">{profile.firstName}</span>
                  <span className="text-gray-500">·</span>
                  <span className="text-gray-600">
                    Txns today {profile.transactionCount.day} / month {profile.transactionCount.month} / year{" "}
                    {profile.transactionCount.year}
                  </span>
                  <span className="text-gray-500">·</span>
                  <span className="text-gray-600">eKYC: {profile.eKycStatus || "—"}</span>
                </div>
              )}
            </div>

            {needsRegister && (
              <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
                <h2 className="font-bold text-amber-900">Register remitter</h2>
                {!regOtpRef ? (
                  <button
                    type="button"
                    disabled={regBusy}
                    onClick={() => void sendRemitterRegOtp()}
                    className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Send registration OTP
                  </button>
                ) : (
                  <>
                    <input
                      value={regOtp}
                      onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      placeholder="OTP"
                      inputMode="numeric"
                      className={inputCls()}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className={labelCls()}>Full name</label>
                        <input
                          value={regForm.name}
                          onChange={(e) => setRegForm((f) => ({ ...f, name: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div>
                        <label className={labelCls()}>Gender</label>
                        <select
                          value={regForm.gender}
                          onChange={(e) => setRegForm((f) => ({ ...f, gender: e.target.value }))}
                          className={clsx(selectCls(), "mt-1")}
                        >
                          <option value="">Select</option>
                          {(staticCache.Gender ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls()}>DOB</label>
                        <input
                          type="date"
                          value={regForm.dob}
                          onChange={(e) => setRegForm((f) => ({ ...f, dob: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls()}>Address</label>
                        <input
                          value={regForm.address}
                          onChange={(e) => setRegForm((f) => ({ ...f, address: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div>
                        <label className={labelCls()}>City</label>
                        <input
                          value={regForm.city}
                          onChange={(e) => setRegForm((f) => ({ ...f, city: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div>
                        <label className={labelCls()}>State</label>
                        <select
                          value={regForm.state}
                          onChange={(e) =>
                            setRegForm((f) => ({ ...f, state: e.target.value, district: "" }))
                          }
                          className={clsx(selectCls(), "mt-1")}
                        >
                          <option value="">Select</option>
                          {[...stateGroups.keys()].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls()}>District</label>
                        <select
                          value={regForm.district}
                          onChange={(e) => setRegForm((f) => ({ ...f, district: e.target.value }))}
                          className={clsx(selectCls(), "mt-1")}
                        >
                          <option value="">Select</option>
                          {districtsForState.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls()}>Nationality</label>
                        <select
                          value={regForm.nationality}
                          onChange={(e) => setRegForm((f) => ({ ...f, nationality: e.target.value }))}
                          className={clsx(selectCls(), "mt-1")}
                        >
                          <option value="">Select</option>
                          {(staticCache.Nationality ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls()}>ID type</label>
                        <select
                          value={regForm.idType}
                          onChange={(e) => setRegForm((f) => ({ ...f, idType: e.target.value }))}
                          className={clsx(selectCls(), "mt-1")}
                        >
                          <option value="">Select</option>
                          {(staticCache.IDType ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls()}>ID number</label>
                        <input
                          value={regForm.idNumber}
                          onChange={(e) => setRegForm((f) => ({ ...f, idNumber: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div>
                        <label className={labelCls()}>Income source</label>
                        <select
                          value={regForm.incomeSource}
                          onChange={(e) => setRegForm((f) => ({ ...f, incomeSource: e.target.value }))}
                          className={clsx(selectCls(), "mt-1")}
                        >
                          <option value="">Select</option>
                          {(staticCache.IncomeSource ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls()}>Employer</label>
                        <input
                          value={regForm.employer}
                          onChange={(e) => setRegForm((f) => ({ ...f, employer: e.target.value }))}
                          className={clsx(inputCls(), "mt-1")}
                        />
                      </div>
                      <div>
                        <label className={labelCls()}>Remitter type</label>
                        <select
                          value={regForm.remitterType}
                          onChange={(e) =>
                            setRegForm((f) => ({
                              ...f,
                              remitterType: Number(e.target.value) as typeof f.remitterType,
                            }))
                          }
                          className={clsx(selectCls(), "mt-1")}
                        >
                          {REMITTER_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls()}>Income source type</label>
                        <select
                          value={regForm.incomeSourceType}
                          onChange={(e) =>
                            setRegForm((f) => ({
                              ...f,
                              incomeSourceType: Number(e.target.value) as typeof f.incomeSourceType,
                            }))
                          }
                          className={clsx(selectCls(), "mt-1")}
                        >
                          {INCOME_SOURCE_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls()}>Annual income band</label>
                        <select
                          value={regForm.annualIncome}
                          onChange={(e) =>
                            setRegForm((f) => ({
                              ...f,
                              annualIncome: Number(e.target.value) as typeof f.annualIncome,
                            }))
                          }
                          className={clsx(selectCls(), "mt-1")}
                        >
                          {ANNUAL_INCOME_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={regBusy}
                      onClick={() => void submitRemitterRegistration()}
                      className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {regBusy ? "Submitting…" : "Register remitter"}
                    </button>
                  </>
                )}
              </div>
            )}

            {profile && isRemitterEkycPending(profile) && (
              <div className="space-y-2 rounded-2xl border border-purple-100 bg-purple-50/40 p-4 shadow-sm">
                <h2 className="font-bold text-purple-900">Remitter eKYC</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={remitterEkycBusy}
                    onClick={() => void initiateRemitterEkyc()}
                    className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Initiate eKYC
                  </button>
                  <button
                    type="button"
                    disabled={remitterEkycBusy}
                    onClick={() => void pollRemitterEkycStatus()}
                    className="rounded-xl border bg-white px-4 py-2 text-xs font-bold disabled:opacity-50"
                  >
                    Poll status
                  </button>
                  <button
                    type="button"
                    disabled={remitterEkycBusy}
                    onClick={() => void processRemitterEkyc()}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Scan finger & process
                  </button>
                </div>
              </div>
            )}

            {profile && (
              <>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-bold text-gray-900">Beneficiaries ({profile.beneficiaries.length})</h2>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddBene((v) => !v);
                        if (!showAddBene) void loadBeneLocations(beneForm.paymentMode);
                      }}
                      className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  </div>

                  {showAddBene && (
                    <div className="mb-4 space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                      <select
                        value={beneForm.paymentMode}
                        onChange={(e) => {
                          const mode = e.target.value as "Cash Payment" | "Account Deposit";
                          setBeneForm((f) => ({
                            ...f,
                            paymentMode: mode,
                            bankBranchId: "",
                            locationId: "",
                          }));
                          void loadBeneLocations(mode);
                        }}
                        className={selectCls()}
                      >
                        <option value="Cash Payment">Cash Payment</option>
                        <option value="Account Deposit">Account Deposit</option>
                      </select>
                      <input
                        value={beneForm.name}
                        onChange={(e) => setBeneForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Beneficiary name"
                        className={inputCls()}
                      />
                      <select
                        value={beneForm.gender}
                        onChange={(e) => setBeneForm((f) => ({ ...f, gender: e.target.value }))}
                        className={selectCls()}
                      >
                        <option value="">Gender</option>
                        {(staticCache.Gender ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={beneForm.mobile}
                        onChange={(e) => setBeneForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, "").slice(0, 15) }))}
                        placeholder="Nepal mobile (8–15 digits)"
                        inputMode="numeric"
                        className={inputCls()}
                      />
                      <select
                        value={beneForm.relationship}
                        onChange={(e) => setBeneForm((f) => ({ ...f, relationship: e.target.value }))}
                        className={selectCls()}
                      >
                        <option value="">Relationship</option>
                        {(staticCache.Relationship ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={beneForm.address}
                        onChange={(e) => setBeneForm((f) => ({ ...f, address: e.target.value }))}
                        placeholder="Address in Nepal"
                        className={inputCls()}
                      />
                      <select
                        value={beneForm.locationId}
                        onChange={(e) => {
                          const loc = paymentLocations.find((l) => String(l.locationId) === e.target.value);
                          setBeneForm((f) => ({
                            ...f,
                            locationId: e.target.value,
                            bankBranchId: loc ? String(loc.bankBranchId) : "",
                          }));
                        }}
                        className={selectCls()}
                      >
                        <option value="">Payment location / branch</option>
                        {paymentLocations.map((l) => (
                          <option key={String(l.locationId)} value={String(l.locationId)}>
                            {l.locationName || l.branchName} — {l.bankName}
                          </option>
                        ))}
                      </select>
                      {beneForm.paymentMode === "Account Deposit" && (
                        <input
                          value={beneForm.accountNumber}
                          onChange={(e) =>
                            setBeneForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 24) }))
                          }
                          placeholder="Account number"
                          inputMode="numeric"
                          className={inputCls()}
                        />
                      )}
                      <button
                        type="button"
                        disabled={beneBusy}
                        onClick={() => void submitBeneficiary()}
                        className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {beneBusy ? "Adding…" : "Add beneficiary"}
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    {profile.beneficiaries.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setSelectedBene(b);
                          setQuote(null);
                          setOtpSent(false);
                          setTxnOtpRef("");
                          attemptKey.current.clear();
                        }}
                        className={clsx(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                          selectedBene?.id === b.id ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-gray-900">{b.name}</p>
                          <p className="truncate text-xs text-gray-500">
                            {b.paymentMode} · {b.mobile}
                            {b.acNumber ? ` · ${b.acNumber}` : ""}
                          </p>
                        </div>
                        {selectedBene?.id === b.id && <Check size={18} className="text-blue-600" />}
                      </button>
                    ))}
                    {profile.beneficiaries.length === 0 && (
                      <p className="text-sm text-gray-500">No beneficiaries yet.</p>
                    )}
                  </div>
                </div>

                {selectedBene && (
                  <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
                    <div>
                      <p className={labelCls()}>AMOUNT (INR)</p>
                      <input
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value.replace(/[^\d.]/g, ""));
                          setQuote(null);
                          setOtpSent(false);
                          setTxnOtpRef("");
                          attemptKey.current.clear();
                        }}
                        placeholder="Max 50000"
                        inputMode="decimal"
                        className={clsx(inputCls(), "mt-1 font-semibold")}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {QUICK_AMOUNTS.map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => {
                              setAmount(String(a));
                              setQuote(null);
                              setOtpSent(false);
                              setTxnOtpRef("");
                              attemptKey.current.clear();
                            }}
                            className="rounded-lg border px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50"
                          >
                            ₹{a.toLocaleString("en-IN")}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className={labelCls()}>REMITTANCE REASON</p>
                      <select
                        value={remittanceReason}
                        onChange={(e) => setRemittanceReason(e.target.value)}
                        className={clsx(selectCls(), "mt-1")}
                      >
                        <option value="">Select reason</option>
                        {(staticCache.RemittanceReason ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={quoteBusy}
                      onClick={() => void fetchQuote()}
                      className="w-full rounded-xl border py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {quoteBusy ? "Quoting…" : "Get FX quote"}
                    </button>

                    {quote && (
                      <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900">
                        <p>
                          Transfer ₹{quote.transferAmount} → NPR {quote.payoutAmount} @ {quote.exchangeRate}
                        </p>
                        <p className="text-xs text-blue-700">
                          Charge ₹{quote.serviceCharge} · Collect ₹{quote.collectionAmount}{" "}
                          {quote.collectionCurrency}
                        </p>
                      </div>
                    )}

                    {!otpSent ? (
                      <button
                        type="button"
                        disabled={txnBusy || !quote}
                        onClick={() => void sendTransferOtp()}
                        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {txnBusy ? "Sending OTP…" : "Send transfer OTP"}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className={labelCls()}>REMITTER OTP</label>
                          <input
                            value={txnOtp}
                            onChange={(e) => setTxnOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                            placeholder="OTP"
                            inputMode="numeric"
                            className={clsx(inputCls(), "mt-1 font-semibold")}
                          />
                        </div>
                        <div>
                          <label className={labelCls()}>TRANSACTION PIN</label>
                          <input
                            type="password"
                            value={txnPin}
                            onChange={(e) => setTxnPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            placeholder="4-digit PIN"
                            inputMode="numeric"
                            maxLength={4}
                            className={clsx(inputCls(), "mt-1 font-semibold")}
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

                    {(lastTxnRef || lastPoolRef) && (
                      <div className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
                        {lastTxnRef && (
                          <p>
                            Txn ref: <span className="font-bold">{lastTxnRef}</span>
                          </p>
                        )}
                        {lastPoolRef && (
                          <p>
                            Pool ref: <span className="font-mono font-bold">{lastPoolRef}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {!profile && !needsRegister && (
              <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">
                Search remitter mobile to start transfer.
              </div>
            )}
          </div>
        )}

        {/* ── Status tab ── */}
        {tab === "Status" && (
          <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-600">
              Check InstantPay Nepal txn by <strong>ipayId</strong> (order id / pool reference from fund transfer).
            </p>
            <div>
              <label className={labelCls()}>IPAY ID</label>
              <input
                value={statusIpayId}
                onChange={(e) => {
                  setStatusIpayId(e.target.value.trim());
                  setStatusResult(null);
                }}
                placeholder="e.g. MOCK-POOL-abc12345"
                className={clsx(inputCls(), "mt-1 font-mono")}
              />
            </div>
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => void checkTxnStatus()}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {statusBusy ? "Checking…" : "Check status"}
            </button>
            {statusResult && (
              <div
                className={clsx(
                  "rounded-xl px-3 py-2 text-sm",
                  statusResult.ready ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900",
                )}
              >
                <p className="font-bold">{statusResult.statuscode}</p>
                <p>{statusResult.message}</p>
                {statusResult.actcode && <p className="text-xs">actcode: {statusResult.actcode}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
