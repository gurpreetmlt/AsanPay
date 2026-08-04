"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Banknote,
  MapPin,
  ShieldCheck,
  User,
  Wallet,
  Network,
  History,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { DetailSection, InfoRow } from "@/components/users/DetailSection";
import { KycDocumentGrid } from "@/components/users/KycDocumentGrid";
import { AgentCommissionPanel } from "@/components/users/AgentCommissionPanel";
import api, { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface RecentTxn {
  id: string;
  txnRef: string;
  amount: string;
  status: string;
  serviceName: string;
  createdAt: string;
}

interface AgentDetail {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
  kycStatus: string;
  isActive: boolean;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  hasKycDocs: boolean;
  kyc: {
    status: string;
    panMasked: string | null;
    aadhaarMasked: string | null;
    city: string | null;
    pincode: string | null;
    bankName: string | null;
    hasBank: boolean;
    submittedAt: string | null;
  };
  documents: Record<string, string>;
  wallets: { walletType: string; balance: string }[];
  parent: { id: string; uid: string | null; name: string | null; role: string | null } | null;
}

export default function AgentDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newParentUid, setNewParentUid] = useState("");
  const [recentTxns, setRecentTxns] = useState<RecentTxn[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setAgent(await fetchApi<AgentDetail>(`/admin/users/${id}`));
      setRecentTxns(await fetchApi<RecentTxn[]>("/admin/transactions", { userId: id, limit: "10" }));
    } catch {
      toast.error("Failed to load agent details");
      setAgent(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  async function toggleActive() {
    if (!agent) return;
    setBusy(true);
    try {
      await api.patch(`/admin/users/${agent.id}/active`, { isActive: !agent.isActive });
      toast.success(agent.isActive ? "Agent deactivated" : "Agent activated");
      await load();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Update failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideKyc(decision: "verified" | "rejected") {
    if (!agent) return;
    setBusy(true);
    try {
      await api.post(`/admin/kyc/${agent.id}/decide`, { decision });
      toast.success(decision === "verified" ? "KYC approved" : "KYC rejected");
      await load();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Decision failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reassignParent() {
    if (!agent) return;
    const uid = newParentUid.trim().toUpperCase();
    if (!uid) {
      toast.error("Enter new parent UID");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/admin/users/${agent.id}/reassign`, { newParentUid: uid });
      toast.success("Parent reassigned");
      setNewParentUid("");
      await load();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Reassign failed",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/users"
              className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
              style={{ color: B.blueMid }}
            >
              <ArrowLeft className="h-4 w-4" />
              All Agents
            </Link>
            {loading || !agent ? (
              <>
                <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
                  Agent Details
                </h1>
                <p className="mt-1 text-sm" style={{ color: B.muted }}>
                  {loading ? "Loading…" : "Agent not found"}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
                  {agent.name}
                </h1>
                <p className="mt-1 text-sm" style={{ color: B.muted }}>
                  {ROLE_LABEL[agent.role] ?? agent.role} · UID {agent.uid}
                </p>
              </>
            )}
          </div>
          {agent ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge status={agent.role} />
              <Badge status={agent.kycStatus} />
              <Badge status={agent.isActive ? "active" : "inactive"} />
            </div>
          ) : null}
        </div>

        {!loading && agent ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <DetailSection title="Agent Profile" icon={User}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Name" value={agent.name} />
                  <InfoRow label="Mobile" value={agent.mobile} />
                  <InfoRow label="Email" value={agent.email} />
                  <InfoRow label="UID" value={agent.uid} />
                  <InfoRow label="Role" value={ROLE_LABEL[agent.role] ?? agent.role} />
                  <InfoRow
                    label="Joined"
                    value={new Date(agent.createdAt).toLocaleString("en-IN")}
                  />
                </div>
              </DetailSection>

              <DetailSection title="KYC Identity" icon={ShieldCheck}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="PAN" value={agent.kyc.panMasked} />
                  <InfoRow label="Aadhaar" value={agent.kyc.aadhaarMasked} />
                  <InfoRow label="Status" value={agent.kyc.status} />
                  <InfoRow
                    label="Submitted"
                    value={
                      agent.kyc.submittedAt
                        ? new Date(agent.kyc.submittedAt).toLocaleString("en-IN")
                        : null
                    }
                  />
                </div>
              </DetailSection>

              <DetailSection title="Address / Bank" icon={MapPin}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="City" value={agent.kyc.city} />
                  <InfoRow label="Pincode" value={agent.kyc.pincode} />
                  <InfoRow label="Bank" value={agent.kyc.bankName} />
                  <InfoRow label="Bank on file" value={agent.kyc.hasBank ? "Yes" : "No"} />
                </div>
              </DetailSection>

              <DetailSection title="Wallets" icon={Wallet}>
                {agent.wallets.length === 0 ? (
                  <p className="text-sm" style={{ color: B.muted }}>
                    No wallets yet
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {agent.wallets.map((w) => (
                      <div
                        key={w.walletType}
                        className="rounded-xl border px-4 py-3"
                        style={{ borderColor: B.border, background: B.bg }}
                      >
                        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: B.muted }}>
                          {w.walletType}
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums" style={{ color: B.blue }}>
                          ₹{Number(w.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </DetailSection>

              <DetailSection title="Recent Transactions" icon={History}>
                {recentTxns.length === 0 ? (
                  <p className="text-sm" style={{ color: B.muted }}>
                    No transactions yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentTxns.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                        style={{ borderColor: B.border }}
                      >
                        <div className="min-w-0">
                          <div className="font-medium" style={{ color: B.blue }}>
                            {t.serviceName}
                          </div>
                          <div className="font-mono text-xs" style={{ color: B.muted }}>
                            {t.txnRef} · {new Date(t.createdAt).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums" style={{ color: B.blue }}>
                            ₹{Number(t.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                          <Badge status={t.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DetailSection>

              <AgentCommissionPanel userId={agent.id} />
            </div>

            <div className="space-y-6">
              <DetailSection title="Verification" icon={ShieldCheck}>
                <div className="space-y-3">
                  <InfoRow label="KYC" value={agent.kycStatus} />
                  <InfoRow label="Account" value={agent.isActive ? "Active" : "Inactive"} />
                  <div className="flex flex-col gap-2 pt-1">
                    {agent.kycStatus === "pending" ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decideKyc("verified")}
                          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                          style={{ background: B.green }}
                        >
                          Approve KYC
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decideKyc("rejected")}
                          className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                          style={{ borderColor: B.danger, color: B.danger }}
                        >
                          Reject KYC
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleActive()}
                      className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: B.badgeGrad }}
                    >
                      {agent.isActive ? "Deactivate agent" : "Activate agent"}
                    </button>
                  </div>
                </div>
              </DetailSection>

              <DetailSection title="Network Parent" icon={Network}>
                {agent.parent ? (
                  <div className="space-y-3">
                    <InfoRow label="Name" value={agent.parent.name} />
                    <InfoRow label="UID" value={agent.parent.uid} />
                    <InfoRow
                      label="Role"
                      value={
                        agent.parent.role
                          ? ROLE_LABEL[agent.parent.role] ?? agent.parent.role
                          : null
                      }
                    />
                    <Link
                      href={`/users/${agent.parent.id}`}
                      className="inline-block text-sm font-semibold hover:underline"
                      style={{ color: B.blueLight }}
                    >
                      Open parent →
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: B.muted }}>
                    No parent (top-level Super Distributor)
                  </p>
                )}
                {agent.role !== "admin" ? (
                  <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: B.border }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                      Move in tree
                    </p>
                    <input
                      type="text"
                      value={newParentUid}
                      onChange={(e) => setNewParentUid(e.target.value)}
                      placeholder="New parent UID"
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: B.border, color: B.blue }}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reassignParent()}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: B.blue }}
                    >
                      Reassign parent
                    </button>
                  </div>
                ) : null}
              </DetailSection>

              <DetailSection title="KYC Documents" icon={Banknote}>
                <KycDocumentGrid documents={agent.documents} />
              </DetailSection>
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
