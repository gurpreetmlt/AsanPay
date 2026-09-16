export type SignupRole = "super_distributor" | "distributor" | "retailer" | "direct_retailer";

export type SignupFileMeta = {
  name: string;
  mime: string;
  size: number;
  /** data:image/...;base64,... for admin KYC preview */
  dataUrl?: string;
  /** Set when photo is live-captured with GPS. */
  latitude?: string;
  longitude?: string;
  capturedAt?: string;
};


export type SignupDraft = {
  /** Current step being viewed / edited (may go backward). */
  stepIndex: number;
  /** Highest step reached — never decreases on Back (resume + Settings progress). */
  maxStepReached: number;
  accountCreated: boolean;
  termsAccepted: boolean;
  latitude: string;
  longitude: string;
  mobile: string;
  /** Set after mobile OTP verify — required for /signup/complete */
  signupToken: string;
  role: SignupRole;
  name: string;
  password: string;
  sponsorMobile: string;
  sponsorUid: string;
  sponsorName: string;
  pan: string;
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
  address: string;
  pincode: string;
  city: string;
  district: string;
  state: string;
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

export const EMPTY_SIGNUP_DRAFT: SignupDraft = {
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
  address: "",
  pincode: "",
  city: "",
  district: "",
  state: "",
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

function draftKey(mobileOrUserId: string) {
  return `asanpay:signup-draft:${mobileOrUserId}`;
}

/** Resume / Settings progress — ignores temporary Back navigation. */
export function getSignupResumeStep(
  draft: Pick<SignupDraft, "stepIndex" | "maxStepReached">,
  min = 0,
): number {
  return Math.max(min, draft.maxStepReached ?? 0, draft.stepIndex ?? 0);
}

export function loadSignupDraft(key: string): SignupDraft | null {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = localStorage.getItem(draftKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SignupDraft>;
    const merged = { ...EMPTY_SIGNUP_DRAFT, ...parsed };
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

export function saveSignupDraft(key: string, draft: SignupDraft) {
  if (typeof window === "undefined" || !key) return;
  try {
    localStorage.setItem(draftKey(key), JSON.stringify(draft));
  } catch {
    // quota / private mode
  }
}

export function clearSignupDraft(key: string) {
  if (typeof window === "undefined" || !key) return;
  localStorage.removeItem(draftKey(key));
}
