/** IFSC lookup via same-origin Next route (proxies Razorpay — no CORS / adblock issues). */

export type IfscPlace = {
  bank: string;
  branch: string;
  city: string;
  state: string;
  address: string;
};

export async function lookupIndianIfsc(code: string): Promise<IfscPlace | null> {
  const ifsc = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (ifsc.length !== 11) return null;

  const res = await fetch(`/api/ifsc/${ifsc}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = (await res.json()) as Partial<IfscPlace>;
  if (!data.bank) return null;

  return {
    bank: (data.bank || "").trim(),
    branch: (data.branch || "").trim(),
    city: (data.city || "").trim(),
    state: (data.state || "").trim(),
    address: (data.address || "").trim(),
  };
}
