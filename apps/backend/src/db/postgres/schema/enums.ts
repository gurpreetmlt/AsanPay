import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "master_distributor",
  "distributor",
  "retailer",
]);

export const kycStatusEnum = pgEnum("kyc_status", ["pending", "verified", "rejected"]);

export const walletTypeEnum = pgEnum("wallet_type", ["main", "aeps"]);

// "ledger" = an internal-only balance (SD/Distributor/Retailer/Company book entry).
// "aggregator" = the platform's single real-money settlement counterparty at the payment
// provider — structurally distinct so it can never be confused with a normal downline wallet.
export const walletKindEnum = pgEnum("wallet_kind", ["ledger", "aggregator"]);

export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", ["debit", "credit"]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "initiated",
  "pending",
  "success",
  "failed",
  "reversed",
  "refunded",
]);

export const commissionRuleTypeEnum = pgEnum("commission_rule_type", ["flat", "percentage"]);

export const otpPurposeEnum = pgEnum("otp_purpose", [
  "login",
  "signup",
  "wallet_pull",
  "email_verify",
  "settlement_bank",
]);

export const supportTicketStatusEnum = pgEnum("support_ticket_status", ["open", "resolved"]);
