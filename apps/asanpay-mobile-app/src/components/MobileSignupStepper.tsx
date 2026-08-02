import React from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  Phone,
  UserRound,
  CreditCard,
  Fingerprint,
  Settings2,
  Store,
  FileText,
  Camera,
  ScrollText,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "../theme/colors";

export const MOBILE_SIGNUP_STEPS: { id: string; label: string; short: string; icon: LucideIcon }[] = [
  { id: "mobile", label: "Mobile Verification", short: "Mobile", icon: Phone },
  { id: "role", label: "Role Identification", short: "Role", icon: UserRound },
  { id: "pan", label: "PAN Details", short: "PAN", icon: CreditCard },
  { id: "aadhaar", label: "Aadhaar Verification", short: "Aadhaar", icon: Fingerprint },
  { id: "basic", label: "Basic Details & Email", short: "Details", icon: Settings2 },
  { id: "business", label: "Business Details", short: "Business", icon: Store },
  { id: "bank", label: "Bank Details", short: "Bank", icon: FileText },
  { id: "images", label: "Business Images", short: "Photos", icon: Camera },
  { id: "agreement", label: "Agreement", short: "Agree", icon: ScrollText },
];

/** Show only a 3-step window (prev / current / next) — avoids the cramped 9-icon line. */
export function MobileSignupStepper({ currentIndex }: { currentIndex: number }) {
  const total = MOBILE_SIGNUP_STEPS.length;
  const idx = Math.max(0, Math.min(currentIndex, total - 1));
  const progress = ((idx + 1) / total) * 100;

  let start = Math.max(0, idx - 1);
  let end = Math.min(total - 1, start + 2);
  start = Math.max(0, end - 2);
  const visible = MOBILE_SIGNUP_STEPS.slice(start, end + 1).map((step, offset) => ({
    ...step,
    index: start + offset,
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.caption}>
          Step {idx + 1} of {total}
        </Text>
        <Text style={styles.currentLabel} numberOfLines={1}>
          {MOBILE_SIGNUP_STEPS[idx]?.short}
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress}%` }]} />
      </View>

      <View style={styles.row}>
        {visible.map((step, i) => {
          const Icon = step.icon;
          const done = step.index < idx;
          const active = step.index === idx;
          const bg = done ? colors.green : active ? colors.blue : "#EEF2FF";
          const iconColor = done || active ? "#fff" : "#8FA2E0";
          return (
            <React.Fragment key={step.id}>
              {i > 0 ? (
                <View style={[styles.line, { backgroundColor: step.index <= idx ? colors.green : "#D8E0F5" }]} />
              ) : null}
              <View style={styles.item}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: bg,
                      borderColor: active ? colors.blue : done ? colors.green : "#C5D0F0",
                      transform: [{ scale: active ? 1.08 : 1 }],
                    },
                  ]}
                >
                  <Icon size={14} color={iconColor} strokeWidth={2.4} />
                </View>
                <Text
                  style={[styles.itemLabel, { color: active ? colors.blue : done ? colors.greenDark : "#8FA2E0" }]}
                  numberOfLines={1}
                >
                  {step.short}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  caption: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.blueFlat,
    letterSpacing: 0.2,
  },
  currentLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5A6DA8",
    maxWidth: "55%",
  },
  track: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E4EAFB",
    overflow: "hidden",
    marginBottom: 12,
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.green,
  },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  item: { alignItems: "center", width: 72 },
  itemLabel: { marginTop: 6, fontSize: 11, fontWeight: "700" },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { flex: 1, height: 3, marginTop: 16, marginHorizontal: 4, borderRadius: 2 },
});
