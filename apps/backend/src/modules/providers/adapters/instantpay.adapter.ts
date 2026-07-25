import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../db/postgres";
import { users } from "../../../db/postgres/schema";
import { HttpError } from "../../../utils/httpError";
import { assertCertifiedBiometricDevice } from "../../aeps/compliance";
import { encryptInstantPayAadhaar } from "../instantpay/crypto";
import { instantPayGet, instantPayPost, mapInstantPayStatus, type InstantPayApiResponse } from "../instantpay/client";
import { parsePidDataXml } from "../instantpay/pidXml";
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
  DmtRemitterBeneficiary,
  DmtRemitterProfile,
  DmtRemitterKycParams,
  DmtRemitterProfileParams,
  DmtRemitterRegistrationParams,
  DmtRemitterRegistrationVerifyParams,
  DmtRefundOtpParams,
  DmtRefundParams,
  DmtTransactionOtpParams,
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
  NepalOutletEkycBiometricData,
  NepalOutletEkycProcessParams,
  NepalOutletEkycProcessResult,
  NepalRemitterIdDoc,
  NepalRemitterProfile,
  NepalRemitterProfileParams,
  NepalRemitterTxnCount,
  NepalBeneficiary,
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

/**
 * Real InstantPay adapter for AEPS (+ agent daily 2FA).
 * Non-AEPS rails throw until wired — DMT/BBPS stay on stub adapters via DB routing.
 */
export class InstantPayAdapter implements ProviderAdapter {
  readonly code = "instantpay";
  readonly isStub = false;

  private async resolveOutletContext(params: {
    retailerUserId: string;
    outletId?: string;
    endpointIp?: string;
    latitude?: string;
    longitude?: string;
  }): Promise<{ outletId: string; endpointIp: string; latitude: string; longitude: string }> {
    const [user] = await db
      .select({
        instantpayOutletId: users.instantpayOutletId,
        outletLatitude: users.outletLatitude,
        outletLongitude: users.outletLongitude,
      })
      .from(users)
      .where(eq(users.id, params.retailerUserId));

    const outletId = params.outletId || user?.instantpayOutletId;
    if (!outletId) {
      throw new HttpError(
        422,
        "InstantPay outlet id missing for this retailer — complete merchant onboarding first",
        "INSTANTPAY_OUTLET_REQUIRED",
      );
    }

    const latitude = params.latitude || user?.outletLatitude;
    const longitude = params.longitude || user?.outletLongitude;
    if (!latitude || !longitude) {
      throw new HttpError(422, "Latitude and longitude are required for AePS", "AEPS_GEO_REQUIRED");
    }

    return {
      outletId,
      endpointIp: params.endpointIp || "127.0.0.1",
      latitude,
      longitude,
    };
  }

  /** Outlet id only — for reads (bank list) that don't need geo. */
  private async resolveOutletId(retailerUserId: string, outletId?: string): Promise<string> {
    if (outletId) return outletId;
    const [user] = await db
      .select({ instantpayOutletId: users.instantpayOutletId })
      .from(users)
      .where(eq(users.id, retailerUserId));
    if (!user?.instantpayOutletId) {
      throw new HttpError(
        422,
        "InstantPay outlet id missing for this retailer — complete merchant onboarding first",
        "INSTANTPAY_OUTLET_REQUIRED",
      );
    }
    return user.instantpayOutletId;
  }

  private toResult(
    res: InstantPayApiResponse,
    amount: string | null,
    data: Record<string, unknown> = {},
  ): ProviderResult {
    const status = mapInstantPayStatus(res);
    return {
      success: status === "success",
      status,
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount,
      message: String(res.status ?? (status === "success" ? "OK" : "InstantPay declined")),
      data,
      raw: res as Record<string, unknown>,
    };
  }

  private buildBiometric(aadhaarNumber: string, biometricPayload: string) {
    const encryptedAadhaar = encryptInstantPayAadhaar(aadhaarNumber);
    const bio = parsePidDataXml(biometricPayload, encryptedAadhaar);
    assertCertifiedBiometricDevice(bio.dpId);
    return bio;
  }

