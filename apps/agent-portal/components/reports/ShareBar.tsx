import { B } from "@/lib/brand";
import { formatPct, type ShareSegment } from "./reportUtils";

type Props = {
  title: string;
  segments: ShareSegment[];
  emptyText?: string;
};

export function ShareBar({ title, segments, emptyText = "No data in this range" }: Props) {
  const total = segments.reduce((s, x) => s + x.value, 0);

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: B.border }}>
      <h2 className="text-sm font-extrabold" style={{ color: B.blue }}>
        {title}
      </h2>

      {total <= 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: B.muted }}>
          {emptyText}
        </p>
      ) : (
        <>
          <div
            className="mt-3 flex h-4 w-full overflow-hidden rounded-full"
            style={{ background: B.secondary }}
            role="img"
            aria-label={title}
          >
            {segments.map((s) => (
              <div
                key={s.key}
                title={`${s.label} · ${formatPct(s.value, total)}`}
                style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {segments.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="font-semibold" style={{ color: B.muted }}>
                  {s.label}
                </span>
                <span className="font-extrabold tabular-nums" style={{ color: B.blue }}>
                  {formatPct(s.value, total)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
