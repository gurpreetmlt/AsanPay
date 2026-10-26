import { randomUUID } from "node:crypto";
import { isNobleConfigured } from "../../../config/env";
import { HttpError } from "../../../utils/httpError";
import {
  assertNobleDmtOk,
  airtelGetCustomer,
  nobleBeneList,
  type NobleBene,
  rememberDmtAccessToken,
  rememberDmtVerifyToken,
  requireAccessToken,
  requireSessionToken,
  requireVerifyToken,
  resolveAirtelMerchantCtx,
  rowToken,
} from "../noble/airtelDmt";
import {
  firstResponseRow,
  nobleDeviceBody,
  nobleOk,
  nobleTxnId,
  requireNobleGeo,
  resolveNobleAgentContext,
} from "../noble/aepsOps";
import { noblePost, type NobleApiResponse } from "../noble/client";
import { resolveRechargeRoute } from "../noble/rechargeOperators";
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
  DmtRemitterKycParams,
  DmtRemitterProfile,
  DmtRemitterProfileParams,
  DmtRemitterRegistrationParams,
  DmtRemitterRegistrationVerifyParams,
  DmtTransactionOtpParams,
  DmtTransferParams,
  ProviderAdapter,
  ProviderResult,
  ProviderTxnStatus,
  RechargeParams,
} from "../types";

/**
 * Primary AEPS provider — AEPS family (CW / BE / MS + daily 2FA).
 * Load-agent / merchant KYC are separate HTTP routes under /api/onboarding/noble/aeps/*.
 * Non-AEPS rails throw 501 until wired.
 */
export class NobleAdapter implements ProviderAdapter {
  readonly code = "noble";
  readonly isStub = false;

  private notImplemented(op: string): never {
    throw new HttpError(501, `${op} is not available on this provider yet`, "PROVIDER_NOT_IMPLEMENTED");
  }

  private mapTxnStatus(row: Record<string, unknown>, json: NobleApiResponse): ProviderTxnStatus {
    const tran = String(row.tranStatus ?? "").toLowerCase();
    if (tran === "success" || tran === "successful") return "success";
    if (tran === "pending" || tran === "processing") return "pending";
    if (tran === "failed" || tran === "failure" || tran === "expired") return "failed";
    if (json.status === 1) return "success";
    if (json.status === 0) return "failed";
    return "failed";
  }

  private toResult<T extends Record<string, unknown>>(
    httpStatus: number,
    json: NobleApiResponse,
    operation: string,
    amount: string | null,
    data: T,
  ): ProviderResult<T> {
    const row = firstResponseRow(json);
    const status = this.mapTxnStatus(row, json);
    const ok = nobleOk(json, httpStatus) && status !== "failed";
    const providerTxnId =
      (typeof row.apiTransactionId === "string" && row.apiTransactionId) ||
      (typeof row.transactionId === "string" && row.transactionId) ||
      null;
    const message =
      (typeof json.description === "string" && json.description) ||
      (typeof json.message === "string" && json.message) ||
      `${operation} — no message from provider`;
    return {
      success: ok && status === "success",
      status: ok ? status : "failed",
      providerTxnId,
      amount,
      message,
      data: { ...data, ...row } as T,
      raw: json as unknown as Record<string, unknown>,
    };
  }

  /** Static fallback — provider docs do not expose a bank-list endpoint in AEPS V2. */
  async aepsBankList(_params: AepsBankListParams): Promise<ProviderResult<{ banks: AepsBank[] }>> {
    const banks: AepsBank[] = [
      {
        bankId: "SBI",
        name: "STATE BANK OF INDIA",
        iin: "607094",
        aepsEnabled: true,
        aadhaarpayEnabled: true,
        aepsFailureRate: "0",
        aadhaarpayFailureRate: "0",
      },
      {
        bankId: "PNB",
        name: "PUNJAB NATIONAL BANK",
        iin: "607027",
        aepsEnabled: true,
        aadhaarpayEnabled: true,
        aepsFailureRate: "0",
        aadhaarpayFailureRate: "0",
      },
      {
        bankId: "ICICI",
        name: "ICICI BANK",
        iin: "508534",
        aepsEnabled: true,
        aadhaarpayEnabled: true,
        aepsFailureRate: "0",
        aadhaarpayFailureRate: "0",
      },
    ];
    return {
      success: true,
      status: "success",
      providerTxnId: null,
      amount: null,
      message: "Static bank list",
      data: { banks },
      raw: { static: true },
    };
  }

