import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import Geolocation from "@react-native-community/geolocation";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle2, FileText, Fingerprint, MapPin, Phone, ScanFace } from "lucide-react-native";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { api, setAuthHeader } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { useAuthStore } from "../../store/auth";
import { CodeGrid } from "../../components/CodeGrid";
import { NumericKeypad } from "../../components/NumericKeypad";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";

type SignupRole = "master_distributor" | "distributor" | "retailer";
type SponsorRole = "admin" | "master_distributor" | "distributor";
type Gender = "M" | "F" | "T";

const SIGNUP_ROLES: { value: SignupRole; label: string }[] = [
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
  distributor: "SUPER DISTRIBUTOR MOBILE NO.",
  retailer: "DISTRIBUTOR MOBILE NO.",
};

const UPLINE_ROLE_LABEL: Record<SponsorRole, string> = {
  admin: "Admin",
  master_distributor: "Super Distributor",
  distributor: "Distributor",
};

const STEP_TITLES = ["Your Details", "KYC Documents", "Live Photo", "Outlet Details", "Review & Submit"];

interface SignupScreenProps {
  onBack: () => void;
}

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

type UploadKey = "aadhaarFront" | "aadhaarBack" | "panCard";

export function SignupScreen({ onBack }: SignupScreenProps) {
  const { tokens } = useTheme();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionResult, setSessionResult] = useState<LoginResponse | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  // Step 0 — the backend's signup/request already requires name + sponsorUid alongside
  // mobile, so those are collected up front (design mockup only asks for mobile here).
  const [name, setName] = useState("");
  const [signupRole, setSignupRole] = useState<SignupRole>("retailer");
  const [sponsorMobile, setSponsorMobile] = useState("");
  const [sponsorList, setSponsorList] = useState<Array<{ uid: string; name: string; mobile: string; role?: string }>>([]);
  const [sponsorUid, setSponsorUid] = useState("");
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [sponsorRoleLabel, setSponsorRoleLabel] = useState<string>("Distributor");
  const [sponsorOk, setSponsorOk] = useState(false);
  const [sponsorSearching, setSponsorSearching] = useState(false);
  const [mobile, setMobile] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");

  const sponsorRole = SPONSOR_ROLE[signupRole];
  const needsUpline = signupRole !== "master_distributor";

  useEffect(() => {
    setSponsorUid("");
    setSponsorName(null);
    setSponsorOk(false);
    setSponsorList([]);
    setSponsorMobile("");
    setOtpSent(false);
    setPendingApproval(false);
  }, [signupRole]);

  useEffect(() => {
    if (!needsUpline) return;
    const phone = sponsorMobile.replace(/\D/g, "").slice(0, 10);
    setSponsorUid("");
    setSponsorName(null);
    setSponsorOk(false);
    setSponsorList([]);
    if (phone.length !== 10) {
      setSponsorSearching(false);
      return;
    }
    let cancelled = false;
    setSponsorSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{ items: Array<{ uid: string; name: string; mobile: string; role: SponsorRole }> }>
        >("/auth/sponsor/search", {
          params: { mobile: phone, role: sponsorRole },
        });
        if (cancelled) return;
        if (!data.success) throw new Error("not found");
        const items = data.data.items ?? [];
        const match = items.find((i) => i.mobile === phone) ?? items[0];
        if (match) {
          setSponsorList([match]);
          setSponsorUid(match.uid);
          setSponsorName(match.name);
          setSponsorRoleLabel(UPLINE_ROLE_LABEL[match.role] ?? UPLINE_ROLE_LABEL[sponsorRole]);
          setSponsorOk(true);
        }
      } catch {
        if (cancelled) return;
        setSponsorList([]);
      } finally {
        if (!cancelled) setSponsorSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sponsorMobile, sponsorRole, needsUpline]);

  function selectSponsor(item: { uid: string; name: string; mobile: string; role?: string }) {
    setSponsorUid(item.uid);
    setSponsorName(item.name);
    if (item.role && item.role in UPLINE_ROLE_LABEL) {
      setSponsorRoleLabel(UPLINE_ROLE_LABEL[item.role as SponsorRole]);
    }
    setSponsorOk(true);
  }

  // Step 1
  const [pan, setPan] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [uploads, setUploads] = useState<Record<UploadKey, boolean>>({
    aadhaarFront: false,
    aadhaarBack: false,
    panCard: false,
  });

  // Step 2
  const [selfieDone, setSelfieDone] = useState(false);

  // Step 3 — InstantPay Min-KYC outlet (retailers)
  const [gender, setGender] = useState<Gender>("M");
  const [email, setEmail] = useState("");
  const [addressFull, setAddressFull] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);

  function toggleUpload(key: UploadKey) {
    setUploads((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function outletReady(): boolean {
    if (signupRole !== "retailer") return true;
    const lat = Number(latitude);
    const lng = Number(longitude);
    return (
      mobile.length === 10 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
      addressFull.trim().length >= 5 &&
      city.trim().length >= 2 &&
      /^\d{6}$/.test(pincode) &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    );
  }

  async function captureLocation() {
    setGeoBusy(true);
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Outlet location",
            message: "AsanPay needs your current location to register the outlet on InstantPay.",
            buttonPositive: "Allow",
            buttonNegative: "Deny",
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showAlert("Location denied", "Allow location permission, then tap Use current location again.");
          return;
        }
      }
      await new Promise<void>((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (pos) => {
            setLatitude(pos.coords.latitude.toFixed(4));
            setLongitude(pos.coords.longitude.toFixed(4));
            resolve();
          },
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        );
      });
    } catch {
      showAlert("Location failed", "Could not get GPS. Turn on location and try again.");
    } finally {
      setGeoBusy(false);
    }
  }

  async function requestOtp() {
    if (name.trim().length < 2) {
      showAlert("Name required", "Enter your full name.");
      return;
    }
    if (needsUpline && (!sponsorOk || !sponsorUid)) {
      showAlert("Upline required", "Enter your upline's 10-digit mobile number.");
      return;
    }
    if (mobile.length !== 10) {
      showAlert("Invalid mobile", "Enter a valid 10-digit mobile number.");
      return;
    }
    setOtpLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ message: string; otp?: string }>>(
        "/auth/signup/request",
        {
          name: name.trim(),
          mobile,
          role: signupRole,
          portal: "agent",
          ...(needsUpline && sponsorUid ? { sponsorUid: sponsorUid.trim() } : {}),
        },
      );
      if (!data.success) throw new Error(data.message);
      setOtpSent(true);
      if (__DEV__ && data.data.otp) {
        setDevOtp(data.data.otp);
        setOtp(data.data.otp);
      }
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Could not send OTP"));
    } finally {
      setOtpLoading(false);
    }
  }

  function canAdvance(): boolean {
    if (step === 0) return otpSent && otp.length === 6;
    if (step === 1) return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) && /^\d{12}$/.test(aadhaar);
    if (step === 2) return selfieDone;
    if (step === 3) return outletReady();
    return true;
  }

  async function verifySignupOtp(): Promise<"session" | "pending"> {
    const { data } = await api.post<
      ApiResponse<
        | LoginResponse
        | { pendingApproval: true; user: AuthUser; message: string }
      >
    >("/auth/signup/verify", {
      name: name.trim(),
      mobile,
      otp,
      role: signupRole,
      portal: "agent",
      ...(needsUpline && sponsorUid ? { sponsorUid: sponsorUid.trim() } : {}),
    });
    if (!data.success) throw new Error(data.message);
    if ("pendingApproval" in data.data && data.data.pendingApproval) {
      setPendingApproval(true);
      return "pending";
    }
    const session = data.data as LoginResponse;
    // Hold session locally — setAuth() would unmount this screen before KYC/success.
    setAuthHeader(session.accessToken);
    setSessionResult(session);
    return "session";
  }

  async function handleNext() {
    if (!canAdvance()) {
      showAlert("Incomplete", "Please fill in all required fields to continue.");
      return;
    }
    // Verify OTP right after step 0 — KYC steps often exceed OTP TTL.
    if (step === 0) {
      if (sessionResult || pendingApproval) {
        if (pendingApproval) {
          setDone(true);
          return;
        }
        setStep(1);
        return;
      }
      setSubmitting(true);
      try {
        const result = await verifySignupOtp();
        if (result === "pending") {
          setDone(true);
          return;
        }
        setStep(1);
      } catch (err) {
        showAlert("OTP failed", apiError(err, "Invalid or expired OTP. Request a new one."));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (step < 4) {
      setStep((s) => s + 1);
      return;
    }
    await submit();
  }

  async function submit() {
    setSubmitting(true);
    try {
      if (!sessionResult) {
        const result = await verifySignupOtp();
        if (result === "pending") {
          setDone(true);
          return;
        }
      }

      try {
        await api.post("/kyc/submit", { panNumber: pan, aadhaarNumber: aadhaar });
      } catch {
        /* account is already created; KYC can be retried later from Profile */
      }

      if (signupRole === "retailer") {
        await api.post("/onboarding/instantpay", {
          mobile,
          name: name.trim(),
          gender,
          pan,
          email: email.trim(),
          address: {
            full: addressFull.trim(),
            city: city.trim(),
            pincode,
          },
          aadhaarNumber: aadhaar,
          dateOfBirth,
          latitude: Number(latitude),
          longitude: Number(longitude),
        });
      }

      setDone(true);
    } catch (err) {
      showAlert("Signup failed", apiError(err, "Could not complete registration"));
    } finally {
      setSubmitting(false);
    }
  }

  function continueToApp() {
    if (!sessionResult) return;
    setAuth(sessionResult.user, {
      accessToken: sessionResult.accessToken,
      refreshToken: sessionResult.refreshToken,
    });
  }

  if (done) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]}>
        <View style={styles.successWrap}>
          <LinearGradient colors={[...colors.gradientButton]} style={styles.successIcon}>
            <CheckCircle2 size={44} color="#fff" strokeWidth={2.3} />
          </LinearGradient>
          <Text style={[styles.successTitle, { color: tokens.txt }]}>
            {pendingApproval ? "Submitted for Approval" : "Application Submitted!"}
          </Text>
          <Text style={[styles.successSub, { color: tokens.sub }]}>
            {pendingApproval ? (
              <>
                Your Super Distributor account is registered. An admin will review and activate it. You can log in after approval.
              </>
            ) : (
              <>
                Your KYC is under verification. You'll be activated within{" "}
                <Text style={{ color: colors.greenDark, fontWeight: "800" }}>24 hours</Text> via SMS.
              </>
            )}
          </Text>
          {pendingApproval ? (
            <Pressable onPress={onBack} style={styles.footerBtnPress}>
              <LinearGradient colors={[...colors.gradient]} style={[styles.footerBtn, { marginTop: 26, width: 220 }]}>
                <Text style={styles.footerBtnText}>Back to Login</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={continueToApp} style={styles.footerBtnPress}>
              <LinearGradient colors={[...colors.gradient]} style={[styles.footerBtn, { marginTop: 26, width: 220 }]}>
                <Text style={styles.footerBtnText}>Go to Dashboard</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
      <LinearGradient
        colors={[colors.blueLight, colors.blue]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => (step === 0 ? onBack() : setStep((s) => s - 1))}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>←</Text>
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>{STEP_TITLES[step]}</Text>
            <Text style={styles.headerSub}>Step {step + 1} of 5 · Agent Registration</Text>
          </View>
        </View>
        <View style={styles.progressRow}>
          {STEP_TITLES.map((_, i) => (
            <View
              key={i}
              style={[styles.progressBar, i <= step ? styles.progressBarActive : styles.progressBarIdle]}
            />
          ))}
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0 ? (
            <StepDetails
              signupRole={signupRole}
              setSignupRole={setSignupRole}
              name={name}
              setName={setName}
              sponsorMobile={sponsorMobile}
              setSponsorMobile={setSponsorMobile}
              sponsorList={sponsorList}
              sponsorUid={sponsorUid}
              sponsorName={sponsorName}
              sponsorRoleLabel={sponsorRoleLabel}
              sponsorOk={sponsorOk}
              sponsorSearching={sponsorSearching}
              onSelectSponsor={selectSponsor}
              mobile={mobile}
              setMobile={setMobile}
              otpSent={otpSent}
              otpLoading={otpLoading}
              onRequestOtp={requestOtp}
              otp={otp}
              setOtp={setOtp}
              devOtp={devOtp}
            />
          ) : null}
          {step === 1 ? (
            <StepKyc
              pan={pan}
              setPan={setPan}
              aadhaar={aadhaar}
              setAadhaar={setAadhaar}
              uploads={uploads}
              toggleUpload={toggleUpload}
            />
          ) : null}
          {step === 2 ? <StepSelfie done={selfieDone} onToggle={() => setSelfieDone((v) => !v)} /> : null}
          {step === 3 ? (
            <StepOutlet
              isRetailer={signupRole === "retailer"}
              mobile={mobile}
              setMobile={setMobile}
              gender={gender}
              setGender={setGender}
              email={email}
              setEmail={setEmail}
              addressFull={addressFull}
              setAddressFull={setAddressFull}
              city={city}
              setCity={setCity}
              pincode={pincode}
              setPincode={setPincode}
              dateOfBirth={dateOfBirth}
              setDateOfBirth={setDateOfBirth}
              latitude={latitude}
              longitude={longitude}
              geoBusy={geoBusy}
              onCaptureLocation={captureLocation}
            />
          ) : null}
          {step === 4 ? (
            <StepReview
              name={name}
              mobile={mobile}
              signupRole={signupRole}
              sponsorUid={sponsorUid}
              sponsorName={sponsorName}
              pan={pan}
              aadhaar={aadhaar}
              email={email}
              addressFull={addressFull}
              city={city}
              pincode={pincode}
              dateOfBirth={dateOfBirth}
              latitude={latitude}
              longitude={longitude}
            />
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: tokens.bg }]}>
          <Pressable onPress={handleNext} disabled={submitting} style={styles.footerBtnPress}>
            <LinearGradient colors={[...colors.gradient]} style={styles.footerBtn}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.footerBtnText}>{step === 4 ? "Submit Application" : "Continue"}</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepDetails(props: {
  signupRole: SignupRole;
  setSignupRole: (v: SignupRole) => void;
  name: string;
  setName: (v: string) => void;
  sponsorMobile: string;
  setSponsorMobile: (v: string) => void;
  sponsorList: Array<{ uid: string; name: string; mobile: string; role?: string }>;
  sponsorUid: string;
  sponsorName: string | null;
  sponsorRoleLabel: string;
  sponsorOk: boolean;
  sponsorSearching: boolean;
  onSelectSponsor: (item: { uid: string; name: string; mobile: string; role?: string }) => void;
  mobile: string;
  setMobile: (v: string) => void;
  otpSent: boolean;
  otpLoading: boolean;
  onRequestOtp: () => void;
  otp: string;
  setOtp: React.Dispatch<React.SetStateAction<string>>;
  devOtp: string;
}) {
  const { tokens } = useTheme();
  const needsUpline = props.signupRole !== "master_distributor";
  return (
    <View>
      <View style={styles.iconBadgeWrap}>
        <View style={[styles.iconBadge, { backgroundColor: tokens.softBlue }]}>
          <Phone size={26} color={colors.blueFlat} strokeWidth={2} />
        </View>
        <Text style={[styles.stepTitle, { color: tokens.txt }]}>Let's get started</Text>
        <Text style={[styles.stepSub, { color: tokens.sub }]}>
          {needsUpline
            ? "Select your role, then map under your upline"
            : "Select Super Distributor to register directly for admin approval"}
        </Text>
      </View>

      <View
        style={[
          styles.rolePanel,
          {
            backgroundColor: tokens.softBlue,
            borderColor: `${colors.blueFlat}40`,
          },
        ]}
      >
        <Text style={[styles.rolePanelEyebrow, { color: colors.blueFlat }]}>STEP 1 · CHOOSE ROLE</Text>
        <Text style={[styles.rolePanelTitle, { color: tokens.txt }]}>Register as</Text>
        <Text style={[styles.rolePanelHint, { color: tokens.sub }]}>
          {needsUpline
            ? "Tap one option below — this decides your upline"
            : "No upline mobile — admin will activate your account"}
        </Text>
        <View style={styles.roleGrid}>
          {SIGNUP_ROLES.map((opt) => {
            const active = props.signupRole === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => props.setSignupRole(opt.value)}
                style={[
                  styles.roleOption,
                  {
                    borderColor: active ? colors.blueFlat : tokens.cardBorder,
                    backgroundColor: active ? colors.blueFlat : tokens.card,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.roleOptionText,
                    { color: active ? "#fff" : tokens.txt2 },
                  ]}
                  numberOfLines={2}
                >
                  {opt.label}
                </Text>
                {active ? (
                  <Text style={styles.roleOptionCheck}>Selected</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Field label="FULL NAME" tokens={tokens}>
        <TextInput
          value={props.name}
          onChangeText={props.setName}
          placeholder="Your name"
          placeholderTextColor={tokens.mute}
          style={[fieldStyles.input, { color: tokens.txt2, backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder }]}
        />
      </Field>

      <Field label="YOUR MOBILE" tokens={tokens}>
        <View style={[fieldStyles.row, { backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder }]}>
          <Text style={[fieldStyles.prefix, { color: tokens.txt2 }]}>+91</Text>
          <View style={[fieldStyles.divider, { backgroundColor: tokens.inputBorder }]} />
          <TextInput
            value={props.mobile}
            onChangeText={(t) => props.setMobile(t.replace(/\D/g, "").slice(0, 10))}
            keyboardType="number-pad"
            maxLength={10}
            editable={!props.otpSent}
            placeholder="10-digit mobile"
            placeholderTextColor={tokens.mute}
            style={[fieldStyles.rowInput, { color: tokens.txt2 }]}
          />
        </View>
      </Field>

      {needsUpline ? (
        <>
          <Field label={UPLINE_LABEL[props.signupRole as Exclude<SignupRole, "master_distributor">]} tokens={tokens}>
            <View style={[fieldStyles.row, { backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder }]}>
              <Text style={[fieldStyles.prefix, { color: tokens.txt2 }]}>+91</Text>
              <View style={[fieldStyles.divider, { backgroundColor: tokens.inputBorder }]} />
              <TextInput
                value={props.sponsorMobile}
                onChangeText={(t) => props.setSponsorMobile(t.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit upline mobile"
                keyboardType="number-pad"
                maxLength={10}
                placeholderTextColor={tokens.mute}
                style={[fieldStyles.rowInput, { color: tokens.txt2 }]}
              />
            </View>
          </Field>
          {props.sponsorSearching ? (
            <Text style={{ fontSize: 12, color: tokens.mute, marginBottom: 8 }}>Checking upline…</Text>
          ) : null}
          {props.sponsorOk && props.sponsorName ? (
            <View style={[styles.sponsorOk, { backgroundColor: `${colors.green}22`, marginBottom: 8 }]}>
              <CheckCircle2 size={16} color={colors.green} strokeWidth={2.5} />
              <Text style={[styles.sponsorOkText, { color: colors.green, fontSize: 14 }]}>
                {props.sponsorName} · {props.sponsorRoleLabel}
              </Text>
            </View>
          ) : null}
          {props.sponsorMobile.length === 10 && !props.sponsorSearching && !props.sponsorOk ? (
            <Text style={styles.sponsorErr}>
              No active {UPLINE_ROLE_LABEL[SPONSOR_ROLE[props.signupRole]].toLowerCase()} found for this number
            </Text>
          ) : null}
        </>
      ) : (
        <View style={[styles.sponsorOk, { backgroundColor: tokens.softBlue, marginBottom: 10 }]}>
          <Text style={[styles.sponsorOkText, { color: colors.blueFlat, fontSize: 13 }]}>
            No upline mobile needed. After OTP, admin will activate your account.
          </Text>
        </View>
      )}

      {!props.otpSent ? (
        <Pressable
          onPress={props.onRequestOtp}
          disabled={props.otpLoading || (needsUpline && !props.sponsorOk)}
          style={styles.sendOtpBtnPress}
        >
          <LinearGradient colors={[...colors.gradientButton]} style={styles.sendOtpBtn}>
            {props.otpLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendOtpBtnText}>Send OTP</Text>
            )}
          </LinearGradient>
        </Pressable>
      ) : (
        <View style={styles.otpBlock}>
          {__DEV__ && props.devOtp ? (
            <View style={[styles.devOtpBox, { borderColor: colors.green, backgroundColor: colors.greenBg }]}>
              <Text style={[styles.devOtpText, { color: colors.greenDark }]}>Dev OTP: {props.devOtp}</Text>
            </View>
          ) : null}
          <Text style={[styles.label, { color: tokens.sub, marginBottom: 10 }]}>ENTER OTP</Text>
          <CodeGrid length={6} value={props.otp} />
          <View style={{ marginTop: 16 }}>
            <NumericKeypad
              onDigit={(d) => props.setOtp((prev) => (prev.length >= 6 ? prev : prev + d))}
              onBackspace={() => props.setOtp((prev) => prev.slice(0, -1))}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function StepKyc(props: {
  pan: string;
  setPan: (v: string) => void;
  aadhaar: string;
  setAadhaar: (v: string) => void;
  uploads: Record<UploadKey, boolean>;
  toggleUpload: (key: UploadKey) => void;
}) {
  const { tokens } = useTheme();
  const rows: { key: UploadKey; label: string }[] = [
    { key: "aadhaarFront", label: "Aadhaar Card — Front" },
    { key: "aadhaarBack", label: "Aadhaar Card — Back" },
    { key: "panCard", label: "PAN Card" },
  ];

  return (
    <View>
      <Text style={[styles.stepTitle, { color: tokens.txt }]}>KYC Documents</Text>
      <Text style={[styles.stepSub, { color: tokens.sub, marginBottom: 6 }]}>
        As per RBI norms, verify your identity
      </Text>

      <Field label="PAN NUMBER" tokens={tokens}>
        <TextInput
          value={props.pan}
          onChangeText={(t) => props.setPan(t.toUpperCase().slice(0, 10))}
          placeholder="ABCDE1234F"
          autoCapitalize="characters"
          placeholderTextColor={tokens.mute}
          style={[fieldStyles.input, { color: tokens.txt2, backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder, letterSpacing: 1.5 }]}
        />
      </Field>

      <Field label="AADHAAR NUMBER" tokens={tokens}>
        <TextInput
          value={props.aadhaar}
          onChangeText={(t) => props.setAadhaar(t.replace(/\D/g, "").slice(0, 12))}
          placeholder="123456789012"
          keyboardType="number-pad"
          placeholderTextColor={tokens.mute}
          style={[fieldStyles.input, { color: tokens.txt2, backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder, letterSpacing: 2 }]}
        />
      </Field>

      <Text style={[styles.label, { color: tokens.sub, marginTop: 6, marginBottom: 10 }]}>
        UPLOAD DOCUMENTS
      </Text>
      {rows.map((r) => {
        const on = props.uploads[r.key];
        return (
          <Pressable
            key={r.key}
            onPress={() => props.toggleUpload(r.key)}
            style={[styles.uploadRow, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          >
            <View style={[styles.uploadIcon, { backgroundColor: on ? colors.greenBg : tokens.softBlue }]}>
              <FileText size={18} color={on ? colors.greenDark : colors.blueFlat} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.uploadLabel, { color: tokens.txt2 }]}>{r.label}</Text>
              <Text style={[styles.uploadHint, { color: on ? colors.greenDark : tokens.mute }]}>
                {on ? "Uploaded" : "Tap to upload"}
              </Text>
            </View>
            <Text style={{ color: on ? colors.greenDark : tokens.mute, fontWeight: "800" }}>
              {on ? "✓" : "+"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StepSelfie({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  const { tokens } = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={[styles.stepTitle, { color: tokens.txt }]}>Live Photo</Text>
      <Text style={[styles.stepSub, { color: tokens.sub, textAlign: "center" }]}>
        Take a clear selfie for face verification
      </Text>
      <Pressable
        onPress={onToggle}
        style={[
          styles.selfieCircle,
          { backgroundColor: tokens.softBlue, borderColor: done ? colors.green : "#B9C6F2" },
        ]}
      >
        {done ? (
          <CheckCircle2 size={40} color={colors.greenDark} strokeWidth={2} />
        ) : (
          <ScanFace size={40} color={colors.blueFlat} strokeWidth={1.8} />
        )}
        <Text style={[styles.selfieText, { color: done ? colors.greenDark : colors.blueFlat }]}>
          {done ? "Captured" : "Tap to capture"}
        </Text>
      </Pressable>
      <View style={styles.tipsWrap}>
        {["Good lighting, plain background", "Remove glasses/mask", "Face fully visible in frame"].map(
          (t) => (
            <View key={t} style={styles.tipRow}>
              <CheckCircle2 size={14} color={colors.greenDark} strokeWidth={2.4} />
              <Text style={[styles.tipText, { color: tokens.sub }]}>{t}</Text>
            </View>
          ),
        )}
      </View>
    </View>
  );
}

function StepOutlet(props: {
  isRetailer: boolean;
  mobile: string;
  setMobile: (v: string) => void;
  gender: Gender;
  setGender: (v: Gender) => void;
  email: string;
  setEmail: (v: string) => void;
  addressFull: string;
  setAddressFull: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  pincode: string;
  setPincode: (v: string) => void;
  dateOfBirth: string;
  setDateOfBirth: (v: string) => void;
  latitude: string;
  longitude: string;
  geoBusy: boolean;
  onCaptureLocation: () => void;
}) {
  const { tokens } = useTheme();

  if (!props.isRetailer) {
    return (
      <View>
        <Text style={[styles.stepTitle, { color: tokens.txt }]}>Outlet Details</Text>
        <Text style={[styles.stepSub, { color: tokens.sub, marginBottom: 12 }]}>
          InstantPay outlet registration is only required for retailers. Continue to review.
        </Text>
        <View style={[styles.infoBox, { backgroundColor: tokens.softBlue }]}>
          <MapPin size={16} color={colors.blueFlat} />
          <Text style={[styles.infoText, { color: tokens.txt2 }]}>
            Your account does not need an InstantPay outlet. Tap Continue.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.stepTitle, { color: tokens.txt }]}>Outlet Details</Text>
      <Text style={[styles.stepSub, { color: tokens.sub, marginBottom: 6 }]}>
        InstantPay onboarding — address must match Aadhaar; name &amp; DOB must match PAN
      </Text>

      <Field label="MOBILE (AADHAAR-LINKED)" tokens={tokens}>
        <View style={[fieldStyles.row, { backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder }]}>
          <Text style={[fieldStyles.prefix, { color: tokens.txt2 }]}>+91</Text>
          <View style={[fieldStyles.divider, { backgroundColor: tokens.inputBorder }]} />
          <TextInput
            value={props.mobile}
            onChangeText={(t) => props.setMobile(t.replace(/\D/g, "").slice(0, 10))}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="10-digit mobile"
            placeholderTextColor={tokens.mute}
            style={[fieldStyles.rowInput, { color: tokens.txt2 }]}
          />
        </View>
      </Field>

      <Field label="GENDER" tokens={tokens}>
        <View style={styles.chipRow}>
          {(
            [
              { value: "M" as const, label: "Male" },
              { value: "F" as const, label: "Female" },
              { value: "T" as const, label: "Other" },
            ] as const
          ).map((opt) => {
            const active = props.gender === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => props.setGender(opt.value)}
                style={[
                  styles.genderChip,
                  {
                    borderColor: active ? colors.blueFlat : tokens.inputBorder,
                    backgroundColor: active ? colors.blueFlat : tokens.inputBg,
                  },
                ]}
              >
                <Text style={{ color: active ? "#fff" : tokens.txt2, fontWeight: "700", fontSize: 13 }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="DATE OF BIRTH (YYYY-MM-DD)" tokens={tokens}>
        <TextInput
          value={props.dateOfBirth}
          onChangeText={(t) => props.setDateOfBirth(t.replace(/[^\d-]/g, "").slice(0, 10))}
          placeholder="1990-01-15"
          placeholderTextColor={tokens.mute}
          keyboardType="numbers-and-punctuation"
          style={[fieldStyles.input, { color: tokens.txt2, backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder }]}
        />
      </Field>

      <Field label="EMAIL" tokens={tokens}>
        <TextInput
          value={props.email}
          onChangeText={props.setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor={tokens.mute}
          style={[fieldStyles.input, { color: tokens.txt2, backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder }]}
        />
      </Field>

      <Field label="OUTLET ADDRESS (AS ON AADHAAR)" tokens={tokens}>
        <TextInput
          value={props.addressFull}
          onChangeText={props.setAddressFull}
          placeholder="Full address"
          multiline
          placeholderTextColor={tokens.mute}
          style={[
            fieldStyles.input,
            {
              color: tokens.txt2,
              backgroundColor: tokens.inputBg,
              borderColor: tokens.inputBorder,
              minHeight: 72,
              textAlignVertical: "top",
            },
          ]}
        />
      </Field>

      <Field label="CITY" tokens={tokens}>
        <TextInput
          value={props.city}
          onChangeText={props.setCity}
          placeholder="City"
          placeholderTextColor={tokens.mute}
          style={[fieldStyles.input, { color: tokens.txt2, backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder }]}
        />
      </Field>

      <Field label="PINCODE" tokens={tokens}>
        <TextInput
          value={props.pincode}
          onChangeText={(t) => props.setPincode(t.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit pincode"
          keyboardType="number-pad"
          placeholderTextColor={tokens.mute}
          style={[fieldStyles.input, { color: tokens.txt2, backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder, letterSpacing: 1 }]}
        />
      </Field>

      <Pressable
        onPress={props.onCaptureLocation}
        disabled={props.geoBusy}
        style={[
          styles.geoBtn,
          {
            borderColor: props.latitude && props.longitude ? colors.green : colors.blueFlat,
            backgroundColor: props.latitude && props.longitude ? colors.greenBg : tokens.softBlue,
          },
        ]}
      >
        {props.geoBusy ? (
          <ActivityIndicator color={colors.blueFlat} />
        ) : (
          <>
            <MapPin
              size={16}
              color={props.latitude && props.longitude ? colors.green : colors.blueFlat}
              strokeWidth={2.5}
            />
            <Text
              style={[
                styles.geoBtnText,
                { color: props.latitude && props.longitude ? colors.greenDark : colors.blueFlat },
              ]}
            >
              {props.latitude && props.longitude
                ? "Location set — tap to refresh"
                : "Use current location"}
            </Text>
          </>
        )}
      </Pressable>
      <Text style={{ fontSize: 11, color: tokens.mute, marginBottom: 8, marginTop: -2 }}>
        Lat/long stay hidden and are sent to InstantPay when you register.
      </Text>
    </View>
  );
}

function StepReview(props: {
  name: string;
  mobile: string;
  signupRole: SignupRole;
  sponsorUid: string;
  sponsorName: string | null;
  pan: string;
  aadhaar: string;
  email: string;
  addressFull: string;
  city: string;
  pincode: string;
  dateOfBirth: string;
  latitude: string;
  longitude: string;
}) {
  const { tokens } = useTheme();
  const roleLabel = SIGNUP_ROLES.find((r) => r.value === props.signupRole)?.label ?? props.signupRole;
  const isRetailer = props.signupRole === "retailer";
  const rows = [
    { k: "Full Name", v: props.name },
    { k: "Mobile", v: `+91 ${props.mobile}` },
    {
      k: "Role",
      v: roleLabel,
    },
    ...(props.sponsorUid
      ? [
          {
            k: "Upline",
            v: props.sponsorName ? `${props.sponsorName} (${props.sponsorUid})` : props.sponsorUid,
          },
        ]
      : []),
    { k: "PAN", v: props.pan },
    { k: "Aadhaar", v: `XXXX XXXX ${props.aadhaar.slice(-4)}` },
    ...(isRetailer
      ? [
          { k: "Email", v: props.email },
          { k: "DOB", v: props.dateOfBirth },
          { k: "Address", v: props.addressFull },
          { k: "City", v: props.city },
          { k: "Pincode", v: props.pincode },
          {
            k: "Location",
            v: props.latitude && props.longitude ? "Current location set" : "Not set",
          },
        ]
      : []),
  ];
  return (
    <View>
      <Text style={[styles.stepTitle, { color: tokens.txt }]}>Review &amp; Submit</Text>
      <Text style={[styles.stepSub, { color: tokens.sub, marginBottom: 12 }]}>
        Confirm your details before submitting
      </Text>
      <View style={[styles.reviewCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
        {rows.map((r, i) => (
          <View key={r.k} style={[styles.reviewRow, i < rows.length - 1 && { borderBottomColor: tokens.cardBorder, borderBottomWidth: 1 }]}>
            <Text style={[styles.reviewK, { color: tokens.sub }]}>{r.k}</Text>
            <Text style={[styles.reviewV, { color: tokens.txt2 }]}>{r.v}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.infoBox, { backgroundColor: tokens.softBlue }]}>
        <Fingerprint size={16} color={colors.blueFlat} />
        <Text style={[styles.infoText, { color: tokens.txt2 }]}>
          {isRetailer
            ? "Submitting registers your InstantPay outlet with the details above."
            : "By submitting, you agree to AsanPay Agent Terms."}
        </Text>
      </View>
    </View>
  );
}

function Field({
  label,
  tokens,
  children,
}: {
  label: string;
  tokens: { sub: string };
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, { color: tokens.sub, marginBottom: 8 }]}>{label}</Text>
      {children}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  input: { height: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 15, fontSize: 15, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, height: 54, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 15 },
  prefix: { fontWeight: "700", fontSize: 16 },
  divider: { width: 1, height: 22 },
  rowInput: { flex: 1, fontWeight: "600", fontSize: 17, letterSpacing: 0.5 },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,.16)", alignItems: "center", justifyContent: "center" },
  backBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerTitle: { fontFamily: "System", fontWeight: "700", fontSize: 18, color: "#fff" },
  headerSub: { fontSize: 12, color: "#B9C6F2", fontWeight: "500", marginTop: 1 },
  progressRow: { marginTop: 18, flexDirection: "row", gap: 6 },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  progressBarActive: { backgroundColor: "#3BE39A" },
  progressBarIdle: { backgroundColor: "rgba(255,255,255,.2)" },
  content: { padding: 20, paddingBottom: 24 },
  iconBadgeWrap: { alignItems: "center", marginBottom: 22 },
  iconBadge: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontFamily: "System", fontWeight: "800", fontSize: 19, marginTop: 12 },
  stepSub: { fontSize: 13, fontWeight: "500", marginTop: 4 },
  label: { fontSize: 11.5, fontWeight: "700", letterSpacing: 0.3 },
  rolePanel: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  rolePanelEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  rolePanelTitle: {
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 16,
  },
  rolePanelHint: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
    marginBottom: 12,
    lineHeight: 16,
  },
  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roleOption: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: "30%",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  roleOptionText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
  },
  roleOptionCheck: {
    marginTop: 4,
    fontSize: 9.5,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.2,
  },
  sendOtpBtnPress: { marginTop: 6, borderRadius: 14 },
  sponsorOk: {
    marginTop: 8,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sponsorOkText: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  sponsorErr: { marginTop: 6, marginBottom: 4, fontSize: 12, fontWeight: "500", color: "#B91C1C" },
  sendOtpBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  sendOtpBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  otpBlock: { marginTop: 4 },
  devOtpBox: { alignItems: "center", borderWidth: 1.5, borderRadius: 12, padding: 10, marginBottom: 14 },
  devOtpText: { fontWeight: "800", fontSize: 13, letterSpacing: 1 },
  uploadRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 10 },
  uploadIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  uploadLabel: { fontFamily: "System", fontWeight: "700", fontSize: 13.5 },
  uploadHint: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  selfieCircle: { marginTop: 22, width: 190, height: 190, borderRadius: 95, borderWidth: 2.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 10 },
  selfieText: { fontSize: 12.5, fontWeight: "700" },
  tipsWrap: { marginTop: 22, width: "100%", gap: 9 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  tipText: { fontSize: 12.5, fontWeight: "500" },
  chipRow: { flexDirection: "row", gap: 8 },
  genderChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: "center",
  },
  geoBtn: {
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  geoBtnText: { fontSize: 14, fontWeight: "800" },
  roleChip: { flex: 1, borderRadius: 13, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 8 },
  roleChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  roleChipDisabled: { opacity: 0.6 },
  roleChipTitle: { fontFamily: "System", fontWeight: "700", fontSize: 12.5 },
  roleChipTitleActive: { color: "#fff" },
  roleChipDesc: { fontSize: 9.5, fontWeight: "600", marginTop: 2 },
  roleChipDescActive: { color: "rgba(255,255,255,.75)" },
  reviewCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  reviewK: { fontSize: 13, fontWeight: "500" },
  reviewV: { fontSize: 13, fontWeight: "700", textAlign: "right", maxWidth: "60%" },
  infoBox: { marginTop: 14, flexDirection: "row", gap: 10, borderRadius: 14, padding: 13, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 12, fontWeight: "500", lineHeight: 17 },
  footer: { padding: 18 },
  footerBtnPress: { borderRadius: 15 },
  footerBtn: { borderRadius: 15, paddingVertical: 16, alignItems: "center" },
  footerBtnText: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  successIcon: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center" },
  successTitle: { marginTop: 22, fontFamily: "System", fontWeight: "800", fontSize: 22 },
  successSub: { marginTop: 8, fontSize: 14, fontWeight: "500", textAlign: "center", lineHeight: 20 },
});
