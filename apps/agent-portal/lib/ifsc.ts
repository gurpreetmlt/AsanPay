/** IFSC lookup via AsanPay API proxy (server fetches Razorpay). */

import api from "@/lib/api";
import type { ApiResponse } from "@asanpay/shared-types";

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

  try {
    const { data } = await api.get<ApiResponse<IfscPlace>>(`/kyc/ifsc/${ifsc}`);
    if (!data.success || !data.data?.bank) return null;
    return {
      bank: data.data.bank.trim(),
      branch: (data.data.branch || "").trim(),
      city: (data.data.city || "").trim(),
      state: (data.data.state || "").trim(),
      address: (data.data.address || "").trim(),
    };
  } catch {
    return null;
  }
}
