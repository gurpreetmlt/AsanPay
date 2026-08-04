import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { transactions } from "../src/db/postgres/schema";
import { createWorld, type World } from "./helpers/world";

// Step 16 / P8: concurrent-transaction load against the SAME wallet after ledger cut-over.
// Fixtures fund via journals (world.setBalance). Default 500 concurrent DMT debits.
//
// Env: LOAD_DEBIT_N (1–500, default 500). Vitest needs optional native deps —
// on Coolify prefer: npm run verify:load
let w: World;

const CONCURRENCY = Math.min(Math.max(Number(process.env.LOAD_DEBIT_N || 500), 1), 500);
const UNIT_AMOUNT = "10.00";
const TIMEOUT_MS = Math.max(120_000, CONCURRENCY * 200);

beforeAll(async () => {
  process.env.LEDGER_TENANT_CODE = "LEDGERTEST";
  w = await createWorld(`ld${Date.now().toString(36)}`);
  await w.addService("dmt");
}, TIMEOUT_MS);

beforeEach(async () => {
  await w.setBalance(w.retailerMainWalletId, "0");
  await db.delete(transactions).where(eq(transactions.userId, w.retailerId));
});

afterAll(async () => {
  await w.destroy();
  await pgPool.end();
});

describe("wallet concurrency load (Step 16 / P8)", () => {
  it(
    `P8.1 ${CONCURRENCY} concurrent debits, fund for half: no double-spend, no negative`,
    async () => {
      const affordable = Math.floor(CONCURRENCY / 2);
      await w.setBalance(w.retailerMainWalletId, (affordable * Number(UNIT_AMOUNT)).toFixed(2));

      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENCY }, (_, i) => w.runDmt(UNIT_AMOUNT, `p81-${w.suffix}-${i}`)),
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      expect(fulfilled).toBe(affordable);
      expect(Number(await w.getBalance(w.retailerMainWalletId))).toBeGreaterThanOrEqual(0);
      expect(await w.getHoldBalance(w.retailerMainWalletId)).toBe("0.00");
    },
    TIMEOUT_MS,
  );

  it(
    `P8.2 ${CONCURRENCY} concurrent debits, fund for all: settle + hold clear`,
    async () => {
      await w.setBalance(w.retailerMainWalletId, (CONCURRENCY * Number(UNIT_AMOUNT)).toFixed(2));

      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENCY }, (_, i) => w.runDmt(UNIT_AMOUNT, `p82-${w.suffix}-${i}`)),
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      expect(fulfilled).toBe(CONCURRENCY);
      expect(await w.getBalance(w.retailerMainWalletId)).toBe("0.00");
      expect(await w.getHoldBalance(w.retailerMainWalletId)).toBe("0.00");
    },
    TIMEOUT_MS,
  );
});
