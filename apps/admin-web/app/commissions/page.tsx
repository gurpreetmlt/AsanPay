"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Percent } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

/** Placeholder — DifferentMart-style commission settings (full builder next). */
export default function CommissionsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: B.badgeGrad }}>
            <Percent size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Commission Schemes
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              Fintech hierarchy payouts (SD → Dist → Retailer) — builder next phase
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
          <p className="text-sm leading-relaxed" style={{ color: B.muted }}>
            AsanPay commission matrix yahan aayega: service-wise %, slab, and who gets share.
            Abhi live tile badges Site Control se set karo.
          </p>
          <Link
            href="/site-control"
            className="mt-4 inline-flex rounded-xl px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: B.badgeGrad }}
          >
            Open Site Control (badges)
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}
