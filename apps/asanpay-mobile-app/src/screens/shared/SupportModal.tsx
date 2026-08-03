import React, { useCallback, useEffect, useState } from "react";
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
import { api, fetchApi } from "../../lib/api";
import { showAlert } from "../../components/AppAlert";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: "open" | "resolved";
  resolutionNote: string | null;
  createdAt: string;
}

export function SupportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTickets(await fetchApi<Ticket[]>("/support/mine"));
    } catch (err) {
      showAlert("Error", (err as Error).message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  async function submit() {
    if (subject.trim().length < 3) {
      showAlert("Subject required", "Enter a subject with at least 3 characters");
      return;
    }
    if (description.trim().length < 10) {
      showAlert("Description required", "Describe the issue in at least 10 characters");
      return;
    }
    setSaving(true);
    try {
      await api.post("/support", { subject: subject.trim(), description: description.trim() });
      showAlert("Submitted", "Support ticket created");
      setSubject("");
      setDescription("");
      setShowForm(false);
      await load();
    } catch (err) {
      showAlert(
        "Error",
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Could not create ticket",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Text style={[styles.back, { color: colors.blueFlat }]}>Close</Text>
          </Pressable>
          <Text style={[styles.title, { color: tokens.txt }]}>Help & support</Text>
          <Pressable onPress={() => setShowForm((v) => !v)}>
            <Text style={[styles.back, { color: colors.blueFlat, textAlign: "right" }]}>
              {showForm ? "Cancel" : "New"}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {showForm ? (
              <View style={{ marginBottom: 16 }}>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt }]}
                  placeholder="Subject"
                  placeholderTextColor={tokens.mute}
                  value={subject}
                  onChangeText={setSubject}
                />
                <TextInput
                  style={[
                    styles.input,
                    styles.area,
                    { backgroundColor: tokens.card, borderColor: tokens.cardBorder, color: tokens.txt },
                  ]}
                  placeholder="Describe your issue"
                  placeholderTextColor={tokens.mute}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
                <Pressable
                  style={[styles.submit, { opacity: saving ? 0.6 : 1 }]}
                  onPress={() => void submit()}
                  disabled={saving}
                >
                  <Text style={styles.submitText}>{saving ? "Submitting…" : "Submit ticket"}</Text>
                </Pressable>
              </View>
            ) : null}

            {tickets.length === 0 ? (
              <Text style={{ color: tokens.sub }}>No support tickets yet.</Text>
            ) : (
              tickets.map((t) => (
                <View
                  key={t.id}
                  style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}
                >
                  <Text style={{ color: tokens.txt, fontWeight: "800" }}>{t.subject}</Text>
                  <Text style={{ color: tokens.mute, fontSize: 12, marginTop: 4 }}>
                    {t.status.toUpperCase()} · {new Date(t.createdAt).toLocaleString("en-IN")}
                  </Text>
                  <Text style={{ color: tokens.sub, marginTop: 8 }}>{t.description}</Text>
                  {t.resolutionNote ? (
                    <Text style={{ color: colors.greenDark, marginTop: 8 }}>Resolution: {t.resolutionNote}</Text>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        )}
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
  back: { fontWeight: "700", fontSize: 15, width: 56 },
  title: { fontSize: 18, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  area: { minHeight: 100, textAlignVertical: "top" },
  submit: {
    marginTop: 8,
    backgroundColor: colors.blue,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
