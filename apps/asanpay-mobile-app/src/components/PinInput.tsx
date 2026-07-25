import React, { useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../theme/colors";

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}

/**
 * Digit boxes + one number-pad TextInput.
 * Input must cover the boxes (not 1×1 / opacity 0) — Android ignores taps otherwise.
 */
export function PinInput({ length = 4, value, onChange, autoFocus = true }: PinInputProps) {
  const inputRef = useRef<TextInput>(null);
  const digits = value.padEnd(length, " ").slice(0, length).split("");

  function focus() {
    inputRef.current?.focus();
  }

  return (
    <Pressable style={styles.wrap} onPress={focus} accessibilityRole="keyboardkey">
      <View style={styles.row} pointerEvents="none">
        {digits.map((d, i) => (
          <View key={i} style={[styles.box, d.trim() ? styles.boxFilled : null]}>
            <Text style={styles.dot}>{d.trim() ? "●" : ""}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        style={styles.input}
        keyboardType="number-pad"
        maxLength={length}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
        autoFocus={autoFocus}
        secureTextEntry
        caretHidden
        showSoftInputOnFocus
        textContentType="oneTimeCode"
        importantForAutofill="no"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    position: "relative",
    minHeight: 56,
    justifyContent: "center",
  },
  row: { flexDirection: "row", gap: 12, justifyContent: "center" },
  box: {
    width: 52,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxFilled: { borderColor: colors.blueFlat, backgroundColor: "rgba(18, 58, 158, 0.06)" },
  dot: { fontSize: 22, color: colors.text, fontWeight: "800" },
  /** Full hit area over boxes — must stay tappable on Android */
  input: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    fontSize: 1,
    color: "transparent",
    zIndex: 2,
  },
});
