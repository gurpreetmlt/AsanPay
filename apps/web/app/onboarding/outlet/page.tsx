"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { MapPin, Store } from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { EmailVerifyField } from "@/components/EmailVerifyField";
import api from "@/lib/api";
import { formatAadhaar, stripAadhaar } from "@/lib/aadhaar";
import { B } from "@/lib/brand";
import { extractApiError, nextOnboardingPath } from "@/lib/onboarding";
import { lookupIndianPincode } from "@/lib/pincode";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type Gender = "M" | "F" | "T";

export default function RegisterOutletPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [loading, setLoading] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [pinLookupBusy, setPinLookupBusy] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    gender: "M" as Gender,
    pan: "",
    email: "",
    addressFull: "",
    city: "",
    state: "",
    region: "",
    pincode: "",
    aadhaarNumber: "",
    dateOfBirth: "",
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      name: f.name || user.name,
      mobile: f.mobile || user.mobile || "",
      email: f.email || user.email || "",
    }));
  }, [user]);

  useEffect(() => {
    if (!hydrated || !accessToken || !user) return;
    if (user.role !== "retailer") {
      router.replace("/dashboard");
      return;
    }
    if (user.hasInstantpayOutlet) {
      const next = nextOnboardingPath(user);
      router.replace(next ?? "/dashboard");
    }
  }, [hydrated, accessToken, user, router]);

  // Free India Post API — autofill city / state / region when PIN is complete.
  useEffect(() => {
    const pin = form.pincode;
    if (pin.length !== 6) return;

    let cancelled = false;
    setPinLookupBusy(true);
    void lookupIndianPincode(pin)
      .then((place) => {
        if (cancelled) return;
        if (!place) {
          toast.error("Invalid pincode — check and try again");
          return;
        }
        setForm((f) => ({
          ...f,
          city: place.city || f.city,
          state: place.state || f.state,
          region: place.region || f.region,
        }));
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not look up pincode");
      })
      .finally(() => {
        if (!cancelled) setPinLookupBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.pincode]);

  if (!hydrated || !accessToken || !user) return null;

  const emailVerified =
    Boolean(user.emailVerifiedAt) &&
    Boolean(form.email.trim()) &&
    (user.email ?? "").toLowerCase() === form.email.trim().toLowerCase();

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /**
   * Free reverse-geocode (OpenStreetMap Nominatim — no API key/billing needed) so address/city/
   * pincode auto-fill from GPS, LokalMart-seller-registration style. Best-effort: on failure we
   * keep the captured lat/long (still usable for the InstantPay outlet geo requirement) and just
   * leave the address fields for manual entry.
   */
  async function reverseGeocode(lat: number, lng: number) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        display_name?: string;
        address?: Record<string, string>;
      };
      const addr = data.address ?? {};
      const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || "";
      const state = addr.state || "";
      const region = addr.suburb || addr.neighbourhood || addr.county || "";
      const pincode = (addr.postcode || "").replace(/\D/g, "").slice(0, 6);
      setResolvedAddress(data.display_name ?? "");
      setForm((f) => ({
        ...f,
        addressFull: f.addressFull || data.display_name || "",
        city: f.city || city,
        state: f.state || state,
        region: f.region || region,
        pincode: f.pincode || pincode,
      }));
    } catch {
      // Silent — geolocation itself already succeeded, address autofill is a convenience only.
    }
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Location not supported on this browser");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude.toFixed(4);
        const longitude = pos.coords.longitude.toFixed(4);
        setForm((f) => ({ ...f, latitude, longitude }));
        setGeoBusy(false);
        toast.success("Current location selected");
        void reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setGeoBusy(false);
        const denied = err.code === err.PERMISSION_DENIED;
        toast.error(
          denied
            ? "Location permission denied — allow location in browser settings"
            : "Could not get location — try again near a window / with GPS on",
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (!form.email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!emailVerified) {
      toast.error("Verify your email before continuing");
      return;
    }

    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Select current location first");
      return;
    }

    setLoading(true);
    try {
      const addressParts = [form.addressFull.trim(), form.region.trim(), form.state.trim()].filter(
        Boolean,
      );
      await api.post("/onboarding/instantpay", {
        mobile: form.mobile.replace(/\D/g, "").slice(0, 10),
        name: form.name.trim(),
        gender: form.gender,
        pan: form.pan.toUpperCase(),
        email: form.email.trim(),
        address: {
          full: addressParts.join(", "),
          city: form.city.trim(),
          pincode: form.pincode,
        },
        aadhaarNumber: form.aadhaarNumber.replace(/\s/g, ""),
        dateOfBirth: form.dateOfBirth,
        latitude: lat,
        longitude: lng,
      });

      const { data } = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (data.success) setUser(data.data.user);

      toast.success("Outlet registered on InstantPay");
      const nextUser = data.success
        ? data.data.user
        : ({ ...user, hasInstantpayOutlet: true } as AuthUser);
      router.replace(nextOnboardingPath(nextUser) ?? "/dashboard");
    } catch (err) {
      toast.error(extractApiError(err, "Outlet registration failed"));
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-1";
  const inputStyle = { borderColor: B.border, color: B.blue } as const;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5 p-6">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Store size={20} style={{ color: B.blue }} />
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Register Now
            </h1>
          </div>
          <p className="text-sm" style={{ color: B.muted }}>
            Go live in minutes — verify once, start serving customers.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border bg-white p-5"
          style={{ borderColor: B.border }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                Full name (as on PAN)
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                Mobile (Aadhaar-linked)
              </label>
              <input
                required
                inputMode="numeric"
                maxLength={10}
                value={form.mobile}
                onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile"
                className={`${inputCls} font-mono`}
                style={inputStyle}
              />
              <p className="mt-1 text-xs" style={{ color: B.muted }}>
                Must be the mobile linked to Aadhaar (InstantPay verifies this).
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                Gender
              </label>
              <select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value as Gender)}
                className={inputCls}
                style={inputStyle}
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="T">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                Date of birth
              </label>
              <input
                required
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                PAN
              </label>
              <input
                required
                value={form.pan}
                onChange={(e) => set("pan", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                placeholder="ABCDE1234F"
                className={`${inputCls} font-mono`}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                Aadhaar
              </label>
              <input
                required
                inputMode="numeric"
                value={formatAadhaar(form.aadhaarNumber)}
                onChange={(e) => set("aadhaarNumber", stripAadhaar(e.target.value))}
                placeholder="1234 1234 1234"
                className={`${inputCls} font-mono`}
                style={inputStyle}
              />
            </div>

            <div className="sm:col-span-2">
              <EmailVerifyField
                required
                email={form.email}
                onChange={(v) => set("email", v)}
                inputClassName={inputCls}
                inputStyle={inputStyle}
              />
              {!emailVerified && form.email.trim() ? (
                <p className="mt-1.5 text-xs" style={{ color: "#B45309" }}>
                  Verify your email before registering the outlet.
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                Pincode
              </label>
              <input
                required
                inputMode="numeric"
                value={form.pincode}
                onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                City
              </label>
              <input
                required
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder={pinLookupBusy ? "Looking up…" : "City / district"}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                State
              </label>
              <input
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                placeholder="State"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                Region
              </label>
              <input
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                placeholder="Region / locality"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                Address (as on Aadhaar)
              </label>
              <input
                required
                value={form.addressFull}
                onChange={(e) => set("addressFull", e.target.value)}
                placeholder="House / street / landmark"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            {pinLookupBusy ? (
              <p className="sm:col-span-2 text-xs" style={{ color: B.muted }}>
                Fetching city, state, and region from India Post…
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={captureLocation}
            disabled={geoBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-bold disabled:opacity-50"
            style={{
              borderColor: form.latitude && form.longitude ? B.green : B.blue,
              background: form.latitude && form.longitude ? `${B.green}12` : `${B.blue}08`,
              color: form.latitude && form.longitude ? B.green : B.blue,
            }}
          >
            <MapPin size={16} />
            {geoBusy
              ? "Detecting location…"
              : form.latitude && form.longitude
                ? "Location set — tap to refresh"
                : "Use current location"}
          </button>

          {resolvedAddress && (
            <p className="text-xs" style={{ color: B.blue }}>
              📍 {resolvedAddress}
            </p>
          )}

          <p className="text-xs" style={{ color: B.muted }}>
            Enter pincode to autofill city/state/region, or use current location. Edit if not
            accurate — must match InstantPay outlet geo requirements.
          </p>

          <button
            type="submit"
            disabled={loading || !emailVerified}
            className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: B.blue }}
          >
            {loading ? "Registering…" : "Register Now"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
