export type SignupRole = "master_distributor" | "distributor" | "retailer" | "direct_retailer";

export type SignupFileMeta = {
  name: string;
  mime: string;
  size: number;
  /** Set when photo is live-captured with GPS. */
  latitude?: string;
  longitude?: string;
  capturedAt?: string;
};


export type SignupDraft = {
  stepIndex: number;
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
  fatherName: string;
  panImage: SignupFileMeta | null;
  aadhaar: string;
  aadhaarFront: SignupFileMeta | null;
  aadhaarBack: SignupFileMeta | null;
  email: string;
  address: string;
  pincode: string;
  district: string;
  state: string;
  businessName: string;
  businessType: string;
  businessCategory: string;
  monthlyTurnover: string;
  businessProof: string;
  businessAddress: string;
  businessPincode: string;
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
  fatherName: "",
  panImage: null,
  aadhaar: "",
  aadhaarFront: null,
  aadhaarBack: null,
  email: "",
  address: "",
  pincode: "",
  district: "",
  state: "",
  businessName: "",
  businessType: "",
  businessCategory: "",
  monthlyTurnover: "",
  businessProof: "",
  businessAddress: "",
  businessPincode: "",
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

export function loadSignupDraft(key: string): SignupDraft | null {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = localStorage.getItem(draftKey(key));
    if (!raw) return null;
    return { ...EMPTY_SIGNUP_DRAFT, ...(JSON.parse(raw) as Partial<SignupDraft>) };
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
