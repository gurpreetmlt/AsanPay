import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChartColumn, ChevronDown, ChevronRight } from "lucide-react-native";
import { formatINR } from "../lib/format";
import { useTheme } from "../theme/ThemeContext";
import { colors } from "../theme/colors";

interface Props {
  /** Net commission credited today (after TDS). */
  net: string;
  gross?: string | null;
  tds?: string | null;
  onReport: () => void;
}

/** TCR09 — Today's Earnings. Collapsed = net; tap the card to see Gross · TDS · Net. */
export function TodayEarningsCard({ net, gross, tds, onReport }: Props) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
      <View style={styles.row}>
        <Pressable
          style={styles.main}
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel="Today's earnings. Show gross, TDS and net breakdown"
        >
          <View style={[styles.icon, { backgroundColor: "#EEF2FF" }]}>
            <ChartColumn size={18} color={colors.blueFlat} strokeWidth={2.2} />
          </View>
          <Text style={[styles.label, { color: tokens.txt }]}>Today&apos;s Earnings:</Text>
          <Text style={styles.value}>{formatINR(net)}</Text>
          <ChevronDown
            size={16}
            color={tokens.mute}
            style={open ? { transform: [{ rotate: "180deg" }] } : undefined}
          />
        </Pressable>
        <Pressable
          style={styles.arrow}
          onPress={onReport}
          accessibilityRole="button"
          accessibilityLabel="Open earnings report"
          hitSlop={8}
        >
          <ChevronRight size={16} color="#fff" strokeWidth={2.6} />
        </Pressable>
      </View>
      {open ? (
        <Text style={[styles.detail, { color: tokens.sub, borderTopColor: tokens.cardBorder }]}>
          Gross {formatINR(gross ?? net)} · TDS {formatINR(tds ?? "0")} · Net {formatINR(net)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 14, fontWeight: "700" },
  value: { fontSize: 15, fontWeight: "800", color: colors.blueFlat },
  arrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.blueFlat,
    alignItems: "center",
    justifyContent: "center",
  },
  detail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, fontSize: 12, fontWeight: "600" },
});
