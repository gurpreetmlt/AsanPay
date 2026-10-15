import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle2 } from "lucide-react-native";
import { api } from "../lib/api";
import { apiError } from "../utils/apiError";
import { useTheme } from "../theme/ThemeContext";
import { colors } from "../theme/colors";
import { showAlert } from "../components/AppAlert";
import { BrandMark } from "../components/BrandMark";

type PartnerRole = "distributor" | "super_distributor";

const ROLE_OPTIONS: { value: PartnerRole; label: string }[] = [
  { value: "distributor", label: "Distributor" },
  { value: "super_distributor", label: "Super Distributor" },
];

interface Props {
  initialRole?: PartnerRole;
  onBack: () => void;
  onRetailerSignup: () => void;
}

type Form = { name: string; mobile: string; email: string; city: string; state: string; message: string };

function validate(f: Form): string | null {
  if (!f.name.trim()) return "Enter your full name";
  if (!/^[6-9]\d{9}$/.test(f.mobile)) return "Enter a valid 10-digit mobile";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "Enter a valid email address";
  if (!f.city.trim()) return "Enter your city";
  if (!f.state.trim()) return "Enter your state";
  if (!f.message.trim()) return "Tell us about your business (network size, area, current services)";
  return null;
}

export function PartnerEnquiryScreen({ initialRole = "distributor", onBack, onRetailerSignup }: Props) {
  const { tokens, scheme } = useTheme();
  const [role, setRole] = useState<PartnerRole>(initialRole);
  const [form, setForm] = useState<Form>({ name: "", mobile: "", email: "", city: "", state: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const inputStyle = [
    styles.input,
    { backgroundColor: tokens.inputBg, borderColor: tokens.inputBorder, color: tokens.txt2 },
  ];
  const label = (text: string) => (
    <Text style={[styles.label, { color: tokens.mute }]}>
      {text} <Text style={{ color: colors.danger }}>*</Text>
    </Text>
  );

  async function submit() {
    const err = validate(form);
    if (err) {
      showAlert("Check the form", err);
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/partner-enquiry", { role, ...form });
      setSent(true);
    } catch (e) {
      showAlert("Enquiry not sent", apiError(e, "Your enquiry could not be sent. Please try again in a few minutes."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={[styles.backBtn, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}>
            <ArrowLeft size={18} color={colors.blueFlat} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: tokens.txt }]}>Become a partner</Text>
            <Text style={[styles.sub, { color: tokens.sub }]}>Accounts are opened by our team</Text>
          </View>
          <BrandMark size={40} variant="mark" light={scheme === "dark"} />
        </View>

        {sent ? (
          <View style={styles.done}>
            <CheckCircle2 size={52} color={colors.green} />
            <Text style={[styles.doneTitle, { color: tokens.txt }]}>Enquiry sent</Text>
            <Text style={[styles.doneSub, { color: tokens.sub }]}>
              Thank you. Our team will contact you soon on {form.mobile}.
            </Text>
            <Pressable onPress={onBack} style={[styles.submit, { marginTop: 20, alignSelf: "stretch" }]}>
              <Text style={styles.submitText}>Back to login</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {label("I want to become")}
            <View style={styles.chipRow}>
              {ROLE_OPTIONS.map((r) => (
                <Pressable
                  key={r.value}
                  onPress={() => setRole(r.value)}
                  style={[
                    styles.chip,
                    {
                      borderColor: role === r.value ? colors.blue : tokens.cardBorder,
                      backgroundColor: role === r.value ? `${colors.blue}14` : tokens.card,
                    },
                  ]}
                >
                  <Text style={{ color: tokens.txt2, fontWeight: "700", fontSize: 13 }}>{r.label}</Text>
                </Pressable>
              ))}
            </View>

            {label("Full name")}
            <TextInput value={form.name} onChangeText={set("name")} placeholder="Your full name" placeholderTextColor={tokens.mute} style={inputStyle} />
            {label("Mobile")}
            <TextInput
              value={form.mobile}
              onChangeText={(t) => set("mobile")(t.replace(/\D/g, "").slice(0, 10))}
              keyboardType="number-pad"
              placeholder="10-digit mobile"
              placeholderTextColor={tokens.mute}
              style={inputStyle}
            />
            {label("Email")}
            <TextInput
              value={form.email}
              onChangeText={set("email")}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="you@example.com"
              placeholderTextColor={tokens.mute}
              style={inputStyle}
            />
            {label("City")}
            <TextInput value={form.city} onChangeText={set("city")} placeholder="City" placeholderTextColor={tokens.mute} style={inputStyle} />
            {label("State")}
            <TextInput value={form.state} onChangeText={set("state")} placeholder="State" placeholderTextColor={tokens.mute} style={inputStyle} />
            {label("About your business")}
            <TextInput
              value={form.message}
              onChangeText={set("message")}
              multiline
              maxLength={2000}
              placeholder="Network size, area you cover, services you offer today"
              placeholderTextColor={tokens.mute}
              style={[inputStyle, { minHeight: 110, textAlignVertical: "top" }]}
            />

            <Pressable onPress={submit} disabled={loading} style={[styles.submit, { opacity: loading ? 0.7 : 1 }]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send enquiry</Text>}
            </Pressable>

            <Pressable onPress={onRetailerSignup} style={{ marginTop: 14, alignItems: "center" }}>
              <Text style={{ color: tokens.sub, fontSize: 12 }}>
                Want a Retailer account? <Text style={{ color: colors.blue, fontWeight: "700" }}>Sign up as Retailer</Text>
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 8, marginBottom: 4 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  sub: { fontSize: 12, marginTop: 1 },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  submit: { marginTop: 22, backgroundColor: colors.blue, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  done: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  doneTitle: { fontSize: 18, fontWeight: "800", marginTop: 12 },
  doneSub: { fontSize: 13, textAlign: "center", marginTop: 6 },
});
