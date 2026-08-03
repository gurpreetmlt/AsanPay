/**
 * End-to-end exercise of the ledger engine against a real Postgres, covering the flows the
 * cut-over will switch over: hierarchy transfer, a three-leg DMT, an AePS credit, a reversal,
 * idempotent replay and the no-overdraft rule.
 *
 * Runs under its own tenant (`LEDGERTEST`), so nothing here can touch ASANPAY's money. The
 * ledger is append-only by design, so these rows are permanent — that is fine, they are
 * isolated by tenant_id and every reconciliation check is tenant-scoped.
 *
 *   sudo docker exec $API npx vitest run test/ledgerEngineIntegration.test.ts
 */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { accounts, accountBalances, tenants } from "../src/db/postgres/schema";
import { postJournal, reverseJournal, clearAccountCache } from "../src/core/ledger";
import { seedSystemAccounts } from "../src/modules/bootstrap/systemAccounts";
import { rupeesToPaise, paiseToRupees } from "../src/core/money";
import {
  checkLedgerVsBalance,
  checkTrialBalance,
  checkSettleable,
  checkNegativeAgentBalance,
} from "../src/modules/reconciliation/checks";

const RUN = randomUUID().slice(0, 8);
const key = (name: string) => `TEST:${RUN}:${name}`;

let tenantId: string;
let RTL: string;
let DIST: string;
let FLOAT: string;

async function balanceOf(code: string): Promise<{ balance: bigint; settleable: bigint }> {
  const [row] = await db
    .select({ balance: accountBalances.balance, settleable: accountBalances.settleable })
    .from(accounts)
    .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)));
  if (!row) throw new Error(`No balance row for ${code}`);
  return row;
}

async function makeAccount(
  code: string,
  accountType: "distributor" | "retailer" | "float",
  accountClass: "liability" | "asset",
): Promise<string> {
  const [row] = await db
    .insert(accounts)
    .values({
      tenantId,
      code,
      name: code,
      accountType,
      accountClass,
      requiresBalanceCheck: accountClass === "liability",
    })
    .onConflictDoNothing({ target: [accounts.tenantId, accounts.code] })
    .returning({ id: accounts.id });

  const id =
    row?.id ??
    (
      await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)))
    )[0]?.id;

  await db
    .insert(accountBalances)
    .values({ accountId: id as bigint })
    .onConflictDoNothing({ target: accountBalances.accountId });

  return code;
}

beforeAll(async () => {
  const [existing] = await db.select().from(tenants).where(eq(tenants.code, "LEDGERTEST")).limit(1);
  const tenant =
    existing ??
    (
      await db
        .insert(tenants)
        .values({ code: "LEDGERTEST", name: "Ledger Engine Test" })
        .returning()
    )[0];

  tenantId = (tenant as { id: string }).id;
  await seedSystemAccounts(tenantId);
  clearAccountCache();

  RTL = await makeAccount(`RTL_T${RUN}`, "retailer", "liability");
  DIST = await makeAccount(`DIST_T${RUN}`, "distributor", "liability");
  FLOAT = await makeAccount(`TREASURY_FLOAT_T${RUN}`, "float", "asset");
}, 60_000);

afterAll(async () => {
  await pgPool.end();
});

