"use client";

import { useEffect, useRef, useState } from "react";
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
  Globe,
  UserRound,
  Building2,
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
  supportWebsite: string;
  nodalEmail: string;
  nodalPhone: string;
  nodalAddress: string;
}

const EMPTY_CONTACTS: SupportContacts = {
  supportPhone: "",
  supportEmail: "",
  supportWhatsapp: "",
  supportWebsite: "https://asanpay.in",
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
  const ticketSectionRef = useRef<HTMLDivElement>(null);

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [upline, setUpline] = useState<UplineItem | null>(null);
  const [contacts, setContacts] = useState<SupportContacts>(EMPTY_CONTACTS);
  const [loading, setLoading] = useState(true);
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

  function focusTicketForm() {
    ticketSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      document.getElementById("support-ticket-subject")?.focus();
    }, 280);
  }

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
  const companyWebsite = contacts.supportWebsite.trim() || "https://asanpay.in";
  const nodalEmail = contacts.nodalEmail.trim();
  const nodalPhone = contacts.nodalPhone.trim() || carePhone;
  const nodalAddress = contacts.nodalAddress.trim();
  const waLink = waHref(careWa);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 md:px-6 md:py-6 lg:px-8">
        {/* Compact header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
              Support
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Call your upline, contact {brand.name}, or raise a ticket below
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-white"
                style={{ background: B.walletGrad }}
              >
                <MessageCircle size={16} />
                WhatsApp
              </a>
            ) : null}
            <button
              type="button"
              onClick={focusTicketForm}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-white shadow-sm"
              style={{ background: B.badgeGrad }}
            >
              <Plus size={16} />
              Raise a ticket
            </button>
          </div>
        </div>

        {/* Main: contacts left · ticket form right (primary) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-start">
          <div className="space-y-3 lg:col-span-2">
            <ContactCard
              icon={<UserRound size={16} style={{ color: B.blueLight }} />}
              title={distRole}
              name={distName || "No upline linked"}
            >
              <ContactLine
                kind="phone"
                label="Phone"
                value={distributorMobile ? formatPhone(distributorMobile) : "Not available"}
                href={distributorMobile ? telHref(distributorMobile) : undefined}
              />
              <ContactLine
                kind="mail"
                label="Email"
                value={distributorEmail ?? (upline ? "No email on file" : "—")}
                href={distributorEmail ? mailto(distributorEmail) : undefined}
              />
            </ContactCard>

            <ContactCard
              icon={<Building2 size={16} style={{ color: B.blueLight }} />}
              title="Company"
              name={brand.name}
            >
              <ContactLine
                kind="phone"
                label="Phone"
                value={carePhone ? formatPhone(carePhone) : "Not set yet"}
                href={carePhone ? telHref(carePhone) : undefined}
              />
              <ContactLine
                kind="mail"
                label="Email"
                value={careEmail || "Not set yet"}
                href={careEmail ? mailto(careEmail) : undefined}
              />
              <ContactLine
                kind="web"
                label="Website"
                value={companyWebsite.replace(/^https?:\/\//, "")}
                href={companyWebsite}
              />
            </ContactCard>

            <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
              <div className="mb-2 flex items-center gap-2">
                <MapPin size={16} style={{ color: B.blueLight }} />
                <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                  Nodal officer
                </h2>
              </div>
              <p
                className="mb-3 rounded-xl border px-3 py-2.5 text-sm leading-relaxed"
                style={{ borderColor: B.border, background: B.bg, color: B.blueMid }}
              >
                {nodalAddress || "Address not set yet (Admin → Platform Settings)."}
              </p>
              <div className="space-y-2">
                <ContactLine
                  kind="mail"
                  label="Email"
                  value={nodalEmail || "Not set"}
                  href={nodalEmail ? mailto(nodalEmail) : undefined}
                />
                <ContactLine
                  kind="phone"
                  label="Phone"
                  value={nodalPhone ? formatPhone(nodalPhone) : "Not set"}
                  href={nodalPhone ? telHref(nodalPhone) : undefined}
                />
              </div>
            </div>
          </div>

          <div
            id="raise-ticket"
            ref={ticketSectionRef}
            className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-3"
            style={{ borderColor: B.border }}
          >
            <div className="mb-4 flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: B.secondary }}
              >
                <Ticket size={18} style={{ color: B.blueLight }} />
              </span>
              <div>
                <h2 className="text-base font-bold" style={{ color: B.blue }}>
                  Create a support ticket
                </h2>
                <p className="text-sm" style={{ color: B.muted }}>
                  Reply within ~5 hrs on working days. Add txn ref / UTR when you can.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold" style={{ color: B.muted }}>
                  Subject
                </span>
                <input
                  id="support-ticket-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2"
                  style={{ borderColor: B.border }}
                  placeholder="e.g. Request a callback · AePS failed · Balance credit"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold" style={{ color: B.muted }}>
                  Details
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2"
                  style={{ borderColor: B.border }}
                  placeholder="What happened? Include amount, UTR / txn id, and time if useful."
                />
              </label>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
                className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: B.badgeGrad }}
              >
                {submitting ? "Submitting…" : "Submit ticket"}
              </button>
            </div>

            <div className="mt-6 border-t pt-4" style={{ borderColor: B.border }}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                Your tickets
              </p>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {loading && (
                  <p className="py-4 text-center text-sm" style={{ color: B.muted }}>
                    Loading…
                  </p>
                )}
                {!loading && tickets.length === 0 && (
                  <div
                    className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-6 text-center"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <LifeBuoy size={22} style={{ color: B.blueLight }} />
                    <p className="text-sm font-medium">No tickets yet</p>
                    <p className="text-xs">Use the form above to create your first ticket</p>
                  </div>
                )}
                {!loading &&
                  tickets.map((t) => (
                    <div key={t.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: B.border }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold" style={{ color: B.blue }}>
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
                      <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: B.muted }}>
                        {t.description}
                      </p>
                      {t.resolutionNote ? (
                        <p className="mt-1 line-clamp-2 text-xs font-medium" style={{ color: B.greenDark }}>
                          {t.resolutionNote}
                        </p>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Self-help guides */}
        <div className="rounded-2xl border bg-white p-4 md:p-5" style={{ borderColor: B.border }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: B.blue }}>
              Self-help guides
            </h3>
            <span className="text-xs font-semibold" style={{ color: B.muted }}>
              Coming soon
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {HELP_GUIDES.map((g) => (
              <button
                key={g.title}
                type="button"
                onClick={() =>
                  toast("Guide videos will open here soon — raise a ticket if you need help now")
                }
                className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition hover:bg-secondary/50"
                style={{ borderColor: B.border }}
              >
                <PlayCircle size={16} className="shrink-0" style={{ color: B.blueLight }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: B.blue }}>
                    {g.title}
                  </span>
                  <span className="text-[10px] font-bold uppercase" style={{ color: B.muted }}>
                    {g.tag}
                  </span>
                </span>
                <ChevronRight size={14} className="shrink-0" style={{ color: B.muted }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ContactCard({
  icon,
  title,
  name,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
          {title}
        </h2>
      </div>
      <p className="mb-3 text-sm font-bold" style={{ color: B.blue }}>
        {name}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ContactLine({
  kind,
  label,
  value,
  href,
}: {
  kind: "phone" | "mail" | "web";
  label: string;
  value: string;
  href?: string;
}) {
  const Icon = kind === "phone" ? Phone : kind === "mail" ? Mail : Globe;
  const active = Boolean(href);
  const external = kind === "web" && Boolean(href);

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
        <p className="truncate text-sm font-semibold" style={{ color: active ? B.blue : B.muted }}>
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
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="block rounded-lg border px-2.5 py-2 transition hover:bg-secondary/40"
      style={{ borderColor: B.border }}
    >
      {inner}
    </a>
  );
}
