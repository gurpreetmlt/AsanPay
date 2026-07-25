import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users, transactions, commissionLedger, userHierarchy, wallets } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import type { UserRole } from "@asanpay/shared-types";

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const yesterdayStart = () => {
  const d = todayStart();
  d.setDate(d.getDate() - 1);
  return d;
};

export async function getDashboardStats(userId: string, role: UserRole) {
  switch (role) {
    case "retailer":
      return getRetailerStats(userId);
    case "distributor":
      return getDistributorStats(userId);
    case "master_distributor":
      return getSuperDistributorStats(userId);
    default:
      return {};
  }
}

async function getRetailerStats(userId: string) {
  const today = todayStart();

  const [todaySummary] = await db
    .select({
      count: count(),
      volume: sql<string>`coalesce(sum(${transactions.amount}), '0')`,
      successCount: sql<number>`count(*) filter (where ${transactions.status} = 'success')`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), gte(transactions.createdAt, today)));

  const totalTxns = todaySummary?.count ?? 0;
  const successCount = Number(todaySummary?.successCount ?? 0);
  const successRate = totalTxns > 0 ? Math.round((successCount / totalTxns) * 1000) / 10 : 0;

  const [commission] = await db
    .select({ total: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')` })
    .from(commissionLedger)
    .where(and(eq(commissionLedger.beneficiaryUserId, userId), gte(commissionLedger.createdAt, today)));

  return {
    role: "retailer" as const,
    today: {
      txnCount: totalTxns,
      volume: todaySummary?.volume ?? "0",
      successRate,
      commissionEarned: commission?.total ?? "0",
    },
  };
}

async function getDistributorStats(userId: string) {
  const today = todayStart();
  const monthStart = (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  // Direct retailers under this distributor
  const retailers = await db
    .select({ id: users.id, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.parentId, userId), eq(users.role, "retailer")));

  const retailerIds = retailers.map((r) => r.id);

  /** Distinct retailers with ≥1 successful txn in the current calendar month. */
  let transactedThisMonth = 0;
  if (retailerIds.length > 0) {
    const activeRows = await db
      .select({ userId: transactions.userId })
      .from(transactions)
      .where(
        and(
          inArray(transactions.userId, retailerIds),
          eq(transactions.status, "success"),
          gte(transactions.createdAt, monthStart),
        ),
      )
      .groupBy(transactions.userId);
    transactedThisMonth = activeRows.length;
  }
  const noActivityThisMonth = Math.max(0, retailers.length - transactedThisMonth);

  let todayVolume = "0";
  let todayCommission = "0";
  interface TopRetailer { id: string; name: string; volume: string }
  let topRetailers: TopRetailer[] = [];

  if (retailerIds.length > 0) {
    const [vol] = await db
      .select({ total: sql<string>`coalesce(sum(${transactions.amount}), '0')` })
      .from(transactions)
      .where(
        and(
          inArray(transactions.userId, retailerIds),
          eq(transactions.status, "success"),
          gte(transactions.createdAt, today),
        ),
      );
    todayVolume = vol?.total ?? "0";

    const [comm] = await db
      .select({ total: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')` })
      .from(commissionLedger)
      .where(and(eq(commissionLedger.beneficiaryUserId, userId), gte(commissionLedger.createdAt, today)));
    todayCommission = comm?.total ?? "0";

    const topRows = await db
      .select({
        userId: transactions.userId,
        volume: sql<string>`coalesce(sum(${transactions.amount}), '0')`,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.userId, retailerIds),
          eq(transactions.status, "success"),
          gte(transactions.createdAt, today),
        ),
      )
      .groupBy(transactions.userId)
      .orderBy(sql`sum(${transactions.amount}) desc`)
      .limit(5);

    if (topRows.length > 0) {
      const topIds = topRows.map((r) => r.userId);
      const names = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, topIds));
      const nameMap = Object.fromEntries(names.map((n) => [n.id, n.name]));
      topRetailers = topRows.map((r) => ({
        id: r.userId,
        name: nameMap[r.userId] ?? "Unknown",
        volume: r.volume,
      }));
    }
  }

  const activityHistory = await buildRetailerActivityHistory(retailers, retailerIds);

  return {
    role: "distributor" as const,
    retailers: {
      total: retailers.length,
      /** ≥1 successful txn this calendar month */
      active: transactedThisMonth,
      /** Zero successful txns this calendar month */
      inactive: noActivityThisMonth,
    },
    today: { volume: todayVolume, commission: todayCommission },
    topRetailers,
    activityHistory,
  };
}

type RetailerRow = { id: string; createdAt: Date };

/** Last 6 calendar months (oldest → newest): total / transacted / no-activity. */
async function buildRetailerActivityHistory(
  retailers: RetailerRow[],
  retailerIds: string[],
): Promise<
  { month: string; monthLabel: string; total: number; transacted: number; noActivity: number }[]
> {
  const months: { key: string; start: Date; end: Date; label: string }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1, 0, 0, 0, 0);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    const label = start.toLocaleString("en-IN", { month: "short", year: "numeric" });
    months.push({ key, start, end, label });
  }

  const historyStart = months[0]!.start;
  const transactedByMonth = new Map<string, number>();

  if (retailerIds.length > 0) {
    const rows = await db
      .select({
        monthKey: sql<string>`to_char(date_trunc('month', ${transactions.createdAt}), 'YYYY-MM')`,
        cnt: sql<number>`count(distinct ${transactions.userId})::int`,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.userId, retailerIds),
          eq(transactions.status, "success"),
          gte(transactions.createdAt, historyStart),
        ),
      )
      .groupBy(sql`date_trunc('month', ${transactions.createdAt})`);

    for (const r of rows) {
      transactedByMonth.set(r.monthKey, Number(r.cnt));
    }
  }

  return months.map((m) => {
    // Retailers onboarded on or before this month ends
    const total = retailers.filter((r) => r.createdAt < m.end).length;
    const transacted = Math.min(transactedByMonth.get(m.key) ?? 0, total);
    return {
      month: m.key,
      monthLabel: m.label,
      total,
      transacted,
      noActivity: Math.max(0, total - transacted),
    };
  });
}