describe("ledger engine — the flows the cut-over will switch", () => {
  it("opens a distributor and funds a retailer down the hierarchy", async () => {
    await db.transaction(async (tx) => {
      await postJournal(tx, {
        tenantId,
        txnType: "OPENING_BALANCE",
        idemKey: key("open-dist"),
        entries: [
          { code: "TREASURY_FLOAT_CONTROL", dir: "DR", amount: rupeesToPaise("100000") },
          { code: DIST, dir: "CR", amount: rupeesToPaise("100000") },
        ],
      });
    });

    await db.transaction(async (tx) => {
      await postJournal(tx, {
        tenantId,
        txnType: "WALLET_TRANSFER",
        idemKey: key("dist-to-rtl"),
        entries: [
          { code: DIST, dir: "DR", amount: rupeesToPaise("50000") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("50000") },
        ],
      });
    });

    expect(paiseToRupees((await balanceOf(DIST)).balance)).toBe("50000.00");
    expect(paiseToRupees((await balanceOf(RTL)).balance)).toBe("50000.00");
  });

  it("posts a three-leg DMT: retailer pays float plus our commission income", async () => {
    // Spec §4.5 — Dr RTL 5,025 / Cr FLOAT 5,010 / Cr COMMISSION_INCOME 15.
    await db.transaction(async (tx) => {
      await postJournal(tx, {
        tenantId,
        txnType: "DMT",
        idemKey: key("dmt"),
        entries: [
          { code: RTL, dir: "DR", amount: rupeesToPaise("5025") },
          { code: FLOAT, dir: "CR", amount: rupeesToPaise("5010") },
          { code: "COMMISSION_INCOME", dir: "CR", amount: rupeesToPaise("15") },
        ],
      });
    });

    expect(paiseToRupees((await balanceOf(RTL)).balance)).toBe("44975.00");
    // FLOAT is an asset and was credited, so it falls — money left us for the beneficiary.
    expect(paiseToRupees((await balanceOf(FLOAT)).balance)).toBe("-5010.00");
    expect(paiseToRupees((await balanceOf("COMMISSION_INCOME")).balance)).toBe("15.00");
  });

  it("an AePS credit raises the retailer's balance AND their settleable earning", async () => {
    const before = await balanceOf(RTL);

    await db.transaction(async (tx) => {
      await postJournal(tx, {
        tenantId,
        txnType: "AEPS_WITHDRAWAL",
        idemKey: key("aeps"),
        entries: [
          { code: FLOAT, dir: "DR", amount: rupeesToPaise("2000") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("2000") },
        ],
      });
    });

    const after = await balanceOf(RTL);
    expect(after.balance - before.balance).toBe(rupeesToPaise("2000"));
    // This is the agent's own money — they paid the customer from their cash drawer.
    expect(after.settleable - before.settleable).toBe(rupeesToPaise("2000"));
  });

  it("a downline transfer does NOT create settleable earning", async () => {
    const before = await balanceOf(RTL);

    await db.transaction(async (tx) => {
      await postJournal(tx, {
        tenantId,
        txnType: "WALLET_TRANSFER",
        idemKey: key("topup"),
        entries: [
          { code: DIST, dir: "DR", amount: rupeesToPaise("1000") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("1000") },
        ],
      });
    });

    const after = await balanceOf(RTL);
    expect(after.balance - before.balance).toBe(rupeesToPaise("1000"));
    // A deposited advance is spendable but never withdrawable — see spec §6.1 and §9.3.
    expect(after.settleable).toBe(before.settleable);
  });

  it("replays an idempotency key instead of posting twice", async () => {
    const before = await balanceOf(RTL);

    const replay = await db.transaction((tx) =>
      postJournal(tx, {
        tenantId,
        txnType: "WALLET_TRANSFER",
        idemKey: key("topup"), // same key as the previous test
        entries: [
          { code: DIST, dir: "DR", amount: rupeesToPaise("1000") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("1000") },
        ],
      }),
    );

    expect(replay.replayed).toBe(true);
    expect((await balanceOf(RTL)).balance).toBe(before.balance);
  });

  it("refuses to overdraw an agent wallet", async () => {
    const { balance } = await balanceOf(RTL);

    await expect(
      db.transaction((tx) =>
        postJournal(tx, {
          tenantId,
          txnType: "DMT",
          idemKey: key("overdraw"),
          entries: [
            { code: RTL, dir: "DR", amount: balance + rupeesToPaise("1") },
            { code: FLOAT, dir: "CR", amount: balance + rupeesToPaise("1") },
          ],
        }),
      ),
    ).rejects.toThrow(/INSUFFICIENT_BALANCE|Insufficient/);

    expect((await balanceOf(RTL)).balance).toBe(balance);
  });

  it("rejects an unbalanced journal before it reaches the database", async () => {
    await expect(
      db.transaction((tx) =>
        postJournal(tx, {
          tenantId,
          txnType: "WALLET_TRANSFER",
          idemKey: key("unbalanced"),
          entries: [
            { code: DIST, dir: "DR", amount: rupeesToPaise("100") },
            { code: RTL, dir: "CR", amount: rupeesToPaise("99") },
          ],
        }),
      ),
    ).rejects.toThrow(/Unbalanced/);
  });

  it("rejects a flow the matrix does not permit", async () => {
    // A retailer paying another agent directly is a compliance boundary, not a preference.
    await expect(
      db.transaction((tx) =>
        postJournal(tx, {
          tenantId,
          txnType: "WALLET_TRANSFER",
          idemKey: key("peer"),
          entries: [
            { code: RTL, dir: "DR", amount: rupeesToPaise("10") },
            { code: DIST, dir: "CR", amount: rupeesToPaise("10") },
          ],
        }),
      ),
    ).rejects.toThrow(/Flow not permitted/);
  });

  it("reverses a journal by mirroring it, and refuses to reverse twice", async () => {
    const posted = await db.transaction((tx) =>
      postJournal(tx, {
        tenantId,
        txnType: "WALLET_TRANSFER",
        idemKey: key("to-reverse"),
        entries: [
          { code: DIST, dir: "DR", amount: rupeesToPaise("700") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("700") },
        ],
      }),
    );

    const before = await balanceOf(RTL);

    await db.transaction((tx) =>
      reverseJournal(tx, {
        tenantId,
        journalId: posted.id,
        idemKey: key("reversal"),
        reason: "integration test",
      }),
    );

    const after = await balanceOf(RTL);
    expect(before.balance - after.balance).toBe(rupeesToPaise("700"));

    await expect(
      db.transaction((tx) =>
        reverseJournal(tx, {
          tenantId,
          journalId: posted.id,
          idemKey: key("reversal-2"),
          reason: "should fail",
        }),
      ),
    ).rejects.toThrow(/already reversed/i);
  });

  it("leaves every reconciliation check clean", async () => {
    // The real proof: after all of the above, the ledger still agrees with itself.
    expect(await checkTrialBalance(tenantId)).toEqual([]);
    expect(await checkLedgerVsBalance(tenantId)).toEqual([]);
    expect(await checkSettleable(tenantId)).toEqual([]);
    expect(await checkNegativeAgentBalance(tenantId)).toEqual([]);
  });
});
