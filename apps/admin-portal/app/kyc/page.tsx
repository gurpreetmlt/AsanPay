"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Eye } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { TableActionButtons } from "@/components/ui/TableActionButtons";
import { DocumentPreviewModal } from "@/components/users/DocumentPreviewModal";
import api, { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type KycTab = "pending" | "verified" | "rejected";

interface KycRow {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
  kycStatus: string;
  hasKycDocs: boolean;
  updatedAt: string;
  createdAt: string;
}

function resolvePreviewSrc(url: string) {
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/api/proxy/")) return url;
  if (url.startsWith("/admin/")) return `/api/proxy${url}`;
  return url;
}

const DOC_LABELS: Record<string, string> = {
  personalPhoto: "Personal Photo",
  aadhaarFront: "Aadhaar (Front)",
  aadhaarBack: "Aadhaar (Back)",
  panCard: "PAN Card",
  shopPhoto: "Shop Photo",
  chequeOrPassbook: "Cheque / Passbook",
};

const DOC_ORDER = [
  "personalPhoto",
  "aadhaarFront",
  "panCard",
  "aadhaarBack",
  "shopPhoto",
  "chequeOrPassbook",
] as const;

function isPreviewableUrl(url: string) {
  return (
    /^data:image\/(jpeg|jpg|png|webp|heic|heif)/i.test(url) ||
    url.includes("/kyc-documents/")
  );
}

const TABS: { key: KycTab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
];

export default function KycPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tab, setTab] = useState<KycTab>("pending");
  const [rows, setRows] = useState<KycRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [previewSlides, setPreviewSlides] = useState<{ title: string; url: string }[]>([]);
  const [previewAgent, setPreviewAgent] = useState("");
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<KycRow[]>("/admin/kyc", { status: tab }));
    } catch {
      toast.error("Failed to load KYC queue");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  async function openDocsPreview(row: KycRow) {
    if (!row.hasKycDocs) {
      toast.error(
        "No KYC photo on file for this agent. Ask them to re-submit KYC with gallery/camera upload.",
      );
      return;
    }
    setPreviewBusy(row.id);
    try {
      const detail = await fetchApi<{
        documents: Record<string, string>;
      }>(`/admin/users/${row.id}`);
      const docs = detail.documents ?? {};
      const orderedKeys = [
        ...DOC_ORDER.filter((k) => k in docs),
        ...Object.keys(docs).filter((k) => !(DOC_ORDER as readonly string[]).includes(k)),
      ];
      const slides = orderedKeys
        .map((key) => {
          const raw = docs[key];
          if (typeof raw !== "string" || !isPreviewableUrl(raw)) return null;
          return {
            title: DOC_LABELS[key] || key,
            url: resolvePreviewSrc(raw),
          };
        })
        .filter((s): s is { title: string; url: string } => Boolean(s));
      if (slides.length === 0) {
        toast.error(
          "KYC numbers are on file but no photo to preview. Open the agent profile for details.",
        );
        return;
      }
      setPreviewAgent(row.name);
      setPreviewSlides(slides);
    } catch {
      toast.error("Failed to load KYC documents");
    } finally {
      setPreviewBusy(null);
    }
  }

  async function decide(id: string, decision: "verified" | "rejected") {
    const row = rows.find((r) => r.id === id);
    if (decision === "verified" && row && !row.hasKycDocs) {
      toast.error(
        "Cannot verify KYC without PAN and Aadhaar on file. Agent must finish signup KYC (PAN + Aadhaar numbers) first.",
      );
      return;
    }
    setActing(id);
    try {
      await api.post(`/admin/kyc/${id}/decide`, { decision });
      toast.success(decision === "verified" ? "KYC approved" : "KYC rejected");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Decision failed";
      toast.error(message);
    } finally {
      setActing(null);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            KYC Queue
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Review and decide agent KYC submissions
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="rounded-xl px-3 py-2 text-sm font-semibold transition"
              style={
                tab === t.key
                  ? { background: B.badgeGrad, color: "#fff" }
                  : { background: B.secondary, color: B.blueMid }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Desktop table */}
        <div
          className="hidden overflow-hidden rounded-2xl border bg-white md:block"
          style={{ borderColor: B.border }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr
                  className="border-b text-xs uppercase tracking-wider"
                  style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
                >
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Mobile / UID</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Docs</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                      No {tab} KYC entries
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-[var(--admin-card-hover)]"
                      style={{ borderColor: B.border }}
                      onClick={() => router.push(`/users/${r.id}`)}
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: B.blue }}>
                        {r.name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold tabular-nums" style={{ color: B.blueMid }}>
                          {r.mobile}
                        </div>
                        <div className="mt-0.5 font-mono text-xs" style={{ color: B.muted }}>
                          {r.uid}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge status={r.role} />
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                        {r.hasKycDocs ? (
                          <button
                            type="button"
                            disabled={previewBusy === r.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void openDocsPreview(r);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-50"
                            style={{ borderColor: B.border, color: B.blueMid, background: "#fff" }}
                          >
                            <Eye size={14} />
                            {previewBusy === r.id ? "Loading…" : "View"}
                          </button>
                        ) : (
                          "Missing"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: B.muted }}>
                        {new Date(r.updatedAt).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3">
                        {tab === "pending" ? (
                          <TableActionButtons
                            viewHref={`/users/${r.id}`}
                            onApprove={
                              acting === r.id || !r.hasKycDocs
                                ? undefined
                                : () => void decide(r.id, "verified")
                            }
                            onBan={acting === r.id ? undefined : () => void decide(r.id, "rejected")}
                          />
                        ) : (
                          <div className="flex justify-end">
                            <TableActionButtons viewHref={`/users/${r.id}`} />
                            <Badge status={r.kycStatus} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="grid gap-4 md:hidden">
          {loading && (
            <p className="text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          )}
          {!loading && rows.length === 0 && (
            <div
              className="rounded-2xl border bg-white px-4 py-8 text-center text-sm"
              style={{ borderColor: B.border, color: B.muted }}
            >
              No {tab} KYC entries
            </div>
          )}
          {!loading &&
            rows.map((r) => (
              <div
                key={r.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/users/${r.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/users/${r.id}`);
                  }
                }}
                className="w-full cursor-pointer rounded-2xl border bg-white p-4 text-left"
                style={{ borderColor: B.border }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold" style={{ color: B.blue }}>
                      {r.name}
                    </h3>
                    <p className="text-sm font-semibold tabular-nums" style={{ color: B.blueMid }}>
                      {r.mobile}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
                      {ROLE_LABEL[r.role] ?? r.role}
                    </p>
                    <p className="mt-0.5 font-mono text-xs" style={{ color: B.muted }}>
                      {r.uid}
                    </p>
                  </div>
                  {tab === "pending" ? (
                    <TableActionButtons
                      viewHref={`/users/${r.id}`}
                      onApprove={
                        acting === r.id || !r.hasKycDocs
                          ? undefined
                          : () => void decide(r.id, "verified")
                      }
                      onBan={acting === r.id ? undefined : () => void decide(r.id, "rejected")}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <TableActionButtons viewHref={`/users/${r.id}`} />
                      <Badge status={r.kycStatus} />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs" style={{ color: B.muted }}>
                  {r.hasKycDocs ? (
                    <button
                      type="button"
                      disabled={previewBusy === r.id}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openDocsPreview(r);
                      }}
                      className="font-bold underline-offset-2 hover:underline"
                      style={{ color: B.blueMid }}
                    >
                      {previewBusy === r.id ? "Loading docs…" : "View docs"}
                    </button>
                  ) : (
                    "Missing docs"
                  )}{" "}
                  · Updated {new Date(r.updatedAt).toLocaleString("en-IN")}
                </p>
              </div>
            ))}
        </div>
      </div>
      <DocumentPreviewModal
        open={previewSlides.length > 0}
        title={previewAgent ? `${previewAgent} · KYC documents` : "KYC documents"}
        slides={previewSlides}
        onClose={() => {
          setPreviewSlides([]);
          setPreviewAgent("");
        }}
      />
    </AdminShell>
  );
}
