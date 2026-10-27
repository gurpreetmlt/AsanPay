import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, Home, MapPin, RefreshCw, Store } from "lucide-react-native";
import { captureSignupLocation } from "../lib/geoCapture";
import type { SignupGeoFix } from "../lib/signupDraft";
import { useTheme } from "../theme/ThemeContext";
import { colors } from "../theme/colors";

type Place = "home" | "shop";

const COPY: Record<Place, { title: string; hint: string }> = {
  home: {
    title: "Home location",
    hint: "Capture this while you are at home. Services also work near your home location.",
  },
  shop: {
    title: "Shop location",
    hint: "Stand inside your shop while capturing the location. Services work only near this location.",
  },
};

/** Signup shop / home GPS: "Fetch location" → high-accuracy, mock-checked fix (±150 m max). */
export function SignupLocationCard({
  place,
  value,
  onChange,
}: {
  place: Place;
  value: SignupGeoFix | null;
  onChange: (fix: SignupGeoFix) => void;
}) {
  const { tokens } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[place];
  const Icon = place === "shop" ? Store : Home;

  async function fetchLocation() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await captureSignupLocation(place));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Location is not available. Turn on GPS and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { borderColor: tokens.cardBorder, backgroundColor: tokens.softBlue }]}>
      <View style={styles.head}>
        <View style={[styles.iconTile, { backgroundColor: value ? colors.greenBg : colors.bluePale }]}>
          <Icon size={20} color={value ? colors.greenDark : colors.blueLight} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: tokens.txt }]}>
            {copy.title} <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <Text style={[styles.hint, { color: tokens.sub }]}>{copy.hint}</Text>
        </View>
      </View>

      {value ? (
        <View style={styles.doneRow}>
          <CheckCircle2 size={18} color={colors.greenDark} />
          <Text style={styles.doneText}>Location captured ✓ · accuracy {value.accuracyMeters} m</Text>
          <Pressable onPress={() => void fetchLocation()} disabled={busy} hitSlop={8} style={styles.againBtn}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.blueFlat} />
            ) : (
              <>
                <RefreshCw size={14} color={colors.blueFlat} />
                <Text style={styles.againText}>Fetch again</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => void fetchLocation()}
          disabled={busy}
          style={[styles.fetchBtn, { opacity: busy ? 0.7 : 1 }]}
          accessibilityRole="button"
        >
          {busy ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.fetchText}>Getting accurate location…</Text>
            </>
          ) : (
            <>
              <MapPin size={16} color="#fff" />
              <Text style={styles.fetchText}>Fetch location</Text>
            </>
          )}
        </Pressable>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 16, padding: 14, marginTop: 10, marginBottom: 6, gap: 10 },
  head: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  iconTile: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "800" },
  hint: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  doneText: { flex: 1, color: colors.greenDark, fontSize: 13, fontWeight: "700" },
  againBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  againText: { color: colors.blueFlat, fontSize: 12, fontWeight: "800" },
  fetchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.blueFlat,
    borderRadius: 14,
    paddingVertical: 12,
  },
  fetchText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  error: { color: colors.danger, fontSize: 12, fontWeight: "700" },
});
