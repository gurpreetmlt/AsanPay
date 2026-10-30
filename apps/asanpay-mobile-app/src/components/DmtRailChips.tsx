import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Landmark } from "lucide-react-native";
import { fetchApi } from "../lib/api";
import { useTheme } from "../theme/ThemeContext";
import { colors } from "../theme/colors";
import { showAlert } from "./AppAlert";

export type DmtRail = { code: string; name: string; shortName: string; live: boolean; priority: number };

/** Rails in admin priority order; first live rail is selected by default. */
export function useDmtRails() {
  const [rails, setRails] = useState<DmtRail[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchApi<DmtRail[]>("/txn/dmt/rails")
      .then((list) => {
        if (cancelled) return;
        const rows = list ?? [];
        setRails(rows);
        setSelected((cur) => cur || rows.find((r) => r.live)?.code || "");
      })
      .catch(() => {
        if (!cancelled) setRails([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rails, selected, setSelected };
}

/** Bank picker on the DMT screen. Coming-soon rails stay visible but cannot be picked. */
export function DmtRailChips({
  rails,
  selected,
  onSelect,
}: {
  rails: DmtRail[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const { tokens } = useTheme();
  if (rails.length < 2) return null;
  return (
    <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
      <View style={styles.labelRow}>
        <Landmark size={13} color={tokens.mute} />
        <Text style={[styles.label, { color: tokens.mute }]}>TRANSFER THROUGH</Text>
      </View>
      <View style={styles.row} accessibilityRole="radiogroup">
        {rails.map((r) => {
          const active = r.code === selected;
          return (
            <Pressable
              key={r.code}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => {
                if (!r.live) {
                  showAlert("Coming soon", `${r.name} is coming soon. Use another bank for now.`);
                  return;
                }
                onSelect(r.code);
              }}
              style={[
                styles.chip,
                active
                  ? { borderColor: colors.blueLight, backgroundColor: "rgba(42,92,221,0.08)" }
                  : { borderColor: tokens.cardBorder, opacity: r.live ? 1 : 0.7 },
              ]}
            >
              {active ? <Check size={14} color={colors.blueLight} /> : null}
              <Text style={[styles.chipText, { color: r.live ? tokens.txt : tokens.mute }]}>{r.shortName}</Text>
              {!r.live ? (
                <View style={styles.soon}>
                  <Text style={styles.soonText}>Coming soon</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 12 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 13, fontWeight: "700" },
  soon: { backgroundColor: "#FFFBEB", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  soonText: { fontSize: 9, fontWeight: "800", color: "#B45309" },
});
