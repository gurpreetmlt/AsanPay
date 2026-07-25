import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { transactions } from "../src/db/postgres/schema";
import { createWorld, type World } from "./helpers/world";

// Checklist item 8: concurrent-transaction load test — 100+ simultaneous requests against the
// SAME wallet, confirming row-locking (SELECT ... FOR UPDATE) prevents a race/double-debit and
// that hold_balance always unwinds back to 0 once every txn has settled.
let w: World;

const CONCURRENCY = 120;
const UNIT_AMOUNT = "10.00";

beforeAll(async () => {
  w = await createWorld(`ld${Date.now().toString(36)}`);
  await w.addService("dmt");
});

beforeEach(async () => {
  await w.setBalance(w.retailerMainWalletId, "0");
  await db.delete(transactions).where(eq(transactions.userId, w.retailerId));
});

afterAll(async () => {
  await w.destroy();
  await pgPool.end();
});

describe("wallet concurrency load (P8)", () => {
  it(`P8.1 ${CONCURRENCY} concurrent debits against a wallet funded for exactly half of them: no double-spend, no negative balance`, async () => {
    const affordable = Math.floor(CONCURRENCY / 2);
    await w.setBalance(w.retailerMainWalletId, (affordable * Number(UNIT_AMOUNT)).toFixed(2));

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, (_, i) => w.runDmt(UNIT_AMOUNT, `p81-${w.suffix}-${i}`)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilled).toBe(affordable); // exactly the affordable count went through — never more
    expect(Number(await w.getBalance(w.retailerMainWalletId))).toBeGreaterThanOrEqual(0); // never negative
    expect(await w.getHoldBalance(w.retailerMainWalletId)).toBe("0.00"); // every hold released once settled
  }, 30000);

  it(`P8.2 ${CONCURRENCY} concurrent debits, wallet funded for all of them: every txn settles and hold_balance returns to 0`, async () => {
    await w.setBalance(w.retailerMainWalletId, (CONCURRENCY * Number(UNIT_AMOUNT)).toFixed(2));

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, (_, i) => w.runDmt(UNIT_AMOUNT, `p82-${w.suffix}-${i}`)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilled).toBe(CONCURRENCY);
    expect(await w.getBalance(w.retailerMainWalletId)).toBe("0.00");
    expect(await w.getHoldBalance(w.retailerMainWalletId)).toBe("0.00"); // no reservation left stuck
  }, 30000);
});
