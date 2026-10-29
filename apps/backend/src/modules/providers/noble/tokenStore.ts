import { eq, sql } from "drizzle-orm";
import { db } from "../../../db/postgres";
import { providerSessions } from "../../../db/postgres/schema";
import { decryptPII, encryptPII } from "../../../utils/aes";
import { logger } from "../../../utils/logger";

const PROVIDER_CODE = "noble";
/** Fixed pg_advisory_xact_lock key for the provider login (any constant unique in this codebase). */
const NOBLE_LOGIN_LOCK_KEY = 7_406_201;

export type SessionOwner = "api" | "jobs" | "script";

export interface StoredSession {
  token: string;
  expiresAtMs: number;
}

export interface SessionRow {
  expiresAt: Date;
  obtainedAt: Date;
  obtainedBy: string;
  loginCountDay: string | null;
  loginCount: number;
}

export interface LockedSessionStore {
  read(): Promise<StoredSession | null>;
  save(token: string, expiresAtMs: number, obtainedBy: SessionOwner, istDay: string): Promise<void>;
}

type Executor = Pick<typeof db, "select" | "insert">;

async function readWith(exec: Executor): Promise<StoredSession | null> {
  const [row] = await exec
    .select({ tokenEncrypted: providerSessions.tokenEncrypted, expiresAt: providerSessions.expiresAt })
    .from(providerSessions)
    .where(eq(providerSessions.providerCode, PROVIDER_CODE))
    .limit(1);
  if (!row) return null;
  try {
    return { token: decryptPII(row.tokenEncrypted), expiresAtMs: row.expiresAt.getTime() };
  } catch (err) {
    // A rotated AES key without AES_ENCRYPTION_KEY_PREVIOUS makes the stored token unreadable.
    logger.warn({ err }, "Stored provider session could not be decrypted; a new login is needed");
    return null;
  }
}

export function readNobleSession(): Promise<StoredSession | null> {
  return readWith(db);
}

/** Runs fn while holding the cross-process login lock; released when the transaction ends. */
export function withNobleLoginLock<T>(fn: (store: LockedSessionStore) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${NOBLE_LOGIN_LOCK_KEY})`);
    return fn({
      read: () => readWith(tx),
      save: async (token, expiresAtMs, obtainedBy, istDay) => {
        const values = {
          tokenEncrypted: encryptPII(token),
          expiresAt: new Date(expiresAtMs),
          obtainedAt: new Date(),
          obtainedBy,
        };
        await tx
          .insert(providerSessions)
          .values({ providerCode: PROVIDER_CODE, ...values, loginCountDay: istDay, loginCount: 1 })
          .onConflictDoUpdate({
            target: providerSessions.providerCode,
            set: {
              ...values,
              loginCount: sql`case when ${providerSessions.loginCountDay} = ${istDay} then ${providerSessions.loginCount} + 1 else 1 end`,
              loginCountDay: istDay,
            },
          });
      },
    });
  });
}

export async function readNobleSessionRow(): Promise<SessionRow | null> {
  const [row] = await db
    .select({
      expiresAt: providerSessions.expiresAt,
      obtainedAt: providerSessions.obtainedAt,
      obtainedBy: providerSessions.obtainedBy,
      loginCountDay: providerSessions.loginCountDay,
      loginCount: providerSessions.loginCount,
    })
    .from(providerSessions)
    .where(eq(providerSessions.providerCode, PROVIDER_CODE))
    .limit(1);
  return row ?? null;
}
