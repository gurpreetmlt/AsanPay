// Provider-agnostic contract for the wrapper layer. Every real banking rail
// (AEPS, DMT, BBPS, recharge) goes through an adapter implementing this
// interface — the rest of the codebase never talks to InstantPay/PaySprint directly,
// so swapping or adding a provider is a registry entry, not a refactor.

export type ProviderTxnStatus = "success" | "failed" | "pending";

export interface ProviderResult<TData = Record<string, unknown>> {
  success: boolean;
  status: ProviderTxnStatus;
  providerTxnId: string | null;
  amount: string | null;
  message: string;
  /** Normalized operation-specific data (balance, bill details, beneficiary id...). */
  data: TData;
  /** Raw provider response — persisted to Mongo provider_logs, never to Postgres. */
  raw: Record<string, unknown>;
}

// ── Operation params ────────────────────────────────────────────────────────

export interface AepsParams {
  retailerUserId: string;
  aadhaarNumber: string;
  bankIin: string;
  mobile: string;
  /** PidData XML from the RD-service biometric device (or JSON biometric blob in tests). */
  biometricPayload: string;
  amount?: string;
  latitude?: string;
  longitude?: string;
  /** InstantPay merchant outlet id; resolved from user profile when omitted. */
  outletId?: string;
  endpointIp?: string;
  externalRef?: string;
  /** Transaction-OTP referenceKey — mandatory for withdrawals above ₹5,000 (InstantPay). */
  otpReferenceKey?: string;
  /** Aadhaar Pay OTP extras (from ap_generate_otp). */
  otpTransactionId?: string;
  otpTransactionToken?: string;
}

/** AEPS bank directory entry (from provider bank-list API). */
export interface AepsBank {
  bankId: number | string;
  name: string;
  iin: string;
  aepsEnabled: boolean;
  aadhaarpayEnabled: boolean;
  aepsFailureRate: string;
  aadhaarpayFailureRate: string;
}

export interface AepsBankListParams {
  retailerUserId: string;
  outletId?: string;
  endpointIp?: string;
}

/** Request an SMS OTP for a high-value AEPS withdrawal (no biometric needed at this step). */
export interface AepsTxnOtpParams {
  retailerUserId: string;
  aadhaarNumber: string;
  bankIin: string;
  mobile: string;
  amount: string;
  latitude?: string;
  longitude?: string;
  outletId?: string;
  endpointIp?: string;
}

/** DMT remittance bank (from /fi/remit/out/domestic/v2/banks). */
export interface DmtBank {
  bankId: number | string;
  name: string;
  ifscAlias: string;
  ifscGlobal: string;
  neftEnabled: boolean;
  impsEnabled: boolean;
  upiEnabled: boolean;
  neftFailureRate: string;
  impsFailureRate: string;
  upiFailureRate: string;
}

export interface DmtBankListParams {
  retailerUserId: string;
  outletId?: string;
  endpointIp?: string;
}

/** Nepal remittance static dropdown types (InstantPay `/fi/remit/out/nepal/staticData`). */
export const NEPAL_STATIC_DATA_TYPES = [
  "Gender",
  "Nationality",
  "IDType",
  "IncomeSource",
  "Relationship",
  "PaymentMode",
  "RemittanceReason",
] as const;

export type NepalStaticDataType = (typeof NEPAL_STATIC_DATA_TYPES)[number];

export interface NepalStaticOption {
  label: string;
  value: string;
}

export interface NepalStaticDataParams {
  retailerUserId: string;
  type: NepalStaticDataType;
  outletId?: string;
  endpointIp?: string;
}

export type NepalPaymentLocationType = "ACCOUNTPAY" | "CASHPAY";

export interface NepalPaymentLocation {
  locationId: number | string;
  locationName: string;
  bankBranchId: number | string;
  bankName: string;
  branchName: string;
  branchCode: string;
  routingCode: string;
  country: string;
  address: string;
  state: string;
  district: string;
  city: string;
  phoneNumber: string;
}