  async agentAuth(params: AgentAuthParams): Promise<ProviderResult> {
    const ctx = await this.resolveOutletContext(params);
    const externalRef = params.externalRef || `AA-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const res = await instantPayPost(
      "/fi/aeps/outletLogin",
      {
        type: "DAILY_LOGIN",
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        externalRef,
        captureType: "FINGER",
        biometricData: this.buildBiometric(params.aadhaarNumber, params.biometricPayload),
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );
    // Daily 2FA success = actcode LOGGEDIN ONLY. A biometric-mismatch failure ALSO returns
    // statuscode TXN but actcode LOGINREQUIRED (and is chargeable) — never unlock on it.
    const actcode = String(res.actcode ?? "").toUpperCase();
    const loggedIn = actcode === "LOGGEDIN";
    const base = this.toResult(res, null, { actcode: res.actcode ?? null });
    return {
      ...base,
      success: loggedIn,
      status: loggedIn ? "success" : "failed",
      message: loggedIn
        ? String(res.status ?? "Daily 2FA successful")
        : actcode === "LOGINREQUIRED"
          ? "Biometric did not match — scan again to retry daily 2FA"
          : base.message,
    };
  }

  async aepsBalanceEnquiry(params: AepsParams): Promise<ProviderResult<{ balance: string }>> {
    const ctx = await this.resolveOutletContext(params);
    const externalRef = params.externalRef || `BE-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const res = await instantPayPost(
      "/fi/aeps/balanceEnquiry",
      {
        bankiin: params.bankIin,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        mobile: params.mobile,
        externalRef,
        captureType: "FINGER",
        biometricData: this.buildBiometric(params.aadhaarNumber, params.biometricPayload),
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );
    const data = (res.data && !Array.isArray(res.data) ? res.data : {}) as Record<string, unknown>;
    const balance = String(data.balance ?? data.Balance ?? "0");
    const mapped = this.toResult(res, null, { balance });
    return { ...mapped, data: { balance } };
  }

  async aepsWithdraw(params: AepsParams): Promise<ProviderResult> {
    const ctx = await this.resolveOutletContext(params);
    const externalRef = params.externalRef || `CW-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const res = await instantPayPost(
      "/fi/aeps/cashWithdrawal",
      {
        bankiin: params.bankIin,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        mobile: params.mobile,
        amount: params.amount,
        externalRef,
        captureType: "FINGER",
        // ₹5,000+ withdrawals: referenceKey from /transactionOtp; OTP itself rides inside the
        // PID (RD service PidOptions otp attribute), not in this JSON body.
        ...(params.otpReferenceKey ? { referenceKey: params.otpReferenceKey } : {}),
        biometricData: this.buildBiometric(params.aadhaarNumber, params.biometricPayload),
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );
    return this.toResult(res, params.amount ?? null);
  }

  async aepsDeposit(params: AepsParams): Promise<ProviderResult> {
    const ctx = await this.resolveOutletContext(params);
    const externalRef = params.externalRef || `CD-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const res = await instantPayPost(
      "/fi/aeps/cashDeposit",
      {
        bankiin: params.bankIin,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        mobile: params.mobile,
        amount: params.amount,
        externalRef,
        captureType: "FINGER",
        biometricData: this.buildBiometric(params.aadhaarNumber, params.biometricPayload),
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );
    return this.toResult(res, params.amount ?? null);
  }

  async aepsBankList(params: AepsBankListParams): Promise<ProviderResult<{ banks: AepsBank[] }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayGet("/fi/aeps/banks", {
      outletId,
      endpointIp: params.endpointIp || "127.0.0.1",
    });
    const rows = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
    const banks: AepsBank[] = rows.map((r) => ({
      bankId: (r.bankId as number | string) ?? "",
      name: String(r.name ?? ""),
      iin: String(r.iin ?? ""),
      aepsEnabled: Boolean(r.aepsEnabled),
      aadhaarpayEnabled: Boolean(r.aadhaarpayEnabled),
      aepsFailureRate: String(r.aepsFailureRate ?? ""),
      aadhaarpayFailureRate: String(r.aadhaarpayFailureRate ?? ""),
    }));
    const mapped = this.toResult(res, null, { banks });
    return { ...mapped, data: { banks } };
  }

  async aepsTransactionOtp(
    params: AepsTxnOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>> {
    const ctx = await this.resolveOutletContext(params);
    const res = await instantPayPost(
      "/fi/aeps/transactionOtp",
      {
        bankiin: params.bankIin,
        encryptedAadhaar: encryptInstantPayAadhaar(params.aadhaarNumber),
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        amount: params.amount,
        mobile: params.mobile,
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );
    // Success statuscode for this endpoint is "OTP" (not TXN).
    const sent = String(res.statuscode ?? "").toUpperCase() === "OTP";
    const data = (res.data && !Array.isArray(res.data) ? res.data : {}) as Record<string, unknown>;
    const referenceKey = String(data.referenceKey ?? "");
    const validity = String(data.validity ?? "");
    return {
      success: sent && referenceKey.length > 0,
      status: sent && referenceKey.length > 0 ? "success" : "failed",
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: String(res.status ?? (sent ? "OTP sent" : "OTP request failed")),
      data: { referenceKey, validity },
      raw: res as Record<string, unknown>,
    };
  }

  async aepsMiniStatement(
    params: AepsParams,
  ): Promise<
    ProviderResult<{ statement: { date: string; narration: string; amount: string; type: "credit" | "debit" }[] }>
  > {
    const ctx = await this.resolveOutletContext(params);
    const externalRef = params.externalRef || `MS-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const res = await instantPayPost(
      "/fi/aeps/miniStatement",
      {
        bankiin: params.bankIin,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        mobile: params.mobile,
        externalRef,
        captureType: "FINGER",
        biometricData: this.buildBiometric(params.aadhaarNumber, params.biometricPayload),
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );
    const data = (res.data && !Array.isArray(res.data) ? res.data : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.miniStatement)
      ? data.miniStatement
      : Array.isArray(data.statement)
        ? data.statement
        : [];
    const statement = (rows as Record<string, unknown>[]).map((r) => ({
      date: String(r.date ?? r.txnDate ?? ""),
      narration: String(r.narration ?? r.Narration ?? ""),
      amount: String(r.amount ?? r.Amount ?? "0"),
      type: String(r.type ?? r.txnType ?? "debit").toLowerCase() === "credit" ? ("credit" as const) : ("debit" as const),
    }));
    const mapped = this.toResult(res, null, { statement });
    return { ...mapped, data: { statement } };
  }

  async aadhaarPay(params: AepsParams): Promise<ProviderResult> {
    const ctx = await this.resolveOutletContext(params);
    const externalRef = params.externalRef || `AP-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const res = await instantPayPost(
      "/fi/aeps/aadhaarPay",
      {
        bankiin: params.bankIin,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        mobile: params.mobile,
        amount: params.amount,
        externalRef,
        captureType: "FINGER",
        biometricData: this.buildBiometric(params.aadhaarNumber, params.biometricPayload),
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );
    return this.toResult(res, params.amount ?? null);
  }

  /**
   * Transaction Status (POST /reports/txnStatus) — client-level reports API, no outlet header.
   * Provider rules: query only for TUP/timeout txns, ≥30 min after the txn, ≥4 h between
   * retries for the same txn, history available for 30 days, nightly maintenance 11:30 PM–00:30 AM.
   * Our recheck flow already spaces retries; finalizeTxn is idempotent either way.
   */
  async checkStatus(params: CheckStatusParams): Promise<ProviderResult> {
    if (!params.txnDate) {
      throw new HttpError(422, "Transaction date required for status check", "TXN_DATE_REQUIRED");
    }
    const isAeps =
      !params.serviceCode ||
      params.serviceCode.startsWith("aeps_") ||
      params.serviceCode === "aadhaar_pay";
    const res = await instantPayPost(
      "/reports/txnStatus",
      {
        transactionDate: params.txnDate,
        // We send externalRef = our txnRef on every money call, so lookup is deterministic.
        externalRef: params.clientRef,
        // source ORDER applies to AePS transactions only per InstantPay docs.
        ...(isAeps ? { source: "ORDER" } : {}),
      },
      { endpointIp: "127.0.0.1" },
    );

    // Two-level status: outer statuscode must be TXN for the QUERY itself; the txn's real
    // state is transactionStatusCode (TXN success / TUP pending / anything else failed).
    // Outer non-TXN = query didn't resolve — treat as pending, never settle on it.
    const outer = String(res.statuscode ?? "").toUpperCase();
    const data = (res.data && !Array.isArray(res.data) ? res.data : {}) as Record<string, unknown>;
    const inner = String(data.transactionStatusCode ?? "").toUpperCase();
    const status: "success" | "failed" | "pending" =
      outer !== "TXN" ? "pending" : inner === "TXN" ? "success" : inner === "TUP" ? "pending" : "failed";
    const amount = data.transactionAmount != null ? String(data.transactionAmount) : null;
    return {
      success: status === "success",
      status,
      providerTxnId:
        (data.transactionReferenceId as string | null) ??
        (res.orderid as string | null) ??
        (res.ipay_uuid as string | null) ??
        null,
      amount,
      message: String(data.transactionStatus ?? res.status ?? status),
      data: {},
      raw: res as Record<string, unknown>,
    };
  }

  async dmtBankList(params: DmtBankListParams): Promise<ProviderResult<{ banks: DmtBank[] }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    // InstantPay expects POST with empty body; sync at most once/hour on the client.
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/banks",
      {},
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );
    const rows = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
    const banks: DmtBank[] = rows.map((r) => ({
      bankId: (r.bankId as number | string) ?? "",
      name: String(r.name ?? ""),
      ifscAlias: String(r.ifscAlias ?? ""),
      ifscGlobal: String(r.ifscGlobal ?? ""),
      neftEnabled: Number(r.neftEnabled) === 1,
      impsEnabled: Number(r.impsEnabled) === 1,
      upiEnabled: Number(r.upiEnabled) === 1,
      neftFailureRate: String(r.neftFailureRate ?? "0"),
      impsFailureRate: String(r.impsFailureRate ?? "0"),
      upiFailureRate: String(r.upiFailureRate ?? "0"),
    }));
    const mapped = this.toResult(res, null, { banks });
    return { ...mapped, data: { banks } };
  }

  async nepalStaticData(
    params: NepalStaticDataParams,
  ): Promise<ProviderResult<{ items: NepalStaticOption[]; type: NepalStaticDataType }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    // InstantPay docs: GET with JSON body `{ type }`.
    const res = await instantPayGet(
      "/fi/remit/out/nepal/staticData",
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
      { type: params.type },
    );
    const rows = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
    const items: NepalStaticOption[] = rows.map((r) => ({
      label: String(r.label ?? r.value ?? ""),
      value: String(r.value ?? r.label ?? ""),
    }));
    const data = { items, type: params.type };
    const mapped = this.toResult(res, null, data);
    return { ...mapped, data };
  }

  async nepalPaymentLocationList(
    params: NepalPaymentLocationListParams,
  ): Promise<ProviderResult<{ locations: NepalPaymentLocation[] }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayGet(
      "/fi/remit/out/nepal/paymentLocationList",
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
      {
        type: params.type,
        country: params.country || "NEPAL",
        state: params.state ?? "",
        district: params.district ?? "",
      },
    );
    const rows = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
    const locations: NepalPaymentLocation[] = rows.map((r) => ({
      locationId: (r.locationId as number | string) ?? "",
      locationName: String(r.locationName ?? ""),
      bankBranchId: (r.bankBranchId as number | string) ?? "",
      bankName: String(r.bankName ?? ""),
      branchName: String(r.branchName ?? ""),
      branchCode: String(r.branchCode ?? ""),
      routingCode: String(r.routingCode ?? ""),
      country: String(r.country ?? ""),
      address: String(r.address ?? ""),
      state: String(r.state ?? ""),
      district: String(r.district ?? ""),
      city: String(r.city ?? ""),
      phoneNumber: String(r.phoneNumber ?? ""),
    }));
    const mapped = this.toResult(res, null, { locations });
    return { ...mapped, data: { locations } };
  }

