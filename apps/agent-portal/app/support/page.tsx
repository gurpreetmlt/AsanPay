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
  Headphones,
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

const HELP_GUIDES = [
  { title: "AePS cash withdrawal", tag: "AePS" },
  { title: "DMT money transfer", tag: "DMT" },
  { title: "Add money & Balance", tag: "Balance" },
  { title: "Transaction PIN safety", tag: "Security" },
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

  const distRole = upline ? roleLabel(upline.role) : "Distributor";
  const distName = upline?.name ?? null;
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
      <div className="mx-auto max-w-6xl space-y-3 px-3 py-4 md:px-5 md:py-5">
        {/* Compact header */}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
              We are here to help
            </h1>
            <p className="mt-0.5 text-xs md:text-sm" style={{ color: B.muted }}>
              Upline · {brand.name} care · tickets
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              setSubject((s) => s || "");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white"
            style={{ background: B.badgeGrad }}
          >
            <Plus size={14} />
            Raise ticket
          </button>
        </div>

        {/* Quick actions — 4 compact tiles fill width */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QuickAction
            icon={<MessageCircle size={18} style={{ color: B.green }} />}
            iconBg="rgba(18,183,106,0.12)"
            title="WhatsApp"
            subtitle={careWa ? "Faster reply" : "Not configured"}
            href={waLink}
            accent={B.walletGrad}
            disabled={!waLink}
            badge={careWa ? "Fast" : undefined}
          />
          <QuickAction
            icon={<Phone size={18} style={{ color: B.blueLight }} />}
            iconBg={B.secondary}
            title={distName ? distRole : "Upline"}
            subtitle={distributorMobile ? formatPhone(distributorMobile) : "Not linked"}
            href={distributorMobile ? telHref(distributorMobile) : undefined}
            disabled={!distributorMobile}
          />
          <QuickAction
            icon={<Headphones size={18} style={{ color: B.blueLight }} />}
            iconBg={B.secondary}
            title={brand.name}
            subtitle={carePhone ? formatPhone(carePhone) : "Not set"}
            href={carePhone ? telHref(carePhone) : undefined}
            disabled={!carePhone}
          />
          <QuickAction
            icon={<Mail size={18} style={{ color: B.blueLight }} />}
            iconBg={B.secondary}
            title="Email care"
            subtitle={careEmail || "Not set"}
            href={careEmail ? mailto(careEmail) : undefined}
            disabled={!careEmail}
          />
        </div>

        {/* Main: contacts + tickets side by side, equal height fill */}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-5 lg:items-stretch">
          {/* Contacts directory */}
          <div
            className="flex flex-col rounded-xl border bg-white p-3 lg:col-span-3"
            style={{ borderColor: B.border }}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                Contact directory
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(true);
                  setSubject((s) => s || "Request a callback");
                }}
                className="text-[11px] font-bold underline-offset-2 hover:underline"
                style={{ color: B.blueLight }}
              >
                Request callback
              </button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2">
              <ContactLine
                kind="phone"
                label={distName ? `${distRole} · ${distName}` : "Your upline"}
                value={distributorMobile ? formatPhone(distributorMobile) : "No upline on this account"}
                href={distributorMobile ? telHref(distributorMobile) : undefined}
              />
              <ContactLine
                kind="mail"
                label={distName ? `${distRole} email` : "Upline email"}
                value={distributorEmail ?? (upline ? "No email on file" : "—")}
                href={distributorEmail ? mailto(distributorEmail) : undefined}
              />
              <ContactLine
                kind="phone"
                label={`${brand.name} care`}
                value={carePhone ? formatPhone(carePhone) : "Set in Platform Settings"}
                href={carePhone ? telHref(carePhone) : undefined}
              />
              <ContactLine
                kind="mail"
                label={`${brand.name} care email`}
                value={careEmail || "Set in Platform Settings"}
                href={careEmail ? mailto(careEmail) : undefined}
              />
            </div>
          </div>

          {/* Tickets — fills right column */}
          <div
            className="flex flex-col rounded-xl border bg-white p-3 lg:col-span-2"
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

        {/* Bottom: guides + nodal — same row, compact */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-3" style={{ borderColor: B.border }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                Self-help guides
              </h3>
              <span className="text-[10px] font-semibold" style={{ color: B.muted }}>
                Coming soon
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {HELP_GUIDES.map((g) => (
                <button
                  key={g.title}
                  type="button"
                  onClick={() =>
                    toast("Guide videos will open here soon — raise a ticket if you need help now")
                  }
                  className="flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition hover:bg-secondary/50"
                  style={{ borderColor: B.border }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={{ background: B.secondary }}
                  >
                    <PlayCircle size={16} style={{ color: B.blueLight }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold" style={{ color: B.blue }}>
                      {g.title}
                    </span>
                    <span className="text-[9px] font-bold uppercase" style={{ color: B.muted }}>
                      {g.tag}
                    </span>
                  </span>
                  <ChevronRight size={12} className="shrink-0" style={{ color: B.muted }} />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-3" style={{ borderColor: B.border }}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <MapPin size={14} style={{ color: B.blueLight }} />
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                Nodal officer
              </h3>
            </div>
            <p className="text-[11px] leading-snug" style={{ color: B.blueMid }}>
              {nodalAddress || "Address not set yet (Admin → Platform Settings)."}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium" style={{ color: B.blueMid }}>
              {nodalEmail ? (
                <a href={mailto(nodalEmail)} className="inline-flex items-center gap-1 hover:underline">
                  <Mail size={12} /> {nodalEmail}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 opacity-50">
                  <Mail size={12} /> Email not set
                </span>
              )}
              {nodalPhone ? (
                <a href={telHref(nodalPhone)} className="inline-flex items-center gap-1 hover:underline">
                  <Phone size={12} /> {formatPhone(nodalPhone)}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 opacity-50">
                  <Phone size={12} /> Phone not set
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function QuickAction({
  icon,
  iconBg,
  title,
  subtitle,
  href,
  disabled,
  badge,
  accent,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  href?: string;
  disabled?: boolean;
  badge?: string;
  accent?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: iconBg }}>
          {icon}
        </span>
        {badge ? (
          <span
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
            style={{ background: "rgba(18,183,106,0.15)", color: B.greenDark }}
          >
            <Zap size={9} /> {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-xs font-bold" style={{ color: B.blue }}>
          {title}
        </p>
        <p className="truncate text-[11px]" style={{ color: disabled ? B.muted : B.blueMid }}>
          {subtitle}
        </p>
      </div>
      {href && !disabled && accent ? (
        <span
          className="mt-2 inline-flex w-full items-center justify-center rounded-lg py-1.5 text-[11px] font-bold text-white"
          style={{ background: accent }}
        >
          Open chat
        </span>
      ) : null}
    </>
  );

  const cls =
    "block rounded-xl border bg-white p-2.5 text-left transition " +
    (disabled ? "opacity-70" : "hover:shadow-sm");

  if (href && !disabled) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className={cls}
        style={{ borderColor: B.border }}
      >
        {body}
      </a>
    );
  }

  return (
    <div className={cls} style={{ borderColor: B.border }}>
      {body}
    </div>
  );
}

function ContactLine({
  kind,
  label,
  value,
  href,
}: {
  kind: "phone" | "mail";
  label: string;
  value: string;
  href?: string;
}) {
  const Icon = kind === "phone" ? Phone : Mail;
  const active = Boolean(href);

  const inner = (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
        style={{
          borderColor: B.border,
          background: active ? B.bg : "#f8fafc",
          color: active ? B.blueLight : B.muted,
        }}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
          {label}
        </p>
        <p className="truncate text-xs font-semibold" style={{ color: active ? B.blue : B.muted }}>
          {value}
        </p>
      </div>
    </div>
  );

  if (!href) {
    return (
      <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: B.border }}>
        {inner}
      </div>
    );
  }

  return (
    <a
      href={href}
      className="rounded-lg border px-2.5 py-2 transition hover:bg-secondary/40"
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
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Ticket size={14} style={{ color: B.blueLight }} />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
              Tickets
            </h3>
            <p className="text-[10px]" style={{ color: B.muted }}>
              Reply ~5 hrs (working days)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-white"
          style={{ background: B.badgeGrad }}
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? "Close" : "New"}
        </button>
      </div>

      {showForm && (
        <div className="mb-2 space-y-1.5 rounded-lg border p-2" style={{ borderColor: B.border, background: B.bg }}>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-md border bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2"
            style={{ borderColor: B.border }}
            placeholder="Subject"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md border bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2"
            style={{ borderColor: B.border }}
            placeholder="Details · txn ref / UTR if any"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="w-full rounded-md py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: B.badgeGrad }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      )}

      <div className="min-h-[8rem] flex-1 space-y-1.5 overflow-y-auto">
        {loading && (
          <p className="py-6 text-center text-[11px]" style={{ color: B.muted }}>
            Loading…
          </p>
        )}
        {!loading && tickets.length === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-8 text-center"
            style={{ borderColor: B.border, color: B.muted }}
          >
            <LifeBuoy size={20} style={{ color: B.blueLight }} />
            <p className="text-[11px]">No tickets yet</p>
          </div>
        )}
        {!loading &&
          tickets.map((t) => (
            <div key={t.id} className="rounded-lg border px-2.5 py-2" style={{ borderColor: B.border }}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-bold" style={{ color: B.blue }}>
                  {t.subject}
                </span>
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold capitalize"
                  style={
                    t.status === "open"
                      ? { background: "#FEF3C7", color: "#92400E" }
                      : { background: "#DCFCE7", color: "#166534" }
                  }
                >
                  {t.status}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[10px]" style={{ color: B.muted }}>
                {t.description}
              </p>
              {t.resolutionNote && (
                <p className="mt-0.5 line-clamp-1 text-[10px] font-medium" style={{ color: B.greenDark }}>
                  {t.resolutionNote}
                </p>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
