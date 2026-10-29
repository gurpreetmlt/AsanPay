import { z } from "zod";
import { HttpError } from "../../utils/httpError";

/** Undo is offered for this long after an import. */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_IMPORT_CHANGES = 2000;

const uuid = z.string().uuid();
const bound = z.string().trim().max(20).regex(/^(\d+(\.\d{1,4})?)?$/, "Enter an amount like 100 or 199.99").nullable().optional();
const role = z.enum(["retailer", "distributor", "super_distributor"]);

const incomeBody = z.object({
  serviceId: uuid,
  providerId: uuid.nullable().optional(),
  ruleType: z.enum(["flat", "percentage"]),
  value: z.string().trim().min(1).max(20),
  capAmount: z.string().trim().max(20).nullable().optional(),
  minAmount: bound,
  maxAmount: bound,
});

const shareBody = z.object({
  serviceId: uuid,
  providerId: uuid.nullable().optional(),
  role,
  sharePercent: z.string().trim().min(1).max(20),
  flatAmount: z.string().trim().max(20).nullable().optional(),
  minAmount: bound,
  maxAmount: bound,
});

const incomeScope = z.object({ serviceId: uuid, providerId: uuid.nullable(), minAmount: bound, maxAmount: bound });
const shareScope = incomeScope.extend({ role });

export const importChangeSchema = z.object({
  label: z.string().max(300),
  detail: z.string().max(500),
  method: z.enum(["post", "patch", "delete"]),
  url: z.string().max(200),
  body: z.record(z.string(), z.unknown()),
});
export type ImportChange = z.infer<typeof importChangeSchema>;

export type UndoOp =
  | { kind: "set_income"; body: z.infer<typeof incomeBody> }
  | { kind: "end_income"; id: string }
  | { kind: "end_income_scope"; scope: z.infer<typeof incomeScope> }
  | { kind: "set_share"; body: z.infer<typeof shareBody> }
  | { kind: "end_share"; id: string }
  | { kind: "end_share_scope"; scope: z.infer<typeof shareScope> };

const BASE = "/admin/rate-card/";

/**
 * Maps one stored restore write to the rate-card service call it replays. `…/scope` deletes end whatever
 * row is active in that exact scope at undo time (the import created it, so its id was never known).
 */
export function undoOpOf(c: ImportChange): UndoOp {
  const path = c.url.split("?")[0]!;
  if (!path.startsWith(BASE)) throw unsupported(c);
  const [kind, tail, ...rest] = path.slice(BASE.length).split("/");
  if (rest.length > 0 || (kind !== "provider-income" && kind !== "shares")) throw unsupported(c);
  const income = kind === "provider-income";
  try {
    if (c.method === "post" && tail === undefined) {
      return income ? { kind: "set_income", body: incomeBody.parse(c.body) } : { kind: "set_share", body: shareBody.parse(c.body) };
    }
    if (c.method === "delete" && tail === "scope") {
      return income
        ? { kind: "end_income_scope", scope: incomeScope.parse(c.body) }
        : { kind: "end_share_scope", scope: shareScope.parse(c.body) };
    }
    if (c.method === "delete" && tail !== undefined && uuid.safeParse(tail).success) {
      return income ? { kind: "end_income", id: tail } : { kind: "end_share", id: tail };
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new HttpError(400, `Restore step "${c.label}" has invalid values: ${err.issues[0]?.message ?? "check the file"}`, "IMPORT_UNDO_INVALID");
    }
    throw err;
  }
  throw unsupported(c);
}

function unsupported(c: ImportChange) {
  return new HttpError(400, `Restore step "${c.label}" is not a rate card slab write (${c.method.toUpperCase()} ${c.url})`, "IMPORT_UNDO_UNSUPPORTED");
}

/** Why this import cannot be undone now, or null. */
export function undoBlockReason(row: { createdAt: Date; undoneAt: Date | null }, now: Date): string | null {
  if (row.undoneAt) return "This import was already undone.";
  if (now.getTime() - row.createdAt.getTime() > UNDO_WINDOW_MS) {
    return "Undo is only available for 24 hours after an import. Edit the rate card or import a corrected file instead.";
  }
  return null;
}

/** Same text on every restore write of one undo, so a retried undo does not count its own writes as newer changes. */
export function undoReasonOf(row: { id: string; fileName: string }): string {
  return `Undo of rate card import "${row.fileName.slice(0, 120)}" (ref ${row.id.slice(0, 8)})`;
}
