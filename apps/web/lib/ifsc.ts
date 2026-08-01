/** Free IFSC lookup — https://ifsc.razorpay.com/{IFSC} (no API key). */

export type IfscPlace = {
  bank: string;
  branch: string;
  city: string;
  state: string;
  address: string;
};

type RazorpayIfsc = {
  BANK?: string;
  BRANCH?: string;
  CITY?: string;
  STATE?: string;
  ADDRESS?: string;
};

export async function lookupIndianIfsc(code: string): Promise<IfscPlace | null> {
  const ifsc = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (ifsc.length !== 11) return null;

  const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = (await res.json()) as RazorpayIfsc;
  if (!data.BANK) return null;

  return {
    bank: (data.BANK || "").trim(),
    branch: (data.BRANCH || "").trim(),
    city: (data.CITY || "").trim(),
    state: (data.STATE || "").trim(),
    address: (data.ADDRESS || "").trim(),
  };
}
