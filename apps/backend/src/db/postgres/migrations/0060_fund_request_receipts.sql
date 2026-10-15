CREATE TABLE IF NOT EXISTS "fund_request_receipts" (
  "fund_request_id" bigint PRIMARY KEY REFERENCES "fund_requests"("id") ON DELETE RESTRICT,
  "file_name" varchar(200),
  "data_url" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
