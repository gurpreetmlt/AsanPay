"use client";

import { useState } from "react";
import { Check, Download, X } from "lucide-react";
import { EULA_BODY, EULA_SUMMARY, PRIVACY_BODY, TERMS_BODY, buildLegalDownloadText } from "@asanpay/shared-types";
import { B } from "@/lib/brand";

export type LegalDoc = "terms" | "privacy" | "eula";

const DOCS: Record<LegalDoc, { title: string; body: string }> = {
  terms: { title: "Terms & Conditions", body: TERMS_BODY },
  privacy: { title: "Privacy Policy", body: PRIVACY_BODY },
  eula: { title: "End User Licence Agreement (EULA)", body: EULA_BODY },
};

function downloadLegalDocs() {
  const blob = new Blob([buildLegalDownloadText()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "AsanPay-Terms-Privacy-EULA.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function LegalDocModal({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const { title, body } = DOCS[doc];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ border: `1px solid ${B.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: B.border }}>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="popup-close">
            <X size={18} />
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 text-xs leading-relaxed"
          style={{ color: B.blue }}
        >
          {doc === "eula" ? (
            <p
              className="mb-4 rounded-xl border px-4 py-3 text-sm leading-relaxed"
              style={{ borderColor: `${B.green}55`, background: `${B.green}10`, color: B.blue }}
            >
              {EULA_SUMMARY}
            </p>
          ) : null}
          {body}
        </div>
        <div className="flex justify-between gap-2 border-t px-5 py-3" style={{ borderColor: B.border, background: "#FAFBFF" }}>
          <button
            type="button"
            onClick={downloadLegalDocs}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold"
            style={{ borderColor: B.border, color: B.muted }}
          >
            <Download size={14} />
            Download all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-2 text-sm font-bold text-white"
            style={{ background: B.blue }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Checkbox shown above every login button. Login stays disabled until it is ticked. */
export function LoginPolicyConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const [openDoc, setOpenDoc] = useState<LegalDoc | null>(null);

  const link = (doc: LegalDoc, label: string) => (
    <button
      type="button"
      onClick={() => setOpenDoc(doc)}
      className="cursor-pointer font-semibold underline underline-offset-2"
      style={{ color: B.blue }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <label
        className="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed transition-colors duration-200"
        style={{
          color: B.muted,
          borderColor: checked ? `${B.green}66` : B.border,
          background: checked ? `${B.green}0F` : "#F8FAFF",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[#2A5CDD]/40"
          style={{ borderColor: checked ? B.green : "#B8C3E0", background: checked ? B.green : "#fff" }}
        >
          <Check
            size={13}
            strokeWidth={3}
            className={`text-white transition-transform duration-200 ${checked ? "scale-100" : "scale-0"}`}
          />
        </span>
        <span>
          I agree to the {link("terms", "Terms & Conditions")}, {link("privacy", "Privacy Policy")} and{" "}
          {link("eula", "EULA")}.
        </span>
      </label>
      {openDoc ? <LegalDocModal doc={openDoc} onClose={() => setOpenDoc(null)} /> : null}
    </div>
  );
}
