import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  length: number;
  value: string;
  mask?: boolean;
  /** Glass cells for blue auth screens */
  tone?: "light" | "onGradient";
}

/** Read-only segmented code display, filled by a NumericKeypad rather than the OS keyboard. */
export function CodeGrid({ length, value, mask = false, tone = "light" }: Props) {
  const digits = value.padEnd(length, " ").slice(0, length).split("");
  const activeIndex = Math.min(value.length, length - 1);
  const onGradient = tone === "onGradient";

  return (
    <View style={styles.row}>
      {digits.map((d, i) => {
        const filled = d.trim().length > 0;
        const focused = !filled && i === activeIndex && value.length < length;
        return (
          <View
            key={i}
            style={[
              styles.cell,
              onGradient ? styles.cellOnGradient : styles.cellLight,
              filled && (onGradient ? styles.cellFilledOnGradient : styles.cellFilledLight),
              focused && (onGradient ? styles.cellFocusedOnGradient : styles.cellFocusedLight),
            ]}
          >
            <Text style={[styles.text, onGradient ? styles.textOnGradient : styles.textLight]}>
              {filled ? (mask ? "●" : d) : ""}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 9, justifyContent: "center" },
  cell: {
    flex: 1,
    maxWidth: 48,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cellLight: {
    backgroundColor: "#fff",
    borderColor: "#D6DEF5",
  },
  cellOnGradient: {
    backgroundColor: "rgba(255,255,255,.12)",
    borderColor: "rgba(255,255,255,.22)",
  },
  cellFilledLight: { borderColor: "#2A5CDD", backgroundColor: "#EEF3FF" },
  cellFilledOnGradient: {
    borderColor: "#3BE39A",
    backgroundColor: "rgba(255,255,255,.22)",
  },
  cellFocusedLight: { borderColor: "#2A5CDD" },
  cellFocusedOnGradient: {
    borderColor: "rgba(59,227,154,.85)",
    backgroundColor: "rgba(59,227,154,.12)",
  },
  text: { fontFamily: "System", fontWeight: "800", fontSize: 20 },
  textLight: { color: "#0B2A9A" },
  textOnGradient: { color: "#fff" },
});
