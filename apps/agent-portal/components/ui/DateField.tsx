"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { B } from "@/lib/brand";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayYmd() {
  return toYmd(new Date());
}

export function parseYmd(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  if (dt.getFullYear() !== y || dt.getMonth() !== (m || 1) - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function formatDisplayYmd(ymd: string) {
  const d = parseYmd(ymd);
  if (!d) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function clampYmd(ymd: string, min?: string, max?: string) {
  let v = ymd;
  if (min && v < min) v = min;
  if (max && v > max) v = max;
  return v;
}

type Cell = { ymd: string; day: number; inMonth: boolean };

function monthCells(year: number, month: number): Cell[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells: Cell[] = [];

  for (let i = 0; i < firstDow; i++) {
    const day = prevDays - firstDow + 1 + i;
    const d = new Date(year, month - 1, day);
    cells.push({ ymd: toYmd(d), day, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ ymd: toYmd(new Date(year, month, day)), day, inMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const day = cells.length - (firstDow + daysInMonth) + 1;
    const d = new Date(year, month + 1, day);
    cells.push({ ymd: toYmd(d), day: d.getDate(), inMonth: false });
  }
  return cells;
}

type DateFieldProps = {
  value: string;
  onChange: (ymd: string) => void;
  /** Optional peer of a range — shown as outline on the grid. */
  rangePeer?: string;
  /** Which end of a range this field represents (for in-between highlight). */
  rangeRole?: "start" | "end" | "single";
  min?: string;
  max?: string;
  /** Pill label inside the trigger (e.g. FROM / TO). */
  label?: string;
  disabled?: boolean;
  className?: string;
  /** When true, trigger stretches full width of parent. */
  fullWidth?: boolean;
  id?: string;
};

export function DateField({
  value,
  onChange,
  rangePeer,
  rangeRole = "single",
  min,
  max,
  label,
  disabled = false,
  className,
  fullWidth = false,
  id,
}: DateFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const seed = parseYmd(value) ?? parseYmd(todayYmd())!;
  const [viewY, setViewY] = useState(seed.getFullYear());
  const [viewM, setViewM] = useState(seed.getMonth());
  const [monthDir, setMonthDir] = useState<"left" | "right" | "none">("none");
  /** day → month → year (header click drills up; pick drills down). */
  const [pickerLevel, setPickerLevel] = useState<"day" | "month" | "year">("day");

  const openCalendar = useCallback(() => {
    if (disabled) return;
    const d = parseYmd(value) ?? parseYmd(todayYmd())!;
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
    setMonthDir("none");
    setPickerLevel("day");
    setOpen(true);
  }, [disabled, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cells = useMemo(() => monthCells(viewY, viewM), [viewY, viewM]);

  const rangeStart =
    rangeRole === "start"
      ? value
      : rangeRole === "end"
        ? rangePeer
        : rangePeer && value && rangePeer < value
          ? rangePeer
          : value;
  const rangeEnd =
    rangeRole === "end"
      ? value
      : rangeRole === "start"
        ? rangePeer
        : rangePeer && value && rangePeer > value
          ? rangePeer
          : value;

  function shiftNav(delta: number) {
    setMonthDir(delta < 0 ? "left" : "right");
    if (pickerLevel === "day") {
      const d = new Date(viewY, viewM + delta, 1);
      setViewY(d.getFullYear());
      setViewM(d.getMonth());
      return;
    }
    if (pickerLevel === "month") {
      setViewY((y) => y + delta);
      return;
    }
    setViewY((y) => y + delta * 12);
  }

  function onHeaderClick() {
    if (pickerLevel === "day") setPickerLevel("month");
    else if (pickerLevel === "month") setPickerLevel("year");
  }

  const yearBlockStart = Math.floor(viewY / 12) * 12;
  const yearOptions = Array.from({ length: 12 }, (_, i) => yearBlockStart + i);

  function pickDay(ymd: string) {
    if (min && ymd < min) return;
    if (max && ymd > max) return;
    onChange(clampYmd(ymd, min, max));
    setOpen(false);
  }

  const headerLabel =
    pickerLevel === "year"
      ? `${yearBlockStart} – ${yearBlockStart + 11}`
      : pickerLevel === "month"
        ? String(viewY)
        : `${MONTHS[viewM]} ${viewY}`;

  const active = open;

  return (
    <div ref={rootRef} className={clsx("relative", fullWidth && "w-full", className)}>
      <button
        type="button"
        id={fieldId}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? setOpen(false) : openCalendar())}
        className={clsx(
          "date-field-trigger group flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left transition",
          fullWidth ? "w-full" : "min-w-[168px]",
        )}
        style={{
          borderColor: active ? B.blueLight : B.border,
          boxShadow: active ? `0 0 0 3px ${B.blueLight}22` : "none",
          color: B.blue,
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <CalendarDays size={15} className="shrink-0 opacity-70" style={{ color: B.muted }} />
        {label ? (
          <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide" style={{ color: B.muted }}>
            {label}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-bold tabular-nums">
          {value ? formatDisplayYmd(value) : "Select date"}
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={label ? `${label} calendar` : "Calendar"}
          className="date-cal-pop absolute left-0 z-50 mt-2 w-[300px] rounded-2xl border bg-white p-3 shadow-xl"
          style={{ borderColor: B.border }}
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label={
                pickerLevel === "year" ? "Previous years" : pickerLevel === "month" ? "Previous year" : "Previous month"
              }
              className="date-cal-nav flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[#EEF2FF]"
              style={{ color: B.blue }}
              onClick={() => shiftNav(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold transition hover:bg-[#EEF2FF]"
              style={{ color: B.blue }}
              onClick={onHeaderClick}
              aria-label={
                pickerLevel === "day" ? "Choose month" : pickerLevel === "month" ? "Choose year" : "Year range"
              }
            >
              {headerLabel}
              {pickerLevel !== "year" ? (
                <ChevronDown
                  size={14}
                  className={clsx("opacity-60 transition", pickerLevel !== "day" && "rotate-180")}
                />
              ) : null}
            </button>
            <button
              type="button"
              aria-label={
                pickerLevel === "year" ? "Next years" : pickerLevel === "month" ? "Next year" : "Next month"
              }
              className="date-cal-nav flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[#EEF2FF]"
              style={{ color: B.blue }}
              onClick={() => shiftNav(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {pickerLevel === "year" ? (
            <div key={`y-${yearBlockStart}`} className="date-cal-grid-anim grid grid-cols-3 gap-1.5 pb-1">
              {yearOptions.map((y) => {
                const on = y === viewY;
                const minY = min ? Number(min.slice(0, 4)) : undefined;
                const maxY = max ? Number(max.slice(0, 4)) : undefined;
                const disabledYear = (minY != null && y < minY) || (maxY != null && y > maxY);
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={disabledYear}
                    onClick={() => {
                      setViewY(y);
                      setPickerLevel("month");
                      setMonthDir("none");
                    }}
                    className="rounded-xl px-2 py-2.5 text-xs font-bold transition disabled:opacity-40"
                    style={{
                      background: on ? B.blueLight : "transparent",
                      color: on ? "#fff" : B.blue,
                    }}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          ) : pickerLevel === "month" ? (
            <div key={`m-${viewY}`} className="date-cal-grid-anim grid grid-cols-3 gap-1.5 pb-1">
              {MONTHS.map((name, i) => {
                const on = i === viewM;
                const ymdProbe = `${viewY}-${String(i + 1).padStart(2, "0")}-01`;
                const monthEnd = toYmd(new Date(viewY, i + 1, 0));
                const disabledMonth =
                  (!!min && monthEnd < min) || (!!max && ymdProbe > max);
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={disabledMonth}
                    onClick={() => {
                      setViewM(i);
                      setPickerLevel("day");
                      setMonthDir("none");
                    }}
                    className="rounded-xl px-2 py-2.5 text-xs font-bold transition disabled:opacity-40"
                    style={{
                      background: on ? B.blueLight : "transparent",
                      color: on ? "#fff" : B.blue,
                    }}
                  >
                    {name.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="mb-1 grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="py-1 text-center text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: B.muted }}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div
                key={`${viewY}-${viewM}`}
                className={clsx(
                  "date-cal-grid-anim grid grid-cols-7 gap-0.5",
                  monthDir === "left" && "date-cal-slide-left",
                  monthDir === "right" && "date-cal-slide-right",
                )}
              >
                {cells.map((c) => {
                  const disabledDay = (min && c.ymd < min) || (max && c.ymd > max);
                  const isSelected = c.ymd === value;
                  const isPeer = !!rangePeer && c.ymd === rangePeer && c.ymd !== value;
                  const inRange =
                    !!rangeStart &&
                    !!rangeEnd &&
                    rangeStart < rangeEnd &&
                    c.ymd > rangeStart &&
                    c.ymd < rangeEnd;
                  const isRangeEdge =
                    !!rangeStart &&
                    !!rangeEnd &&
                    rangeStart !== rangeEnd &&
                    (c.ymd === rangeStart || c.ymd === rangeEnd);

                  let style: CSSProperties = {
                    color: !c.inMonth || disabledDay ? "#A8B4D4" : B.blue,
                  };
                  if (inRange) {
                    style = { ...style, background: "#EEF2FF", borderRadius: 0 };
                  }
                  if (isPeer || (isRangeEdge && !isSelected)) {
                    style = {
                      ...style,
                      background: "transparent",
                      boxShadow: `inset 0 0 0 1.5px ${B.blue}`,
                      borderRadius: 999,
                      color: B.blue,
                    };
                  }
                  if (isSelected) {
                    style = {
                      background: B.blueLight,
                      color: "#fff",
                      borderRadius: 999,
                      fontWeight: 800,
                      boxShadow: `0 4px 12px ${B.blueLight}44`,
                    };
                  }

                  return (
                    <button
                      key={c.ymd + String(c.inMonth)}
                      type="button"
                      disabled={!!disabledDay}
                      onClick={() => pickDay(c.ymd)}
                      className={clsx(
                        "date-cal-day relative flex h-9 items-center justify-center text-sm font-semibold transition",
                        isSelected && "date-cal-day-selected",
                      )}
                      style={style}
                    >
                      {c.day}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

type DateTimeFieldProps = {
  /** Local `YYYY-MM-DDTHH:mm` (datetime-local shape). */
  value: string;
  onChange: (local: string) => void;
  min?: string;
  max?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  fullWidth?: boolean;
};

function splitLocal(v: string): { ymd: string; hm: string } {
  if (!v) return { ymd: "", hm: "00:00" };
  const [ymd, rest = "00:00"] = v.split("T");
  return { ymd: ymd || "", hm: rest.slice(0, 5) || "00:00" };
}

function joinLocal(ymd: string, hm: string) {
  return `${ymd}T${hm || "00:00"}`;
}

function hmToParts(hm: string): { hour12: number; minute: number; isPm: boolean } {
  const [hRaw, mRaw] = (hm || "00:00").split(":");
  const h24 = Math.min(23, Math.max(0, Number(hRaw) || 0));
  const minute = Math.min(59, Math.max(0, Number(mRaw) || 0));
  const isPm = h24 >= 12;
  const mod = h24 % 12;
  return { hour12: mod === 0 ? 12 : mod, minute, isPm };
}

function partsToHm(hour12: number, minute: number, isPm: boolean): string {
  let h24: number;
  if (hour12 === 12) h24 = isPm ? 12 : 0;
  else h24 = isPm ? hour12 + 12 : hour12;
  return `${pad2(h24)}:${pad2(minute)}`;
}

export function DateTimeField({
  value,
  onChange,
  min,
  max,
  label,
  disabled = false,
  className,
  fullWidth = false,
}: DateTimeFieldProps) {
  const { ymd, hm } = splitLocal(value);
  const { hour12, minute, isPm } = hmToParts(hm);
  const minYmd = min?.slice(0, 10);
  const maxYmd = max?.slice(0, 10);
  const timeDisabled = disabled || !ymd;

  function setTime(nextHour12: number, nextMinute: number, nextPm: boolean) {
    onChange(joinLocal(ymd || todayYmd(), partsToHm(nextHour12, nextMinute, nextPm)));
  }

  return (
    <div className={clsx("flex flex-wrap items-center gap-2", fullWidth && "w-full", className)}>
      <DateField
        value={ymd}
        min={minYmd}
        max={maxYmd}
        label={label}
        disabled={disabled}
        fullWidth={fullWidth}
        onChange={(next) => onChange(joinLocal(next, hm))}
      />
      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{
          borderColor: "#C7D2FE",
          background: "#EEF2FF",
          opacity: timeDisabled ? 0.55 : 1,
        }}
      >
        <Clock size={15} style={{ color: B.muted }} />
        <input
          type="text"
          inputMode="numeric"
          disabled={timeDisabled}
          value={pad2(hour12)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, "").slice(0, 2));
            if (!Number.isFinite(n) || n < 1 || n > 12) return;
            setTime(n, minute, isPm);
          }}
          className="w-10 rounded-lg border bg-white px-1.5 py-1 text-center text-sm font-bold outline-none"
          style={{ borderColor: "#C7D2FE", color: B.blue }}
          aria-label="Hour"
        />
        <span className="text-sm font-extrabold" style={{ color: B.blue }}>
          :
        </span>
        <input
          type="text"
          inputMode="numeric"
          disabled={timeDisabled}
          value={pad2(minute)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, "").slice(0, 2));
            if (!Number.isFinite(n) || n > 59) return;
            setTime(hour12, n, isPm);
          }}
          className="w-10 rounded-lg border bg-white px-1.5 py-1 text-center text-sm font-bold outline-none"
          style={{ borderColor: "#C7D2FE", color: B.blue }}
          aria-label="Minute"
        />
        <div className="ml-1 flex gap-1">
          {(["AM", "PM"] as const).map((labelAmPm) => {
            const on = (isPm ? "PM" : "AM") === labelAmPm;
            return (
              <button
                key={labelAmPm}
                type="button"
                disabled={timeDisabled}
                onClick={() => setTime(hour12, minute, labelAmPm === "PM")}
                className="rounded-lg px-2.5 py-1 text-xs font-extrabold transition"
                style={
                  on
                    ? { background: B.blueMid, color: "#fff" }
                    : { background: "#fff", color: B.blueMid, border: `1.5px solid ${B.blueMid}` }
                }
              >
                {labelAmPm}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Date range presets — same segment tabs as admin Fund requests (Open / Credited). */
export function DatePresetLinks({
  activeId,
  onPick,
  presets,
}: {
  activeId?: string;
  onPick: (from: string, to: string) => void;
  presets: { id: string; label: string; range: () => { from: string; to: string } }[];
}) {
  return (
    <div className="inline-flex flex-wrap rounded-xl p-1" style={{ background: "#F1F5F9" }}>
      {presets.map((p) => {
        const on = activeId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            data-active={on}
            onClick={() => {
              const r = p.range();
              onPick(r.from, r.to);
            }}
            className="tab-chip inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={
              on
                ? { background: "#fff", color: B.blueLight, boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }
                : { color: B.muted }
            }
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function DateFieldHint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 text-xs" style={{ color: B.muted }}>
      {children}
    </p>
  );
}
