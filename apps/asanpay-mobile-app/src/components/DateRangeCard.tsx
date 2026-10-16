import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar } from "lucide-react-native";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

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

type JsCalendarModalProps = {
  visible: boolean;
  valueYmd: string;
  maxYmd?: string;
  minYmd?: string;
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
  title = "Select date",
  onClose,
  onPick,
}: JsCalendarModalProps) {
  const { tokens } = useTheme();
  const seed = fromYmd(valueYmd || maxYmd || toYmd(new Date()));
  const [viewYear, setViewYear] = useState(seed.getFullYear());
  const [viewMonth, setViewMonth] = useState(seed.getMonth());

  // Reset view when opening
  React.useEffect(() => {
    if (!visible) return;
    const d = fromYmd(valueYmd || maxYmd || toYmd(new Date()));
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [visible, valueYmd, maxYmd]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const max = maxYmd || toYmd(new Date());
  const min = minYmd;

  const cells = useMemo(() => {
    const out: Array<{ day: number; ymd: string } | null> = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      out.push({ day, ymd: `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}` });
    }
    return out;
  }, [daysInMonth, startWeekday, viewYear, viewMonth]);

  const selectedDay =
    valueYmd && valueYmd.startsWith(`${viewYear}-${pad2(viewMonth + 1)}-`)
      ? Number(valueYmd.slice(8, 10))
      : 0;

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.sheetTitle, { color: tokens.txt }]}>{title}</Text>

          <View style={styles.monthRow}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.navBtn}>
              <Text style={styles.navTxt}>‹</Text>
            </Pressable>
            <Text style={[styles.monthLabel, { color: tokens.txt }]}>
              {MONTH_LABELS[viewMonth]} {viewYear}
            </Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={styles.navBtn}>
              <Text style={styles.navTxt}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`${w}-${i}`} style={[styles.weekCell, { color: tokens.sub }]}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((c, idx) => {
              if (!c) {
                return <View key={`e-${idx}`} style={styles.dayCell} />;
              }
              const disabled = (min && c.ymd < min) || c.ymd > max;
              const selected = c.day === selectedDay;
              return (
                <Pressable
                  key={c.ymd}
                  disabled={disabled}
                  onPress={() => {
                    onPick(c.ymd);
                    onClose();
                  }}
                  style={[
                    styles.dayCell,
                    selected && { backgroundColor: colors.blueLight, borderRadius: 999 },
                  ]}
                >
                  <Text
                    style={{
                      fontWeight: selected ? "800" : "600",
                      color: disabled ? tokens.mute : selected ? "#fff" : tokens.txt,
                      fontSize: 14,
                    }}
                  >
                    {c.day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

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
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  navTxt: { color: colors.blueLight, fontWeight: "800", fontSize: 20 },
  monthLabel: { fontSize: 15, fontWeight: "800" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekCell: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
});
