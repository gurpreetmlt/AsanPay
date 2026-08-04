/** Free India Post PIN lookup — https://api.postalpincode.in (no API key). */

export type PincodePlace = {
  city: string;
  state: string;
  region: string;
};

type PostalApiOffice = {
  Name?: string;
  District?: string;
  State?: string;
  Region?: string;
  Block?: string;
};

type PostalApiBlock = {
  Status?: string;
  PostOffice?: PostalApiOffice[] | null;
};

export async function lookupIndianPincode(pin: string): Promise<PincodePlace | null> {
  const pincode = pin.replace(/\D/g, "");
  if (pincode.length !== 6) return null;

  const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;

  const raw = (await res.json()) as PostalApiBlock[] | PostalApiBlock;
  const block = Array.isArray(raw) ? raw[0] : raw;
  if (!block || block.Status !== "Success" || !block.PostOffice?.length) return null;

  const po = block.PostOffice[0];
  return {
    city: (po.District || po.Block || "").trim(),
    state: (po.State || "").trim(),
    region: (po.Region || po.Name || "").trim(),
  };
}
