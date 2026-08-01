import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Geolocation from "@react-native-community/geolocation";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, MapPin, X } from "lucide-react-native";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import { BRAND } from "../../theme/brand";
import { showAlert } from "../../components/AppAlert";
import { MobileSignupStepper, MOBILE_SIGNUP_STEPS } from "../../components/MobileSignupStepper";
import {
  clearMobileSignupDraft,
  EMPTY_MOBILE_SIGNUP_DRAFT,
  loadMobileSignupDraft,
  saveMobileSignupDraft,
  type MobileSignupDraft,
  type SignupRole,
} from "../../lib/signupDraft";

type SponsorRole = "admin" | "master_distributor" | "distributor";

interface SignupScreenProps {
  onBack: () => void;
}

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

const ROLE_OPTIONS: { value: SignupRole; label: string }[] = [
  { value: "retailer", label: "Retailer" },
  { value: "distributor", label: "Distributor" },
  { value: "master_distributor", label: "Super Distributor" },
];

const SPONSOR_ROLE: Record<SignupRole, SponsorRole> = {
  master_distributor: "admin",
  distributor: "master_distributor",
  retailer: "distributor",
};

const UPLINE_LABEL: Record<Exclude<SignupRole, "master_distributor">, string> = {
  distributor: "Super Distributor mobile",
  retailer: "Distributor mobile",
};

const BUSINESS_TYPES = ["Sole Proprietorship", "Partnership", "Private Limited", "Other"];
const BUSINESS_CATEGORIES = ["Mobile Handsets", "Kirana", "Electronics", "Pharmacy", "Other"];
const TURNOVERS = ["Below 1L", "1L-5L", "5L-10L", "10L+"];
const BUSINESS_PROOFS = ["Shop License", "GST Certificate", "Udyam", "Rent Agreement", "Other"];

