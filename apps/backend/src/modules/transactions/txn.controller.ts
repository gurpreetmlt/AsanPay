import type { Request, Response } from "express";
import { executeServiceTxn, recheckTxnStatus, listMyTransactions, getReceipt } from "./txn.service";
import { streamTxnReceiptPdf } from "./receiptPdf";
import { streamTxnReceiptEscPos } from "./receiptEscPos";
import { assertTxnAuthorization } from "../auth/txnPin";
import { assertAgentAuthFresh } from "../auth/agentAuth";
import { nobleApGenerateOtp } from "../onboarding/nobleAepsSession.service";
import { assertFreshBiometric } from "./biometricReplay";
import { resolveProvidersForService, callProvider } from "../providers/provider.router";
import {
  assertAepsCompliance,
  assertWithinServiceGeofence,
  clearBiometricMismatch,
  getServiceGeoAnchors,
  recordBiometricMismatch,
  recordCashReceipt,
  touchLastAepsTxn,
} from "../aeps/compliance";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import type {
  rechargeSchema,
  rechargeMobileInfoSchema,
  rechargeMobilePlansSchema,
  rechargeMobileOffersSchema,
  rechargeDthPlansSchema,
  rechargeDthInfoSchema,
  bbpsFetchBillSchema,
  bbpsPayBillSchema,
  dmtBeneficiarySchema,
  dmtBankNameCheckSchema,
  dmtBeneficiaryDeleteSchema,
  dmtBeneficiaryVerifySchema,
  dmtTransactionOtpSchema,
  dmtRemitterProfileSchema,
  dmtRemitterRegisterSchema,
  dmtRemitterRegisterVerifySchema,
  dmtRemitterKycSchema,
  dmtRefundOtpSchema,
  dmtRefundSchema,
  dmtTransferSchema,
  aepsEnquirySchema,
  aepsTxnOtpSchema,
  aepsWithdrawSchema,
  aepsDepositSchema,
  aadhaarPaySchema,
} from "./txn.validators";
import { z } from "zod";

function actor(req: Request) {
  return { id: req.auth!.sub, role: req.auth!.role };
}

function looksLikeBioMismatch(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("biometric") && (m.includes("mismatch") || m.includes("not match") || m.includes("failed"));
}

async function afterAepsProviderResult(
  userId: string,
  aadhaarNumber: string,
  result: { success: boolean; status: string; message: string },
): Promise<void> {
  if (result.success && result.status === "success") {
    await clearBiometricMismatch(userId, aadhaarNumber);
    await touchLastAepsTxn(userId);
    return;
  }
  if (looksLikeBioMismatch(result.message)) {
    await recordBiometricMismatch(userId, aadhaarNumber);
  }
}

// ── Recharge ────────────────────────────────────────────────────────────────
export async function recharge(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof rechargeSchema>;
  await assertTxnAuthorization(actor(req).id, { txnPin: body.txnPin, txnAuth: body.txnAuth });

  // Customer fee: resolved server-side inside executeServiceTxn (service_charges) — never from body.
  const outcome = await executeServiceTxn({
    actor: actor(req),
    serviceCode: body.serviceCode,
    amount: body.amount,
    idempotencyKey: body.idempotencyKey,
    operation: "recharge",
    direction: "debit",
    walletType: "main",
    metadata: { operatorCode: body.operatorCode, accountRef: body.accountRef },
    invoke: (routed, txnRef) =>
      routed.adapter.recharge({
        retailerUserId: actor(req).id,
        serviceCode: body.serviceCode,
        operatorCode: body.operatorCode,
        accountRef: body.accountRef,
        amount: body.amount,
        clientRef: txnRef,
      }),
  });
  sendSuccess(res, { txn: outcome.txn, provider: outcome.provider });
}

/** BestAPI: detect operator + circle for a prepaid mobile number. */
export async function rechargeMobileInfo(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof rechargeMobileInfoSchema>;
  const { lookupMobileRechargeInfo } = await import("../providers/bestapi/plans.service");
  const info = await lookupMobileRechargeInfo(body.mobile);
  sendSuccess(res, info, "OK");
}

export async function rechargeMobilePlans(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof rechargeMobilePlansSchema>;
  const { fetchMobilePlans } = await import("../providers/bestapi/plans.service");
  const plans = await fetchMobilePlans(body);
  sendSuccess(res, { plans }, "OK");
}

