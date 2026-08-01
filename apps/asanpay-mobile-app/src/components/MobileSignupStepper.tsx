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

export const MOBILE_SIGNUP_STEPS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "mobile", label: "Mobile Verification", icon: Phone },
  { id: "role", label: "Role Identification", icon: UserRound },
  { id: "pan", label: "PAN Verification", icon: CreditCard },
  { id: "aadhaar", label: "Aadhaar Verification", icon: Fingerprint },
  { id: "basic", label: "Basic Details & Email Verification", icon: Settings2 },
  { id: "business", label: "Business Details", icon: Store },
  { id: "bank", label: "Bank Details", icon: FileText },
  { id: "images", label: "Business Images", icon: Camera },
  { id: "agreement", label: "Agreement", icon: ScrollText },
];

export function MobileSignupStepper({ currentIndex }: { currentIndex: number }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {MOBILE_SIGNUP_STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = i < currentIndex;
          const active = i === currentIndex;
          const bg = done ? colors.green : active ? colors.blue : "transparent";
          const border = done || active ? bg : "#C5D0F0";
          const iconColor = done || active ? "#fff" : "#8FA2E0";
          return (
            <React.Fragment key={step.id}>
              <View style={[styles.dot, { backgroundColor: done || active ? bg : "#fff", borderColor: border }]}>
                <Icon size={12} color={iconColor} strokeWidth={2.2} />
              </View>
              {i < MOBILE_SIGNUP_STEPS.length - 1 ? (
                <View style={[styles.line, { backgroundColor: i < currentIndex ? colors.green : "#D8E0F5" }]} />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
      <Text style={styles.caption}>
        Step {Math.min(currentIndex + 1, MOBILE_SIGNUP_STEPS.length)} of {MOBILE_SIGNUP_STEPS.length}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12, paddingHorizontal: 2 },
  row: { flexDirection: "row", alignItems: "center" },
  caption: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    color: "#8FA2E0",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { flex: 1, height: 2, marginHorizontal: 1, minWidth: 4 },
});
