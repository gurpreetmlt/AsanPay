import { B } from "@/lib/brand";

export type DocCheckLabel = { tone: "pass" | "flag" | "fail"; text: string };
export type DocCheckLabelMap = Partial<Record<"panCard" | "aadhaarFront" | "aadhaarBack", DocCheckLabel[]>>;

const TONES: Record<DocCheckLabel["tone"], { bg: string; border: string; fg: string }> = {
  pass: { bg: "#F0FDF4", border: "#86EFAC", fg: "#15803D" },
  flag: { bg: "#FFFBEB", border: "#FCD34D", fg: "#B45309" },
  fail: { bg: "#FEF2F2", border: "#FCA5A5", fg: "#B91C1C" },
};

const SHORT_DOC: Record<keyof DocCheckLabelMap, string> = {
  panCard: "PAN",
  aadhaarFront: "Aadhaar front",
  aadhaarBack: "Aadhaar back",
};

const DOC_KEYS = ["panCard", "aadhaarFront", "aadhaarBack"] as const;

export function DocCheckChips({ labels }: { labels: DocCheckLabel[] | undefined }) {
  if (!labels?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => {
        const t = TONES[l.tone];
        return (
          <span
            key={`${l.tone}:${l.text}`}
            className="inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: t.bg, borderColor: t.border, color: t.fg }}
          >
            {l.text}
          </span>
        );
      })}
    </div>
  );
}

/** All checked docs in one compact block (KYC queue row). */
export function DocCheckSummary({ map }: { map: DocCheckLabelMap | undefined }) {
  const keys = DOC_KEYS.filter((k) => map?.[k]?.length);
  if (!keys.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {keys.map((k) => (
        <div key={k} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
            {SHORT_DOC[k]}
          </span>
          <DocCheckChips labels={map![k]} />
        </div>
      ))}
    </div>
  );
}