export async function rechargeMobileOffers(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof rechargeMobileOffersSchema>;
  const { fetchMobileOffers } = await import("../providers/bestapi/plans.service");
  const offers = await fetchMobileOffers(body);
  sendSuccess(res, { offers }, "OK");
}

export async function rechargeDthPlans(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof rechargeDthPlansSchema>;
  const { fetchDthPlans } = await import("../providers/bestapi/plans.service");
  const plans = await fetchDthPlans(body.operatorCode);
  sendSuccess(res, { plans }, "OK");
}

export async function rechargeDthInfo(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof rechargeDthInfoSchema>;
  const { fetchDthInfo } = await import("../providers/bestapi/plans.service");
  const info = await fetchDthInfo(body);
  sendSuccess(res, info, "OK");
}

// ── BBPS ────────────────────────────────────────────────────────────────────
// Bill fetch moves no money — a plain provider read, no txn row.
export async function bbpsFetchBill(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof bbpsFetchBillSchema>;
  const routedProviders = await resolveProvidersForService(body.serviceCode);
  const result = await callProvider(routedProviders[0]!, "bbps_fetch_bill", null, { billerCode: body.billerCode }, (adapter) =>
    adapter.bbpsFetchBill({
      retailerUserId: actor(req).id,
      billerCode: body.billerCode,
      customerParams: body.customerParams,
    }),
  );
  sendSuccess(res, result);
}

export async function bbpsPayBill(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof bbpsPayBillSchema>;
  await assertTxnAuthorization(actor(req).id, { txnPin: body.txnPin, txnAuth: body.txnAuth });

  // Customer fee: server-side resolve inside executeServiceTxn — not from body.
  const outcome = await executeServiceTxn({
    actor: actor(req),
    serviceCode: body.serviceCode,
    amount: body.amount,
    idempotencyKey: body.idempotencyKey,
    operation: "bbps_pay_bill",
    direction: "debit",
    walletType: "main",
    metadata: { billerCode: body.billerCode, billFetchRef: body.billFetchRef, customerParams: body.customerParams },
    invoke: (routed) =>
      routed.adapter.bbpsPayBill({
        retailerUserId: actor(req).id,
        billerCode: body.billerCode,
        customerParams: body.customerParams,
        billFetchRef: body.billFetchRef,
        amount: body.amount,
      }),
  });
  sendSuccess(res, { txn: outcome.txn, provider: outcome.provider });
}

