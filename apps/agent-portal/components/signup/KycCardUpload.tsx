"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Crop, CreditCard, ImagePlus, Loader2, Lock, ShieldCheck, Trash2, XCircle } from "lucide-react";
import type { KycDocCheckUi } from "@asanpay/shared-types";
import { B } from "@/lib/brand";

/** ID-1 card (PAN / Aadhaar PVC): 85.6 × 54 mm. */
const CARD_ASPECT = "85.6 / 54";
const ACCEPT = "image/jpeg,image/png,image/webp";

export type KycCardStage = "cropping" | "checking" | null;

/**
 * One big card-shaped box per KYC photo (PAN / Aadhaar front / back): empty → loading (scan line in
 * the box) → done (photo + status badge + icon action bar) → failed (rejected photo faded behind a
 * "Photo not accepted" panel). Checks collapse into a one-line summary strip.
 */
export function KycCardUpload({
  label,
  title,
  hint,
  previewUrl,
  rejectedUrl,
  stage,
  check,
  missing,
  lockedReason,
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
  /** Photo the check refused, shown faded behind the failure message */
  rejectedUrl?: string | null;
  stage: KycCardStage;
  check?: KycDocCheckUi;
  /** Required and still empty after Continue */
  missing?: boolean;
  /** Set while the fields this photo is checked against are still empty — upload is blocked. */
  lockedReason?: string | null;
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
  const locked = Boolean(lockedReason) && !hasPhoto && !failed && !busy;

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
        className={`relative w-full overflow-hidden rounded-2xl border-2 transition ${hasPhoto || failed ? "border-solid shadow-[0_6px_18px_rgba(11,42,154,0.10)]" : "border-dashed"} ${dragging ? "scale-[1.01]" : ""}`}
        style={{
          aspectRatio: CARD_ASPECT,
          borderColor: dragging ? B.blueLight : border,
          background: failed || missing ? "#FEF2F2" : hasPhoto ? "#FFFFFF" : "linear-gradient(180deg, #F7F9FF 0%, #FFFFFF 100%)",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy && !locked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy && !locked) onPick(f);
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
            {check && check.state !== "checking" ? (
              <span
                className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${check.state === "pass" ? "kyc-badge-pulse" : ""}`}
                style={{ background: check.state === "pass" ? "#16A34A" : "#F59E0B" }}
                aria-hidden
              >
                {check.state === "pass" ? "✓" : "!"}
              </span>
            ) : null}
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-white/70 bg-white/70 px-1 py-0.5 backdrop-blur-md">
              <IconAction label={`Adjust crop of ${title}`} onClick={onAdjust}>
                <Crop size={16} />
              </IconAction>
              <label
                title="Change photo"
                aria-label={`Change ${title} photo`}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition hover:bg-white"
                style={{ color: B.blue }}
              >
                <ImagePlus size={16} />
                {fileInput}
              </label>
              <span className="mx-0.5 h-4 w-px bg-slate-900/15" aria-hidden />
              <IconAction label={`Remove ${title} photo`} onClick={onRemove} danger>
                <Trash2 size={16} />
              </IconAction>
            </div>
          </>
        ) : failed && check?.state === "fail" ? (
          <>
            {rejectedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rejectedUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-[0.16]" />
            ) : null}
            <div
              className="absolute inset-2.5 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-white/90 px-4 text-center"
              role="alert"
            >
              <p className="inline-flex items-center gap-1.5 text-[15px] font-bold" style={{ color: "#DC2626" }}>
                <XCircle size={18} /> Photo not accepted
              </p>
              <p className="max-w-[28rem] text-xs font-semibold leading-snug" style={{ color: "#991B1B" }}>
                {check.message}
              </p>
              <label
                className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                style={{ background: B.blue }}
              >
                <ImagePlus size={16} />
                Retake photo
                {fileInput}
              </label>
            </div>
          </>
        ) : locked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: B.secondary, color: B.muted }}>
              <Lock size={22} />
            </span>
            <p className="text-base font-semibold" style={{ color: B.muted }}>
              Upload {title}
            </p>
            <p className="max-w-[24rem] text-xs font-semibold" style={{ color: B.muted }}>
              {lockedReason}
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: B.secondary, color: B.blueLight }}>
              <CreditCard size={24} />
            </span>
            <p className="text-base font-semibold" style={{ color: B.blue }}>
              Upload {title}
            </p>
            <p className="text-xs" style={{ color: B.muted }}>
              {hint}
            </p>
            <label
              className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              style={{ background: B.blue }}
            >
              <ImagePlus size={16} />
              Choose photo
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

function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition ${danger ? "hover:bg-[#FEF2F2]" : "hover:bg-white"}`}
      style={{ color: danger ? "#DC2626" : B.blue }}
    >
      {children}
    </button>
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
  const summary = amber ? "Needs review" : passed.length ? `All ${passed.length} checks passed` : check.message;
  return (
    <div
      className="mt-2 rounded-xl border px-3 py-2"
      style={amber ? { background: "#FFF7ED", borderColor: "#FED7AA" } : { background: "#ECFDF3", borderColor: "#BBF7D0" }}
    >
      <div className="flex items-center gap-2">
        {amber ? <AlertTriangle size={16} color="#B45309" /> : <ShieldCheck size={16} color="#15803D" />}
        <p className="flex-1 text-[13px] font-semibold" style={{ color: amber ? "#B45309" : "#15803D" }} role="status" aria-live="polite">
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
      {amber ? (
        <p className="mt-0.5 pl-6 text-[11px] font-semibold" style={{ color: "#9A3412" }}>
          {problems.length
            ? "Our team will check the points below. You can continue."
            : "We couldn't read every detail on this photo. You can continue, or retake it in good light for faster approval."}
        </p>
      ) : null}
      {problems.length || open ? (
        <ul className="mt-1 space-y-0.5 pl-6">
          {problems.map((item) => (
            <li key={item.text} className="text-[11px] font-semibold" style={{ color: item.tone === "flag" ? "#B45309" : "#DC2626" }}>
              {item.text}
            </li>
          ))}
          {open
            ? passed.map((item) => (
                <li key={item.text} className="text-[11px] font-semibold" style={{ color: "#15803D" }}>
                  {item.text}
                </li>
              ))
            : null}
        </ul>
      ) : null}
    </div>
  );
}
