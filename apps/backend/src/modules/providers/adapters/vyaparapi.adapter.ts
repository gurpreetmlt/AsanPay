import { HttpError } from "../../../utils/httpError";
import { vyaparApiKey, vyaparGet, type VyaparApiJson } from "../vyaparapi/client";
import { mapVyaparOperatorCode, mapVyaparTxnStatus } from "../vyaparapi/status";
import type {
  AepsBankListParams,
  AepsParams,
  AepsTxnOtpParams,
  AgentAuthParams,
  BbpsFetchBillParams,
  BbpsPayBillParams,
  CheckStatusParams,
  DmtBankListParams,
  DmtBeneficiaryDeleteParams,
  DmtBeneficiaryParams,
  DmtBeneficiaryVerifyParams,
  DmtRefundOtpParams,
  DmtRefundParams,
  DmtRemitterKycParams,
  DmtRemitterProfileParams,
  DmtRemitterRegistrationParams,
  DmtRemitterRegistrationVerifyParams,
  DmtTransactionOtpParams,
  DmtTransferParams,
  NepalBeneficiaryRegistrationParams,
  NepalFetchTransactionStatusParams,
  NepalFundTransferParams,
  NepalOtpRequestParams,
  NepalOutletEkycInitiateParams,
  NepalOutletEkycInitiateStatusParams,
  NepalOutletEkycProcessParams,
  NepalOutletRegistrationParams,
  NepalOutletStatusParams,
  NepalPaymentLocationListParams,
  NepalRemitterEkycInitiateParams,
  NepalRemitterEkycInitiateStatusParams,
  NepalRemitterEkycProcessParams,
  NepalRemitterProfileParams,
  NepalRemitterRegistrationParams,
  NepalRemitterUpdateParams,
  NepalServiceChargeParams,
  NepalStateDistrictParams,
  NepalStaticDataParams,
  ProviderAdapter,
  ProviderResult,
  RechargeParams,
} from "../types";

/**
 * VyaparAPI — mobile prepaid + DTH recharge (see VyaparAPI/API.md).
 * Other rails throw 501; do not fabricate success.
 */
export class VyaparApiAdapter implements ProviderAdapter {
  readonly code = "vyaparapi";
  readonly isStub = false;

  private ni(op: string): never {
    throw new HttpError(501, `VyaparAPI does not support ${op}`, "PROVIDER_NOT_IMPLEMENTED");
  }

  private toResult(httpStatus: number, json: VyaparApiJson, amount: string | null): ProviderResult {
    const status = mapVyaparTxnStatus({
      httpStatus,
      status: json.status,
      statusCode: json.statusCode,
    });
    const tid = json.tid != null && String(json.tid).trim() !== "" ? String(json.tid) : null;
    return {
      success: status === "success",
      status,
      providerTxnId: tid,
      amount,
      message: String(json.message ?? ""),
      data: {
        liveid: json.liveid ?? "",
        partnerid: json.partnerid ?? "",
        statusCode: json.statusCode ?? null,
        operator: json.operator ?? "",
        circle: json.circle ?? "",
      },
      raw: json as Record<string, unknown>,
    };
  }

  async recharge(params: RechargeParams): Promise<ProviderResult> {
    const apiKey = vyaparApiKey();
    const partnerid = (params.clientRef ?? "").trim();
    if (!partnerid) {
      throw new HttpError(500, "Recharge clientRef (partnerid) is required", "VYAPARAPI_PARTNERID_REQUIRED");
    }
    const number = params.accountRef.replace(/\D/g, "");
    if (number.length < 8) {
      throw new HttpError(400, "Enter a valid mobile or DTH number", "INVALID_RECHARGE_NUMBER");
    }

    const { httpStatus, json } = await vyaparGet("/public/recharge", {
      api_key: apiKey,
      partnerid,
      amount: params.amount,
      number,
      operator: mapVyaparOperatorCode(params.operatorCode),
      circle: "0",
    });

    return this.toResult(httpStatus, json, params.amount);
  }

  async checkStatus(params: CheckStatusParams): Promise<ProviderResult> {
    const apiKey = vyaparApiKey();
    const partnerid = params.clientRef?.trim() || "";
    const tid = params.providerTxnId?.trim() || "";
    if (!partnerid && !tid) {
      throw new HttpError(400, "partnerid or tid is required for VyaparAPI status", "VYAPARAPI_STATUS_REF_REQUIRED");
    }

    const { httpStatus, json } = await vyaparGet("/public/transaction/status", {
      api_key: apiKey,
      partnerid: partnerid || undefined,
      tid: tid || undefined,
    });

    return this.toResult(httpStatus, json, null);
  }