// ── DMT ─────────────────────────────────────────────────────────────────────
export async function dmtRemitterProfile(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtRemitterProfileSchema>;
  const userId = actor(req).id;
  const routedProviders = await resolveProvidersForService("dmt_remitter_profile");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_remitter_profile",
    null,
    { customerMobile: body.customerMobile },
    (adapter) =>
      adapter.dmtRemitterProfile({
        retailerUserId: userId,
        customerMobile: body.customerMobile,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

export async function dmtRemitterRegister(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtRemitterRegisterSchema>;
  const userId = actor(req).id;
  const routedProviders = await resolveProvidersForService("dmt_remitter_register");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_remitter_register",
    null,
    { customerMobile: body.customerMobile },
    (adapter) =>
      adapter.dmtRemitterRegister({
        retailerUserId: userId,
        customerMobile: body.customerMobile,
        aadhaarNumber: body.aadhaarNumber,
        referenceKey: body.referenceKey,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

export async function dmtRemitterRegisterVerify(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtRemitterRegisterVerifySchema>;
  const userId = actor(req).id;
  const routedProviders = await resolveProvidersForService("dmt_remitter_register_verify");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_remitter_register_verify",
    null,
    { customerMobile: body.customerMobile },
    (adapter) =>
      adapter.dmtRemitterRegisterVerify({
        retailerUserId: userId,
        customerMobile: body.customerMobile,
        otp: body.otp,
        referenceKey: body.referenceKey,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

export async function dmtRemitterKyc(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtRemitterKycSchema>;
  const userId = actor(req).id;
  const routedProviders = await resolveProvidersForService("dmt_remitter_kyc");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_remitter_kyc",
    null,
    // Biometric payload never goes into provider_logs context — only the mobile.
    { customerMobile: body.customerMobile },
    (adapter) =>
      adapter.dmtRemitterKyc({
        retailerUserId: userId,
        customerMobile: body.customerMobile,
        referenceKey: body.referenceKey,
        biometricPayload: body.biometricPayload,
        captureType: body.captureType,
        latitude: body.latitude,
        longitude: body.longitude,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

export async function dmtAddBeneficiary(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtBeneficiarySchema>;
  const routedProviders = await resolveProvidersForService("dmt_add_beneficiary");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_add_beneficiary",
    null,
    { customerMobile: body.customerMobile, accountNumber: body.accountNumber, ifsc: body.ifsc },
    (adapter) =>
      adapter.dmtAddBeneficiary({
        retailerUserId: actor(req).id,
        ...body,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

/** Paid bank name check before adding a payee: pennyless first, ₹1 penny drop only if that fails. */
export async function dmtBankNameCheck(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtBankNameCheckSchema>;
  const { runBankNameCheck } = await import("./bankNameCheck.service");
  sendSuccess(res, await runBankNameCheck(actor(req), body));
}

export async function dmtBankNameCheckPrice(_req: Request, res: Response): Promise<void> {
  const { bankCheckPrices } = await import("./bankNameCheck.service");
  sendSuccess(res, bankCheckPrices());
}

export async function dmtAddBeneficiaryVerify(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtBeneficiaryVerifySchema>;
  const routedProviders = await resolveProvidersForService("dmt_add_beneficiary_verify");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_add_beneficiary_verify",
    null,
    { customerMobile: body.customerMobile, beneficiaryId: body.beneficiaryId },
    (adapter) =>
      adapter.dmtAddBeneficiaryVerify({
        retailerUserId: actor(req).id,
        ...body,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

export async function dmtDeleteBeneficiaryVerify(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtBeneficiaryVerifySchema>;
  const routedProviders = await resolveProvidersForService("dmt_delete_beneficiary_verify");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_delete_beneficiary_verify",
    null,
    { customerMobile: body.customerMobile, beneficiaryId: body.beneficiaryId },
    (adapter) =>
      adapter.dmtDeleteBeneficiaryVerify({
        retailerUserId: actor(req).id,
        ...body,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

export async function dmtDeleteBeneficiary(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtBeneficiaryDeleteSchema>;
  const routedProviders = await resolveProvidersForService("dmt_delete_beneficiary");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_delete_beneficiary",
    null,
    { customerMobile: body.customerMobile, beneficiaryId: body.beneficiaryId },
    (adapter) =>
      adapter.dmtDeleteBeneficiary({
        retailerUserId: actor(req).id,
        ...body,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

export async function dmtGenerateTransactionOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtTransactionOtpSchema>;
  const routedProviders = await resolveProvidersForService("dmt_txn_otp");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_txn_otp",
    null,
    { customerMobile: body.customerMobile, amount: body.amount },
    (adapter) =>
      adapter.dmtGenerateTransactionOtp({
        retailerUserId: actor(req).id,
        ...body,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

// Refund OTP — only for pending txns flagged ReversalAuthorisationRequired (optional7 in
// statement/status-check response). Sends OTP to remitter; referenceKey feeds the refund call.
export async function dmtTransactionRefundOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtRefundOtpSchema>;
  const routedProviders = await resolveProvidersForService("dmt_refund_otp");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_refund_otp",
    null,
    { ipayId: body.ipayId },
    (adapter) =>
      adapter.dmtTransactionRefundOtp({
        retailerUserId: actor(req).id,
        ipayId: body.ipayId,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

// Refund confirm — OTP + referenceKey from the refund OTP step. Provider-side reversal only;
// hamare ledger mein wallet credit recheck (`POST /api/txn/:txnRef/recheck`) se hota hai.
export async function dmtTransactionRefund(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtRefundSchema>;
  const routedProviders = await resolveProvidersForService("dmt_refund");
  const result = await callProvider(
    routedProviders[0]!,
    "dmt_refund",
    null,
    { ipayId: body.ipayId },
    (adapter) =>
      adapter.dmtTransactionRefund({
        retailerUserId: actor(req).id,
        ipayId: body.ipayId,
        referenceKey: body.referenceKey,
        otp: body.otp,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

export async function dmtTransfer(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof dmtTransferSchema>;
  await assertAgentAuthFresh(actor(req).id);
  await assertTxnAuthorization(actor(req).id, { txnPin: body.txnPin, txnAuth: body.txnAuth });

  if (body.latitude && body.longitude) {
    await assertWithinServiceGeofence(await getServiceGeoAnchors(actor(req).id), {
      latitude: body.latitude,
      longitude: body.longitude,
    });
  }

  // Customer fee: server-side resolve inside executeServiceTxn — not from body.
  const outcome = await executeServiceTxn({
    actor: actor(req),
    serviceCode: "dmt",
    amount: body.amount,
    idempotencyKey: body.idempotencyKey,
    operation: "dmt_transfer",
    direction: "debit",
    walletType: "main",
    metadata: {
      customerMobile: body.customerMobile,
      accountNumber: body.accountNumber,
      ifsc: body.ifsc,
      beneficiaryId: body.beneficiaryId,
      mode: body.mode,
    },
    invoke: (routed, txnRef) =>
      routed.adapter.dmtTransfer({
        retailerUserId: actor(req).id,
        customerMobile: body.customerMobile,
        accountNumber: body.accountNumber,
        ifsc: body.ifsc,
        amount: body.amount,
        mode: body.mode,
        otp: body.otp,
        referenceKey: body.referenceKey,
        beneficiaryId: body.beneficiaryId,
        latitude: body.latitude,
        longitude: body.longitude,
        // externalRef = our txnRef so the provider's txn-status report can find it on recheck.
        externalRef: txnRef,
        endpointIp: req.ip ?? undefined,
      }),
  });
  sendSuccess(res, { txn: outcome.txn, provider: outcome.provider });
}

// ── AEPS ────────────────────────────────────────────────────────────────────
export async function aepsBankList(req: Request, res: Response): Promise<void> {
  const userId = actor(req).id;
  const routedProviders = await resolveProvidersForService("aeps_bank_list");
  const result = await callProvider(routedProviders[0]!, "aeps_bank_list", null, {}, (adapter) =>
    adapter.aepsBankList({ retailerUserId: userId, endpointIp: req.ip ?? undefined }),
  );
  sendSuccess(res, result);
}

/** DMT remittance bank directory. */
export async function dmtBankList(req: Request, res: Response): Promise<void> {
  const userId = actor(req).id;
  const routedProviders = await resolveProvidersForService("dmt_bank_list");
  const result = await callProvider(routedProviders[0]!, "dmt_bank_list", null, {}, (adapter) =>
    adapter.dmtBankList({ retailerUserId: userId, endpointIp: req.ip ?? undefined }),
  );
  sendSuccess(res, result);
}

/** Nepal remittance is not offered on the current provider — every route answers with this. */
export async function nepalComingSoon(_req: Request, _res: Response): Promise<void> {
  throw new HttpError(503, "Nepal remittance is coming soon", "NEPAL_COMING_SOON");
}

export async function aepsBalanceEnquiry(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof aepsEnquirySchema>;
  const userId = actor(req).id;
  await assertAgentAuthFresh(userId);
  await assertAepsCompliance(
    userId,
    body.latitude && body.longitude
      ? {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters,
          isMockLocation: body.isMockLocation,
        }
      : null,
  );
  await assertFreshBiometric(body.biometricPayload);
  const routedProviders = await resolveProvidersForService("aeps_balance_enquiry");
  const result = await callProvider(
    routedProviders[0]!,
    "aeps_balance_enquiry",
    null,
    { bankIin: body.bankIin, biometricPayload: body.biometricPayload },
    (adapter) =>
      adapter.aepsBalanceEnquiry({
        retailerUserId: userId,
        ...body,
        endpointIp: req.ip ?? undefined,
      }),
  );
  await afterAepsProviderResult(userId, body.aadhaarNumber, result);
  sendSuccess(res, result);
}

export async function aepsMiniStatement(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof aepsEnquirySchema>;
  const userId = actor(req).id;
  await assertAgentAuthFresh(userId);
  await assertAepsCompliance(
    userId,
    body.latitude && body.longitude
      ? {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters,
          isMockLocation: body.isMockLocation,
        }
      : null,
  );
  await assertFreshBiometric(body.biometricPayload);
  const routedProviders = await resolveProvidersForService("aeps_mini_statement");
  const result = await callProvider(
    routedProviders[0]!,
    "aeps_mini_statement",
    null,
    { bankIin: body.bankIin, biometricPayload: body.biometricPayload },
    (adapter) =>
      adapter.aepsMiniStatement({
        retailerUserId: userId,
        ...body,
        endpointIp: req.ip ?? undefined,
      }),
  );
  await afterAepsProviderResult(userId, body.aadhaarNumber, result);
  sendSuccess(res, result);
}

/** OTP for ₹5,000+ withdrawals. Moves no money; returns a provider referenceKey. */
export async function aepsWithdrawOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof aepsTxnOtpSchema>;
  const userId = actor(req).id;
  await assertAgentAuthFresh(userId);
  await assertAepsCompliance(
    userId,
    body.latitude && body.longitude
      ? {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters,
          isMockLocation: body.isMockLocation,
        }
      : null,
  );
  const routedProviders = await resolveProvidersForService("aeps_cash_withdrawal");
  const result = await callProvider(
    routedProviders[0]!,
    "aeps_txn_otp",
    null,
    { bankIin: body.bankIin, amount: body.amount },
    (adapter) =>
      adapter.aepsTransactionOtp({
        retailerUserId: userId,
        aadhaarNumber: body.aadhaarNumber,
        bankIin: body.bankIin,
        mobile: body.mobile,
        amount: body.amount,
        latitude: body.latitude,
        longitude: body.longitude,
        endpointIp: req.ip ?? undefined,
      }),
  );
  sendSuccess(res, result);
}

export async function aepsWithdraw(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof aepsWithdrawSchema>;
  const userId = actor(req).id;
  await assertAgentAuthFresh(userId);
  await assertAepsCompliance(
    userId,
    body.latitude && body.longitude
      ? {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters,
          isMockLocation: body.isMockLocation,
        }
      : null,
  );
  await assertFreshBiometric(body.biometricPayload);
  await assertTxnAuthorization(userId, { txnPin: body.txnPin, txnAuth: body.txnAuth });

  const outcome = await executeServiceTxn({
    actor: actor(req),
    serviceCode: "aeps_cash_withdrawal",
    amount: body.amount,
    idempotencyKey: body.idempotencyKey,
    operation: "aeps_withdraw",
    direction: "credit", // retailer paid out cash; reimbursed into AEPS wallet on success
    walletType: "aeps",
    metadata: {
      bankIin: body.bankIin,
      customerMobile: body.mobile,
      latitude: body.latitude,
      longitude: body.longitude,
    },
    invoke: (routed, txnRef) =>
      routed.adapter.aepsWithdraw({
        retailerUserId: userId,
        aadhaarNumber: body.aadhaarNumber,
        bankIin: body.bankIin,
        mobile: body.mobile,
        biometricPayload: body.biometricPayload,
        amount: body.amount,
        latitude: body.latitude,
        longitude: body.longitude,
        otpReferenceKey: body.otpReferenceKey,
        // externalRef = our txnRef so the provider's txn-status report can find it on recheck.
        externalRef: txnRef,
        endpointIp: req.ip ?? undefined,
      }),
  });

  if (outcome.provider) {
    await afterAepsProviderResult(userId, body.aadhaarNumber, outcome.provider);
    if (outcome.provider.success && outcome.provider.status === "success") {
      await recordCashReceipt({
        userId,
        txnId: outcome.txn.id,
        txnRef: outcome.txn.txnRef,
        amount: body.amount,
        customerMobile: body.mobile,
        bankIin: body.bankIin,
        latitude: body.latitude,
        longitude: body.longitude,
        notes: "Auto cash register entry on successful AePS withdrawal",
      });
    }
  }
  sendSuccess(res, { txn: outcome.txn, provider: outcome.provider });
}

export async function aepsDeposit(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof aepsDepositSchema>;
  const userId = actor(req).id;
  await assertAgentAuthFresh(userId);
  await assertAepsCompliance(
    userId,
    body.latitude && body.longitude
      ? {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters,
          isMockLocation: body.isMockLocation,
        }
      : null,
  );
  await assertFreshBiometric(body.biometricPayload);
  await assertTxnAuthorization(userId, { txnPin: body.txnPin, txnAuth: body.txnAuth });

  // Customer fee: server-side resolve inside executeServiceTxn — not from body.
  const outcome = await executeServiceTxn({
    actor: actor(req),
    serviceCode: "aeps_cash_deposit",
    amount: body.amount,
    idempotencyKey: body.idempotencyKey,
    operation: "aeps_deposit",
    // Retailer collects physical cash and their AEPS wallet funds the bank credit —
    // debit is held up-front and reversed if the provider fails.
    direction: "debit",
    walletType: "aeps",
    metadata: {
      bankIin: body.bankIin,
      customerMobile: body.mobile,
      latitude: body.latitude,
      longitude: body.longitude,
    },
    invoke: (routed, txnRef) =>
      routed.adapter.aepsDeposit({
        retailerUserId: userId,
        aadhaarNumber: body.aadhaarNumber,
        bankIin: body.bankIin,
        mobile: body.mobile,
        biometricPayload: body.biometricPayload,
        amount: body.amount,
        latitude: body.latitude,
        longitude: body.longitude,
        externalRef: txnRef,
        endpointIp: req.ip ?? undefined,
      }),
  });

  if (outcome.provider) {
    await afterAepsProviderResult(userId, body.aadhaarNumber, outcome.provider);
  }
  sendSuccess(res, { txn: outcome.txn, provider: outcome.provider });
}

export async function aadhaarPay(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof aadhaarPaySchema>;
  const userId = actor(req).id;
  await assertAgentAuthFresh(userId);
  await assertAepsCompliance(
    userId,
    body.latitude && body.longitude
      ? {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters,
          isMockLocation: body.isMockLocation,
        }
      : null,
  );
  await assertFreshBiometric(body.biometricPayload);
  await assertTxnAuthorization(userId, { txnPin: body.txnPin, txnAuth: body.txnAuth });

  const outcome = await executeServiceTxn({
    actor: actor(req),
    serviceCode: "aadhaar_pay",
    amount: body.amount,
    idempotencyKey: body.idempotencyKey,
    operation: "aadhaar_pay",
    direction: "credit",
    walletType: "aeps",
    metadata: {
      bankIin: body.bankIin,
      customerMobile: body.mobile,
      latitude: body.latitude,
      longitude: body.longitude,
      captureType: body.captureType ?? "FINGER",
    },
    invoke: (routed, txnRef) =>
      routed.adapter.aadhaarPay({
        retailerUserId: userId,
        aadhaarNumber: body.aadhaarNumber,
        bankIin: body.bankIin,
        mobile: body.mobile,
        biometricPayload: body.biometricPayload,
        captureType: body.captureType,
        amount: body.amount,
        latitude: body.latitude,
        longitude: body.longitude,
        otpReferenceKey: body.otpReferenceKey,
        otpTransactionId: body.otpTransactionId,
        otpTransactionToken: body.otpTransactionToken,
        externalRef: txnRef,
        endpointIp: req.ip ?? undefined,
      }),
  });
  if (outcome.provider) {
    await afterAepsProviderResult(userId, body.aadhaarNumber, outcome.provider);
  }
  sendSuccess(res, { txn: outcome.txn, provider: outcome.provider });
}

/** Aadhaar Pay OTP — only when AP load agent returned tranTypeForOtp=MT and amount ≥ amountForOtp. Moves no money. */
export async function aadhaarPayOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof aepsTxnOtpSchema>;
  const userId = actor(req).id;
  await assertAepsCompliance(
    userId,
    body.latitude && body.longitude
      ? {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters,
          isMockLocation: body.isMockLocation,
        }
      : null,
  );
  sendSuccess(
    res,
    await nobleApGenerateOtp(userId, {
      amount: body.amount,
      bankIin: body.bankIin,
      mobile: body.mobile,
      aadhaarNumber: body.aadhaarNumber,
      latitude: body.latitude,
      longitude: body.longitude,
      endpointIp: req.ip ?? undefined,
    }),
  );
}

// ── History / receipt / recheck ─────────────────────────────────────────────
const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function history(req: Request, res: Response): Promise<void> {
  const { limit, offset } = historyQuerySchema.parse(req.query);
  sendSuccess(res, await listMyTransactions(actor(req), limit, offset));
}

export async function receipt(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await getReceipt(actor(req), req.params.txnRef as string));
}

export async function receiptPdf(req: Request, res: Response): Promise<void> {
  await streamTxnReceiptPdf(actor(req), req.params.txnRef as string, res);
}

export async function receiptEscPos(req: Request, res: Response): Promise<void> {
  await streamTxnReceiptEscPos(actor(req), req.params.txnRef as string, res);
}

export async function recheck(req: Request, res: Response): Promise<void> {
  const outcome = await recheckTxnStatus(actor(req), req.params.txnRef as string);
  sendSuccess(res, { txn: outcome.txn, provider: outcome.provider });
}
