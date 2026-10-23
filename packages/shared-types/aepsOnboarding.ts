import { findIndianState } from "./indianStates";

export interface AepsOnboardingForm {
  firstName: string;
  middleName: string;
  lastName: string;
  mobileNumber: string;
  email: string;
  panNumber: string;
  aadhaarNumber: string;
  dob: string;
  agentAddress: string;
  agentStateCode: string;
  agentCity: string;
  agentPinCode: string;
  agentBankName: string;
  agentBankAccountNumber: string;
  agentBankIFSC: string;
  shopName: string;
  shopAddress: string;
  shopStateCode: string;
  shopCity: string;
  shopPinCode: string;
  shopLatitude: string;
  shopLongitude: string;
}

export const EMPTY_AEPS_ONBOARDING_FORM: AepsOnboardingForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  mobileNumber: "",
  email: "",
  panNumber: "",
  aadhaarNumber: "",
  dob: "",
  agentAddress: "",
  agentStateCode: "",
  agentCity: "",
  agentPinCode: "",
  agentBankName: "",
  agentBankAccountNumber: "",
  agentBankIFSC: "",
  shopName: "",
  shopAddress: "",
  shopStateCode: "",
  shopCity: "",
  shopPinCode: "",
  shopLatitude: "",
  shopLongitude: "",
};

export const AEPS_ONBOARDING_STEPS = [
  { id: "personal", label: "Personal Details", short: "Personal" },
  { id: "address", label: "Address & Bank", short: "Address & Bank" },
  { id: "shop", label: "Shop & Location", short: "Shop" },
] as const;

export interface AepsOnboardingError {
  field: keyof AepsOnboardingForm;
  message: string;
}

const LETTERS = /^[A-Za-z ]+$/;
const LETTERS_OPTIONAL = /^[A-Za-z ]*$/;

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

function personal(f: AepsOnboardingForm): AepsOnboardingError | null {
  if (!f.firstName.trim()) return { field: "firstName", message: "First name is required" };
  if (!LETTERS.test(f.firstName.trim()))
    return { field: "firstName", message: "First name may only contain letters and spaces" };
  if (!LETTERS_OPTIONAL.test(f.middleName.trim()))
    return { field: "middleName", message: "Middle name may only contain letters and spaces" };
  if (!LETTERS_OPTIONAL.test(f.lastName.trim()))
    return { field: "lastName", message: "Last name may only contain letters and spaces" };
  if (digits(f.mobileNumber).length !== 10) return { field: "mobileNumber", message: "Enter a valid 10-digit mobile" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return { field: "email", message: "Enter a valid email" };
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(f.panNumber.trim().toUpperCase()))
    return { field: "panNumber", message: "Enter a valid PAN (e.g. ABCDE1234F)" };
  if (digits(f.aadhaarNumber).length !== 12) return { field: "aadhaarNumber", message: "Aadhaar must be 12 digits" };
  if (!/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(f.dob.trim()))
    return { field: "dob", message: "Date of birth must be DD-MM-YYYY (e.g. 20-10-1985)" };
  return null;
}

function addressAndBank(f: AepsOnboardingForm): AepsOnboardingError | null {
  if (f.agentAddress.trim().length < 5)
    return { field: "agentAddress", message: "Residential address must be at least 5 characters" };
  if (!findIndianState(f.agentStateCode)) return { field: "agentStateCode", message: "Select the state of your residential address" };
  if (!LETTERS.test(f.agentCity.trim())) return { field: "agentCity", message: "City may only contain letters and spaces" };
  if (digits(f.agentPinCode).length !== 6) return { field: "agentPinCode", message: "PIN must be 6 digits" };
  if (f.agentBankName.trim().length < 2) return { field: "agentBankName", message: "Bank name is required" };
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.agentBankIFSC.trim().toUpperCase()))
    return { field: "agentBankIFSC", message: "Enter a valid IFSC (e.g. ICIC0000012)" };
  const acct = digits(f.agentBankAccountNumber);
  if (acct.length < 5 || acct.length > 30)
    return { field: "agentBankAccountNumber", message: "Bank account number must be 5–30 digits" };
  return null;
}

function shop(f: AepsOnboardingForm): AepsOnboardingError | null {
  if (f.shopName.trim().length < 2) return { field: "shopName", message: "Shop name is required" };
  if (f.shopAddress.trim().length < 5)
    return { field: "shopAddress", message: "Shop address must be at least 5 characters" };
  if (!findIndianState(f.shopStateCode)) return { field: "shopStateCode", message: "Select the state of your shop address" };
  if (!LETTERS.test(f.shopCity.trim())) return { field: "shopCity", message: "Shop city may only contain letters and spaces" };
  if (digits(f.shopPinCode).length !== 6) return { field: "shopPinCode", message: "Shop PIN must be 6 digits" };
  const lat = Number(f.shopLatitude);
  const lng = Number(f.shopLongitude);
  if (!f.shopLatitude || !f.shopLongitude || !Number.isFinite(lat) || !Number.isFinite(lng))
    return { field: "shopLatitude", message: "Allow location access before continuing" };
  return null;
}

/** First problem on the given step (0 personal · 1 address & bank · 2 shop), or null when the step is valid. */
export function validateAepsOnboardingStep(step: number, form: AepsOnboardingForm): AepsOnboardingError | null {
  if (step === 0) return personal(form);
  if (step === 1) return addressAndBank(form);
  return shop(form);
}