export interface NepalPaymentLocationListParams {
  retailerUserId: string;
  type: NepalPaymentLocationType;
  /** InstantPay sample uses `NEPAL`; docs also say `Nepal`. */
  country?: string;
  state?: string;
  district?: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalStateDistrict {
  state: string;
  district: string;
  stateCode: string;
}

export interface NepalStateDistrictParams {
  retailerUserId: string;
  /** Sample uses `India`; also used for Nepal remittance address forms. */
  country: string;
  outletId?: string;
  endpointIp?: string;
}

/** InstantPay Nepal outlet onboarding actcodes from `/outletStatus`. */
export type NepalOutletActCode =
  | "OUTLETREGISTER"
  | "OUTLETEKYC"
  | "OTPVERFCTN"
  | string;

export interface NepalOutletStatus {
  statuscode: string;
  actcode: string | null;
  message: string;
  /** Present when outlet is approved / TXN. */
  cspStatus: string | null;
  cspCode: string | null;
  /** True when InstantPay says outlet can transact (TXN + APPROVED / no blocking actcode). */
  ready: boolean;
}

export interface NepalOutletStatusParams {
  retailerUserId: string;
  /**
   * Send `1` when previous actcode was OTPVERFCTN (OTP verification step).
   * InstantPay: mandatory in that case.
   */
  checkOtpStatus?: boolean;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalOutletRegistrationParams {
  retailerUserId: string;
  otpReference: string;
  otp: string;
  gender: string;
  category: string;
  fatherOrSpouseName: string;
  physicallyHandicapped: string;
  alternateOccupationType: string;
  alternateOccupationDescription?: string;
  highestEducation: string;
  operatingHoursFrom: string;
  operatingHoursTo: string;
  course: string;
  courseCompletionDate?: string;
  instituteName?: string;
  deviceName: string;
  connectivityType: string;
  connectionProvider: string;
  weeklyOff: string;
  expectedAnnualTurnover: string | number;
  expectedAnnualIncome: string | number;
  bankAccountNo: string;
  bankIfsc: string;
  accountName: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalOutletRegistrationResult {
  statuscode: string;
  actcode: string | null;
  message: string;
  /** True when InstantPay says proceed to Outlet eKYC (`actcode: OUTLETEKYC`). */
  needsEkyc: boolean;
}

export interface NepalOutletEkycInitiateParams {
  retailerUserId: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalOutletEkycInitiateResult {
  statuscode: string;
  actcode: string | null;
  message: string;
  /** Bank/UIDAI eKYC portal URL — open in browser / WebView. */
  redirectUrl: string;
}

export interface NepalOutletEkycInitiateStatusParams {
  retailerUserId: string;
  /** Optional — docs say from Initiate KYC for Remitter API. */
  referenceKey?: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalOutletEkycInitiateStatusResult {
  statuscode: string;
  actcode: string | null;
  message: string;
  /** True when InstantPay reports TXN (eKYC initiate completed / ready for next step). */
  ready: boolean;
  /** Pass-through of InstantPay `data` when present. */
  data: Record<string, unknown> | null;
}

/** Nepal outlet eKYC biometric block (InstantPay `/outletEkycProcess`). */
export interface NepalOutletEkycBiometricData {
  rdsId: string;
  rdsVer: string;
  ci: string;
  dc: string;
  dpId: string;
  hmac: string;
  mc: string;
  mi: string;
  pidData: string;
  sessionKey: string;
}

export interface NepalOutletEkycProcessParams {
  retailerUserId: string;
  /**
   * PidData XML from RD service (preferred) — adapter maps to InstantPay biometricData.
   * Alternatively pass structured `biometricData`.
   */
  biometricPayload?: string;
  biometricData?: NepalOutletEkycBiometricData;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalOutletEkycProcessResult {
  statuscode: string;
  actcode: string | null;
  message: string;
  /** True when InstantPay reports TXN. */
  success: boolean;
}

/** Nepal remitter ID document row (InstantPay `/remitterProfile`). */
export interface NepalRemitterIdDoc {
  idType: string;
  idNumber: string;
}

export interface NepalRemitterTxnCount {
  day: string;
  month: string;
  year: string;
}

/** Nepal beneficiary row (InstantPay remitter profile / registration response). */
export interface NepalBeneficiary {
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

export interface NepalRemitterProfile {
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
  ids: NepalRemitterIdDoc[];
  transactionCount: NepalRemitterTxnCount;
  beneficiaries: NepalBeneficiary[];
}

export interface NepalRemitterProfileParams {
  retailerUserId: string;
  /** Remitter mobile (10 digits) — InstantPay field `mobile`. */
  customerMobile: string;
  outletId?: string;
  endpointIp?: string;
}

/** InstantPay `/otpRequest` operation values. */
export const NEPAL_OTP_OPERATIONS = [
  "FundTransfer",
  "RemitterRegistration",
  "AgentRegistration",
] as const;
export type NepalOtpOperation = (typeof NEPAL_OTP_OPERATIONS)[number];

/** InstantPay sample paymentMode labels (also from Static Data `PaymentMode`). */
export const NEPAL_OTP_PAYMENT_MODES = ["Cash Payment", "Account Deposit"] as const;
export type NepalOtpPaymentMode = (typeof NEPAL_OTP_PAYMENT_MODES)[number];

export interface NepalOtpRequestParams {
  retailerUserId: string;
  operation: NepalOtpOperation;
  /** Remitter mobile — required for FundTransfer + RemitterRegistration. */
  mobile?: string;
  /** Required for FundTransfer. */
  beneficiaryId?: string;
  /** Required except RemitterRegistration (optional there). */
  paymentMode?: NepalOtpPaymentMode | string;
  /** Required when paymentMode is Account Deposit. */
  bankBranchId?: string;
  accountNumber?: string;
  transferAmount?: string;
  outletId?: string;
  endpointIp?: string;
}

/** Remitter type codes (InstantPay `/remitterRegistration`). */
export type NepalRemitterType = 1 | 2 | 3 | 4;
/** Income source type codes: 1 Govt … 6 Dependent. */
export type NepalIncomeSourceType = 1 | 2 | 3 | 4 | 5 | 6;
/** Annual income band: 1 ≤2L … 4 >10L. */
export type NepalAnnualIncomeBand = 1 | 2 | 3 | 4;

export interface NepalRemitterRegistrationParams {
  retailerUserId: string;
  name: string;
  gender: string;
  /** YYYY-MM-DD */
  dob: string;
  address: string;
  city: string;
  state: string;
  district: string;
  nationality: string;
  /** InstantPay sample allows empty string despite “Mandatory”. */
  email: string;
  employer: string;
  /** From Static Data `IDType`. */
  idType: string;
  idNumber: string;
  idExpiryDate?: string;
  idIssuedPlace?: string;
  /** From Static Data `IncomeSource`. */
  incomeSource: string;
  remitterType: NepalRemitterType;
  incomeSourceType: NepalIncomeSourceType;
  annualIncome: NepalAnnualIncomeBand;
  /** From Send OTP (`operation: RemitterRegistration`). */
  otpReference: string;
  otp: string;
  /** In InstantPay sample (not listed in param table) — remitter mobile for OTP. */
  mobile: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalRemitterEkycInitiateParams {
  retailerUserId: string;
  /** Remitter `id` from remitter profile / registration. */
  remitterId: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalRemitterEkycInitiateResult {
  statuscode: string;
  actcode: string | null;
  message: string;
  /** Poll / next-step key from InstantPay. */
  referenceKey: string;
  /** Bank eKYC redirect URL (InstantPay field `url`). */
  redirectUrl: string;
}

export interface NepalRemitterEkycInitiateStatusParams {
  retailerUserId: string;
  remitterId: string;
  /** From Remitter eKYC Initiate response. */
  referenceKey: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalRemitterEkycInitiateStatusResult {
  statuscode: string;
  actcode: string | null;
  message: string;
  /** True when InstantPay reports TXN (bank redirect flow completed). */
  ready: boolean;
  data: Record<string, unknown> | null;
}

export interface NepalRemitterEkycProcessParams {
  retailerUserId: string;
  remitterId: string;
  /** From Remitter eKYC Initiate. */
  referenceKey: string;
  /**
   * PidData XML from RD service (preferred) — adapter maps to InstantPay biometricData.
   * Alternatively pass structured `biometricData`.
   */
  biometricPayload?: string;
  biometricData?: NepalOutletEkycBiometricData;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalRemitterUpdateParams {
  retailerUserId: string;
  remitterId: string;
  remitterType: NepalRemitterType;
  incomeSourceType: NepalIncomeSourceType;
  annualIncome: NepalAnnualIncomeBand;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalRemitterUpdateResult {
  statuscode: string;
  actcode: string | null;
  message: string;
  /** True when InstantPay reports TXN. */
  success: boolean;
}

export interface NepalBeneficiaryRegistrationParams {
  retailerUserId: string;
  remitterMobile: string;
  name: string;
  gender: string;
  /** Beneficiary mobile (Nepal). */
  mobile: string;
  /** From Static Data `Relationship`. */
  relationship: string;
  address: string;
  paymentMode: string;
  /** Required when paymentMode is Account Deposit. */
  bankBranchId?: string;
  accountNumber?: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalServiceChargeParams {
  retailerUserId: string;
  /** Default InstantPay value: `Nepal`. */
  country?: string;
  paymentMode: string;
  /** INR amount to transfer — InstantPay sample may send `""` when using payoutAmount. */
  transferAmount?: string;
  /** NPR amount beneficiary receives (optional). */
  payoutAmount?: string;
  /** Required when paymentMode is Account Deposit. */
  bankBranchId?: string;
  remitterMobile: string;
  /** Required when paymentMode is Account Deposit. */
  beneficiaryId?: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalServiceChargeQuote {
  transferAmount: string;
  serviceCharge: string;
  collectionAmount: string;
  collectionCurrency: string;
  exchangeRate: string;
  payoutAmount: string;
  payoutCurrency: string;
}

export interface NepalFundTransferParams {
  retailerUserId: string;
  remitterMobile: string;
  beneficiaryId: string;
  /** INR transfer amount (max ₹50,000). */
  transferAmount: string;
  /** From Static Data `RemittanceReason`. */
  remittanceReason: string;
  /** From Send OTP (`operation: FundTransfer`). */
  otpReference: string;
  otp: string;
  latitude: string;
  longitude: string;
  /** Our txnRef — sent as InstantPay `externalRef` for status recheck. */
  externalRef?: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalFetchTransactionStatusParams {
  retailerUserId: string;
  /** InstantPay transaction id (`orderid` / poolReferenceId from Fund Transfer). */
  ipayId: string;
  latitude: string;
  longitude: string;
  outletId?: string;
  endpointIp?: string;
}

export interface NepalFetchTransactionStatusResult {
  statuscode: string;
  actcode: string | null;
  message: string;
  /** Mapped InstantPay outcome for UI. */
  ready: boolean;
  data: Record<string, unknown> | null;
}

export interface DmtRemitterProfileParams {
  retailerUserId: string;
  /** Remitter (customer) mobile number. */
  customerMobile: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtRemitterRegistrationParams {
  retailerUserId: string;
  customerMobile: string;
  /** Plain 12-digit Aadhaar — adapter encrypts (AES-256-CBC) before sending. */
  aadhaarNumber: string;
  /** referenceKey from the Remitter Profile response. */
  referenceKey: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtRemitterRegistrationVerifyParams {
  retailerUserId: string;
  customerMobile: string;
  /** OTP received on remitter mobile (from registration step). */
  otp: string;
  /** referenceKey from the Remitter Profile response. */
  referenceKey: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtRemitterKycParams {
  retailerUserId: string;
  customerMobile: string;
  /** PidData XML from the RD-service biometric device (or JSON biometric blob in tests). */
  biometricPayload: string;
  /** referenceKey from the Remitter Profile response. */
  referenceKey: string;
  captureType?: "FINGER" | "FACE";
  latitude?: string;
  longitude?: string;
  outletId?: string;
  endpointIp?: string;
  externalRef?: string;
}

/** Beneficiary as returned inside remitter profile. */
export interface DmtRemitterBeneficiary {
  id: string;
  name: string;
  account: string;
  ifsc: string;
  bank: string;
  beneficiaryMobileNumber: string;
  verificationDt: string;
}

/** Remitter profile (from /fi/remit/out/domestic/v2/remitterProfile). */
export interface DmtRemitterProfile {
  registered: boolean;
  mobileNumber: string;
  firstName: string;
  lastName: string;
  city: string;
  pincode: string;
  limitPerTransaction: string;
  limitTotal: string;
  limitConsumed: string;
  limitAvailable: string;
  limitDetails: Record<string, string>;
  beneficiaries: DmtRemitterBeneficiary[];
  isTxnOtpRequired: boolean;
  isTxnBioAuthRequired: boolean;
  isImpsAllowed: boolean;
  isNeftAllowed: boolean;
  isFaceAuthAvailable: boolean;
  /** Reference key for follow-up calls (registration/txn) with its validity. */
  referenceKey: string;
  validity: string;
  pidOptionWadh: string;
}

export interface DmtBeneficiaryParams {
  retailerUserId: string;
  customerMobile: string;
  name: string;
  accountNumber: string;
  ifsc: string;
  /** Beneficiary's own mobile — falls back to remitter mobile when absent. */
  beneficiaryMobile?: string;
  /** bankId from the DMT bank list (InstantPay). */
  bankId?: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtBeneficiaryVerifyParams {
  retailerUserId: string;
  /** Remitter mobile — OTP isi number pe gaya hota hai. */
  customerMobile: string;
  otp: string;
  /** beneficiaryId from the Beneficiary Registration response. */
  beneficiaryId: string;
  /** referenceKey from the Beneficiary Registration response. */
  referenceKey: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtBeneficiaryDeleteParams {
  retailerUserId: string;
  /** Remitter mobile — delete OTP isi number pe jaata hai. */
  customerMobile: string;
  beneficiaryId: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtTransactionOtpParams {
  retailerUserId: string;
  /** Remitter mobile — transaction OTP isi number pe jaata hai. */
  customerMobile: string;
  /** Amount to be transferred (rupees, up to 2 decimals). */
  amount: string;
  /** referenceKey from the Remitter Profile response. */
  referenceKey: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtRefundOtpParams {
  retailerUserId: string;
  /** InstantPay orderid of the pending remittance txn that needs refund authorisation. */
  ipayId: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtRefundParams {
  retailerUserId: string;
  /** InstantPay orderid of the pending remittance txn being refunded. */
  ipayId: string;
  /** referenceKey from the Transaction Refund OTP response. */
  referenceKey: string;
  /** OTP received on the remitter's mobile. */
  otp: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtTransferParams {
  retailerUserId: string;
  /** Remitter mobile. */
  customerMobile: string;
  /** Beneficiary account details (from beneficiary registration). */
  accountNumber: string;
  ifsc: string;
  amount: string;
  mode: "imps" | "neft";
  /** OTP received on remitter mobile (from generateTransactionOtp step). */
  otp: string;
  /** referenceKey from the Generate Transaction OTP response. */
  referenceKey: string;
  /** Our txnRef — sent as externalRef so txn-status recheck can find it. */
  externalRef?: string;
  /** Record-keeping only; not sent to the provider. */
  beneficiaryId?: string;
  latitude?: string;
  longitude?: string;
  outletId?: string;
  endpointIp?: string;
}

export interface BbpsFetchBillParams {
  retailerUserId: string;
  billerCode: string;
  /** Consumer number / CA number / registered mobile, per biller. */
  customerParams: Record<string, string>;
}

export interface BbpsPayBillParams extends BbpsFetchBillParams {
  amount: string;
  /** Returned by fetchBill; ties the payment to the fetched bill. */
  billFetchRef: string;
}

export interface RechargeParams {
  retailerUserId: string;
  /** `MOBILE_PREPAID` | `DTH` — lets adapters pick operator / circle mapping. */
  serviceCode?: string;
  operatorCode: string;
  accountRef: string; // mobile number / DTH subscriber id
  amount: string;
  /** Our txnRef — sent as VyaparAPI `partnerid` (must be unique). */
  clientRef?: string;
}

export interface CheckStatusParams {
  providerTxnId: string | null;
  /** Our txnRef — providers that support client-ref lookup use this as fallback. */
  clientRef: string;
  /** Transaction date (YYYY-MM-DD, IST) — InstantPay reports API requires it. */
  txnDate?: string;
  /** Service code of the original txn — lets adapters pick rail-specific query params. */
  serviceCode?: string;
}

/** Retailer proving THEIR OWN identity (not the customer's) — see modules/auth/agentAuth.ts. */
export interface AgentAuthParams {
  retailerUserId: string;
  aadhaarNumber: string;
  biometricPayload: string;
  latitude?: string;
  longitude?: string;
  outletId?: string;
  endpointIp?: string;
  externalRef?: string;
}

// ── Adapter contract ────────────────────────────────────────────────────────

export interface ProviderAdapter {
  readonly code: string;
  /**
   * True for stub/mock adapters that fabricate provider responses (always "success") without
   * calling a real rail. Money must NEVER be settled on a stub's word in production — the router
   * refuses to route through a stub in prod unless ALLOW_STUB_PROVIDERS is explicitly set.
   */
  readonly isStub?: boolean;

  aepsBalanceEnquiry(params: AepsParams): Promise<ProviderResult<{ balance: string }>>;
  aepsWithdraw(params: AepsParams): Promise<ProviderResult>;
  /** Customer deposits cash into their own bank account (merchant collects the cash). */
  aepsDeposit(params: AepsParams): Promise<ProviderResult>;
  /** AEPS-enabled bank directory with real NPCI IINs + failure rates. */
  aepsBankList(params: AepsBankListParams): Promise<ProviderResult<{ banks: AepsBank[] }>>;
  /** OTP for ₹5,000+ withdrawals; returns referenceKey to pass in aepsWithdraw. */
  aepsTransactionOtp(
    params: AepsTxnOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>>;
  aepsMiniStatement(
    params: AepsParams,
  ): Promise<ProviderResult<{ statement: { date: string; narration: string; amount: string; type: "credit" | "debit" }[] }>>;
  aadhaarPay(params: AepsParams): Promise<ProviderResult>;

  /** DMT remittance bank directory (IMPS/NEFT flags + IFSC alias). */
  dmtBankList(params: DmtBankListParams): Promise<ProviderResult<{ banks: DmtBank[] }>>;
  /** Remitter existence check + limits + registered beneficiaries. */
  dmtRemitterProfile(
    params: DmtRemitterProfileParams,
  ): Promise<
    ProviderResult<{
      profile: DmtRemitterProfile | null;
      /** Present when profile is null — needed to start remitter registration. */
      referenceKey?: string;
      validity?: string;
    }>
  >;
  /** Start remitter registration — sends OTP to remitter mobile; returns otpReference for verify. */
  dmtRemitterRegister(
    params: DmtRemitterRegistrationParams,
  ): Promise<ProviderResult<{ otpReference: string }>>;
  /** Verify registration OTP — completes remitter registration; returns provider referenceId. */
  dmtRemitterRegisterVerify(
    params: DmtRemitterRegistrationVerifyParams,
  ): Promise<ProviderResult<{ referenceId: string }>>;
  /** Remitter biometric/face eKYC — chargeable (pool debit); needed for full-KYC limits. */
  dmtRemitterKyc(params: DmtRemitterKycParams): Promise<ProviderResult<{ poolReferenceId: string }>>;
  /** Start beneficiary registration — sends OTP to remitter mobile; returns referenceKey for verify. */
  dmtAddBeneficiary(
    params: DmtBeneficiaryParams,
  ): Promise<ProviderResult<{ beneficiaryId: string; referenceKey: string; validity: string }>>;
  /** Verify beneficiary registration OTP — completes beneficiary registration. */
  dmtAddBeneficiaryVerify(
    params: DmtBeneficiaryVerifyParams,
  ): Promise<ProviderResult<{ beneficiaryId: string }>>;
  /** Start beneficiary delete — sends OTP to remitter mobile; returns referenceKey for verify. */
  dmtDeleteBeneficiary(
    params: DmtBeneficiaryDeleteParams,
  ): Promise<ProviderResult<{ beneficiaryId: string; referenceKey: string; validity: string }>>;
  /** Verify beneficiary delete OTP — completes beneficiary deletion. Same params shape as add-verify. */
  dmtDeleteBeneficiaryVerify(
    params: DmtBeneficiaryVerifyParams,
  ): Promise<ProviderResult<{ beneficiaryId: string }>>;
  /** Transaction OTP for transfer — sends OTP to remitter mobile; returns referenceKey for the transfer call. */
  dmtGenerateTransactionOtp(
    params: DmtTransactionOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>>;
  dmtTransfer(params: DmtTransferParams): Promise<ProviderResult>;
  /** Refund OTP for a pending txn flagged ReversalAuthorisationRequired — sends OTP to remitter. */
  dmtTransactionRefundOtp(
    params: DmtRefundOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>>;
  /** Confirm refund of a pending txn with the OTP + referenceKey from the refund OTP step. */
  dmtTransactionRefund(params: DmtRefundParams): Promise<ProviderResult>;

  /** Nepal remittance — static dropdown values (Gender, IDType, PaymentMode, …). */
  nepalStaticData(
    params: NepalStaticDataParams,
  ): Promise<ProviderResult<{ items: NepalStaticOption[]; type: NepalStaticDataType }>>;
  /** Nepal remittance — cash pickup / account pay locations. */
  nepalPaymentLocationList(
    params: NepalPaymentLocationListParams,
  ): Promise<ProviderResult<{ locations: NepalPaymentLocation[] }>>;
  /** Nepal remittance — state + district list for a country (India / Nepal). */
  nepalStateDistrict(
    params: NepalStateDistrictParams,
  ): Promise<ProviderResult<{ items: NepalStateDistrict[] }>>;
  /** Nepal remittance — outlet registration / eKYC / OTP status gate. */
  nepalOutletStatus(
    params: NepalOutletStatusParams,
  ): Promise<ProviderResult<{ outlet: NepalOutletStatus }>>;
  /** Nepal remittance — register outlet (after OTP); next step usually OUTLETEKYC. */
  nepalOutletRegistration(
    params: NepalOutletRegistrationParams,
  ): Promise<ProviderResult<{ registration: NepalOutletRegistrationResult }>>;
  /** Nepal remittance — start bank eKYC; returns redirectUrl for retailer to complete. */
  nepalOutletEkycInitiate(
    params: NepalOutletEkycInitiateParams,
  ): Promise<ProviderResult<{ ekyc: NepalOutletEkycInitiateResult }>>;
  /** Nepal remittance — poll eKYC initiate completion (after redirectUrl flow). */
  nepalOutletEkycInitiateStatus(
    params: NepalOutletEkycInitiateStatusParams,
  ): Promise<ProviderResult<{ ekycStatus: NepalOutletEkycInitiateStatusResult }>>;
  /** Nepal remittance — submit RD biometric for outlet eKYC. */
  nepalOutletEkycProcess(
    params: NepalOutletEkycProcessParams,
  ): Promise<ProviderResult<{ process: NepalOutletEkycProcessResult }>>;
  /** Nepal remittance — fetch remitter (customer) profile by mobile. */
  nepalRemitterProfile(
    params: NepalRemitterProfileParams,
  ): Promise<ProviderResult<{ profile: NepalRemitterProfile | null }>>;
  /**
   * Nepal remittance — send OTP for AgentRegistration / RemitterRegistration / FundTransfer.
   * Returns `otpReference` for subsequent verify / registration / transfer steps.
   */
  nepalOtpRequest(
    params: NepalOtpRequestParams,
  ): Promise<ProviderResult<{ otpReference: string }>>;
  /** Nepal remittance — create remitter (after OTP with RemitterRegistration). */
  nepalRemitterRegistration(
    params: NepalRemitterRegistrationParams,
  ): Promise<ProviderResult<{ profile: NepalRemitterProfile }>>;
  /** Nepal remittance — start remitter bank eKYC; returns redirect URL + referenceKey. */
  nepalRemitterEkycInitiate(
    params: NepalRemitterEkycInitiateParams,
  ): Promise<ProviderResult<{ ekyc: NepalRemitterEkycInitiateResult }>>;
  /** Nepal remittance — poll remitter eKYC initiate completion (after bank redirect). */
  nepalRemitterEkycInitiateStatus(
    params: NepalRemitterEkycInitiateStatusParams,
  ): Promise<ProviderResult<{ ekycStatus: NepalRemitterEkycInitiateStatusResult }>>;
  /** Nepal remittance — submit RD biometric for remitter eKYC. */
  nepalRemitterEkycProcess(
    params: NepalRemitterEkycProcessParams,
  ): Promise<ProviderResult<{ process: NepalOutletEkycProcessResult }>>;
  /** Nepal remittance — update remitter income / occupation codes. */
  nepalRemitterUpdate(
    params: NepalRemitterUpdateParams,
  ): Promise<ProviderResult<{ update: NepalRemitterUpdateResult }>>;
  /** Nepal remittance — create beneficiary; returns updated remitter profile + new beneficiaryId. */
  nepalBeneficiaryRegistration(
    params: NepalBeneficiaryRegistrationParams,
  ): Promise<ProviderResult<{ profile: NepalRemitterProfile; beneficiaryId: string }>>;
  /** Nepal remittance — fetch FX / service charge quote before transfer. */
  nepalServiceCharge(
    params: NepalServiceChargeParams,
  ): Promise<ProviderResult<{ quote: NepalServiceChargeQuote }>>;
  /** Nepal remittance — fund transfer (wallet debit + InstantPay). */
  nepalFundTransfer(params: NepalFundTransferParams): Promise<ProviderResult>;
  /** Nepal remittance — fetch InstantPay txn status by ipayId. */
  nepalFetchTransactionStatus(
    params: NepalFetchTransactionStatusParams,
  ): Promise<ProviderResult<{ txnStatus: NepalFetchTransactionStatusResult }>>;

  bbpsFetchBill(
    params: BbpsFetchBillParams,
  ): Promise<ProviderResult<{ billFetchRef: string; customerName: string; billAmount: string; dueDate: string }>>;
  bbpsPayBill(params: BbpsPayBillParams): Promise<ProviderResult>;

  recharge(params: RechargeParams): Promise<ProviderResult>;

  checkStatus(params: CheckStatusParams): Promise<ProviderResult>;

  agentAuth(params: AgentAuthParams): Promise<ProviderResult>;
}

/** Operation names — used for provider_logs and per-operation routing. */
export type ProviderOperation =
  | "aeps_balance_enquiry"
  | "aeps_withdraw"
  | "aeps_deposit"
  | "aeps_bank_list"
  | "aeps_txn_otp"
  | "aeps_mini_statement"
  | "aadhaar_pay"
  | "dmt_bank_list"
  | "dmt_remitter_profile"
  | "dmt_remitter_register"
  | "dmt_remitter_register_verify"
  | "dmt_remitter_kyc"
  | "dmt_add_beneficiary"
  | "dmt_add_beneficiary_verify"
  | "dmt_delete_beneficiary"
  | "dmt_delete_beneficiary_verify"
  | "dmt_txn_otp"
  | "dmt_transfer"
  | "dmt_refund_otp"
  | "dmt_refund"
  | "nepal_static_data"
  | "nepal_payment_locations"
  | "nepal_state_district"
  | "nepal_outlet_status"
  | "nepal_outlet_registration"
  | "nepal_outlet_ekyc_initiate"
  | "nepal_outlet_ekyc_status"
  | "nepal_outlet_ekyc_process"
  | "nepal_remitter_profile"
  | "nepal_otp_request"
  | "nepal_remitter_registration"
  | "nepal_remitter_ekyc_initiate"
  | "nepal_remitter_ekyc_status"
  | "nepal_remitter_ekyc_process"
  | "nepal_remitter_update"
  | "nepal_beneficiary_registration"
  | "nepal_service_charge"
  | "nepal_fund_transfer"
  | "nepal_fetch_txn_status"
  | "bbps_fetch_bill"
  | "bbps_pay_bill"
  | "recharge"
  | "check_status"
  | "agent_auth";
