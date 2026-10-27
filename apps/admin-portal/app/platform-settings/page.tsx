"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Headphones, LocateFixed, MapPin } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";
import { LabelText } from "@/components/ui/RequiredMark";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type SupportForm = {
  supportPhone: string;
  supportEmail: string;
  supportWhatsapp: string;
  supportWebsite: string;
  nodalEmail: string;
  nodalPhone: string;
  nodalAddress: string;
};

const EMPTY: SupportForm = {
  supportPhone: "",
  supportEmail: "",
  supportWhatsapp: "",
  supportWebsite: "https://asanpay.in",
  nodalEmail: "",
  nodalPhone: "",
  nodalAddress: "",
};

type GeofenceEffective = {
  enabled: boolean;
  shopKm: number;
  homeKm: number;
  shopKmSource: "admin" | "server";
  homeKmSource: "admin" | "server";
};

type GeofenceForm = { enabled: boolean; shopKm: string; homeKm: string };

/** Must match backend GEOFENCE_BOUNDS (tenants/geofenceSettings.ts). */
const SHOP_KM_MAX = 50;
const HOME_KM_MAX = 20;

function radiusError(raw: string, label: "Shop" | "Home", max: number): string | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n) || n < 1 || n > max) {
    return `${label} radius must be between 1 and ${max} km`;
  }
  return null;
}

function sourceLabel(source: "admin" | "server"): string {
  return source === "admin" ? "set here" : "server default";
}

