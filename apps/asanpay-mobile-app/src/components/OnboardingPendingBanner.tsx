import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { colors } from "../theme/colors";

/** Shown on AEPS / DMT after the agent skipped onboarding: the screen works, transactions don't yet. */
export function OnboardingPendingBanner({ onComplete }: { onComplete: () => void }) {
  return (
    <View style={s.box}>
      <View style={s.row}>
        <AlertTriangle size={18} color="#D97706" />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>AEPS onboarding pending</Text>
          <Text style={s.text}>
            Complete onboarding with the bank partner to unlock daily verification and transactions.
          </Text>
        </View>
      </View>
      <Pressable style={s.btn} onPress={onComplete}>
        <Text style={s.btnText}>Complete onboarding</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  title: { fontSize: 14, fontWeight: "800", color: "#78350F" },
  text: { fontSize: 12.5, lineHeight: 18, color: "#92400E", marginTop: 2 },
  btn: { backgroundColor: colors.blue, borderRadius: 12, height: 42, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
