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
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Calendar, CheckCircle2, Eye, EyeOff, MapPin, X } from "lucide-react-native";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";
import { showAlert } from "../../components/AppAlert";
import { BrandMark } from "../../components/BrandMark";
import { MobileSignupStepper, MOBILE_SIGNUP_STEPS } from "../../components/MobileSignupStepper";
import {
  clearMobileSignupDraft,
  EMPTY_MOBILE_SIGNUP_DRAFT,
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

const BUSINESS_TYPES = ["Sole Proprietorship", "Partnership", "Private Limited", "Other"];
const BUSINESS_CATEGORIES = ["Mobile Handsets", "Kirana", "Electronics", "Pharmacy", "Other"];
const TURNOVERS = ["Below 1L", "1L-5L", "5L-10L", "10L+"];
const BUSINESS_PROOFS = ["Shop License", "GST Certificate", "Udyam", "Rent Agreement", "Other"];

/** Show YYYY-MM-DD as DD/MM/YYYY on mobile. */
function isoToDisplayDob(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  return "";
}

function isoToDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(1995, 0, 1);
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function SignupScreen({ onBack, initialRole }: SignupScreenProps) {
  const { tokens, scheme } = useTheme();
  const setAuth = useAuthStore((s) => s.setAuth);
  const updateUser = useAuthStore((s) => s.updateUser);
  const setSignupContinue = useAuthStore((s) => s.setSignupContinue);
  const authUser = useAuthStore((s) => s.user);

  const [draft, setDraft] = useState<MobileSignupDraft>(EMPTY_MOBILE_SIGNUP_DRAFT);
  const [phase, setPhase] = useState<"steps" | "emailOtp">("steps");
  const [otpSent, setOtpSent] = useState(false);
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
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [addressFetchBusy, setAddressFetchBusy] = useState(false);
  const [photoCaptureBusy, setPhotoCaptureBusy] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const stepIndex = draft.stepIndex;
  const needsUpline = draft.role !== "super_distributor" && draft.role !== "direct_retailer";
  const sponsorRole =
    draft.role === "direct_retailer"
      ? "admin"
      : SPONSOR_ROLE[draft.role as Exclude<SignupRole, "direct_retailer">];
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
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1`,
          { headers: { Accept: "application/json", "User-Agent": "AsanPayMobile/1.0" } },
        );
        if (res.ok) {
          const data = (await res.json()) as { display_name?: string };
          if (data.display_name) setLocationLabel(data.display_name);
        }
      } catch {
        /* display-only */
      }
      return true;
    } catch {
      setLocationError("Could not get location. Turn on GPS / Location and try again.");
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
      let district = (
        a.city ||
        a.town ||
        a.municipality ||
        a.state_district ||
        a.county ||
        a.suburb ||
        ""
      ).trim();
      let state = (a.state || "").trim();
      const pincode = (a.postcode || "").replace(/\D/g, "").slice(0, 6);
      const displayName = (data.display_name || "").trim();
      // Full OSM display_name — rural areas often have no road name.
      const addressLine =
        displayName ||
        [a.house_number, a.road || a.pedestrian, a.village || a.suburb, district, state, pincode]
          .filter(Boolean)
          .join(", ");
      if (!addressLine && !pincode && !district && !state) {
        showAlert("Fetch failed", "Could not fetch address from location. Enter address manually.");
        return;
      }
      if (displayName) setLocationLabel(displayName);
      if (pincode.length === 6) {
        try {
          const pinRes = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
          const raw = await pinRes.json();
          const block = Array.isArray(raw) ? raw[0] : raw;
          const po = block?.PostOffice?.[0];
          if (po) {
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
          businessDistrict: district || draft.businessDistrict,
          businessState: state || draft.businessState,
        });
      } else {
        patch({
          address: addressLine || draft.address,
          pincode: pincode || draft.pincode,
          district: district || draft.district,
          state: state || draft.state,
        });
      }
      showAlert("Address fetched", "Address, pincode, district and state filled from location.");
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
        setDraft({
          ...base,
          mobile: phone || base.mobile.replace(/\D/g, "").slice(0, 10),
          accountCreated: true,
          signupToken: "",
          name: base.name.trim() || authUser.name || "",
          role: (authUser.role as SignupRole) || base.role,
          stepIndex: Math.max(base.stepIndex, 2),
        });
        setDraftReady(true);
        return;
      }

      if (existing) {
        setDraft(existing);
        if (existing.accountCreated && existing.stepIndex < 2) {
          setDraft({ ...existing, stepIndex: 2 });
        } else if (existing.signupToken && existing.stepIndex < 1 && !existing.accountCreated) {
          setDraft({ ...existing, stepIndex: 1 });
        }
      } else if (
        initialRole === "retailer" ||
        initialRole === "distributor" ||
        initialRole === "super_distributor" ||
        initialRole === "direct_retailer"
      ) {
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
    if (!draftReady || stepIndex !== 0 || otpSent || phase !== "steps") return;
    const phone = draft.mobile.replace(/\D/g, "").slice(0, 10);
    if (phone.length !== 10) {
      setMobileError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{ available: boolean; message?: string }>
        >("/auth/signup/mobile-check", { params: { mobile: phone } });
        if (cancelled) return;
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
  }, [draft.mobile, draftReady, stepIndex, otpSent, phase]);

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
  }, [draft.email, draft.emailVerified, draftReady, stepIndex, phase]);

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
    if (stepIndex !== 5) return;
    setDraft((d) => {
      if (d.businessAddress.trim() || !d.address.trim()) return d;
      return {
        ...d,
        businessAddress: d.address.trim(),
        businessPincode: d.pincode || d.businessPincode,
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
      });
      if (result.didCancel) return;
      if (result.errorCode) {
        showAlert(
          "Camera failed",
          result.errorMessage || "Could not open camera. Rebuild the app after installing react-native-image-picker.",
        );
        return;
      }
      const asset = result.assets?.[0];
      const name =
        asset?.fileName ||
        (kind === "personalPhoto" ? "personal-live.jpg" : "shop-live.jpg");
      patch({
        [kind]: {
          name,
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
      if (!draft.latitude || !draft.longitude) return "Allow location access before continuing";
      if (draft.mobile.replace(/\D/g, "").length !== 10) return "Enter a valid 10-digit mobile";
      if (!draft.termsAccepted) return "Please accept Terms and Conditions";
    }
    if (stepIndex === 1) {
      if (draft.name.trim().length < 2) return "Full name is required";
      if (!draft.password || draft.password.length < 8) return "Password must be at least 8 characters";
      if (!/[A-Za-z]/.test(draft.password)) return "Password must contain a letter";
      if (!/\d/.test(draft.password)) return "Password must contain a number";
      if (needsUpline) {
        const phone = draft.sponsorMobile.replace(/\D/g, "");
        if (phone.length !== 10) return "Enter a valid 10-digit upline mobile";
        if (!sponsorOk || !draft.sponsorUid) {
          return "Distributor / Super Distributor not found for this mobile. Use an active upline number.";
        }
      }
    }
    if (stepIndex === 2) {
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan)) return "Enter a valid PAN";
      if (!draft.gender) return "Select gender";
      if (!draft.dob || !/^\d{4}-\d{2}-\d{2}$/.test(draft.dob)) {
        return "Enter date of birth as DD/MM/YYYY";
      }
      if (!draft.fatherName.trim()) return "Father name is required";
      // Document uploads optional until S3 is wired — filename stubs only today.
    }
    if (stepIndex === 3) {
      if (draft.aadhaar.replace(/\D/g, "").length !== 12) return "Enter valid 12-digit Aadhaar";
    }
    if (stepIndex === 4) {
      if (!draft.email.trim()) return "Email is required";
      if (emailError) return emailError;
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
      if (!draft.latitude || !draft.longitude) {
        showAlert("Location required", "Allow location access before continuing");
        setShowLocationModal(true);
        return;
      }
      const { data } = await api.post<ApiResponse<{ otp?: string }>>("/auth/signup/request", {
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
        portal: "agent",
        latitude: draft.latitude,
        longitude: draft.longitude,
      });
      if (!data.success) throw new Error(data.message);
      if (__DEV__ && data.data.otp) {
        setDevOtp(data.data.otp);
        setOtp(data.data.otp);
      } else if (data.data.otp) {
        setDevOtp(data.data.otp);
      }
      setOtpSent(true);
      patch({ signupToken: "" });
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

  async function completeAccount() {
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
        name: draft.name.trim(),
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
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
      const nextDraft = { ...draft, accountCreated: true, signupToken: "", stepIndex: 2 };
      setDraft(nextDraft);
      await saveMobileSignupDraft(session.user.id, nextDraft);
      setAuth(session.user, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
      setSignupContinue(true);
    } catch (err) {
      showAlert("Signup failed", apiError(err, "Could not create account"));
    } finally {
      setLoading(false);
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
        personalPhotoFileName: draft.personalPhoto?.name,
        shopPhotoFileName: draft.shopPhoto?.name,
        personalPhotoLatitude: draft.personalPhoto?.latitude,
        personalPhotoLongitude: draft.personalPhoto?.longitude,
        shopPhotoLatitude: draft.shopPhoto?.latitude,
        shopPhotoLongitude: draft.shopPhoto?.longitude,
        latitude: draft.shopPhoto?.latitude || draft.latitude || undefined,
        longitude: draft.shopPhoto?.longitude || draft.longitude || undefined,
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
    if (stepIndex === 0 || (stepIndex === 2 && draft.accountCreated)) {
      if (draft.accountCreated) {
        setSignupContinue(false);
        return;
      }
      onBack();
      return;
    }
    if (stepIndex === 1 && draft.signupToken) {
      showAlert("Mobile verified", "Continue with role details");
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

  const subtitle = phase === "emailOtp" ? "Email OTP" : MOBILE_SIGNUP_STEPS[stepIndex]?.label;

  const primaryLabel = loading
    ? "Please wait…"
    : stepIndex === 0
      ? otpSent
        ? "Verify OTP"
        : "Send OTP"
      : stepIndex === 1
        ? "Create account"
        : stepIndex === 8
          ? "Submit application"
          : "Continue";

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
                        ? locationLabel
                          ? `Location ready · ${locationLabel}`
                          : "Location ready · resolving address…"
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
                    onChangeText={(t) => {
                      if (draft.accountCreated) return;
                      patch({ mobile: t.replace(/\D/g, "").slice(0, 10), signupToken: "" });
                      setOtpSent(false);
                      setOtp("");
                      setDevOtp("");
                      setMobileError(null);
                    }}
                    keyboardType="number-pad"
                    placeholder="10-digit mobile"
                    placeholderTextColor={tokens.mute}
                    editable={hasLocation && !otpSent && !draft.accountCreated}
                    style={[
                      inputStyle,
                      ((!hasLocation || otpSent) || draft.accountCreated) && { opacity: 0.5 },
                      mobileError ? { borderColor: "#DC2626" } : null,
                    ]}
                  />
                  {draft.accountCreated ? (
                    <Text style={[styles.hint, { color: tokens.mute }]}>
                      Signed-in mobile is locked. Continue KYC from where you left off.
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
                    onPress={() => {
                      if (otpSent) return;
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
                      I agree to the{" "}
                      <Text style={{ color: colors.blueFlat, fontWeight: "800" }}>Terms and Conditions</Text>
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
                      placeholder="e.g. Test1234"
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
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    Min 8 characters · include a letter and a number (e.g. Test1234)
                  </Text>
                </>
              )}

              {stepIndex === 2 && (
                <>
                  <Text style={styles.sectionTitle}>PAN Details</Text>
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    PAN number and personal details as on the PAN card.
                  </Text>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="PAN Number *" color={tokens.mute} />
                      <TextInput
                        value={draft.pan}
                        onChangeText={(t) =>
                          patch({ pan: t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })
                        }
                        autoCapitalize="characters"
                        placeholder="ABCDE1234F"
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                    <View style={styles.fieldHalf}>
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
                            <Text style={{ color: tokens.txt2, fontWeight: "700", fontSize: 11 }}>{g}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                  <FieldLabel text="Date of Birth *" color={tokens.mute} />
                  <Pressable
                    onPress={() => setShowDobPicker(true)}
                    style={[
                      inputStyle,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isoToDisplayDob(draft.dob) ? tokens.txt2 : tokens.mute,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {isoToDisplayDob(draft.dob) || "DD/MM/YYYY"}
                    </Text>
                    <Calendar size={18} color={tokens.mute} />
                  </Pressable>
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    As on PAN card. Tap to open calendar.
                  </Text>
                  {showDobPicker ? (
                    <DateTimePicker
                      value={isoToDate(draft.dob)}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      maximumDate={new Date()}
                      minimumDate={new Date(1940, 0, 1)}
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        if (Platform.OS === "android") {
                          setShowDobPicker(false);
                        }
                        if (event.type === "dismissed") return;
                        if (date) patch({ dob: dateToIso(date) });
                        if (Platform.OS === "ios" && event.type === "set") {
                          setShowDobPicker(false);
                        }
                      }}
                    />
                  ) : null}
                  {Platform.OS === "ios" && showDobPicker ? (
                    <Pressable onPress={() => setShowDobPicker(false)} style={{ marginBottom: 8 }}>
                      <Text style={{ color: colors.blue, fontWeight: "800", fontSize: 13 }}>Done</Text>
                    </Pressable>
                  ) : null}
                  <FieldLabel text="Father Name *" color={tokens.mute} />
                  <TextInput
                    value={draft.fatherName}
                    onChangeText={(t) => patch({ fatherName: t })}
                    placeholder="As per PAN"
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <UploadRow
                    label="PAN Card Image (optional)"
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
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <UploadRow
                        label="Aadhaar Front"
                        done={Boolean(draft.aadhaarFront)}
                        name={draft.aadhaarFront?.name}
                        onPress={() => markUpload("aadhaarFront", "aadhaar-front")}
                        tokens={tokens}
                        compact
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <UploadRow
                        label="Aadhaar Back"
                        done={Boolean(draft.aadhaarBack)}
                        name={draft.aadhaarBack?.name}
                        onPress={() => markUpload("aadhaarBack", "aadhaar-back")}
                        tokens={tokens}
                        compact
                      />
                    </View>
                  </View>
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
                    Fills address, pincode, district and state from your location.
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
                      <FieldLabel text="District *" color={tokens.mute} />
                      <TextInput
                        value={draft.district}
                        onChangeText={(t) => patch({ district: t })}
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                  </View>
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
                      <FieldLabel text="District *" color={tokens.mute} />
                      <TextInput
                        value={draft.businessDistrict}
                        onChangeText={(t) => patch({ businessDistrict: t })}
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                  </View>
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
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
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
                    </View>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="Bank Name *" color={tokens.mute} />
                      <TextInput
                        value={draft.bankName}
                        onChangeText={(t) => patch({ bankName: t })}
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                  </View>
                  <FieldLabel text="Branch" color={tokens.mute} />
                  <TextInput
                    value={draft.bankBranch}
                    onChangeText={(t) => patch({ bankBranch: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="Account Number *" color={tokens.mute} />
                      <TextInput
                        value={draft.accountNumber}
                        onChangeText={(t) => patch({ accountNumber: t.replace(/\D/g, "").slice(0, 30) })}
                        keyboardType="number-pad"
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <FieldLabel text="Confirm A/C *" color={tokens.mute} />
                      <TextInput
                        value={draft.accountNumberConfirm}
                        onChangeText={(t) =>
                          patch({ accountNumberConfirm: t.replace(/\D/g, "").slice(0, 30) })
                        }
                        keyboardType="number-pad"
                        placeholderTextColor={tokens.mute}
                        style={inputStyle}
                      />
                    </View>
                  </View>
                  <FieldLabel text="Account Holder Name *" color={tokens.mute} />
                  <TextInput
                    value={draft.accountName}
                    onChangeText={(t) => patch({ accountName: t })}
                    placeholderTextColor={tokens.mute}
                    style={inputStyle}
                  />
                  <UploadRow
                    label="Cancelled Cheque (optional)"
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
                  <Text style={[styles.hint, { color: tokens.mute }]}>
                    Live camera capture only. Latitude and longitude are saved with each photo.
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
                        actionLabel={photoCaptureBusy ? "Capturing…" : "Camera"}
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
                        actionLabel={photoCaptureBusy ? "Capturing…" : "Camera"}
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

              <Pressable
                onPress={next}
                disabled={loading || Boolean(mobileError) || (stepIndex === 0 && otpSent && otp.length !== 6)}
                style={[
                  styles.cta,
                  {
                    opacity:
                      loading || Boolean(mobileError) || (stepIndex === 0 && otpSent && otp.length !== 6)
                        ? 0.6
                        : 1,
                  },
                ]}
              >
                <Text style={styles.ctaText}>{primaryLabel}</Text>
              </Pressable>

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
  actionLabel,
  compact,
}: {
  label: string;
  done: boolean;
  name?: string;
  onPress: () => void;
  tokens: { mute: string; card: string; cardBorder: string; txt2: string };
  actionLabel?: string;
  compact?: boolean;
}) {
  return (
    <View style={{ marginBottom: compact ? 4 : 10 }}>
      <FieldLabel text={label} color={tokens.mute} />
      <Pressable
        onPress={onPress}
        style={[
          styles.upload,
          compact ? styles.uploadCompact : null,
          {
            backgroundColor: tokens.card,
            borderColor: done ? colors.green : tokens.cardBorder,
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
  fieldRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  fieldHalf: { flex: 1, minWidth: 0 },
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
