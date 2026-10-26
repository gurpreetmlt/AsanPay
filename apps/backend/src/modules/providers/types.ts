// Provider-agnostic contract for the wrapper layer. Every real banking rail
// (AEPS, DMT, BBPS, recharge) goes through an adapter implementing this
// interface — the rest of the codebase never talks to a provider directly,
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
  /** Provider merchant / agent id; resolved from user profile when omitted. */
  outletId?: string;
  endpointIp?: string;
  externalRef?: string;
  /** Transaction-OTP referenceKey — mandatory for withdrawals above ₹5,000. */
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
  /** bankId from the DMT bank list. */
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
  /** Provider order id of the pending remittance txn that needs refund authorisation. */
  ipayId: string;
  outletId?: string;
  endpointIp?: string;
}

export interface DmtRefundParams {
  retailerUserId: string;
  /** Provider order id of the pending remittance txn being refunded. */
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
  /** Transaction date (YYYY-MM-DD, IST) — some status APIs require it. */
  txnDate?: string;
  /** Service code of the original txn — lets adapters pick rail-specific query params. */
  serviceCode?: string;
  /** When our txn row was created — lets adapters tell "not registered yet" from "never will be". */
  createdAt?: Date;
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
  | "upi_qr_collect"
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
  | "bbps_fetch_bill"
  | "bbps_pay_bill"
  | "recharge"
  | "check_status"
  | "agent_auth";
