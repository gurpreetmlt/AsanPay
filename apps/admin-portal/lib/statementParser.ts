/**
 * Bank statement parser for the reconciliation upload. Accepts a CSV export or rows copied
 * straight out of Excel (tab-separated), finds the header row under the bank's account-info
 * preamble, and maps the usual Indian bank column names.
 */

export interface ParsedStatementLine {
  bankTxnId: string;
  txnDate: string;
  direction: "CR" | "DR";
  amount: string;
  utr: string | null;
  narration: string | null;
  balanceAfter: string | null;
}

/** What the statement says about which account it belongs to — used to verify the selected bank. */
export interface StatementIdentity {
  accountLast4: string | null;
  ifsc: string | null;
  /** Balance before the chronologically first transaction. */
  opening: { date: string; balance: string } | null;
}

export interface ParsedStatement {
  lines: ParsedStatementLine[];
  columns: string[];
  skippedRows: number;
  errors: string[];
  identity: StatementIdentity;
}

const NO_IDENTITY: StatementIdentity = { accountLast4: null, ifsc: null, opening: null };

function extractIdentity(preamble: string[][], lines: ParsedStatementLine[]): StatementIdentity {
  let accountLast4: string | null = null;
  let ifsc: string | null = null;
  for (const row of preamble) {
    const text = row.join(" ");
    if (!accountLast4) {
      const m = /(?:account|a\/c|acct)\.?\s*(?:no\.?|number|num)?\s*[:#.-]?\s*['"]?([0-9Xx*][0-9Xx*\s-]{3,30})/i.exec(text);
      const cleaned = m?.[1]!.replace(/[\s-]/g, "") ?? "";
      if (/\d{4}$/.test(cleaned)) accountLast4 = cleaned.slice(-4);
    }
    const code = /\b([A-Z]{4}0[A-Z0-9]{6})\b/.exec(text.toUpperCase())?.[1];
    if (code && (!ifsc || /ifsc/i.test(text))) ifsc = code;
  }

  let opening: StatementIdentity["opening"] = null;
  const withBalance = lines.filter((l) => l.balanceAfter !== null);
  if (withBalance.length > 0) {
    const descending = withBalance[0]!.txnDate > withBalance[withBalance.length - 1]!.txnDate;
    const first = descending ? withBalance[withBalance.length - 1]! : withBalance[0]!;
    const ZERO = BigInt(0);
    const HUNDRED = BigInt(100);
    const toPaise = (s: string) => {
      const neg = s.startsWith("-");
      const [w, f = ""] = s.replace("-", "").split(".");
      const p = BigInt(w!) * HUNDRED + BigInt((f + "00").slice(0, 2));
      return neg ? -p : p;
    };
    const after = toPaise(first.balanceAfter!);
    const amt = toPaise(first.amount);
    const before = first.direction === "CR" ? after - amt : after + amt;
    const abs = before < ZERO ? -before : before;
    opening = {
      date: first.txnDate,
      balance: `${before < ZERO ? "-" : ""}${abs / HUNDRED}.${String(abs % HUNDRED).padStart(2, "0")}`,
    };
  }
  return { accountLast4, ifsc, opening };
}

function splitRows(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const firstLines = text.split(/\r?\n/).slice(0, 20).join("\n");
  const delimiter = firstLines.includes("\t") ? "\t" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z/]/g, "");

type ColumnKey = "date" | "narration" | "ref" | "debit" | "credit" | "amount" | "type" | "balance";

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function detectColumns(header: string[]): Partial<Record<ColumnKey, number>> {
  const cols: Partial<Record<ColumnKey, number>> = {};
  const find = (test: (h: string) => boolean) => header.findIndex((h) => test(norm(h)));

  const preferredDate = find((h) => /^(txn|tran|transaction|post|posting)/.test(h) && h.includes("date"));
  cols.date = preferredDate >= 0 ? preferredDate : find((h) => h.includes("date"));
  cols.narration = find((h) => /(description|narration|particular|remark|details)/.test(h));
  cols.ref = find((h) => /(ref|cheque|chq|utr|instrument)/.test(h) && !h.includes("date"));
  cols.debit = find((h) => /(debit|withdrawal)/.test(h) || h === "dr" || h === "dramount");
  cols.credit = find((h) => /(credit|deposit)/.test(h) || h === "cr" || h === "cramount");
  cols.amount = find((h) => h === "amount" || h === "amountinr" || h === "transactionamount" || h === "txnamount");
  cols.type = find((h) => h === "dr/cr" || h === "cr/dr" || h === "type" || h === "drcr" || h === "crdr");
  cols.balance = find((h) => h.includes("balance"));

  for (const k of Object.keys(cols) as ColumnKey[]) if (cols[k] === -1) delete cols[k];
  return cols;
}

