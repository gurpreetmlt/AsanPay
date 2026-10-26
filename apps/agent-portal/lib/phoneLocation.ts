/**
 * Phone-verified location for web AEPS. Desktop browsers guess location from IP, so the agent
 * scans a QR with the AsanPay app and the phone's GPS is used for the rest of the day.
 */

export type PhoneLocation = { latitude: string; longitude: string; accuracyMeters: number | null };

const KEY = "asanpay.phoneLocation";

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function savePhoneLocation(loc: PhoneLocation): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...loc, day: todayKey() }));
  } catch {
    /* storage blocked — the agent verifies again next time */
  }
}

export function todayPhoneLocation(): PhoneLocation | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PhoneLocation & { day?: string };
    return v.day === todayKey() && v.latitude && v.longitude ? v : null;
  } catch {
    return null;
  }
}
