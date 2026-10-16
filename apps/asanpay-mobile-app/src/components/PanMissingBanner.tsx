import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, ChevronRight } from "lucide-react-native";
import { fetchApi } from "../lib/api";

interface TdsSummary {
  totalTds: string;
  creditCount?: number;
  hasPan: boolean;
}

/** TCR11 — shown when commission TDS applies this month and no PAN is on file. */
export function PanMissingBanner({ onPress }: { onPress: () => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchApi<TdsSummary>("/earnings/tds-summary")
      .then((s) => {
        if (alive) setShow(!s.hasPan && (Number(s.totalTds) > 0 || (s.creditCount ?? 0) > 0));
      })
      .catch(() => {
        /* non-blocking */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  return (
    <Pressable onPress={onPress} style={styles.banner} accessibilityRole="button">
      <AlertTriangle size={20} color="#EA580C" strokeWidth={2.2} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>PAN missing</Text>
        <Text style={styles.sub}>Add PAN under Profile / KYC so TDS can be reported correctly.</Text>
      </View>
      <ChevronRight size={16} color="#C2410C" strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
  },
  title: { fontSize: 14, fontWeight: "800", color: "#C2410C" },
  sub: { fontSize: 12, fontWeight: "600", color: "#9A3412", lineHeight: 17 },
});
