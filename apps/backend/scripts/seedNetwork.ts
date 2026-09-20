import "dotenv/config";
import { eq, and, isNull } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { users, userHierarchy, wallets } from "../src/db/postgres/schema";
import { provisionWalletsForUser } from "../src/modules/wallet/wallet.service";
import { hashPassword } from "../src/utils/password";
import { allocateUid } from "../src/utils/uid";
import type { UserRole } from "@asanpay/shared-types";

/**
 * Seeds the demo agent hierarchy. Passwords come from SEED_NETWORK_PASSWORD (required).
 * No hardcoded credentials in source.
 *
 * Run: SEED_NETWORK_PASSWORD='...' npm run seed:network -w @asanpay/backend
 */

interface AgentSeed {
  mobile: string;
  name: string;
  role: UserRole;
}

/**
 * Hierarchy:
 *
 * Admin
 * ├─ Super Dist One (9111111111)
 * │  ├─ Distributor One (9222222222)
 * │  │  ├─ Retailer One   (9333333333)
 * │  │  ├─ Retailer Two   (9333333334)
 * │  │  └─ Retailer Three (9333333335)
 * │  └─ Distributor Two (9222222223)
 * │     ├─ Retailer Four  (9333333336)
 * │     └─ Retailer Five  (9333333337)
 * └─ Super Dist Two (9111111112)
 *    └─ Distributor Three (9222222224)
 *       └─ Retailer Six   (9333333338)
 */

interface TreeNode extends AgentSeed {
  children?: TreeNode[];
}

const NETWORK_TREE: TreeNode[] = [
  {
    mobile: "9111111111", name: "Rajiv Sharma", role: "super_distributor",
    children: [
      {
        mobile: "9222222222", name: "Amit Verma", role: "distributor",
        children: [
          { mobile: "9333333333", name: "Suresh Yadav", role: "retailer" },
          { mobile: "9333333334", name: "Priya Kumari", role: "retailer" },
          { mobile: "9333333335", name: "Rakesh Gupta", role: "retailer" },
          { mobile: "9333333339", name: "Neha Sinha", role: "retailer" },
          { mobile: "9333333340", name: "Vijay Tiwari", role: "retailer" },
        ],
      },
      {
        mobile: "9222222223", name: "Kavita Mishra", role: "distributor",
        children: [
          { mobile: "9333333336", name: "Deepak Patel", role: "retailer" },
          { mobile: "9333333337", name: "Anjali Devi", role: "retailer" },
          { mobile: "9333333341", name: "Rohit Jha", role: "retailer" },
        ],
      },
      {
        mobile: "9222222225", name: "Sanjay Dubey", role: "distributor",
        children: [
          { mobile: "9333333342", name: "Pooja Rani", role: "retailer" },
          { mobile: "9333333343", name: "Manoj Kumar", role: "retailer" },
        ],
      },
    ],
  },
  {
    mobile: "9111111112", name: "Sunita Agarwal", role: "super_distributor",
    children: [
      {
        mobile: "9222222224", name: "Ravi Chauhan", role: "distributor",
        children: [
          { mobile: "9333333338", name: "Geeta Devi", role: "retailer" },
          { mobile: "9333333344", name: "Ashok Pandey", role: "retailer" },
          { mobile: "9333333345", name: "Meena Kumari", role: "retailer" },
          { mobile: "9333333346", name: "Santosh Rai", role: "retailer" },
        ],
      },
      {
        mobile: "9222222226", name: "Nisha Thakur", role: "distributor",
        children: [
          { mobile: "9333333347", name: "Arun Singh", role: "retailer" },
          { mobile: "9333333348", name: "Sundar Lal", role: "retailer" },
          { mobile: "9333333349", name: "Kamla Devi", role: "retailer" },
        ],
      },
    ],
  },
  {
    mobile: "9111111113", name: "Pankaj Mehta", role: "super_distributor",
    children: [
      {
        mobile: "9222222227", name: "Dinesh Soni", role: "distributor",
        children: [
          { mobile: "9333333350", name: "Babita Sharma", role: "retailer" },
          { mobile: "9333333351", name: "Lalit Prasad", role: "retailer" },
        ],
      },
    ],
  },
];

