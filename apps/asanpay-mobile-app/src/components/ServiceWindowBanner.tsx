import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Moon } from "lucide-react-native";
import { fetchApi } from "../lib/api";

type ServiceWindow = {
  closedNow: boolean;
  endLabel: string;
  message: string | null;
  openGroups: string[];
};

const GROUP_LABEL: Record<string, string> = {
  aeps: "AePS",
  dmt: "Money transfer",
  bbps: "Bill payments",
  recharge: "Recharge",
  cms: "CMS",
};

/** Night service window: shown on the retailer home while counter services are closed (server clock). */
export function ServiceWindowBanner() {
  const [win, setWin] = useState<ServiceWindow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchApi<ServiceWindow>("/account/service-window")
        .then((w) => {
          if (!cancelled) setWin(w);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!win?.closedNow) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Moon size={18} color="#3730A3" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.badge}>OPENS AT {win.endLabel}</Text>
        <Text style={styles.title}>Services are closed for the night</Text>
        <Text style={styles.body}>
          {win.message} You can still use the app — wallet, transfers, fund requests and reports work as usual.
        </Text>
        {win.openGroups.length ? (
          <Text style={styles.open}>Open for you tonight: {win.openGroups.map((g) => GROUP_LABEL[g] ?? g).join(", ")}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#E0E7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#3730A3",
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 4,
  },
  title: { color: "#312E81", fontSize: 13, fontWeight: "800" },
  body: { color: "#4338CA", fontSize: 11, marginTop: 2, lineHeight: 15 },
  open: { color: "#15803D", fontSize: 11, fontWeight: "800", marginTop: 4 },
});
