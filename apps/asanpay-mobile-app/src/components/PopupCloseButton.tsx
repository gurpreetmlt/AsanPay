import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { X } from "lucide-react-native";
import { colors } from "../theme/colors";

/** Red ✕ tile for every popup (same as web `.popup-close`): fills red and turns on press. */
export function PopupCloseButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  const pressed = useRef(new Animated.Value(0)).current;
  const animate = (to: number) =>
    Animated.timing(pressed, { toValue: to, duration: 180, useNativeDriver: false }).start();

  const backgroundColor = pressed.interpolate({ inputRange: [0, 1], outputRange: [colors.dangerBg, colors.danger] });
  const rotate = pressed.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animate(1)}
      onPressOut={() => animate(0)}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Close"
    >
      {({ pressed: isPressed }) => (
        <Animated.View style={[styles.tile, { backgroundColor, transform: [{ rotate }] }, disabled && styles.disabled]}>
          <X size={18} color={isPressed ? "#fff" : colors.danger} strokeWidth={2.4} />
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
});
