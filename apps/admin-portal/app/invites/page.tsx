"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Copy, MailPlus, RotateCw, XCircle } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Modal } from "@/components/ui/Modal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type InviteRole = "super_distributor" | "retailer";

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

const ROLE_UI: Record<string, string> = {
  super_distributor: "Super Distributor",
  retailer: "Direct Retailer",
};

const STATUS_UI: Record<Invite["status"], { label: string; bg: string; fg: string }> = {
  pending: { label: "Pending", bg: "#EEF2FF", fg: "#1D4ED8" },
  accepted: { label: "Joined", bg: "#F0FDF4", fg: "#15803D" },
  revoked: { label: "Cancelled", bg: "#F8FAFC", fg: "#475569" },
  expired: { label: "Expired", bg: "#FEF2F2", fg: "#B91C1C" },
};

function apiMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
    ?.data;
  const first = data?.errors ? Object.values(data.errors).flat().find(Boolean) : null;
  return first ?? data?.message ?? fallback;
}

function validate(f: { name: string; mobile: string; email: string }): string | null {
  if (f.name.trim().length < 2) return "Enter the full name";
  if (!/^[6-9]\d{9}$/.test(f.mobile)) return "Enter a valid 10-digit mobile";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "Enter a valid email address";
  return null;
}

export default function InvitesPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <InvitesBody />
    </AdminShell>
  );
}

function InvitesBody() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreateResult | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInvites(await fetchApi<Invite[]>("/invites"));
    } catch {
      toast.error("Could not load invites. Refresh the page to try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resend(inv: Invite) {
    setRowBusy(inv.id);
    try {
      const { data } = await api.post<{ data: CreateResult; message?: string }>(`/invites/${inv.id}/resend`);
      if (data.data.emailSent) toast.success(`New invite link emailed to ${inv.email}`);
      else toast.error("Email could not be sent — copy the link and share it instead");
      setCreated(data.data);
      setOpen(true);
      void load();
    } catch (err) {
      toast.error(apiMessage(err, "Could not resend the invite"));
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
    } catch (err) {
      toast.error(apiMessage(err, "Could not cancel the invite"));
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            Invites
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Signup is by invitation only. Invite Super Distributors and Direct Retailers here — Distributors and
            Retailers are invited by their upline.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreated(null);
            setOpen(true);
          }}
          className="admin-btn-success inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <MailPlus size={16} /> Send invite
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs uppercase tracking-wider"
                style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
              >
                {["Invited", "Role", "Email", "Status", "Sent", "Actions"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: B.muted }}>
                    Loading…
                  </td>
                </tr>
              ) : invites.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: B.muted }}>
                    No invites yet. Tap Send invite to add a Super Distributor or Direct Retailer.
                  </td>
                </tr>
              ) : (
                invites.map((inv) => {
                  const st = STATUS_UI[inv.status];
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
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: B.blue }}>
                        {ROLE_UI[inv.role] ?? inv.role}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                        {inv.email}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-bold"
                          style={{ background: st.bg, color: st.fg }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                        {new Date(inv.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-3">
                        {inv.status === "accepted" ? (
                          <span className="text-xs" style={{ color: B.muted }}>
                            —
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              title="Resend — new link by email"
                              disabled={rowBusy === inv.id}
                              onClick={() => void resend(inv)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-50"
                              style={{ borderColor: "#86EFAC", color: "#15803D", background: "#F0FDF4" }}
                            >
                              <RotateCw size={15} />
                            </button>
                            {inv.status === "pending" ? (
                              <button
                                type="button"
                                title="Cancel invite"
                                disabled={rowBusy === inv.id}
                                onClick={() => void revoke(inv)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-50"
                                style={{ borderColor: "#FCA5A5", color: "#B91C1C", background: "#FEF2F2" }}
                              >
                                <XCircle size={15} />
                              </button>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <InviteModal
          initialResult={created}
          onClose={() => {
            setOpen(false);
            setCreated(null);
          }}
          onCreated={() => void load()}
        />
      ) : null}
    </div>
  );
}

function InviteModal({
  initialResult,
  onClose,
  onCreated,
}: {
  initialResult: CreateResult | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [role, setRole] = useState<InviteRole>("super_distributor");
  const [form, setForm] = useState({ name: "", mobile: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreateResult | null>(initialResult);
  const formError = validate(form);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (formError) {
      toast.error(formError);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{ data: CreateResult }>("/invites", { ...form, role });
      setCreated(data.data);
      if (data.data.emailSent) toast.success(`Invite emailed to ${form.email}`);
      else toast.error("Email could not be sent — copy the link and share it instead");
      onCreated();
    } catch (err) {
      toast.error(apiMessage(err, "Could not create the invite"));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none";
  return (
    <Modal
      title={created ? "Invite link ready" : "Send invite"}
      subtitle={
        created
          ? "Works once, only with the invited mobile. Expires in 7 days."
          : "They get a signup link by email and join directly under admin."
      }
      onClose={onClose}
      icon={<MailPlus size={20} />}
      iconTone={created ? "green" : "blue"}
    >
      {created ? (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: B.muted }}>
            {created.emailSent
              ? `Signup link emailed to ${created.invite.email}.`
              : "The email could not be sent. Copy this link and share it with them."}
          </p>
          <div
            className="break-all rounded-xl px-3 py-2 font-mono text-xs"
            style={{ background: B.secondary, color: B.blue }}
          >
            {created.link}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
              style={{ borderColor: B.border, color: B.muted }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(created.link);
                toast.success("Link copied");
              }}
              className="admin-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              <Copy size={16} /> Copy link
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
              Inviting
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["super_distributor", "retailer"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                  style={
                    role === r
                      ? { borderColor: B.blue, background: "#EEF2FF", color: B.blue }
                      : { borderColor: B.border, color: B.muted }
                  }
                >
                  {ROLE_UI[r]}
                </button>
              ))}
            </div>
          </div>
          {(
            [
              ["name", "Full name", "As per PAN", "text"],
              ["mobile", "Mobile", "10-digit mobile", "tel"],
              ["email", "Email", "name@example.com", "email"],
            ] as const
          ).map(([key, label, placeholder, type]) => (
            <div key={key}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                {label} <span style={{ color: "#DC2626" }}>*</span>
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
            <button
              type="button"
              onClick={onClose}
              className="admin-btn-danger rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || Boolean(formError)}
              className="admin-btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
