import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  integer,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { accounts } from "./accounts";
import { journals } from "./ledger";
import { bankAccounts, bankStatementLines } from "./banking";

export const paymentModeEnum = pgEnum("payment_mode", [
  "cash_deposit",
  "neft",
  "rtgs",
  "imps",
  "upi",
  "cheque",
]);

// Internal states. The retailer never sees these strings — "suspect" in particular must not
// leak into the app, because a genuine duplicate-entry mistake looks exactly like fraud and
// accusing an honest agent costs more than the delay does.
export const fundRequestStatusEnum = pgEnum("fund_request_status", [
  "submitted",
  "pending_match",
  "auto_matched",
  "amount_mismatch",
  "suspect",
  "under_review",
  "credited",
  "rejected",
  "cancelled",
  // Credited by mistake (e.g. a test entry) and reversed by an admin. The credit journals stay;
  // REVERSAL journals undo them.
  "voided",
]);

export const fundRequestActorEnum = pgEnum("fund_request_actor", ["retailer", "admin", "system"]);

export const fundRequests = pgTable(
  "fund_requests",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requesterAccountId: bigint("requester_account_id", { mode: "bigint" })
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    bankAccountId: bigint("bank_account_id", { mode: "bigint" })
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),

    // Paise. `amount` is what the retailer claims; `credited_amount` is what the bank
    // statement actually shows. They are not the same field on purpose — we credit the bank's
    // number, never the retailer's.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    creditedAmount: bigint("credited_amount", { mode: "bigint" }),

    paymentMode: paymentModeEnum("payment_mode").notNull(),
    referenceNumber: varchar("reference_number", { length: 60 }),
    // Uppercased, non-alphanumerics stripped. The unique index below is on this, not the raw
    // value — otherwise "1234-5678" and "12345678" would both claim the same deposit.
    referenceNorm: varchar("reference_norm", { length: 60 }),
    depositDatetime: timestamp("deposit_datetime", { withTimezone: true }).notNull(),
    senderName: varchar("sender_name", { length: 160 }),

    receiptUrl: text("receipt_url").notNull(),
    // People reuse one deposit slip across several accounts. Hashing the image and rejecting a
    // repeat across ALL retailers is the cheapest fraud control in the system.
    receiptSha256: varchar("receipt_sha256", { length: 64 }).notNull(),
    remarks: text("remarks"),

    status: fundRequestStatusEnum("status").notNull().default("submitted"),
    matchConfidence: integer("match_confidence"),
    matchedLineId: bigint("matched_line_id", { mode: "bigint" }).references(
      () => bankStatementLines.id,
      { onDelete: "restrict" },
    ),

    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReasonCode: varchar("reject_reason_code", { length: 40 }),
    rejectRemarks: text("reject_remarks"),

    receiveJournalId: bigint("receive_journal_id", { mode: "bigint" }).references(
      () => journals.id,
      { onDelete: "restrict" },
    ),
    creditJournalId: bigint("credit_journal_id", { mode: "bigint" }).references(() => journals.id, {
      onDelete: "restrict",
    }),

    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    creditedAt: timestamp("credited_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    // Only requests marked as test entries can be deleted (voided) from Bank entries.
    testMarkedAt: timestamp("test_marked_at", { withTimezone: true }),
    testMarkedBy: uuid("test_marked_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    // Hard constraint, not an application check: the same UTR into the same bank account can
    // be claimed exactly once, by anybody. Rejected / cancelled / deleted requests free it up.
    uniqueIndex("fund_requests_bank_ref_uidx")
      .on(table.bankAccountId, table.referenceNorm)
      .where(
        sql`${table.referenceNorm} IS NOT NULL AND ${table.status} NOT IN ('rejected', 'cancelled', 'voided')`,
      ),
    // A bank UTR (12+ chars) credits one request across all banks; shorter slip numbers repeat
    // between banks and are covered per bank by the index above.
    uniqueIndex("fund_requests_credited_utr_uidx")
      .on(table.tenantId, table.referenceNorm)
      .where(
        sql`${table.status} = 'credited' AND ${table.referenceNorm} IS NOT NULL AND length(${table.referenceNorm}) >= 12`,
      ),
    index("fund_requests_tenant_status_idx").on(table.tenantId, table.status, table.submittedAt),
    index("fund_requests_requester_idx").on(table.requesterUserId, table.submittedAt),
    index("fund_requests_receipt_hash_idx").on(table.receiptSha256),
    check("fund_requests_amount_positive", sql`${table.amount} > 0`),
    check(
      "fund_requests_credited_has_journal",
      sql`${table.status} <> 'credited' OR ${table.creditJournalId} IS NOT NULL`,
    ),
  ],
);

// Kept out of fund_requests so list queries never drag the file bytes along.
export const fundRequestReceipts = pgTable("fund_request_receipts", {
  fundRequestId: bigint("fund_request_id", { mode: "bigint" })
    .primaryKey()
    .references(() => fundRequests.id, { onDelete: "restrict" }),
  fileName: varchar("file_name", { length: 200 }),
  dataUrl: text("data_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only state trail. The retailer's timeline view and every dispute are reconstructed
// from this, so nothing here is ever updated or deleted.
export const fundRequestEvents = pgTable(
  "fund_request_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    fundRequestId: bigint("fund_request_id", { mode: "bigint" })
      .notNull()
      .references(() => fundRequests.id, { onDelete: "restrict" }),
    fromStatus: fundRequestStatusEnum("from_status"),
    toStatus: fundRequestStatusEnum("to_status").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorType: fundRequestActorEnum("actor_type").notNull(),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("fund_request_events_request_idx").on(table.fundRequestId, table.createdAt)],
);
