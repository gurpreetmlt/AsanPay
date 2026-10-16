import { B } from "@/lib/brand";

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayYmd() {
  return toYmd(new Date());
}

export function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(ymd: string, days: number) {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

/** Inclusive number of calendar days in the range (min 1). */
export function dayCount(from: string, to: string) {
  const ms = parseYmd(to).getTime() - parseYmd(from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export type DatePreset = { id: string; label: string; range: () => { from: string; to: string } };

export const DATE_PRESETS: DatePreset[] = [
  {
    id: "today",
    label: "Today",
    range: () => {
      const t = todayYmd();
      return { from: t, to: t };
    },
  },
  {
    id: "yesterday",
    label: "Yesterday",
    range: () => {
      const y = addDays(todayYmd(), -1);
      return { from: y, to: y };
    },
  },
  {
    id: "last7",
    label: "Last 7 Days",
    range: () => {
      const t = todayYmd();
      return { from: addDays(t, -6), to: t };
    },
  },
  {
    id: "month",
    label: "This Month",
    range: () => {
      const t = todayYmd();
      return { from: `${t.slice(0, 7)}-01`, to: t };
    },
  },
];

export function toNum(value: string | number | null | undefined) {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

export function formatInr(value: string | number) {
  return `₹${toNum(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPct(part: number, total: number) {
  if (total <= 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

export function pctValue(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

const SHARE_PALETTE = [B.blueLight, B.green, "#F59E0B", "#0EA5E9", "#EC4899", "#14B8A6", B.blue];
const OTHERS_COLOR = "#94A3B8";

export function shareColor(index: number) {
  return index < SHARE_PALETTE.length ? SHARE_PALETTE[index] : OTHERS_COLOR;
}

export type ShareSegment = { key: string; label: string; value: number; color: string };

/** Top products by value (already sorted desc) + an "Others" bucket. */
export function buildShareSegments(rows: { key: string; label: string; value: number }[]): ShareSegment[] {
  const positive = rows.filter((r) => r.value > 0);
  const top = positive.slice(0, SHARE_PALETTE.length).map((r, i) => ({ ...r, color: shareColor(i) }));
  const rest = positive.slice(SHARE_PALETTE.length).reduce((s, r) => s + r.value, 0);
  if (rest > 0) top.push({ key: "__others", label: "Others", value: rest, color: OTHERS_COLOR });
  return top;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const body = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
