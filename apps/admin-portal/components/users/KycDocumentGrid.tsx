"use client";

import { useState } from "react";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { B } from "@/lib/brand";

const LABELS: Record<string, string> = {
  aadhaarFront: "Aadhaar (Front)",
  aadhaarBack: "Aadhaar (Back)",
  panCard: "PAN Card",
  chequeOrPassbook: "Cancelled Cheque / Passbook",
};

export function KycDocumentGrid({ documents }: { documents: Record<string, string | undefined> }) {
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);

  const items = Object.entries(documents || {}).filter(
    ([, url]) => typeof url === "string" && url.length > 3,
  );

  if (items.length === 0) {
    return (
      <p className="text-sm" style={{ color: B.muted }}>
        No KYC documents on file yet.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(([key, url]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPreview({ title: LABELS[key] || key, url: url! })}
            className="group overflow-hidden rounded-xl border text-left transition hover:scale-[1.01] hover:shadow-md active:scale-[0.99]"
            style={{ borderColor: B.border, background: B.bg }}
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url!}
                alt={LABELS[key] || key}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-90" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-sm font-semibold text-white">{LABELS[key] || key}</p>
                <p className="text-[11px] text-white/80">Visible · tap to zoom</p>
              </div>
            </div>
          </button>
        ))}
      </div>
      <DocumentPreviewModal
        open={Boolean(preview)}
        title={preview?.title || ""}
        url={preview?.url || ""}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
