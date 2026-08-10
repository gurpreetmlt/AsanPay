"use client";

import { useState } from "react";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { B } from "@/lib/brand";
import { FileImage } from "lucide-react";

const LABELS: Record<string, string> = {
  aadhaarFront: "Aadhaar (Front)",
  aadhaarBack: "Aadhaar (Back)",
  panCard: "PAN Card",
  chequeOrPassbook: "Cancelled Cheque / Passbook",
  personalPhoto: "Personal Photo",
  shopPhoto: "Shop Photo",
};

/** Real photo: data URL or authenticated admin document route. */
function isRealPhotoUrl(url: string) {
  return (
    /^data:image\/(jpeg|jpg|png|webp|heic|heif)/i.test(url) ||
    url.includes("/kyc-documents/")
  );
}

/** Admin cookies go through same-origin proxy. */
function resolvePreviewSrc(url: string) {
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/api/proxy/")) return url;
  if (url.startsWith("/admin/")) return `/api/proxy${url}`;
  return url;
}

export function KycDocumentGrid({
  documents,
  documentFiles,
}: {
  documents: Record<string, string | undefined>;
  documentFiles?: Partial<Record<string, string | null | undefined>>;
}) {
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);

  const items = Object.entries(documents || {}).filter(
    ([, url]) => typeof url === "string" && url.length > 0,
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
      <p className="mb-3 text-xs" style={{ color: B.muted }}>
        Photos show after the agent submits KYC with a real gallery/camera upload (new app build).
        Filename-only older submits cannot show a preview.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(([key, url]) => {
          const fileName = documentFiles?.[key];
          const real = isRealPhotoUrl(url!);
          const title = LABELS[key] || key;
          const src = real ? resolvePreviewSrc(url!) : "";
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (real) setPreview({ title, url: src });
              }}
              disabled={!real}
              className="overflow-hidden rounded-xl border text-left transition hover:opacity-95 disabled:cursor-default disabled:hover:opacity-100"
              style={{ borderColor: B.border, background: B.card }}
            >
              {real ? (
                <div className="relative aspect-[16/10] w-full overflow-hidden" style={{ background: B.bg }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={title} className="h-full w-full object-cover" />
                  <div
                    className="absolute bottom-0 left-0 right-0 px-3 py-2"
                    style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.65))" }}
                  >
                    <p className="text-sm font-semibold text-white">{title}</p>
                    {fileName ? (
                      <p className="truncate text-[11px] text-white/80">{fileName}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 p-4">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: B.secondary, color: B.blueLight }}
                  >
                    <FileImage size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
                      {title}
                    </p>
                    <p className="mt-0.5 truncate text-xs" style={{ color: B.muted }}>
                      {fileName || "On file"}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: B.muted }}>
                      No photo bytes stored — ask agent to re-upload KYC.
                    </p>
                  </div>
                </div>
              )}
            </button>
          );
        })}
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
