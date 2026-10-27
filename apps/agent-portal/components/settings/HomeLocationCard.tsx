"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Home, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import type { ApiResponse } from "@asanpay/shared-types";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { SignupGeoCapture } from "@/components/signup/SignupGeoCapture";

function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/** Settings → Profile & KYC: add the home location after a signup done at the shop (set once). */
export function HomeLocationCard() {
  const [savedAt, setSavedAt] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<ApiResponse<{ profile: { homeLocationAt?: string | null } }>>("/kyc/me")
      .then(({ data }) => {
        if (!cancelled && data.success) setSavedAt(data.data.profile.homeLocationAt ?? null);
      })
      .catch(() => {
        if (!cancelled) setSavedAt(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(token: string) {
    setSaving(true);
    try {
      const { data } = await api.post<ApiResponse<{ homeLocationAt: string }>>("/kyc/home-location", {
        geoLinkToken: token,
      });
      if (!data.success) throw new Error(data.message);
      setSavedAt(data.data.homeLocationAt);
      toast.success("Home location saved. Services now also work near your home.");
    } catch (err) {
      toast.error(extractApiError(err, "Could not save your home location. Capture it again."));
    } finally {
      setSaving(false);
    }
  }

  if (savedAt === undefined) return null;

  return (
    <div className="space-y-3 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
      <h2 className="text-lg font-bold" style={{ color: B.blue }}>
        Home location
      </h2>
      {savedAt ? (
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}
        >
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-700" />
          <div className="text-sm">
            <p className="font-semibold text-green-800">Saved on {formatSavedAt(savedAt)}</p>
            <p className="text-xs text-green-700">
              Services work near your shop and near this home location. Contact support to change it.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="flex items-start gap-2 text-xs" style={{ color: B.muted }}>
            <Home size={14} className="mt-0.5 shrink-0" />
            Not added yet — services work only near your shop. Add it once while you are at home; it cannot be
            changed later without support.
          </p>
          {saving ? (
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: B.blueMid }}>
              <Loader2 size={16} className="animate-spin" />
              Saving home location…
            </p>
          ) : (
            <SignupGeoCapture
              purpose="home"
              value={null}
              hint="Be at home while capturing. Scan the QR with your phone camera and allow location."
              onChange={(fix) => {
                if (fix?.token) void save(fix.token);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
