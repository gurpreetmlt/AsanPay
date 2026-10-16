"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { Copy, MailPlus, RotateCw, Share2, XCircle } from "lucide-react";
import type { ApiResponse } from "@asanpay/shared-types";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";

interface Invite {
  id: string;
  role: string;
  name: string;
  mobile: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  emailSentAt: string | null;
  createdAt: string;
}

interface CreateResult {
  invite: Invite;
  link: string;
  emailSent: boolean;
}

const STATUS_UI: Record<Invite["status"], { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "info" },
  accepted: { label: "Joined", tone: "success" },
  revoked: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "danger" },
};

const inputCls = "w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm outline-none";

function validate(f: { name: string; mobile: string; email: string }): string | null {
  if (f.name.trim().length < 2) return "Enter the full name";
  if (!/^[6-9]\d{9}$/.test(f.mobile)) return "Enter a valid 10-digit mobile";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "Enter a valid email address";
  return null;
}

function shareOnWhatsApp(link: string, name: string, roleLabel: string) {
  const text = `Hi ${name}, create your AsanPay ${roleLabel} account using this link: ${link}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

function notifyEmail(result: CreateResult, email: string) {
  if (result.emailSent) toast.success(`Invite emailed to ${email}`);
  else toast.error("Email could not be sent — share the link on WhatsApp instead");
}

/** Upline invites a direct downline by email link (SD → Distributor, Distributor → Retailer). */
export function InviteAgentPanel({ childRole }: { childRole: "distributor" | "retailer" }) {
  const roleLabel = childRole === "distributor" ? "Distributor" : "Retailer";
  const [invites, setInvites] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateResult | null>(null);

  const load = useCallback(async () => {
    try {
      setInvites(await fetchApi<Invite[]>("/invites"));
    } catch {
      /* list is secondary — the network table still works */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (searchParams.get("invite") !== "1") return;
    setOpen(true);
    router.replace(pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  function closeModal() {
    setOpen(false);
    setCreated(null);
  }

  async function resend(inv: Invite) {
    setRowBusy(inv.id);
    try {
      const { data } = await api.post<ApiResponse<CreateResult>>(`/invites/${inv.id}/resend`);
      if (!data.success) throw new Error(data.message);
      notifyEmail(data.data, inv.email);
      setCreated(data.data);
      setOpen(true);
      void load();
    } catch (error) {
      toast.error(extractApiError(error, "Could not resend the invite"));
    } finally {
      setRowBusy(null);
    }
  }

  async function revoke(inv: Invite) {
    setRowBusy(inv.id);
    try {
      await api.delete(`/invites/${inv.id}`);
      toast.success("Invite cancelled");
      void load();
    } catch (error) {
      toast.error(extractApiError(error, "Could not cancel the invite"));
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
      <div
        className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: B.border }}
      >
        <div>
          <h2 className="font-bold" style={{ color: B.blue }}>
            Invite {roleLabel}
          </h2>
          <p className="text-xs" style={{ color: B.muted }}>
            They get a signup link by email. The account joins your network automatically.
          </p>
        </div>
        <PrimaryButton
          type="button"
          variant="success"
          size="sm"
          showArrow={false}
          className="!w-auto gap-2"
          onClick={() => setOpen(true)}
        >
          <MailPlus size={16} /> Invite {roleLabel}
        </PrimaryButton>
      </div>

      {invites.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs uppercase tracking-wider"
                style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
              >
                {["Invited", "Email", "Status", "Sent", "Actions"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const ui = STATUS_UI[inv.status];
                const actionable = inv.status !== "accepted";
                return (
                  <tr key={inv.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                    <td className="px-4 py-3">
                      <p className="font-bold" style={{ color: B.blue }}>
                        {inv.name}
                      </p>
                      <p className="text-xs" style={{ color: B.muted }}>
                        {inv.mobile}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                      {inv.email}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={ui.tone}>{ui.label}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                      {new Date(inv.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </td>
                    <td className="px-4 py-3">
                      {actionable ? (
                        <div className="flex items-center gap-2">
                          <ActionIconButton
                            title="Resend — new link by email"
                            tone="green"
                            disabled={rowBusy === inv.id}
                            onClick={() => void resend(inv)}
                          >
                            <RotateCw size={15} strokeWidth={2.25} />
                          </ActionIconButton>
                          {inv.status === "pending" ? (
                            <ActionIconButton
                              title="Cancel invite"
                              tone="red"
                              disabled={rowBusy === inv.id}
                              onClick={() => void revoke(inv)}
                            >
                              <XCircle size={15} strokeWidth={2.25} />
                            </ActionIconButton>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: B.muted }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {open ? (
        <InviteModal
          childRole={childRole}
          initialResult={created}
          onClose={closeModal}
          onCreated={() => void load()}
        />
      ) : null}
    </div>
  );
}

/** Invite form + "link ready" view. Usable from any page (Network panel, dashboard tile). */
export function InviteModal({
  childRole,
  initialResult = null,
  onClose,
  onCreated,
}: {
  childRole: "distributor" | "retailer";
  initialResult?: CreateResult | null;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const roleLabel = childRole === "distributor" ? "Distributor" : "Retailer";
  const [form, setForm] = useState({ name: "", mobile: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreateResult | null>(initialResult);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validate(form);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<ApiResponse<CreateResult>>("/invites", form);
      if (!data.success) throw new Error(data.message);
      setCreated(data.data);
      notifyEmail(data.data, form.email);
      onCreated?.();
    } catch (error) {
      toast.error(extractApiError(error, "Could not create the invite"));
    } finally {
      setBusy(false);
    }
  }

  return (
        <Modal title={created ? "Invite link ready" : `Invite ${roleLabel}`} onClose={onClose}>
          {created ? (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: B.muted }}>
                {created.emailSent
                  ? `Signup link emailed to ${created.invite.email}. You can also share it on WhatsApp.`
                  : "The email could not be sent. Share this link with them on WhatsApp instead."}
              </p>
              <div className="break-all rounded-xl px-3 py-2 font-mono text-xs" style={{ background: B.secondary, color: B.blue }}>
                {created.link}
              </div>
              <p className="text-xs" style={{ color: B.muted }}>
                Works once, only with mobile {created.invite.mobile}. Expires in 7 days.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <PrimaryButton
                  type="button"
                  variant="secondary"
                  showArrow={false}
                  className="gap-2"
                  onClick={() => {
                    void navigator.clipboard?.writeText(created.link);
                    toast.success("Link copied");
                  }}
                >
                  <Copy size={16} /> Copy link
                </PrimaryButton>
                <PrimaryButton
                  type="button"
                  variant="success"
                  showArrow={false}
                  className="gap-2"
                  onClick={() => shareOnWhatsApp(created.link, created.invite.name, roleLabel)}
                >
                  <Share2 size={16} /> WhatsApp
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {(
                [
                  ["name", "Full name", "As per PAN", "text"],
                  ["mobile", "Mobile", "10-digit mobile", "tel"],
                  ["email", "Email", "name@example.com", "email"],
                ] as const
              ).map(([key, label, placeholder, type]) => (
                <div key={key}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                    {label}
                    <RequiredMark />
                  </div>
                  <input
                    type={type}
                    value={form[key]}
                    inputMode={key === "mobile" ? "numeric" : undefined}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [key]: key === "mobile" ? e.target.value.replace(/\D/g, "").slice(0, 10) : e.target.value,
                      }))
                    }
                    placeholder={placeholder}
                    className={inputCls}
                    style={{ borderColor: B.border, color: B.blue }}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <PrimaryButton type="button" variant="destructive" showArrow={false} onClick={onClose}>
                  Cancel
                </PrimaryButton>
                <PrimaryButton type="submit" variant="primary" disabled={busy}>
                  {busy ? "Sending…" : "Send invite"}
                </PrimaryButton>
              </div>
            </form>
          )}
        </Modal>
  );
}
