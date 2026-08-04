import { NextResponse } from "next/server";

type RazorpayIfsc = {
  BANK?: string;
  BRANCH?: string;
  CITY?: string;
  STATE?: string;
  ADDRESS?: string;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await ctx.params;
  const ifsc = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (ifsc.length !== 11) {
    return NextResponse.json({ error: "Invalid IFSC" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (res.status === 404) {
      return NextResponse.json({ error: "IFSC not found" }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
    }
    const data = (await res.json()) as RazorpayIfsc;
    if (!data.BANK) {
      return NextResponse.json({ error: "IFSC not found" }, { status: 404 });
    }
    return NextResponse.json({
      bank: (data.BANK || "").trim(),
      branch: (data.BRANCH || "").trim(),
      city: (data.CITY || "").trim(),
      state: (data.STATE || "").trim(),
      address: (data.ADDRESS || "").trim(),
    });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
  }
}
