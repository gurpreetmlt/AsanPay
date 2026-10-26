import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { Wrench, Plus, X } from "lucide-react-native";
import type { ApiResponse } from "@asanpay/shared-types";
import { ModalSheet } from "../../components/ModalSheet";
import { showAlert } from "../../components/AppAlert";
import { JsDateField, toYmd } from "../../components/DateRangeCard";
import { api } from "../../lib/api";
import { apiError } from "../../utils/apiError";
import { useTheme } from "../../theme/ThemeContext";
import { colors, gradientDirection } from "../../theme/colors";

interface RepairRow {
  id: string;
  serial: string;
  deviceType: string;
  issueType: string;
  status: "submitted" | "rma_issued" | "in_repair" | "resolved" | "rejected";
  rmaNumber: string | null;
  resolutionNote: string | null;
  submittedAt: string;
}

const STATUS_LABEL: Record<RepairRow["status"], string> = {
  submitted: "Submitted",
  rma_issued: "RMA issued",
  in_repair: "In repair",
  resolved: "Resolved",
  rejected: "Rejected",
};

const STATUS_COLOR: Record<RepairRow["status"], string> = {
  submitted: "#2563eb",
  rma_issued: "#7c3aed",
  in_repair: "#d97706",
  resolved: "#16a34a",
  rejected: "#dc2626",
};

const VENDORS = ["Mantra", "Morpho", "Startek", "Other"] as const;

