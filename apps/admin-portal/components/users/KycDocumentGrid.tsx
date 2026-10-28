"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { DocumentPreviewModal, type DocPreviewSlide } from "./DocumentPreviewModal";
import { DocCheckChips, type DocCheckLabelMap } from "./DocCheckLabels";
import { B } from "@/lib/brand";
import { FileImage, ZoomIn } from "lucide-react";

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
  checkLabels,
}: {
  documents: Record<string, string | undefined>;
  documentFiles?: Partial<Record<string, string | null | undefined>>;
  checkLabels?: DocCheckLabelMap;
}) {
  const [open, setOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);

  const items = Object.entries(documents || {}).filter(
    ([, url]) => typeof url === "string" && url.length > 0,
  );

  const slides: DocPreviewSlide[] = items
    .filter(([, url]) => isRealPhotoUrl(url!))
    .map(([key, url]) => ({
      title: LABELS[key] || key,
      url: resolvePreviewSrc(url!),
    }));

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
        Tap a photo to open it full size — use the arrows to move between documents.
      </p>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {items.map(([key, url]) => {
          const fileName = documentFiles?.[key];
          const real = isRealPhotoUrl(url!);
          const title = LABELS[key] || key;
          const src = real ? resolvePreviewSrc(url!) : "";
          const labels = checkLabels?.[key as keyof DocCheckLabelMap];
          return (
            <div key={key} className="flex min-w-0 flex-col gap-1">
              <button
                type="button"
                title={fileName ? `${title} · ${fileName}` : title}
                onClick={() => {
                  if (real) {
                    const idx = slides.findIndex((s) => s.url === src);
                    setStartIndex(idx >= 0 ? idx : 0);
                    setOpen(true);
                    return;
                  }
                  toast.error(
                    `${title}: photo was not saved (filename only${fileName ? `: ${fileName}` : ""}). Ask the agent to re-submit KYC with gallery/camera upload.`,
                    { duration: 5000 },
                  );
                }}
                className="group relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-xl border transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderColor: B.border, background: B.bg }}
              >
                {real ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                      <ZoomIn size={18} />
                    </span>
                  </>
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center" style={{ color: B.muted }}>
                    <FileImage size={18} style={{ color: B.blueLight }} />
                    <span className="text-[10px] font-semibold leading-tight">No photo · re-upload</span>
                  </span>
                )}
              </button>
              <p className="truncate text-[11px] font-semibold" style={{ color: "var(--admin-text)" }} title={title}>
                {title}
              </p>
              <DocCheckChips labels={labels} />
            </div>
          );
        })}
      </div>
      <DocumentPreviewModal
        open={open && slides.length > 0}
        slides={slides}
        initialIndex={startIndex}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