export function parseStatementDate(raw: string): string | null {
  const s = raw.trim().split(/\s+(?=\d{1,2}:\d{2})/)[0] ?? "";
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return valid(year, m[2]!, m[1]!);
  }
  m = /^(\d{1,2})[\s\-/]([A-Za-z]{3})[A-Za-z]*[\s\-/,]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()];
    if (!month) return null;
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return valid(year, month, m[1]!);
  }
  return null;
}

function valid(y: string, mo: string, d: string): string | null {
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/** "1,23,456.70 Cr" → { value: "123456.70", sign: 1 }. Empty / zero → null. */
function parseMoney(raw: string | undefined): { value: string; negative: boolean } | null {
  if (!raw) return null;
  let s = raw.replace(/[₹,\s]/g, "").replace(/^INR/i, "");
  let negative = false;
  if (/dr\.?$/i.test(s)) {
    negative = true;
    s = s.replace(/dr\.?$/i, "");
  } else if (/cr\.?$/i.test(s)) {
    s = s.replace(/cr\.?$/i, "");
  }
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const value = `${BigInt(whole!)}.${(frac + "00").slice(0, 2)}`;
  return { value, negative };
}

function extractUtr(ref: string | undefined, narration: string): string | null {
  const r = (ref ?? "").trim();
  if (r && !/^[0\-.\s]*$/.test(r)) return r.slice(0, 60);
  const neft = /(?:NEFT|RTGS|IMPS)[\s/:-]+([A-Z0-9]{10,22})/i.exec(narration);
  if (neft) return neft[1]!.toUpperCase();
  const rrn = /(?:^|\D)(\d{12})(?:\D|$)/.exec(narration);
  return rrn ? rrn[1]! : null;
}

async function stableId(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ST_${hex.slice(0, 40)}`;
}

export async function parseStatement(raw: string): Promise<ParsedStatement> {
  const rows = splitRows(raw);
  const errors: string[] = [];
  if (rows.length === 0)
    return { lines: [], columns: [], skippedRows: 0, errors: ["The file is empty"], identity: NO_IDENTITY };

  const headerIdx = rows.slice(0, 60).findIndex((r) => {
    const c = detectColumns(r);
    return c.date !== undefined && (c.amount !== undefined || (c.debit !== undefined && c.credit !== undefined));
  });
  if (headerIdx < 0) {
    return {
      lines: [],
      columns: [],
      skippedRows: rows.length,
      errors: [
        "Could not find the header row. The statement needs a Date column and either Debit + Credit columns or an Amount + Dr/Cr column.",
      ],
      identity: NO_IDENTITY,
    };
  }

  const header = rows[headerIdx]!;
  const cols = detectColumns(header);
  const columns = (Object.entries(cols) as [ColumnKey, number][]).map(([k, i]) => `${k}: ${header[i]}`);

  const lines: ParsedStatementLine[] = [];
  let skippedRows = 0;
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const r = rows[i]!;
    const date = parseStatementDate(r[cols.date!] ?? "");
    if (!date) {
      skippedRows += 1;
      continue;
    }

    let direction: "CR" | "DR" | null = null;
    let amount: string | null = null;
    const debit = parseMoney(cols.debit !== undefined ? r[cols.debit] : undefined);
    const credit = parseMoney(cols.credit !== undefined ? r[cols.credit] : undefined);
    if (credit && Number(credit.value) > 0) {
      direction = "CR";
      amount = credit.value;
    } else if (debit && Number(debit.value) > 0) {
      direction = "DR";
      amount = debit.value;
    } else if (cols.amount !== undefined) {
      const amt = parseMoney(r[cols.amount]);
      const type = cols.type !== undefined ? (r[cols.type] ?? "").toUpperCase() : "";
      if (amt && Number(amt.value) > 0) {
        amount = amt.value;
        direction = type.startsWith("D") || (!type && amt.negative) ? "DR" : "CR";
      }
    }
    if (!direction || !amount) {
      skippedRows += 1;
      continue;
    }

    const narration = (cols.narration !== undefined ? r[cols.narration] : "")?.slice(0, 500) ?? "";
    const ref = cols.ref !== undefined ? r[cols.ref] : undefined;
    const bal = parseMoney(cols.balance !== undefined ? r[cols.balance] : undefined);
    const balanceAfter = bal ? `${bal.negative ? "-" : ""}${bal.value}` : null;

    lines.push({
      bankTxnId: await stableId([date, direction, amount, ref ?? "", narration, balanceAfter ?? ""]),
      txnDate: date,
      direction,
      amount,
      utr: extractUtr(ref, narration),
      narration: narration || null,
      balanceAfter,
    });
  }

  if (lines.length === 0) errors.push("No transaction rows found under the header row");
  return { lines, columns, skippedRows, errors, identity: extractIdentity(rows.slice(0, headerIdx), lines) };
}
