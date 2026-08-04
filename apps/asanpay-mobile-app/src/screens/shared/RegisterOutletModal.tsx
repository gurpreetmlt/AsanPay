import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Geolocation from "@react-native-community/geolocation";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { showAlert } from "../../components/AppAlert";
import { apiError } from "../../utils/apiError";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

type Gender = "M" | "F" | "T";

export function RegisterOutletModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    gender: "M" as Gender,
    pan: "",
    email: "",
    addressFull: "",
    city: "",
    pincode: "",
    aadhaarNumber: "",
    dateOfBirth: "",
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    if (!visible || !user) return;
    setForm((f) => ({
      ...f,
      name: user.name || "",
      mobile: user.mobile || "",
      email: user.email || "",
    }));
  }, [visible, user]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function captureLocation() {
    Geolocation.getCurrentPosition(
      (pos) => {
        setField("latitude", pos.coords.latitude.toFixed(6));
        setField("longitude", pos.coords.longitude.toFixed(6));
        showAlert("Location captured", "Outlet geo updated from GPS.");
      },
      (err) => showAlert("Location failed", err.message || "Allow location access before continuing"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }

  async function submit() {
    if (saving) return;
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showAlert("Location required", "Allow location access before continuing");
      return;
    }
    if (form.mobile.replace(/\D/g, "").length !== 10) {
      showAlert("Invalid mobile", "Enter a valid 10-digit mobile");
      return;
    }
    if (form.aadhaarNumber.replace(/\D/g, "").length !== 12) {
      showAlert("Invalid Aadhaar", "Aadhaar must be 12 digits");
      return;
    }
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(form.pan.toUpperCase())) {
      showAlert("Invalid PAN", "Enter a valid PAN (e.g. ABCDE1234F)");
      return;
    }
    if (!form.email.trim()) {
      showAlert("Email required", "Enter outlet email");
      return;
    }

    setSaving(true);
    try {
      await api.post("/onboarding/instantpay", {
        mobile: form.mobile.replace(/\D/g, "").slice(0, 10),
        name: form.name.trim(),
        gender: form.gender,
        pan: form.pan.toUpperCase(),
        email: form.email.trim(),
        address: {
          full: form.addressFull.trim(),
          city: form.city.trim(),
          pincode: form.pincode.replace(/\D/g, "").slice(0, 6),
        },
        aadhaarNumber: form.aadhaarNumber.replace(/\D/g, ""),
        dateOfBirth: form.dateOfBirth,
        latitude: lat,
        longitude: lng,
      });
      const { data } = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (data.success) updateUser(data.data.user);
      showAlert("Outlet registered", "Complete biometric KYC next from Account settings.");
      onClose();
    } catch (err) {
      showAlert("Outlet registration failed", apiError(err, "Could not register outlet"));
    } finally {
      setSaving(false);
    }
  }

  const input = (label: string, key: keyof typeof form, props?: object) => (
    <View style={styles.field} key={key}>
      <Text style={[styles.label, { color: tokens.sub }]}>{label}</Text>
      <TextInput
        style={[styles.input, { color: tokens.txt, borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
        value={String(form[key])}
        onChangeText={(t) => setField(key, t as (typeof form)[typeof key])}
        placeholderTextColor={tokens.mute}
        {...props}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.txt }]}>Register outlet</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.hint, { color: tokens.sub }]}>
            InstantPay Min-KYC — Aadhaar-linked mobile, PAN-matching name and DOB.
          </Text>
          {input("Full name (PAN)", "name")}
          {input("Mobile (Aadhaar-linked)", "mobile", {
            keyboardType: "number-pad",
            maxLength: 10,
          })}
          {input("Email", "email", { keyboardType: "email-address", autoCapitalize: "none" })}
          {input("PAN", "pan", { autoCapitalize: "characters", maxLength: 10 })}
          {input("Aadhaar", "aadhaarNumber", { keyboardType: "number-pad", maxLength: 12 })}
          {input("Date of birth (YYYY-MM-DD)", "dateOfBirth", { placeholder: "1990-01-15" })}
          {input("Address", "addressFull")}
          {input("City", "city")}
          {input("Pincode", "pincode", { keyboardType: "number-pad", maxLength: 6 })}

          <Text style={[styles.label, { color: tokens.sub }]}>Gender</Text>
          <View style={styles.genderRow}>
            {(["M", "F", "T"] as Gender[]).map((g) => (
              <Pressable
                key={g}
                onPress={() => setField("gender", g)}
                style={[
                  styles.genderBtn,
                  {
                    borderColor: form.gender === g ? colors.blueFlat : tokens.cardBorder,
                    backgroundColor: form.gender === g ? `${colors.blueFlat}14` : tokens.card,
                  },
                ]}
              >
                <Text style={{ color: tokens.txt, fontWeight: "600" }}>
                  {g === "M" ? "Male" : g === "F" ? "Female" : "Transgender"}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={[styles.secondaryBtn, { borderColor: tokens.cardBorder }]} onPress={captureLocation}>
            <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Use current location</Text>
          </Pressable>
          {input("Latitude", "latitude", { keyboardType: "decimal-pad" })}
          {input("Longitude", "longitude", { keyboardType: "decimal-pad" })}

          <Pressable
            style={[styles.primaryBtn, { opacity: saving ? 0.6 : 1 }]}
            disabled={saving}
            onPress={() => void submit()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Register on InstantPay</Text>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 40, gap: 4 },
  hint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  field: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  genderRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  genderBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: colors.blueFlat,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
