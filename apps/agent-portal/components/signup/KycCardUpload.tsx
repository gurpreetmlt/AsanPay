"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Crop, CreditCard, ImagePlus, Loader2 } from "lucide-react";
import type { KycDocCheckUi } from "@asanpay/shared-types";
import { B } from "@/lib/brand";

/** ID-1 card (PAN / Aadhaar PVC): 85.6 × 54 mm. */
const CARD_ASPECT = "85.6 / 54";
const ACCEPT = "image/jpeg,image/png,image/webp";

export type KycCardStage = "cropping" | "checking" | null;

/**
 * One big card-shaped box per KYC photo (PAN / Aadhaar front / back): empty → loading (scan line in
 * the box) → done (photo + crop icon + status badge) → failed (red, retake). Checks collapse into a
 * one-line summary.
 */
export function KycCardUpload({
  label,
  title,
  hint,
  previewUrl,
  stage,
  check,
  missing,
  onPick,
  onAdjust,
  onRemove,
}: {
  label: string;
  /** "PAN card", "Aadhaar front" … */
  title: string;
  /** "Front side · clear photo" */
  hint: string;
  previewUrl?: string | null;
  stage: KycCardStage;
  check?: KycDocCheckUi;
  /** Required and still empty after Continue */
  missing?: boolean;
  onPick: (file: File) => void;
  onAdjust: () => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [slowCheck, setSlowCheck] = useState(false);

  const busy = stage !== null;
  const failed = check?.state === "fail";
  const hasPhoto = Boolean(previewUrl) && !failed;

  useEffect(() => {
    setSlowCheck(false);
    if (stage !== "checking") return;
    const t = setTimeout(() => setSlowCheck(true), 2500);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => setShowDetails(false), [previewUrl]);

  const busyText = stage === "cropping" ? "Cropping card…" : slowCheck ? "Checking details…" : "Reading card…";
  const border = failed || missing ? "#DC2626" : hasPhoto ? (check?.state === "flag" ? "#F59E0B" : B.green) : B.border;

  const fileInput = (
    <input
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onPick(f);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
        {label}
      </p>
      <div
        className={`relative w-full overflow-hidden rounded-2xl border-2 transition ${hasPhoto ? "border-solid" : "border-dashed"} ${dragging ? "scale-[1.01]" : ""}`}
        style={{
          aspectRatio: CARD_ASPECT,
          borderColor: dragging ? B.blueLight : border,
          background: failed || missing ? "#FEF2F2" : hasPhoto ? "#FFFFFF" : "linear-gradient(180deg, #F7F9FF 0%, #FFFFFF 100%)",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) onPick(f);
        }}
      >
        {previewUrl && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={previewUrl}
            src={previewUrl}
            alt={title}
            className={`kyc-card-pop absolute inset-0 h-full w-full object-contain ${busy ? "opacity-40 blur-[1px]" : ""}`}
          />
        ) : null}

        {busy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" role="status" aria-live="polite">
            <span className="kyc-scan-line" aria-hidden />
            <Loader2 size={26} className="animate-spin" style={{ color: B.blue }} />
            <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold shadow-sm" style={{ color: B.blue }}>
              {busyText}
            </span>
          </div>
        ) : hasPhoto ? (
          <>
            <button
              type="button"
              title="Adjust crop"
              aria-label={`Adjust crop of ${title}`}
              className="absolute left-2 top-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white shadow-md transition hover:scale-105 hover:bg-[#F7F9FF]"
              style={{ color: B.blue }}
              onClick={onAdjust}
            >
              <Crop size={17} />
            </button>
            {check && check.state !== "checking" ? (
              <span
                className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-base font-bold text-white shadow-md ${check.state === "pass" ? "kyc-badge-pulse" : ""}`}
                style={{ background: check.state === "pass" ? "#16A34A" : "#F59E0B" }}
                aria-hidden
              >
                {check.state === "pass" ? "✓" : "!"}
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-white/90 py-1.5 text-xs font-semibold backdrop-blur-sm">
              <label className="cursor-pointer underline" style={{ color: B.blue }}>
                Change photo
                {fileInput}
              </label>
              <span style={{ color: B.border }}>·</span>
              <button type="button" className="cursor-pointer underline" style={{ color: "#DC2626" }} onClick={onRemove}>
                Remove
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: failed ? "#FEE2E2" : B.secondary, color: failed ? "#DC2626" : B.blueLight }}
            >
              <CreditCard size={24} />
            </span>
            {failed && check?.state === "fail" ? (
              <p className="max-w-[26rem] text-sm font-semibold leading-snug" style={{ color: "#DC2626" }}>
                {check.message}
              </p>
            ) : (
              <>
                <p className="text-base font-semibold" style={{ color: B.blue }}>
                  Upload {title}
                </p>
                <p className="text-xs" style={{ color: B.muted }}>
                  {hint}
                </p>
              </>
            )}
            <label
              className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              style={{ background: B.blue }}
            >
              <ImagePlus size={16} />
              {failed ? "Retake photo" : "Choose photo"}
              {fileInput}
            </label>
            <p className="hidden text-[11px] sm:block" style={{ color: B.muted }}>
              or drop the photo here · good light · no glare · all 4 corners visible
            </p>
          </div>
        )}
      </div>

      {missing && !hasPhoto && !failed ? (
        <p className="mt-1 text-xs font-semibold" style={{ color: "#DC2626" }}>
          {title} photo is required
        </p>
      ) : null}

      {hasPhoto && check && check.state !== "checking" ? (
        <CheckSummary check={check} open={showDetails} onToggle={() => setShowDetails((v) => !v)} />
      ) : null}
    </div>
  );
}

function CheckSummary({
  check,
  open,
  onToggle,
}: {
  check: Exclude<KycDocCheckUi, { state: "checking" }>;
  open: boolean;
  onToggle: () => void;
}) {
  const passed = check.items.filter((i) => i.tone === "pass");
  const problems = check.items.filter((i) => i.tone !== "pass");
  const amber = check.state === "flag";
  const summary = amber
    ? check.message
    : passed.length
      ? `✓ All ${passed.length} checks passed`
      : check.message;
  return (
    <div className="mt-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold" style={{ color: amber ? "#B45309" : "#15803D" }} role="status" aria-live="polite">
          {summary}
        </p>
        {passed.length ? (
          <button
            type="button"
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs font-semibold"
            style={{ color: B.muted }}
            onClick={onToggle}
            aria-expanded={open}
          >
            Details
            <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
          </button>
        ) : null}
      </div>
      {problems.length ? (
        <ul className="mt-1 space-y-0.5">
          {problems.map((item) => (
            <li key={item.text} className="text-[11px] font-semibold" style={{ color: item.tone === "flag" ? "#B45309" : "#DC2626" }}>
              {item.text}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <ul className="mt-1 space-y-0.5">
          {passed.map((item) => (
            <li key={item.text} className="text-[11px] font-semibold" style={{ color: "#15803D" }}>
              {item.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
