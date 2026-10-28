import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { ArrowLeft, Calendar, Check, CheckCircle2, MapPin, X } from "lucide-react-native";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { api, AADHAAR_OTP_TIMEOUT_MS } from "../../lib/api";
import { bestFix } from "../../lib/geoCapture";
import { apiError } from "../../utils/apiError";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import { BrandMark } from "../../components/BrandMark";
import { IfscBankDetailsFields } from "../../components/IfscBankDetailsFields";
import { OptionPickerField } from "../../components/OptionPickerField";
import { SignupBankCheck } from "../../components/SignupBankCheck";
import { LabelText } from "../../components/RequiredMark";
import { MobileSignupStepper, MOBILE_SIGNUP_STEPS } from "../../components/MobileSignupStepper";
import { CardCameraModal } from "../../components/CardCameraModal";
import { KycCardUpload, type KycCardStage } from "../../components/KycCardUpload";
import { TermsAcceptModal } from "../../components/TermsAcceptModal";
import { SignupLocationCard } from "../../components/SignupLocationCard";
import {
  PAN_FORMAT_ERROR,
  SIGNUP_POLICY_VERSION,
  kycDocCheckBlocksStep,
  kycDocCheckRunningOnStep,
  formatPanName,
  isSignupPlaceholderName,
  kycDocCheckHints,
  kycDocCheckLabel,
  kycDocCheckSlotsForStep,
  kycDocCheckToUi,
  type KycDocCheckResult,
  type KycDocCheckSlot,
  type KycDocCheckUi,
} from "@asanpay/shared-types";
import {
  clearMobileSignupDraft,
  EMPTY_MOBILE_SIGNUP_DRAFT,
  getSignupResumeStep,
  loadMobileSignupDraft,
  saveMobileSignupDraft,
  type MobileSignupDraft,
  type SignupRole,
} from "../../lib/signupDraft";

type SponsorRole = "admin" | "super_distributor" | "distributor";

interface SignupScreenProps {
  onBack: () => void;
  /** Pre-select role when opening signup from login role chips. */
  initialRole?: SignupRole;
}

function isPartnerRole(role: SignupRole): boolean {
  return role === "distributor" || role === "super_distributor";
}

function signupRoleLabel(role: SignupRole): string {
  if (role === "super_distributor") return "Super Distributor";
  if (role === "distributor") return "Distributor";
  if (role === "direct_retailer") return "Direct Retailer";
  return "Retailer";
}

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

const ROLE_OPTIONS: { value: SignupRole; label: string }[] = [
  { value: "retailer", label: "Retailer" },
  { value: "direct_retailer", label: "Direct Retailer" },
  { value: "distributor", label: "Distributor" },
  { value: "super_distributor", label: "Super Distributor" },
];

const SPONSOR_ROLE: Record<Exclude<SignupRole, "direct_retailer">, SponsorRole> = {
  super_distributor: "admin",
  distributor: "super_distributor",
  retailer: "distributor",
};

const UPLINE_LABEL: Record<"distributor" | "retailer", string> = {
  distributor: "Super Distributor mobile",
  retailer: "Distributor mobile",
};

const CROP_TITLE: Record<KycDocCheckSlot, string> = {
  panImage: "Crop PAN card",
  aadhaarFront: "Crop Aadhaar front",
  aadhaarBack: "Crop Aadhaar back",
};

const CAMERA_TITLE: Record<KycDocCheckSlot, string> = {
  panImage: "Photo of PAN card",
  aadhaarFront: "Photo of Aadhaar front",
  aadhaarBack: "Photo of Aadhaar back",
};

const BUSINESS_TYPES = ["Sole Proprietorship", "Partnership", "Private Limited", "Other"];
const BUSINESS_CATEGORIES = ["Mobile Handsets", "Kirana", "Electronics", "Pharmacy", "Other"];
const TURNOVERS = ["Below 1L", "1L-5L", "5L-10L", "10L+"];
const BUSINESS_PROOFS = ["Shop License", "GST Certificate", "Udyam", "Rent Agreement", "Other"];

