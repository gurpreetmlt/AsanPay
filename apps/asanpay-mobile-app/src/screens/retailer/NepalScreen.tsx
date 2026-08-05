import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { createAttemptKeyHolder } from "../../lib/idempotencyKey";
import { captureFingerprint } from "../../lib/rdServiceFingerprint";
import { useTxnPin } from "../../hooks/useTxnPin";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";

interface NepalScreenProps {
  onBack: () => void;
}

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

interface NepalOutletStatus {
  statuscode: string;
  actcode: string | null;
  message: string;
  cspStatus: string | null;
  cspCode: string | null;
  ready: boolean;
}

interface NepalRemitterTxnCount {
  day: string;
  month: string;
  year: string;
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
  onboardingStatus: string;
  approveStatus: string;
  approveComment: string;
  transactionCount: NepalRemitterTxnCount;
  beneficiaries: NepalBeneficiary[];
}

interface NepalLocation {
  locationId: string;
  locationName: string;
  bankBranchId: string;
  bankName: string;
  branchName: string;
  state: string;
  district: string;
}

interface NepalQuote {
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
}

type NepalTab = "Outlet" | "Transfer" | "Status";

const TABS: NepalTab[] = ["Outlet", "Transfer", "Status"];
const FALLBACK_COORDS = { latitude: "28.6139", longitude: "77.2090" };

async function postProvider<T>(url: string, body: unknown): Promise<ProviderEnvelope<T>> {
  const { data } = await api.post<ApiResponse<ProviderEnvelope<T>>>(url, body);
  if (!data.success) throw new Error(data.message || "Request failed");
  if (!data.data?.success) throw new Error(data.data?.message || "Provider request failed");
  return data.data;
}

async function getCoords(): Promise<{ latitude: string; longitude: string }> {
  return FALLBACK_COORDS;
}

function SelectChips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: StaticOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <Pressable
              key={`${label}-${option.value}`}
              onPress={() => onChange(option.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad" | "numeric";
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
    </View>
  );
}

