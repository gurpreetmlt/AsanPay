"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Headphones, MapPin } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type SupportForm = {
  supportPhone: string;
  supportEmail: string;
  supportWhatsapp: string;
  nodalEmail: string;
  nodalPhone: string;
  nodalAddress: string;
};

const EMPTY: SupportForm = {
  supportPhone: "",
  supportEmail: "",
  supportWhatsapp: "",
  nodalEmail: "",
  nodalPhone: "",
  nodalAddress: "",
};

export default function PlatformSettingsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [form, setForm] = useState<SupportForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await fetchApi<SupportForm & Record<string, unknown>>("/admin/tenant-settings");
      setForm({
        supportPhone: settings.supportPhone ?? "",
        supportEmail: settings.supportEmail ?? "",
        supportWhatsapp: settings.supportWhatsapp ?? "",
        nodalEmail: settings.nodalEmail ?? "",
        nodalPhone: settings.nodalPhone ?? "",
        nodalAddress: settings.nodalAddress ?? "",
      });
    } catch {
      toast.error("Failed to load platform settings");
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            Platform Settings
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Care contacts shown on agent Support (call, WhatsApp, email, nodal officer). Stored in the
            database — no redeploy to change.
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
                  placeholder="care@asanpay.in"
                />
                <Field
                  label="WhatsApp number"
                  hint="Digits only with country code (e.g. 9198xxxxxxxx) for WhatsApp Us"
                  value={form.supportWhatsapp}
                  onChange={(v) => setField("supportWhatsapp", v)}
                  placeholder="9198xxxxxxxx"
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
          </>
        )}
      </div>
    </AdminShell>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold" style={{ color: B.muted }}>
        {label}
      </span>
      {hint && (
        <span className="block text-[14px]" style={{ color: B.muted }}>
          {hint}
        </span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2"
        style={{ borderColor: B.border }}
      />
    </label>
  );
}
