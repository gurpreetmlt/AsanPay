import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Globe2 } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";

interface NepalScreenProps {
  onBack: () => void;
  onOpenDmt: () => void;
}

export function NepalScreen({ onBack, onOpenDmt }: NepalScreenProps) {
  const { tokens } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
      <LinearGradient
        colors={[colors.blueLight, colors.blue]}
        start={gradientDirection.diagonal.start}
        end={gradientDirection.diagonal.end}
        style={styles.header}
      >
        <Pressable onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={18} color="#fff" strokeWidth={2.5} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Nepal Remittance</Text>
          <Text style={styles.headerSub}>Coming soon</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.heroCard, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          <View style={styles.heroIconWrap}>
            <Globe2 size={24} color={colors.blueLight} strokeWidth={2.2} />
          </View>
          <Text style={[styles.heroTitle, { color: tokens.txt }]}>Nepal remittance is coming soon</Text>
          <Text style={[styles.heroSub, { color: tokens.sub }]}>
            Sending money to Nepal is not available yet. Use Money Transfer for transfers to Indian bank accounts.
          </Text>
          <Pressable onPress={onOpenDmt} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Open Money Transfer</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,.16)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitle: { color: "#fff", fontSize: 21, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,.9)", marginTop: 3, fontSize: 13 },
  content: { padding: 16, paddingBottom: 28 },
  heroCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF3FF",
    marginBottom: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: "800", lineHeight: 24 },
  heroSub: { marginTop: 8, fontSize: 13.5, lineHeight: 20 },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: colors.blueLight,
    borderRadius: 16,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
