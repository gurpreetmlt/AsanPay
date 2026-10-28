import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** YYYY-MM-DD in the device's local day (IST for our agents). */
export function toYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function toDisplay(ymd: string): string {
  if (!ymd) return "Select";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function fromYmd(ymd: string): Date {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return new Date();
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const MONTH_FULL = [
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
];
const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const RANGE_TINT = "rgba(42,92,221,0.12)";
const OFF_DAY = "#A8B4D4";

type CalendarPanelProps = {
  valueYmd: string;
  minYmd?: string;
  maxYmd?: string;
  /** Other end of a range: drawn as an outlined circle, days between are tinted. */
  rangePeer?: string;
  rangeRole?: "start" | "end" | "single";
  /** View to open on when there is no value (e.g. 1995 for a date of birth). */
  seedYmd?: string;
  onPick: (ymd: string) => void;
};

/**
 * The one calendar look used across the app (same as the web portals): month header with arrows,
 * SUN–SAT row, 6-week grid with adjacent-month days muted, range tint, filled selected day.
 * Tap the header to pick a month, then a year.
 */
export function CalendarPanel({ valueYmd, minYmd, maxYmd, rangePeer, rangeRole = "single", seedYmd, onPick }: CalendarPanelProps) {
  const { tokens } = useTheme();
  const seed = fromYmd(valueYmd || seedYmd || maxYmd || toYmd(new Date()));
  const [viewYear, setViewYear] = useState(seed.getFullYear());
  const [viewMonth, setViewMonth] = useState(seed.getMonth());
  const [pickerLevel, setPickerLevel] = useState<"day" | "month" | "year">("day");
  const min = minYmd;
  const max = maxYmd;
  const yearBlockStart = Math.floor(viewYear / 12) * 12;
  const yearOptions = Array.from({ length: 12 }, (_, i) => yearBlockStart + i);

  const cells = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const out: Array<{ ymd: string; day: number; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(viewYear, viewMonth, 1 - firstDow + i);
      out.push({ ymd: toYmd(d), day: d.getDate(), inMonth: d.getMonth() === viewMonth });
    }
    return out;
  }, [viewYear, viewMonth]);

  const rangeStart = rangeRole === "end" ? rangePeer : rangeRole === "start" ? valueYmd : undefined;
  const rangeEnd = rangeRole === "end" ? valueYmd : rangeRole === "start" ? rangePeer : undefined;

  function shiftNav(delta: number) {
    if (pickerLevel === "day") {
      const d = new Date(viewYear, viewMonth + delta, 1);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    } else if (pickerLevel === "month") setViewYear((y) => y + delta);
    else setViewYear((y) => y + delta * 12);
  }

  const headerLabel =
    pickerLevel === "year"
      ? `${yearBlockStart} – ${yearBlockStart + 11}`
      : pickerLevel === "month"
        ? String(viewYear)
        : `${MONTH_FULL[viewMonth]} ${viewYear}`;

  return (
    <View style={[styles.calPanel, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
      <View style={styles.monthRow}>
        <Pressable onPress={() => shiftNav(-1)} hitSlop={10} style={styles.navBtn} accessibilityLabel="Previous">
          <ChevronLeft size={18} color={tokens.txt} />
        </Pressable>
        <Pressable
          onPress={() => setPickerLevel((l) => (l === "day" ? "month" : l === "month" ? "year" : l))}
          hitSlop={8}
          style={styles.headerHit}
        >
          <Text style={[styles.monthLabel, { color: tokens.txt }]}>{headerLabel}</Text>
          {pickerLevel !== "year" ? <ChevronDown size={14} color={tokens.sub} /> : null}
        </Pressable>
        <Pressable onPress={() => shiftNav(1)} hitSlop={10} style={styles.navBtn} accessibilityLabel="Next">
          <ChevronRight size={18} color={tokens.txt} />
        </Pressable>
      </View>

      {pickerLevel === "year" || pickerLevel === "month" ? (
        <View style={styles.pickerGrid}>
          {(pickerLevel === "year" ? yearOptions.map(String) : MONTH_LABELS).map((name, i) => {
            const y = pickerLevel === "year" ? Number(name) : viewYear;
            const on = pickerLevel === "year" ? y === viewYear : i === viewMonth;
            const disabled =
              pickerLevel === "year"
                ? (!!min && y < Number(min.slice(0, 4))) || (!!max && y > Number(max.slice(0, 4)))
                : (!!min && toYmd(new Date(viewYear, i + 1, 0)) < min) || (!!max && `${viewYear}-${pad2(i + 1)}-01` > max);
            return (
              <Pressable
                key={name}
                disabled={disabled}
                onPress={() => {
                  if (pickerLevel === "year") {
                    setViewYear(y);
                    setPickerLevel("month");
                  } else {
                    setViewMonth(i);
                    setPickerLevel("day");
                  }
                }}
                style={[styles.pickerCell, on && styles.pickerCellOn]}
              >
                <Text style={{ fontWeight: "800", fontSize: 13, color: disabled ? OFF_DAY : on ? "#fff" : tokens.txt }}>{name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <>
          <View style={styles.weekRow}>
            {WEEKDAY_SHORT.map((w) => (
              <Text key={w} style={[styles.weekCell, { color: tokens.sub }]}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((c) => {
              const disabled = (!!min && c.ymd < min) || (!!max && c.ymd > max);
              const selected = c.ymd === valueYmd;
              const isPeer = !!rangePeer && c.ymd === rangePeer && !selected;
              const inRange = !!rangeStart && !!rangeEnd && rangeStart < rangeEnd && c.ymd > rangeStart && c.ymd < rangeEnd;
              return (
                <Pressable
                  key={`${c.ymd}-${c.inMonth ? 1 : 0}`}
                  disabled={disabled}
                  onPress={() => onPick(c.ymd)}
                  style={styles.dayCell}
                >
                  <View
                    style={[
                      styles.dayInner,
                      inRange && styles.dayInRange,
                      isPeer && styles.dayPeer,
                      selected && styles.dayInnerSelected,
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: selected ? "800" : "600",
                        color: selected ? "#fff" : !c.inMonth || disabled ? OFF_DAY : tokens.txt,
                      }}
                    >
                      {c.day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

type JsCalendarModalProps = {
  visible: boolean;
  valueYmd: string;
  maxYmd?: string;
  minYmd?: string;
  rangePeer?: string;
  rangeRole?: "start" | "end" | "single";
  seedYmd?: string;
  title?: string;
  onClose: () => void;
  onPick: (ymd: string) => void;
};

/**
 * Pure JS calendar — do NOT use @react-native-community/datetimepicker here.
 * Native picker crashes on several Android devices in this app.
 */
export function JsCalendarModal({
  visible,
  valueYmd,
  maxYmd,
  minYmd,
  rangePeer,
  rangeRole,
  seedYmd,
  title = "Select date",
  onClose,
  onPick,
}: JsCalendarModalProps) {
  const { tokens } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.sheetTitle, { color: tokens.txt }]}>{title}</Text>
          {visible ? (
            <CalendarPanel
              valueYmd={valueYmd}
              minYmd={minYmd}
              maxYmd={maxYmd || toYmd(new Date())}
              rangePeer={rangePeer}
              rangeRole={rangeRole}
              seedYmd={seedYmd}
              onPick={(ymd) => {
                onPick(ymd);
                onClose();
              }}
            />
          ) : null}
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={{ color: tokens.sub, fontWeight: "700" }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function addDaysYmd(ymd: string, days: number): string {
  const d = fromYmd(ymd);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

const DATE_PRESETS: { id: string; label: string; range: (today: string) => { from: string; to: string } }[] = [
  { id: "today", label: "Today", range: (t) => ({ from: t, to: t }) },
  {
    id: "yesterday",
    label: "Yesterday",
    range: (t) => {
      const y = addDaysYmd(t, -1);
      return { from: y, to: y };
    },
  },
  { id: "last7", label: "Last 7 Days", range: (t) => ({ from: addDaysYmd(t, -6), to: t }) },
  {
    id: "month",
    label: "This Month",
    range: (t) => ({ from: `${t.slice(0, 7)}-01`, to: t }),
  },
];

interface Props {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Hide Today / Yesterday / … segment tabs (default: show). */
  hidePresets?: boolean;
}

/** FROM / TO date fields + segment presets (match admin Fund-request tabs). */
export function DateRangeFields({ from, to, onChange, hidePresets }: Props) {
  const { tokens } = useTheme();
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const today = toYmd(new Date());
  const activePreset = DATE_PRESETS.find((p) => {
    const r = p.range(today);
    return r.from === from && r.to === to;
  })?.id;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {(["from", "to"] as const).map((k) => {
          const active = picking === k;
          return (
            <Pressable
              key={k}
              onPress={() => setPicking(k)}
              style={[
                styles.pill,
                {
                  borderColor: active ? colors.blueLight : tokens.inputBorder,
                  backgroundColor: tokens.inputBg,
                },
              ]}
            >
              <Calendar size={15} color={tokens.sub} />
              <Text style={[styles.pillLabel, { color: tokens.sub }]}>
                {k === "from" ? "FROM" : "TO"}
              </Text>
              <Text style={[styles.pillValue, { color: tokens.txt }]} numberOfLines={1}>
                {toDisplay(k === "from" ? from : to)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!hidePresets ? (
        <View style={styles.presetTrack}>
          {DATE_PRESETS.map((p) => {
            const on = activePreset === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => onChange(p.range(today))}
                style={[styles.presetChip, on && styles.presetChipOn]}
              >
                <Text style={[styles.presetText, { color: on ? colors.blueLight : tokens.sub }]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <JsCalendarModal
        visible={picking !== null}
        title={picking === "from" ? "From date" : "To date"}
        valueYmd={picking === "from" ? from : to}
        rangePeer={picking === "from" ? to : from}
        rangeRole={picking === "from" ? "start" : "end"}
        minYmd={picking === "to" ? from || undefined : undefined}
        maxYmd={picking === "from" ? to || today : today}
        onClose={() => setPicking(null)}
        onPick={(ymd) => {
          if (picking === "from") onChange({ from: ymd, to: ymd > to ? ymd : to });
          else if (picking === "to") onChange({ from: ymd < from ? ymd : from, to: ymd });
        }}
      />
    </View>
  );
}

/** Single optional/required date field using the same crash-safe JS calendar. */
export function JsDateField({
  valueYmd,
  onChange,
  placeholder = "Select date",
  maxYmd,
  minYmd,
  disabled,
}: {
  valueYmd: string;
  onChange: (ymd: string) => void;
  placeholder?: string;
  maxYmd?: string;
  minYmd?: string;
  disabled?: boolean;
}) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.singleField,
          {
            borderColor: tokens.inputBorder,
            backgroundColor: tokens.inputBg,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <Text style={{ color: valueYmd ? tokens.txt : tokens.mute, flex: 1, fontWeight: "600" }}>
          {valueYmd ? toDisplay(valueYmd) : placeholder}
        </Text>
        <Calendar size={16} color={tokens.sub} />
      </Pressable>
      <JsCalendarModal
        visible={open}
        valueYmd={valueYmd}
        maxYmd={maxYmd}
        minYmd={minYmd}
        onClose={() => setOpen(false)}
        onPick={onChange}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  presetTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    gap: 2,
  },
  presetChip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  presetChipOn: {
    backgroundColor: "#fff",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  presetText: { fontSize: 12, fontWeight: "700" },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pillLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  pillValue: { flex: 1, fontSize: 14, fontWeight: "700" },
  singleField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", marginBottom: 12 },
  calPanel: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: "#0B2A9A",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerHit: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { fontSize: 15, fontWeight: "800" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekCell: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  pickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pickerCell: {
    width: "31%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  pickerCellOn: {
    backgroundColor: colors.blueLight,
    shadowColor: colors.blueLight,
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dayCell: {
    width: "14.28%",
    height: 40,
    padding: 1,
  },
  dayInner: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  dayInRange: { backgroundColor: RANGE_TINT, borderRadius: 0 },
  dayPeer: { borderWidth: 1.5, borderColor: colors.blue, borderRadius: 999 },
  dayInnerSelected: {
    backgroundColor: colors.blueLight,
    borderRadius: 999,
    shadowColor: colors.blueLight,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cancelBtn: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
});
