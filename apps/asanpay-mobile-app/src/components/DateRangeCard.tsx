import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { useTheme } from "../theme/ThemeContext";

/** YYYY-MM-DD in the device's local day (IST for our agents). */
export function toYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function toDisplay(ymd: string): string {
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
      {(["from", "to"] as const).map((k) => (
        <View key={k} style={{ flex: 1 }}>
          <Text style={[styles.label, { color: tokens.sub }]}>{k === "from" ? "From" : "To"}</Text>
          <Pressable
            onPress={() => setPicking(k)}
            style={[styles.input, { borderColor: tokens.inputBorder, backgroundColor: tokens.inputBg }]}
          >
            <Text style={[styles.value, { color: tokens.txt }]}>{toDisplay(k === "from" ? from : to)}</Text>
            <Calendar size={16} color={tokens.sub} />
          </Pressable>
        </View>
      ))}
      {picking ? (
        <DateTimePicker
          value={fromYmd(picking === "from" ? from : to)}
          mode="date"
          maximumDate={new Date()}
          onChange={onPicked}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  value: { fontSize: 14, fontWeight: "600" },
});
