"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { DocumentPreviewModal, type DocPreviewSlide } from "./DocumentPreviewModal";
import { DocCheckChips, type DocCheckLabelMap } from "./DocCheckLabels";
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
        Tap a card to preview. Use arrows in the popup to move between documents. Older submits only
        saved the filename — agent must re-submit KYC with the new app/web upload so the photo can
        open here.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(([key, url]) => {
          const fileName = documentFiles?.[key];
          const real = isRealPhotoUrl(url!);
          const title = LABELS[key] || key;
          const src = real ? resolvePreviewSrc(url!) : "";
          const labels = checkLabels?.[key as keyof DocCheckLabelMap];
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <button
                type="button"
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
                className="cursor-pointer overflow-hidden rounded-xl border text-left transition hover:opacity-95"
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
                        No photo to open — tap for details · agent must re-upload
                      </p>
                    </div>
                  </div>
                )}
              </button>
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
