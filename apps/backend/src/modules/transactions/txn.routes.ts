import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validateBody } from "../../middleware/validate";
import {
  recharge,
  rechargeMobileInfo,
  bbpsFetchBill,
  bbpsPayBill,
  dmtAddBeneficiary,
  dmtAddBeneficiaryVerify,
  dmtDeleteBeneficiary,
  dmtDeleteBeneficiaryVerify,
  dmtGenerateTransactionOtp,
  dmtTransactionRefundOtp,
  dmtTransactionRefund,
  dmtTransfer,
  dmtBankList,
  nepalStaticData,
  nepalPaymentLocationList,
  nepalStateDistrict,
  nepalOutletStatus,
  nepalOutletRegistration,
  nepalOutletEkycInitiate,
  nepalOutletEkycInitiateStatus,
  nepalOutletEkycProcess,
  nepalRemitterProfile,
  nepalOtpRequest,
  nepalRemitterRegistration,
  nepalRemitterEkycInitiate,
  nepalRemitterEkycInitiateStatus,
  nepalRemitterEkycProcess,
  nepalRemitterUpdate,
  nepalBeneficiaryRegistration,
  nepalServiceCharge,
  nepalFundTransfer,
  nepalFetchTransactionStatus,
  dmtRemitterProfile,
  dmtRemitterRegister,
  dmtRemitterRegisterVerify,
  dmtRemitterKyc,
  aepsBankList,
  aepsBalanceEnquiry,
  aepsMiniStatement,
  aepsWithdraw,
  aepsWithdrawOtp,
  aepsDeposit,
  aadhaarPay,
  history,
  receipt,
  receiptPdf,
  receiptEscPos,
  recheck,
} from "./txn.controller";
import {
  rechargeSchema,
  rechargeMobileInfoSchema,
  bbpsFetchBillSchema,
  bbpsPayBillSchema,
  dmtBeneficiarySchema,
  dmtBeneficiaryDeleteSchema,
  dmtBeneficiaryVerifySchema,
  dmtTransactionOtpSchema,
  dmtRemitterProfileSchema,
  dmtRemitterRegisterSchema,
  dmtRemitterRegisterVerifySchema,
  dmtRemitterKycSchema,
  dmtRefundOtpSchema,
  dmtRefundSchema,
  nepalStaticDataSchema,
  nepalPaymentLocationListSchema,
  nepalStateDistrictSchema,
  nepalOutletStatusSchema,
  nepalOutletRegistrationSchema,
  nepalOutletEkycStatusSchema,
  nepalOutletEkycProcessSchema,
  nepalRemitterProfileSchema,
  nepalOtpRequestSchema,
  nepalRemitterRegistrationSchema,
  nepalRemitterEkycInitiateSchema,
  nepalRemitterEkycStatusSchema,
  nepalRemitterEkycProcessSchema,
  nepalRemitterUpdateSchema,
  nepalBeneficiaryRegistrationSchema,
  nepalServiceChargeSchema,
  nepalFundTransferSchema,
  nepalFetchTransactionStatusSchema,
  dmtTransferSchema,
  aepsEnquirySchema,
  aepsTxnOtpSchema,
  aepsWithdrawSchema,
  aepsDepositSchema,
  aadhaarPaySchema,
} from "./txn.validators";
import { walletTxnLimiter } from "../../middleware/rateLimiter";

export const txnRouter = Router();

txnRouter.use(requireAuth);

// Counter services are retailer-only; history/receipt/recheck also serve admin support tooling.
const retailerOnly = requireRole("retailer");

txnRouter.post("/recharge", retailerOnly, walletTxnLimiter, validateBody(rechargeSchema), recharge);
txnRouter.post(
  "/recharge/mobile-info",
  retailerOnly,
  validateBody(rechargeMobileInfoSchema),
  rechargeMobileInfo,
);

txnRouter.post("/bbps/fetch-bill", retailerOnly, validateBody(bbpsFetchBillSchema), bbpsFetchBill);
txnRouter.post("/bbps/pay", retailerOnly, walletTxnLimiter, validateBody(bbpsPayBillSchema), bbpsPayBill);

txnRouter.get("/dmt/banks", retailerOnly, dmtBankList);
txnRouter.post("/dmt/remitter/profile", retailerOnly, validateBody(dmtRemitterProfileSchema), dmtRemitterProfile);
txnRouter.post("/dmt/remitter/register", retailerOnly, validateBody(dmtRemitterRegisterSchema), dmtRemitterRegister);
txnRouter.post("/dmt/remitter/register/verify", retailerOnly, validateBody(dmtRemitterRegisterVerifySchema), dmtRemitterRegisterVerify);
txnRouter.post("/dmt/remitter/kyc", retailerOnly, validateBody(dmtRemitterKycSchema), dmtRemitterKyc);
txnRouter.post("/dmt/beneficiary", retailerOnly, validateBody(dmtBeneficiarySchema), dmtAddBeneficiary);
txnRouter.post("/dmt/beneficiary/verify", retailerOnly, validateBody(dmtBeneficiaryVerifySchema), dmtAddBeneficiaryVerify);
txnRouter.post("/dmt/beneficiary/delete", retailerOnly, validateBody(dmtBeneficiaryDeleteSchema), dmtDeleteBeneficiary);
txnRouter.post("/dmt/beneficiary/delete/verify", retailerOnly, validateBody(dmtBeneficiaryVerifySchema), dmtDeleteBeneficiaryVerify);
txnRouter.post("/dmt/transfer/otp", retailerOnly, validateBody(dmtTransactionOtpSchema), dmtGenerateTransactionOtp);
txnRouter.post("/dmt/transfer", retailerOnly, walletTxnLimiter, validateBody(dmtTransferSchema), dmtTransfer);
txnRouter.post("/dmt/refund/otp", retailerOnly, validateBody(dmtRefundOtpSchema), dmtTransactionRefundOtp);
txnRouter.post("/dmt/refund", retailerOnly, validateBody(dmtRefundSchema), dmtTransactionRefund);

