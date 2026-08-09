import React from "react";
import { StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandLockup } from "../components/BrandMark";
import { BRAND } from "../theme/brand";

/** Cold-start splash — same Final Logo lockup animation as login/header. */
export function SplashScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <LinearGradient colors={["#3564E6", "#0B2A9A", "#06175A"]} style={styles.bg}>
        <View style={styles.center}>
          <BrandLockup iconSize={64} animate light showTagline playOnce />
          <Text style={styles.hint}>{BRAND.loginSubtitle}</Text>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B2A9A" },
  bg: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  hint: {
    marginTop: 18,
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