export default function PlatformSettingsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [form, setForm] = useState<SupportForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [geoEffective, setGeoEffective] = useState<GeofenceEffective | null>(null);
  const [geo, setGeo] = useState<GeofenceForm>({ enabled: true, shopKm: "", homeKm: "" });
  const [geoSaving, setGeoSaving] = useState(false);
  const [confirmGeoOff, setConfirmGeoOff] = useState(false);

  const applyGeofence = useCallback((g: GeofenceEffective | undefined) => {
    if (!g) return;
    setGeoEffective(g);
    setGeo({ enabled: g.enabled, shopKm: String(g.shopKm), homeKm: String(g.homeKm) });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await fetchApi<
        SupportForm & { geofence?: GeofenceEffective } & Record<string, unknown>
      >("/admin/tenant-settings");
      applyGeofence(settings.geofence);
      setForm({
        supportPhone: settings.supportPhone ?? "",
        supportEmail: settings.supportEmail ?? "",
        supportWhatsapp: settings.supportWhatsapp ?? "",
        supportWebsite: settings.supportWebsite ?? "https://asanpay.in",
        nodalEmail: settings.nodalEmail ?? "",
        nodalPhone: settings.nodalPhone ?? "",
        nodalAddress: settings.nodalAddress ?? "",
      });
    } catch {
      toast.error("Failed to load platform settings");
    } finally {
      setLoading(false);
    }
  }, [applyGeofence]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  function setField<K extends keyof SupportForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch("/admin/tenant-settings", {
        supportPhone: form.supportPhone.trim(),
        supportEmail: form.supportEmail.trim(),
        supportWhatsapp: form.supportWhatsapp.trim(),
        supportWebsite: form.supportWebsite.trim(),
        nodalEmail: form.nodalEmail.trim(),
        nodalPhone: form.nodalPhone.trim(),
        nodalAddress: form.nodalAddress.trim(),
      });
      toast.success("Platform care settings saved");
      await load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Could not save platform settings";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const shopKmError = radiusError(geo.shopKm, "Shop", SHOP_KM_MAX);
  const homeKmError = radiusError(geo.homeKm, "Home", HOME_KM_MAX);

  function requestSaveGeofence() {
    if (shopKmError || homeKmError) {
      toast.error(shopKmError ?? homeKmError ?? "");
      return;
    }
    if (!geo.enabled && geoEffective?.enabled !== false) {
      setConfirmGeoOff(true);
      return;
    }
    void saveGeofence();
  }

  async function saveGeofence() {
    setGeoSaving(true);
    try {
      const shopKm = Number(geo.shopKm);
      const homeKm = Number(geo.homeKm);
      const patch: { enabled: boolean; shopKm?: number; homeKm?: number } = { enabled: geo.enabled };
      // Only pin a radius when it differs from the server default (or was already set here),
      // so an unchanged field keeps following the env value.
      if (shopKm !== geoEffective?.shopKm || geoEffective?.shopKmSource === "admin") patch.shopKm = shopKm;
      if (homeKm !== geoEffective?.homeKm || geoEffective?.homeKmSource === "admin") patch.homeKm = homeKm;
      await api.patch("/admin/tenant-settings", { geofence: patch });
      const settings = await fetchApi<{ geofence?: GeofenceEffective }>("/admin/tenant-settings");
      applyGeofence(settings.geofence);
      setConfirmGeoOff(false);
      toast.success("Location limits saved");
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Could not save location limits";
      toast.error(message);
    } finally {
      setGeoSaving(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            Support contacts
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Care contacts shown on agent Support (call, WhatsApp, email, website, nodal officer).
            Stored in the database — no redeploy to change.
          </p>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
              <section
                className="space-y-4 rounded-2xl border bg-white p-5"
                style={{ borderColor: B.border }}
              >
                <div className="flex items-center gap-2">
                  <Headphones size={18} style={{ color: B.blueLight }} />
                  <h2 className="text-sm font-bold" style={{ color: B.blue }}>
                    Care desk
                  </h2>
                </div>
                <Field
                  label="Support phone"
                  hint="Shown as company call number on Support"
                  value={form.supportPhone}
                  onChange={(v) => setField("supportPhone", v)}
                  placeholder="1800-xxx-xxxx or 10-digit mobile"
                />
                <Field
                  label="Support email"
                  value={form.supportEmail}
                  onChange={(v) => setField("supportEmail", v)}
                  placeholder="help@asanpay.in"
                />
                <Field
                  label="WhatsApp number"
                  hint="Digits only with country code (e.g. 9198xxxxxxxx) for WhatsApp Us"
                  value={form.supportWhatsapp}
                  onChange={(v) => setField("supportWhatsapp", v)}
                  placeholder="9198xxxxxxxx"
                />
                <Field
                  label="Website"
                  hint="Shown on agent Support → Company box"
                  value={form.supportWebsite}
                  onChange={(v) => setField("supportWebsite", v)}
                  placeholder="https://asanpay.in"
                />
              </section>

              <section
                className="space-y-4 rounded-2xl border bg-white p-5"
                style={{ borderColor: B.border }}
              >
                <div className="flex items-center gap-2">
                  <MapPin size={18} style={{ color: B.blueLight }} />
                  <h2 className="text-sm font-bold" style={{ color: B.blue }}>
                    Nodal officer
                  </h2>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold" style={{ color: B.muted }}>
                    Postal address
                  </span>
                  <textarea
                    value={form.nodalAddress}
                    onChange={(e) => setField("nodalAddress", e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: B.border }}
                    placeholder="Full postal / registered address for grievance letters"
                  />
                </label>
                <Field
                  label="Nodal email"
                  value={form.nodalEmail}
                  onChange={(v) => setField("nodalEmail", v)}
                  placeholder="grievance@asanpay.in"
                />
                <Field
                  label="Nodal phone"
                  value={form.nodalPhone}
                  onChange={(v) => setField("nodalPhone", v)}
                  placeholder="Same as care or a dedicated line"
                />
              </section>
            </div>

            <p className="text-xs" style={{ color: B.muted }}>
              Distributor / upline phone and email come from each agent’s linked parent account — not
              from this page.
            </p>

            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50 lg:max-w-md"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Saving…" : "Save platform settings"}
            </button>

            <section
              className="space-y-4 rounded-2xl border bg-white p-5 lg:max-w-3xl"
              style={{ borderColor: B.border }}
            >
              <div className="flex items-center gap-2">
                <LocateFixed size={18} style={{ color: B.blueLight }} />
                <h2 className="text-sm font-bold" style={{ color: B.blue }}>
                  Location limits
                </h2>
              </div>
              <p className="text-[12px]" style={{ color: B.muted }}>
                AePS and money transfer are allowed only near the agent’s registered shop or home.
                Changes apply within about 30 seconds — no redeploy.
              </p>

              {geoEffective && (
                <div
                  className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border px-3 py-2 text-xs"
                  style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
                >
                  <span className="font-semibold" style={{ color: B.blue }}>
                    In effect now
                  </span>
                  <span>
                    Shop {geoEffective.shopKm} km ({sourceLabel(geoEffective.shopKmSource)})
                  </span>
                  <span>
                    Home {geoEffective.homeKm} km ({sourceLabel(geoEffective.homeKmSource)})
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: geoEffective.enabled ? B.green : B.danger }}
                  >
                    Location check {geoEffective.enabled ? "on" : "off"}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Shop radius (km)"
                  hint="Services work within this distance of the agent’s shop"
                  type="number"
                  value={geo.shopKm}
                  onChange={(v) => setGeo((p) => ({ ...p, shopKm: v }))}
                  placeholder={`1–${SHOP_KM_MAX}`}
                  error={shopKmError}
                />
                <Field
                  label="Home radius (km)"
                  hint="Services work within this distance of the agent’s home"
                  type="number"
                  value={geo.homeKm}
                  onChange={(v) => setGeo((p) => ({ ...p, homeKm: v }))}
                  placeholder={`1–${HOME_KM_MAX}`}
                  error={homeKmError}
                />
              </div>

              <div
                className="flex items-start justify-between gap-3 rounded-xl border px-3 py-3"
                style={{ borderColor: geo.enabled ? B.border : B.danger }}
              >
                <div className="min-w-0">
                  <span className="block text-xs font-semibold" style={{ color: B.muted }}>
                    Location check
                  </span>
                  <span className="block text-[12px]" style={{ color: geo.enabled ? B.muted : B.danger }}>
                    Turn off only in an emergency — services will work from any location
                  </span>
                </div>
                <ToggleSwitch
                  checked={geo.enabled}
                  onChange={(next) => setGeo((p) => ({ ...p, enabled: next }))}
                  label="Location check"
                  disabled={geoSaving}
                />
              </div>

              <button
                type="button"
                disabled={geoSaving || Boolean(shopKmError || homeKmError)}
                onClick={requestSaveGeofence}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50 lg:max-w-md"
                style={{ background: B.badgeGrad }}
              >
                {geoSaving ? "Saving…" : "Save location limits"}
              </button>
            </section>
          </>
        )}
      </div>

      {confirmGeoOff && (
        <DangerConfirmModal
          title="Turn off location check?"
          message="AePS and money transfer will work from any location until you turn the check back on. Use this only in an emergency."
          confirmLabel="Turn off check"
          cancelLabel="Keep it on"
          busy={geoSaving}
          busyLabel="Saving…"
          onConfirm={() => void saveGeofence()}
          onClose={() => {
            if (!geoSaving) setConfirmGeoOff(false);
          }}
        />
      )}
    </AdminShell>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  error?: string | null;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold" style={{ color: B.muted }}>
        <LabelText label={label} />
      </span>
      {hint && (
        <span className="block text-[12px]" style={{ color: B.muted }}>
          {hint}
        </span>
      )}
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        min={type === "number" ? 1 : undefined}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2"
        style={{ borderColor: error ? B.danger : B.border }}
      />
      {error && (
        <span className="block text-[12px] font-semibold" style={{ color: B.danger }}>
          {error}
        </span>
      )}
    </label>
  );
}