/** Business category is multi-select, saved as "Kirana, Pharmacy". */
function splitBusinessCategories(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Show YYYY-MM-DD as DD/MM/YYYY on mobile. */
function isoToDisplayDob(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  return "";
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Type digits → DD/MM/YYYY (no native calendar — avoids Android crash). */
function formatDateDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function displayToIso(display: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1940 || year > new Date().getFullYear()) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  if (dt.getTime() > Date.now()) return null;
  return dateToIso(dt);
}

function isoToDate(iso: string, fallback: Date): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return fallback;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Text field + calendar icon. Calendar is a JS modal (no native DateTimePicker — avoids Android crash). */
function DateTextField({
  label,
  isoValue,
  onIsoChange,
  placeholder,
  hint,
  tokens,
  inputStyle,
  optional,
}: {
  label: string;
  isoValue: string;
  onIsoChange: (iso: string) => void;
  placeholder: string;
  hint: string;
  tokens: { mute: string; card: string; cardBorder: string; txt2: string };
  inputStyle: object | object[];
  optional?: boolean;
}) {
  const [text, setText] = useState(() => isoToDisplayDob(isoValue));
  const [calOpen, setCalOpen] = useState(false);
  const seed = isoToDate(isoValue, optional ? new Date() : new Date(1995, 0, 1));
  const [viewYear, setViewYear] = useState(seed.getFullYear());
  const [viewMonth, setViewMonth] = useState(seed.getMonth());
  const [pickerLevel, setPickerLevel] = useState<"day" | "month" | "year">("day");

  useEffect(() => {
    if (isoValue) setText(isoToDisplayDob(isoValue));
    else if (!calOpen) setText("");
  }, [isoValue, calOpen]);

  function openCalendar() {
    const d = isoToDate(isoValue, optional ? new Date() : new Date(1995, 0, 1));
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setPickerLevel("day");
    setCalOpen(true);
  }

  function pickDay(day: number) {
    const dt = new Date(viewYear, viewMonth, day);
    if (dt.getTime() > Date.now()) return;
    const iso = dateToIso(dt);
    onIsoChange(iso);
    setText(isoToDisplayDob(iso));
    setCalOpen(false);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const selectedDay =
    isoValue &&
    isoValue.startsWith(
      `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`,
    )
      ? Number(isoValue.slice(8, 10))
      : 0;
  const maxYear = new Date().getFullYear();
  const yearBlockStart = Math.floor(viewYear / 12) * 12;
  const yearOptions = Array.from({ length: 12 }, (_, i) => yearBlockStart + i);

  function shiftNav(delta: number) {
    if (pickerLevel === "day") {
      if (delta < 0) {
        if (viewMonth === 0) {
          if (viewYear <= 1940) return;
          setViewYear((y) => y - 1);
          setViewMonth(11);
        } else setViewMonth((m) => m - 1);
      } else if (viewMonth === 11) {
        if (viewYear >= maxYear) return;
        setViewYear((y) => y + 1);
        setViewMonth(0);
      } else {
        if (viewYear === maxYear && viewMonth >= new Date().getMonth()) return;
        setViewMonth((m) => m + 1);
      }
      return;
    }
    if (pickerLevel === "month") {
      const next = viewYear + delta;
      if (next < 1940 || next > maxYear) return;
      setViewYear(next);
      return;
    }
    const next = viewYear + delta * 12;
    if (next + 11 < 1940 || next > maxYear) return;
    setViewYear(Math.min(Math.max(next, 1940), maxYear));
  }

  const headerLabel =
    pickerLevel === "year"
      ? `${yearBlockStart} – ${yearBlockStart + 11}`
      : pickerLevel === "month"
        ? String(viewYear)
        : `${MONTH_LABELS[viewMonth]} ${viewYear}`;

  return (
    <>
      <FieldLabel text={label} color={tokens.mute} />
      <View style={styles.dateRow}>
        <TextInput
          value={text}
          onChangeText={(raw) => {
            const formatted = formatDateDigits(raw);
            setText(formatted);
            if (formatted.length === 10) {
              onIsoChange(displayToIso(formatted) ?? "");
            } else if (isoValue) {
              onIsoChange("");
            }
          }}
          keyboardType="number-pad"
          maxLength={10}
          placeholder={placeholder}
          placeholderTextColor={tokens.mute}
          style={[inputStyle, styles.dateInput]}
        />
        <Pressable
          onPress={openCalendar}
          accessibilityLabel="Open calendar"
          style={[
            styles.calBtn,
            { backgroundColor: tokens.card, borderColor: tokens.cardBorder },
          ]}
        >
          <Calendar size={20} color={colors.blue} />
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: tokens.mute }]}>{hint}</Text>

      <Modal visible={calOpen} transparent animationType="fade" onRequestClose={() => setCalOpen(false)}>
        <Pressable style={styles.calBackdrop} onPress={() => setCalOpen(false)}>
          <Pressable
            style={[styles.calSheet, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.calHeader}>
              <Pressable onPress={() => shiftNav(-1)} hitSlop={8}>
                <Text style={{ color: colors.blue, fontWeight: "800", fontSize: 18 }}>‹</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (pickerLevel === "day") setPickerLevel("month");
                  else if (pickerLevel === "month") setPickerLevel("year");
                }}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Text style={{ color: tokens.txt2, fontWeight: "800", fontSize: 15 }}>{headerLabel}</Text>
                {pickerLevel !== "year" ? (
                  <Text style={{ color: colors.blue, fontWeight: "800", fontSize: 10 }}>▼</Text>
                ) : null}
              </Pressable>
              <Pressable onPress={() => shiftNav(1)} hitSlop={8}>
                <Text style={{ color: colors.blue, fontWeight: "800", fontSize: 18 }}>›</Text>
              </Pressable>
            </View>

            {pickerLevel === "year" ? (
              <View style={styles.calGrid}>
                {yearOptions.map((y) => {
                  const on = y === viewYear;
                  const disabled = y < 1940 || y > maxYear;
                  return (
                    <Pressable
                      key={y}
                      disabled={disabled}
                      onPress={() => {
                        setViewYear(y);
                        setPickerLevel("month");
                      }}
                      style={[
                        styles.calCell,
                        { width: "33.33%" },
                        on && { backgroundColor: colors.blue, borderRadius: 10 },
                        disabled && { opacity: 0.35 },
                      ]}
                    >
                      <Text style={{ color: on ? "#fff" : tokens.txt2, fontWeight: "800", fontSize: 13 }}>{y}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : pickerLevel === "month" ? (
              <View style={styles.calGrid}>
                {MONTH_LABELS.map((name, i) => {
                  const on = i === viewMonth;
                  const disabled = viewYear === maxYear && i > new Date().getMonth();
                  return (
                    <Pressable
                      key={name}
                      disabled={disabled}
                      onPress={() => {
                        setViewMonth(i);
                        setPickerLevel("day");
                      }}
                      style={[
                        styles.calCell,
                        { width: "33.33%" },
                        on && { backgroundColor: colors.blue, borderRadius: 10 },
                        disabled && { opacity: 0.35 },
                      ]}
                    >
                      <Text style={{ color: on ? "#fff" : tokens.txt2, fontWeight: "800", fontSize: 13 }}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <>
                <View style={styles.calWeekRow}>
                  {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
                    <Text key={`${w}-${i}`} style={[styles.calWeekDay, { color: tokens.mute }]}>
                      {w}
                    </Text>
                  ))}
                </View>
                <View style={styles.calGrid}>
                  {Array.from({ length: startWeekday }, (_, i) => (
                    <View key={`e-${i}`} style={styles.calCell} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const dt = new Date(viewYear, viewMonth, day);
                    const disabled = dt.getTime() > Date.now();
                    const selected = selectedDay === day;
                    return (
                      <Pressable
                        key={day}
                        disabled={disabled}
                        onPress={() => pickDay(day)}
                        style={[
                          styles.calCell,
                          selected && { backgroundColor: colors.blue, borderRadius: 10 },
                          disabled && { opacity: 0.35 },
                        ]}
                      >
                        <Text
                          style={{
                            color: selected ? "#fff" : tokens.txt2,
                            fontWeight: selected ? "800" : "600",
                            fontSize: 13,
                          }}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.calFooter}>
              {optional ? (
                <Pressable
                  onPress={() => {
                    onIsoChange("");
                    setText("");
                    setCalOpen(false);
                  }}
                >
                  <Text style={{ color: tokens.mute, fontWeight: "700" }}>Clear</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => setCalOpen(false)}>
                <Text style={{ color: colors.blue, fontWeight: "800" }}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function SignupScreen({ onBack, initialRole }: SignupScreenProps) {
  const { tokens, scheme } = useTheme();
  const setAuth = useAuthStore((s) => s.setAuth);
  const updateUser = useAuthStore((s) => s.updateUser);
  const setSignupContinue = useAuthStore((s) => s.setSignupContinue);
  const authUser = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [draft, setDraft] = useState<MobileSignupDraft>(EMPTY_MOBILE_SIGNUP_DRAFT);
  const [phase, setPhase] = useState<"steps" | "emailOtp">("steps");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [sponsorOk, setSponsorOk] = useState(false);
  const [sponsorLookup, setSponsorLookup] = useState<"idle" | "loading" | "ok" | "notfound">("idle");
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  /** After location Allow succeeds, open Terms (avoids stacking location + Terms modals). */
  const openTermsAfterLocationRef = useRef(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [addressFetchBusy, setAddressFetchBusy] = useState(false);
  const [photoCaptureBusy, setPhotoCaptureBusy] = useState(false);
  const [docChecks, setDocChecks] = useState<Partial<Record<KycDocCheckSlot, KycDocCheckUi>>>({});
  /** Slot the card-frame camera is open for. */
  const [cameraSlot, setCameraSlot] = useState<KycDocCheckSlot | null>(null);
  /** Photo the server check refused, shown faded behind "Photo not accepted". Memory only. */
  const [rejectedPhotos, setRejectedPhotos] = useState<Partial<Record<KycDocCheckSlot, string>>>({});
  /** Photo as picked, so "Adjust crop" re-crops from the full photo rather than the auto-crop. */
  const docOriginalsRef = useRef<Partial<Record<KycDocCheckSlot, string>>>({});
  /** Latest check per field — stale responses (photo re-picked) are ignored. */
  const docCheckSeqRef = useRef<Partial<Record<KycDocCheckSlot, number>>>({});
  /** Continue was pressed while a photo on this step was still being checked. */
  const [continueAfterCheck, setContinueAfterCheck] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [aadhaarOtp, setAadhaarOtp] = useState("");
  const [aadhaarOtpBusy, setAadhaarOtpBusy] = useState<"send" | "verify" | null>(null);
  /** Send timed out on the app, but the OTP may already be on its way — verify uses the server's latest request. */
  const [aadhaarOtpUnconfirmed, setAadhaarOtpUnconfirmed] = useState(false);
  const aadhaarOtpStarted = Boolean(draft.aadhaarOtpRequestId) || aadhaarOtpUnconfirmed;
  const [panVerifyBusy, setPanVerifyBusy] = useState(false);
  const [panVerifyFailed, setPanVerifyFailed] = useState(false);
  const panAutoAttemptRef = useRef("");
  const panInputRef = useRef<TextInput>(null);

  const stepIndex = draft.stepIndex;
  const needsUpline = draft.role !== "super_distributor" && draft.role !== "direct_retailer";
  const canEditIdentity =
    !draft.accountCreated ||
    (authUser
      ? authUser.kycStatus === "rejected" || !authUser.hasKycDocs
      : false);
  const sponsorRole =
    draft.role === "direct_retailer"
      ? "admin"
      : SPONSOR_ROLE[draft.role as Exclude<SignupRole, "direct_retailer">];
  const storageKey = draft.accountCreated && authUser?.id ? authUser.id : draft.mobile || "anon";
  const hasLocation = Boolean(draft.latitude && draft.longitude);

  function patch(p: Partial<MobileSignupDraft>) {
    setDraft((d) => {
      const next = { ...d, ...p };
      const prevMax = Math.max(d.maxStepReached ?? 0, d.stepIndex ?? 0);
      next.maxStepReached = Math.max(prevMax, next.maxStepReached ?? 0, next.stepIndex ?? 0);
      return next;
    });
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

  function finishOpenTermsAfterLocation() {
    if (!openTermsAfterLocationRef.current) return;
    openTermsAfterLocationRef.current = false;
    setShowTermsModal(true);
  }

  /** Step 0 Terms checkbox: fetch location first, then open Terms with coords filled. */
  async function beginTermsAccept() {
    if (otpSent) return;
    if (draft.termsAccepted) {
      patch({ termsAccepted: false });
      return;
    }
    if (draft.latitude && draft.longitude) {
      setShowTermsModal(true);
      return;
    }
    openTermsAfterLocationRef.current = true;
    await ensureLocation();
    // Success opens Terms via finishOpenTermsAfterLocation; failure shows location modal.
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
          setShowTermsModal(false);
          setShowLocationModal(true);
          return false;
        }
      }

      // Prefer faster network location first; GPS high-accuracy often hangs on some phones.
      let coords: { latitude: string; longitude: string };
      try {
        coords = await readPosition(false, 10_000);
      } catch {
        const pos = await bestFix(12_000);
        coords = {
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
        };
      }

      patch({ latitude: coords.latitude, longitude: coords.longitude });
      setLocationError(null);
      setShowLocationModal(false);
      finishOpenTermsAfterLocation();
      return true;
    } catch {
      setLocationError("Could not get location. Turn on GPS / Location and try again.");
      setShowTermsModal(false);
      setShowLocationModal(true);
      return false;
    } finally {
      setLocationBusy(false);
    }
  }

  async function fetchAddressFromLocation(target: "home" | "business" = "home") {
    setAddressFetchBusy(true);
    try {
      let useLat = draft.latitude;
      let useLng = draft.longitude;
      if (!useLat || !useLng) {
        if (Platform.OS === "android") {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: "Location Permission",
              message: "AsanPay needs your location to fetch your address.",
              buttonPositive: "Allow",
              buttonNegative: "Deny",
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            showAlert("Location required", "Allow location access to fetch address");
            return;
          }
        }
        let coords: { latitude: string; longitude: string };
        try {
          coords = await readPosition(false, 10_000);
        } catch {
          coords = await readPosition(true, 12_000);
        }
        useLat = coords.latitude;
        useLng = coords.longitude;
        patch({ latitude: useLat, longitude: useLng });
      }

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${useLat}&lon=${useLng}&addressdetails=1`,
        { headers: { Accept: "application/json", "User-Agent": "AsanPayMobile/1.0" } },
      );
      if (!res.ok) {
        showAlert("Fetch failed", "Could not fetch address from location. Enter address manually.");
        return;
      }
      const data = (await res.json()) as { display_name?: string; address?: Record<string, string> };
      const a = data.address ?? {};
      let city = (a.city || a.town || a.municipality || a.village || a.hamlet || a.suburb || "").trim();
      let district = (a.state_district || a.county || a.city_district || city || "").trim();
      let state = (a.state || "").trim();
      const pincode = (a.postcode || "").replace(/\D/g, "").slice(0, 6);
      const displayName = (data.display_name || "").trim();
      // Full OSM display_name — rural areas often have no road name.
      const addressLine =
        displayName ||
        [a.house_number, a.road || a.pedestrian, a.village || a.suburb, city || district, state, pincode]
          .filter(Boolean)
          .join(", ");
      if (!addressLine && !pincode && !city && !district && !state) {
        showAlert("Fetch failed", "Could not fetch address from location. Enter address manually.");
        return;
      }
      if (pincode.length === 6) {
        try {
          const pinRes = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
          const raw = await pinRes.json();
          const block = Array.isArray(raw) ? raw[0] : raw;
          const po = block?.PostOffice?.[0];
          if (po) {
            city = (po.Name || po.Block || city || "").trim();
            district = po.District || district;
            state = po.State || state;
          }
        } catch {
          /* keep nominatim values */
        }
      }
      if (target === "business") {
        patch({
          businessAddress: addressLine || draft.businessAddress,
          businessPincode: pincode || draft.businessPincode,
          businessCity: city || draft.businessCity,
          businessDistrict: district || draft.businessDistrict,
          businessState: state || draft.businessState,
        });
      } else {
        patch({
          address: addressLine || draft.address,
          pincode: pincode || draft.pincode,
          city: city || draft.city,
          district: district || draft.district,
          state: state || draft.state,
        });
      }
      showAlert("Address fetched", "Address, pincode, city, district and state filled from location.");
    } catch {
      showAlert("Location required", "Allow location access to fetch address");
    } finally {
      setAddressFetchBusy(false);
    }
  }

  function useResidentialForBusiness() {
    if (!draft.address.trim()) {
      showAlert("No address", "Enter or fetch residential address on the Details step first.");
      return;
    }
    patch({
      businessAddress: draft.address.trim(),
      businessPincode: draft.pincode,
      businessCity: draft.city.trim(),
      businessDistrict: draft.district.trim(),
      businessState: draft.state.trim(),
    });
    showAlert("Copied", "Business address copied from residential.");
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const phone = (authUser?.mobile || "").replace(/\D/g, "").slice(0, 10);
      const fromUser = authUser?.id ? await loadMobileSignupDraft(authUser.id) : null;
      const fromMobile = phone ? await loadMobileSignupDraft(phone) : null;
      let existing = fromUser || fromMobile;
      if (existing && phone) {
        const draftPhone = (existing.mobile || "").replace(/\D/g, "").slice(0, 10);
        if (draftPhone && draftPhone.length === 10 && draftPhone !== phone && !fromUser) {
          existing = null;
        }
      }

      if (!alive) return;

      if (authUser?.id) {
        if (authUser.kycStatus === "verified") {
          setDraftReady(true);
          return;
        }
        if (authUser.hasKycDocs && authUser.kycStatus !== "rejected") {
          setDraftReady(true);
          return;
        }
        const base = existing ? { ...EMPTY_MOBILE_SIGNUP_DRAFT, ...existing } : { ...EMPTY_MOBILE_SIGNUP_DRAFT };
        const resumeAt = getSignupResumeStep(base, 2);
        setDraft({
          ...base,
          mobile: phone || base.mobile.replace(/\D/g, "").slice(0, 10),
          accountCreated: true,
          signupToken: "",
          name: base.name.trim() || (isSignupPlaceholderName(authUser.name) ? "" : authUser.name) || "",
          role: (authUser.role as SignupRole) || base.role,
          maxStepReached: resumeAt,
          stepIndex: resumeAt,
        });
        setDraftReady(true);
        return;
      }

      if (existing) {
        if (!existing.accountCreated && isPartnerRole(existing.role)) {
          existing.role = "retailer";
        }
        setDraft(existing);
        if (existing.accountCreated && existing.stepIndex < 2) {
          setDraft({ ...existing, stepIndex: 2 });
        } else if (existing.signupToken && existing.stepIndex < 1 && !existing.accountCreated) {
          setDraft({ ...existing, stepIndex: 1 });
        }
      } else if (initialRole === "retailer" || initialRole === "direct_retailer") {
        setDraft({ ...EMPTY_MOBILE_SIGNUP_DRAFT, role: initialRole });
      }
      setDraftReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, authUser?.mobile]);

  useEffect(() => {
    if (!draftReady) return;
    void saveMobileSignupDraft(storageKey, draft);
  }, [draft, draftReady, storageKey]);

  useEffect(() => {
    if (!draftReady || !draft.accountCreated || !needsUpline) return;
    if (draft.sponsorUid && draft.sponsorMobile) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{ upline: { uid: string; name: string; mobile: string } | null }>
        >("/auth/upline");
        if (cancelled || !data.success || !data.data?.upline) return;
        const u = data.data.upline;
        patch({
          sponsorUid: u.uid,
          sponsorName: u.name,
          sponsorMobile: u.mobile.replace(/\D/g, "").slice(0, 10),
        });
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, draft.accountCreated, needsUpline, authUser?.id]);

  useEffect(() => {
    if (!draftReady || stepIndex !== 0 || otpSent || phase !== "steps") return;
    const phone = draft.mobile.replace(/\D/g, "").slice(0, 10);
    if (phone.length !== 10) {
      setMobileError(null);
      return;
    }
    if (draft.accountCreated && authUser?.mobile) {
      const mine = authUser.mobile.replace(/\D/g, "").slice(0, 10);
      if (phone === mine) {
        setMobileError(null);
        return;
      }
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{ available: boolean; message?: string }>
        >("/auth/signup/mobile-check", { params: { mobile: phone } });
        if (cancelled) return;
        if (!data.success) return;
        if (data.data.available === false) {
          setMobileError(
            data.data.message || "This mobile number is already registered. Please log in instead.",
          );
        } else {
          setMobileError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = apiError(err, "");
        if (/already registered/i.test(msg)) setMobileError(msg);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft.mobile, draftReady, stepIndex, otpSent, phase, draft.accountCreated, authUser?.mobile]);

  useEffect(() => {
    if (!draftReady || stepIndex !== 4 || phase !== "steps" || draft.emailVerified) {
      return;
    }
    const value = draft.email.trim();
    if (!value) {
      setEmailError(null);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("Enter a valid email address");
      return;
    }
    if (
      authUser?.emailVerifiedAt &&
      (authUser.email ?? "").toLowerCase() === value.toLowerCase()
    ) {
      setEmailError(null);
      patch({ emailVerified: true, email: value.toLowerCase() });
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<ApiResponse<{ available: boolean; message?: string }>>(
          "/auth/email/check",
          { params: { email: value.toLowerCase() } },
        );
        if (cancelled) return;
        if (data.data.available === false) {
          setEmailError(
            data.data.message || "This email is already registered. Use a different email.",
          );
        } else {
          setEmailError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = apiError(err, "");
        if (/already registered|already in use/i.test(msg)) setEmailError(msg);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    draft.email,
    draft.emailVerified,
    draftReady,
    stepIndex,
    phase,
    authUser?.email,
    authUser?.emailVerifiedAt,
  ]);

  useEffect(() => {
    if (!needsUpline) {
      setSponsorOk(false);
      setSponsorLookup("idle");
      return;
    }
    const phone = draft.sponsorMobile.replace(/\D/g, "").slice(0, 10);
    setSponsorOk(false);
    if (phone.length !== 10) {
      setSponsorLookup("idle");
      return;
    }
    let cancelled = false;
    setSponsorLookup("loading");
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
          setSponsorLookup("ok");
        } else {
          setSponsorLookup("notfound");
        }
      } catch {
        if (!cancelled) setSponsorLookup("notfound");
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
        patch({
          city: (po.Name || po.Block || draft.city || "").trim() || draft.city,
          district: po.District || draft.district,
          state: po.State || draft.state,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.pincode]);

  useEffect(() => {
    if (stepIndex !== 5) return;
    setDraft((d) => {
      if (d.businessAddress.trim() || !d.address.trim()) return d;
      return {
        ...d,
        businessAddress: d.address.trim(),
        businessPincode: d.pincode || d.businessPincode,
        businessCity: d.city.trim() || d.businessCity,
        businessDistrict: d.district.trim() || d.businessDistrict,
        businessState: d.state.trim() || d.businessState,
      };
    });
  }, [stepIndex]);

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
          businessCity: (po.Name || po.Block || draft.businessCity || "").trim() || draft.businessCity,
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

  async function pickDocImage(
    key: "panImage" | "aadhaarFront" | "aadhaarBack" | "cancelledCheque",
    label: string,
  ) {
    try {
      // Android 13+ uses the system photo picker (no READ_MEDIA permission).
      // Older Android may need READ_EXTERNAL_STORAGE (maxSdk 32 in the manifest).
      if (Platform.OS === "android") {
        const apiLevel =
          typeof Platform.Version === "number" ? Platform.Version : Number(Platform.Version);
        if (apiLevel < 33) {
          const storage = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            {
              title: "Storage Permission",
              message: "AsanPay needs storage access to upload KYC documents.",
              buttonPositive: "Allow",
              buttonNegative: "Deny",
            },
          );
          if (storage !== PermissionsAndroid.RESULTS.GRANTED) {
            showAlert(
              "Storage required",
              "Allow storage access in phone Settings → Apps → AsanPay → Permissions, then try again.",
            );
            return;
          }
        }
      }

      if (key !== "cancelledCheque") {
        await pickAndCropDocPhoto(key);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { launchImageLibrary } = require("react-native-image-picker") as {
        launchImageLibrary: (opts: Record<string, unknown>) => Promise<{
          didCancel?: boolean;
          errorCode?: string;
          errorMessage?: string;
          assets?: Array<{
            fileName?: string;
            uri?: string;
            fileSize?: number;
            type?: string;
            base64?: string;
          }>;
        }>;
      };
      const result = await launchImageLibrary({
        mediaType: "photo",
        selectionLimit: 1,
        quality: 0.7,
        maxWidth: 1600,
        maxHeight: 1600,
        includeBase64: true,
      });
      if (result.didCancel) return;
      if (result.errorCode) {
        const permissionDenied =
          result.errorCode === "permission" ||
          /permission/i.test(result.errorMessage || "");
        showAlert(
          permissionDenied ? "Photos required" : "Upload failed",
          permissionDenied
            ? "Allow photo access in phone Settings → Apps → AsanPay → Permissions, then try again."
            : result.errorMessage || "Could not open gallery. Try again.",
        );
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        showAlert("Upload failed", "No image selected");
        return;
      }
      if (asset.fileSize && asset.fileSize > 1.5 * 1024 * 1024) {
        showAlert("File too large", "Image must be under 1.5 MB");
        return;
      }
      const name = asset.fileName || `${label}.jpg`;
      const mime = asset.type || "image/jpeg";
      const dataUrl = asset.base64 ? `data:${mime};base64,${asset.base64}` : undefined;
      patch({ [key]: { name, uri: asset.uri, dataUrl } });
      showAlert("Uploaded", dataUrl ? `${name} ready for KYC submit` : `${name} selected`);
    } catch (err) {
      showAlert("Upload failed", err instanceof Error ? err.message : "Could not pick image");
    }
  }

  /**
   * PAN / Aadhaar: gallery → server auto-crop (upright, card only) → preview + "Adjust crop" → doc check.
   * No card found → the native crop screen (free crop + rotate) opens instead.
   */
  async function pickAndCropDocPhoto(slot: KycDocCheckSlot) {
    let picked;
    try {
      picked = await imageCropPicker().openPicker({
        mediaType: "photo",
        cropping: false,
        includeBase64: true,
        forceJpg: true,
        compressImageMaxWidth: UPLOAD_MAX_SIDE,
        compressImageMaxHeight: UPLOAD_MAX_SIDE,
        compressImageQuality: UPLOAD_JPEG_QUALITY,
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "E_PICKER_CANCELLED") return;
      showAlert(
        code === "E_NO_LIBRARY_PERMISSION" ? "Photos required" : "Upload failed",
        code === "E_NO_LIBRARY_PERMISSION"
          ? "Allow photo access in phone Settings → Apps → AsanPay → Permissions, then try again."
          : "Could not open the photo. Try another photo.",
      );
      return;
    }
    if (!picked?.data) {
      showAlert("Upload failed", "Could not read this photo. Try another photo.");
      return;
    }
    await processDocPhoto(slot, picked.path, `data:${picked.mime || "image/jpeg"};base64,${picked.data}`);
  }

  /**
   * Gallery or camera photo → one server call that crops + straightens the card and checks the crop.
   * The box shows the photo with a "Checking…" pill until the cropped card comes back.
   */
  async function processDocPhoto(slot: KycDocCheckSlot, path: string, original: string) {
    docOriginalsRef.current[slot] = path;
    if (!accessToken) {
      await manualCropDocPhoto(slot, path);
      return;
    }
    patch({ [slot]: { name: `${slot}.jpg`, uri: path, dataUrl: original } });
    void runDocCheck(slot, original, { autoCrop: true, path });
  }

  /**
   * Card-frame camera photo, shrunk to ≤ 1600 px before upload (the full photo stays for "Adjust crop").
   * Still too large for the upload limit → the crop screen compresses it.
   */
  async function onCardCaptured(path: string) {
    const slot = cameraSlot;
    setCameraSlot(null);
    if (!slot) return;
    const uri = path.startsWith("file://") ? path : `file://${path}`;
    let dataUrl: string;
    try {
      dataUrl = await fileToJpegDataUrl(await shrinkPhoto(uri));
    } catch {
      showAlert("Upload failed", "Could not read the photo. Take it again or use Gallery.");
      return;
    }
    if (dataUrl.length > MAX_UPLOAD_DATA_URL) {
      await manualCropDocPhoto(slot, uri);
      return;
    }
    await processDocPhoto(slot, uri, dataUrl);
  }

  function removeDocPhoto(slot: KycDocCheckSlot) {
    delete docOriginalsRef.current[slot];
    setRejectedPhotos((r) => {
      const next = { ...r };
      delete next[slot];
      return next;
    });
    docCheckSeqRef.current[slot] = (docCheckSeqRef.current[slot] ?? 0) + 1;
    setDocChecks((c) => {
      const next = { ...c };
      delete next[slot];
      return next;
    });
    patch({ [slot]: null });
  }

  function docCardStage(slot: KycDocCheckSlot): KycCardStage {
    return docChecks[slot]?.state === "checking" ? "checking" : null;
  }

  /** Native crop screen on the photo as picked (ID-card frame, free crop + rotate). */
  async function manualCropDocPhoto(slot: KycDocCheckSlot, path: string) {
    let image;
    try {
      image = await imageCropPicker().openCropper({
        path,
        mediaType: "photo",
        freeStyleCropEnabled: true,
        // Output box + starting frame = ID card shape; free crop can still change it.
        width: 1600,
        height: 1010,
        includeBase64: true,
        forceJpg: true,
        compressImageQuality: UPLOAD_JPEG_QUALITY,
        cropperToolbarTitle: CROP_TITLE[slot],
        cropperToolbarColor: "#FFFFFF",
        cropperToolbarWidgetColor: colors.blue,
        cropperActiveWidgetColor: colors.blue,
        showCropGuidelines: true,
        hideBottomControls: false,
      });
    } catch (err) {
      if ((err as { code?: string })?.code === "E_PICKER_CANCELLED") return;
      showAlert("Upload failed", "Could not crop this photo. Try another photo.");
      return;
    }
    if (!image?.data) {
      showAlert("Upload failed", "Could not read the cropped photo. Try again.");
      return;
    }
    const dataUrl = `data:${image.mime || "image/jpeg"};base64,${image.data}`;
    patch({ [slot]: { name: `${slot}.jpg`, uri: image.path, dataUrl } });
    void runDocCheck(slot, dataUrl);
  }

  /** "Adjust crop": re-crop from the photo as picked (falls back to the current photo after a restart). */
  function adjustDocCrop(slot: KycDocCheckSlot) {
    const path = docOriginalsRef.current[slot] ?? draft[slot]?.uri;
    if (path) void manualCropDocPhoto(slot, path);
  }

  /** Check a PAN / Aadhaar photo on the server. `fail` clears the photo; `flag` keeps it. */
  async function runDocCheck(
    slot: KycDocCheckSlot,
    dataUrl: string | undefined,
    opts: { autoCrop?: boolean; path?: string } = {},
  ) {
    const seq = (docCheckSeqRef.current[slot] ?? 0) + 1;
    docCheckSeqRef.current[slot] = seq;
    if (!dataUrl || !accessToken) {
      setDocChecks((c) => {
        const next = { ...c };
        delete next[slot];
        return next;
      });
      return;
    }
    setDocChecks((c) => ({ ...c, [slot]: { state: "checking" } }));
    let result: KycDocCheckResult | null = null;
    try {
      const { data } = await api.post<ApiResponse<KycDocCheckResult>>(
        "/kyc/documents/check",
        { slot, dataUrl, ...docCheckHints, ...(opts.autoCrop ? { autoCrop: true } : {}) },
        { timeout: opts.autoCrop ? 45_000 : 30_000 },
      );
      if (data.success) result = data.data;
    } catch {
      result = null;
    }
    if (docCheckSeqRef.current[slot] !== seq) return;
    const checked = result?.croppedDataUrl ?? dataUrl;
    if (result?.croppedDataUrl) {
      patch({ [slot]: { name: `${slot}.jpg`, uri: opts.path ?? draft[slot]?.uri ?? "", dataUrl: result.croppedDataUrl } });
    }
    const ui = kycDocCheckToUi(slot, result);
    setDocChecks((c) => ({ ...c, [slot]: ui }));
    setRejectedPhotos((r) => {
      if (ui.state === "fail") return { ...r, [slot]: checked };
      if (!r[slot]) return r;
      const next = { ...r };
      delete next[slot];
      return next;
    });
    if (ui.state === "fail") {
      patch({ [slot]: null });
    } else if (opts.autoCrop && opts.path && result?.cardDetected === false && ui.state !== "pass") {
      // No card outline found and the photo didn't fully pass — let the agent frame it.
      void manualCropDocPhoto(slot, opts.path);
    }
  }

  const nameFromPan = draft.panVerified && Boolean(draft.panVerifiedName.trim());
  // Photos are checked against these fields, so they must be filled before an upload.
  const panPhotoLocked =
    !draft.panVerified || !draft.dob
      ? "Verify your PAN and enter your date of birth to upload the PAN card photo."
      : null;
  const aadhaarPhotoLocked =
    draft.aadhaar.replace(/\D/g, "").length !== 12
      ? "Enter your 12-digit Aadhaar number to upload Aadhaar photos."
      : null;
  const docCheckHints = kycDocCheckHints(draft);
  const docCheckHintKey = JSON.stringify(docCheckHints);

  // Results live in memory only: re-check photos already in the draft after an app restart, and
  // again when DOB / gender / Aadhaar number change (the server compares them with the card).
  useEffect(() => {
    if (!draftReady || !accessToken) return;
    for (const slot of kycDocCheckSlotsForStep(stepIndex)) {
      const dataUrl = draft[slot]?.dataUrl;
      if (dataUrl) void runDocCheck(slot, dataUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, accessToken, stepIndex, docCheckHintKey]);

  // Continue pressed during a check: once it finishes, continue — or stay so the result shows.
  useEffect(() => {
    if (!continueAfterCheck || kycDocCheckRunningOnStep(docChecks, stepIndex)) return;
    setContinueAfterCheck(false);
    if (!kycDocCheckSlotsForStep(stepIndex).some((slot) => kycDocCheckBlocksStep(docChecks[slot]))) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueAfterCheck, docChecks, stepIndex]);

  async function captureLivePhoto(kind: "personalPhoto" | "shopPhoto") {
    setPhotoCaptureBusy(true);
    try {
      if (Platform.OS === "android") {
        const cam = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
          title: "Camera Permission",
          message: "AsanPay needs the camera for live photo capture.",
          buttonPositive: "Allow",
          buttonNegative: "Deny",
        });
        if (cam !== PermissionsAndroid.RESULTS.GRANTED) {
          showAlert("Camera required", "Allow camera access to capture a live photo");
          return;
        }
      }

      let useLat = draft.latitude;
      let useLng = draft.longitude;
      try {
        let coords: { latitude: string; longitude: string };
        try {
          coords = await readPosition(false, 10_000);
        } catch {
          coords = await readPosition(true, 12_000);
        }
        useLat = coords.latitude;
        useLng = coords.longitude;
        patch({ latitude: useLat, longitude: useLng });
      } catch {
        /* keep existing signup location */
      }
      if (!useLat || !useLng) {
        showAlert("Location required", "Allow location access to geotag this photo");
        setShowLocationModal(true);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { launchCamera } = require("react-native-image-picker") as {
        launchCamera: (opts: Record<string, unknown>) => Promise<{
          didCancel?: boolean;
          errorCode?: string;
          errorMessage?: string;
          assets?: Array<{ fileName?: string; uri?: string }>;
        }>;
      };
      const result = await launchCamera({
        mediaType: "photo",
        cameraType: kind === "personalPhoto" ? "front" : "back",
        saveToPhotos: false,
        quality: 0.7,
        maxWidth: 1600,
        maxHeight: 1600,
        includeBase64: true,
        presentationStyle: "fullScreen",
      });
      if (result.didCancel) return;
      if (result.errorCode) {
        showAlert(
          "Camera failed",
          result.errorMessage || "Could not open camera. Rebuild the app after installing react-native-image-picker.",
        );
        return;
      }
      const asset = result.assets?.[0] as
        | { fileName?: string; uri?: string; type?: string; base64?: string }
        | undefined;
      const name =
        asset?.fileName ||
        (kind === "personalPhoto" ? "personal-live.jpg" : "shop-live.jpg");
      const mime = asset?.type || "image/jpeg";
      const dataUrl = asset?.base64 ? `data:${mime};base64,${asset.base64}` : undefined;
      patch({
        [kind]: {
          name,
          uri: asset?.uri,
          dataUrl,
          latitude: useLat,
          longitude: useLng,
          capturedAt: new Date().toISOString(),
        },
      } as Partial<MobileSignupDraft>);
      showAlert(
        "Photo captured",
        `Saved with location ${Number(useLat).toFixed(5)}, ${Number(useLng).toFixed(5)}`,
      );
    } catch (err) {
      showAlert(
        "Camera unavailable",
        err instanceof Error
          ? err.message
          : "Install react-native-image-picker and rebuild the APK for live capture.",
      );
    } finally {
      setPhotoCaptureBusy(false);
    }
  }

  function validateStep(): string | null {
    if (stepIndex === 0) {
      if (draft.mobile.replace(/\D/g, "").length !== 10) return "Enter a valid 10-digit mobile";
      if (!draft.termsAccepted) return "Please accept Terms and Conditions";
    }
    if (stepIndex === 1) {
      if (!draft.accountCreated) {
        if (needsUpline) {
          const phone = draft.sponsorMobile.replace(/\D/g, "");
          if (phone.length !== 10) return "Enter a valid 10-digit upline mobile";
          if (!sponsorOk || !draft.sponsorUid) {
            return "Distributor / Super Distributor not found for this mobile. Use an active upline number.";
          }
        }
      }
    }
    if (stepIndex === 2) {
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan)) return PAN_FORMAT_ERROR;
      if (!draft.panVerified) return "Verify PAN before continuing";
      if (draft.name.trim().length < 2) return "Enter your full name exactly as printed on your PAN card";
      if (!draft.dob || !/^\d{4}-\d{2}-\d{2}$/.test(draft.dob)) {
        return "Enter date of birth as DD/MM/YYYY";
      }
      if (!draft.gender) return "Select gender";
      if (!draft.fatherName.trim()) return "Father name is required";
      if (!draft.panImage) return "Upload PAN card image to continue";
    }
    if (stepIndex === 3) {
      if (draft.aadhaar.replace(/\D/g, "").length !== 12) return "Enter a valid 12-digit Aadhaar";
      if (!draft.aadhaarOtpVerified) return "Verify Aadhaar OTP before continuing";
      if (!draft.aadhaarFront) return "Upload Aadhaar front photo to continue";
      if (!draft.aadhaarBack) return "Upload Aadhaar back photo to continue";
    }
    if (stepIndex === 4) {
      if (!draft.email.trim()) return "Email is required";
      if (emailError) return emailError;
      if (!draft.emailVerified) return "Verify your email";
      if (!draft.address.trim()) return "Address is required";
      if (draft.pincode.length !== 6) return "Valid pincode required";
      if (!draft.city.trim()) return "City is required";
      if (!draft.district.trim() || !draft.state.trim()) return "District and state required";
    }
    if (stepIndex === 5) {
      if (!draft.businessName.trim()) return "Business name required";
      if (!draft.businessType || !draft.businessCategory || !draft.monthlyTurnover || !draft.businessProof) {
        return "Fill all business fields";
      }
      if (!draft.businessAddress.trim() || draft.businessPincode.length !== 6) return "Business address/pincode required";
      if (!draft.businessCity.trim()) return "Business city is required";
      if (!draft.businessDistrict.trim() || !draft.businessState.trim()) return "Business district and state required";
      if (!draft.shopGeo) return "Capture your shop location to continue";
    }
    if (stepIndex === 6) {
      if (draft.ifsc.length !== 11 || !draft.bankName.trim()) return "IFSC and bank name required";
      if (!draft.accountNumber || draft.accountNumber !== draft.accountNumberConfirm) {
        return "Account numbers must match";
      }
      if (!draft.accountName.trim()) return "Account holder name is required";
    }
    if (stepIndex === 7) {
      if (!draft.personalPhoto) return "Personal photo is required — use live camera capture";
      if (!draft.personalPhoto.latitude || !draft.personalPhoto.longitude) {
        return "Personal photo must include location. Retake with location allowed.";
      }
      if (!draft.shopPhoto) return "Shop photo is required — use live camera capture";
      if (!draft.shopPhoto.latitude || !draft.shopPhoto.longitude) {
        return "Shop photo must include location. Retake with location allowed.";
      }
    }
    if (stepIndex === 8 && !draft.agreementAccepted) return "Accept the agreement";
    return null;
  }

  async function requestOtp() {
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ otp?: string; message?: string }>>("/auth/signup/request", {
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
        portal: "agent",
      });
      if (!data.success) throw new Error(data.message);
      const echoedOtp = __DEV__ ? data.data.otp : undefined;
      if (echoedOtp) {
        setDevOtp(echoedOtp);
        setOtp(echoedOtp);
      }
      setOtpSent(true);
      patch({ signupToken: "" });
      showAlert(
        "OTP sent",
        echoedOtp ? `Dev OTP: ${echoedOtp}` : data.data.message || data.message || "OTP has been sent on WhatsApp",
      );
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Could not send OTP"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6) {
      showAlert("OTP required", "Enter the 6-digit OTP");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ signupToken: string; message?: string }>>(
        "/auth/signup/verify",
        {
          mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
          otp,
          portal: "agent",
        },
      );
      if (!data.success) throw new Error(data.message);
      patch({ signupToken: data.data.signupToken, stepIndex: 1 });
      setOtpSent(false);
      setOtp("");
      setDevOtp("");
      showAlert("Verified", data.data.message || "Mobile verified — continue");
    } catch (err) {
      showAlert("OTP failed", apiError(err, "Incorrect OTP"));
    } finally {
      setLoading(false);
    }
  }

  function continueKycFromRoleStep() {
    patch({
      accountCreated: true,
      signupToken: "",
      stepIndex: Math.max(2, draft.maxStepReached ?? 2),
    });
  }

  async function completeAccount() {
    if (draft.accountCreated || authUser) {
      continueKycFromRoleStep();
      return;
    }
    if (!draft.signupToken) {
      showAlert("Verify mobile", "Verify mobile OTP before continuing");
      patch({ stepIndex: 0 });
      return;
    }
    if (needsUpline && !draft.sponsorUid) {
      showAlert(
        "Upline required",
        "Wait until the Distributor / Super Distributor name appears under the mobile field, then try again.",
      );
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<
        ApiResponse<LoginResponse | { pendingApproval: true; user: AuthUser; message: string }>
      >("/auth/signup/complete", {
        signupToken: draft.signupToken,
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
        role: draft.role,
        portal: "agent",
        acceptedPolicyVersion: SIGNUP_POLICY_VERSION,
        policyChannel: "app",
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
      const nextDraft = {
        ...draft,
        accountCreated: true,
        signupToken: "",
        stepIndex: 2,
        maxStepReached: Math.max(draft.maxStepReached ?? 0, 2),
      };
      setDraft(nextDraft);
      await saveMobileSignupDraft(session.user.id, nextDraft);
      setAuth(session.user, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
      setSignupContinue(true);
      showAlert("Account created", "Continue onboarding");
    } catch (err) {
      showAlert("Error", apiError(err, "Could not create account"));
    } finally {
      setLoading(false);
    }
  }

  function changePan() {
    panAutoAttemptRef.current = "";
    setPanVerifyFailed(false);
    patch({ pan: "", panVerified: false, panVerifiedName: "", name: "" });
    setTimeout(() => panInputRef.current?.focus(), 50);
  }

  async function verifyPan(opts?: { manual?: boolean }) {
    const pan = draft.pan.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const manual = Boolean(opts?.manual);
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
      if (manual) showAlert("Invalid PAN", "Enter a valid PAN (e.g. ABCDE1234F)");
      return;
    }
    if (!accessToken) {
      if (manual) showAlert("Account required", "Create your account on the previous step first");
      return;
    }
    if (draft.panVerified || panVerifyBusy) return;
    setPanVerifyBusy(true);
    setPanVerifyFailed(false);
    try {
      const { data } = await api.post<
        ApiResponse<{
          verified: boolean;
          pan: string;
          fullName: string | null;
          address: string | null;
          category: string | null;
        }>
      >("/kyc/pan/verify", { panNumber: pan });
      if (!data.success) throw new Error(data.message);
      patch({
        pan: data.data.pan || pan,
        panVerified: true,
        panVerifiedName: data.data.fullName ?? "",
        ...(data.data.fullName ? { name: formatPanName(data.data.fullName) } : {}),
        ...(data.data.address && !draft.address.trim() ? { address: data.data.address } : {}),
      });
      if (manual) {
        showAlert(
          "Verified",
          data.data.fullName ? `PAN verified · ${data.data.fullName}` : "PAN verified",
        );
      }
    } catch (err) {
      setPanVerifyFailed(true);
      showAlert(
        "PAN verify failed",
        apiError(err, "Could not verify PAN. Check the PAN number and try again."),
      );
    } finally {
      setPanVerifyBusy(false);
    }
  }

  // Auto-verify when 10-char PAN is complete.
  useEffect(() => {
    if (stepIndex !== 2) return;
    if (draft.panVerified || panVerifyBusy) return;
    if (!accessToken) return;
    const pan = draft.pan.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
      if (pan.length < 10) panAutoAttemptRef.current = "";
      return;
    }
    if (panAutoAttemptRef.current === pan) return;
    const timer = setTimeout(() => {
      panAutoAttemptRef.current = pan;
      void verifyPan({ manual: false });
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, draft.pan, draft.panVerified, accessToken, panVerifyBusy]);

  async function sendAadhaarOtp() {
    const digits = draft.aadhaar.replace(/\D/g, "");
    if (digits.length !== 12) {
      showAlert("Invalid Aadhaar", "Enter a valid 12-digit Aadhaar");
      return;
    }
    if (!accessToken) {
      showAlert("Account required", "Create your account on the previous step first");
      return;
    }
    setAadhaarOtpBusy("send");
    try {
      const { data } = await api.post<ApiResponse<{ requestId: string; message?: string }>>(
        "/kyc/aadhaar/otp/request",
        { aadhaarNumber: digits },
        { timeout: AADHAAR_OTP_TIMEOUT_MS },
      );
      if (!data.success) throw new Error(data.message);
      patch({
        aadhaarOtpRequestId: data.data.requestId,
        aadhaarOtpVerified: false,
        aadhaarVerifiedName: "",
      });
      setAadhaarOtpUnconfirmed(false);
      setAadhaarOtp("");
      showAlert(
        "OTP sent",
        data.message || data.data.message || "OTP sent to the mobile registered with this Aadhaar",
      );
    } catch (err) {
      const e = err as { code?: string; message?: string; response?: { status?: number; data?: { code?: string } } };
      const noReply =
        !e.response ||
        e.response.status === 504 ||
        e.response.data?.code === "AADHAAR_OTP_UPSTREAM" ||
        e.code === "ECONNABORTED" ||
        /timeout/i.test(e.message ?? "");
      if (noReply) {
        patch({ aadhaarOtpRequestId: "", aadhaarOtpVerified: false, aadhaarVerifiedName: "" });
        setAadhaarOtpUnconfirmed(true);
        setAadhaarOtp("");
        showAlert(
          "OTP is taking longer",
          "If you received the Aadhaar OTP, enter it below and tap Verify. If not, tap Resend OTP.",
        );
      } else {
        showAlert("Aadhaar OTP failed", apiError(err, "Could not send Aadhaar OTP"));
      }
    } finally {
      setAadhaarOtpBusy(null);
    }
  }

  async function verifyAadhaarOtp() {
    if (!aadhaarOtpStarted) {
      showAlert("Send OTP first", "No Aadhaar OTP was requested yet. Tap Send OTP to get an OTP.");
      return;
    }
    if (aadhaarOtp.replace(/\D/g, "").length < 4) {
      showAlert("OTP required", "Enter the Aadhaar OTP");
      return;
    }
    setAadhaarOtpBusy("verify");
    try {
      const { data } = await api.post<
        ApiResponse<{
          verified: boolean;
          fullName: string | null;
          dob?: string | null;
          gender?: string | null;
          careOf?: string | null;
          address: string | null;
          pincode?: string | null;
        }>
      >(
        "/kyc/aadhaar/otp/verify",
        {
          otp: aadhaarOtp.replace(/\D/g, ""),
          ...(draft.aadhaarOtpRequestId ? { requestId: draft.aadhaarOtpRequestId } : {}),
        },
        { timeout: AADHAAR_OTP_TIMEOUT_MS },
      );
      if (!data.success) throw new Error(data.message);
      setAadhaarOtpUnconfirmed(false);
      const ek = data.data;
      patch({
        aadhaarOtpVerified: true,
        aadhaarVerifiedName: ek.fullName ?? "",
        aadhaarVerifiedInfo: [ek.dob ? `DOB ${ek.dob}` : "", ek.gender ?? "", ek.careOf ? `C/O ${ek.careOf}` : ""]
          .filter(Boolean)
          .join(" · "),
        ...(ek.address && !draft.address.trim() ? { address: ek.address } : {}),
        ...(ek.pincode && !draft.pincode.trim() ? { pincode: ek.pincode } : {}),
        ...(ek.careOf && !draft.fatherName.trim() ? { fatherName: ek.careOf } : {}),
      });
      showAlert("Verified", "Aadhaar verified");
    } catch (err) {
      showAlert(
        "Verify failed",
        apiError(err, "Incorrect Aadhaar OTP. Check the code and try again."),
      );
    } finally {
      setAadhaarOtpBusy(null);
    }
  }

  async function requestEmailOtp() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      showAlert("Invalid email", "Enter a valid email address");
      return;
    }
    if (emailError) {
      showAlert("Email not available", emailError);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<
        ApiResponse<{ alreadyVerified?: boolean; email?: string; emailVerifiedAt?: string }>
      >("/auth/email/otp/request", { email: draft.email.trim().toLowerCase() });
      if (data.data?.alreadyVerified && data.data.email) {
        patch({ emailVerified: true, email: data.data.email });
        if (authUser && data.data.emailVerifiedAt) {
          updateUser({
            ...authUser,
            email: data.data.email,
            emailVerifiedAt: data.data.emailVerifiedAt,
          });
        }
        showAlert("Verified", "This email is already verified on your account");
        return;
      }
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
        city: draft.city.trim(),
        pincode: draft.pincode,
        bankAccountName: draft.accountName.trim(),
        bankAccountNumber: draft.accountNumber,
        bankIfsc: draft.ifsc.toUpperCase(),
        bankName: draft.bankName.trim(),
        cancelledChequeFileName: draft.cancelledCheque?.name,
        gender: draft.gender,
        fatherName: draft.fatherName.trim(),
        dob: draft.dob,
        anniversaryDate: draft.anniversaryDate || undefined,
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
        personalPhotoFileName: draft.personalPhoto?.name,
        shopPhotoFileName: draft.shopPhoto?.name,
        panImageDataUrl: draft.panImage?.dataUrl,
        aadhaarFrontDataUrl: draft.aadhaarFront?.dataUrl,
        aadhaarBackDataUrl: draft.aadhaarBack?.dataUrl,
        cancelledChequeDataUrl: draft.cancelledCheque?.dataUrl,
        personalPhotoDataUrl: draft.personalPhoto?.dataUrl,
        shopPhotoDataUrl: draft.shopPhoto?.dataUrl,
        personalPhotoLatitude: draft.personalPhoto?.latitude,
        personalPhotoLongitude: draft.personalPhoto?.longitude,
        shopPhotoLatitude: draft.shopPhoto?.latitude,
        shopPhotoLongitude: draft.shopPhoto?.longitude,
        latitude: draft.shopPhoto?.latitude || draft.latitude || undefined,
        longitude: draft.shopPhoto?.longitude || draft.longitude || undefined,
        shopLocation: draft.shopGeo ?? undefined,
        homeLocation: draft.homeGeo ?? undefined,
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
    if (kycDocCheckRunningOnStep(docChecks, stepIndex)) {
      setContinueAfterCheck(true);
      return;
    }
    const err = validateStep();
    if (err) {
      showAlert("Fix this to continue", err);
      return;
    }
    if (stepIndex === 0) {
      if (mobileError) {
        showAlert("Mobile already registered", mobileError);
        return;
      }
      if (!otpSent) {
        void requestOtp();
        return;
      }
      void verifyOtp();
      return;
    }
    if (stepIndex === 1) {
      void completeAccount();
      return;
    }
    if (stepIndex === 8) {
      void finalSubmit();
      return;
    }
    patch({ stepIndex: Math.min(stepIndex + 1, 8) });
  }

  function back() {
    setContinueAfterCheck(false);
    if (phase === "emailOtp") {
      setPhase("steps");
      return;
    }
    if (stepIndex === 0 && otpSent) {
      setOtpSent(false);
      setOtp("");
      setDevOtp("");
      return;
    }
    if (stepIndex === 0) {
      if (draft.accountCreated) {
        setSignupContinue(false);
        return;
      }
      onBack();
      return;
    }
    // Until KYC is submitted, allow revisiting every prior step to edit.
    patch({ stepIndex: Math.max(stepIndex - 1, 0) });
  }

  if (!draftReady) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const subtitle = phase === "emailOtp" ? "Email OTP" : MOBILE_SIGNUP_STEPS[stepIndex]?.label;

  const primaryLabel = loading
    ? "Please wait…"
    : continueAfterCheck
      ? "Checking photo…"
      : stepIndex === 0
        ? otpSent
          ? "Verify OTP"
          : "Send OTP"
        : stepIndex === 1
          ? draft.accountCreated
            ? "Continue"
            : "Create account"
          : stepIndex === 8
            ? "Submit application"
            : "Continue";
  // Role step: keep Create account disabled until the upline lookup finds an active account.
  const uplineBlocked =
    stepIndex === 1 && needsUpline && !draft.accountCreated && !(sponsorOk && draft.sponsorUid);
  const docCheckBlocked =
    (stepIndex === 2 && kycDocCheckBlocksStep(docChecks.panImage)) ||
    (stepIndex === 3 &&
      (kycDocCheckBlocksStep(docChecks.aadhaarFront) || kycDocCheckBlocksStep(docChecks.aadhaarBack)));
  const nextDisabled =
    loading ||
    Boolean(mobileError) ||
    (stepIndex === 0 && otpSent && otp.length !== 6) ||
    uplineBlocked ||
    docCheckBlocked;

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
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: tokens.txt }]} numberOfLines={1}>
              Sign Up
            </Text>
            <Text style={[styles.sub, { color: tokens.sub }]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <BrandMark size={40} variant="mark" light={scheme === "dark"} />
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <MobileSignupStepper currentIndex={phase === "emailOtp" ? 4 : stepIndex} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                  <Text style={[styles.hint, { color: tokens.mute }]}>Enter your mobile number and verify it with OTP.</Text>

                  <FieldLabel text="Mobile Number *" color={tokens.mute} />
                  <TextInput
                    value={draft.mobile}
                    onChangeText={(t) => {
                      if (!canEditIdentity) return;
                      patch({ mobile: t.replace(/\D/g, "").slice(0, 10), signupToken: "" });
                      setOtpSent(false);
                      setOtp("");
                      setDevOtp("");
                      setMobileError(null);
                    }}
                    keyboardType="number-pad"
                    placeholder="10-digit mobile"
                    placeholderTextColor={tokens.mute}
                    editable={!otpSent && canEditIdentity}
                    style={[
                      inputStyle,
                      (otpSent || !canEditIdentity) && { opacity: 0.5 },
                      mobileError ? { borderColor: "#DC2626" } : null,
                    ]}
                  />
                  {draft.accountCreated && canEditIdentity ? (
                    <Text style={[styles.hint, { color: tokens.mute }]}>
                      You can change mobile until KYC is submitted. Changing it requires OTP on the new number.
                    </Text>
                  ) : null}
                  {draft.accountCreated && !canEditIdentity ? (
                    <Text style={[styles.hint, { color: tokens.mute }]}>
                      Signed-in mobile is locked after KYC submit.
                    </Text>
                  ) : null}
                  {mobileError ? (
                    <Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "700", marginBottom: 6 }}>
                      {mobileError}
                    </Text>
                  ) : null}
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    *Enter number which is linked to your Aadhaar.
                  </Text>
                  {draft.accountCreated ? null : (
                    <Text style={[styles.hint, { color: tokens.mute }]}>
                      No password needed now — your login password is emailed to you after KYC approval. To continue
                      signup later, log in with mobile OTP.
                    </Text>
                  )}
                  {otpSent ? (
                    <>
                      <Text style={[styles.hint, { color: tokens.mute }]}>
                        Enter the 6-digit OTP. If fixed signup OTP is enabled, use that code (e.g. 242424).
                      </Text>
                      {devOtp ? <Text style={styles.devOtp}>Dev OTP: {devOtp}</Text> : null}
                      <FieldLabel text="OTP *" color={tokens.mute} />
                      <TextInput
                        value={otp}
                        onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                        keyboardType="number-pad"
                        placeholder="••••••"
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                        autoFocus
                      />
                      <Pressable onPress={() => void requestOtp()} disabled={loading} hitSlop={8}>
                        <Text style={{ color: colors.blueFlat, fontWeight: "700", fontSize: 12, marginBottom: 8 }}>
                          Resend OTP
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                  <Pressable
                    onPress={() => void beginTermsAccept()}
                    style={styles.checkRow}
                  >
                    <View style={[styles.check, draft.termsAccepted && styles.checkOn]}>
                      {draft.termsAccepted ? <CheckCircle2 size={14} color="#fff" /> : null}
                    </View>
                    <Text style={{ color: tokens.txt2, flex: 1, fontSize: 13, lineHeight: 18 }}>
                      I have read and agree to the{" "}
                      <Text style={{ color: colors.blueFlat, fontWeight: "800" }}>
                        Terms & Conditions and Privacy Policy
                      </Text>
                    </Text>
                  </Pressable>
                  {!otpSent ? (
                  <View style={[styles.prep, { backgroundColor: colors.greenBg }]}>
                    <Text style={[styles.prepTitle, { color: colors.greenDark }]}>Before you begin, keep these ready:</Text>
                    <Text style={[styles.prepItem, { color: colors.greenDark }]}>• Business Document (any one)</Text>
                    <Text style={[styles.prepItem, { color: colors.greenDark }]}>• Aadhaar Card (soft copy)</Text>
                    <Text style={[styles.prepItem, { color: colors.greenDark }]}>• PAN Card (soft copy)</Text>
                    <Text style={[styles.prepItem, { color: colors.greenDark }]}>• Photo of your Shop</Text>
                    <Text style={[styles.prepFoot, { color: tokens.mute }]}>
                      You can start now and resume later from where you left off.
                    </Text>
                  </View>
                  ) : null}
                </>
              )}

              {stepIndex === 1 && (
                <>
                  <Text style={styles.sectionTitle}>Role Identification</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>Choose your role. Retailers also enter their Distributor's mobile number.</Text>
                  <FieldLabel text="Role *" color={tokens.mute} />
                  <View style={styles.chipGrid}>
                    {ROLE_OPTIONS.filter((r) => draft.accountCreated || !isPartnerRole(r.value)).map((r) => (
                      <Pressable
                        key={r.value}
                        disabled={draft.accountCreated}
                        onPress={() =>
                          patch({ role: r.value, sponsorMobile: "", sponsorUid: "", sponsorName: "" })
                        }
                        style={[
                          styles.chipCell,
                          {
                            borderColor: draft.role === r.value ? colors.blue : tokens.cardBorder,
                            backgroundColor: draft.role === r.value ? `${colors.blue}14` : tokens.card,
                            opacity: draft.accountCreated ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={{ color: tokens.txt2, fontWeight: "700", fontSize: 12, textAlign: "center" }}
                          numberOfLines={1}
                        >
                          {r.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {needsUpline ? (
                    <>
                      <FieldLabel text={`${UPLINE_LABEL[draft.role as "retailer" | "distributor"]} *`} color={tokens.mute} />
                      <TextInput
                        value={draft.sponsorMobile}
                        onChangeText={(t) => {
                          if (draft.accountCreated) return;
                          patch({ sponsorMobile: t.replace(/\D/g, "").slice(0, 10) });
                        }}
                        editable={!draft.accountCreated}
                        keyboardType="number-pad"
                        placeholder="10-digit upline mobile"
                        placeholderTextColor={tokens.mute}
                        style={[inputStyle, draft.accountCreated ? { opacity: 0.75 } : null]}
                      />
                      {sponsorOk || (draft.accountCreated && draft.sponsorName) ? (
                        <Text style={{ color: colors.greenDark, fontSize: 12, fontWeight: "700", marginTop: 4 }}>
                          ✓ {draft.sponsorName}
                          {draft.sponsorUid ? ` · ${draft.sponsorUid}` : ""}
                        </Text>
                      ) : null}
                      {!draft.accountCreated && sponsorLookup === "loading" ? (
                        <Text style={[styles.hint, { color: tokens.mute }]}>Checking upline…</Text>
                      ) : null}
                      {!draft.accountCreated && sponsorLookup === "notfound" ? (
                        <Text style={[styles.hint, { color: colors.danger }]}>
                          {draft.role === "retailer"
                            ? "No active Distributor found for this mobile. Check the number, or choose Direct Retailer if you have no Distributor."
                            : "No active Super Distributor found for this mobile. Check the number with your Super Distributor."}
                        </Text>
                      ) : null}
                      {!draft.accountCreated && sponsorLookup === "idle" && draft.sponsorMobile.length > 0 ? (
                        <Text style={[styles.hint, { color: tokens.mute }]}>Enter a valid 10-digit upline mobile</Text>
                      ) : null}
                      {draft.accountCreated ? (
                        <Text style={[styles.hint, { color: tokens.mute }]}>
                          Upline is locked after account create.
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={[styles.hint, { color: tokens.mute, marginBottom: 8 }]}>
                      No upline required for this role.
                    </Text>
                  )}
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    Your full name is taken from your PAN on the next step.
                  </Text>
                </>
              )}

              {stepIndex === 2 && (
                <>
                  <Text style={styles.sectionTitle}>PAN Details</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    Enter your 10-character PAN — verification starts automatically. Then fill
                    personal details as on the PAN.
                  </Text>
                  <View>
                    <View>
                      <FieldLabel text="PAN Number *" color={tokens.mute} />
                      <TextInput
                        ref={panInputRef}
                        value={draft.pan}
                        onChangeText={(t) => {
                          const next = t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
                          if (next !== panAutoAttemptRef.current) panAutoAttemptRef.current = "";
                          setPanVerifyFailed(false);
                          patch({
                            pan: next,
                            ...(draft.panVerified ? { panVerified: false, panVerifiedName: "" } : {}),
                          });
                        }}
                        autoCapitalize="characters"
                        placeholder="ABCDE1234F"
                        placeholderTextColor={tokens.mute}
                        editable={!draft.panVerified}
                        style={inputStyle}
                      />
                      {draft.panVerified ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
                          <CheckCircle2 size={12} color={colors.greenDark} />
                          <Text style={{ flex: 1, color: colors.greenDark, fontWeight: "600", fontSize: 11 }}>
                            PAN verified
                            {draft.panVerifiedName ? ` · ${draft.panVerifiedName}` : ""}
                          </Text>
                          <Pressable onPress={changePan} hitSlop={8} accessibilityRole="button">
                            <Text
                              style={{
                                color: colors.blue,
                                fontWeight: "700",
                                fontSize: 11,
                                textDecorationLine: "underline",
                              }}
                            >
                              Change
                            </Text>
                          </Pressable>
                        </View>
                      ) : panVerifyBusy ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <ActivityIndicator size="small" color={colors.blue} />
                          <Text style={{ color: colors.blue, fontWeight: "600", fontSize: 11 }}>
                            Verifying PAN…
                          </Text>
                        </View>
                      ) : !accessToken ? (
                        <Text style={{ color: "#C2410C", fontSize: 11, fontWeight: "700", marginTop: 6 }}>
                          Create account first, then enter PAN.
                        </Text>
                      ) : draft.pan.length === 10 && !/^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan) ? (
                        <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700", marginTop: 6 }}>
                          {PAN_FORMAT_ERROR}
                        </Text>
                      ) : panVerifyFailed && /^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan) ? (
                        <Pressable
                          onPress={() => {
                            panAutoAttemptRef.current = "";
                            void verifyPan({ manual: true });
                          }}
                          style={[styles.verifyBtn, { alignSelf: "flex-start", marginTop: 6 }]}
                        >
                          <Text style={styles.verifyBtnText}>Retry verify</Text>
                        </Pressable>
                      ) : (
                        <Text style={{ color: tokens.mute, fontSize: 11, marginTop: 6 }}>
                          Auto-verifies when complete
                        </Text>
                      )}
                    </View>
                    <FieldLabel text="Full Name (As per PAN) *" color={tokens.mute} />
                    <TextInput
                      value={draft.name}
                      onChangeText={(t) => patch({ name: t })}
                      placeholder={draft.panVerified ? "As printed on your PAN card" : "Filled automatically after PAN verification"}
                      placeholderTextColor={tokens.mute}
                      editable={draft.panVerified && !nameFromPan}
                      style={[inputStyle, !draft.panVerified || nameFromPan ? { opacity: 0.7 } : null]}
                    />
                    <Text style={{ color: tokens.mute, fontSize: 11, marginTop: 6 }}>
                      {nameFromPan
                        ? "Taken from your verified PAN. Use Change on the PAN number to edit it."
                        : draft.panVerified
                          ? "We couldn't fetch the name for this PAN. Enter it exactly as printed on your PAN card."
                          : "Verify your PAN first"}
                    </Text>
                    <View style={{ marginTop: 8 }}>
                      <DateTextField
                        label="Date of Birth *"
                        isoValue={draft.dob}
                        onIsoChange={(iso) => patch({ dob: iso })}
                        placeholder="DD/MM/YYYY"
                        hint="As on PAN"
                        tokens={tokens}
                        inputStyle={inputStyle}
                      />
                    </View>
                    <View style={{ marginTop: 6 }}>
                      <FieldLabel text="Gender *" color={tokens.mute} />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {["Male", "Female", "Other"].map((g) => (
                          <Pressable
                            key={g}
                            onPress={() => patch({ gender: g })}
                            style={[
                              styles.chipFlex,
                              {
                                borderColor: draft.gender === g ? colors.blue : tokens.cardBorder,
                                backgroundColor: draft.gender === g ? `${colors.blue}14` : tokens.card,
                                marginBottom: 0,
                              },
                            ]}
                          >
                            <Text
                              style={{ color: tokens.txt2, fontWeight: "700", fontSize: 12, textAlign: "center" }}
                              numberOfLines={1}
                            >
                              {g}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                  <FieldLabel text="Father Name *" color={tokens.mute} />
                  <TextInput
                    value={draft.fatherName}
                    onChangeText={(t) => patch({ fatherName: t })}
                    placeholder="As per PAN"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <KycCardUpload
                    label="PAN Card Image *"
                    title="PAN card"
                    hint="Front side · clear photo"
                    previewUri={draft.panImage?.dataUrl || draft.panImage?.uri}
                    rejectedUri={rejectedPhotos.panImage}
                    stage={docCardStage("panImage")}
                    check={docChecks.panImage}
                    lockedReason={panPhotoLocked}
                    tokens={tokens}
                    onCamera={() => setCameraSlot("panImage")}
                    onGallery={() => void pickDocImage("panImage", "pan")}
                    onAdjust={() => adjustDocCrop("panImage")}
                    onRemove={() => removeDocPhoto("panImage")}
                  />
                </>
              )}

              {stepIndex === 3 && (
                <>
                  <Text style={styles.sectionTitle}>Aadhaar Verification</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    OTP is sent to the mobile registered with this Aadhaar (UIDAI). Verify before
                    continuing. Then upload clear photos of the front and back of your Aadhaar card.
                  </Text>
                  <FieldLabel text="Aadhaar Number *" color={tokens.mute} />
                  <View style={styles.emailRow}>
                    <TextInput
                      value={draft.aadhaar.replace(/(\d{4})(?=\d)/g, "$1 ").trim()}
                      onChangeText={(t) => {
                        const next = t.replace(/\D/g, "").slice(0, 12);
                        patch({
                          aadhaar: next,
                          ...(draft.aadhaarOtpVerified || draft.aadhaarOtpRequestId
                            ? {
                                aadhaarOtpRequestId: "",
                                aadhaarOtpVerified: false,
                                aadhaarVerifiedName: "",
                                aadhaarVerifiedInfo: "",
                              }
                            : {}),
                        });
                        setAadhaarOtpUnconfirmed(false);
                        setAadhaarOtp("");
                      }}
                      keyboardType="number-pad"
                      placeholder="1234 1234 1234"
                      placeholderTextColor={tokens.mute}
                      editable={!draft.aadhaarOtpVerified}
                      style={[inputStyle, { flex: 1 }]}
                    />
                    {!draft.aadhaarOtpVerified ? (
                      <Pressable
                        onPress={() => void sendAadhaarOtp()}
                        disabled={
                          Boolean(aadhaarOtpBusy) ||
                          draft.aadhaar.replace(/\D/g, "").length !== 12 ||
                          !accessToken
                        }
                        style={[
                          styles.verifyBtn,
                          (Boolean(aadhaarOtpBusy) ||
                            draft.aadhaar.replace(/\D/g, "").length !== 12 ||
                            !accessToken) && { opacity: 0.55 },
                        ]}
                      >
                        {aadhaarOtpBusy === "send" ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.verifyBtnText}>
                            {aadhaarOtpStarted ? "Resend OTP" : "Send OTP"}
                          </Text>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                  {draft.aadhaarOtpVerified ? (
                    <View
                      style={[
                        styles.prep,
                        {
                          backgroundColor: colors.greenBg,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 10,
                          marginTop: 8,
                        },
                      ]}
                    >
                      <CheckCircle2 size={18} color={colors.greenDark} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.greenDark, fontWeight: "700", fontSize: 13 }}>
                          Aadhaar verified
                          {draft.aadhaarVerifiedName ? ` · ${draft.aadhaarVerifiedName}` : ""}
                        </Text>
                        {draft.aadhaarVerifiedInfo ? (
                          <Text style={{ color: colors.greenDark, fontSize: 12, marginTop: 2 }}>
                            {draft.aadhaarVerifiedInfo}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ) : (
                    <>
                      {!accessToken ? (
                        <Text style={{ color: "#C2410C", fontSize: 12, fontWeight: "700", marginVertical: 8 }}>
                          Create your account on the previous step first, then send Aadhaar OTP.
                        </Text>
                      ) : null}
                      {aadhaarOtpStarted ? (
                        <>
                          <FieldLabel text="Aadhaar OTP *" color={tokens.mute} />
                          <View style={styles.emailRow}>
                            <TextInput
                              value={aadhaarOtp}
                              onChangeText={(t) => setAadhaarOtp(t.replace(/\D/g, "").slice(0, 8))}
                              keyboardType="number-pad"
                              placeholder="Enter OTP"
                              placeholderTextColor={tokens.mute}
                              style={[inputStyle, { flex: 1, letterSpacing: 4 }]}
                            />
                            <Pressable
                              onPress={() => void verifyAadhaarOtp()}
                              disabled={Boolean(aadhaarOtpBusy) || aadhaarOtp.replace(/\D/g, "").length < 4}
                              style={[
                                styles.verifyBtn,
                                (Boolean(aadhaarOtpBusy) || aadhaarOtp.replace(/\D/g, "").length < 4) && {
                                  opacity: 0.55,
                                },
                              ]}
                            >
                              {aadhaarOtpBusy === "verify" ? (
                                <ActivityIndicator color="#fff" />
                              ) : (
                                <Text style={styles.verifyBtnText}>Verify</Text>
                              )}
                            </Pressable>
                          </View>
                        </>
                      ) : null}
                    </>
                  )}
                  <KycCardUpload
                    label="Aadhaar Front *"
                    title="Aadhaar front"
                    hint="Side with your photo · clear photo"
                    previewUri={draft.aadhaarFront?.dataUrl || draft.aadhaarFront?.uri}
                    rejectedUri={rejectedPhotos.aadhaarFront}
                    stage={docCardStage("aadhaarFront")}
                    check={docChecks.aadhaarFront}
                    lockedReason={aadhaarPhotoLocked}
                    tokens={tokens}
                    onCamera={() => setCameraSlot("aadhaarFront")}
                    onGallery={() => void pickDocImage("aadhaarFront", "aadhaar-front")}
                    onAdjust={() => adjustDocCrop("aadhaarFront")}
                    onRemove={() => removeDocPhoto("aadhaarFront")}
                  />
                  <KycCardUpload
                    label="Aadhaar Back *"
                    title="Aadhaar back"
                    hint="Side with address & QR code · clear photo"
                    previewUri={draft.aadhaarBack?.dataUrl || draft.aadhaarBack?.uri}
                    rejectedUri={rejectedPhotos.aadhaarBack}
                    stage={docCardStage("aadhaarBack")}
                    check={docChecks.aadhaarBack}
                    lockedReason={aadhaarPhotoLocked}
                    tokens={tokens}
                    onCamera={() => setCameraSlot("aadhaarBack")}
                    onGallery={() => void pickDocImage("aadhaarBack", "aadhaar-back")}
                    onAdjust={() => adjustDocCrop("aadhaarBack")}
                    onRemove={() => removeDocPhoto("aadhaarBack")}
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
                      onChangeText={(t) => {
                        patch({ email: t, emailVerified: false });
                        setEmailError(null);
                      }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholder="email@example.com"
                      placeholderTextColor={tokens.mute}
                      style={[
                        inputStyle,
                        { flex: 1 },
                        emailError ? { borderColor: "#DC2626" } : null,
                      ]}
                    />
                    <Pressable
                      onPress={() => void requestEmailOtp()}
                      disabled={loading || draft.emailVerified || Boolean(emailError)}
                      style={[styles.verifyBtn, draft.emailVerified && { backgroundColor: colors.green }]}
                    >
                      <Text style={styles.verifyBtnText}>{draft.emailVerified ? "Verified" : "Verify"}</Text>
                    </Pressable>
                  </View>
                  {emailError ? (
                    <Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "700", marginBottom: 8 }}>
                      {emailError}
                    </Text>
                  ) : null}
                  <FieldLabel text="Address *" color={tokens.mute} />
                  <View style={styles.emailRow}>
                    <TextInput
                      value={draft.address}
                      onChangeText={(t) => patch({ address: t })}
                      placeholder="Residential address"
                      placeholderTextColor={tokens.mute}
                      style={[inputStyle, { flex: 1 }]}
                    />
                    <Pressable
                      onPress={() => void fetchAddressFromLocation("home")}
                      disabled={addressFetchBusy}
                      style={[styles.verifyBtn, addressFetchBusy && { opacity: 0.7 }]}
                    >
                      <Text style={styles.verifyBtnText}>{addressFetchBusy ? "…" : "Fetch"}</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.hint, { color: tokens.mute, marginBottom: 8 }]}>
                    Fills address, pincode, city, district and state from your location.
                  </Text>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="Pincode *" color={tokens.mute} />
                      <TextInput
                        value={draft.pincode}
                        onChangeText={(t) => patch({ pincode: t.replace(/\D/g, "").slice(0, 6) })}
                        keyboardType="number-pad"
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="City *" color={tokens.mute} />
                      <TextInput
                        value={draft.city}
                        onChangeText={(t) => patch({ city: t })}
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="District *" color={tokens.mute} />
                      <TextInput
                        value={draft.district}
                        onChangeText={(t) => patch({ district: t })}
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="State *" color={tokens.mute} />
                      <TextInput
                        value={draft.state}
                        onChangeText={(t) => patch({ state: t })}
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                  </View>
                  <SignupLocationCard
                    place="home"
                    optional
                    hint="At your shop right now? Skip this. Add your home location later from Account → Profile & KYC when you are at home. Until then, services work only near your shop."
                    value={draft.homeGeo}
                    onChange={(homeGeo) => patch({ homeGeo })}
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
                  <OptionPickerField
                    label="Business Type *"
                    values={draft.businessType ? [draft.businessType] : []}
                    options={BUSINESS_TYPES}
                    onChange={([v]) => patch({ businessType: v ?? "" })}
                  />
                  <OptionPickerField
                    label="Business Category *"
                    multiple
                    values={splitBusinessCategories(draft.businessCategory)}
                    options={BUSINESS_CATEGORIES}
                    onChange={(v) => patch({ businessCategory: v.join(", ") })}
                  />
                  <OptionPickerField
                    label="Monthly Turnover *"
                    values={draft.monthlyTurnover ? [draft.monthlyTurnover] : []}
                    options={TURNOVERS}
                    onChange={([v]) => patch({ monthlyTurnover: v ?? "" })}
                  />
                  <OptionPickerField
                    label="Business Proof *"
                    values={draft.businessProof ? [draft.businessProof] : []}
                    options={BUSINESS_PROOFS}
                    onChange={([v]) => patch({ businessProof: v ?? "" })}
                  />
                  <FieldLabel text="Business Address *" color={tokens.mute} />
                  <View style={styles.emailRow}>
                    <TextInput
                      value={draft.businessAddress}
                      onChangeText={(t) => patch({ businessAddress: t })}
                      placeholder="Shop / outlet address"
                      placeholderTextColor={tokens.mute}
                      style={[inputStyle, { flex: 1 }]}
                    />
                    <Pressable
                      onPress={() => void fetchAddressFromLocation("business")}
                      disabled={addressFetchBusy}
                      style={[styles.verifyBtn, addressFetchBusy && { opacity: 0.7 }]}
                    >
                      <Text style={styles.verifyBtnText}>{addressFetchBusy ? "…" : "Fetch"}</Text>
                    </Pressable>
                  </View>
                  {draft.address.trim() ? (
                    <Pressable onPress={useResidentialForBusiness} style={{ marginBottom: 8 }}>
                      <Text style={{ color: colors.blue, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" }}>
                        Use residential address
                      </Text>
                      <Text style={[styles.hint, { color: tokens.mute, marginTop: 2 }]} numberOfLines={2}>
                        {draft.address.trim()}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.hint, { color: tokens.mute, marginBottom: 8 }]}>
                      Fetch from location, or copy residential from Details.
                    </Text>
                  )}
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="Pincode *" color={tokens.mute} />
                      <TextInput
                        value={draft.businessPincode}
                        onChangeText={(t) => patch({ businessPincode: t.replace(/\D/g, "").slice(0, 6) })}
                        keyboardType="number-pad"
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="City *" color={tokens.mute} />
                      <TextInput
                        value={draft.businessCity}
                        onChangeText={(t) => patch({ businessCity: t })}
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="District *" color={tokens.mute} />
                      <TextInput
                        value={draft.businessDistrict}
                        onChangeText={(t) => patch({ businessDistrict: t })}
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="State *" color={tokens.mute} />
                      <TextInput
                        value={draft.businessState}
                        onChangeText={(t) => patch({ businessState: t })}
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                  </View>
                  <SignupLocationCard place="shop" value={draft.shopGeo} onChange={(shopGeo) => patch({ shopGeo })} />
                </>
              )}

              {stepIndex === 6 && (
                <>
                  <Text style={styles.sectionTitle}>Bank Details</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>Account for settlements and payouts.</Text>
                  <IfscBankDetailsFields
                    value={{
                      ifsc: draft.ifsc,
                      bankName: draft.bankName,
                      branch: draft.bankBranch,
                      city: "",
                      accountNumber: draft.accountNumber,
                      holderName: draft.accountName,
                      accountNumberConfirm: draft.accountNumberConfirm,
                    }}
                    onChange={(p) => {
                      const next: Partial<MobileSignupDraft> = {};
                      if (p.ifsc !== undefined) next.ifsc = p.ifsc;
                      if (p.bankName !== undefined) next.bankName = p.bankName;
                      if (p.branch !== undefined || p.city !== undefined) {
                        const branch = p.branch !== undefined ? p.branch : draft.bankBranch;
                        const city = p.city ?? "";
                        next.bankBranch = [branch, city].filter(Boolean).join(", ");
                      }
                      if (p.accountNumber !== undefined) next.accountNumber = p.accountNumber;
                      if (p.holderName !== undefined) next.accountName = p.holderName;
                      if (p.accountNumberConfirm !== undefined) {
                        next.accountNumberConfirm = p.accountNumberConfirm;
                      }
                      patch(next);
                    }}
                    tokens={tokens}
                    showHolder
                    showConfirmAccount
                  />
                  <SignupBankCheck
                    accountNumber={draft.accountNumber}
                    accountNumberConfirm={draft.accountNumberConfirm}
                    ifsc={draft.ifsc}
                    panName={draft.name}
                    onUseBankName={(name) => patch({ accountName: name })}
                  />
                  <UploadRow
                    label="Cancelled Cheque (optional)"
                    done={Boolean(draft.cancelledCheque)}
                    name={draft.cancelledCheque?.name}
                    onPress={() => void pickDocImage("cancelledCheque", "cheque")}
                    tokens={tokens}
                  />
                </>
              )}

              {stepIndex === 7 && (
                <>
                  <Text style={styles.sectionTitle}>Business Images</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    Personal photo opens front camera; shop photo opens rear camera. Location is saved with each photo.
                  </Text>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <UploadRow
                        label="Personal Photo *"
                        done={Boolean(draft.personalPhoto?.latitude && draft.personalPhoto?.longitude)}
                        name={
                          draft.personalPhoto
                            ? `${draft.personalPhoto.name} · ${Number(draft.personalPhoto.latitude).toFixed(5)}, ${Number(draft.personalPhoto.longitude).toFixed(5)}`
                            : undefined
                        }
                        onPress={() => {
                          if (!photoCaptureBusy) void captureLivePhoto("personalPhoto");
                        }}
                        tokens={tokens}
                        actionLabel={photoCaptureBusy ? "Capturing…" : "Front camera"}
                        compact
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <UploadRow
                        label="Shop Photo *"
                        done={Boolean(draft.shopPhoto?.latitude && draft.shopPhoto?.longitude)}
                        name={
                          draft.shopPhoto
                            ? `${draft.shopPhoto.name} · ${Number(draft.shopPhoto.latitude).toFixed(5)}, ${Number(draft.shopPhoto.longitude).toFixed(5)}`
                            : undefined
                        }
                        onPress={() => {
                          if (!photoCaptureBusy) void captureLivePhoto("shopPhoto");
                        }}
                        tokens={tokens}
                        actionLabel={photoCaptureBusy ? "Capturing…" : "Rear camera"}
                        compact
                      />
                    </View>
                  </View>
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

              <View style={styles.footerRow}>
                <Pressable
                  onPress={back}
                  disabled={loading}
                  style={[styles.backCta, { opacity: loading ? 0.6 : 1 }]}
                >
                  <Text style={styles.backCtaText}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={next}
                  disabled={nextDisabled}
                  accessibilityState={{ busy: continueAfterCheck }}
                  style={[
                    styles.cta,
                    styles.ctaFlex,
                    { opacity: nextDisabled ? 0.6 : 1 },
                    continueAfterCheck ? { flexDirection: "row", gap: 8 } : null,
                  ]}
                >
                  {continueAfterCheck ? <ActivityIndicator size="small" color="#fff" /> : null}
                  <Text style={styles.ctaText}>{primaryLabel}</Text>
                </Pressable>
              </View>

              {stepIndex === 0 ? (
                <Pressable onPress={onBack} style={{ marginTop: 14, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: tokens.mute, fontWeight: "500" }}>
                    Already have an account?{" "}
                    <Text style={{ color: colors.green, fontWeight: "700" }}>
                      Login as {signupRoleLabel(draft.role)}
                    </Text>
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <CardCameraModal
        visible={Boolean(cameraSlot)}
        title={cameraSlot ? CAMERA_TITLE[cameraSlot] : ""}
        onClose={() => setCameraSlot(null)}
        onCaptured={(path) => void onCardCaptured(path)}
      />

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
            <Pressable
              onPress={() => {
                openTermsAfterLocationRef.current = false;
                onBack();
              }}
              style={[styles.modalSecondary, { borderColor: colors.green }]}
            >
              <Text style={{ color: colors.greenDark, fontWeight: "700" }}>Go back</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <TermsAcceptModal
        visible={showTermsModal}
        latitude={draft.latitude}
        longitude={draft.longitude}
        locationBusy={locationBusy}
        onRetryLocation={() => {
          openTermsAfterLocationRef.current = true;
          setShowTermsModal(false);
          void ensureLocation();
        }}
        tokens={{
          card: tokens.card,
          cardBorder: tokens.cardBorder,
          txt: tokens.txt,
          txt2: tokens.txt2,
          mute: tokens.mute,
        }}
        onCancel={() => setShowTermsModal(false)}
        onAccept={() => {
          patch({ termsAccepted: true });
          setShowTermsModal(false);
        }}
      />
    </SafeAreaView>
  );
}

function FieldLabel({ text, color }: { text: string; color: string }) {
  return <LabelText label={text} color={color} style={styles.label} />;
}

type PickedImage = { path: string; mime: string; size: number; data?: string | null };

/** Server KYC photo limit is 1.5 MB of image bytes ≈ 2 M base64 characters. */
const MAX_UPLOAD_DATA_URL = 1_950_000;
/** KYC card photos sent for checking: ≤ 1600 px long side at JPEG 80 ≈ 200–350 KB. */
const UPLOAD_MAX_SIDE = 1600;
const UPLOAD_JPEG_QUALITY = 0.8;

/**
 * Photo file → upright JPEG no larger than UPLOAD_MAX_SIDE (EXIF orientation is applied to the pixels).
 * Returns the original file when the resizer is unavailable.
 */
async function shrinkPhoto(uri: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const resizer = require("@bam.tech/react-native-image-resizer").default as {
      createResizedImage: (
        path: string,
        maxWidth: number,
        maxHeight: number,
        format: "JPEG" | "PNG" | "WEBP",
        quality: number,
        rotation?: number,
        outputPath?: string | null,
        keepMeta?: boolean,
        options?: { mode?: "contain" | "cover" | "stretch"; onlyScaleDown?: boolean },
      ) => Promise<{ uri: string }>;
    };
    const out = await resizer.createResizedImage(
      uri,
      UPLOAD_MAX_SIDE,
      UPLOAD_MAX_SIDE,
      "JPEG",
      Math.round(UPLOAD_JPEG_QUALITY * 100),
      0,
      null,
      false,
      { mode: "contain", onlyScaleDown: true },
    );
    return out.uri;
  } catch {
    return uri;
  }
}

/** Local photo file → `data:image/jpeg;base64,…` (file blobs report a generic mime type). */
async function fileToJpegDataUrl(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read failed")));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
  const base64 = raw.slice(raw.indexOf(",") + 1);
  if (!base64) throw new Error("empty photo");
  return `data:image/jpeg;base64,${base64}`;
}

function imageCropPicker() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("react-native-image-crop-picker") as {
    openPicker: (opts: Record<string, unknown>) => Promise<PickedImage>;
    openCropper: (opts: Record<string, unknown> & { path: string }) => Promise<PickedImage>;
  };
}

function UploadRow({
  label,
  done,
  name,
  onPress,
  tokens,
  actionLabel,
  compact,
  check,
  previewUri,
}: {
  label: string;
  done: boolean;
  /** Full-width photo preview with check badge (KYC card photos) */
  previewUri?: string;
  name?: string;
  onPress: () => void;
  tokens: { mute: string; card: string; cardBorder: string; txt2: string };
  actionLabel?: string;
  compact?: boolean;
  /** KYC photo check result shown under the row */
  check?: KycDocCheckUi;
}) {
  const checkFailed = check?.state === "fail";
  const checkColor =
    check?.state === "fail"
      ? colors.danger
      : check?.state === "flag"
        ? "#B45309"
        : check?.state === "pass"
          ? colors.greenDark
          : tokens.mute;
  return (
    <View style={{ marginBottom: compact ? 4 : 10 }}>
      <FieldLabel text={label} color={tokens.mute} />
      <Pressable
        onPress={onPress}
        style={[
          styles.upload,
          compact ? styles.uploadCompact : null,
          {
            backgroundColor: checkFailed ? colors.dangerBg : tokens.card,
            borderColor: checkFailed ? colors.danger : done ? colors.green : tokens.cardBorder,
          },
        ]}
      >
        <Text
          style={{
            color: tokens.txt2,
            fontWeight: "700",
            flex: 1,
            paddingRight: 8,
            fontSize: compact ? 11 : 14,
          }}
          numberOfLines={compact ? 2 : 1}
        >
          {done ? name || "Uploaded" : actionLabel || "Tap to upload"}
        </Text>
        <Text style={{ color: done ? colors.greenDark : tokens.mute, fontWeight: "800" }}>{done ? "✓" : "+"}</Text>
      </Pressable>
      {done && previewUri ? (
        <Pressable
          onPress={onPress}
          accessibilityLabel={`${label} photo — tap to change`}
          style={{
            marginTop: 8,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: checkFailed ? colors.danger : check?.state === "flag" ? "#F59E0B" : colors.green,
            backgroundColor: "#FFFFFF",
            padding: 6,
          }}
        >
          <Image
            source={{ uri: previewUri }}
            resizeMode="contain"
            style={{ width: "100%", aspectRatio: 85.6 / 54, borderRadius: 10 }}
          />
          {check && check.state !== "fail" ? (
            <View
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  check.state === "pass" ? colors.green : check.state === "flag" ? "#F59E0B" : "#FFFFFF",
                elevation: 3,
              }}
            >
              {check.state === "checking" ? (
                <ActivityIndicator size="small" color={tokens.mute} />
              ) : (
                <Check size={18} strokeWidth={3} color="#FFFFFF" />
              )}
            </View>
          ) : null}
          <Text style={{ color: tokens.mute, fontSize: 11, fontWeight: "600", textAlign: "center", marginTop: 6 }}>
            Tap to change photo
          </Text>
        </Pressable>
      ) : null}
      {check ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          {check.state === "checking" ? <ActivityIndicator size="small" color={tokens.mute} /> : null}
          <Text style={{ flex: 1, color: checkColor, fontSize: 12, fontWeight: "600" }} accessibilityLiveRegion="polite">
            {kycDocCheckLabel(check)}
          </Text>
        </View>
      ) : null}
      {check && check.state !== "checking" && check.items.length ? (
        <View style={{ marginTop: 4, gap: 2 }}>
          {check.items.map((item) => (
            <Text
              key={item.text}
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: item.tone === "pass" ? colors.greenDark : item.tone === "flag" ? "#B45309" : colors.danger,
              }}
            >
              {item.text}
            </Text>
          ))}
        </View>
      ) : null}
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
  title: { fontSize: 18, fontWeight: "800", marginTop: 0 },
  sub: { fontSize: 12, marginTop: 1 },
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
  block: { gap: 8 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, marginTop: 6, marginBottom: 4 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  hint: { fontSize: 12, marginBottom: 6 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  dateInput: { flex: 1, marginBottom: 0 },
  calBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  calSheet: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  calWeekRow: { flexDirection: "row", marginBottom: 4 },
  calWeekDay: { width: "14.28%" as const, textAlign: "center", fontSize: 11, fontWeight: "700" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: {
    width: "14.28%" as const,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calFooter: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
  /** 2-column equal chips — Role, Business selects */
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chipCell: {
    width: "47%",
    flexGrow: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  /** Single row equal chips — Gender (3) */
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  chipFlex: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  emailRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  fieldRow: { flexDirection: "row", gap: 14, alignItems: "flex-start", marginBottom: 4 },
  fieldHalf: { flex: 1, minWidth: 0 },
  verifyBtn: {
    backgroundColor: colors.blue,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 48,
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
  uploadCompact: { padding: 10, minHeight: 52 },
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
  footerRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backCta: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  backCtaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  ctaFlex: { flex: 2, marginTop: 0 },
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
