"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { B } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { getCategoryIconByName } from "@/lib/serviceIcons";

type BtnVariant = "primary" | "success" | "destructive" | "secondary";

const BTN_STYLE: Record<BtnVariant, { background: string; color: string; border: string }> = {
  primary: { background: B.badgeGrad, color: "#fff", border: "transparent" },
  success: { background: B.green, color: "#fff", border: "transparent" },
  destructive: { background: "rgba(220,38,38,0.08)", color: B.danger, border: "#FCA5A5" },
  secondary: { background: "var(--admin-secondary)", color: B.blueLight, border: B.border },
};

export function Btn({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const s = BTN_STYLE[variant];
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{ background: s.background, color: s.color, borderColor: s.border }}
    >
      {children}
    </button>
  );
}

export function Chip({
  tone,
  children,
  title,
}: {
  tone: "blue" | "green" | "red" | "amber" | "muted";
  children: ReactNode;
  title?: string;
}) {
  const t = {
    blue: { bg: "rgba(42,92,221,0.10)", fg: B.blueLight },
    green: { bg: "rgba(18,183,106,0.12)", fg: B.greenDark },
    red: { bg: "rgba(220,38,38,0.10)", fg: B.danger },
    amber: { bg: "rgba(217,119,6,0.12)", fg: "#B45309" },
    muted: { bg: "var(--admin-secondary)", fg: "var(--admin-muted)" },
  }[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: t.bg, color: t.fg }}
    >
      {children}
    </span>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  prefix,
  disabled,
  placeholder,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  prefix?: string;
  disabled?: boolean;
  placeholder?: string;
  error?: string | null;
  className?: string;
}) {
  return (
    <label className={cn("block text-xs", className)}>
      {label ? (
        <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
          {label}
        </span>
      ) : null}
      <span
        className="flex items-center rounded-xl border px-3"
        style={{
          borderColor: error ? "#FCA5A5" : B.border,
          background: disabled ? "var(--admin-secondary)" : "var(--admin-card)",
        }}
      >
        {prefix ? (
          <span className="pr-1 text-sm" style={{ color: B.muted }}>
            {prefix}
          </span>
        ) : null}
        <input
          className="w-full min-w-0 bg-transparent py-2 text-sm tabular-nums outline-none disabled:cursor-not-allowed"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        />
        {suffix ? (
          <span className="pl-1 text-sm" style={{ color: B.muted }}>
            {suffix}
          </span>
        ) : null}
      </span>
      {error ? <span className="mt-1 block font-semibold text-red-600">{error}</span> : null}
    </label>
  );
}

