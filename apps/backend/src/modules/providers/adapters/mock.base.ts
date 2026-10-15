import { randomUUID } from "node:crypto";
import type {
  AepsBank,
  AepsBankListParams,
  AepsParams,
  AepsTxnOtpParams,
  AgentAuthParams,
  BbpsFetchBillParams,
  BbpsPayBillParams,
  CheckStatusParams,
  DmtBank,
  DmtBankListParams,
  DmtBeneficiaryDeleteParams,
  DmtBeneficiaryParams,
  DmtBeneficiaryVerifyParams,
  DmtRefundOtpParams,
  DmtRefundParams,
  DmtTransactionOtpParams,
  DmtRemitterProfile,
  DmtRemitterKycParams,
  DmtRemitterProfileParams,
  DmtRemitterRegistrationParams,
  DmtRemitterRegistrationVerifyParams,
  DmtTransferParams,
  NepalStaticDataParams,
  NepalStaticDataType,
  NepalStaticOption,
  NepalPaymentLocation,
  NepalPaymentLocationListParams,
  NepalStateDistrict,
  NepalStateDistrictParams,
  NepalOutletStatus,
  NepalOutletStatusParams,
  NepalOutletRegistrationParams,
  NepalOutletRegistrationResult,
  NepalOutletEkycInitiateParams,
  NepalOutletEkycInitiateResult,
  NepalOutletEkycInitiateStatusParams,
  NepalOutletEkycInitiateStatusResult,
  NepalOutletEkycProcessParams,
  NepalOutletEkycProcessResult,
  NepalRemitterProfile,
  NepalRemitterProfileParams,
  NepalOtpRequestParams,
  NepalRemitterRegistrationParams,
  NepalRemitterEkycInitiateParams,
  NepalRemitterEkycInitiateResult,
  NepalRemitterEkycInitiateStatusParams,
  NepalRemitterEkycInitiateStatusResult,
  NepalRemitterEkycProcessParams,
  NepalRemitterUpdateParams,
  NepalRemitterUpdateResult,
  NepalBeneficiaryRegistrationParams,
  NepalServiceChargeParams,
  NepalServiceChargeQuote,
  NepalFundTransferParams,
  NepalFetchTransactionStatusParams,
  NepalFetchTransactionStatusResult,
  ProviderAdapter,
  ProviderResult,
  RechargeParams,
} from "../types";

// Shared mock behaviour for stub adapters until real provider credentials arrive.
// Deterministic test hooks (amount decimals) let every failure path be exercised
// from the UI without touching code:
//   *.99  -> provider declines (failed)
//   *.98  -> provider times out (pending; resolve later via checkStatus)
//   anything else -> success
const MOCK_LATENCY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockOutcome(amount: string | undefined): "success" | "failed" | "pending" {
  if (!amount) return "success";
  if (amount.endsWith(".99")) return "failed";
  if (amount.endsWith(".98")) return "pending";
  return "success";
}

export abstract class MockAdapterBase implements ProviderAdapter {
  abstract readonly code: string;
  // Marks every subclass as a stub so the router can refuse to settle money on it in production.
  readonly isStub = true;

  private async respond<TData extends Record<string, unknown>>(
    operation: string,
    amount: string | undefined,
    data: TData,
  ): Promise<ProviderResult<TData>> {
    await sleep(MOCK_LATENCY_MS);
    const outcome = mockOutcome(amount);
    const providerTxnId = outcome === "failed" ? null : `${this.code.toUpperCase()}-${randomUUID().slice(0, 12)}`;
    return {
      success: outcome === "success",
      status: outcome,
      providerTxnId,
      amount: amount ?? null,
      message:
        outcome === "success"
          ? `${operation} successful`
          : outcome === "pending"
            ? `${operation} pending at provider`
            : `${operation} declined by provider (mock)`,
      data,
      raw: { mock: true, provider: this.code, operation, outcome },
    };
  }

