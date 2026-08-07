"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { AlertCircle } from "lucide-react";
import { B } from "@/lib/brand";
import { fetchApi } from "@/lib/api";
import { extractApiError } from "@/lib/onboarding";

interface DisputeRow {
  id: string;
  transactionId: string;
  category: string;
  description: string;
  status: "raised" | "under_review" | "resolved" | "rejected";
  resolutionNote: string | null;
  submittedAt: string;
}

const STATUS_LABEL: Record<DisputeRow["status"], string> = {
  raised: "Submitted",
  under_review: "Under review",
  resolved: "Resolved",
  rejected: "Rejected",
};

const STATUS_COLOR: Record<DisputeRow["status"], string> = {
  raised: "#2563eb",
  under_review: "#d97706",
  resolved: "#16a34a",
  rejected: "#dc2626",
};

export function MyDisputes() {
  const [disputes, setDisputes] = useState<DisputeRow[] | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setDisputes(await fetchApi<DisputeRow[]>("/disputes"));
      } catch (err) {
        toast.error(extractApiError(err, "Failed to load disputes"));
      }
    })();
  }, []);

  if (disputes !== null && disputes.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
      <h2 className="text-lg font-bold" style={{ color: B.blue }}>
        My Disputes
      </h2>
      {disputes === null ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : (
        disputes.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-xl border p-4"
            style={{ borderColor: B.border }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: B.secondary }}
              >
                <AlertCircle size={18} style={{ color: B.blue }} />
              </span>
              <div>
                <div className="text-sm font-semibold" style={{ color: B.blue }}>
                  {d.category.replace(/_/g, " ")}
                </div>
                <div className="text-xs" style={{ color: B.muted }}>
                  {new Date(d.submittedAt).toLocaleDateString()}
                </div>
                {d.resolutionNote && (
                  <div className="mt-0.5 text-xs" style={{ color: B.muted }}>
                    {d.resolutionNote}
                  </div>
                )}
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: `${STATUS_COLOR[d.status]}18`, color: STATUS_COLOR[d.status] }}
            >
              {STATUS_LABEL[d.status]}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