/** Percent field with an on/off switch (agent TDS, GST on fee). */
export function TogglePercentField({
  label,
  on,
  onToggle,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  return (
    <div className="text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold" style={{ color: B.muted }}>
          {label}
        </span>
        <ToggleSwitch checked={on} onChange={onToggle} disabled={disabled} label={`${label} ${on ? "on" : "off"}`} />
      </div>
      <NumberField label="" value={value} onChange={onChange} suffix="%" disabled={disabled || !on} error={error} />
    </div>
  );
}

/** "Added on top" (default) vs "Included in fee". */
export function GstModeSwitch({
  inclusive,
  onChange,
  disabled,
}: {
  inclusive: boolean;
  onChange: (inclusive: boolean) => void;
  disabled?: boolean;
}) {
  const opts: Array<{ v: boolean; label: string }> = [
    { v: false, label: "Added on top" },
    { v: true, label: "Included in fee" },
  ];
  return (
    <div className="text-xs">
      <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
        GST on fee
      </span>
      <div className="grid grid-cols-2 gap-1 rounded-xl border p-1" style={{ borderColor: B.border }} role="radiogroup">
        {opts.map((o) => {
          const active = inclusive === o.v;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(o.v)}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: active ? B.blueLight : "transparent",
                color: active ? "#fff" : "var(--admin-muted)",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One category of a services table: a brand band (icon, name, service count) that sticks under the
 * top bar while this category is on screen, followed by one ServiceTable per service. `spaced` adds
 * a gap above so each category reads as its own block.
 */
export function CategoryBlock({
  label,
  count,
  spaced = false,
  children,
}: {
  label: string;
  count?: number;
  spaced?: boolean;
  children: ReactNode;
}) {
  const Icon = getCategoryIconByName(label);
  return (
    <div className={spaced ? "mt-4" : undefined}>
      <div
        className="sticky z-[4] flex h-14 items-center gap-2.5 px-4"
        style={{ background: B.badgeGrad, top: STICKY_TOP, boxShadow: "0 6px 12px -8px rgba(11,42,154,0.45)" }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm" style={{ color: B.blueLight }}>
          <Icon size={16} />
        </span>
        <span className="text-sm font-extrabold uppercase tracking-wider text-white">{label}</span>
        {count != null ? (
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ background: "rgba(255,255,255,0.22)" }}>
            {count} service{count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Category band as a table row, for single-table screens (Tax settings) that do not need sticky. */
export function CategoryHeaderRow({ label, count, colSpan, spaced = false }: { label: string; count?: number; colSpan: number; spaced?: boolean }) {
  const Icon = getCategoryIconByName(label);
  return (
    <>
      {spaced ? (
        <tr aria-hidden>
          <td colSpan={colSpan} className="h-4 p-0" style={{ background: "var(--admin-card)" }} />
        </tr>
      ) : null}
      <tr>
        <td colSpan={colSpan} className="px-4 py-3" style={{ background: B.badgeGrad }}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm" style={{ color: B.blueLight }}>
              <Icon size={16} />
            </span>
            <span className="text-sm font-extrabold uppercase tracking-wider text-white">{label}</span>
            {count != null ? (
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ background: "rgba(255,255,255,0.22)" }}>
                {count} service{count === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </td>
      </tr>
    </>
  );
}

/**
 * One service as its own fixed-layout table so columns line up across services. `head` holds the
 * service row (and the column titles when open); while open, the head sticks under the category
 * band until the slab rows of this service scroll past.
 */
export function ServiceTable({
  widths,
  open,
  head,
  children,
}: {
  widths: string[];
  open: boolean;
  head: ReactNode;
  children?: ReactNode;
}) {
  return (
    <table className="w-full table-fixed text-left text-sm">
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={w ? { width: w } : undefined} />
        ))}
      </colgroup>
      <thead
        className={open ? "sticky z-[3]" : undefined}
        style={
          open
            ? {
                top: `calc(${STICKY_TOP} + ${CATEGORY_ROW_HEIGHT}px)`,
                // Solid base under the tinted service row so slab rows never show through while stuck.
                background: "var(--admin-card)",
                boxShadow: "0 8px 14px -10px rgba(11,42,154,0.55)",
              }
            : undefined
        }
      >
        {head}
      </thead>
      {children ? <tbody>{children}</tbody> : null}
    </table>
  );
}

export type SplitMode = "percent" | "flat";

/** Role split type: % of what the company gets, or flat ₹ per transaction. */
export function SplitModeSwitch({
  mode,
  onChange,
  label,
  disabled,
  disabledReason,
}: {
  mode: SplitMode;
  onChange: (m: SplitMode) => void;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const opts: Array<{ v: SplitMode; text: string; title: string }> = [
    { v: "percent", text: "%", title: "% of what the company gets" },
    { v: "flat", text: "₹", title: "Flat ₹ per transaction" },
  ];
  return (
    <div
      className="inline-flex rounded-lg border p-0.5"
      style={{ borderColor: B.border }}
      role="radiogroup"
      aria-label={`${label} split type`}
      title={disabled ? disabledReason : undefined}
    >
      {opts.map((o) => {
        const active = mode === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={active}
            title={disabled ? disabledReason : o.title}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className="min-w-[28px] rounded-md px-2 py-0.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: active ? B.blueLight : "transparent", color: active ? "#fff" : "var(--admin-muted)" }}
          >
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

export function percentError(v: string, label: string): string | null {
  const t = v.trim();
  if (t === "") return `Enter ${label}`;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return `${label} must be from 0 to 100`;
  return null;
}

/**
 * Blue frame around an open service: service row + its slab rows + "Add slab" row. Drawn with inset
 * shadows per row because a table row group cannot carry one border box.
 */
export function openBlockEdge(part: "top" | "middle" | "bottom"): string {
  const c = B.blueLight;
  const sides = [`inset 2px 0 0 ${c}`, `inset -2px 0 0 ${c}`];
  if (part === "top") sides.push(`inset 0 2px 0 ${c}`);
  if (part === "bottom") sides.push(`inset 0 -2px 0 ${c}`);
  return sides.join(", ");
}

/**
 * Sticky offsets for the commission tables: the category band sticks under the admin top bar
 * (68 px, or `--rc-sticky-top` when a page has more sticky chrome), the open service's column
 * titles stick right under the band.
 */
const STICKY_TOP = "var(--rc-sticky-top, 68px)";
const CATEGORY_ROW_HEIGHT = 56;

export type SlabHeaderCell = { label: string; title?: string; colSpan?: number };

/** Column titles inside an open service, right above its slab rows. First cell is left-aligned. */
export function SlabHeaderRow({ cells }: { cells: SlabHeaderCell[] }) {
  const edge = B.blueLight;
  return (
    <tr className="rc-slab-in text-[11px] uppercase tracking-wider" style={{ color: "#fff" }}>
      {cells.map((c, i) => (
        <th
          key={`${c.label}-${i}`}
          scope="col"
          colSpan={c.colSpan}
          title={c.title}
          className={`py-2.5 font-extrabold ${i === 0 ? "pl-[4.25rem] pr-3 text-left" : "px-3 text-right"}`}
          style={{
            background: "linear-gradient(180deg, #3B6CF0 0%, #2A5CDD 100%)",
            boxShadow: [
              i === 0 ? `inset 2px 0 0 ${edge}` : null,
              i === cells.length - 1 ? `inset -2px 0 0 ${edge}` : null,
              "inset 0 -2px 0 #1D3FA8",
            ]
              .filter(Boolean)
              .join(", "),
          }}
        >
          {i === 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white" />
              {c.label}
            </span>
          ) : (
            c.label
          )}
        </th>
      ))}
    </tr>
  );
}
