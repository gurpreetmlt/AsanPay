import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Fingerprint, Plus, X, AlertTriangle, Calendar } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { ModalSheet } from "../../components/ModalSheet";
import { PinInput } from "../../components/PinInput";
import { showAlert } from "../../components/AppAlert";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";

interface DeviceRow {
  id: string;
  serial: string;
  vendor: string | null;
  model: string | null;
  rdLicenseExpiry: string | null;
  invoiceNumber: string | null;
  registeredAt: string;
}

const MAX_DEVICES = 3; // mirrors backend MAX_AGENT_DEVICES default; server is the source of truth
const VENDORS = ["Mantra", "Morpho", "Startek", "Other"] as const;

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * The UIDAI L1 scanner registry — separate from TrustedDevicesModal, which is app-login
 * sessions. Self-service: OTP to the registered mobile, then register or de-register.
 * Serial should come from the RD Service INFO response where the native RD integration exposes
 * it (see docs/DEVICE_REQUIREMENTS.md); manual entry here is the fallback path.
 */
export function BiometricDevicesModal({ visible, onClose }: Props) {
  const { tokens } = useTheme();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [serial, setSerial] = useState("");
  const [vendor, setVendor] = useState<(typeof VENDORS)[number]>(VENDORS[0]);
  const [vendorOther, setVendorOther] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date | null>(null);
  const [showInvoiceDatePicker, setShowInvoiceDatePicker] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<DeviceRow[]>>("/devices");
      if (data.success) setDevices(data.data);
    } catch {
      // Non-fatal: an empty list with a load error still lets the agent try to add a device.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) void load();
  }, [visible]);

  function resetForm() {
    setShowAdd(false);
    setOtpSent(false);
    setOtp("");
    setSerial("");
    setVendor(VENDORS[0]);
    setVendorOther("");
    setInvoiceDate(null);
    setInvoiceNumber("");
    setRemarks("");
  }

  async function requestOtp() {
    if (!serial.trim()) {
      showAlert("Serial required", "Enter the device serial number.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/devices/otp");
      setOtpSent(true);
    } catch (err) {
      showAlert("Failed", apiError(err, "Could not send OTP"));
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (otp.length !== 6) {
      showAlert("Invalid OTP", "Enter the 6-digit OTP.");
      return;
    }
    setBusy(true);
    try {
      const vendorValue = vendor === "Other" ? vendorOther.trim() : vendor;
      await api.post("/devices", {
        serial: serial.trim(),
        vendor: vendorValue || undefined,
        invoiceDate: invoiceDate ? isoDateOnly(invoiceDate) : undefined,
        invoiceNumber: invoiceNumber.trim() || undefined,
        remarks: remarks.trim() || undefined,
        otp,
      });
      resetForm();
      await load();
    } catch (err) {
      // DEVICE_LIMIT_REACHED and DEVICE_IN_USE are expected outcomes, not bugs — the API
      // message already says what to do (de-register one, or ask the other agent to).
      showAlert("Registration failed", apiError(err, "Could not register device"));
    } finally {
      setBusy(false);
    }
  }

  async function deregister(id: string) {
    setBusy(true);
    try {
      await api.delete(`/devices/${id}`, { data: { reason: "Removed from app" } });
      setDevices((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      showAlert("Failed", apiError(err, "Could not de-register device"));
    } finally {
      setBusy(false);
    }
  }

  const atLimit = devices.length >= MAX_DEVICES;

  return (
    <ModalSheet visible={visible} title="Biometric Devices" onClose={onClose}>
      <Text style={[modalStyles.sub, { color: tokens.sub }]}>
        Up to {MAX_DEVICES} devices can be registered at a time.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.blueFlat} />
      ) : devices.length === 0 && !showAdd ? (
        <Text style={[modalStyles.sub, { color: tokens.sub, marginTop: 8 }]}>
          No biometric devices registered yet.
        </Text>
      ) : (
        devices.map((d) => {
          const expiryDays = daysUntil(d.rdLicenseExpiry);
          const expirySoon = expiryDays !== null && expiryDays <= 15;
          return (
            <View
              key={d.id}
              style={[
                modalStyles.row,
                { backgroundColor: tokens.card, borderColor: expirySoon ? "#F59E0B" : tokens.cardBorder },
              ]}
            >
              <Fingerprint size={18} color={colors.blueFlat} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[modalStyles.label, { color: tokens.txt }]}>
                  {d.vendor ?? "Device"} · {d.serial}
                </Text>
                {expiryDays !== null && (
                  <View style={modalStyles.expiryRow}>
                    {expirySoon && <AlertTriangle size={11} color="#B45309" />}
                    <Text style={[modalStyles.sub, { color: expirySoon ? "#B45309" : tokens.sub }]}>
                      {expiryDays < 0
                        ? "RD licence expired"
                        : `RD licence expires in ${expiryDays}d`}
                    </Text>
                  </View>
                )}
              </View>
              <Pressable onPress={() => void deregister(d.id)} disabled={busy} hitSlop={8}>
                <Text style={modalStyles.remove}>De-register</Text>
              </Pressable>
            </View>
          );
        })
      )}

      {!showAdd ? (
        <Pressable onPress={() => setShowAdd(true)} style={modalStyles.addRow}>
          <Plus size={16} color={colors.blueFlat} />
          <Text style={modalStyles.addText}>Add device</Text>
        </Pressable>
      ) : atLimit ? (
        <Text style={[modalStyles.sub, { color: "#B45309", marginTop: 12 }]}>
          You already have {MAX_DEVICES} devices registered. De-register one before adding
          another.
        </Text>
      ) : (
        <View style={[modalStyles.addForm, { borderColor: tokens.cardBorder }]}>
          <View style={modalStyles.addFormHeader}>
            <Text style={[modalStyles.label, { color: tokens.txt }]}>Register new device</Text>
            <Pressable onPress={resetForm} hitSlop={8}>
              <X size={16} color={tokens.sub} />
            </Pressable>
          </View>

          <TextInput
            style={[modalStyles.input, { borderColor: tokens.cardBorder, color: tokens.txt }]}
            value={serial}
            onChangeText={setSerial}
            editable={!otpSent}
            placeholder="Device serial number"
            placeholderTextColor={colors.textLight}
          />

          <Text style={[modalStyles.fieldLabel, { color: tokens.sub }]}>Device company</Text>
          <View style={modalStyles.chipRow}>
            {VENDORS.map((v) => (
              <Pressable
                key={v}
                onPress={() => !otpSent && setVendor(v)}
                style={[
                  modalStyles.chip,
                  {
                    borderColor: vendor === v ? colors.blueFlat : tokens.cardBorder,
                    backgroundColor: vendor === v ? `${colors.blueFlat}14` : tokens.card,
                  },
                ]}
              >
                <Text style={{ color: tokens.txt, fontWeight: "700", fontSize: 12.5 }}>{v}</Text>
              </Pressable>
            ))}
          </View>
          {vendor === "Other" ? (
            <TextInput
              style={[modalStyles.input, { borderColor: tokens.cardBorder, color: tokens.txt }]}
              value={vendorOther}
              onChangeText={setVendorOther}
              editable={!otpSent}
              placeholder="Company name"
              placeholderTextColor={colors.textLight}
            />
          ) : null}

          <Text style={[modalStyles.fieldLabel, { color: tokens.sub }]}>Invoice date — optional</Text>
          <Pressable
            onPress={() => !otpSent && setShowInvoiceDatePicker(true)}
            style={[
              modalStyles.input,
              { borderColor: tokens.cardBorder, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
            ]}
          >
            <Text style={{ color: invoiceDate ? tokens.txt : colors.textLight, fontSize: 14 }}>
              {invoiceDate ? isoDateOnly(invoiceDate) : "Select invoice date"}
            </Text>
            <Calendar size={16} color={tokens.sub} />
          </Pressable>
          {showInvoiceDatePicker ? (
            <DateTimePicker
              value={invoiceDate ?? new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              maximumDate={new Date()}
              onChange={(event: DateTimePickerEvent, date?: Date) => {
                if (Platform.OS === "android") setShowInvoiceDatePicker(false);
                if (event.type === "dismissed") return;
                if (date) setInvoiceDate(date);
                if (Platform.OS === "ios" && event.type === "set") setShowInvoiceDatePicker(false);
              }}
            />
          ) : null}

          <TextInput
            style={[modalStyles.input, { borderColor: tokens.cardBorder, color: tokens.txt }]}
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
            editable={!otpSent}
            placeholder="Invoice number — optional"
            placeholderTextColor={colors.textLight}
          />
          <TextInput
            style={[modalStyles.input, { borderColor: tokens.cardBorder, color: tokens.txt, height: 70 }]}
            value={remarks}
            onChangeText={setRemarks}
            editable={!otpSent}
            multiline
            placeholder="Remarks — optional"
            placeholderTextColor={colors.textLight}
          />

          {!otpSent ? (
            <Pressable onPress={() => void requestOtp()} disabled={busy}>
              <LinearGradient colors={[...colors.gradient]} style={modalStyles.button}>
                <Text style={modalStyles.buttonText}>{busy ? "Sending…" : "Send OTP"}</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <>
              <PinInput length={6} value={otp} onChange={setOtp} autoFocus />
              <Pressable onPress={() => void register()} disabled={busy || otp.length !== 6}>
                <LinearGradient colors={[...colors.gradient]} style={modalStyles.button}>
                  <Text style={modalStyles.buttonText}>{busy ? "Registering…" : "Confirm & Register"}</Text>
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      )}
    </ModalSheet>
  );
}

const modalStyles = StyleSheet.create({
  sub: { fontSize: 12.5, fontWeight: "600" },
  fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  label: { fontSize: 14, fontWeight: "700" },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  remove: { fontSize: 12.5, fontWeight: "800", color: "#DC2626" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    alignSelf: "flex-start",
  },
  addText: { fontSize: 13.5, fontWeight: "700", color: colors.blueFlat },
  addForm: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  addFormHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  button: { borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 6 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14.5 },
});
