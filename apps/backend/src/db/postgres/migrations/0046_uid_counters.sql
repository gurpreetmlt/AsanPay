-- Per-role sequential public UIDs: ASPRT / ASPD / ASPSD / ASPAD + 6-digit start 100001.
CREATE TABLE IF NOT EXISTS "uid_counters" (
  "role" varchar(32) PRIMARY KEY NOT NULL,
  "next_value" bigint NOT NULL
);

INSERT INTO "uid_counters" ("role", "next_value") VALUES
  ('retailer', 100001),
  ('distributor', 100001),
  ('super_distributor', 100001),
  ('admin', 100001)
ON CONFLICT ("role") DO NOTHING;
