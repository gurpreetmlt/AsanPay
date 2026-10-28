import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LinearGradient from "react-native-linear-gradient";
import { Download } from "lucide-react-native";
import { BrandMark } from "../components/BrandMark";
import { PulseIcon, POPUP_TONE } from "../components/PulseIcon";
import { showAlert } from "../components/AppAlert";
import { useAppUpdateStore } from "../lib/appUpdate";
import { APP_VERSION_NAME } from "../lib/appVersion";
import { useTheme } from "../theme/ThemeContext";
import { colors, gradientDirection } from "../theme/colors";

/** Blocking screen shown when this build is below the server's minimum version code. */
export function UpdateRequiredScreen() {
  const { tokens } = useTheme();
  const storeUrl = useAppUpdateStore((s) => s.storeUrl);

  function openStore() {
    Linking.openURL(storeUrl).catch(() =>
      showAlert("Play Store not opened", "Open the Play Store app, search for AsanPay and tap Update."),
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]}>
      <View style={styles.body}>
        <BrandMark size={40} variant="mark" />
        <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
          <PulseIcon bg={POPUP_TONE.blue.bg} accent={POPUP_TONE.blue.fg}>
            <Download size={22} color={POPUP_TONE.blue.fg} />
          </PulseIcon>
          <Text style={[styles.title, { color: tokens.txt }]}>Update required</Text>
          <Text style={[styles.sub, { color: tokens.sub }]}>
            This version of AsanPay (v{APP_VERSION_NAME}) is no longer supported. Update the app from the Play
            Store to keep using your account.
          </Text>
          <Pressable onPress={openStore} style={styles.btnWrap} accessibilityRole="button">
            <LinearGradient
              colors={[...colors.gradient]}
              start={gradientDirection.diagonal.start}
              end={gradientDirection.diagonal.end}
              style={styles.btn}
            >
              <Text style={styles.btnText}>Update now</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 24 },
  card: { width: "100%", maxWidth: 420, borderWidth: 1, borderRadius: 20, padding: 24, alignItems: "center", gap: 12 },
  title: { fontSize: 20, fontWeight: "800", marginTop: 4 },
  sub: { fontSize: 13.5, lineHeight: 20, textAlign: "center" },
  btnWrap: { alignSelf: "stretch", marginTop: 8 },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  btnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
});
