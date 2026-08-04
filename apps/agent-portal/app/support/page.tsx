"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  LifeBuoy,
  MessageCircle,
  Phone,
  Mail,
  Ticket,
  MapPin,
  PlayCircle,
  ChevronRight,
  Plus,
  X,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { B, brand } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { extractApiError } from "@/lib/onboarding";
import api, { fetchApi } from "@/lib/api";

interface TicketRow {
  id: string;
  subject: string;
  description: string;
  status: "open" | "resolved";
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface UplineItem {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
}

interface NetworkData {
  upline: UplineItem | null;
}

interface SupportContacts {
  supportPhone: string;
  supportEmail: string;
  supportWhatsapp: string;
  nodalEmail: string;
  nodalPhone: string;
  nodalAddress: string;
}

const EMPTY_CONTACTS: SupportContacts = {
  supportPhone: "",
  supportEmail: "",
  supportWhatsapp: "",
  nodalEmail: "",
  nodalPhone: "",
  nodalAddress: "",
};

const HELP_VIDEOS = [
  { title: "How to complete AePS cash withdrawal", tag: "AePS" },
  { title: "DMT money transfer walkthrough", tag: "DMT" },
  { title: "Add money & check Balance", tag: "Balance" },
  { title: "Set transaction PIN safely", tag: "Security" },
] as const;

function roleLabel(role: string) {
  if (role === "super_distributor") return "Super Distributor";
  if (role === "distributor") return "Distributor";
  if (role === "retailer") return "Retailer";
  return role;
}

function telHref(mobile: string) {
  const digits = mobile.replace(/\D/g, "");
  if (!digits) return undefined;
  return `tel:+${digits.startsWith("91") ? digits : `91${digits}`}`;
}

function waHref(mobile: string) {
  const digits = mobile.replace(/\D/g, "");
  if (!digits) return undefined;
  const n = digits.startsWith("91") ? digits : `91${digits}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(`Hi, I need help with my ${brand.name} account.`)}`;
}

function mailto(email: string) {
  if (!email.trim()) return undefined;
  return `mailto:${email.trim()}?subject=${encodeURIComponent(`${brand.name} support request`)}`;
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  return raw.trim();
}

export default function SupportPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [upline, setUpline] = useState<UplineItem | null>(null);
  const [contacts, setContacts] = useState<SupportContacts>(EMPTY_CONTACTS);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadTickets() {
    setLoading(true);
    try {
      setTickets(await fetchApi<TicketRow[]>("/support/mine"));
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load tickets"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken) return;
    void loadTickets();
    void fetchApi<NetworkData>("/users/network")
      .then((res) => setUpline(res.upline))
      .catch(() => setUpline(null));
    void fetchApi<SupportContacts>("/support/contacts")
      .then((res) => setContacts(res))
      .catch(() => setContacts(EMPTY_CONTACTS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function submit() {
    if (subject.trim().length < 3) {
      toast.error("Subject must be at least 3 characters");
      return;
    }
    if (description.trim().length < 3) {
      toast.error("Description must be at least 3 characters");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/support", { subject: subject.trim(), description: description.trim() });
      toast.success("Ticket raised");
      setSubject("");
      setDescription("");
      setShowForm(false);
      await loadTickets();
    } catch (err) {
      toast.error(extractApiError(err, "Failed to raise ticket"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  const distributorLabel = upline
    ? `${roleLabel(upline.role)} (${upline.name})`
    : "Your distributor / upline";
  const distributorMobile = upline?.mobile?.trim() || null;
  const distributorEmail = upline?.email?.trim() || null;
  const carePhone = contacts.supportPhone.trim();
  const careEmail = contacts.supportEmail.trim();
  const careWa = contacts.supportWhatsapp.trim();
  const nodalEmail = contacts.nodalEmail.trim();
  const nodalPhone = contacts.nodalPhone.trim() || carePhone;
  const nodalAddress = contacts.nodalAddress.trim();
  const waLink = waHref(careWa);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: B.muted }}>
            Help & support
          </p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl" style={{ color: B.blue }}>
            We are here to help
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Reach your upline or {brand.name} care — raise a ticket when you need a written trail.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div
              className="overflow-hidden rounded-2xl border bg-white shadow-sm"
              style={{ borderColor: B.border }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
                style={{ borderColor: B.border }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-full"
                    style={{ background: "rgba(18,183,106,0.12)" }}
                  >
                    <MessageCircle size={20} style={{ color: B.green }} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold" style={{ color: B.blue }}>
                        WhatsApp support
                      </h2>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ background: "rgba(18,183,106,0.15)", color: B.greenDark }}
                      >
                        <Zap size={10} /> Faster response
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: B.muted }}>
                      Chat with {brand.name} care on WhatsApp
                    </p>
                  </div>
                </div>
                {waLink ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
                    style={{ background: B.walletGrad }}
                  >
                    <MessageCircle size={16} />
                    WhatsApp us
                  </a>
                ) : (
                  <span
                    className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold opacity-50"
                    style={{ borderColor: B.border, color: B.muted }}
                    title="Admin has not set WhatsApp number yet"
                  >
                    <MessageCircle size={16} />
                    Not configured
                  </span>
                )}
              </div>

              <div
                className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0"
                style={{ borderColor: B.border }}
              >
                <div className="space-y-4 p-5">
                  <div className="flex items-center gap-2">
                    <Phone size={16} style={{ color: B.blueLight }} />
                    <h3 className="text-sm font-bold" style={{ color: B.blue }}>
                      Call support
                    </h3>
                  </div>

                  <ContactRow
                    title={distributorLabel}
                    value={
                      distributorMobile
                        ? formatPhone(distributorMobile)
                        : "No upline linked on this account"
                    }
                    actionLabel="Call"
                    href={distributorMobile ? telHref(distributorMobile) : undefined}
                    icon="phone"
                    disabled={!distributorMobile}
                  />
                  <ContactRow
                    title={brand.name}
                    value={carePhone ? formatPhone(carePhone) : "Not set by admin yet"}
                    actionLabel="Call"
                    href={carePhone ? telHref(carePhone) : undefined}
                    icon="phone"
                    disabled={!carePhone}
                  />

                  <div
                    className="rounded-xl border px-3 py-3"
                    style={{ borderColor: B.border, background: B.bg }}
                  >
                    <p className="text-xs font-semibold" style={{ color: B.blue }}>
                      Prefer a callback?
                    </p>
                    <p className="mt-0.5 text-[11px]" style={{ color: B.muted }}>
                      Raise a ticket with your mobile number — care will call you back within working
                      hours.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(true);
                        setSubject((s) => s || "Request a callback");
                      }}
                      className="mt-2 text-xs font-bold underline-offset-2 hover:underline"
                      style={{ color: B.blueLight }}
                    >
                      Raise callback ticket →
                    </button>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-center gap-2">
                    <Mail size={16} style={{ color: B.blueLight }} />
                    <h3 className="text-sm font-bold" style={{ color: B.blue }}>
                      Email support
                    </h3>
                  </div>

                  <ContactRow
                    title={upline ? `${roleLabel(upline.role)} (${upline.name})` : "Your distributor"}
                    value={
                      distributorEmail
                        ? distributorEmail
                        : upline
                          ? "Upline has no email on file"
                          : "No upline linked on this account"
                    }
                    actionLabel="Email"
                    href={distributorEmail ? mailto(distributorEmail) : undefined}
                    icon="mail"
                    disabled={!distributorEmail}
                  />
                  <ContactRow
                    title={`${brand.name} care`}
                    value={careEmail || "Not set by admin yet"}
                    actionLabel="Email"
                    href={careEmail ? mailto(careEmail) : undefined}
                    icon="mail"
                    disabled={!careEmail}
                  />
                </div>
              </div>
            </div>

            <div
              className="rounded-2xl border bg-white p-5 shadow-sm lg:hidden"
              style={{ borderColor: B.border }}
            >
              <TicketsBlock
                tickets={tickets}
                loading={loading}
                showForm={showForm}
                setShowForm={setShowForm}
                subject={subject}
                setSubject={setSubject}
                description={description}
                setDescription={setDescription}
                submitting={submitting}
                onSubmit={() => void submit()}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div
              className="rounded-2xl border bg-white p-4 shadow-sm"
              style={{ borderColor: B.border }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold" style={{ color: B.blue }}>
                  Featured guides
                </h3>
                <span className="text-[11px] font-semibold" style={{ color: B.muted }}>
                  Self-help
                </span>
              </div>
              <div className="space-y-2">
                {HELP_VIDEOS.map((v) => (
                  <button
                    key={v.title}
                    type="button"
                    onClick={() =>
                      toast("Video guides will open here soon — raise a ticket if you need help now")
                    }
                    className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:bg-secondary/60"
                    style={{ borderColor: B.border }}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: B.secondary }}
                    >
                      <PlayCircle size={18} style={{ color: B.blueLight }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold" style={{ color: B.blue }}>
                        {v.title}
                      </p>
                      <p
                        className="text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: B.muted }}
                      >
                        {v.tag}
                      </p>
                    </div>
                    <ChevronRight size={14} style={{ color: B.muted }} />
                  </button>
                ))}
              </div>
            </div>

            <div
              className="hidden rounded-2xl border bg-white p-4 shadow-sm lg:block"
              style={{ borderColor: B.border }}
            >
              <TicketsBlock
                tickets={tickets}
                loading={loading}
                showForm={showForm}
                setShowForm={setShowForm}
                subject={subject}
                setSubject={setSubject}
                description={description}
                setDescription={setDescription}
                submitting={submitting}
                onSubmit={() => void submit()}
                compact
              />
            </div>

            <div
              className="rounded-2xl border bg-white p-4 shadow-sm"
              style={{ borderColor: B.border }}
            >
              <div className="mb-2 flex items-center gap-2">
                <MapPin size={16} style={{ color: B.blueLight }} />
                <h3 className="text-sm font-bold" style={{ color: B.blue }}>
                  Nodal officer
                </h3>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: B.muted }}>
                {nodalAddress || "Postal address not set by admin yet."}
              </p>
              <div className="mt-3 space-y-1.5 text-xs font-medium" style={{ color: B.blueMid }}>
                {nodalEmail ? (
                  <a href={mailto(nodalEmail)} className="flex items-center gap-2 hover:underline">
                    <Mail size={13} /> {nodalEmail}
                  </a>
                ) : (
                  <span className="flex items-center gap-2 opacity-60">
                    <Mail size={13} /> Email not set
                  </span>
                )}
                {nodalPhone ? (
                  <a href={telHref(nodalPhone)} className="flex items-center gap-2 hover:underline">
                    <Phone size={13} /> {formatPhone(nodalPhone)}
                  </a>
                ) : (
                  <span className="flex items-center gap-2 opacity-60">
                    <Phone size={13} /> Phone not set
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ContactRow({
  title,
  value,
  actionLabel,
  href,
  icon,
  disabled,
}: {
  title: string;
  value: string;
  actionLabel: string;
  href?: string;
  icon: "phone" | "mail";
  disabled?: boolean;
}) {
  const Icon = icon === "phone" ? Phone : Mail;
  const inner = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
          {title}
        </p>
        <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
          {value}
        </p>
      </div>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
          disabled ? "opacity-40" : ""
        }`}
        style={{ borderColor: B.border, background: B.bg, color: B.blueLight }}
        title={actionLabel}
      >
        <Icon size={15} />
      </span>
    </div>
  );

  if (!href || disabled) {
    return <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: B.border }}>{inner}</div>;
  }

  return (
    <a
      href={href}
      className="block rounded-xl border px-3 py-2.5 transition hover:bg-secondary/40"
      style={{ borderColor: B.border }}
    >
      {inner}
    </a>
  );
}

function TicketsBlock({
  tickets,
  loading,
  showForm,
  setShowForm,
  subject,
  setSubject,
  description,
  setDescription,
  submitting,
  onSubmit,
  compact,
}: {
  tickets: TicketRow[];
  loading: boolean;
  showForm: boolean;
  setShowForm: (v: boolean | ((p: boolean) => boolean)) => void;
  subject: string;
  setSubject: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div
            className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: B.secondary }}
          >
            <Ticket size={16} style={{ color: B.blueLight }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: B.blue }}>
              Manage tickets
            </h3>
            <p className="text-[11px]" style={{ color: B.muted }}>
              Raise / view status · Typical response within 5 hours (working days)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white"
          style={{ background: B.badgeGrad }}
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? "Close" : "Raise"}
        </button>
      </div>

      {showForm && (
        <div className="mb-3 space-y-2 rounded-xl border p-3" style={{ borderColor: B.border, background: B.bg }}>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2"
            style={{ borderColor: B.border }}
            placeholder="Subject (e.g. AePS pending cash-out)"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={compact ? 3 : 4}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2"
            style={{ borderColor: B.border }}
            placeholder="Describe the issue. Include txn ref / UTR if any."
          />
          <button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="w-full rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: B.badgeGrad }}
          >
            {submitting ? "Submitting…" : "Submit ticket"}
          </button>
        </div>
      )}

      <div className={`space-y-2 ${compact ? "max-h-56 overflow-y-auto" : ""}`}>
        {loading && (
          <p className="py-4 text-center text-xs" style={{ color: B.muted }}>
            Loading tickets…
          </p>
        )}
        {!loading && tickets.length === 0 && (
          <div
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-3 py-6 text-center"
            style={{ borderColor: B.border, color: B.muted }}
          >
            <LifeBuoy size={22} style={{ color: B.blueLight }} />
            <p className="text-xs">No tickets yet. Raise one if chat and call did not resolve your issue.</p>
          </div>
        )}
        {!loading &&
          tickets.map((t) => (
            <div key={t.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: B.border }}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold" style={{ color: B.blue }}>
                  {t.subject}
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize"
                  style={
                    t.status === "open"
                      ? { background: "#FEF3C7", color: "#92400E" }
                      : { background: "#DCFCE7", color: "#166534" }
                  }
                >
                  {t.status}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px]" style={{ color: B.muted }}>
                {t.description}
              </p>
              {t.resolutionNote && (
                <p className="mt-1 text-[11px] font-medium" style={{ color: B.greenDark }}>
                  Resolution: {t.resolutionNote}
                </p>
              )}
              <p className="mt-1 text-[10px]" style={{ color: B.muted }}>
                {new Date(t.createdAt).toLocaleString("en-IN")}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