async function ensureUser(agent: AgentSeed, parentId: string): Promise<string> {
  const [existing] = await db.select().from(users).where(eq(users.mobile, agent.mobile)).limit(1);

  if (existing) {
    if (existing.parentId !== parentId) {
      await db.update(users).set({ parentId, updatedAt: new Date() }).where(eq(users.id, existing.id));
      console.log(`  ↳ Updated parentId for ${agent.name} (${agent.mobile})`);
    } else {
      console.log(`  ↳ ${agent.name} already exists with correct parent`);
    }
    return existing.id;
  }

  const password = process.env.SEED_NETWORK_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("SEED_NETWORK_PASSWORD env is required (min 10 characters). No hardcoded seed passwords.");
  }
  const passwordHash = await hashPassword(password);

  const [created] = await db.transaction(async (tx) => {
    const uid = await allocateUid(agent.role, tx);
    const [row] = await tx
      .insert(users)
      .values({
        uid,
        parentId,
        role: agent.role,
        name: agent.name,
        mobile: agent.mobile,
        passwordHash,
        kycStatus: "verified",
      })
      .returning();

    if (!row) throw new Error(`Failed to create ${agent.name}`);

    await tx.insert(userHierarchy).values({ ancestorId: row.id, descendantId: row.id, depth: 0 });

    const parentAncestors = await tx
      .select({ ancestorId: userHierarchy.ancestorId, depth: userHierarchy.depth })
      .from(userHierarchy)
      .where(eq(userHierarchy.descendantId, parentId));

    if (parentAncestors.length > 0) {
      await tx.insert(userHierarchy).values(
        parentAncestors.map((r) => ({ ancestorId: r.ancestorId, descendantId: row.id, depth: r.depth + 1 })),
      );
    }

    await provisionWalletsForUser(tx, row.id, row.role);
    return [row];
  });

  console.log(`  ↳ Created ${agent.name} (${agent.mobile}) uid=${created.uid}`);
  return created.id;
}

async function main() {
  const [admin] = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.parentId)))
    .limit(1);

  if (!admin) {
    console.error("No root admin found. Run: npm run seed:admin -w @asanpay/backend first.");
    process.exit(1);
  }

  console.log(`Root admin: ${admin.name} (${admin.mobile})`);
  console.log("Seeding network hierarchy...\n");

  async function seedTree(nodes: TreeNode[], parentId: string, depth: number) {
    for (const node of nodes) {
      const indent = "  ".repeat(depth);
      console.log(`${indent}${node.role}: ${node.name} (${node.mobile})`);
      const id = await ensureUser(node, parentId);
      if (node.children?.length) {
        await seedTree(node.children, id, depth + 1);
      }
    }
  }

  await seedTree(NETWORK_TREE, admin.id, 0);

  console.log("\n✓ Network hierarchy seeded:");
  console.log("  Admin");
  console.log("  ├─ Rajiv Sharma (9111111111) — Super Dist");
  console.log("  │  ├─ Amit Verma (9222222222)   → 5 Retailers");
  console.log("  │  ├─ Kavita Mishra (9222222223) → 3 Retailers");
  console.log("  │  └─ Sanjay Dubey (9222222225)  → 2 Retailers");
  console.log("  ├─ Sunita Agarwal (9111111112) — Super Dist");
  console.log("  │  ├─ Ravi Chauhan (9222222224)  → 4 Retailers");
  console.log("  │  └─ Nisha Thakur (9222222226)  → 3 Retailers");
  console.log("  └─ Pankaj Mehta (9111111113) — Super Dist");
  console.log("     └─ Dinesh Soni (9222222227)   → 2 Retailers");
  console.log("\n  Total: 3 Super Dist, 6 Distributors, 19 Retailers");
  console.log("\nLogin at :3001 with any agent to test network.");
  await pgPool.end();
}

main().catch((err) => {
  console.error("Seeding network failed:", err);
  process.exit(1);
});
