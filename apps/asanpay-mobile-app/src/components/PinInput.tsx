import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextInputInstance } from "react-native";
import { colors } from "../theme/colors";

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  /** false = show digits (OTP). */
  masked?: boolean;
}

/**
 * Digit boxes + one number-pad TextInput.
 * Input must cover the boxes (not 1×1 / opacity 0) — Android ignores taps otherwise.
 * The box at the next-to-fill position gets a highlighted "cursor" border while this field is
 * focused, so with two PIN fields on one screen (e.g. New PIN + Confirm PIN) it's obvious which
 * one is currently receiving keystrokes.
 */
export function PinInput({ length = 4, value, onChange, autoFocus = true, masked = true }: PinInputProps) {
  const inputRef = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.padEnd(length, " ").slice(0, length).split("");
  const cursorIndex = Math.min(value.length, length - 1);

  function focus() {
    inputRef.current?.focus();
  }

  return (
    <Pressable style={styles.wrap} onPress={focus} accessibilityRole="keyboardkey">
      <View style={styles.row} pointerEvents="none">
        {digits.map((d, i) => (
          <View
            key={i}
            style={[
              styles.box,
              d.trim() ? styles.boxFilled : null,
              focused && i === cursorIndex ? styles.boxCursor : null,
            ]}
          >
            <Text style={styles.dot}>{d.trim() ? (masked ? "●" : d) : ""}</Text>
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        secureTextEntry={masked}
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
  boxCursor: {
    borderColor: colors.blue,
    borderWidth: 2,
    shadowColor: colors.blue,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  dot: { fontSize: 22, color: colors.text, fontWeight: "800" },
  /** Full hit area over boxes — must stay tappable on Android */
  input: {
    ...StyleSheet.absoluteFill,
    opacity: 0.02,
    fontSize: 1,
    color: "transparent",
    zIndex: 2,
  },
});
