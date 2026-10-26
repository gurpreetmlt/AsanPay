import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { PhoneCall } from "lucide-react-native";
import { fetchApi } from "../lib/api";
import { showAlert } from "./AppAlert";

/** Support helpline from admin Platform settings (`/support/contacts`). */
function telDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("91") && digits.length === 12 ? digits : `91${digits.slice(-10)}`;
}

function displayPhone(raw: string): string {
  const d = telDigits(raw);
  return d.length === 12 ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : raw.trim();
}

/** Header pill: phone icon + support number; tap opens the dialer. */
export function SupportCallButton() {
  const [phone, setPhone] = useState("");

  useEffect(() => {
    let mounted = true;
    void fetchApi<{ supportPhone?: string }>("/support/contacts")
      .then((c) => {
        if (mounted) setPhone((c.supportPhone ?? "").trim());
      })
      .catch(() => {
        /* pill still shows; tap explains */
      });
    return () => {
      mounted = false;
    };
  }, []);

  const digits = telDigits(phone);

  async function call() {
    if (!digits) {
      showAlert(
        "Support number not set",
        "The support phone number is not set yet. Raise a ticket from Support instead.",
      );
      return;
    }
    try {
      await Linking.openURL(`tel:+${digits}`);
    } catch {
      showAlert("Could not open dialer", `Call support on ${displayPhone(phone)}.`);
    }
  }

  return (
    <Pressable
      onPress={() => void call()}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={digits ? `Call support ${displayPhone(phone)}` : "Call support"}
    >
      <PhoneCall size={15} color="#fff" strokeWidth={2.2} />
      <Text style={styles.text} numberOfLines={1}>
        {digits ? displayPhone(phone) : "Help"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  pressed: { opacity: 0.7 },
  text: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
});
