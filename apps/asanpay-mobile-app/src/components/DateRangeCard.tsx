import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

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
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

interface Props {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}

/** InstantPay-style FROM / TO pills — native picker on tap (OS calendar). */
export function DateRangeFields({ from, to, onChange }: Props) {
  const { tokens } = useTheme();
  const [picking, setPicking] = useState<"from" | "to" | null>(null);

  function onPicked(e: DateTimePickerEvent, date?: Date) {
    const which = picking;
    setPicking(null);
    if (e.type !== "set" || !date || !which) return;
    const ymd = toYmd(date);
    if (which === "from") onChange({ from: ymd, to: ymd > to ? ymd : to });
    else onChange({ from: ymd < from ? ymd : from, to: ymd });
  }

  return (
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
                shadowColor: colors.blueLight,
                shadowOpacity: active ? 0.18 : 0,
                shadowRadius: active ? 6 : 0,
                elevation: active ? 2 : 0,
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
      {picking ? (
        <DateTimePicker
          value={fromYmd(picking === "from" ? from || toYmd(new Date()) : to || toYmd(new Date()))}
          mode="date"
          display="calendar"
          maximumDate={new Date()}
          onChange={onPicked}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
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
  pillValue: { flex: 1, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
