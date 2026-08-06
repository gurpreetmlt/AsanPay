/**
 * Partition maintenance for the `logs` schema (spec §1).
 *
 * Two jobs in one pass:
 *   - pre-create next month's partition, so writes never fall into the DEFAULT partition
 *   - drop partitions past retention, which is the whole point of partitioning: a DROP is
 *     instant and reclaims the disk, where a DELETE rewrites pages and leaves bloat behind
 *
 * A missing partition does not break inserts — the DEFAULT partition catches them — but rows
 * that land there cannot be dropped by month, so a silent failure here quietly rebuilds the
 * unbounded table this replaced. That is why the miss is alerted, not just logged.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/postgres";
import { logger } from "../utils/logger";

const PARTITIONED_TABLES = ["audit_logs", "provider_logs"] as const;

/** Spec §1 suggests 180 days for traces. Kept as one knob for both tables. */
const RETENTION_MONTHS = 6;

/** Months ahead to keep ready. Two means a skipped run still has a live partition. */
const LOOKAHEAD_MONTHS = 2;

function monthTag(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStart(offsetMonths: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1));
}

export interface PartitionSweepResult {
  created: string[];
  dropped: string[];
  defaultRows: number;
}

export async function sweepLogPartitions(): Promise<PartitionSweepResult> {
  const created: string[] = [];
  const dropped: string[] = [];

  for (let offset = 0; offset <= LOOKAHEAD_MONTHS; offset += 1) {
    const from = monthStart(offset);
    const to = monthStart(offset + 1);
    const tag = monthTag(from);

    for (const table of PARTITIONED_TABLES) {
      const name = `${table}_${tag}`;
      // Identifiers are built from a fixed table list and a numeric month, never from input.
      await db.execute(
        sql.raw(
          `CREATE TABLE IF NOT EXISTS logs.${name} PARTITION OF logs.${table}
             FOR VALUES FROM ('${from.toISOString()}') TO ('${to.toISOString()}')`,
        ),
      );
      created.push(name);
    }
  }

  const cutoff = monthStart(-RETENTION_MONTHS);
  for (const table of PARTITIONED_TABLES) {
    // Only partitions this job could have created, and never the DEFAULT one.
    const stale = await db.execute<{ partition_name: string }>(sql`
      SELECT c.relname AS partition_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_inherits i ON i.inhrelid = c.oid
      JOIN pg_class p ON p.oid = i.inhparent
      WHERE n.nspname = 'logs'
        AND p.relname = ${table}
        AND c.relname ~ ('^' || ${table} || '_[0-9]{6}$')
        AND substring(c.relname from '[0-9]{6}$') < ${monthTag(cutoff)}
    `);

    for (const row of stale.rows) {
      await db.execute(sql.raw(`DROP TABLE IF EXISTS logs.${row.partition_name}`));
      dropped.push(row.partition_name);
    }
  }

  // Rows in DEFAULT mean a month went by with no partition — they can no longer be aged out.
  const leaked = await db.execute<{ n: string }>(sql`
    SELECT (
      (SELECT COUNT(*) FROM logs.audit_logs_default)
      + (SELECT COUNT(*) FROM logs.provider_logs_default)
    )::text AS n
  `);
  const defaultRows = Number(leaked.rows[0]?.n ?? "0");

  if (defaultRows > 0) {
    logger.error(
      { defaultRows },
      "log rows landed in the DEFAULT partition — a partition was missing when they were written",
    );
  }

  return { created, dropped, defaultRows };
}