export function SignupScreen({ onBack }: SignupScreenProps) {
  const { tokens } = useTheme();
  const setAuth = useAuthStore((s) => s.setAuth);
  const updateUser = useAuthStore((s) => s.updateUser);
  const setSignupContinue = useAuthStore((s) => s.setSignupContinue);
  const authUser = useAuthStore((s) => s.user);

  const [draft, setDraft] = useState<MobileSignupDraft>(EMPTY_MOBILE_SIGNUP_DRAFT);
  const [phase, setPhase] = useState<"steps" | "otp" | "emailOtp">("steps");
  const [otp, setOtp] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [sponsorOk, setSponsorOk] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const stepIndex = draft.stepIndex;
  const needsUpline = draft.role !== "master_distributor";
  const sponsorRole = SPONSOR_ROLE[draft.role];
  const storageKey = draft.accountCreated && authUser?.id ? authUser.id : draft.mobile || "anon";
  const hasLocation = Boolean(draft.latitude && draft.longitude);

  function patch(p: Partial<MobileSignupDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function readPosition(highAccuracy: boolean, timeoutMs: number) {
    return new Promise<{ latitude: string; longitude: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Location timed out")), timeoutMs + 500);
      Geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve({
            latitude: String(pos.coords.latitude),
            longitude: String(pos.coords.longitude),
          });
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
        { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 120_000 },
      );
    });
  }

  async function ensureLocation(): Promise<boolean> {
    if (locationBusy) return false;
    setLocationBusy(true);
    setLocationError(null);
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "AsanPay needs your location to complete registration.",
            buttonPositive: "Allow",
            buttonNegative: "Deny",
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocationError("Location permission denied. Enable it in Settings, then tap Allow again.");
          setShowLocationModal(true);
          return false;
        }
      }

      // Prefer faster network location first; GPS high-accuracy often hangs on some phones.
      let coords: { latitude: string; longitude: string };
      try {
        coords = await readPosition(false, 10_000);
      } catch {
        coords = await readPosition(true, 12_000);
      }

      patch({ latitude: coords.latitude, longitude: coords.longitude });
      setLocationError(null);
      setShowLocationModal(false);
      return true;
    } catch {
      setLocationError("Could not get location. Turn on GPS / Location and try again.");
      setShowLocationModal(true);
      return false;
    } finally {
      setLocationBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const fromUser = authUser?.id ? await loadMobileSignupDraft(authUser.id) : null;
      const fromMobile = draft.mobile ? await loadMobileSignupDraft(draft.mobile) : null;
      const existing = fromUser || fromMobile;
      if (alive && existing) {
        setDraft(existing);
        if (existing.accountCreated && existing.stepIndex < 2) {
          setDraft({ ...existing, stepIndex: 2 });
        }
      } else if (alive && authUser?.id && !authUser.hasKycDocs) {
        setDraft((d) => ({
          ...d,
          accountCreated: true,
          stepIndex: Math.max(d.stepIndex, 2),
          name: d.name || authUser.name,
          mobile: d.mobile || authUser.mobile || "",
          role: (authUser.role as SignupRole) || d.role,
        }));
      }
      if (alive) setDraftReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  useEffect(() => {
    if (!draftReady) return;
    void saveMobileSignupDraft(storageKey, draft);
  }, [draft, draftReady, storageKey]);

  // Show location modal on step 1 — do NOT auto-request (system dialog was hidden behind modal → stuck "Requesting…").
  useEffect(() => {
    if (!draftReady || stepIndex !== 0 || phase !== "steps") return;
    if (draft.latitude && draft.longitude) {
      setShowLocationModal(false);
      return;
    }
    setShowLocationModal(true);
  }, [draftReady, stepIndex, phase, draft.latitude, draft.longitude]);

  useEffect(() => {
    if (!needsUpline) {
      setSponsorOk(false);
      return;
    }
    const phone = draft.sponsorMobile.replace(/\D/g, "").slice(0, 10);
    if (phone.length !== 10) {
      setSponsorOk(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{ items: Array<{ uid: string; name: string; mobile: string }> }>
        >("/auth/sponsor/search", { params: { mobile: phone, role: sponsorRole } });
        if (cancelled) return;
        const match = (data.data.items ?? []).find((i) => i.mobile === phone) ?? data.data.items?.[0];
        if (match) {
          patch({ sponsorUid: match.uid, sponsorName: match.name });
          setSponsorOk(true);
        } else {
          setSponsorOk(false);
        }
      } catch {
        if (!cancelled) setSponsorOk(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft.sponsorMobile, draft.role, needsUpline, sponsorRole]);

  useEffect(() => {
    if (draft.pincode.length !== 6) return;
    let cancelled = false;
    void fetch(`https://api.postalpincode.in/pincode/${draft.pincode}`)
      .then((r) => r.json())
      .then((raw) => {
        if (cancelled) return;
        const block = Array.isArray(raw) ? raw[0] : raw;
        const po = block?.PostOffice?.[0];
        if (!po) return;
        patch({ district: po.District || draft.district, state: po.State || draft.state });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.pincode]);

  useEffect(() => {
    if (draft.businessPincode.length !== 6) return;
    let cancelled = false;
    void fetch(`https://api.postalpincode.in/pincode/${draft.businessPincode}`)
      .then((r) => r.json())
      .then((raw) => {
        if (cancelled) return;
        const block = Array.isArray(raw) ? raw[0] : raw;
        const po = block?.PostOffice?.[0];
        if (!po) return;
        patch({
          businessDistrict: po.District || draft.businessDistrict,
          businessState: po.State || draft.businessState,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.businessPincode]);

  useEffect(() => {
    if (draft.ifsc.length !== 11 || !draft.accountCreated) return;
    let cancelled = false;
    void api
      .get<ApiResponse<{ bank: string; branch: string }>>(`/kyc/ifsc/${draft.ifsc}`)
      .then(({ data }) => {
        if (cancelled || !data.success) return;
        patch({ bankName: data.data.bank || draft.bankName, bankBranch: data.data.branch || draft.bankBranch });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.ifsc, draft.accountCreated]);

  function markUpload(key: keyof MobileSignupDraft, label: string) {
    patch({ [key]: { name: `${label}.jpg` } } as Partial<MobileSignupDraft>);
  }

  function validateStep(): string | null {
    if (stepIndex === 0) {
      if (!draft.latitude || !draft.longitude) return "Allow location access before continuing";
      if (draft.mobile.replace(/\D/g, "").length !== 10) return "Enter a valid 10-digit mobile";
      if (!draft.termsAccepted) return "Please accept Terms and Conditions";
    }
    if (stepIndex === 1) {
      if (draft.name.trim().length < 2) return "Full name is required";
      if (!draft.password || draft.password.length < 8) return "Password must be at least 8 characters";
      if (needsUpline && !sponsorOk) return "Enter a valid upline mobile";
    }
    if (stepIndex === 2) {
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan)) return "Enter a valid PAN";
      if (!draft.gender) return "Select gender";
      if (!draft.dob) return "DOB required (YYYY-MM-DD)";
      if (!draft.fatherName.trim()) return "Father name is required";
      if (!draft.panImage) return "Upload PAN card";
    }
    if (stepIndex === 3) {
      if (draft.aadhaar.replace(/\D/g, "").length !== 12) return "Enter valid 12-digit Aadhaar";
      if (!draft.aadhaarFront || !draft.aadhaarBack) return "Upload Aadhaar front and back";
    }
    if (stepIndex === 4) {
      if (!draft.email.trim()) return "Email is required";
      if (!draft.emailVerified) return "Verify your email";
      if (!draft.address.trim()) return "Address is required";
      if (draft.pincode.length !== 6) return "Valid pincode required";
      if (!draft.district.trim() || !draft.state.trim()) return "District and state required";
    }
    if (stepIndex === 5) {
      if (!draft.businessName.trim()) return "Business name required";
      if (!draft.businessType || !draft.businessCategory || !draft.monthlyTurnover || !draft.businessProof) {
        return "Fill all business fields";
      }
      if (!draft.businessAddress.trim() || draft.businessPincode.length !== 6) return "Business address/pincode required";
    }
    if (stepIndex === 6) {
      if (draft.ifsc.length !== 11 || !draft.bankName.trim()) return "IFSC and bank name required";
      if (!draft.accountNumber || draft.accountNumber !== draft.accountNumberConfirm) {
        return "Account numbers must match";
      }
      if (!draft.accountName.trim() || !draft.cancelledCheque) return "Account name and cheque required";
    }
    if (stepIndex === 7 && !draft.shopPhoto) return "Upload shop photo";
    if (stepIndex === 8 && !draft.agreementAccepted) return "Accept the agreement";
    return null;
  }

  async function requestOtp() {
    setLoading(true);
    try {
      if (!draft.latitude || !draft.longitude) {
        showAlert("Location required", "Allow location access before continuing");
        setShowLocationModal(true);
        return;
      }
      const { data } = await api.post<ApiResponse<{ otp?: string }>>("/auth/signup/request", {
        name: draft.name.trim(),
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
        role: draft.role,
        portal: "agent",
        latitude: draft.latitude,
        longitude: draft.longitude,
        ...(needsUpline ? { sponsorUid: draft.sponsorUid } : {}),
      });
      if (!data.success) throw new Error(data.message);
      if (__DEV__ && data.data.otp) {
        setDevOtp(data.data.otp);
        setOtp(data.data.otp);
      }
      setPhase("otp");
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Could not send OTP"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      const { data } = await api.post<
        ApiResponse<LoginResponse | { pendingApproval: true; user: AuthUser; message: string }>
      >("/auth/signup/verify", {
        name: draft.name.trim(),
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
        otp,
        role: draft.role,
        portal: "agent",
        password: draft.password,
        latitude: draft.latitude,
        longitude: draft.longitude,
        ...(needsUpline ? { sponsorUid: draft.sponsorUid } : {}),
      });
      if (!data.success) throw new Error(data.message);
      if ("pendingApproval" in data.data && data.data.pendingApproval) {
        showAlert("Pending approval", data.data.message);
        await clearMobileSignupDraft(storageKey);
        onBack();
        return;
      }
      const session = data.data as LoginResponse;
      const nextDraft = { ...draft, accountCreated: true, stepIndex: 2 };
      setDraft(nextDraft);
      await saveMobileSignupDraft(session.user.id, nextDraft);
      setAuth(session.user, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
      setSignupContinue(true);
      setPhase("steps");
      setOtp("");
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Invalid or expired OTP"));
    } finally {
      setLoading(false);
    }
  }

  async function requestEmailOtp() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      showAlert("Invalid email", "Enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/email/otp/request", { email: draft.email.trim().toLowerCase() });
      setPhase("emailOtp");
      showAlert("Code sent", "Check your email for the verification code");
    } catch (err) {
      showAlert("Email OTP failed", apiError(err, "Could not send email code"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyEmailOtp() {
    if (emailOtp.length !== 6) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ email: string; emailVerifiedAt: string }>>(
        "/auth/email/otp/verify",
        { otp: emailOtp },
      );
      if (!data.success) throw new Error(data.message);
      patch({ emailVerified: true, email: data.data.email });
      if (authUser) {
        updateUser({
          ...authUser,
          email: data.data.email,
          emailVerifiedAt: data.data.emailVerifiedAt,
        });
      }
      setPhase("steps");
      setEmailOtp("");
      showAlert("Verified", "Email verified successfully");
    } catch (err) {
      showAlert("Verify failed", apiError(err, "Incorrect code"));
    } finally {
      setLoading(false);
    }
  }

  async function finalSubmit() {
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/kyc/submit", {
        fullName: draft.name.trim(),
        panNumber: draft.pan.toUpperCase(),
        aadhaarNumber: draft.aadhaar.replace(/\D/g, ""),
        email: draft.email.trim().toLowerCase(),
        address: draft.address.trim(),
        city: draft.district.trim(),
        pincode: draft.pincode,
        bankAccountName: draft.accountName.trim(),
        bankAccountNumber: draft.accountNumber,
        bankIfsc: draft.ifsc.toUpperCase(),
        bankName: draft.bankName.trim(),
        cancelledChequeFileName: draft.cancelledCheque?.name,
        gender: draft.gender,
        fatherName: draft.fatherName.trim(),
        dob: draft.dob,
        district: draft.district.trim(),
        state: draft.state.trim(),
        businessName: draft.businessName.trim(),
        businessType: draft.businessType,
        businessCategory: draft.businessCategory,
        monthlyTurnover: draft.monthlyTurnover,
        businessProof: draft.businessProof,
        businessAddress: draft.businessAddress.trim(),
        businessPincode: draft.businessPincode,
        businessDistrict: draft.businessDistrict.trim(),
        businessState: draft.businessState.trim(),
        bankBranch: draft.bankBranch.trim() || undefined,
        panImageFileName: draft.panImage?.name,
        aadhaarFrontFileName: draft.aadhaarFront?.name,
        aadhaarBackFileName: draft.aadhaarBack?.name,
        shopPhotoFileName: draft.shopPhoto?.name,
        latitude: draft.latitude || undefined,
        longitude: draft.longitude || undefined,
      });
      if (!data.success) throw new Error(data.message);
      updateUser(data.data.user);
      await clearMobileSignupDraft(authUser?.id || storageKey);
      setSignupContinue(false);
      showAlert("Submitted", "Onboarding submitted — awaiting approval");
    } catch (err) {
      showAlert("Submit failed", apiError(err, "Could not submit KYC"));
    } finally {
      setLoading(false);
    }
  }

  function next() {
    const err = validateStep();
    if (err) {
      showAlert("Incomplete", err);
      return;
    }
    if (stepIndex === 1) {
      void requestOtp();
      return;
    }
    if (stepIndex === 8) {
      void finalSubmit();
      return;
    }
    patch({ stepIndex: Math.min(stepIndex + 1, 8) });
  }

  function back() {
    if (phase === "otp" || phase === "emailOtp") {
      setPhase("steps");
      return;
    }
    if (stepIndex === 0 || (stepIndex === 2 && draft.accountCreated)) {
      if (draft.accountCreated) {
        setSignupContinue(false);
        return;
      }
      onBack();
      return;
    }
    patch({ stepIndex: Math.max(stepIndex - 1, 0) });
  }

  if (!draftReady) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const subtitle =
    phase === "otp" ? "Mobile OTP" : phase === "emailOtp" ? "Email OTP" : MOBILE_SIGNUP_STEPS[stepIndex]?.label;

  const inputStyle = [
    styles.input,
    { backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder, color: tokens.txt2 },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable onPress={back} style={[styles.backBtn, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}>
            <ArrowLeft size={18} color={colors.blueFlat} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.brandMark, { color: colors.blue }]}>{BRAND.appName}</Text>
            <Text style={[styles.title, { color: tokens.txt }]}>Sign Up</Text>
            <Text style={[styles.sub, { color: tokens.sub }]}>{subtitle}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <MobileSignupStepper currentIndex={phase === "otp" ? 1 : phase === "emailOtp" ? 4 : stepIndex} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {phase === "otp" ? (
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.hint, { color: tokens.mute }]}>
                Enter OTP sent to +91 {draft.mobile.replace(/\D/g, "").slice(0, 10)}
              </Text>
              {devOtp ? <Text style={styles.devOtp}>Dev OTP: {devOtp}</Text> : null}
              <TextInput
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                placeholder="6-digit OTP"
                placeholderTextColor={tokens.mute}
                style={inputStyle}
              />
              <Pressable
                onPress={() => void verifyOtp()}
                disabled={loading || otp.length !== 6}
                style={[styles.cta, { opacity: loading || otp.length !== 6 ? 0.5 : 1 }]}
              >
                <Text style={styles.ctaText}>{loading ? "Verifying…" : "Verify & Continue"}</Text>
              </Pressable>
            </View>
          ) : null}

          {phase === "emailOtp" ? (
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.hint, { color: tokens.mute }]}>Code sent to {draft.email}</Text>
              <TextInput
                value={emailOtp}
                onChangeText={(t) => setEmailOtp(t.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                placeholder="6-digit code"
                placeholderTextColor={tokens.mute}
                style={inputStyle}
              />
              <Pressable
                onPress={() => void verifyEmailOtp()}
                disabled={loading || emailOtp.length !== 6}
                style={[styles.cta, { opacity: loading || emailOtp.length !== 6 ? 0.5 : 1 }]}
              >
                <Text style={styles.ctaText}>{loading ? "Verifying…" : "Confirm email"}</Text>
              </Pressable>
            </View>
          ) : null}

          {phase === "steps" ? (
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              {stepIndex === 0 && (
                <>
                  <Text style={styles.sectionTitle}>Mobile Verification</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>Allow location, then enter your mobile number.</Text>
                  <View
                    style={[
                      styles.locBanner,
                      {
                        backgroundColor: hasLocation ? colors.greenBg : "#FFF7ED",
                        borderColor: hasLocation ? `${colors.green}55` : "#FDBA74",
                      },
                    ]}
                  >
                    <MapPin size={16} color={hasLocation ? colors.greenDark : "#C2410C"} />
                    <Text style={{ flex: 1, color: hasLocation ? colors.greenDark : "#9A3412", fontSize: 12, fontWeight: "600" }}>
                      {hasLocation
                        ? `Location ready · ${Number(draft.latitude).toFixed(4)}, ${Number(draft.longitude).toFixed(4)}`
                        : "Allow location to unlock mobile number"}
                    </Text>
                    {!hasLocation ? (
                      <Pressable onPress={() => setShowLocationModal(true)} hitSlop={8}>
                        <Text style={{ color: colors.blueFlat, fontWeight: "800", fontSize: 12 }}>Enable</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <FieldLabel text="Mobile Number *" color={tokens.mute} />
                  <TextInput
                    value={draft.mobile}
                    onChangeText={(t) => patch({ mobile: t.replace(/\D/g, "").slice(0, 10) })}
                    keyboardType="number-pad"
                    placeholder="10-digit mobile"
                    placeholderTextColor={tokens.mute}
                    editable={hasLocation}
                    style={[inputStyle, !hasLocation && { opacity: 0.5 }]}
                  />
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    Use the number linked to your Aadhaar.
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (draft.termsAccepted) {
                        patch({ termsAccepted: false });
                        return;
                      }
                      if (!hasLocation) {
                        setShowLocationModal(true);
                        return;
                      }
                      setShowTermsModal(true);
                    }}
                    style={styles.checkRow}
                  >
                    <View style={[styles.check, draft.termsAccepted && styles.checkOn]}>
                      {draft.termsAccepted ? <CheckCircle2 size={14} color="#fff" /> : null}
                    </View>
                    <Text style={{ color: tokens.txt2, flex: 1, fontSize: 13, lineHeight: 18 }}>
                      I agree to the <Text style={{ color: colors.blueFlat, fontWeight: "800" }}>Terms & Privacy Policy</Text>
                    </Text>
                  </Pressable>
                  <View style={[styles.prep, { backgroundColor: colors.greenBg }]}>
                    <Text style={[styles.prepTitle, { color: colors.greenDark }]}>Keep these ready</Text>
                    <Text style={[styles.prepItem, { color: colors.greenDark }]}>• Business document (any one)</Text>
                    <Text style={[styles.prepItem, { color: colors.greenDark }]}>• Aadhaar card (soft copy)</Text>
                    <Text style={[styles.prepItem, { color: colors.greenDark }]}>• PAN card (soft copy)</Text>
                    <Text style={[styles.prepItem, { color: colors.greenDark }]}>• Shop photo</Text>
                    <Text style={[styles.prepFoot, { color: tokens.mute }]}>You can resume later from where you left off.</Text>
                  </View>
                </>
              )}

              {stepIndex === 1 && (
                <>
                  <Text style={styles.sectionTitle}>Role Identification</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>Choose your role and create login credentials.</Text>
                  <FieldLabel text="Role *" color={tokens.mute} />
                  <View style={styles.roleRow}>
                    {ROLE_OPTIONS.map((r) => (
                      <Pressable
                        key={r.value}
                        onPress={() =>
                          patch({ role: r.value, sponsorMobile: "", sponsorUid: "", sponsorName: "" })
                        }
                        style={[
                          styles.roleChip,
                          {
                            borderColor: draft.role === r.value ? colors.blue : tokens.cardBorder,
                            backgroundColor: draft.role === r.value ? `${colors.blue}14` : tokens.card,
                          },
                        ]}
                      >
                        <Text style={{ color: tokens.txt2, fontWeight: "700", fontSize: 12 }}>{r.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <FieldLabel text="Full Name *" color={tokens.mute} />
                  <TextInput
                    value={draft.name}
                    onChangeText={(t) => patch({ name: t })}
                    placeholder="As per PAN"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  {needsUpline ? (
                    <>
                      <FieldLabel text={`${UPLINE_LABEL[draft.role as "retailer" | "distributor"]} *`} color={tokens.mute} />
                      <TextInput
                        value={draft.sponsorMobile}
                        onChangeText={(t) => patch({ sponsorMobile: t.replace(/\D/g, "").slice(0, 10) })}
                        keyboardType="number-pad"
                        placeholder="10-digit upline mobile"
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                      {sponsorOk ? (
                        <Text style={{ color: colors.greenDark, fontSize: 12, fontWeight: "700", marginTop: 4 }}>
                          ✓ {draft.sponsorName}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                  <FieldLabel text="Password *" color={tokens.mute} />
                  <View style={styles.passwordWrap}>
                    <TextInput
                      value={draft.password}
                      onChangeText={(t) => patch({ password: t })}
                      secureTextEntry={!showPassword}
                      placeholder="Min 8 characters, include a letter"
                      placeholderTextColor={tokens.mute}
                      style={[inputStyle, { paddingRight: 44 }]}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      style={styles.eyeBtn}
                      hitSlop={10}
                      accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} color={tokens.mute} /> : <Eye size={18} color={tokens.mute} />}
                    </Pressable>
                  </View>
                </>
              )}

              {stepIndex === 2 && (
                <>
                  <Text style={styles.sectionTitle}>PAN Verification</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>Enter PAN details exactly as on the card.</Text>
                  <FieldLabel text="PAN Number *" color={tokens.mute} />
                  <TextInput
                    value={draft.pan}
                    onChangeText={(t) => patch({ pan: t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })}
                    autoCapitalize="characters"
                    placeholder="ABCDE1234F"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="Gender *" color={tokens.mute} />
                  <View style={styles.roleRow}>
                    {["Male", "Female", "Other"].map((g) => (
                      <Pressable
                        key={g}
                        onPress={() => patch({ gender: g })}
                        style={[
                          styles.roleChip,
                          {
                            borderColor: draft.gender === g ? colors.blue : tokens.cardBorder,
                            backgroundColor: draft.gender === g ? `${colors.blue}14` : tokens.card,
                          },
                        ]}
                      >
                        <Text style={{ color: tokens.txt2, fontWeight: "700", fontSize: 12 }}>{g}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <FieldLabel text="Date of Birth * (YYYY-MM-DD)" color={tokens.mute} />
                  <TextInput
                    value={draft.dob}
                    onChangeText={(t) => patch({ dob: t })}
                    placeholder="1981-02-12"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="Father Name *" color={tokens.mute} />
                  <TextInput
                    value={draft.fatherName}
                    onChangeText={(t) => patch({ fatherName: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <UploadRow
                    label="PAN Card Image *"
                    done={Boolean(draft.panImage)}
                    name={draft.panImage?.name}
                    onPress={() => markUpload("panImage", "pan")}
                    tokens={tokens}
                  />
                </>
              )}

              {stepIndex === 3 && (
                <>
                  <Text style={styles.sectionTitle}>Aadhaar Verification</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    Enter the Aadhaar linked to your mobile. Upload clear front and back images.
                  </Text>
                  <FieldLabel text="Aadhaar Number *" color={tokens.mute} />
                  <TextInput
                    value={draft.aadhaar.replace(/(\d{4})(?=\d)/g, "$1 ").trim()}
                    onChangeText={(t) => patch({ aadhaar: t.replace(/\D/g, "").slice(0, 12) })}
                    keyboardType="number-pad"
                    placeholder="1234 1234 1234"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <UploadRow
                    label="Aadhaar Front *"
                    done={Boolean(draft.aadhaarFront)}
                    name={draft.aadhaarFront?.name}
                    onPress={() => markUpload("aadhaarFront", "aadhaar-front")}
                    tokens={tokens}
                  />
                  <UploadRow
                    label="Aadhaar Back *"
                    done={Boolean(draft.aadhaarBack)}
                    name={draft.aadhaarBack?.name}
                    onPress={() => markUpload("aadhaarBack", "aadhaar-back")}
                    tokens={tokens}
                  />
                </>
              )}

              {stepIndex === 4 && (
                <>
                  <Text style={styles.sectionTitle}>Basic Details & Email</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>Verify email and enter residential address.</Text>
                  <FieldLabel text="Email *" color={tokens.mute} />
                  <View style={styles.emailRow}>
                    <TextInput
                      value={draft.email}
                      onChangeText={(t) => patch({ email: t, emailVerified: false })}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholder="email@example.com"
                      placeholderTextColor={tokens.mute}
                      style={[inputStyle, { flex: 1 }]}
                    />
                    <Pressable
                      onPress={() => void requestEmailOtp()}
                      disabled={loading || draft.emailVerified}
                      style={[styles.verifyBtn, draft.emailVerified && { backgroundColor: colors.green }]}
                    >
                      <Text style={styles.verifyBtnText}>{draft.emailVerified ? "Verified" : "Verify"}</Text>
                    </Pressable>
                  </View>
                  <FieldLabel text="Address *" color={tokens.mute} />
                  <TextInput
                    value={draft.address}
                    onChangeText={(t) => patch({ address: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="Pincode *" color={tokens.mute} />
                  <TextInput
                    value={draft.pincode}
                    onChangeText={(t) => patch({ pincode: t.replace(/\D/g, "").slice(0, 6) })}
                    keyboardType="number-pad"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="District *" color={tokens.mute} />
                  <TextInput
                    value={draft.district}
                    onChangeText={(t) => patch({ district: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="State *" color={tokens.mute} />
                  <TextInput
                    value={draft.state}
                    onChangeText={(t) => patch({ state: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                </>
              )}

              {stepIndex === 5 && (
                <>
                  <Text style={styles.sectionTitle}>Business Details</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>Tell us about your shop / business.</Text>
                  <FieldLabel text="Business Name *" color={tokens.mute} />
                  <TextInput
                    value={draft.businessName}
                    onChangeText={(t) => patch({ businessName: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <SelectRow
                    label="Business Type *"
                    value={draft.businessType}
                    options={BUSINESS_TYPES}
                    onChange={(v) => patch({ businessType: v })}
                    tokens={tokens}
                  />
                  <SelectRow
                    label="Business Category *"
                    value={draft.businessCategory}
                    options={BUSINESS_CATEGORIES}
                    onChange={(v) => patch({ businessCategory: v })}
                    tokens={tokens}
                  />
                  <SelectRow
                    label="Monthly Turnover *"
                    value={draft.monthlyTurnover}
                    options={TURNOVERS}
                    onChange={(v) => patch({ monthlyTurnover: v })}
                    tokens={tokens}
                  />
                  <SelectRow
                    label="Business Proof *"
                    value={draft.businessProof}
                    options={BUSINESS_PROOFS}
                    onChange={(v) => patch({ businessProof: v })}
                    tokens={tokens}
                  />
                  <FieldLabel text="Business Address *" color={tokens.mute} />
                  <TextInput
                    value={draft.businessAddress}
                    onChangeText={(t) => patch({ businessAddress: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="Pincode *" color={tokens.mute} />
                  <TextInput
                    value={draft.businessPincode}
                    onChangeText={(t) => patch({ businessPincode: t.replace(/\D/g, "").slice(0, 6) })}
                    keyboardType="number-pad"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="District *" color={tokens.mute} />
                  <TextInput
                    value={draft.businessDistrict}
                    onChangeText={(t) => patch({ businessDistrict: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="State *" color={tokens.mute} />
                  <TextInput
                    value={draft.businessState}
                    onChangeText={(t) => patch({ businessState: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                </>
              )}

              {stepIndex === 6 && (
                <>
                  <Text style={styles.sectionTitle}>Bank Details</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>Account for settlements and payouts.</Text>
                  <FieldLabel text="IFSC *" color={tokens.mute} />
                  <TextInput
                    value={draft.ifsc}
                    onChangeText={(t) =>
                      patch({ ifsc: t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })
                    }
                    autoCapitalize="characters"
                    placeholder="HDFC0001209"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="Bank Name *" color={tokens.mute} />
                  <TextInput
                    value={draft.bankName}
                    onChangeText={(t) => patch({ bankName: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="Branch" color={tokens.mute} />
                  <TextInput
                    value={draft.bankBranch}
                    onChangeText={(t) => patch({ bankBranch: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="Account Number *" color={tokens.mute} />
                  <TextInput
                    value={draft.accountNumber}
                    onChangeText={(t) => patch({ accountNumber: t.replace(/\D/g, "").slice(0, 30) })}
                    keyboardType="number-pad"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="Confirm Account Number *" color={tokens.mute} />
                  <TextInput
                    value={draft.accountNumberConfirm}
                    onChangeText={(t) => patch({ accountNumberConfirm: t.replace(/\D/g, "").slice(0, 30) })}
                    keyboardType="number-pad"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <FieldLabel text="Account Holder Name *" color={tokens.mute} />
                  <TextInput
                    value={draft.accountName}
                    onChangeText={(t) => patch({ accountName: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <UploadRow
                    label="Cancelled Cheque *"
                    done={Boolean(draft.cancelledCheque)}
                    name={draft.cancelledCheque?.name}
                    onPress={() => markUpload("cancelledCheque", "cheque")}
                    tokens={tokens}
                  />
                </>
              )}

              {stepIndex === 7 && (
                <>
                  <Text style={styles.sectionTitle}>Business Images</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>Upload a clear photo of your shop front.</Text>
                  <UploadRow
                    label="Shop Photo *"
                    done={Boolean(draft.shopPhoto)}
                    name={draft.shopPhoto?.name}
                    onPress={() => markUpload("shopPhoto", "shop")}
                    tokens={tokens}
                  />
                </>
              )}

              {stepIndex === 8 && (
                <>
                  <Text style={styles.sectionTitle}>Agreement</Text>
                  <View style={[styles.agreeBox, { borderColor: tokens.cardBorder, backgroundColor: `${colors.blue}08` }]}>
                    <Text style={[styles.agreeTitle, { color: tokens.txt }]}>Agent Agreement & Pricing</Text>
                    <Text style={{ color: tokens.mute, fontSize: 12, lineHeight: 18 }}>
                      By continuing you agree to AsanPay agent terms, privacy policy, and the applicable
                      commission / pricing schedule for your role.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => patch({ agreementAccepted: !draft.agreementAccepted })}
                    style={styles.checkRow}
                  >
                    <View style={[styles.check, draft.agreementAccepted && styles.checkOn]}>
                      {draft.agreementAccepted ? <CheckCircle2 size={14} color="#fff" /> : null}
                    </View>
                    <Text style={{ color: tokens.txt2, flex: 1, fontSize: 13, lineHeight: 18 }}>
                      I accept Terms, Privacy, Agent Agreement, and pricing.
                    </Text>
                  </Pressable>
                </>
              )}

              <Pressable onPress={next} disabled={loading} style={[styles.cta, { opacity: loading ? 0.6 : 1 }]}>
                <Text style={styles.ctaText}>
                  {loading
                    ? "Please wait…"
                    : stepIndex === 8
                      ? "Submit application"
                      : stepIndex === 1
                        ? "Send OTP"
                        : "Continue"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showLocationModal && !hasLocation} transparent animationType="fade" onRequestClose={onBack}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: tokens.card }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <View style={styles.locIconWrap}>
                <MapPin size={22} color={colors.green} />
              </View>
              <Text style={[styles.modalTitle, { color: tokens.txt }]}>Location Permission Required</Text>
            </View>
            <Text style={{ color: tokens.mute, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
              Please allow location access to continue with registration. Tap Allow, then approve the system
              prompt.
            </Text>
            {locationError ? (
              <View style={styles.locErrorBox}>
                <Text style={styles.locErrorText}>{locationError}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => void ensureLocation()}
              disabled={locationBusy}
              style={[styles.cta, styles.ctaGreen, { opacity: locationBusy ? 0.7 : 1, marginTop: 4 }]}
            >
              {locationBusy ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.ctaText}>Getting location…</Text>
                </View>
              ) : (
                <Text style={styles.ctaText}>{locationError ? "Try again" : "Allow"}</Text>
              )}
            </Pressable>
            <Pressable onPress={onBack} style={[styles.modalSecondary, { borderColor: colors.green }]}>
              <Text style={{ color: colors.greenDark, fontWeight: "700" }}>Go back</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showTermsModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: tokens.card, maxHeight: "85%" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={[styles.modalTitle, { color: tokens.txt }]}>Terms & Conditions</Text>
              <Pressable onPress={() => setShowTermsModal(false)}>
                <X size={18} color={tokens.mute} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 280 }}>
              <Text style={{ color: tokens.txt2, fontSize: 13, lineHeight: 20 }}>
                By registering as an AsanPay agent you agree to provide accurate KYC information, use services
                only for lawful retail transactions, keep credentials confidential, and comply with applicable
                RBI / UIDAI / NPCI guidelines. Location captured at registration is used for outlet geofencing
                and compliance. AsanPay may suspend access for fraud or policy violations.
              </Text>
            </ScrollView>
            <Text style={{ color: tokens.mute, fontSize: 11, marginTop: 10 }}>
              Latitude: {draft.latitude || "—"}
            </Text>
            <Text style={{ color: tokens.mute, fontSize: 11, marginBottom: 12 }}>
              Longitude: {draft.longitude || "—"}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => setShowTermsModal(false)}
                style={[styles.modalSecondary, { flex: 1, borderColor: colors.green }]}
              >
                <Text style={{ color: colors.greenDark, fontWeight: "700", textAlign: "center" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  patch({ termsAccepted: true });
                  setShowTermsModal(false);
                }}
                disabled={!hasLocation}
                style={[styles.cta, { flex: 1, opacity: hasLocation ? 1 : 0.5 }]}
              >
                <Text style={styles.ctaText}>Accept</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FieldLabel({ text, color }: { text: string; color: string }) {
  return <Text style={[styles.label, { color }]}>{text}</Text>;
}

function UploadRow({
  label,
  done,
  name,
  onPress,
  tokens,
}: {
  label: string;
  done: boolean;
  name?: string;
  onPress: () => void;
  tokens: { mute: string; card: string; cardBorder: string; txt2: string };
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <FieldLabel text={label} color={tokens.mute} />
      <Pressable
        onPress={onPress}
        style={[
          styles.upload,
          {
            backgroundColor: tokens.card,
            borderColor: done ? colors.green : tokens.cardBorder,
          },
        ]}
      >
        <Text style={{ color: tokens.txt2, fontWeight: "700" }}>{done ? name || "Uploaded" : "Tap to upload"}</Text>
        <Text style={{ color: done ? colors.greenDark : tokens.mute, fontWeight: "800" }}>{done ? "✓" : "+"}</Text>
      </Pressable>
    </View>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
  tokens,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  tokens: { mute: string; card: string; cardBorder: string; txt2: string };
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <FieldLabel text={label} color={tokens.mute} />
      <View style={styles.roleRow}>
        {options.map((o) => (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            style={[
              styles.roleChip,
              {
                borderColor: value === o ? colors.blue : tokens.cardBorder,
                backgroundColor: value === o ? `${colors.blue}14` : tokens.card,
              },
            ]}
          >
            <Text style={{ color: tokens.txt2, fontWeight: "700", fontSize: 11 }}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 8, marginBottom: 4 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMark: { fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  title: { fontSize: 22, fontWeight: "800", marginTop: 2 },
  sub: { fontSize: 13, marginTop: 2 },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.blue,
    marginBottom: 2,
  },
  passwordWrap: { position: "relative", justifyContent: "center" },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 36,
  },
  block: { gap: 8 },
  locBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, marginTop: 6, marginBottom: 4 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  hint: { fontSize: 12, marginBottom: 6 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 10 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  prep: { borderRadius: 14, padding: 14, marginTop: 4 },
  prepTitle: { fontWeight: "800", marginBottom: 6 },
  prepItem: { fontSize: 12, marginTop: 2 },
  prepFoot: { fontSize: 11, marginTop: 10 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  roleChip: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  emailRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  verifyBtn: {
    backgroundColor: colors.blue,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  verifyBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  upload: {
    borderWidth: 1.5,
    borderRadius: 14,
    borderStyle: "dashed",
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agreeBox: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8 },
  agreeTitle: { fontWeight: "800", marginBottom: 6 },
  cta: {
    marginTop: 16,
    backgroundColor: colors.blue,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaGreen: { backgroundColor: colors.green },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  devOtp: { color: colors.blueFlat, fontWeight: "700", marginBottom: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { borderRadius: 20, padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: "800", flex: 1 },
  locIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.greenBg,
    alignItems: "center",
    justifyContent: "center",
  },
  locErrorBox: {
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  locErrorText: { color: "#991B1B", fontSize: 12, fontWeight: "600", lineHeight: 17 },
  modalSecondary: {
    marginTop: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
});
