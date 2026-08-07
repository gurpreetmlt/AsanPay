"use client";

import { X, CheckCircle2 } from "lucide-react";
import { B } from "@/lib/brand";
import type { HelpGuide } from "@/lib/helpContent";

export function HelpGuideModal({ guide, onClose }: { guide: HelpGuide; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase" style={{ color: B.muted }}>
              {guide.tag}
            </span>
            <h2 className="text-base font-semibold" style={{ color: B.blue }}>
              {guide.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} style={{ color: B.muted }} />
          </button>
        </div>
        <ol className="space-y-3">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-sm" style={{ color: B.blueMid }}>
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: B.green }} />
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
