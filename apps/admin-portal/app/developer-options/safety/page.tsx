"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Trash2 } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useDevOptionsStore } from "@/lib/devOptionsStore";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

export default function DeveloperSafetyPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const rowDeleteEnabled = useDevOptionsStore((s) => s.rowDeleteEnabled);
  const setRowDeleteEnabled = useDevOptionsStore((s) => s.setRowDeleteEnabled);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  // Avoid SSR/localStorage mismatch on the toggle
  useEffect(() => {
    setReady(true);
  }, []);

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 md:px-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            Safety
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Developer switches that control destructive UI across admin tables
          </p>
        </div>

        <div
          className="rounded-2xl border bg-white p-5 shadow-sm"
          style={{ borderColor: B.border }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: rowDeleteEnabled ? "#FEE2E2" : B.secondary }}
              >
                <Trash2 size={18} style={{ color: rowDeleteEnabled ? "#DC2626" : B.blueLight }} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold" style={{ color: B.blue }}>
                  Enable row delete
                </h2>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: B.muted }}>
                  When on, Delete / Trash icons appear on All Agents and other admin tables
                  (commission rules, service charges, shared action buttons). When off, those
                  icons are hidden.
                </p>
                <p className="mt-2 text-xs font-semibold" style={{ color: "#B45309" }}>
                  This only affects this browser. Keep off unless you are intentionally cleaning
                  data.
                </p>
              </div>
            </div>
            {ready ? (
              <ToggleSwitch
                checked={rowDeleteEnabled}
                label="Enable row delete"
                onChange={(next) => {
                  setRowDeleteEnabled(next);
                  toast.success(
                    next
                      ? "Row delete enabled — trash icons are visible"
                      : "Row delete disabled — trash icons hidden",
                  );
                }}
              />
            ) : (
              <div className="h-7 w-12 rounded-full" style={{ background: B.secondary }} />
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
