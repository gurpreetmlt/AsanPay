export function apiErrorMessage(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

export function currentMonthYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthStartYmd(): string {
  return `${currentMonthYm()}-01`;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

/** Trigger a browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export type SchemeCsvRow = {
  serviceCode: string;
  role: string;
  ruleType: string;
  value: string;
  minAmount: string | null;
  maxAmount: string | null;
  providerCode: string | null;
  isActive: boolean;
};

export const SCHEME_CSV_COLUMNS = [
  "serviceCode",
  "role",
  "ruleType",
  "value",
  "minAmount",
  "maxAmount",
  "providerCode",
  "isActive",
] as const;

/** Parse scheme CSV text into import rows. Throws an Error with a clear message on bad headers. */
export function parseSchemeCsv(text: string): SchemeCsvRow[] {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("CSV must have a header row and at least one data row");
  const header = table[0]!.map((h) => h.trim());
  const idx = new Map(header.map((h, i) => [h.toLowerCase(), i]));
  const missing = SCHEME_CSV_COLUMNS.filter(
    (c) => !["minAmount", "maxAmount", "providerCode", "isActive"].includes(c) && !idx.has(c.toLowerCase()),
  );
  if (missing.length) throw new Error(`CSV is missing required column(s): ${missing.join(", ")}`);
  const get = (r: string[], name: string) => {
    const i = idx.get(name.toLowerCase());
    return i === undefined ? "" : (r[i] ?? "").trim();
  };
  return table.slice(1).map((r) => {
    const active = get(r, "isActive").toLowerCase();
    return {
      serviceCode: get(r, "serviceCode"),
      role: get(r, "role"),
      ruleType: get(r, "ruleType"),
      value: get(r, "value"),
      minAmount: get(r, "minAmount") || null,
      maxAmount: get(r, "maxAmount") || null,
      providerCode: get(r, "providerCode") || null,
      isActive: active === "" ? true : !["false", "0", "no", "n"].includes(active),
    };
  });
}
