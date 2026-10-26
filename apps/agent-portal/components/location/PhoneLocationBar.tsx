"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, MapPin } from "lucide-react";
import { toast } from "react-hot-toast";
import { B } from "@/lib/brand";
import { savePhoneLocation, todayPhoneLocation, type PhoneLocation } from "@/lib/phoneLocation";
import { PhoneLocationModal } from "./PhoneLocationModal";

/** AePS strip: today's phone-verified location, or a button to verify it with the phone. */
export function PhoneLocationBar() {
  const [loc, setLoc] = useState<PhoneLocation | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLoc(todayPhoneLocation());
  }, []);

  return (
    <>
      <div
        className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
        style={
          loc
            ? { borderColor: `${B.green}55`, background: `${B.green}0D` }
            : { borderColor: `${B.blue}33`, background: `${B.blue}0A` }
        }
      >
        <div className="flex items-center gap-2.5 text-sm">
          {loc ? (
            <CheckCircle2 size={18} style={{ color: B.greenDark }} />
          ) : (
            <MapPin size={18} style={{ color: B.blue }} />
          )}
          <div>
            <p className="font-bold" style={{ color: loc ? B.greenDark : B.blue }}>
              {loc ? "Location verified with your phone" : "Verify your location with your phone"}
            </p>
            <p className="text-xs" style={{ color: B.muted }}>
              {loc
                ? `${loc.latitude}, ${loc.longitude}${loc.accuracyMeters != null ? ` · ±${loc.accuracyMeters} m` : ""} — valid for today`
                : "Computer location is often wrong. Scan a QR with the AsanPay app to use your phone's GPS."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white"
          style={{ background: loc ? B.greenDark : B.blue }}
        >
          <MapPin size={14} />
          {loc ? "Verify again" : "Verify location"}
        </button>
      </div>
      <PhoneLocationModal
        open={open}
        purpose="aeps"
        onClose={() => setOpen(false)}
        onVerified={(v) => {
          const next = { latitude: v.latitude, longitude: v.longitude, accuracyMeters: v.accuracyMeters };
          savePhoneLocation(next);
          setLoc(next);
          setOpen(false);
          toast.success("Location verified with your phone");
        }}
      />
    </>
  );
}
