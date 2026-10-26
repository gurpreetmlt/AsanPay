import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { users } from "../src/db/postgres/schema";
import { assertAgentAuthFresh, getAgentAuthStatus } from "../src/modules/auth/agentAuth";
import { encryptPII } from "../src/utils/aes";

// Agent-auth = retailer proving THEIR OWN presence at the counter, separate from the customer's
// AEPS biometric. Money endpoints (AEPS + DMT) must refuse to run without a fresh one.

const SUFFIX = `aa${Date.now().toString(36)}`;
let userId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ uid: `AA${SUFFIX}`, role: "retailer", name: "Agent Auth Test", mobile: `62${SUFFIX.slice(-8).padStart(8, "0")}`, passwordHash: "x" })
    .returning();
  userId = u!.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await pgPool.end();
});

describe("assertAgentAuthFresh", () => {
  it("blocks a user who has never agent-authed", async () => {
    await expect(assertAgentAuthFresh(userId)).rejects.toMatchObject({ code: "AGENT_AUTH_REQUIRED" });
  });

  it("passes right after a fresh agent-auth", async () => {
    await db.update(users).set({ lastAgentAuthAt: new Date() }).where(eq(users.id, userId));
    await expect(assertAgentAuthFresh(userId)).resolves.toBeUndefined();
  });

  it("reports verified for the current India calendar day", async () => {
    await db.update(users).set({ lastAgentAuthAt: new Date() }).where(eq(users.id, userId));
    await expect(getAgentAuthStatus(userId)).resolves.toMatchObject({ verifiedToday: true });
  });

  it("blocks a verification from the previous India calendar day", async () => {
    const previousDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.update(users).set({ lastAgentAuthAt: previousDay }).where(eq(users.id, userId));
    await expect(assertAgentAuthFresh(userId)).rejects.toMatchObject({ code: "AGENT_AUTH_REQUIRED" });
  });
});

describe("getAgentAuthStatus Aadhaar exposure", () => {
  it("returns only the last 4 digits of the KYC Aadhaar", async () => {
    await db
      .update(users)
      .set({ aadhaarNumberEncrypted: encryptPII("123456789012") })
      .where(eq(users.id, userId));
    const status = await getAgentAuthStatus(userId);
    expect(status).toMatchObject({ kycReady: true, aadhaarLastFour: "9012", aadhaarNumber: null });
    expect(JSON.stringify(status)).not.toContain("123456789012");
  });

  it("reports KYC not ready without an Aadhaar on file", async () => {
    await db.update(users).set({ aadhaarNumberEncrypted: null }).where(eq(users.id, userId));
    await expect(getAgentAuthStatus(userId)).resolves.toMatchObject({
      kycReady: false,
      aadhaarLastFour: null,
      aadhaarNumber: null,
    });
  });
});