async function getSuperDistributorStats(userId: string) {
  const today = todayStart();
  const yesterday = yesterdayStart();

  // Distributors directly under this SD
  const distributors = await db
    .select({ id: users.id, name: users.name, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.parentId, userId), eq(users.role, "distributor")));

  const distIds = distributors.map((d) => d.id);

  const allDescendants = await db
    .select({ descendantId: userHierarchy.descendantId })
    .from(userHierarchy)
    .where(and(eq(userHierarchy.ancestorId, userId), gte(userHierarchy.depth, 1)));

  const descendantIds = allDescendants.map((d) => d.descendantId);
  const retailerRows = descendantIds.length > 0
    ? await db.select({ id: users.id, isActive: users.isActive }).from(users)
        .where(and(inArray(users.id, descendantIds), eq(users.role, "retailer")))
    : [];

  let todayVolume = "0";
  let yesterdayVolume = "0";
  let todayCommission = "0";

  if (descendantIds.length > 0) {
    const [tvol] = await db
      .select({ total: sql<string>`coalesce(sum(${transactions.amount}), '0')` })
      .from(transactions)
      .where(and(inArray(transactions.userId, descendantIds), gte(transactions.createdAt, today)));
    todayVolume = tvol?.total ?? "0";

    const [yvol] = await db
      .select({ total: sql<string>`coalesce(sum(${transactions.amount}), '0')` })
      .from(transactions)
      .where(
        and(
          inArray(transactions.userId, descendantIds),
          gte(transactions.createdAt, yesterday),
          sql`${transactions.createdAt} < ${today}`,
        ),
      );
    yesterdayVolume = yvol?.total ?? "0";
  }

  const [comm] = await db
    .select({ total: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')` })
    .from(commissionLedger)
    .where(and(eq(commissionLedger.beneficiaryUserId, userId), gte(commissionLedger.createdAt, today)));
  todayCommission = comm?.total ?? "0";

  // Distributor performance (volume per distributor today)
  interface DistPerf { id: string; name: string; retailerCount: number; volume: string }
  let distPerformance: DistPerf[] = [];
  if (distIds.length > 0) {
    const distRetailers = await db
      .select({ parentId: users.parentId, cnt: count() })
      .from(users)
      .where(and(inArray(users.parentId, distIds), eq(users.role, "retailer")))
      .groupBy(users.parentId);

    const retailerCountMap = Object.fromEntries(
      distRetailers.map((r) => [r.parentId ?? "", Number(r.cnt)]),
    );

    distPerformance = distributors.map((d) => ({
      id: d.id,
      name: d.name,
      retailerCount: retailerCountMap[d.id] ?? 0,
      volume: "0",
    }));
  }

  return {
    role: "master_distributor" as const,
    network: {
      distributors: distributors.length,
      retailers: retailerRows.length,
      activeRetailers: retailerRows.filter((r) => r.isActive).length,
    },
    revenue: {
      todayVolume,
      yesterdayVolume,
      todayCommission,
    },
    distributorPerformance: distPerformance,
  };
}

/**
 * "Float" here = own wallet balance (cash you can still deploy) plus the sum of every wallet
 * balance already deployed into your downline. This is a real ledger read, not a projection —
 * there's no cost-side/expense data modeled yet, so this stays a float + earnings view, not a
 * true P&L. Distributor/Super Distributor only (retailers have no downline to deploy float into).
 */
export async function getFloatAndEarnings(userId: string, role: UserRole) {
  if (role !== "distributor" && role !== "master_distributor") {
    throw new HttpError(403, "Float planner is only available to distributors and Super Distributors", "FORBIDDEN");
  }

  const today = todayStart();
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  const [ownMain] = await db
    .select({ balance: wallets.balance })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.walletType, "main")))
    .limit(1);

  const descendantRows = await db
    .select({ descendantId: userHierarchy.descendantId })
    .from(userHierarchy)
    .where(and(eq(userHierarchy.ancestorId, userId), gte(userHierarchy.depth, 1)));
  const descendantIds = descendantRows.map((r) => r.descendantId);

  let deployedFloat = "0";
  if (descendantIds.length > 0) {
    const [deployed] = await db
      .select({ total: sql<string>`coalesce(sum(${wallets.balance}), '0')` })
      .from(wallets)
      .where(and(inArray(wallets.userId, descendantIds), eq(wallets.walletType, "main")));
    deployedFloat = deployed?.total ?? "0";
  }

  async function commissionSince(from: Date): Promise<string> {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')` })
      .from(commissionLedger)
      .where(and(eq(commissionLedger.beneficiaryUserId, userId), gte(commissionLedger.createdAt, from)));
    return row?.total ?? "0";
  }

  const [todayCommission, weekCommission, monthCommission] = await Promise.all([
    commissionSince(today),
    commissionSince(weekStart),
    commissionSince(monthStart),
  ]);

  return {
    ownBalance: ownMain?.balance ?? "0",
    deployedFloat,
    totalFloat: String(Number(ownMain?.balance ?? "0") + Number(deployedFloat)),
    downlineCount: descendantIds.length,
    commission: { today: todayCommission, week: weekCommission, month: monthCommission },
  };
}