const ISSUE_TYPES = [
  "Device not connecting",
  "Fingerprint not capturing",
  "Screen / display issue",
  "Physical damage",
  "RD Service error",
  "Other",
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Mirrors the web "Device Repair & Replacement" flow (apps/agent-portal/components/settings/
 * DeviceRepairRequests.tsx) — kept separate from Biometric Devices' de-register so repair
 * history stays apart from ordinary device swaps.
 */
export function DeviceRepairModal({ visible, onClose }: Props) {
  const { tokens } = useTheme();
  const [requests, setRequests] = useState<RepairRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [serial, setSerial] = useState("");
  const [vendor, setVendor] = useState<(typeof VENDORS)[number]>(VENDORS[0]);
  const [vendorOther, setVendorOther] = useState("");
  const [issueType, setIssueType] = useState<string>(ISSUE_TYPES[0]!);
  const [invoiceDateYmd, setInvoiceDateYmd] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<ApiResponse<RepairRow[]>>("/device-repair-requests");
      if (data.success) setRequests(data.data);
    } catch {
      // Non-fatal: an empty list with a load error still lets the agent submit a new request.
    }
  }

  useEffect(() => {
    if (visible) void load();
  }, [visible]);

  function resetForm() {
    setShowForm(false);
    setSerial("");
    setVendor(VENDORS[0]);
    setVendorOther("");
    setIssueType(ISSUE_TYPES[0]!);
    setInvoiceDateYmd("");
    setInvoiceNumber("");
    setRemarks("");
  }

  async function submit() {
    if (!serial.trim()) {
      showAlert("Serial required", "Enter the device serial number.");
      return;
    }
    if (remarks.trim().length < 5) {
      showAlert("Describe the issue", "At least 5 characters.");
      return;
    }
    setBusy(true);
    try {
      const vendorValue = vendor === "Other" ? vendorOther.trim() : vendor;
      await api.post("/device-repair-requests", {
        serial: serial.trim(),
        deviceType: "biometric_machine",
        vendor: vendorValue || undefined,
        issueType,
        invoiceDate: invoiceDateYmd || undefined,
        invoiceNumber: invoiceNumber.trim() || undefined,
        remarks: remarks.trim(),
      });
      resetForm();
      await load();
    } catch (err) {
      showAlert("Failed", apiError(err, "Could not submit repair request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalSheet visible={visible} title="Device Repair & Replacement" icon={<Wrench />} iconTone="amber" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sub, { color: tokens.sub }]}>
          Report a broken device separately from de-registering it.
        </Text>

        {requests === null ? (
          <ActivityIndicator style={{ marginTop: 16 }} color={colors.blueFlat} />
        ) : requests.length === 0 && !showForm ? (
          <Text style={[styles.sub, { color: tokens.sub, marginTop: 8 }]}>
            No repair requests yet.
          </Text>
        ) : (
          requests?.map((r) => (
            <View key={r.id} style={[styles.row, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Wrench size={18} color={colors.blueFlat} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.label, { color: tokens.txt }]}>
                  {r.serial} · {r.issueType}
                </Text>
                <Text style={[styles.sub, { color: tokens.sub }]}>
                  Submitted {new Date(r.submittedAt).toLocaleDateString()}
                  {r.rmaNumber ? ` · RMA ${r.rmaNumber}` : ""}
                </Text>
                {r.resolutionNote ? (
                  <Text style={[styles.sub, { color: tokens.sub, marginTop: 2 }]}>{r.resolutionNote}</Text>
                ) : null}
              </View>
              <Text style={[styles.statusPill, { color: STATUS_COLOR[r.status], backgroundColor: `${STATUS_COLOR[r.status]}18` }]}>
                {STATUS_LABEL[r.status]}
              </Text>
            </View>
          ))
        )}

        {!showForm ? (
          <Pressable onPress={() => setShowForm(true)} style={styles.addRow}>
            <Plus size={16} color={colors.blueFlat} />
            <Text style={styles.addText}>New request</Text>
          </Pressable>
        ) : (
          <View style={[styles.addForm, { borderColor: tokens.cardBorder }]}>
            <View style={styles.addFormHeader}>
              <Text style={[styles.label, { color: tokens.txt }]}>Create repair request</Text>
              <Pressable onPress={resetForm} hitSlop={8}>
                <X size={16} color={tokens.sub} />
              </Pressable>
            </View>

            <TextInput
              style={[styles.input, { borderColor: tokens.cardBorder, color: tokens.txt }]}
              value={serial}
              onChangeText={setSerial}
              placeholder="Device serial number"
              placeholderTextColor={colors.textLight}
            />

            <Text style={[styles.fieldLabel, { color: tokens.sub }]}>Device company</Text>
            <View style={styles.chipRow}>
              {VENDORS.map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setVendor(v)}
                  style={[
                    styles.chip,
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
                style={[styles.input, { borderColor: tokens.cardBorder, color: tokens.txt }]}
                value={vendorOther}
                onChangeText={setVendorOther}
                placeholder="Company name"
                placeholderTextColor={colors.textLight}
              />
            ) : null}

            <Text style={[styles.fieldLabel, { color: tokens.sub }]}>Issue type</Text>
            <View style={styles.chipRow}>
              {ISSUE_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setIssueType(t)}
                  style={[
                    styles.chip,
                    {
                      borderColor: issueType === t ? colors.blueFlat : tokens.cardBorder,
                      backgroundColor: issueType === t ? `${colors.blueFlat}14` : tokens.card,
                    },
                  ]}
                >
                  <Text style={{ color: tokens.txt, fontWeight: "700", fontSize: 12.5 }}>{t}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: tokens.sub }]}>Invoice date — optional</Text>
            <JsDateField
              valueYmd={invoiceDateYmd}
              placeholder="Select invoice date"
              maxYmd={toYmd(new Date())}
              onChange={setInvoiceDateYmd}
            />

            <TextInput
              style={[styles.input, { borderColor: tokens.cardBorder, color: tokens.txt }]}
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
              placeholder="Invoice number — optional"
              placeholderTextColor={colors.textLight}
            />

            <TextInput
              style={[styles.input, { borderColor: tokens.cardBorder, color: tokens.txt, height: 70 }]}
              value={remarks}
              onChangeText={setRemarks}
              multiline
              placeholder="Describe the issue"
              placeholderTextColor={colors.textLight}
            />

            <Pressable onPress={() => void submit()} disabled={busy}>
              <LinearGradient colors={[...colors.gradient]} style={styles.button} start={gradientDirection.diagonal.start} end={gradientDirection.diagonal.end}>
                <Text style={styles.buttonText}>{busy ? "Submitting…" : "Submit request"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 12 },
  sub: { fontSize: 12.5, fontWeight: "600" },
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
  statusPill: { fontSize: 11, fontWeight: "800", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, overflow: "hidden" },
  addRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, alignSelf: "flex-start" },
  addText: { fontSize: 13.5, fontWeight: "700", color: colors.blueFlat },
  addForm: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  addFormHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  button: { borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 6 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14.5 },
});
