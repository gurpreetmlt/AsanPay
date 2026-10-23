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
import { StatePickerField } from "../../components/StatePickerField";
import { apiError } from "../../utils/apiError";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

export function NobleAgentOnboardModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    mobileNumber: "",
    email: "",
    panNumber: "",
    aadhaarNumber: "",
    dob: "",
    agentAddress: "",
    agentStateCode: "",
    agentCity: "",
    agentPinCode: "",
    agentBankName: "",
    agentBankAccountNumber: "",
    agentBankIFSC: "",
    shopName: "",
    shopAddress: "",
    shopStateCode: "",
    shopCity: "",
    shopPinCode: "",
    shopLatitude: "",
    shopLongitude: "",
  });

  useEffect(() => {
    if (!visible || !user) return;
    const parts = user.name.trim().split(/\s+/);
    setForm((f) => ({
      ...f,
      firstName: parts[0] || "",
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
      mobileNumber: user.mobile || "",
      email: user.email || "",
    }));
  }, [visible, user]);

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function captureLocation() {
    Geolocation.getCurrentPosition(
      (pos) => {
        setField("shopLatitude", pos.coords.latitude.toFixed(4));
        setField("shopLongitude", pos.coords.longitude.toFixed(4));
        showAlert("Location captured", "Shop geo updated from GPS.");
      },
      (err) => showAlert("Location failed", err.message || "Allow location access before continuing"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }

  async function submit() {
    if (saving) return;
    const lat = Number(form.shopLatitude);
    const lng = Number(form.shopLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showAlert("Location required", "Allow location access before continuing");
      return;
    }
    if (form.mobileNumber.replace(/\D/g, "").length !== 10) {
      showAlert("Invalid mobile", "Enter a valid 10-digit mobile");
      return;
    }
    if (form.aadhaarNumber.replace(/\D/g, "").length !== 12) {
      showAlert("Invalid Aadhaar", "Aadhaar must be 12 digits");
      return;
    }
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(form.panNumber.toUpperCase())) {
      showAlert("Invalid PAN", "Enter a valid PAN (e.g. ABCDE1234F)");
      return;
    }
    if (!form.email.trim()) {
      showAlert("Email required", "Enter a valid email");
      return;
    }
    if (!form.agentStateCode) {
      showAlert("State required", "Select the state of your residential address");
      return;
    }
    if (!form.shopStateCode) {
      showAlert("Shop state required", "Select the state of your shop address");
      return;
    }

    setSaving(true);
    try {
      await api.post("/onboarding/noble", {
        channel: "APP",
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim(),
        lastName: form.lastName.trim(),
        mobileNumber: form.mobileNumber.replace(/\D/g, "").slice(0, 10),
        email: form.email.trim(),
        panNumber: form.panNumber.toUpperCase().trim(),
        aadhaarNumber: form.aadhaarNumber.replace(/\D/g, ""),
        dob: form.dob.trim(),
        agentAddress: form.agentAddress.trim(),
        agentStateCode: form.agentStateCode.toUpperCase().trim(),
        agentCity: form.agentCity.trim(),
        agentPinCode: form.agentPinCode.replace(/\D/g, "").slice(0, 6),
        agentBankName: form.agentBankName.trim(),
        agentBankAccountNumber: form.agentBankAccountNumber.replace(/\D/g, ""),
        agentBankIFSC: form.agentBankIFSC.toUpperCase().trim(),
        shopName: form.shopName.trim(),
        shopAddress: form.shopAddress.trim(),
        shopStateCode: form.shopStateCode.toUpperCase().trim(),
        shopCity: form.shopCity.trim(),
        shopPinCode: form.shopPinCode.replace(/\D/g, "").slice(0, 6),
        shopLatitude: lat,
        shopLongitude: lng,
        isPhysicalVerified: "YES",
      });
      const { data } = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (data.success) updateUser(data.data.user);
      showAlert("Onboarding complete", "AEPS agent onboarding saved. You can use AEPS services next.");
      onClose();
    } catch (err) {
      showAlert("Onboarding failed", apiError(err, "Could not complete AEPS agent onboarding"));
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
        onChangeText={(t) => setField(key, t)}
        placeholderTextColor={tokens.mute}
        {...props}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.txt }]}>AEPS agent onboarding</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.hint, { color: tokens.sub }]}>
            One-time setup for AEPS, Aadhaar Pay, Cash Deposit, and UPI QR.
          </Text>
          {input("First name", "firstName")}
          {input("Middle name", "middleName")}
          {input("Last name", "lastName")}
          {input("Mobile", "mobileNumber", { keyboardType: "number-pad", maxLength: 10 })}
          {input("Email", "email", { keyboardType: "email-address", autoCapitalize: "none" })}
          {input("PAN", "panNumber", { autoCapitalize: "characters", maxLength: 10 })}
          {input("Aadhaar", "aadhaarNumber", { keyboardType: "number-pad", maxLength: 12 })}
          {input("Date of birth (DD-MM-YYYY)", "dob", { placeholder: "20-10-1985" })}
          {input("Residential address", "agentAddress")}
          <StatePickerField
            label="State"
            value={form.agentStateCode}
            onChange={(code) => setField("agentStateCode", code)}
          />
          {input("City", "agentCity")}
          {input("PIN", "agentPinCode", { keyboardType: "number-pad", maxLength: 6 })}
          {input("Bank name", "agentBankName")}
          {input("Bank account", "agentBankAccountNumber", { keyboardType: "number-pad" })}
          {input("IFSC", "agentBankIFSC", { autoCapitalize: "characters", maxLength: 11 })}
          {input("Shop name", "shopName")}
          {input("Shop address", "shopAddress")}
          <StatePickerField
            label="Shop state"
            value={form.shopStateCode}
            onChange={(code) => setField("shopStateCode", code)}
          />
          {input("Shop city", "shopCity")}
          {input("Shop PIN", "shopPinCode", { keyboardType: "number-pad", maxLength: 6 })}

          <Pressable style={[styles.secondaryBtn, { borderColor: tokens.cardBorder }]} onPress={captureLocation}>
            <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Use current location</Text>
          </Pressable>
          {input("Latitude", "shopLatitude", { keyboardType: "decimal-pad" })}
          {input("Longitude", "shopLongitude", { keyboardType: "decimal-pad" })}

          <Pressable
            style={[styles.primaryBtn, { opacity: saving ? 0.6 : 1 }]}
            disabled={saving}
            onPress={() => void submit()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Submit onboarding</Text>
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
