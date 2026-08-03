import type { PgTransaction } from "drizzle-orm/pg-core";

// Drizzle's transaction type is heavily generic; every ledger helper takes this alias as its
// first argument so a caller physically cannot pass the global `db` by mistake. A helper that
// reaches for `db` inside a transaction runs on a different connection and silently breaks
// atomicity — the one failure this whole engine exists to prevent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = PgTransaction<any, any, any>;