  aepsBalanceEnquiry(params: AepsParams): Promise<ProviderResult<{ balance: string }>> {
    return this.respond("AEPS balance enquiry", undefined, { balance: "12450.75" });
  }

  aepsWithdraw(params: AepsParams): Promise<ProviderResult<Record<string, never>>> {
    return this.respond("AEPS cash withdrawal", params.amount, {});
  }

  aepsDeposit(params: AepsParams): Promise<ProviderResult<Record<string, never>>> {
    return this.respond("AEPS cash deposit", params.amount, {});
  }

  aepsTransactionOtp(
    params: AepsTxnOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>> {
    // Mock OTP dispatch — mock flow accepts any 6-digit OTP typed at capture time.
    return this.respond("AEPS transaction OTP", undefined, {
      referenceKey: `MOCKOTP-${randomUUID().slice(0, 16)}`,
      validity: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  }

  aepsMiniStatement(
    params: AepsParams,
  ): Promise<ProviderResult<{ statement: { date: string; narration: string; amount: string; type: "credit" | "debit" }[] }>> {
    return this.respond("AEPS mini statement", undefined, {
      statement: [
        { date: "2026-07-10", narration: "UPI/CREDIT/9012", amount: "1500.00", type: "credit" },
        { date: "2026-07-09", narration: "ATM/WDL/4432", amount: "500.00", type: "debit" },
        { date: "2026-07-07", narration: "NEFT/SALARY", amount: "18000.00", type: "credit" },
      ],
    });
  }

  aadhaarPay(params: AepsParams): Promise<ProviderResult<Record<string, never>>> {
    return this.respond("Aadhaar Pay", params.amount, {});
  }

  aepsBankList(_params: AepsBankListParams): Promise<ProviderResult<{ banks: AepsBank[] }>> {
    // Real NPCI IINs so mock selection matches live behaviour; extend as needed.
    const banks: AepsBank[] = [
      { bankId: 109005, name: "STATE BANK OF INDIA", iin: "607094", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "33", aadhaarpayFailureRate: "45" },
      { bankId: 74984, name: "Punjab National Bank", iin: "607027", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "16", aadhaarpayFailureRate: "71" },
      { bankId: 39287, name: "BANK OF BARODA", iin: "606985", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "32", aadhaarpayFailureRate: "78" },
      { bankId: 11263, name: "HDFC Bank", iin: "607152", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "27", aadhaarpayFailureRate: "100" },
      { bankId: 15910, name: "ICICI Bank", iin: "508534", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "58", aadhaarpayFailureRate: "100" },
      { bankId: 1, name: "AIRTEL PAYMENTS BANK", iin: "990320", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "18", aadhaarpayFailureRate: "50" },
      { bankId: 96035, name: "UCO BANK", iin: "607066", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "22", aadhaarpayFailureRate: "100" },
      { bankId: 47267, name: "BANK OF INDIA", iin: "508505", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "33", aadhaarpayFailureRate: "50" },
      { bankId: 53201, name: "CANARA BANK", iin: "607396", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "24", aadhaarpayFailureRate: "0" },
      { bankId: 20500, name: "INDIAN BANK", iin: "607105", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "30", aadhaarpayFailureRate: "67" },
      { bankId: 91606, name: "UNION BANK OF INDIA", iin: "607161", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "32", aadhaarpayFailureRate: "0" },
      { bankId: 106167, name: "PUNJAB AND SIND BANK", iin: "607087", aepsEnabled: true, aadhaarpayEnabled: true, aepsFailureRate: "26", aadhaarpayFailureRate: "100" },
    ];
    return this.respond("AEPS bank list", undefined, { banks });
  }

  dmtBankList(_params: DmtBankListParams): Promise<ProviderResult<{ banks: DmtBank[] }>> {
    const banks: DmtBank[] = [
      { bankId: 109005, name: "STATE BANK OF INDIA", ifscAlias: "SBIN", ifscGlobal: "SBIN0000001", neftEnabled: true, impsEnabled: true, upiEnabled: false, neftFailureRate: "0", impsFailureRate: "0", upiFailureRate: "0" },
      { bankId: 11263, name: "HDFC BANK", ifscAlias: "HDFC", ifscGlobal: "HDFC0999999", neftEnabled: true, impsEnabled: true, upiEnabled: false, neftFailureRate: "0", impsFailureRate: "0", upiFailureRate: "0" },
      { bankId: 15910, name: "ICICI Bank", ifscAlias: "ICIC", ifscGlobal: "ICIC0000011", neftEnabled: true, impsEnabled: true, upiEnabled: false, neftFailureRate: "0", impsFailureRate: "0", upiFailureRate: "0" },
      { bankId: 130878, name: "Axis Bank", ifscAlias: "UTIB", ifscGlobal: "UTIB0000248", neftEnabled: true, impsEnabled: true, upiEnabled: false, neftFailureRate: "0", impsFailureRate: "0", upiFailureRate: "0" },
      { bankId: 74984, name: "PUNJAB NATIONAL BANK", ifscAlias: "PUNB", ifscGlobal: "PUNB0244200", neftEnabled: true, impsEnabled: true, upiEnabled: false, neftFailureRate: "0", impsFailureRate: "0", upiFailureRate: "0" },
      { bankId: 39287, name: "BANK OF BARODA", ifscAlias: "BARB", ifscGlobal: "BARB0HEADOF", neftEnabled: true, impsEnabled: true, upiEnabled: false, neftFailureRate: "0", impsFailureRate: "0", upiFailureRate: "0" },
    ];
    return this.respond("DMT bank list", undefined, { banks });
  }

  nepalStaticData(
    params: NepalStaticDataParams,
  ): Promise<ProviderResult<{ items: NepalStaticOption[]; type: NepalStaticDataType }>> {
    const MOCK: Record<NepalStaticDataType, NepalStaticOption[]> = {
      Gender: [
        { label: "Male", value: "Male" },
        { label: "Female", value: "Female" },
        { label: "Other", value: "Other" },
      ],
      Nationality: [
        { label: "Indian", value: "Indian" },
        { label: "Nepalese", value: "Nepalese" },
      ],
      IDType: [
        { label: "Aadhaar Card", value: "Aadhaar Card" },
        { label: "Indian Driving License", value: "Indian Driving License" },
        { label: "Nepalese Citizenship", value: "Nepalese Citizenship" },
        { label: "Nepalese Passport", value: "Nepalese Passport" },
      ],
      IncomeSource: [
        { label: "Salary", value: "Salary" },
        { label: "Business", value: "Business" },
        { label: "Other", value: "Other" },
      ],
      Relationship: [
        { label: "Self", value: "Self" },
        { label: "Spouse", value: "Spouse" },
        { label: "Parent", value: "Parent" },
        { label: "Sibling", value: "Sibling" },
        { label: "Friend", value: "Friend" },
        { label: "Other", value: "Other" },
      ],
      PaymentMode: [
        { label: "Cash Pickup", value: "Cash Pickup" },
        { label: "Bank Deposit", value: "Bank Deposit" },
      ],
      RemittanceReason: [
        { label: "Family Support", value: "Family Support" },
        { label: "Education", value: "Education" },
        { label: "Medical", value: "Medical" },
        { label: "Other", value: "Other" },
      ],
    };
    return this.respond("Nepal static data", undefined, {
      type: params.type,
      items: MOCK[params.type] ?? [],
    });
  }

  nepalPaymentLocationList(
    params: NepalPaymentLocationListParams,
  ): Promise<ProviderResult<{ locations: NepalPaymentLocation[] }>> {
    const cash: NepalPaymentLocation = {
      locationId: 0,
      locationName: "Prabhu Bank Limited",
      bankBranchId: 0,
      bankName: "",
      branchName: "-",
      branchCode: "-",
      routingCode: "-",
      country: "Nepal",
      address: "Payment at any Cash Pickup agent of Prabhu Bank, Prabhu Money Transfer, Prabhu Management",
      state: params.state ?? "",
      district: params.district ?? "",
      city: "",
      phoneNumber: "",
    };
    const account: NepalPaymentLocation = {
      locationId: 101,
      locationName: "MOCK Nepal Bank Ltd",
      bankBranchId: 201,
      bankName: "MOCK Nepal Bank Ltd",
      branchName: "Kathmandu Main",
      branchCode: "KTM01",
      routingCode: "MOCK001",
      country: "Nepal",
      address: "Kathmandu Durbar Marg",
      state: params.state || "Bagmati",
      district: params.district || "Kathmandu",
      city: "Kathmandu",
      phoneNumber: "9800000000",
    };
    return this.respond("Nepal payment locations", undefined, {
      locations: params.type === "CASHPAY" ? [cash] : [account],
    });
  }

  nepalStateDistrict(
    params: NepalStateDistrictParams,
  ): Promise<ProviderResult<{ items: NepalStateDistrict[] }>> {
    const country = params.country.trim().toLowerCase();
    const india: NepalStateDistrict[] = [
      { state: "Haryana", district: "Faridabad", stateCode: "HR" },
      { state: "Haryana", district: "Gurgaon", stateCode: "HR" },
      { state: "Delhi", district: "New Delhi", stateCode: "DL" },
      { state: "Uttar Pradesh", district: "Noida", stateCode: "UP" },
      { state: "Maharashtra", district: "Mumbai City", stateCode: "MH" },
      { state: "Karnataka", district: "Bangalore Urban", stateCode: "KA" },
    ];
    const nepal: NepalStateDistrict[] = [
      { state: "Bagmati", district: "Kathmandu", stateCode: "BA" },
      { state: "Bagmati", district: "Lalitpur", stateCode: "BA" },
      { state: "Gandaki", district: "Kaski", stateCode: "GA" },
      { state: "Koshi", district: "Morang", stateCode: "KO" },
    ];
    return this.respond("Nepal state district", undefined, {
      items: country.includes("nepal") ? nepal : india,
    });
  }

  nepalOutletStatus(
    params: NepalOutletStatusParams,
  ): Promise<ProviderResult<{ outlet: NepalOutletStatus }>> {
    // checkOtpStatus=true → simulate OTP done → ready.
    if (params.checkOtpStatus) {
      const outlet: NepalOutletStatus = {
        statuscode: "TXN",
        actcode: null,
        message: "Transaction Successful",
        cspStatus: "APPROVED",
        cspCode: "MOCK-CSP-001",
        ready: true,
      };
      return this.respond("Nepal outlet status", undefined, { outlet });
    }
    const outlet: NepalOutletStatus = {
      statuscode: "TXN",
      actcode: null,
      message: "Transaction Successful",
      cspStatus: "APPROVED",
      cspCode: "MOCK-CSP-001",
      ready: true,
    };
    return this.respond("Nepal outlet status", undefined, { outlet });
  }

  nepalOutletRegistration(
    _params: NepalOutletRegistrationParams,
  ): Promise<ProviderResult<{ registration: NepalOutletRegistrationResult }>> {
    const registration: NepalOutletRegistrationResult = {
      statuscode: "TUP",
      actcode: "OUTLETEKYC",
      message: "Outlet registered successfully, Kindly initiate E-Kyc",
      needsEkyc: true,
    };
    return this.respond("Nepal outlet registration", undefined, { registration });
  }

  nepalOutletEkycInitiate(
    _params: NepalOutletEkycInitiateParams,
  ): Promise<ProviderResult<{ ekyc: NepalOutletEkycInitiateResult }>> {
    const ekyc: NepalOutletEkycInitiateResult = {
      statuscode: "TXN",
      actcode: null,
      message: "Transaction Successful",
      redirectUrl: "https://example.com/mock-nepal-ekyc?ref=MOCK",
    };
    return this.respond("Nepal outlet eKYC initiate", undefined, { ekyc });
  }

  nepalOutletEkycInitiateStatus(
    _params: NepalOutletEkycInitiateStatusParams,
  ): Promise<ProviderResult<{ ekycStatus: NepalOutletEkycInitiateStatusResult }>> {
    const ekycStatus: NepalOutletEkycInitiateStatusResult = {
      statuscode: "TXN",
      actcode: null,
      message: "Transaction Successful",
      ready: true,
      data: null,
    };
    return this.respond("Nepal outlet eKYC status", undefined, { ekycStatus });
  }

  nepalOutletEkycProcess(
    _params: NepalOutletEkycProcessParams,
  ): Promise<ProviderResult<{ process: NepalOutletEkycProcessResult }>> {
    const process: NepalOutletEkycProcessResult = {
      statuscode: "TXN",
      actcode: null,
      message: "Transaction Successful",
      success: true,
    };
    return this.respond("Nepal outlet eKYC process", undefined, { process });
  }

  nepalRemitterProfile(
    params: NepalRemitterProfileParams,
  ): Promise<ProviderResult<{ profile: NepalRemitterProfile | null }>> {
    // Mobile ending in 0000 → not registered (UI can test registration path).
    if (params.customerMobile.endsWith("0000")) {
      return this.respond("Nepal remitter profile", undefined, { profile: null });
    }
    const profile: NepalRemitterProfile = {
      id: "675738",
      mobile: params.customerMobile,
      firstName: "Sample Name",
      gender: "Male",
      dob: "1993-11-12",
      address: "Sample Address",
      city: "City Name",
      state: "State Name",
      district: "District Name",
      nationality: "Indian",
      employer: "Business Name",
      incomeSource: "Salary",
      status: "Verified",
      eKycStatus: "Unverified",
      onboardingStatus: "Pending",
      approveStatus: "",
      approveComment: "",
      ids: [{ idType: "Aadhaar Card", idNumber: "XXXXXXXX6077" }],
      transactionCount: { day: "0", month: "0", year: "0" },
      beneficiaries: [],
    };
    return this.respond("Nepal remitter profile", undefined, { profile });
  }

  nepalOtpRequest(
    _params: NepalOtpRequestParams,
  ): Promise<ProviderResult<{ otpReference: string }>> {
    return this.respond("Nepal OTP request", undefined, {
      otpReference: randomUUID(),
    });
  }

  nepalRemitterRegistration(
    params: NepalRemitterRegistrationParams,
  ): Promise<ProviderResult<{ profile: NepalRemitterProfile }>> {
    const profile: NepalRemitterProfile = {
      id: "649881",
      mobile: params.mobile,
      firstName: params.name,
      gender: params.gender,
      dob: params.dob,
      address: params.address,
      city: params.city,
      state: params.state,
      district: params.district,
      nationality: params.nationality,
      employer: params.employer,
      incomeSource: params.incomeSource,
      status: "Unverified",
      eKycStatus: "",
      onboardingStatus: "",
      approveStatus: "Commented",
      approveComment: "Customer ID Copy Not Uploaded",
      ids: [{ idType: params.idType, idNumber: "XXXXXXXX5677" }],
      transactionCount: { day: "0", month: "0", year: "0" },
      beneficiaries: [],
    };
    return this.respond("Nepal remitter registration", undefined, { profile });
  }

  nepalRemitterEkycInitiate(
    params: NepalRemitterEkycInitiateParams,
  ): Promise<ProviderResult<{ ekyc: NepalRemitterEkycInitiateResult }>> {
    const ekyc: NepalRemitterEkycInitiateResult = {
      statuscode: "TXN",
      actcode: null,
      message: "Transaction Successful",
      referenceKey: `IILE1h-MOCK-${params.remitterId}-${randomUUID().slice(0, 8)}`,
      redirectUrl: "https://example.com/mock-remitter-ekyc",
    };
    return this.respond("Nepal remitter eKYC initiate", undefined, { ekyc });
  }

  nepalRemitterEkycInitiateStatus(
    _params: NepalRemitterEkycInitiateStatusParams,
  ): Promise<ProviderResult<{ ekycStatus: NepalRemitterEkycInitiateStatusResult }>> {
    const ekycStatus: NepalRemitterEkycInitiateStatusResult = {
      statuscode: "TXN",
      actcode: null,
      message: "Transaction Successful",
      ready: true,
      data: null,
    };
    return this.respond("Nepal remitter eKYC status", undefined, { ekycStatus });
  }

  nepalRemitterEkycProcess(
    _params: NepalRemitterEkycProcessParams,
  ): Promise<ProviderResult<{ process: NepalOutletEkycProcessResult }>> {
    const process: NepalOutletEkycProcessResult = {
      statuscode: "TXN",
      actcode: null,
      message: "Transaction Successful",
      success: true,
    };
    return this.respond("Nepal remitter eKYC process", undefined, { process });
  }

  nepalRemitterUpdate(
    _params: NepalRemitterUpdateParams,
  ): Promise<ProviderResult<{ update: NepalRemitterUpdateResult }>> {
    const update: NepalRemitterUpdateResult = {
      statuscode: "TXN",
      actcode: null,
      message: "Transaction Successful",
      success: true,
    };
    return this.respond("Nepal remitter update", undefined, { update });
  }

  nepalBeneficiaryRegistration(
    params: NepalBeneficiaryRegistrationParams,
  ): Promise<ProviderResult<{ profile: NepalRemitterProfile; beneficiaryId: string }>> {
    const beneficiaryId = "1036010";
    const profile: NepalRemitterProfile = {
      id: "649717",
      mobile: params.remitterMobile,
      firstName: "Sample Name",
      gender: "Male",
      dob: "1995-01-01",
      address: "Sample Address",
      city: "City Name",
      state: "State Name",
      district: "District Name",
      nationality: "Indian",
      employer: "Business Name",
      incomeSource: "Business",
      status: "Unverified",
      eKycStatus: "",
      onboardingStatus: "",
      approveStatus: "Commented",
      approveComment: "PHOTO IS NOT CLEAR",
      ids: [{ idType: "Aadhaar Card", idNumber: "XXXXXXXX6077" }],
      transactionCount: { day: "0", month: "0", year: "0" },
      beneficiaries: [
        {
          id: beneficiaryId,
          name: params.name,
          gender: params.gender,
          relationship: params.relationship,
          address: params.address,
          mobile: params.mobile,
          paymentMode: params.paymentMode,
          bankBranchId: params.bankBranchId ?? "",
          bankName: "",
          bankBranchName: "",
          acNumber: params.accountNumber ?? "",
        },
      ],
    };
    return this.respond("Nepal beneficiary registration", undefined, { profile, beneficiaryId });
  }

  nepalServiceCharge(
    params: NepalServiceChargeParams,
  ): Promise<ProviderResult<{ quote: NepalServiceChargeQuote }>> {
    const transferInr = params.transferAmount?.trim() || "1000";
    const rate = 1.6;
    const payout =
      params.payoutAmount?.trim() ||
      String(Math.round(Number(transferInr) * rate));
    const serviceCharge = "40";
    const collectionAmount = String(Number(transferInr) + Number(serviceCharge));
    const quote: NepalServiceChargeQuote = {
      transferAmount: transferInr,
      serviceCharge,
      collectionAmount,
      collectionCurrency: "INR",
      exchangeRate: String(rate),
      payoutAmount: payout,
      payoutCurrency: "NPR",
    };
    return this.respond("Nepal service charge", undefined, { quote });
  }

  nepalFundTransfer(params: NepalFundTransferParams): Promise<ProviderResult> {
    const rate = 1.6;
    const payout = (Number(params.transferAmount) * rate).toFixed(2);
    return this.respond("Nepal fund transfer", params.transferAmount, {
      externalRef: params.externalRef ?? `MOCK-NP-${randomUUID().slice(0, 8)}`,
      poolReferenceId: `MOCK-POOL-${randomUUID().slice(0, 8)}`,
      txnReferenceId: "00",
      beneficiaryName: "MOCK BENEFICIARY",
      exchangeRate: String(rate),
      payoutAmount: payout,
      payoutCurrency: "NPR",
    });
  }

  nepalFetchTransactionStatus(
    params: NepalFetchTransactionStatusParams,
  ): Promise<ProviderResult<{ txnStatus: NepalFetchTransactionStatusResult }>> {
    const txnStatus: NepalFetchTransactionStatusResult = {
      statuscode: "TXN",
      actcode: null,
      message: "Transaction Successful",
      ready: true,
      data: null,
    };
    return this.respond("Nepal fetch txn status", undefined, {
      txnStatus,
      ipayId: params.ipayId,
    });
  }

  dmtRemitterProfile(
    params: DmtRemitterProfileParams,
  ): Promise<ProviderResult<{ profile: DmtRemitterProfile | null }>> {
    // Mobile ending in 0000 → not registered (UI can test registration path).
    if (params.customerMobile.endsWith("0000")) {
      return this.respond("DMT remitter profile", undefined, {
        profile: null,
        referenceKey: `MOCK-REGKEY-${randomUUID().slice(0, 8)}`,
        validity: "2099-12-31 23:59:59",
      });
    }
    const profile: DmtRemitterProfile = {
      registered: true,
      mobileNumber: params.customerMobile,
      firstName: "Test",
      lastName: "Remitter",
      city: "Faridabad",
      pincode: "121009",
      limitPerTransaction: "5000",
      limitTotal: "25000.00",
      limitConsumed: "0.00",
      limitAvailable: "25000.00",
      limitDetails: {
        maximumDailyLimit: "25000.00",
        consumedDailyLimit: "0.00",
        availableDailyLimit: "25000.00",
        maximumMonthlyLimit: "25000.00",
        consumedMonthlyLimit: "0.00",
        availableMonthlyLimit: "25000.00",
      },
      beneficiaries: [
        {
          id: `BENE-${randomUUID().slice(0, 12)}`,
          name: "Test Beneficiary",
          account: "07160150991234",
          ifsc: "ICIC0000716",
          bank: "ICICI BANK LIMITED",
          beneficiaryMobileNumber: "8860622709",
          verificationDt: "2025-02-25 11:13:33",
        },
      ],
      isTxnOtpRequired: true,
      isTxnBioAuthRequired: false,
      isImpsAllowed: true,
      isNeftAllowed: true,
      isFaceAuthAvailable: true,
      referenceKey: `MOCK-REF-${randomUUID().slice(0, 8)}`,
      validity: "2099-12-31 23:59:59",
      pidOptionWadh: "",
    };
    return this.respond("DMT remitter profile", undefined, { profile });
  }

  dmtRemitterRegister(
    _params: DmtRemitterRegistrationParams,
  ): Promise<ProviderResult<{ otpReference: string }>> {
    return this.respond("DMT remitter registration OTP", undefined, {
      otpReference: `MOCK-OTPREF-${randomUUID().slice(0, 12)}`,
    });
  }

  dmtRemitterRegisterVerify(
    _params: DmtRemitterRegistrationVerifyParams,
  ): Promise<ProviderResult<{ referenceId: string }>> {
    return this.respond("DMT remitter registration verify", undefined, {
      referenceId: `MOCK-REGREF-${randomUUID().slice(0, 12)}`,
    });
  }

  dmtRemitterKyc(_params: DmtRemitterKycParams): Promise<ProviderResult<{ poolReferenceId: string }>> {
    return this.respond("DMT remitter eKYC", undefined, {
      poolReferenceId: `MOCK-KYCREF-${randomUUID().slice(0, 12)}`,
    });
  }

  dmtAddBeneficiary(
    params: DmtBeneficiaryParams,
  ): Promise<ProviderResult<{ beneficiaryId: string; referenceKey: string; validity: string }>> {
    return this.respond("DMT add beneficiary", undefined, {
      beneficiaryId: `BENE-${randomUUID().slice(0, 8)}`,
      referenceKey: `MOCK-BENKEY-${randomUUID().slice(0, 12)}`,
      validity: new Date(Date.now() + 15 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19),
    });
  }

  dmtAddBeneficiaryVerify(
    params: DmtBeneficiaryVerifyParams,
  ): Promise<ProviderResult<{ beneficiaryId: string }>> {
    return this.respond("DMT beneficiary registration verify", undefined, {
      beneficiaryId: params.beneficiaryId,
    });
  }

  dmtDeleteBeneficiary(
    params: DmtBeneficiaryDeleteParams,
  ): Promise<ProviderResult<{ beneficiaryId: string; referenceKey: string; validity: string }>> {
    return this.respond("DMT delete beneficiary", undefined, {
      beneficiaryId: params.beneficiaryId,
      referenceKey: `MOCK-BENDELKEY-${randomUUID().slice(0, 12)}`,
      validity: new Date(Date.now() + 15 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19),
    });
  }

  dmtDeleteBeneficiaryVerify(
    params: DmtBeneficiaryVerifyParams,
  ): Promise<ProviderResult<{ beneficiaryId: string }>> {
    return this.respond("DMT delete beneficiary verify", undefined, {
      beneficiaryId: params.beneficiaryId,
    });
  }

  dmtGenerateTransactionOtp(
    _params: DmtTransactionOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>> {
    return this.respond("DMT transaction OTP", undefined, {
      referenceKey: `MOCK-TXNOTPKEY-${randomUUID().slice(0, 12)}`,
      validity: new Date(Date.now() + 15 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19),
    });
  }

  dmtTransactionRefundOtp(
    _params: DmtRefundOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>> {
    return this.respond("DMT refund OTP", undefined, {
      referenceKey: `MOCK-REFUNDOTPKEY-${randomUUID().slice(0, 12)}`,
      validity: new Date(Date.now() + 15 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19),
    });
  }

  dmtTransactionRefund(params: DmtRefundParams): Promise<ProviderResult> {
    return this.respond("DMT transaction refund", undefined, { ipayId: params.ipayId });
  }

  dmtTransfer(params: DmtTransferParams): Promise<ProviderResult> {
    return this.respond("DMT transfer", params.amount, {
      externalRef: params.externalRef ?? `MOCK-DT-${randomUUID().slice(0, 8)}`,
      txnReferenceId: `MOCK-RRN-${randomUUID().slice(0, 12)}`,
      poolReferenceId: `MOCK-POOL-${randomUUID().slice(0, 8)}`,
      beneficiaryName: "MOCK BENEFICIARY",
    });
  }

  bbpsFetchBill(
    params: BbpsFetchBillParams,
  ): Promise<ProviderResult<{ billFetchRef: string; customerName: string; billAmount: string; dueDate: string }>> {
    return this.respond("BBPS bill fetch", undefined, {
      billFetchRef: `BILL-${randomUUID().slice(0, 8)}`,
      customerName: "MOCK CONSUMER",
      billAmount: "1240.00",
      dueDate: "2026-07-25",
    });
  }

  bbpsPayBill(params: BbpsPayBillParams): Promise<ProviderResult<Record<string, never>>> {
    return this.respond("BBPS bill payment", params.amount, {});
  }

  recharge(params: RechargeParams): Promise<ProviderResult<Record<string, never>>> {
    return this.respond("Recharge", params.amount, {});
  }

  checkStatus(params: CheckStatusParams): Promise<ProviderResult<Record<string, never>>> {
    // Mock: anything re-checked is confirmed successful, so pending flows can be
    // driven to completion from the UI.
    return this.respond("Status check", undefined, {});
  }

  agentAuth(params: AgentAuthParams): Promise<ProviderResult<Record<string, never>>> {
    return this.respond("Agent authentication", undefined, {});
  }
}
