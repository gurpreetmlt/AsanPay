import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

interface Props {
  active: boolean;
  onDone: () => void;
}

/** iOS-style "Done" bar while home-screen edit mode is active */
export function HomeEditModeBar({ active, onDone }: Props) {
  if (!active) return null;

  return (
    <View style={styles.bar}>
      <Text style={styles.hint}>− hataayein · ★ add karein</Text>
      <Pressable onPress={onDone} hitSlop={8}>
        <Text style={styles.done}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.bluePale,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  hint: { flex: 1, fontSize: 11, fontWeight: "600", color: colors.textMuted, marginRight: 8 },
  done: { fontSize: 15, fontWeight: "800", color: colors.blueFlat },
});
