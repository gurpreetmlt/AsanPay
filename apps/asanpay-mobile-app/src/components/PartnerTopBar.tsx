import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { Bell } from "lucide-react-native";
import { colors } from "../theme/colors";
import { showAlert } from "./AppAlert";

/** Solid brand bar used on Super Distributor / Distributor tab screens. */
export function PartnerTopBar({ title }: { title: string }) {
  return (
    <LinearGradient colors={[...colors.gradient]} style={styles.bar}>
      <View style={styles.side} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Pressable
        style={styles.side}
        hitSlop={8}
        accessibilityLabel="Notifications"
        onPress={() => showAlert("Coming soon", "Notifications will be available soon.")}
      >
        <Bell size={22} color="#fff" strokeWidth={2.1} />
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  side: { width: 32, alignItems: "flex-end" },
  title: { flex: 1, textAlign: "center", color: "#fff", fontSize: 18, fontWeight: "800" },
});
