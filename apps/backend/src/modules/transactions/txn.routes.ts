import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validateBody } from "../../middleware/validate";
import {
  recharge,
  rechargeMobileInfo,
  rechargeMobilePlans,
  rechargeMobileOffers,
  rechargeDthPlans,
  rechargeDthInfo,
  bbpsFetchBill,
  bbpsPayBill,
  dmtAddBeneficiary,
  dmtAddBeneficiaryVerify,
  dmtBankNameCheck,
  dmtBankNameCheckPrice,
  dmtDeleteBeneficiary,
  dmtDeleteBeneficiaryVerify,
  dmtGenerateTransactionOtp,
  dmtTransactionRefundOtp,
  dmtTransactionRefund,
  dmtTransfer,
  dmtBankList,
  nepalComingSoon,
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
  aadhaarPayOtp,
  history,
  receipt,
  receiptPdf,
  receiptEscPos,
  recheck,
} from "./txn.controller";
import {
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
txnRouter.post(
  "/recharge/mobile-plans",
  retailerOnly,
  validateBody(rechargeMobilePlansSchema),
  rechargeMobilePlans,
);
txnRouter.post(
  "/recharge/mobile-offers",
  retailerOnly,
  validateBody(rechargeMobileOffersSchema),
  rechargeMobileOffers,
);
txnRouter.post(
  "/recharge/dth-plans",
  retailerOnly,
  validateBody(rechargeDthPlansSchema),
  rechargeDthPlans,
);
txnRouter.post(
  "/recharge/dth-info",
  retailerOnly,
  validateBody(rechargeDthInfoSchema),
  rechargeDthInfo,
);

txnRouter.post("/bbps/fetch-bill", retailerOnly, validateBody(bbpsFetchBillSchema), bbpsFetchBill);
txnRouter.post("/bbps/pay", retailerOnly, walletTxnLimiter, validateBody(bbpsPayBillSchema), bbpsPayBill);

txnRouter.get("/dmt/banks", retailerOnly, dmtBankList);
txnRouter.post("/dmt/remitter/profile", retailerOnly, validateBody(dmtRemitterProfileSchema), dmtRemitterProfile);
txnRouter.post("/dmt/remitter/register", retailerOnly, validateBody(dmtRemitterRegisterSchema), dmtRemitterRegister);
txnRouter.post("/dmt/remitter/register/verify", retailerOnly, validateBody(dmtRemitterRegisterVerifySchema), dmtRemitterRegisterVerify);
txnRouter.post("/dmt/remitter/kyc", retailerOnly, validateBody(dmtRemitterKycSchema), dmtRemitterKyc);
txnRouter.post("/dmt/beneficiary", retailerOnly, validateBody(dmtBeneficiarySchema), dmtAddBeneficiary);
txnRouter.get("/dmt/beneficiary/bank-check/price", retailerOnly, dmtBankNameCheckPrice);
txnRouter.post(
  "/dmt/beneficiary/bank-check",
  retailerOnly,
  walletTxnLimiter,
  validateBody(dmtBankNameCheckSchema),
  dmtBankNameCheck,
);
txnRouter.post("/dmt/beneficiary/verify", retailerOnly, validateBody(dmtBeneficiaryVerifySchema), dmtAddBeneficiaryVerify);
txnRouter.post("/dmt/beneficiary/delete", retailerOnly, validateBody(dmtBeneficiaryDeleteSchema), dmtDeleteBeneficiary);
txnRouter.post("/dmt/beneficiary/delete/verify", retailerOnly, validateBody(dmtBeneficiaryVerifySchema), dmtDeleteBeneficiaryVerify);
txnRouter.post("/dmt/transfer/otp", retailerOnly, validateBody(dmtTransactionOtpSchema), dmtGenerateTransactionOtp);
txnRouter.post("/dmt/transfer", retailerOnly, walletTxnLimiter, validateBody(dmtTransferSchema), dmtTransfer);
txnRouter.post("/dmt/refund/otp", retailerOnly, validateBody(dmtRefundOtpSchema), dmtTransactionRefundOtp);
txnRouter.post("/dmt/refund", retailerOnly, validateBody(dmtRefundSchema), dmtTransactionRefund);

// Older app builds still call these — answer with a clear message instead of 404.
txnRouter.all(["/nepal", "/nepal/*splat"], retailerOnly, nepalComingSoon);

txnRouter.get("/aeps/banks", retailerOnly, aepsBankList);
txnRouter.post("/aeps/balance-enquiry", retailerOnly, validateBody(aepsEnquirySchema), aepsBalanceEnquiry);
txnRouter.post("/aeps/mini-statement", retailerOnly, validateBody(aepsEnquirySchema), aepsMiniStatement);
txnRouter.post("/aeps/withdraw/otp", retailerOnly, walletTxnLimiter, validateBody(aepsTxnOtpSchema), aepsWithdrawOtp);
txnRouter.post("/aeps/withdraw", retailerOnly, walletTxnLimiter, validateBody(aepsWithdrawSchema), aepsWithdraw);
txnRouter.post("/aeps/deposit", retailerOnly, walletTxnLimiter, validateBody(aepsDepositSchema), aepsDeposit);
txnRouter.post("/aeps/aadhaar-pay/otp", retailerOnly, walletTxnLimiter, validateBody(aepsTxnOtpSchema), aadhaarPayOtp);
txnRouter.post("/aeps/aadhaar-pay", retailerOnly, walletTxnLimiter, validateBody(aadhaarPaySchema), aadhaarPay);

txnRouter.get("/", history);
txnRouter.get("/:txnRef/receipt/pdf", receiptPdf);
txnRouter.get("/:txnRef/receipt.pdf", receiptPdf);
txnRouter.get("/:txnRef/receipt.escpos", receiptEscPos);
txnRouter.get("/:txnRef", receipt);
// Rate-limited: settlement is idempotent (see finalizeTxn) but recheck still calls the provider,
// so throttle to blunt brute-force retry/race attempts against a single pending txn.
txnRouter.post("/:txnRef/recheck", walletTxnLimiter, recheck);
