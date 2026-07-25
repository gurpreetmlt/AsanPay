import { desc, eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { supportTickets, users } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import type { UserRole } from "@asanpay/shared-types";

export async function createTicket(userId: string, subject: string, description: string, transactionId?: string) {
  const [row] = await db
    .insert(supportTickets)
    .values({ userId, subject, description, transactionId: transactionId ?? null })
    .returning();
  return row;
}

export async function listMyTickets(userId: string) {
  return db.select().from(supportTickets).where(eq(supportTickets.userId, userId)).orderBy(desc(supportTickets.createdAt));
}

export async function listAllTickets(status?: "open" | "resolved") {
  const rows = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      description: supportTickets.description,
      status: supportTickets.status,
      transactionId: supportTickets.transactionId,
      resolutionNote: supportTickets.resolutionNote,
      createdAt: supportTickets.createdAt,
      resolvedAt: supportTickets.resolvedAt,
      userId: users.id,
      userName: users.name,
      userMobile: users.mobile,
      userUid: users.uid,
    })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .where(status ? eq(supportTickets.status, status) : undefined)
    .orderBy(desc(supportTickets.createdAt));
  return rows;
}

export async function resolveTicket(adminId: string, adminRole: UserRole, ticketId: string, resolutionNote: string) {
  if (adminRole !== "admin") throw new HttpError(403, "Only admin can resolve tickets", "FORBIDDEN");
  const [row] = await db
    .update(supportTickets)
    .set({ status: "resolved", resolutionNote, resolvedBy: adminId, resolvedAt: new Date() })
    .where(eq(supportTickets.id, ticketId))
    .returning();
  if (!row) throw new HttpError(404, "Ticket not found", "TICKET_NOT_FOUND");
  return row;
}