export function NepalScreen({ onBack }: NepalScreenProps) {
  const { tokens } = useTheme();
  const { promptPin, TxnPinPrompt } = useTxnPin();
  const transferAttemptKey = useRef(createAttemptKeyHolder("nepal-mobile"));

  const [tab, setTab] = useState<NepalTab>("Outlet");
  const [agentAuthReady, setAgentAuthReady] = useState<boolean | null>(null);
  const [agentAuthKycReady, setAgentAuthKycReady] = useState(true);
  const [agentAadhaar, setAgentAadhaar] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [outletBusy, setOutletBusy] = useState(false);
  const [outlet, setOutlet] = useState<NepalOutletStatus | null>(null);
  const [outletOtpRef, setOutletOtpRef] = useState("");
  const [outletOtp, setOutletOtp] = useState("");
  const [outletReg, setOutletReg] = useState({
    gender: "Male",
    category: "General",
    fatherOrSpouseName: "",
    physicallyHandicapped: "Not Handicapped",
    alternateOccupationType: "None",
    alternateOccupationDescription: "",
    highestEducation: "Graduate",
    operatingHoursFrom: "09:00",
    operatingHoursTo: "19:00",
    course: "None",
    courseCompletionDate: "",
    instituteName: "",
    deviceName: "Handheld",
    connectivityType: "Mobile",
    connectionProvider: "",
    weeklyOff: "Sunday",
    expectedAnnualTurnover: "200000",
    expectedAnnualIncome: "120000",
    bankAccountNo: "",
    bankIfsc: "",
    accountName: "",
  });

  const [staticGender, setStaticGender] = useState<StaticOption[]>([]);
  const [staticNationality, setStaticNationality] = useState<StaticOption[]>([]);
  const [staticIdType, setStaticIdType] = useState<StaticOption[]>([]);
  const [staticIncomeSource, setStaticIncomeSource] = useState<StaticOption[]>([]);
  const [staticRelationship, setStaticRelationship] = useState<StaticOption[]>([]);
  const [staticPaymentMode, setStaticPaymentMode] = useState<StaticOption[]>([]);
  const [staticRemitReason, setStaticRemitReason] = useState<StaticOption[]>([]);

  const [mobile, setMobile] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [profile, setProfile] = useState<NepalRemitterProfile | null>(null);
  const [regOtpRef, setRegOtpRef] = useState("");
  const [regOtp, setRegOtp] = useState("");
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
  });

  const [remitterEkycKey, setRemitterEkycKey] = useState("");
  const [remitterBusy, setRemitterBusy] = useState(false);

  const [paymentMode, setPaymentMode] = useState("Cash Payment");
  const [locations, setLocations] = useState<NepalLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [beneForm, setBeneForm] = useState({
    name: "",
    gender: "",
    mobile: "",
    relationship: "",
    address: "",
    accountNumber: "",
  });
  const [beneBusy, setBeneBusy] = useState(false);

  const [selectedBeneId, setSelectedBeneId] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<NepalQuote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [txnOtpRef, setTxnOtpRef] = useState("");
  const [txnOtp, setTxnOtp] = useState("");
  const [remittanceReason, setRemittanceReason] = useState("");
  const [txnBusy, setTxnBusy] = useState(false);
  const [lastTxnRef, setLastTxnRef] = useState("");
  const [lastPoolRef, setLastPoolRef] = useState("");

  const [ipayId, setIpayId] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusResult, setStatusResult] = useState<NepalTxnStatus | null>(null);

  const selectedBene = useMemo(
    () => profile?.beneficiaries.find((item) => item.id === selectedBeneId) ?? null,
    [profile?.beneficiaries, selectedBeneId],
  );
  const selectedLocation = useMemo(
    () => locations.find((item) => item.locationId === selectedLocationId || item.bankBranchId === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );
  const needsOutletRegistration = outlet?.actcode === "OUTLETREGISTER";
  const needsOutletOtpCheck = outlet?.actcode === "OTPVERFCTN";
  const needsOutletEkyc = outlet?.actcode === "OUTLETEKYC";
  const needsRemitterEkyc = Boolean(profile && !/^verified$/i.test(profile.eKycStatus || ""));

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
    void loadStatic("Gender", setStaticGender);
    void loadStatic("Nationality", setStaticNationality);
    void loadStatic("IDType", setStaticIdType);
    void loadStatic("IncomeSource", setStaticIncomeSource);
    void loadStatic("Relationship", setStaticRelationship);
    void loadStatic("PaymentMode", setStaticPaymentMode);
    void loadStatic("RemittanceReason", setStaticRemitReason);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (agentAuthReady !== true) return;
    void refreshOutletStatus();
  }, [agentAuthReady]);

  useEffect(() => {
    if (!staticGender.length) return;
    setRegForm((prev) => ({ ...prev, gender: prev.gender || staticGender[0]!.value }));
    setBeneForm((prev) => ({ ...prev, gender: prev.gender || staticGender[0]!.value }));
  }, [staticGender]);

  useEffect(() => {
    if (!staticNationality.length) return;
    setRegForm((prev) => ({ ...prev, nationality: prev.nationality || staticNationality[0]!.value }));
  }, [staticNationality]);

  useEffect(() => {
    if (!staticIdType.length) return;
    setRegForm((prev) => ({ ...prev, idType: prev.idType || staticIdType[0]!.value }));
  }, [staticIdType]);

  useEffect(() => {
    if (!staticIncomeSource.length) return;
    setRegForm((prev) => ({ ...prev, incomeSource: prev.incomeSource || staticIncomeSource[0]!.value }));
  }, [staticIncomeSource]);

  useEffect(() => {
    if (!staticRelationship.length) return;
    setBeneForm((prev) => ({ ...prev, relationship: prev.relationship || staticRelationship[0]!.value }));
  }, [staticRelationship]);

  useEffect(() => {
    if (!staticRemitReason.length) return;
    setRemittanceReason((prev) => prev || staticRemitReason[0]!.value);
  }, [staticRemitReason]);

  useEffect(() => {
    if (!paymentMode) return;
    void loadLocations(paymentMode);
  }, [paymentMode]);

  async function loadStatic(type: string, setter: (options: StaticOption[]) => void) {
    try {
      const res = await postProvider<{ items: StaticOption[] }>("/txn/nepal/static-data", { type });
      setter(res.data.items ?? []);
    } catch {
      setter([]);
    }
  }

  async function loadLocations(mode: string) {
    try {
      const type = /account/i.test(mode) ? "ACCOUNTPAY" : "CASHPAY";
      const res = await postProvider<{ locations: NepalLocation[] }>("/txn/nepal/payment-locations", {
        type,
        country: "NEPAL",
      });
      setLocations(res.data.locations ?? []);
      const first = res.data.locations?.[0];
      setSelectedLocationId(first ? first.locationId || first.bankBranchId : "");
    } catch {
      setLocations([]);
      setSelectedLocationId("");
    }
  }

  async function verifyDailyAuth() {
    if (!agentAuthKycReady) {
      showAlert("KYC pending", "Complete retailer KYC before Nepal transfers.");
      return;
    }
    if (agentAadhaar.replace(/\D/g, "").length !== 12) {
      showAlert("Aadhaar required", "Enter retailer 12-digit Aadhaar.");
      return;
    }
    setAuthBusy(true);
    try {
      const biometricPayload = await captureFingerprint();
      const { data } = await api.post<ApiResponse<{ verifiedAt: string }>>("/auth/agent-auth", {
        aadhaarNumber: agentAadhaar.replace(/\D/g, ""),
        biometricPayload,
      });
      if (!data.success) throw new Error(data.message);
      setAgentAuthReady(true);
      showAlert("Verification complete", "Nepal Transfer unlocked for today.");
    } catch (err) {
      showAlert("Verification failed", apiError(err, "Fingerprint verification failed"));
    } finally {
      setAuthBusy(false);
    }
  }

  async function refreshOutletStatus(checkOtpStatus = false) {
    setOutletBusy(true);
    try {
      const res = await postProvider<{ outlet: NepalOutletStatus }>("/txn/nepal/outlet-status", {
        ...(checkOtpStatus ? { checkOtpStatus: true } : {}),
      });
      setOutlet(res.data.outlet);
    } catch (err) {
      showAlert("Outlet status failed", apiError(err, "Could not fetch outlet status"));
    } finally {
      setOutletBusy(false);
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
      showAlert("OTP sent", "Outlet registration OTP sent.");
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Could not send outlet OTP"));
    } finally {
      setOutletBusy(false);
    }
  }

  async function submitOutletRegistration() {
    if (!outletOtpRef || !/^\d{4,8}$/.test(outletOtp)) {
      showAlert("OTP required", "Send OTP and enter valid outlet OTP.");
      return;
    }
    setOutletBusy(true);
    try {
      const res = await postProvider<{ registration: { message: string; needsEkyc: boolean } }>(
        "/txn/nepal/outlet-registration",
        { otpReference: outletOtpRef, otp: outletOtp, ...outletReg },
      );
      showAlert("Outlet updated", res.data.registration.message || "Outlet registration submitted");
      await refreshOutletStatus();
    } catch (err) {
      showAlert("Outlet registration failed", apiError(err, "Could not submit outlet registration"));
    } finally {
      setOutletBusy(false);
    }
  }

  async function initiateOutletEkyc() {
    setOutletBusy(true);
    try {
      const res = await postProvider<{ ekyc: { redirectUrl: string } }>("/txn/nepal/outlet-ekyc/initiate", {});
      if (res.data.ekyc?.redirectUrl) await Linking.openURL(res.data.ekyc.redirectUrl);
      showAlert("eKYC started", "Complete the bank page, then come back and check status.");
    } catch (err) {
      showAlert("eKYC initiate failed", apiError(err, "Could not start outlet eKYC"));
    } finally {
      setOutletBusy(false);
    }
  }

  async function checkOutletEkycStatus() {
    setOutletBusy(true);
    try {
      const res = await postProvider<{ ekycStatus: { ready: boolean; message: string } }>("/txn/nepal/outlet-ekyc/status", {});
      showAlert("eKYC status", res.data.ekycStatus.ready ? "Outlet eKYC ready for biometric." : res.data.ekycStatus.message);
    } catch (err) {
      showAlert("Status failed", apiError(err, "Could not check outlet eKYC status"));
    } finally {
      setOutletBusy(false);
    }
  }

  async function processOutletEkyc() {
    setOutletBusy(true);
    try {
      const biometricPayload = await captureFingerprint();
      await postProvider("/txn/nepal/outlet-ekyc/process", { biometricPayload });
      await refreshOutletStatus();
      showAlert("Biometric submitted", "Outlet eKYC biometric accepted.");
    } catch (err) {
      showAlert("Biometric failed", apiError(err, "Could not submit outlet biometric"));
    } finally {
      setOutletBusy(false);
    }
  }

  async function lookupRemitter() {
    const customerMobile = mobile.replace(/\D/g, "");
    if (customerMobile.length !== 10) {
      showAlert("Mobile required", "Enter 10-digit remitter mobile.");
      return;
    }
    setLookupBusy(true);
    try {
      const res = await postProvider<{ profile: NepalRemitterProfile | null }>("/txn/nepal/remitter/profile", {
        customerMobile,
      });
      setProfile(res.data.profile);
      setSelectedBeneId(res.data.profile?.beneficiaries?.[0]?.id ?? "");
      if (res.data.profile) {
        setRegForm((prev) => ({
          ...prev,
          name: prev.name || res.data.profile!.firstName,
          city: prev.city || res.data.profile!.city,
          state: prev.state || res.data.profile!.state,
          district: prev.district || res.data.profile!.district,
        }));
        showAlert("Remitter found", `${res.data.profile.firstName} profile loaded.`);
      } else {
        showAlert("Remitter not found", "Complete registration below.");
      }
    } catch (err) {
      showAlert("Lookup failed", apiError(err, "Could not fetch remitter profile"));
    } finally {
      setLookupBusy(false);
    }
  }

  async function sendRemitterOtp() {
    const customerMobile = mobile.replace(/\D/g, "");
    if (customerMobile.length !== 10) {
      showAlert("Mobile required", "Enter remitter mobile first.");
      return;
    }
    setRemitterBusy(true);
    try {
      const res = await postProvider<{ otpReference: string }>("/txn/nepal/otp", {
        operation: "RemitterRegistration",
        mobile: customerMobile,
      });
      setRegOtpRef(res.data.otpReference);
      showAlert("OTP sent", "Remitter registration OTP sent.");
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Could not send remitter OTP"));
    } finally {
      setRemitterBusy(false);
    }
  }

  async function submitRemitterRegistration() {
    if (!regOtpRef || !/^\d{4,8}$/.test(regOtp)) {
      showAlert("OTP required", "Send OTP and enter valid remitter OTP.");
      return;
    }
    setRemitterBusy(true);
    try {
      const res = await postProvider<{ profile: NepalRemitterProfile }>("/txn/nepal/remitter/register", {
        ...regForm,
        remitterType: 1,
        incomeSourceType: 1,
        annualIncome: 1,
        otpReference: regOtpRef,
        otp: regOtp,
        mobile: mobile.replace(/\D/g, ""),
      });
      setProfile(res.data.profile);
      setSelectedBeneId(res.data.profile?.beneficiaries?.[0]?.id ?? "");
      showAlert("Remitter registered", "Remitter profile created.");
    } catch (err) {
      showAlert("Registration failed", apiError(err, "Could not register remitter"));
    } finally {
      setRemitterBusy(false);
    }
  }

  async function initiateRemitterEkyc() {
    if (!profile) return;
    setRemitterBusy(true);
    try {
      const res = await postProvider<{ ekyc: { redirectUrl: string; referenceKey: string } }>(
        "/txn/nepal/remitter/ekyc/initiate",
        { remitterId: profile.id },
      );
      setRemitterEkycKey(res.data.ekyc.referenceKey);
      if (res.data.ekyc.redirectUrl) await Linking.openURL(res.data.ekyc.redirectUrl);
      showAlert("Remitter eKYC started", "Complete bank page, then check status.");
    } catch (err) {
      showAlert("eKYC failed", apiError(err, "Could not start remitter eKYC"));
    } finally {
      setRemitterBusy(false);
    }
  }

  async function checkRemitterEkyc() {
    if (!profile || !remitterEkycKey) {
      showAlert("Initiate first", "Start remitter eKYC before status check.");
      return;
    }
    setRemitterBusy(true);
    try {
      const res = await postProvider<{ ekycStatus: { ready: boolean; message: string } }>(
        "/txn/nepal/remitter/ekyc/status",
        { remitterId: profile.id, referenceKey: remitterEkycKey },
      );
      showAlert("Remitter eKYC status", res.data.ekycStatus.ready ? "Ready for biometric." : res.data.ekycStatus.message);
    } catch (err) {
      showAlert("Status failed", apiError(err, "Could not check remitter eKYC"));
    } finally {
      setRemitterBusy(false);
    }
  }

  async function processRemitterEkyc() {
    if (!profile || !remitterEkycKey) {
      showAlert("Initiate first", "Start remitter eKYC first.");
      return;
    }
    setRemitterBusy(true);
    try {
      const biometricPayload = await captureFingerprint();
      await postProvider("/txn/nepal/remitter/ekyc/process", {
        remitterId: profile.id,
        referenceKey: remitterEkycKey,
        biometricPayload,
      });
      await lookupRemitter();
      showAlert("Biometric submitted", "Remitter biometric accepted.");
    } catch (err) {
      showAlert("Biometric failed", apiError(err, "Could not submit remitter biometric"));
    } finally {
      setRemitterBusy(false);
    }
  }

  async function addBeneficiary() {
    if (!profile) {
      showAlert("Remitter required", "Lookup or register remitter first.");
      return;
    }
    setBeneBusy(true);
    try {
      const body: Record<string, string> = {
        remitterMobile: mobile.replace(/\D/g, ""),
        name: beneForm.name.trim(),
        gender: beneForm.gender,
        mobile: beneForm.mobile,
        relationship: beneForm.relationship,
        address: beneForm.address.trim(),
        paymentMode,
      };
      if (/account/i.test(paymentMode)) {
        body.bankBranchId = selectedLocation?.bankBranchId ?? "";
        body.accountNumber = beneForm.accountNumber.trim();
      }
      const res = await postProvider<{ profile: NepalRemitterProfile; beneficiaryId: string }>("/txn/nepal/beneficiary/register", body);
      setProfile(res.data.profile);
      setSelectedBeneId(res.data.beneficiaryId);
      showAlert("Beneficiary added", "Beneficiary saved for Nepal transfer.");
    } catch (err) {
      showAlert("Beneficiary failed", apiError(err, "Could not save beneficiary"));
    } finally {
      setBeneBusy(false);
    }
  }

  async function fetchQuote() {
    if (!profile || !selectedBene) {
      showAlert("Beneficiary required", "Select a beneficiary first.");
      return;
    }
    const transferAmount = amount.trim();
    if (!transferAmount) {
      showAlert("Amount required", "Enter transfer amount first.");
      return;
    }
    setQuoteBusy(true);
    try {
      const body: Record<string, string> = {
        remitterMobile: mobile.replace(/\D/g, ""),
        paymentMode: selectedBene.paymentMode,
        transferAmount,
      };
      if (/account/i.test(selectedBene.paymentMode)) {
        body.bankBranchId = selectedBene.bankBranchId;
        body.beneficiaryId = selectedBene.id;
      }
      const res = await postProvider<{ quote: NepalQuote }>("/txn/nepal/service-charge", body);
      setQuote(res.data.quote);
    } catch (err) {
      showAlert("Quote failed", apiError(err, "Could not fetch quote"));
      setQuote(null);
    } finally {
      setQuoteBusy(false);
    }
  }

  async function sendTransferOtp() {
    if (!selectedBene) {
      showAlert("Beneficiary required", "Select a beneficiary first.");
      return;
    }
    if (!quote) {
      showAlert("Quote required", "Fetch quote before OTP.");
      return;
    }
    setTxnBusy(true);
    try {
      const payload: Record<string, string> = {
        operation: "FundTransfer",
        mobile: mobile.replace(/\D/g, ""),
        beneficiaryId: selectedBene.id,
        paymentMode: selectedBene.paymentMode,
        transferAmount: amount.trim(),
      };
      if (/account/i.test(selectedBene.paymentMode)) {
        payload.bankBranchId = selectedBene.bankBranchId;
        payload.accountNumber = selectedBene.acNumber;
      }
      const res = await postProvider<{ otpReference: string }>("/txn/nepal/otp", payload);
      setTxnOtpRef(res.data.otpReference);
      showAlert("OTP sent", "Transfer OTP sent to remitter.");
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Could not send transfer OTP"));
    } finally {
      setTxnBusy(false);
    }
  }

  async function submitTransfer() {
    if (!selectedBene || !txnOtpRef) {
      showAlert("OTP required", "Send transfer OTP first.");
      return;
    }
    if (!remittanceReason) {
      showAlert("Reason required", "Select remittance reason.");
      return;
    }
    setTxnBusy(true);
    try {
      const txnAuth = await promptPin();
      const coords = await getCoords();
      const { data } = await api.post<
        ApiResponse<{ txn?: { txnRef?: string }; provider?: ProviderEnvelope<Record<string, unknown>> }>
      >("/txn/nepal/fund-transfer", {
        remitterMobile: mobile.replace(/\D/g, ""),
        beneficiaryId: selectedBene.id,
        transferAmount: amount.trim(),
        remittanceReason,
        otpReference: txnOtpRef,
        otp: txnOtp,
        latitude: coords.latitude,
        longitude: coords.longitude,
        txnAuth,
        idempotencyKey: transferAttemptKey.current.get(),
      });
      if (!data.success) throw new Error(data.message || "Transfer failed");
      transferAttemptKey.current.clear();
      setLastTxnRef(data.data?.txn?.txnRef ?? "");
      setLastPoolRef(
        (data.data?.provider?.data?.poolReferenceId as string | undefined) ??
          (data.data?.provider?.providerTxnId as string | undefined) ??
          "",
      );
      setTxnOtp("");
      setTxnOtpRef("");
      showAlert("Transfer submitted", data.data?.txn?.txnRef ?? "Nepal transfer submitted.");
      await lookupRemitter();
    } catch (err) {
      showAlert("Transfer failed", apiError(err, "Could not submit Nepal transfer"));
    } finally {
      setTxnBusy(false);
    }
  }

  async function checkTxnStatus() {
    if (!ipayId.trim()) {
      showAlert("ipayId required", "Enter InstantPay transaction id.");
      return;
    }
    setStatusBusy(true);
    try {
      const coords = await getCoords();
      const res = await postProvider<{ txnStatus: NepalTxnStatus }>("/txn/nepal/txn-status", {
        ipayId: ipayId.trim(),
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      setStatusResult(res.data.txnStatus);
    } catch (err) {
      showAlert("Status failed", apiError(err, "Could not fetch Nepal txn status"));
    } finally {
      setStatusBusy(false);
    }
  }

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
          <Text style={styles.headerTitle}>Nepal Transfer</Text>
          <Text style={styles.headerSub}>Cross-border remittance · Mobile</Text>
        </View>
        <Pressable onPress={() => void refreshOutletStatus()} style={styles.headerIconBtn}>
          <RefreshCw size={16} color="#fff" strokeWidth={2.2} />
        </Pressable>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {agentAuthReady !== true ? (
          <View style={[styles.heroCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <View style={styles.heroIconWrap}>
              <ShieldCheck size={24} color={colors.blueLight} strokeWidth={2.2} />
            </View>
            <Text style={[styles.heroTitle, { color: tokens.txt }]}>Daily retailer verification</Text>
            <Text style={[styles.heroSub, { color: tokens.sub }]}>
              Nepal transfer ke liye daily 2FA required hai. Aadhaar aur fingerprint se unlock karo.
            </Text>
            <Field
              label="RETAILER AADHAAR"
              value={agentAadhaar}
              onChangeText={(v) => setAgentAadhaar(v.replace(/\D/g, "").slice(0, 12))}
              placeholder={
                agentAuthKycReady
                  ? agentAadhaar.length === 12
                    ? "From signup KYC"
                    : "12-digit Aadhaar"
                  : "KYC Aadhaar not found"
              }
              keyboardType="number-pad"
            />
            <Pressable onPress={() => void verifyDailyAuth()} disabled={authBusy} style={styles.primaryBtn}>
              {authBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify now</Text>}
            </Pressable>
          </View>
        ) : null}

        <View style={styles.tabRow}>
          {TABS.map((item) => {
            const active = item === tab;
            return (
              <Pressable key={item} onPress={() => setTab(item)} style={[styles.tabBtn, active && styles.tabBtnActive]}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "Outlet" ? (
          <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Outlet status</Text>
            {outletBusy ? <ActivityIndicator color={colors.blueFlat} /> : null}
            <Text style={[styles.infoSub, { color: tokens.mute }]}>
              {outlet ? `${outlet.message} · ${outlet.statuscode}` : "Checking outlet status..."}
            </Text>
            {outlet?.ready ? (
              <View style={styles.successRow}>
                <CheckCircle2 size={18} color={colors.greenDark} strokeWidth={2.2} />
                <Text style={styles.successText}>Outlet ready {outlet.cspCode ? `· ${outlet.cspCode}` : ""}</Text>
              </View>
            ) : null}
            {needsOutletOtpCheck ? (
              <Pressable onPress={() => void refreshOutletStatus(true)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Recheck OTP status</Text>
              </Pressable>
            ) : null}
            {needsOutletRegistration ? (
              <>
                <Pressable onPress={() => void sendOutletOtp()} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Send registration OTP</Text>
                </Pressable>
                <Field label="OTP" value={outletOtp} onChangeText={setOutletOtp} placeholder="Enter OTP" keyboardType="number-pad" />
                <SelectChips label="Gender" options={staticGender} value={outletReg.gender} onChange={(gender) => setOutletReg((prev) => ({ ...prev, gender }))} />
                <Field label="Father / spouse name" value={outletReg.fatherOrSpouseName} onChangeText={(v) => setOutletReg((prev) => ({ ...prev, fatherOrSpouseName: v }))} placeholder="Guardian name" />
                <Field label="Connection provider" value={outletReg.connectionProvider} onChangeText={(v) => setOutletReg((prev) => ({ ...prev, connectionProvider: v }))} placeholder="Jio / Airtel / BSNL" />
                <Field label="Account holder name" value={outletReg.accountName} onChangeText={(v) => setOutletReg((prev) => ({ ...prev, accountName: v }))} placeholder="Bank account holder" />
                <Field label="Bank account no" value={outletReg.bankAccountNo} onChangeText={(v) => setOutletReg((prev) => ({ ...prev, bankAccountNo: v.replace(/\D/g, "") }))} placeholder="Account number" keyboardType="numeric" />
                <Field label="Bank IFSC" value={outletReg.bankIfsc} onChangeText={(v) => setOutletReg((prev) => ({ ...prev, bankIfsc: v.toUpperCase() }))} placeholder="IFSC" />
                <Pressable onPress={() => void submitOutletRegistration()} disabled={outletBusy} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>Submit outlet registration</Text>
                </Pressable>
              </>
            ) : null}
            {needsOutletEkyc ? (
              <>
                <Pressable onPress={() => void initiateOutletEkyc()} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Start outlet eKYC</Text>
                </Pressable>
                <Pressable onPress={() => void checkOutletEkycStatus()} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Check eKYC status</Text>
                </Pressable>
                <Pressable onPress={() => void processOutletEkyc()} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>Submit outlet biometric</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}

        {tab === "Transfer" ? (
          <>
            <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Remitter</Text>
              <Field label="Mobile" value={mobile} onChangeText={(v) => setMobile(v.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" keyboardType="number-pad" />
              <Pressable onPress={() => void lookupRemitter()} disabled={lookupBusy} style={styles.primaryBtn}>
                {lookupBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Lookup remitter</Text>}
              </Pressable>
              {profile ? (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>{profile.firstName}</Text>
                  <Text style={styles.summarySub}>{profile.mobile} · eKYC: {profile.eKycStatus || "Pending"}</Text>
                  <Text style={styles.summarySub}>Txns used: D {profile.transactionCount.day} · M {profile.transactionCount.month} · Y {profile.transactionCount.year}</Text>
                </View>
              ) : null}
              {!profile ? (
                <>
                  <Pressable onPress={() => void sendRemitterOtp()} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Send remitter OTP</Text>
                  </Pressable>
                  <Field label="OTP" value={regOtp} onChangeText={setRegOtp} placeholder="Enter OTP" keyboardType="number-pad" />
                  <Field label="Full name" value={regForm.name} onChangeText={(v) => setRegForm((prev) => ({ ...prev, name: v }))} placeholder="Remitter name" />
                  <Field label="DOB" value={regForm.dob} onChangeText={(v) => setRegForm((prev) => ({ ...prev, dob: v }))} placeholder="YYYY-MM-DD" />
                  <Field label="Address" value={regForm.address} onChangeText={(v) => setRegForm((prev) => ({ ...prev, address: v }))} placeholder="Address" />
                  <Field label="City" value={regForm.city} onChangeText={(v) => setRegForm((prev) => ({ ...prev, city: v }))} placeholder="City" />
                  <Field label="State" value={regForm.state} onChangeText={(v) => setRegForm((prev) => ({ ...prev, state: v }))} placeholder="State" />
                  <Field label="District" value={regForm.district} onChangeText={(v) => setRegForm((prev) => ({ ...prev, district: v }))} placeholder="District" />
                  <Field label="Employer" value={regForm.employer} onChangeText={(v) => setRegForm((prev) => ({ ...prev, employer: v }))} placeholder="Employer / business" />
                  <Field label="ID number" value={regForm.idNumber} onChangeText={(v) => setRegForm((prev) => ({ ...prev, idNumber: v }))} placeholder="ID number" />
                  <SelectChips label="Gender" options={staticGender} value={regForm.gender} onChange={(gender) => setRegForm((prev) => ({ ...prev, gender }))} />
                  <SelectChips label="Nationality" options={staticNationality} value={regForm.nationality} onChange={(nationality) => setRegForm((prev) => ({ ...prev, nationality }))} />
                  <SelectChips label="ID Type" options={staticIdType} value={regForm.idType} onChange={(idType) => setRegForm((prev) => ({ ...prev, idType }))} />
                  <SelectChips label="Income Source" options={staticIncomeSource} value={regForm.incomeSource} onChange={(incomeSource) => setRegForm((prev) => ({ ...prev, incomeSource }))} />
                  <Pressable onPress={() => void submitRemitterRegistration()} disabled={remitterBusy} style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnText}>Register remitter</Text>
                  </Pressable>
                </>
              ) : null}
              {needsRemitterEkyc ? (
                <>
                  <Pressable onPress={() => void initiateRemitterEkyc()} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Start remitter eKYC</Text>
                  </Pressable>
                  <Pressable onPress={() => void checkRemitterEkyc()} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Check remitter eKYC</Text>
                  </Pressable>
                  <Pressable onPress={() => void processRemitterEkyc()} style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnText}>Submit remitter biometric</Text>
                  </Pressable>
                </>
              ) : null}
            </View>

            {profile ? (
              <>
                <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                  <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Beneficiary</Text>
                  <SelectChips label="Payment mode" options={staticPaymentMode} value={paymentMode} onChange={setPaymentMode} />
                  <Field label="Name" value={beneForm.name} onChangeText={(v) => setBeneForm((prev) => ({ ...prev, name: v }))} placeholder="Beneficiary name" />
                  <Field label="Mobile" value={beneForm.mobile} onChangeText={(v) => setBeneForm((prev) => ({ ...prev, mobile: v.replace(/\D/g, "").slice(0, 15) }))} placeholder="Beneficiary mobile" keyboardType="number-pad" />
                  <Field label="Address" value={beneForm.address} onChangeText={(v) => setBeneForm((prev) => ({ ...prev, address: v }))} placeholder="Beneficiary address" />
                  <SelectChips label="Gender" options={staticGender} value={beneForm.gender} onChange={(gender) => setBeneForm((prev) => ({ ...prev, gender }))} />
                  <SelectChips label="Relationship" options={staticRelationship} value={beneForm.relationship} onChange={(relationship) => setBeneForm((prev) => ({ ...prev, relationship }))} />
                  {locations.length ? (
                    <SelectChips
                      label="Location / bank"
                      options={locations.slice(0, 12).map((item) => ({
                        label: item.bankName ? `${item.bankName} · ${item.branchName || item.locationName}` : item.locationName,
                        value: item.locationId || item.bankBranchId,
                      }))}
                      value={selectedLocationId}
                      onChange={setSelectedLocationId}
                    />
                  ) : null}
                  {/account/i.test(paymentMode) ? (
                    <Field label="Account number" value={beneForm.accountNumber} onChangeText={(v) => setBeneForm((prev) => ({ ...prev, accountNumber: v.replace(/\D/g, "") }))} placeholder="Account number" keyboardType="numeric" />
                  ) : null}
                  <Pressable onPress={() => void addBeneficiary()} disabled={beneBusy} style={styles.primaryBtn}>
                    {beneBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Add beneficiary</Text>}
                  </Pressable>
                </View>

                <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                  <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Transfer</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                    {profile.beneficiaries.map((item) => {
                      const active = item.id === selectedBeneId;
                      return (
                        <Pressable key={item.id} onPress={() => setSelectedBeneId(item.id)} style={[styles.chip, active && styles.chipActive]}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.name}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Field label="Amount (INR)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ""))} placeholder="Max 50000" keyboardType="numeric" />
                  <SelectChips label="Remittance reason" options={staticRemitReason} value={remittanceReason} onChange={setRemittanceReason} />
                  <Pressable onPress={() => void fetchQuote()} disabled={quoteBusy} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Get quote</Text>
                  </Pressable>
                  {quote ? (
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryTitle}>INR {quote.transferAmount} + {quote.serviceCharge}</Text>
                      <Text style={styles.summarySub}>Collect {quote.collectionAmount} {quote.collectionCurrency}</Text>
                      <Text style={styles.summarySub}>Payout {quote.payoutAmount} {quote.payoutCurrency} · Rate {quote.exchangeRate}</Text>
                    </View>
                  ) : null}
                  <Pressable onPress={() => void sendTransferOtp()} disabled={txnBusy} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Send transfer OTP</Text>
                  </Pressable>
                  <Field label="Transfer OTP" value={txnOtp} onChangeText={setTxnOtp} placeholder="Enter OTP" keyboardType="number-pad" />
                  <Pressable onPress={() => void submitTransfer()} disabled={txnBusy} style={styles.primaryBtn}>
                    {txnBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Submit transfer</Text>}
                  </Pressable>
                  {lastTxnRef || lastPoolRef ? (
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryTitle}>Last transfer</Text>
                      {lastTxnRef ? <Text style={styles.summarySub}>txnRef: {lastTxnRef}</Text> : null}
                      {lastPoolRef ? <Text style={styles.summarySub}>ipayId: {lastPoolRef}</Text> : null}
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
          </>
        ) : null}

        {tab === "Status" ? (
          <View style={[styles.infoCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
            <Text style={[styles.infoTitle, { color: tokens.txt2 }]}>Transaction status</Text>
            <Field label="ipayId" value={ipayId} onChangeText={setIpayId} placeholder="Pool reference / order id" />
            <Pressable onPress={() => void checkTxnStatus()} disabled={statusBusy} style={styles.primaryBtn}>
              {statusBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Check status</Text>}
            </Pressable>
            {statusResult ? (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>{statusResult.ready ? "Ready / Success" : "Pending / Action"}</Text>
                <Text style={styles.summarySub}>{statusResult.statuscode} {statusResult.actcode ? `· ${statusResult.actcode}` : ""}</Text>
                <Text style={styles.summarySub}>{statusResult.message}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <TxnPinPrompt />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,.16)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  backBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.16)",
  },
  headerTitle: { color: "#fff", fontSize: 21, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,.9)", marginTop: 3, fontSize: 13 },
  content: { padding: 16, paddingBottom: 28 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  tabBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DBE4F0",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  tabBtnActive: {
    backgroundColor: "#EEF3FF",
    borderColor: colors.blueLight,
  },
  tabText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  tabTextActive: { color: colors.blueFlat },
  heroCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF3FF",
    marginBottom: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: "800", lineHeight: 24 },
  heroSub: { marginTop: 8, fontSize: 13.5, lineHeight: 20 },
  grid: { marginTop: 16, gap: 12 },
  infoCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  infoTitle: { fontSize: 14, fontWeight: "800" },
  infoSub: { fontSize: 12.5, lineHeight: 18 },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#64748B",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#D9E1EE",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  chip: {
    borderWidth: 1,
    borderColor: "#D9E1EE",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipActive: {
    borderColor: colors.blueFlat,
    backgroundColor: "#EEF3FF",
  },
  chipText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: colors.blueFlat,
  },
  summaryCard: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 4,
  },
  summaryTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  summarySub: { fontSize: 12.5, color: "#64748B", lineHeight: 18 },
  successRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 6 },
  successText: { color: colors.greenDark, fontSize: 13, fontWeight: "800" },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: colors.blueLight,
    borderRadius: 16,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 14,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D9E1EE",
    backgroundColor: "#fff",
  },
  secondaryBtnText: { color: colors.blueFlat, fontSize: 13.5, fontWeight: "800" },
});