txnRouter.post("/nepal/static-data", retailerOnly, validateBody(nepalStaticDataSchema), nepalStaticData);
txnRouter.post(
  "/nepal/payment-locations",
  retailerOnly,
  validateBody(nepalPaymentLocationListSchema),
  nepalPaymentLocationList,
);
txnRouter.post("/nepal/state-district", retailerOnly, validateBody(nepalStateDistrictSchema), nepalStateDistrict);
txnRouter.post("/nepal/outlet-status", retailerOnly, validateBody(nepalOutletStatusSchema), nepalOutletStatus);
txnRouter.post(
  "/nepal/outlet-registration",
  retailerOnly,
  validateBody(nepalOutletRegistrationSchema),
  nepalOutletRegistration,
);
txnRouter.post("/nepal/outlet-ekyc/initiate", retailerOnly, nepalOutletEkycInitiate);
txnRouter.post(
  "/nepal/outlet-ekyc/status",
  retailerOnly,
  validateBody(nepalOutletEkycStatusSchema),
  nepalOutletEkycInitiateStatus,
);
txnRouter.post(
  "/nepal/outlet-ekyc/process",
  retailerOnly,
  validateBody(nepalOutletEkycProcessSchema),
  nepalOutletEkycProcess,
);
txnRouter.post(
  "/nepal/remitter/profile",
  retailerOnly,
  validateBody(nepalRemitterProfileSchema),
  nepalRemitterProfile,
);
txnRouter.post("/nepal/otp", retailerOnly, validateBody(nepalOtpRequestSchema), nepalOtpRequest);
txnRouter.post(
  "/nepal/remitter/register",
  retailerOnly,
  validateBody(nepalRemitterRegistrationSchema),
  nepalRemitterRegistration,
);
txnRouter.post(
  "/nepal/remitter/ekyc/initiate",
  retailerOnly,
  validateBody(nepalRemitterEkycInitiateSchema),
  nepalRemitterEkycInitiate,
);
txnRouter.post(
  "/nepal/remitter/ekyc/status",
  retailerOnly,
  validateBody(nepalRemitterEkycStatusSchema),
  nepalRemitterEkycInitiateStatus,
);
txnRouter.post(
  "/nepal/remitter/ekyc/process",
  retailerOnly,
  validateBody(nepalRemitterEkycProcessSchema),
  nepalRemitterEkycProcess,
);
txnRouter.post(
  "/nepal/remitter/update",
  retailerOnly,
  validateBody(nepalRemitterUpdateSchema),
  nepalRemitterUpdate,
);
txnRouter.post(
  "/nepal/beneficiary/register",
  retailerOnly,
  validateBody(nepalBeneficiaryRegistrationSchema),
  nepalBeneficiaryRegistration,
);
txnRouter.post(
  "/nepal/service-charge",
  retailerOnly,
  validateBody(nepalServiceChargeSchema),
  nepalServiceCharge,
);
txnRouter.post(
  "/nepal/fund-transfer",
  retailerOnly,
  walletTxnLimiter,
  validateBody(nepalFundTransferSchema),
  nepalFundTransfer,
);
txnRouter.post(
  "/nepal/txn-status",
  retailerOnly,
  validateBody(nepalFetchTransactionStatusSchema),
  nepalFetchTransactionStatus,
);

txnRouter.get("/aeps/banks", retailerOnly, aepsBankList);
txnRouter.post("/aeps/balance-enquiry", retailerOnly, validateBody(aepsEnquirySchema), aepsBalanceEnquiry);
txnRouter.post("/aeps/mini-statement", retailerOnly, validateBody(aepsEnquirySchema), aepsMiniStatement);
txnRouter.post("/aeps/withdraw/otp", retailerOnly, walletTxnLimiter, validateBody(aepsTxnOtpSchema), aepsWithdrawOtp);
txnRouter.post("/aeps/withdraw", retailerOnly, walletTxnLimiter, validateBody(aepsWithdrawSchema), aepsWithdraw);
txnRouter.post("/aeps/deposit", retailerOnly, walletTxnLimiter, validateBody(aepsDepositSchema), aepsDeposit);
txnRouter.post("/aeps/aadhaar-pay", retailerOnly, walletTxnLimiter, validateBody(aadhaarPaySchema), aadhaarPay);

txnRouter.get("/", history);
txnRouter.get("/:txnRef/receipt/pdf", receiptPdf);
txnRouter.get("/:txnRef/receipt.pdf", receiptPdf);
txnRouter.get("/:txnRef/receipt.escpos", receiptEscPos);
txnRouter.get("/:txnRef", receipt);
// Rate-limited: settlement is idempotent (see finalizeTxn) but recheck still calls the provider,
// so throttle to blunt brute-force retry/race attempts against a single pending txn.
txnRouter.post("/:txnRef/recheck", walletTxnLimiter, recheck);
