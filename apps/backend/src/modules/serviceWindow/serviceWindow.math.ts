export type NightWindow = { enabled: boolean; start: string; end: string };

const IST_OFFSET_MIN = 330;

export function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h! * 60 + m!;
}

/** "00:00" → "12:00 AM", "18:30" → "6:30 PM". */
export function hmLabel(hm: string): string {
  const mins = toMinutes(hm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Window may cross midnight (e.g. 23:00 → 05:00). Equal start and end = never closed. */
export function isInsideWindow(w: NightWindow, now: Date = new Date()): boolean {
  if (!w.enabled) return false;
  const start = toMinutes(w.start);
  const end = toMinutes(w.end);
  if (start === end) return false;
  const m = (now.getUTCHours() * 60 + now.getUTCMinutes() + IST_OFFSET_MIN) % 1440;
  return start < end ? m >= start && m < end : m >= start || m < end;
}

export function closedMessage(w: NightWindow): string {
  return `Services are closed from ${hmLabel(w.start)} to ${hmLabel(w.end)}. They open again at ${hmLabel(w.end)}.`;
}
