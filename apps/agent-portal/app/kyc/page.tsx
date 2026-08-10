"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { useAuthStore } from "@/lib/store";

/** Legacy /kyc URL → Settings → Profile & KYC (single entrypoint). */
export default function KycPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    router.replace("/settings?tab=profile");
  }, [hydrated, accessToken, router]);

  return null;
}
