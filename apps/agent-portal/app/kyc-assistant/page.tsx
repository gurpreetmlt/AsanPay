"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ShieldCheck, User, CreditCard, Fingerprint, MapPin, Store } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { extractApiError } from "@/lib/onboarding";
import { fetchApi } from "@/lib/api";

interface DownlineItem {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
  kycStatus: string;
  hasPan: boolean;
  hasAadhaar: boolean;
  hasOutlet: boolean;
  hasOutletGeo: boolean;
}

interface NetworkData {
  downline: DownlineItem[];
}

const FIELD_META = [
  { key: "hasPan" as const, label: "PAN", icon: CreditCard },
  { key: "hasAadhaar" as const, label: "Aadhaar", icon: Fingerprint },
  { key: "hasOutlet" as const, label: "Outlet registration", icon: Store },
  { key: "hasOutletGeo" as const, label: "Outlet location", icon: MapPin },
];

export default function KycAssistantPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [pending, setPending] = useState<DownlineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken || !user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchApi<NetworkData>("/users/network");
        if (!alive) return;
        setPending(data.downline.filter((m) => m.kycStatus !== "verified"));
      } catch (err) {
        if (alive) toast.error(extractApiError(err, "Failed to load KYC data"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, user]);

  if (!hydrated || !accessToken || !user) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} style={{ color: B.blueLight }} />
          <h1 className="text-xl font-bold" style={{ color: B.blue }}>
            KYC Completion Assistant
          </h1>
        </div>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          Exactly which fields are missing for each not-yet-verified member of your network — no
          guesswork, this reads the same fields your onboarding form and admin KYC review use.
        </p>

        <div className="mt-4 space-y-3">
          {loading && (
            <p className="py-8 text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          )}
          {!loading && pending.length === 0 && (
            <div className="rounded-2xl border bg-white px-4 py-10 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
              Everyone in your network is KYC verified 🎉
            </div>
          )}
          {!loading &&
            pending.map((m) => {
              const missing = FIELD_META.filter((f) => !m[f.key]);
              return (
                <div key={m.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{ background: `${B.blue}12` }}
                      >
                        <User size={16} style={{ color: B.blue }} />
                      </div>
                      <div>
                        <div className="font-medium" style={{ color: B.blue }}>{m.name}</div>
                        <div className="text-xs" style={{ color: B.muted }}>{m.mobile} · {m.uid}</div>
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-bold capitalize"
                      style={{ background: "#FEF3C7", color: "#92400E" }}
                    >
                      {m.kycStatus.replace(/_/g, " ")}
                    </span>
                  </div>

                  {missing.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {missing.map((f) => (
                        <span
                          key={f.key}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
                          style={{ background: "#FEE2E2", color: "#991B1B" }}
                        >
                          <f.icon size={12} /> Missing: {f.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs" style={{ color: B.muted }}>
                      All fields submitted — awaiting admin verification.
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </AppShell>
  );
}
