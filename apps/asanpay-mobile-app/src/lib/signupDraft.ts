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


export type MobileSignupDraft = {
  stepIndex: number;
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
  gender: string;
  dob: string;
  anniversaryDate: string;
  fatherName: string;
  panImage: SignupFileMeta | null;
  aadhaar: string;
  aadhaarFront: SignupFileMeta | null;
  aadhaarBack: SignupFileMeta | null;
  email: string;
  emailVerified: boolean;
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

export const EMPTY_MOBILE_SIGNUP_DRAFT: MobileSignupDraft = {
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
  anniversaryDate: "",
  fatherName: "",
  panImage: null,
  aadhaar: "",
  aadhaarFront: null,
  aadhaarBack: null,
  email: "",
  emailVerified: false,
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

function keyFor(id: string) {
  return `asanpay:mobile-signup-draft:${id}`;
}

export async function loadMobileSignupDraft(id: string): Promise<MobileSignupDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(id));
    if (!raw) return null;
    return { ...EMPTY_MOBILE_SIGNUP_DRAFT, ...(JSON.parse(raw) as Partial<MobileSignupDraft>) };
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