  async nepalStateDistrict(
    params: NepalStateDistrictParams,
  ): Promise<ProviderResult<{ items: NepalStateDistrict[] }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayGet(
      "/fi/remit/out/nepal/stateDistrict",
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
      { country: params.country },
    );
    const rows = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
    const items: NepalStateDistrict[] = rows.map((r) => ({
      state: String(r.state ?? ""),
      district: String(r.district ?? ""),
      stateCode: String(r.stateCode ?? ""),
    }));
    const mapped = this.toResult(res, null, { items });
    return { ...mapped, data: { items } };
  }

  async nepalOutletStatus(
    params: NepalOutletStatusParams,
  ): Promise<ProviderResult<{ outlet: NepalOutletStatus }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const body: Record<string, unknown> = {};
    if (params.checkOtpStatus) body.checkOtpStatus = 1;

    const res = await instantPayGet(
      "/fi/remit/out/nepal/outletStatus",
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
      Object.keys(body).length > 0 ? body : undefined,
    );

    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const raw =
      res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const cspStatus = raw?.cspStatus != null ? String(raw.cspStatus) : null;
    const cspCode = raw?.cspCode != null ? String(raw.cspCode) : null;

    // TXN + APPROVED (or no blocking actcode) = ready to remittance.
    // TUP + OUTLETREGISTER / OUTLETEKYC / OTPVERFCTN = actionable onboarding steps (not a hard fail).
    const blocking = actcode === "OUTLETREGISTER" || actcode === "OUTLETEKYC" || actcode === "OTPVERFCTN";
    const ready =
      statuscode === "TXN" &&
      !blocking &&
      (cspStatus == null || cspStatus.toUpperCase() === "APPROVED");

    const outlet: NepalOutletStatus = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      cspStatus,
      cspCode,
      ready,
    };

    return {
      success: true,
      status: ready ? "success" : blocking ? "pending" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: outlet.message || (ready ? "Outlet ready" : "Outlet action required"),
      data: { outlet },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalOutletRegistration(
    params: NepalOutletRegistrationParams,
  ): Promise<ProviderResult<{ registration: NepalOutletRegistrationResult }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/nepal/outletRegistration",
      {
        otpReference: params.otpReference,
        otp: params.otp,
        gender: params.gender,
        category: params.category,
        fatherOrSpouseName: params.fatherOrSpouseName,
        physicallyHandicapped: params.physicallyHandicapped,
        alternateOccupationType: params.alternateOccupationType,
        alternateOccupationDescription: params.alternateOccupationDescription ?? "",
        highestEducation: params.highestEducation,
        operatingHoursFrom: params.operatingHoursFrom,
        operatingHoursTo: params.operatingHoursTo,
        course: params.course,
        courseCompletionDate: params.courseCompletionDate ?? "",
        instituteName: params.instituteName ?? "",
        deviceName: params.deviceName,
        connectivityType: params.connectivityType,
        connectionProvider: params.connectionProvider,
        weeklyOff: params.weeklyOff,
        expectedAnnualTurnover: params.expectedAnnualTurnover,
        expectedAnnualIncome: params.expectedAnnualIncome,
        bankAccountNo: params.bankAccountNo,
        bankIfsc: params.bankIfsc,
        accountName: params.accountName,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const needsEkyc = actcode === "OUTLETEKYC";
    // Sample success is TUP + OUTLETEKYC — treat as pending next-step, not hard fail.
    const ok = statuscode === "TXN" || needsEkyc || statuscode === "TUP";

    const registration: NepalOutletRegistrationResult = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      needsEkyc,
    };

    return {
      success: ok,
      status: needsEkyc ? "pending" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: registration.message || (needsEkyc ? "Outlet registered — initiate eKYC" : "Outlet registration failed"),
      data: { registration },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalOutletEkycInitiate(
    params: NepalOutletEkycInitiateParams,
  ): Promise<ProviderResult<{ ekyc: NepalOutletEkycInitiateResult }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayGet("/fi/remit/out/nepal/outletEkycInitiate", {
      outletId,
      endpointIp: params.endpointIp || "127.0.0.1",
    });

    const raw =
      res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const redirectUrl = String(raw?.redirectUrl ?? "");
    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const ok = statuscode === "TXN" && redirectUrl.length > 0;

    const ekyc: NepalOutletEkycInitiateResult = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      redirectUrl,
    };

    return {
      success: ok,
      status: ok ? "success" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: ekyc.message || (ok ? "eKYC redirect ready" : "eKYC initiate failed"),
      data: { ekyc },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalOutletEkycInitiateStatus(
    params: NepalOutletEkycInitiateStatusParams,
  ): Promise<ProviderResult<{ ekycStatus: NepalOutletEkycInitiateStatusResult }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const qs =
      params.referenceKey && params.referenceKey.length > 0
        ? `?referenceKey=${encodeURIComponent(params.referenceKey)}`
        : "";
    const res = await instantPayGet(`/fi/remit/out/nepal/outletEkycInitiateStatus${qs}`, {
      outletId,
      endpointIp: params.endpointIp || "127.0.0.1",
    });

    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const data =
      res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const ready = statuscode === "TXN";

    const ekycStatus: NepalOutletEkycInitiateStatusResult = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      ready,
      data,
    };

    return {
      success: true,
      status: ready ? "success" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: ekycStatus.message || (ready ? "eKYC status OK" : "eKYC status pending"),
      data: { ekycStatus },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalOutletEkycProcess(
    params: NepalOutletEkycProcessParams,
  ): Promise<ProviderResult<{ process: NepalOutletEkycProcessResult }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const biometricData = this.buildNepalOutletEkycBiometric(params);
    const res = await instantPayPost(
      "/fi/remit/out/nepal/outletEkycProcess",
      { biometricData },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const ok = statuscode === "TXN";

    const process: NepalOutletEkycProcessResult = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      success: ok,
    };

    return {
      success: ok,
      status: mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: process.message || (ok ? "Outlet eKYC submitted" : "Outlet eKYC process failed"),
      data: { process },
      raw: res as Record<string, unknown>,
    };
  }

  /** Map PidData XML (or structured body) → Nepal InstantPay biometricData (`sessionKey`, not `Skey`). */
  private buildNepalOutletEkycBiometric(
    params: NepalOutletEkycProcessParams,
  ): NepalOutletEkycBiometricData {
    if (params.biometricData) {
      return {
        rdsId: params.biometricData.rdsId,
        rdsVer: params.biometricData.rdsVer,
        ci: params.biometricData.ci,
        dc: params.biometricData.dc,
        dpId: params.biometricData.dpId,
        hmac: params.biometricData.hmac,
        mc: params.biometricData.mc ?? "",
        mi: params.biometricData.mi,
        pidData: params.biometricData.pidData,
        sessionKey: params.biometricData.sessionKey,
      };
    }
    if (!params.biometricPayload?.trim()) {
      throw new HttpError(400, "biometricPayload or biometricData is required", "VALIDATION_ERROR");
    }
    const bio = parsePidDataXml(params.biometricPayload, "");
    return {
      rdsId: bio.rdsId,
      rdsVer: bio.rdsVer,
      ci: bio.ci,
      dc: bio.dc,
      dpId: bio.dpId,
      hmac: bio.hmac,
      mc: bio.mc,
      mi: bio.mi,
      pidData: bio.pidData,
      sessionKey: bio.sessionKey,
    };
  }

  async nepalRemitterProfile(
    params: NepalRemitterProfileParams,
  ): Promise<ProviderResult<{ profile: NepalRemitterProfile | null }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    // InstantPay docs: GET with JSON body `{ mobile }`.
    const res = await instantPayGet(
      "/fi/remit/out/nepal/remitterProfile",
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
      { mobile: params.customerMobile },
    );

    const code = String(res.statuscode ?? "").toUpperCase();
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const hasProfile =
      code === "TXN" && raw != null && String(raw.mobile ?? raw.id ?? "").length > 0;

    if (!hasProfile) {
      const notFound =
        code === "RNF" ||
        code === "SNR" ||
        /not\s*(found|register)/i.test(String(res.status ?? ""));
      if (notFound) {
        return {
          success: true,
          status: "success",
          providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
          amount: null,
          message: String(res.status ?? "Remitter not found"),
          data: { profile: null },
          raw: res as Record<string, unknown>,
        };
      }
      const mapped = this.toResult(res, null, { profile: null });
      return { ...mapped, data: { profile: null } };
    }

    const profile = this.mapNepalRemitterProfile(raw, params.customerMobile);
    const mapped = this.toResult(res, null, { profile });
    return { ...mapped, data: { profile } };
  }

  async nepalOtpRequest(
    params: NepalOtpRequestParams,
  ): Promise<ProviderResult<{ otpReference: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/nepal/otpRequest",
      {
        operation: params.operation,
        mobile: params.mobile ?? "",
        paymentMode: params.paymentMode ?? "",
        bankBranchId: params.bankBranchId ?? "",
        accountNumber: params.accountNumber ?? "",
        beneficiaryId: params.beneficiaryId ?? "",
        ...(params.transferAmount != null && params.transferAmount !== ""
          ? { transferAmount: params.transferAmount }
          : {}),
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const otpReference = String(raw?.otpReference ?? "");
    const ok = String(res.statuscode ?? "").toUpperCase() === "TXN" && otpReference.length > 0;

    return {
      success: ok,
      status: ok ? "success" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: String(res.status ?? (ok ? "OTP sent" : "OTP request failed")),
      data: { otpReference },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalRemitterRegistration(
    params: NepalRemitterRegistrationParams,
  ): Promise<ProviderResult<{ profile: NepalRemitterProfile }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/nepal/remitterRegistration",
      {
        name: params.name,
        gender: params.gender,
        dob: params.dob,
        address: params.address,
        mobile: params.mobile,
        state: params.state,
        district: params.district,
        city: params.city,
        nationality: params.nationality,
        email: params.email ?? "",
        employer: params.employer,
        idType: params.idType,
        idNumber: params.idNumber,
        idExpiryDate: params.idExpiryDate ?? "",
        idIssuedPlace: params.idIssuedPlace ?? "",
        incomeSource: params.incomeSource,
        remitterType: params.remitterType,
        incomeSourceType: params.incomeSourceType,
        annualIncome: params.annualIncome,
        otpReference: params.otpReference,
        otp: params.otp,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const code = String(res.statuscode ?? "").toUpperCase();
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const ok = code === "TXN" && raw != null && String(raw.id ?? raw.mobile ?? "").length > 0;

    if (!ok || !raw) {
      return {
        success: false,
        status: mapInstantPayStatus(res),
        providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
        amount: null,
        message: String(res.status ?? "Remitter registration failed"),
        data: {
          profile: this.mapNepalRemitterProfile(raw ?? {}, params.mobile),
        },
        raw: res as Record<string, unknown>,
      };
    }

    const profile = this.mapNepalRemitterProfile(raw, params.mobile);
    const mapped = this.toResult(res, null, { profile });
    return { ...mapped, success: true, data: { profile } };
  }

  async nepalRemitterEkycInitiate(
    params: NepalRemitterEkycInitiateParams,
  ): Promise<ProviderResult<{ ekyc: NepalRemitterEkycInitiateResult }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const qs = `?remitterId=${encodeURIComponent(params.remitterId)}`;
    const res = await instantPayGet(`/fi/remit/out/nepal/remitterEkycInitiate${qs}`, {
      outletId,
      endpointIp: params.endpointIp || "127.0.0.1",
    });

    const raw =
      res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    // InstantPay uses `url` (outlet eKYC used `redirectUrl`) — normalize both.
    const redirectUrl = String(raw?.url ?? raw?.redirectUrl ?? "");
    const referenceKey = String(raw?.referenceKey ?? "");
    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const ok = statuscode === "TXN" && redirectUrl.length > 0;

    const ekyc: NepalRemitterEkycInitiateResult = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      referenceKey,
      redirectUrl,
    };

    return {
      success: ok,
      status: ok ? "success" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: ekyc.message || (ok ? "Remitter eKYC redirect ready" : "Remitter eKYC initiate failed"),
      data: { ekyc },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalRemitterEkycInitiateStatus(
    params: NepalRemitterEkycInitiateStatusParams,
  ): Promise<ProviderResult<{ ekycStatus: NepalRemitterEkycInitiateStatusResult }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const qs = `?remitterId=${encodeURIComponent(params.remitterId)}&referenceKey=${encodeURIComponent(params.referenceKey)}`;
    const res = await instantPayGet(`/fi/remit/out/nepal/remitterEkycInitiateStatus${qs}`, {
      outletId,
      endpointIp: params.endpointIp || "127.0.0.1",
    });

    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const data =
      res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const ready = statuscode === "TXN";

    const ekycStatus: NepalRemitterEkycInitiateStatusResult = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      ready,
      data,
    };

    return {
      success: true,
      status: ready ? "success" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: ekycStatus.message || (ready ? "Remitter eKYC status OK" : "Remitter eKYC status pending"),
      data: { ekycStatus },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalRemitterEkycProcess(
    params: NepalRemitterEkycProcessParams,
  ): Promise<ProviderResult<{ process: NepalOutletEkycProcessResult }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const biometricData = this.buildNepalOutletEkycBiometric({
      retailerUserId: params.retailerUserId,
      biometricPayload: params.biometricPayload,
      biometricData: params.biometricData,
    });
    const res = await instantPayPost(
      "/fi/remit/out/nepal/remitterEkycProcess",
      {
        referenceKey: params.referenceKey,
        remitterId: params.remitterId,
        biometricData,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const ok = statuscode === "TXN";

    const process: NepalOutletEkycProcessResult = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      success: ok,
    };

    return {
      success: ok,
      status: mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: process.message || (ok ? "Remitter eKYC submitted" : "Remitter eKYC process failed"),
      data: { process },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalRemitterUpdate(
    params: NepalRemitterUpdateParams,
  ): Promise<ProviderResult<{ update: NepalRemitterUpdateResult }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/nepal/remitterUpdate",
      {
        remitterType: params.remitterType,
        incomeSourceType: params.incomeSourceType,
        annualIncome: params.annualIncome,
        remitterId: params.remitterId,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const ok = statuscode === "TXN";

    const update: NepalRemitterUpdateResult = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      success: ok,
    };

    return {
      success: ok,
      status: mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: update.message || (ok ? "Remitter updated" : "Remitter update failed"),
      data: { update },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalBeneficiaryRegistration(
    params: NepalBeneficiaryRegistrationParams,
  ): Promise<ProviderResult<{ profile: NepalRemitterProfile; beneficiaryId: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/nepal/beneficiaryRegistration",
      {
        remitterMobile: params.remitterMobile,
        name: params.name,
        gender: params.gender,
        mobile: params.mobile,
        relationship: params.relationship,
        address: params.address,
        paymentMode: params.paymentMode,
        bankBranchId: params.bankBranchId ?? "",
        accountNumber: params.accountNumber ?? "",
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const code = String(res.statuscode ?? "").toUpperCase();
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const profile = this.mapNepalRemitterProfile(raw ?? {}, params.remitterMobile);

    // Prefer beneficiary matching request mobile/name; else last in list.
    const matched =
      profile.beneficiaries.find(
        (b) => b.mobile === params.mobile && b.name === params.name,
      ) ??
      profile.beneficiaries.find((b) => b.mobile === params.mobile) ??
      profile.beneficiaries[profile.beneficiaries.length - 1];
    const beneficiaryId = matched?.id ?? "";
    const ok = code === "TXN" && beneficiaryId.length > 0;

    return {
      success: ok,
      status: ok ? "success" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: String(
        res.status ?? (ok ? "Beneficiary registered" : "Beneficiary registration failed"),
      ),
      data: { profile, beneficiaryId },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalServiceCharge(
    params: NepalServiceChargeParams,
  ): Promise<ProviderResult<{ quote: NepalServiceChargeQuote }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayGet(
      "/fi/remit/out/nepal/serviceCharge",
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
      {
        country: params.country || "Nepal",
        paymentMode: params.paymentMode,
        transferAmount: params.transferAmount ?? "",
        payoutAmount: params.payoutAmount ?? "",
        bankBranchId: params.bankBranchId ?? "",
        remitterMobile: params.remitterMobile,
        beneficiaryId: params.beneficiaryId ?? "",
      },
    );

    const code = String(res.statuscode ?? "").toUpperCase();
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const quote: NepalServiceChargeQuote = {
      transferAmount: String(raw?.transferAmount ?? ""),
      serviceCharge: String(raw?.serviceCharge ?? ""),
      collectionAmount: String(raw?.collectionAmount ?? ""),
      collectionCurrency: String(raw?.collectionCurrency ?? "INR"),
      exchangeRate: String(raw?.exchangeRate ?? ""),
      payoutAmount: String(raw?.payoutAmount ?? ""),
      payoutCurrency: String(raw?.payoutCurrency ?? "NPR"),
    };
    const ok = code === "TXN" && (quote.collectionAmount.length > 0 || quote.transferAmount.length > 0);

    return {
      success: ok,
      status: ok ? "success" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: quote.collectionAmount || quote.transferAmount || null,
      message: String(res.status ?? (ok ? "Service charge quote ready" : "Service charge failed")),
      data: { quote },
      raw: res as Record<string, unknown>,
    };
  }

  async nepalFundTransfer(params: NepalFundTransferParams): Promise<ProviderResult> {
    const ctx = await this.resolveOutletContext(params);
    const externalRef = params.externalRef || `NP-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const res = await instantPayPost(
      "/fi/remit/out/nepal/fundTransfer",
      {
        externalRef,
        remitterMobile: params.remitterMobile,
        beneficiaryId: params.beneficiaryId,
        transferAmount: params.transferAmount,
        remittanceReason: params.remittanceReason,
        otpReference: params.otpReference,
        otp: params.otp,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );

    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : {};
    return this.toResult(res, params.transferAmount, {
      externalRef: String(raw.externalRef ?? externalRef),
      poolReferenceId: String(raw.poolReferenceId ?? ""),
      txnReferenceId: String(raw.txnReferenceId ?? ""),
      beneficiaryName: String(raw.beneficiaryName ?? ""),
      exchangeRate: String(raw.exchangeRate ?? ""),
      payoutAmount: String(raw.payoutAmount ?? ""),
      payoutCurrency: String(raw.payoutCurrency ?? "NPR"),
      orderid: String(res.orderid ?? raw.poolReferenceId ?? ""),
    });
  }

  async nepalFetchTransactionStatus(
    params: NepalFetchTransactionStatusParams,
  ): Promise<ProviderResult<{ txnStatus: NepalFetchTransactionStatusResult }>> {
    const ctx = await this.resolveOutletContext(params);
    // Docs OpenAPI says GET; HTTP/curl samples use POST with JSON body — InstantPay accepts POST.
    const res = await instantPayPost(
      "/fi/remit/out/nepal/fetchTransactionStatus",
      {
        ipayId: params.ipayId,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );

    const statuscode = String(res.statuscode ?? "").toUpperCase();
    const actcodeRaw = res.actcode == null || res.actcode === "" ? null : String(res.actcode);
    const actcode = actcodeRaw ? actcodeRaw.toUpperCase() : null;
    const data =
      res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const ready = statuscode === "TXN";
    const pending = statuscode === "TUP";

    const txnStatus: NepalFetchTransactionStatusResult = {
      statuscode,
      actcode,
      message: String(res.status ?? ""),
      ready,
      data,
    };

    return {
      success: ready || pending,
      status: ready ? "success" : pending ? "pending" : mapInstantPayStatus(res),
      providerTxnId: (res.orderid as string | null) ?? params.ipayId,
      amount: null,
      message: txnStatus.message || (ready ? "Transaction successful" : "Transaction status"),
      data: { txnStatus },
      raw: res as Record<string, unknown>,
    };
  }

  private mapNepalRemitterProfile(
    raw: Record<string, unknown>,
    fallbackMobile: string,
  ): NepalRemitterProfile {
    const idsRaw = Array.isArray(raw.ids) ? (raw.ids as Record<string, unknown>[]) : [];
    const ids: NepalRemitterIdDoc[] = idsRaw.map((row) => ({
      idType: String(row.idType ?? ""),
      idNumber: String(row.idNumber ?? ""),
    }));
    const tc =
      raw.transactionCount && !Array.isArray(raw.transactionCount)
        ? (raw.transactionCount as Record<string, unknown>)
        : {};
    const transactionCount: NepalRemitterTxnCount = {
      day: String(tc.day ?? "0"),
      month: String(tc.month ?? "0"),
      year: String(tc.year ?? "0"),
    };
    const beneficiariesRaw = Array.isArray(raw.beneficiaries)
      ? (raw.beneficiaries as Record<string, unknown>[])
      : [];
    const beneficiaries: NepalBeneficiary[] = beneficiariesRaw.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      gender: String(row.gender ?? ""),
      relationship: String(row.relationship ?? ""),
      address: String(row.address ?? ""),
      mobile: String(row.mobile ?? ""),
      paymentMode: String(row.paymentMode ?? ""),
      bankBranchId: String(row.bankBranchId ?? ""),
      bankName: String(row.bankName ?? ""),
      bankBranchName: String(row.bankBranchName ?? ""),
      acNumber: String(row.acNumber ?? row.accountNumber ?? ""),
    }));

    return {
      id: String(raw.id ?? ""),
      mobile: String(raw.mobile ?? fallbackMobile),
      firstName: String(raw.firstName ?? ""),
      gender: String(raw.gender ?? ""),
      dob: String(raw.dob ?? ""),
      address: String(raw.address ?? ""),
      city: String(raw.city ?? ""),
      state: String(raw.state ?? ""),
      district: String(raw.district ?? ""),
      nationality: String(raw.nationality ?? ""),
      employer: String(raw.employer ?? ""),
      incomeSource: String(raw.incomeSource ?? ""),
      status: String(raw.status ?? ""),
      eKycStatus: String(raw.eKycStatus ?? ""),
      onboardingStatus: String(raw.onboardingStatus ?? ""),
      approveStatus: String(raw.approveStatus ?? ""),
      approveComment: String(raw.approveComment ?? ""),
      ids,
      transactionCount,
      beneficiaries,
    };
  }

  async dmtRemitterProfile(
    params: DmtRemitterProfileParams,
  ): Promise<
    ProviderResult<{
      profile: DmtRemitterProfile | null;
      referenceKey?: string;
      validity?: string;
    }>
  > {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/remitterProfile",
      {
        mobileNumber: params.customerMobile,
        txnMode: "ALL",
        iftEnable: "YES",
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const code = String(res.statuscode ?? "").toUpperCase();
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const hasProfile = code === "TXN" && raw != null && String(raw.mobileNumber ?? "").length > 0;

    if (!hasProfile) {
      // Existence check: remitter not registered is a valid outcome (start registration).
      // InstantPay still returns referenceKey on RNF — needed for remitterRegistration.
      const referenceKey = String(raw?.referenceKey ?? "");
      const validity = String(raw?.validity ?? "");
      const notFound =
        code === "RNF" ||
        code === "SNR" ||
        /not\s*(found|register)/i.test(String(res.status ?? ""));
      if (notFound) {
        return {
          success: true,
          status: "success",
          providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
          amount: null,
          message: String(res.status ?? "Remitter not registered"),
          data: { profile: null, referenceKey: referenceKey || undefined, validity: validity || undefined },
          raw: res as Record<string, unknown>,
        };
      }
      const mapped = this.toResult(res, null, {
        profile: null,
        referenceKey: referenceKey || undefined,
        validity: validity || undefined,
      });
      return {
        ...mapped,
        data: { profile: null, referenceKey: referenceKey || undefined, validity: validity || undefined },
      };
    }

    const limitDetailsRaw =
      raw.limitDetails && typeof raw.limitDetails === "object" && !Array.isArray(raw.limitDetails)
        ? (raw.limitDetails as Record<string, unknown>)
        : {};
    const limitDetails: Record<string, string> = {};
    for (const [k, v] of Object.entries(limitDetailsRaw)) {
      limitDetails[k] = String(v ?? "");
    }

    const beneficiariesRaw = Array.isArray(raw.beneficiaries) ? raw.beneficiaries : [];
    const beneficiaries: DmtRemitterBeneficiary[] = beneficiariesRaw.map((b) => {
      const row = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        account: String(row.account ?? ""),
        ifsc: String(row.ifsc ?? ""),
        bank: String(row.bank ?? ""),
        beneficiaryMobileNumber: String(row.beneficiaryMobileNumber ?? ""),
        verificationDt: String(row.verificationDt ?? ""),
      };
    });

    const profile: DmtRemitterProfile = {
      registered: true,
      mobileNumber: String(raw.mobileNumber ?? params.customerMobile),
      firstName: String(raw.firstName ?? ""),
      lastName: String(raw.lastName ?? ""),
      city: String(raw.city ?? ""),
      pincode: String(raw.pincode ?? ""),
      limitPerTransaction: String(raw.limitPerTransaction ?? ""),
      limitTotal: String(raw.limitTotal ?? ""),
      limitConsumed: String(raw.limitConsumed ?? ""),
      limitAvailable: String(raw.limitAvailable ?? ""),
      limitDetails,
      beneficiaries,
      isTxnOtpRequired: Boolean(raw.isTxnOtpRequired),
      isTxnBioAuthRequired: Boolean(raw.isTxnBioAuthRequired),
      isImpsAllowed: Boolean(raw.isImpsAllowed),
      isNeftAllowed: Boolean(raw.isNeftAllowed),
      isFaceAuthAvailable: Boolean(raw.isFaceAuthAvailable),
      referenceKey: String(raw.referenceKey ?? ""),
      validity: String(raw.validity ?? ""),
      pidOptionWadh: String(raw.pidOptionWadh ?? ""),
    };

    return {
      success: true,
      status: "success",
      providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
      amount: null,
      message: String(res.status ?? "Success"),
      data: { profile },
      raw: res as Record<string, unknown>,
    };
  }

  async dmtRemitterRegister(
    params: DmtRemitterRegistrationParams,
  ): Promise<ProviderResult<{ otpReference: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/remitterRegistration",
      {
        mobileNumber: params.customerMobile,
        encryptedAadhaar: encryptInstantPayAadhaar(params.aadhaarNumber),
        referenceKey: params.referenceKey,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const code = String(res.statuscode ?? "").toUpperCase();
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const otpReference = String(raw?.otpReference ?? "");

    // Success = statuscode OTP (OTP sent to remitter mobile, verify in next step).
    if (code === "OTP" && otpReference.length > 0) {
      return {
        success: true,
        status: "success",
        providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
        amount: null,
        message: String(res.status ?? "OTP sent to remitter mobile"),
        data: { otpReference },
        raw: res as Record<string, unknown>,
      };
    }

    const mapped = this.toResult(res, null, { otpReference });
    return { ...mapped, data: { otpReference } };
  }

  async dmtRemitterRegisterVerify(
    params: DmtRemitterRegistrationVerifyParams,
  ): Promise<ProviderResult<{ referenceId: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/remitterRegistrationVerify",
      {
        mobileNumber: params.customerMobile,
        otp: params.otp,
        referenceKey: params.referenceKey,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const referenceId = String(raw?.referenceID ?? "");
    const mapped = this.toResult(res, null, { referenceId });
    return { ...mapped, data: { referenceId } };
  }

  async dmtRemitterKyc(params: DmtRemitterKycParams): Promise<ProviderResult<{ poolReferenceId: string }>> {
    const ctx = await this.resolveOutletContext(params);
    const externalRef = params.externalRef || `RK-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    // Aadhaar rides inside the encrypted PID block, so no encryptedAadhaar field here.
    const bio = parsePidDataXml(params.biometricPayload, "");
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/remitterKyc",
      {
        mobileNumber: params.customerMobile,
        referenceKey: params.referenceKey,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        externalRef,
        consentTaken: "Y",
        captureType: params.captureType || "FINGER",
        biometricData: {
          ci: bio.ci,
          hmac: bio.hmac,
          pidData: bio.pidData,
          ts: bio.ts,
          dc: bio.dc,
          mi: bio.mi,
          dpId: bio.dpId,
          mc: bio.mc,
          rdsId: bio.rdsId,
          rdsVer: bio.rdsVer,
          Skey: bio.sessionKey,
          srno: bio.srno,
        },
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );

    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const poolReferenceId = String(raw?.poolReferenceId ?? "");
    const mapped = this.toResult(res, null, { poolReferenceId, externalRef });
    return { ...mapped, data: { poolReferenceId } };
  }

  async dmtAddBeneficiary(
    params: DmtBeneficiaryParams,
  ): Promise<ProviderResult<{ beneficiaryId: string; referenceKey: string; validity: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/beneficiaryRegistration",
      {
        remitterMobileNumber: params.customerMobile,
        beneficiaryMobileNumber: params.beneficiaryMobile || params.customerMobile,
        accountNumber: params.accountNumber,
        ifsc: params.ifsc,
        ...(params.bankId ? { bankId: params.bankId } : {}),
        name: params.name,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const code = String(res.statuscode ?? "").toUpperCase();
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const beneficiaryId = String(raw?.beneficiaryId ?? "");
    const referenceKey = String(raw?.referenceKey ?? "");
    const validity = String(raw?.validity ?? "");

    // Success = statuscode OTP (OTP sent to remitter mobile, verify in next step).
    if (code === "OTP" && beneficiaryId.length > 0) {
      return {
        success: true,
        status: "success",
        providerTxnId: (res.orderid as string | null) ?? (res.ipay_uuid as string | null) ?? null,
        amount: null,
        message: String(res.status ?? "OTP sent to remitter mobile"),
        data: { beneficiaryId, referenceKey, validity },
        raw: res as Record<string, unknown>,
      };
    }

    const mapped = this.toResult(res, null, { beneficiaryId });
    return { ...mapped, data: { beneficiaryId, referenceKey, validity } };
  }

  async dmtAddBeneficiaryVerify(
    params: DmtBeneficiaryVerifyParams,
  ): Promise<ProviderResult<{ beneficiaryId: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/beneficiaryRegistrationVerify",
      {
        remitterMobileNumber: params.customerMobile,
        otp: params.otp,
        beneficiaryId: params.beneficiaryId,
        referenceKey: params.referenceKey,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const beneficiaryId = String(raw?.beneficiaryId ?? params.beneficiaryId);
    const mapped = this.toResult(res, null, { beneficiaryId });
    return { ...mapped, data: { beneficiaryId } };
  }

  async dmtDeleteBeneficiary(
    params: DmtBeneficiaryDeleteParams,
  ): Promise<ProviderResult<{ beneficiaryId: string; referenceKey: string; validity: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/beneficiaryDelete",
      {
        remitterMobileNumber: params.customerMobile,
        beneficiaryId: params.beneficiaryId,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    // statuscode "OTP" = delete initiated, OTP sent to remitter — verify step completes it.
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const data = {
      beneficiaryId: String(raw?.beneficiaryId ?? params.beneficiaryId),
      referenceKey: String(raw?.referenceKey ?? ""),
      validity: String(raw?.validity ?? ""),
    };
    const mapped = this.toResult(res, null, data);
    return { ...mapped, data };
  }

  async dmtDeleteBeneficiaryVerify(
    params: DmtBeneficiaryVerifyParams,
  ): Promise<ProviderResult<{ beneficiaryId: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/beneficiaryDeleteVerify",
      {
        remitterMobileNumber: params.customerMobile,
        otp: params.otp,
        beneficiaryId: params.beneficiaryId,
        referenceKey: params.referenceKey,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const beneficiaryId = String(raw?.beneficiaryId ?? params.beneficiaryId);
    const mapped = this.toResult(res, null, { beneficiaryId });
    return { ...mapped, data: { beneficiaryId } };
  }

  async dmtGenerateTransactionOtp(
    params: DmtTransactionOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/generateTransactionOtp",
      {
        remitterMobileNumber: params.customerMobile,
        amount: params.amount,
        referenceKey: params.referenceKey,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    // statuscode "OTP" = OTP sent to remitter — the new referenceKey goes into the transfer call.
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const data = {
      referenceKey: String(raw?.referenceKey ?? ""),
      validity: String(raw?.validity ?? ""),
    };
    const mapped = this.toResult(res, null, data);
    return { ...mapped, data };
  }

  async dmtTransactionRefundOtp(
    params: DmtRefundOtpParams,
  ): Promise<ProviderResult<{ referenceKey: string; validity: string }>> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/transactionRefundOtp",
      { ipayId: params.ipayId },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    // statuscode "OTP" = OTP sent to remitter — referenceKey goes into the refund call.
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : null;
    const data = {
      referenceKey: String(raw?.referenceKey ?? ""),
      validity: String(raw?.validity ?? ""),
    };
    const mapped = this.toResult(res, null, data);
    return { ...mapped, data };
  }

  async dmtTransactionRefund(params: DmtRefundParams): Promise<ProviderResult> {
    const outletId = await this.resolveOutletId(params.retailerUserId, params.outletId);
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/transactionRefund",
      {
        ipayId: params.ipayId,
        referenceKey: params.referenceKey,
        otp: params.otp,
      },
      { outletId, endpointIp: params.endpointIp || "127.0.0.1" },
    );

    // Refund success pe pending txn reverse ho jaata hai — hamare ledger reversal ke liye
    // client ko /api/txn/:txnRef/recheck chalana hai (txnStatus se auto-reversal).
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : {};
    return this.toResult(res, null, { ipayId: params.ipayId, ...raw });
  }

  async dmtTransfer(params: DmtTransferParams): Promise<ProviderResult> {
    const ctx = await this.resolveOutletContext(params);
    const externalRef = params.externalRef || `DT-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const res = await instantPayPost(
      "/fi/remit/out/domestic/v2/transaction",
      {
        remitterMobileNumber: params.customerMobile,
        accountNumber: params.accountNumber,
        ifsc: params.ifsc,
        transferMode: params.mode.toUpperCase(),
        transferAmount: params.amount,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        referenceKey: params.referenceKey,
        otp: params.otp,
        externalRef,
      },
      { outletId: ctx.outletId, endpointIp: params.endpointIp || ctx.endpointIp },
    );

    // TXN = success, TUP = pending (toResult maps it) — recheck via /reports/txnStatus with our
    // externalRef. actcode OTPGENREF = declined for invalid OTP; client must restart with a fresh OTP.
    const raw = res.data && !Array.isArray(res.data) ? (res.data as Record<string, unknown>) : {};
    return this.toResult(res, params.amount, {
      externalRef: String(raw.externalRef ?? externalRef),
      txnReferenceId: String(raw.txnReferenceId ?? ""),
      poolReferenceId: String(raw.poolReferenceId ?? ""),
      beneficiaryName: String(raw.beneficiaryName ?? ""),
    });
  }

  bbpsFetchBill(
    _params: BbpsFetchBillParams,
  ): Promise<ProviderResult<{ billFetchRef: string; customerName: string; billAmount: string; dueDate: string }>> {
    return Promise.reject(new HttpError(501, "InstantPay BBPS not wired yet", "INSTANTPAY_BBPS_UNWIRED"));
  }

  bbpsPayBill(_params: BbpsPayBillParams): Promise<ProviderResult> {
    return Promise.reject(new HttpError(501, "InstantPay BBPS not wired yet", "INSTANTPAY_BBPS_UNWIRED"));
  }

  recharge(_params: RechargeParams): Promise<ProviderResult> {
    return Promise.reject(new HttpError(501, "InstantPay recharge not wired yet", "INSTANTPAY_RECHARGE_UNWIRED"));
  }
}