  // ── Unsupported rails ───────────────────────────────────────────────────
  aepsBalanceEnquiry(_p: AepsParams) {
    return this.ni("aepsBalanceEnquiry");
  }
  aepsWithdraw(_p: AepsParams) {
    return this.ni("aepsWithdraw");
  }
  aepsDeposit(_p: AepsParams) {
    return this.ni("aepsDeposit");
  }
  aepsBankList(_p: AepsBankListParams) {
    return this.ni("aepsBankList");
  }
  aepsTransactionOtp(_p: AepsTxnOtpParams) {
    return this.ni("aepsTransactionOtp");
  }
  aepsMiniStatement(_p: AepsParams) {
    return this.ni("aepsMiniStatement");
  }
  aadhaarPay(_p: AepsParams) {
    return this.ni("aadhaarPay");
  }
  dmtBankList(_p: DmtBankListParams) {
    return this.ni("dmtBankList");
  }
  dmtRemitterProfile(_p: DmtRemitterProfileParams) {
    return this.ni("dmtRemitterProfile");
  }
  dmtRemitterRegister(_p: DmtRemitterRegistrationParams) {
    return this.ni("dmtRemitterRegister");
  }
  dmtRemitterRegisterVerify(_p: DmtRemitterRegistrationVerifyParams) {
    return this.ni("dmtRemitterRegisterVerify");
  }
  dmtRemitterKyc(_p: DmtRemitterKycParams) {
    return this.ni("dmtRemitterKyc");
  }
  dmtAddBeneficiary(_p: DmtBeneficiaryParams) {
    return this.ni("dmtAddBeneficiary");
  }
  dmtAddBeneficiaryVerify(_p: DmtBeneficiaryVerifyParams) {
    return this.ni("dmtAddBeneficiaryVerify");
  }
  dmtDeleteBeneficiary(_p: DmtBeneficiaryDeleteParams) {
    return this.ni("dmtDeleteBeneficiary");
  }
  dmtDeleteBeneficiaryVerify(_p: DmtBeneficiaryVerifyParams) {
    return this.ni("dmtDeleteBeneficiaryVerify");
  }
  dmtGenerateTransactionOtp(_p: DmtTransactionOtpParams) {
    return this.ni("dmtGenerateTransactionOtp");
  }
  dmtTransfer(_p: DmtTransferParams) {
    return this.ni("dmtTransfer");
  }
  dmtTransactionRefundOtp(_p: DmtRefundOtpParams) {
    return this.ni("dmtTransactionRefundOtp");
  }
  dmtTransactionRefund(_p: DmtRefundParams) {
    return this.ni("dmtTransactionRefund");
  }
  nepalStaticData(_p: NepalStaticDataParams) {
    return this.ni("nepalStaticData");
  }
  nepalPaymentLocationList(_p: NepalPaymentLocationListParams) {
    return this.ni("nepalPaymentLocationList");
  }
  nepalStateDistrict(_p: NepalStateDistrictParams) {
    return this.ni("nepalStateDistrict");
  }
  nepalOutletStatus(_p: NepalOutletStatusParams) {
    return this.ni("nepalOutletStatus");
  }
  nepalOutletRegistration(_p: NepalOutletRegistrationParams) {
    return this.ni("nepalOutletRegistration");
  }
  nepalOutletEkycInitiate(_p: NepalOutletEkycInitiateParams) {
    return this.ni("nepalOutletEkycInitiate");
  }
  nepalOutletEkycInitiateStatus(_p: NepalOutletEkycInitiateStatusParams) {
    return this.ni("nepalOutletEkycInitiateStatus");
  }
  nepalOutletEkycProcess(_p: NepalOutletEkycProcessParams) {
    return this.ni("nepalOutletEkycProcess");
  }
  nepalOtpRequest(_p: NepalOtpRequestParams) {
    return this.ni("nepalOtpRequest");
  }
  nepalRemitterRegistration(_p: NepalRemitterRegistrationParams) {
    return this.ni("nepalRemitterRegistration");
  }
  nepalRemitterEkycInitiate(_p: NepalRemitterEkycInitiateParams) {
    return this.ni("nepalRemitterEkycInitiate");
  }
  nepalRemitterEkycInitiateStatus(_p: NepalRemitterEkycInitiateStatusParams) {
    return this.ni("nepalRemitterEkycInitiateStatus");
  }
  nepalRemitterEkycProcess(_p: NepalRemitterEkycProcessParams) {
    return this.ni("nepalRemitterEkycProcess");
  }
  nepalRemitterUpdate(_p: NepalRemitterUpdateParams) {
    return this.ni("nepalRemitterUpdate");
  }
  nepalBeneficiaryRegistration(_p: NepalBeneficiaryRegistrationParams) {
    return this.ni("nepalBeneficiaryRegistration");
  }
  nepalServiceCharge(_p: NepalServiceChargeParams) {
    return this.ni("nepalServiceCharge");
  }
  nepalFundTransfer(_p: NepalFundTransferParams) {
    return this.ni("nepalFundTransfer");
  }
  nepalFetchTransactionStatus(_p: NepalFetchTransactionStatusParams) {
    return this.ni("nepalFetchTransactionStatus");
  }
  nepalRemitterProfile(_p: NepalRemitterProfileParams) {
    return this.ni("nepalRemitterProfile");
  }
  bbpsFetchBill(_p: BbpsFetchBillParams) {
    return this.ni("bbpsFetchBill");
  }
  bbpsPayBill(_p: BbpsPayBillParams) {
    return this.ni("bbpsPayBill");
  }
  agentAuth(_p: AgentAuthParams) {
    return this.ni("agentAuth");
  }
}
