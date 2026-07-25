import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Delete } from "lucide-react-native";

interface Props {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  tone?: "light" | "onGradient";
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

export function NumericKeypad({ onDigit, onBackspace, tone = "light" }: Props) {
  const onGradient = tone === "onGradient";

  return (
    <View style={styles.grid}>
      {KEYS.map((k, i) => {
        if (k === "") {
          return <View key={i} style={styles.keySlot} />;
        }
        if (k === "back") {
          return (
            <Pressable
              key={i}
              onPress={onBackspace}
              style={({ pressed }) => [
                styles.key,
                onGradient ? styles.keyOnGradient : styles.keyLight,
                pressed && styles.keyPressed,
              ]}
            >
              <Delete size={20} color={onGradient ? "#DCE6FF" : "#5A6DA8"} strokeWidth={2.2} />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={i}
            onPress={() => onDigit(k)}
            style={({ pressed }) => [
              styles.key,
              onGradient ? styles.keyOnGradient : styles.keyLight,
              pressed && styles.keyPressed,
            ]}
          >
            <Text style={[styles.keyText, onGradient ? styles.keyTextOnGradient : styles.keyTextLight]}>
              {k}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  keySlot: { width: "31%", aspectRatio: 1.85 },
  key: {
    width: "31%",
    aspectRatio: 1.85,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  keyLight: {
    backgroundColor: "#fff",
    borderColor: "#E4EAF8",
  },
  keyOnGradient: {
    backgroundColor: "rgba(255,255,255,.14)",
    borderColor: "rgba(255,255,255,.2)",
  },
  keyPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  keyText: { fontFamily: "System", fontWeight: "700", fontSize: 22 },
  keyTextLight: { color: "#0B2A9A" },
  keyTextOnGradient: { color: "#fff" },
});
