import AsyncStorage from "@react-native-async-storage/async-storage";

export type SignupRole = "super_distributor" | "distributor" | "retailer" | "direct_retailer";

export type SignupFileMeta = {
  name: string;
  uri?: string;
  /** data:image/...;base64,... for KYC submit preview on admin */
  dataUrl?: string;
  latitude?: string;
  longitude?: string;
  capturedAt?: string;
};


/** Shop / home GPS from the "Fetch location" button (high accuracy, mock-checked). */
export type SignupGeoFix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  isRooted?: boolean;
};

export type MobileSignupDraft = {
  stepIndex: number;
  /** Highest step reached — never decreases on Back. */
  maxStepReached: number;
  accountCreated: boolean;
  termsAccepted: boolean;
  latitude: string;
  longitude: string;
  mobile: string;
  signupToken: string;
  role: SignupRole;
  name: string;
  password: string;
  sponsorMobile: string;
  sponsorUid: string;
  sponsorName: string;
  pan: string;
  panVerified: boolean;
  panVerifiedName: string;
  gender: string;
  dob: string;
  anniversaryDate: string;
  fatherName: string;
  panImage: SignupFileMeta | null;
  aadhaar: string;
  aadhaarFront: SignupFileMeta | null;
  aadhaarBack: SignupFileMeta | null;
  aadhaarOtpRequestId: string;
  aadhaarOtpVerified: boolean;
  aadhaarVerifiedName: string;
  email: string;
  emailVerified: boolean;
  address: string;
  pincode: string;
  city: string;
  district: string;
  state: string;
  homeGeo: SignupGeoFix | null;
  businessName: string;
  businessType: string;
  businessCategory: string;
  monthlyTurnover: string;
  businessProof: string;
  businessAddress: string;
  businessPincode: string;
  businessCity: string;
  businessDistrict: string;
  businessState: string;
  shopGeo: SignupGeoFix | null;
  bankName: string;
  bankBranch: string;
  ifsc: string;
  accountNumber: string;
  accountNumberConfirm: string;
  accountName: string;
  cancelledCheque: SignupFileMeta | null;
  personalPhoto: SignupFileMeta | null;
  shopPhoto: SignupFileMeta | null;
  agreementAccepted: boolean;
};

export const EMPTY_MOBILE_SIGNUP_DRAFT: MobileSignupDraft = {
  stepIndex: 0,
  maxStepReached: 0,
  accountCreated: false,
  termsAccepted: false,
  latitude: "",
  longitude: "",
  mobile: "",
  signupToken: "",
  role: "retailer",
  name: "",
  password: "",
  sponsorMobile: "",
  sponsorUid: "",
  sponsorName: "",
  pan: "",
  panVerified: false,
  panVerifiedName: "",
  gender: "",
  dob: "",
  anniversaryDate: "",
  fatherName: "",
  panImage: null,
  aadhaar: "",
  aadhaarFront: null,
  aadhaarBack: null,
  aadhaarOtpRequestId: "",
  aadhaarOtpVerified: false,
  aadhaarVerifiedName: "",
  email: "",
  emailVerified: false,
  address: "",
  pincode: "",
  city: "",
  district: "",
  state: "",
  homeGeo: null,
  businessName: "",
  businessType: "",
  businessCategory: "",
  monthlyTurnover: "",
  businessProof: "",
  businessAddress: "",
  businessPincode: "",
  businessCity: "",
  businessDistrict: "",
  businessState: "",
  shopGeo: null,
  bankName: "",
  bankBranch: "",
  ifsc: "",
  accountNumber: "",
  accountNumberConfirm: "",
  accountName: "",
  cancelledCheque: null,
  personalPhoto: null,
  shopPhoto: null,
  agreementAccepted: false,
};

function keyFor(id: string) {
  return `asanpay:mobile-signup-draft:${id}`;
}

export function getSignupResumeStep(
  draft: Pick<MobileSignupDraft, "stepIndex" | "maxStepReached">,
  min = 0,
): number {
  return Math.max(min, draft.maxStepReached ?? 0, draft.stepIndex ?? 0);
}

export async function loadMobileSignupDraft(id: string): Promise<MobileSignupDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MobileSignupDraft>;
    const merged = { ...EMPTY_MOBILE_SIGNUP_DRAFT, ...parsed };
    merged.maxStepReached = Math.max(
      merged.maxStepReached ?? 0,
      merged.stepIndex ?? 0,
      parsed.maxStepReached ?? 0,
    );
    return merged;
  } catch {
    return null;
  }
}

export async function saveMobileSignupDraft(id: string, draft: MobileSignupDraft) {
  try {
    await AsyncStorage.setItem(keyFor(id), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export async function clearMobileSignupDraft(id: string) {
  try {
    await AsyncStorage.removeItem(keyFor(id));
  } catch {
    /* ignore */
  }
}