  async agentAuth(params: AgentAuthParams): Promise<ProviderResult> {
    const ctx = await resolveNobleAgentContext(params);
    requireNobleGeo(ctx);
    if (!ctx.live) {
      // Onboarding mock id without Coolify keys — unlock local day for UI testing only.
      return {
        success: true,
        status: "success",
        providerTxnId: `MOCK-2FA-${randomUUID().slice(0, 8)}`,
        amount: null,
        message: "Daily 2FA recorded locally (provider keys not configured)",
        data: {},
        raw: { mock: true },
      };
    }
    const transactionId = params.externalRef || nobleTxnId("N2F");
    const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/daily_2fa", {
      ...nobleDeviceBody(ctx),
      transactionId,
      serviceType: "AEPS",
      bioType: "0",
      pidData: params.biometricPayload,
    });
    return this.toResult(httpStatus, json, "Daily 2FA", null, {});
  }

  async aepsBalanceEnquiry(params: AepsParams): Promise<ProviderResult<{ balance: string }>> {
    const ctx = await resolveNobleAgentContext(params);
    requireNobleGeo(ctx);
    this.assertLive(ctx.live);
    const transactionId = params.externalRef || nobleTxnId("NBE");
    const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/transaction", {
      ...nobleDeviceBody(ctx),
      transactionId,
      tranType: "BE",
      amount: "0",
      bankName: `BANK ${params.bankIin}`,
      bankIn: params.bankIin,
      mobileNumber: params.mobile,
      aadhaarNumber: params.aadhaarNumber,
      isOtp: "0",
      otpReference: "",
      bioType: "0",
      pidData: params.biometricPayload,
    });
    const row = firstResponseRow(json);
    const balance = String(row.balance ?? "0");
    return this.toResult(httpStatus, json, "AEPS balance enquiry", null, { balance });
  }

  async aepsTransactionOtp(
    params: AepsTxnOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>> {
    const ctx = await resolveNobleAgentContext(params);
    requireNobleGeo(ctx);
    this.assertLive(ctx.live);
    const transactionId = nobleTxnId("NOTP");
    const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/generate_otp", {
      ...nobleDeviceBody(ctx),
      transactionId,
      tranType: "CW",
      amount: params.amount,
      bankIn: params.bankIin,
      mobileNumber: params.mobile,
      aadhaarNumber: params.aadhaarNumber,
    });
    const row = firstResponseRow(json);
    const referenceKey = String(row.otpReference ?? "");
    return this.toResult(httpStatus, json, "AEPS transaction OTP", null, {
      referenceKey,
      validity: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  }

  async aepsWithdraw(params: AepsParams): Promise<ProviderResult> {
    const ctx = await resolveNobleAgentContext(params);
    requireNobleGeo(ctx);
    this.assertLive(ctx.live);
    const transactionId = params.externalRef || nobleTxnId("NCW");
    const isOtp = params.otpReferenceKey ? "1" : "0";
    const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/transaction", {
      ...nobleDeviceBody(ctx),
      transactionId,
      tranType: "CW",
      amount: params.amount ?? "0",
      bankName: `BANK ${params.bankIin}`,
      bankIn: params.bankIin,
      mobileNumber: params.mobile,
      aadhaarNumber: params.aadhaarNumber,
      isOtp,
      otpReference: params.otpReferenceKey ?? "",
      bioType: "0",
      pidData: params.biometricPayload,
    });
    return this.toResult(httpStatus, json, "AEPS cash withdrawal", params.amount ?? null, {
      clientTransactionId: transactionId,
    });
  }

  async aepsMiniStatement(
    params: AepsParams,
  ): Promise<
    ProviderResult<{
      statement: { date: string; narration: string; amount: string; type: "credit" | "debit" }[];
    }>
  > {
    const ctx = await resolveNobleAgentContext(params);
    requireNobleGeo(ctx);
    this.assertLive(ctx.live);
    const transactionId = params.externalRef || nobleTxnId("NMS");
    const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/transaction", {
      ...nobleDeviceBody(ctx),
      transactionId,
      tranType: "MS",
      amount: "0",
      bankName: `BANK ${params.bankIin}`,
      bankIn: params.bankIin,
      mobileNumber: params.mobile,
      aadhaarNumber: params.aadhaarNumber,
      isOtp: "0",
      otpReference: "",
      bioType: "0",
      pidData: params.biometricPayload,
    });
    const row = firstResponseRow(json);
    const rawList = Array.isArray(row.miniStatement)
      ? row.miniStatement
      : Array.isArray(row.statement)
        ? row.statement
        : [];
    const statement = (rawList as Record<string, unknown>[]).map((r) => ({
      date: String(r.date ?? r.txnDate ?? ""),
      narration: String(r.narration ?? r.remark ?? ""),
      amount: String(r.amount ?? "0"),
      type: (String(r.type ?? "").toLowerCase() === "credit" ? "credit" : "debit") as
        | "credit"
        | "debit",
    }));
    return this.toResult(httpStatus, json, "AEPS mini statement", null, { statement });
  }

  async aepsDeposit(params: AepsParams): Promise<ProviderResult> {
    const ctx = await resolveNobleAgentContext(params);
    requireNobleGeo(ctx);
    this.assertLive(ctx.live);
    const transactionId = params.externalRef || nobleTxnId("NCD");
    const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/cd_transaction", {
      ...nobleDeviceBody(ctx),
      transactionId,
      tranType: "CD",
      amount: params.amount ?? "0",
      bankName: `BANK ${params.bankIin}`,
      bankIn: params.bankIin,
      mobileNumber: params.mobile,
      aadhaarNumber: params.aadhaarNumber,
      bioType: "0",
      pidData: params.biometricPayload,
    });
    return this.toResult(httpStatus, json, "AEPS cash deposit", params.amount ?? null, {
      clientTransactionId: transactionId,
    });
  }

  async aadhaarPay(params: AepsParams): Promise<ProviderResult> {
    const ctx = await resolveNobleAgentContext(params);
    requireNobleGeo(ctx);
    this.assertLive(ctx.live);
    const transactionId = params.externalRef || nobleTxnId("NAP");
    const isOtp = params.otpReferenceKey ? "1" : "0";
    const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/ap_transaction", {
      ...nobleDeviceBody(ctx),
      transactionId,
      tranType: "MT",
      amount: params.amount ?? "0",
      bankName: `BANK ${params.bankIin}`,
      bankIn: params.bankIin,
      mobileNumber: params.mobile,
      aadhaarNumber: params.aadhaarNumber,
      isOtp,
      otpReference: params.otpReferenceKey ?? "",
      otpTransactionId: params.otpTransactionId ?? "",
      otpTransactionToken: params.otpTransactionToken ?? "",
      bioType: "0",
      pidData: params.biometricPayload,
    });
    return this.toResult(httpStatus, json, "Aadhaar Pay", params.amount ?? null, {
      clientTransactionId: transactionId,
    });
  }

  async checkStatus(params: CheckStatusParams): Promise<ProviderResult> {
    const transactionId = params.clientRef || params.providerTxnId;
    if (!transactionId) {
      throw new HttpError(400, "transactionId is required for status check", "NOBLE_TXN_ID_REQUIRED");
    }
    const code = String(params.serviceCode ?? "");
    if (code.startsWith("dmt") || code === "MONEY_TRANSFER") {
      const { httpStatus, json } = await noblePost("dmt", "/api/v1.0/airtel_dmt/transaction_status", {
        transactionId,
      });
      return this.toResult(httpStatus, json, "DMT status", null, {});
    }
    const istDate =
      params.txnDate || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    if (code.includes("recharge") || code === "MOBILE_PREPAID" || code === "DTH") {
      const { httpStatus, json } = await noblePost("recharge", "/v1.0/recharge/recharge_status", {
        statusBy: "TI_TD",
        apiTransactionId: "",
        transactionId: transactionId.slice(0, 25),
        transactionDate: istDate,
      });
      return this.toResult(httpStatus, json, "Recharge status", null, {});
    }
    const [yyyy, mm, dd] = istDate.split("-");
    const isCashDeposit = code === "aeps_cash_deposit" || code === "CASH_DEPOSIT";
    const { httpStatus, json } = await noblePost(
      "aeps",
      isCashDeposit ? "/v2.0/aeps/cd_transaction_status" : "/v2.0/aeps/transaction_status",
      { transactionId, transactionDate: `${dd}/${mm}/${yyyy}` },
    );
    return this.toResult(httpStatus, json, isCashDeposit ? "Cash deposit status" : "AEPS status", null, {});
  }

  /** Beneficiary list must never block remitter lookup or transfer — empty on provider error. */
  private async beneListSafe(customerMobile: string): Promise<NobleBene[]> {
    try {
      return await nobleBeneList(customerMobile);
    } catch {
      return [];
    }
  }

  private assertLive(live: boolean): void {
    if (live) return;
    throw new HttpError(
      503,
      "AEPS provider is not configured on the server. Contact support.",
      "NOBLE_NOT_CONFIGURED",
    );
  }

  async dmtBankList(_p: DmtBankListParams): Promise<ProviderResult<{ banks: DmtBank[] }>> {
    // Provider DMT has no live bank-list API in docs — UI can use IFSC + account entry.
    return {
      success: true,
      status: "success",
      providerTxnId: null,
      amount: null,
      message: "Enter the beneficiary bank IFSC manually",
      data: { banks: [] },
      raw: { static: true },
    };
  }

  async dmtRemitterRegister(
    params: DmtRemitterRegistrationParams,
  ): Promise<ProviderResult<{ otpReference: string }>> {
    const merchant = await resolveAirtelMerchantCtx(params.retailerUserId);
    const session = requireSessionToken(params.retailerUserId, params.customerMobile, params.referenceKey);
    const validate = await noblePost("dmt", "/api/v1.0/airtel_dmt/validate_aadhar", {
      mobileNumber: params.customerMobile,
      latitude: merchant.latitude,
      longitude: merchant.longitude,
      aadharNumber: params.aadhaarNumber,
      token: session,
    });
    // RS_OB_009 = already registered Aadhaar — still allow OTP path when eligible; hard-fail others.
    if (!nobleOk(validate.json, validate.httpStatus) && validate.json.statusCode !== "RS_OB_009") {
      assertNobleDmtOk(validate.httpStatus, validate.json, "Aadhaar validation failed");
    }
    const otpRes = await noblePost("dmt", "/api/v1.0/airtel_dmt/sender_registration_otp", {
      mobileNumber: params.customerMobile,
      latitude: merchant.latitude,
      longitude: merchant.longitude,
    });
    assertNobleDmtOk(otpRes.httpStatus, otpRes.json, "Registration OTP failed");
    const verifyToken = rowToken(otpRes.json);
    if (!verifyToken) {
      throw new HttpError(502, "Registration OTP succeeded but token is missing", "NOBLE_DMT_OTP_TOKEN_MISSING");
    }
    rememberDmtVerifyToken(params.retailerUserId, params.customerMobile, verifyToken);
    return {
      success: true,
      status: "success",
      providerTxnId: null,
      amount: null,
      message: String(otpRes.json.description || otpRes.json.message || "OTP sent to remitter mobile"),
      data: { otpReference: verifyToken },
      raw: otpRes.json as unknown as Record<string, unknown>,
    };
  }

  async dmtRemitterRegisterVerify(
    params: DmtRemitterRegistrationVerifyParams,
  ): Promise<ProviderResult<{ referenceId: string }>> {
    const merchant = await resolveAirtelMerchantCtx(params.retailerUserId);
    const verifyToken = requireVerifyToken(params.retailerUserId, params.customerMobile);
    const { httpStatus, json } = await noblePost(
      "dmt",
      "/api/v1.0/airtel_dmt/sender_registration_validate_otp",
      {
        mobileNumber: params.customerMobile,
        latitude: merchant.latitude,
        longitude: merchant.longitude,
        otp: params.otp,
        token: verifyToken,
      },
    );
    assertNobleDmtOk(httpStatus, json, "Registration OTP verification failed");
    const accessToken = rowToken(json);
    if (accessToken) rememberDmtAccessToken(params.retailerUserId, params.customerMobile, accessToken);
    return {
      success: true,
      status: "success",
      providerTxnId: null,
      amount: null,
      message: String(json.description || json.message || "Remitter registered"),
      data: { referenceId: accessToken || verifyToken },
      raw: json as unknown as Record<string, unknown>,
    };
  }

  async dmtRemitterKyc(params: DmtRemitterKycParams): Promise<ProviderResult<{ poolReferenceId: string }>> {
    const merchant = await resolveAirtelMerchantCtx(params.retailerUserId, {
      latitude: params.latitude,
      longitude: params.longitude,
    });
    const accessToken = requireAccessToken(
      params.retailerUserId,
      params.customerMobile,
      params.referenceKey,
    );
    const transactionId = params.externalRef || nobleTxnId("NDKY");
    const { httpStatus, json } = await noblePost("dmt", "/api/v1.0/airtel_dmt/sender_registration_ekyc", {
      mobileNumber: params.customerMobile,
      latitude: merchant.latitude,
      longitude: merchant.longitude,
      merchantMobileNo: merchant.merchantMobile,
      transactionId,
      token: accessToken,
      bioType: params.captureType === "FACE" ? "2" : "0",
      pidData: params.biometricPayload,
    });
    assertNobleDmtOk(httpStatus, json, "Remitter eKYC failed");
    const row = firstResponseRow(json);
    return {
      success: true,
      status: "success",
      providerTxnId: String(row.apiTransactionId ?? transactionId),
      amount: null,
      message: String(json.description || json.message || "Remitter eKYC success"),
      data: { poolReferenceId: String(row.poolReferenceId ?? row.apiTransactionId ?? transactionId) },
      raw: json as unknown as Record<string, unknown>,
    };
  }

  async dmtAddBeneficiary(
    params: DmtBeneficiaryParams,
  ): Promise<ProviderResult<{ beneficiaryId: string; referenceKey: string; validity: string }>> {
    const { httpStatus, json } = await noblePost("dmt", "/api/v1.0/bene/add", {
      remitterMobile: params.customerMobile,
      accountHolderName: params.name,
      accountNumber: params.accountNumber,
      ifsc: params.ifsc,
      bankName: params.bankId ? `BANK ${params.bankId}` : "BANK",
      beneficiaryMobile: params.beneficiaryMobile || params.customerMobile,
    });
    assertNobleDmtOk(httpStatus, json, "Add beneficiary failed");
    const row = firstResponseRow(json);
    const beneficiaryId = String(row.account_no ?? params.accountNumber);
    return {
      success: true,
      status: "success",
      providerTxnId: null,
      amount: null,
      message: String(json.message || "Beneficiary added"),
      data: {
        beneficiaryId,
        referenceKey: "",
        validity: "",
      },
      raw: json as unknown as Record<string, unknown>,
    };
  }

  async dmtAddBeneficiaryVerify(
    params: DmtBeneficiaryVerifyParams,
  ): Promise<ProviderResult<{ beneficiaryId: string }>> {
    // bene/add is single-step.
    return {
      success: true,
      status: "success",
      providerTxnId: null,
      amount: null,
      message: "Beneficiary already added",
      data: { beneficiaryId: params.beneficiaryId },
      raw: {},
    };
  }

  async dmtDeleteBeneficiary(
    params: DmtBeneficiaryDeleteParams,
  ): Promise<ProviderResult<{ beneficiaryId: string; referenceKey: string; validity: string }>> {
    // Beneficiary id is the account number; the provider also needs its IFSC to delete.
    const bene = (await this.beneListSafe(params.customerMobile)).find(
      (b) => b.accountNumber === params.beneficiaryId,
    );
    if (!bene?.ifsc) {
      throw new HttpError(
        404,
        "Beneficiary not found for this remitter. Search the remitter again to refresh the list.",
        "NOBLE_DMT_BENE_NOT_FOUND",
      );
    }
    const { httpStatus, json } = await noblePost("dmt", "/api/v1.0/bene/delete", {
      remitterMobile: params.customerMobile,
      accountNumber: params.beneficiaryId,
      ifsc: bene.ifsc,
    });
    assertNobleDmtOk(httpStatus, json, "Delete beneficiary failed");
    return {
      success: true,
      status: "success",
      providerTxnId: null,
      amount: null,
      message: String(json.message || "Beneficiary deleted"),
      data: { beneficiaryId: params.beneficiaryId, referenceKey: "", validity: "" },
      raw: json as unknown as Record<string, unknown>,
    };
  }

  async dmtDeleteBeneficiaryVerify(
    params: DmtBeneficiaryVerifyParams,
  ): Promise<ProviderResult<{ beneficiaryId: string }>> {
    return {
      success: true,
      status: "success",
      providerTxnId: null,
      amount: null,
      message: "Beneficiary already deleted",
      data: { beneficiaryId: params.beneficiaryId },
      raw: {},
    };
  }

  async dmtGenerateTransactionOtp(
    params: DmtTransactionOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>> {
    const merchant = await resolveAirtelMerchantCtx(params.retailerUserId);
    const transactionId = nobleTxnId("NDMT");
    const { httpStatus, json } = await noblePost("dmt", "/api/v1.0/airtel_dmt/transaction_otp", {
      mobileNumber: params.customerMobile,
      latitude: merchant.latitude,
      longitude: merchant.longitude,
      amount: params.amount,
      transactionId,
    });
    assertNobleDmtOk(httpStatus, json, "Transaction OTP failed");
    const token = rowToken(json);
    if (!token) {
      throw new HttpError(502, "Transaction OTP succeeded but token is missing", "NOBLE_DMT_TXN_OTP_TOKEN");
    }
    rememberDmtVerifyToken(params.retailerUserId, params.customerMobile, token);
    // Encode txn id into referenceKey so transfer can recover it (UI only stores referenceKey).
    const referenceKey = `${token}~${transactionId}`;
    return {
      success: true,
      status: "success",
      providerTxnId: transactionId,
      amount: null,
      message: String(json.description || json.message || "OTP sent"),
      data: {
        referenceKey,
        validity: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      raw: json as unknown as Record<string, unknown>,
    };
  }

  async dmtTransfer(params: DmtTransferParams): Promise<ProviderResult> {
    const merchant = await resolveAirtelMerchantCtx(params.retailerUserId, {
      latitude: params.latitude,
      longitude: params.longitude,
    });
    const [tokenPart, txnPart] = params.referenceKey.split("~");
    const token = tokenPart || requireVerifyToken(params.retailerUserId, params.customerMobile);
    const transactionId = (txnPart || params.externalRef || nobleTxnId("NDMT")).slice(0, 25);
    const bene = (await this.beneListSafe(params.customerMobile)).find(
      (b) => b.accountNumber === params.accountNumber,
    );
    const { httpStatus, json } = await noblePost(
      "dmt",
      "/api/v1.0/airtel_dmt/transaction_validate_otp",
      {
        mobileNumber: params.customerMobile,
        latitude: merchant.latitude,
        longitude: merchant.longitude,
        otp: params.otp,
        amount: params.amount,
        transactionId,
        token,
        retailerId: merchant.retailerCode,
        beneName: bene?.name || "Beneficiary",
        bankName: bene?.bank || "BANK",
        ifsc: params.ifsc,
        beneAccountNumber: params.accountNumber,
        beneMobileNumber: bene?.mobile || params.customerMobile,
        transferMode: params.mode.toUpperCase() === "NEFT" ? "NEFT" : "IMPS",
      },
    );
    return this.toResult(httpStatus, json, "DMT transfer", params.amount, {
      clientTransactionId: transactionId,
    });
  }

  dmtTransactionRefundOtp(
    _p: DmtRefundOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>> {
    this.notImplemented("dmtTransactionRefundOtp");
  }
  dmtTransactionRefund(_p: DmtRefundParams): Promise<ProviderResult> {
    this.notImplemented("dmtTransactionRefund");
  }

  bbpsFetchBill(
    _p: BbpsFetchBillParams,
  ): Promise<
    ProviderResult<{ billFetchRef: string; customerName: string; billAmount: string; dueDate: string }>
  > {
    this.notImplemented("bbpsFetchBill");
  }
  bbpsPayBill(_p: BbpsPayBillParams): Promise<ProviderResult> {
    this.notImplemented("bbpsPayBill");
  }
  async recharge(params: RechargeParams): Promise<ProviderResult> {
    if (!isNobleConfigured()) {
      throw new HttpError(
        503,
        "AEPS provider is not configured on the server. Contact support.",
        "NOBLE_NOT_CONFIGURED",
      );
    }
    const transactionId = (params.clientRef || nobleTxnId("NRC")).slice(0, 25);
    if (transactionId.length < 12) {
      throw new HttpError(400, "Recharge transaction id must be 12–25 characters", "NOBLE_RECHARGE_TXN_ID");
    }
    const route = await resolveRechargeRoute({
      serviceCode: params.serviceCode,
      operatorCode: params.operatorCode,
      accountRef: params.accountRef,
    });
    if (!route.ok) {
      // Refused before the provider call — safe to fail (wallet is reversed).
      return {
        success: false,
        status: "failed",
        providerTxnId: null,
        amount: params.amount,
        message: route.message,
        data: { clientTransactionId: transactionId },
        raw: { refused: route.code },
      };
    }
    const { httpStatus, json } = await noblePost("recharge", "/v1.0/recharge/recharge_b2b", {
      operatorCode: route.operatorCode,
      circleCode: route.circleCode,
      rechargeNumber: params.accountRef,
      amount: params.amount,
      transactionId,
    });
    return this.toResult(httpStatus, json, "Recharge", params.amount, {
      clientTransactionId: transactionId,
      providerOperatorCode: route.operatorCode,
      providerCircleCode: route.circleCode,
      routeSource: route.source,
    });
  }

  async dmtRemitterProfile(
    params: DmtRemitterProfileParams,
  ): Promise<ProviderResult<{ profile: DmtRemitterProfile | null; referenceKey?: string; validity?: string }>> {
    const { httpStatus, json } = await airtelGetCustomer(params.retailerUserId, params.customerMobile);
    const row = firstResponseRow(json);
    const token = rowToken(json);
    const registered =
      json.status === 1 ||
      String(json.description ?? "").toLowerCase().includes("already registered");
    if (!registered) {
      return {
        success: true,
        status: "success",
        providerTxnId: null,
        amount: null,
        message: String(json.description || json.message || "Customer not registered for DMT"),
        data: { profile: null, referenceKey: token || undefined },
        raw: json as unknown as Record<string, unknown>,
      };
    }
    const profile: DmtRemitterProfile = {
      registered: true,
      mobileNumber: params.customerMobile,
      firstName: String(row.firstName ?? row.name ?? ""),
      lastName: String(row.lastName ?? ""),
      city: String(row.city ?? ""),
      pincode: String(row.pincode ?? ""),
      limitPerTransaction: String(row.dcmv ?? row.limitPerTransaction ?? "0"),
      limitTotal: String(row.mcmv ?? row.limitTotal ?? "0"),
      limitConsumed: String(row.limitConsumed ?? "0"),
      limitAvailable: String(row.limitAvailable ?? row.dcmv ?? "0"),
      limitDetails: {},
      beneficiaries: (await this.beneListSafe(params.customerMobile)).map((b) => ({
        id: b.accountNumber,
        name: b.name,
        account: b.accountNumber,
        ifsc: b.ifsc,
        bank: b.bank,
        beneficiaryMobileNumber: b.mobile,
        verificationDt: "",
      })),
      isTxnOtpRequired: true,
      isTxnBioAuthRequired: false,
      isImpsAllowed: true,
      isNeftAllowed: true,
      isFaceAuthAvailable: false,
      referenceKey: token,
      validity: "",
      pidOptionWadh: "",
    };
    return {
      success: nobleOk(json, httpStatus) || registered,
      status: "success",
      providerTxnId: null,
      amount: null,
      message: String(json.description || json.message || ""),
      data: { profile, referenceKey: profile.referenceKey },
      raw: json as unknown as Record<string, unknown>,
    };
  }
}
