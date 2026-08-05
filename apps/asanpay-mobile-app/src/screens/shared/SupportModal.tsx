import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Ticket,
  Zap,
} from "lucide-react-native";
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

interface UplineItem {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
}

interface SupportContacts {
  supportPhone: string;
  supportEmail: string;
  supportWhatsapp: string;
  supportWebsite: string;
  nodalEmail: string;
  nodalPhone: string;
  nodalAddress: string;
}

const EMPTY_CONTACTS: SupportContacts = {
  supportPhone: "",
  supportEmail: "",
  supportWhatsapp: "",
  supportWebsite: "https://asanpay.in",
  nodalEmail: "",
  nodalPhone: "",
  nodalAddress: "",
};

const BRAND = "AsanPay";

function roleLabel(role: string) {
  if (role === "super_distributor") return "Super Distributor";
  if (role === "distributor") return "Distributor";
  if (role === "retailer") return "Retailer";
  return role;
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  return raw.trim();
}

function digitsForTel(mobile: string) {
  const digits = mobile.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("91") ? digits : `91${digits}`;
}

async function openTel(mobile: string) {
  const d = digitsForTel(mobile);
  if (!d) {
    showAlert("Phone not available", "No phone number is set for this contact.");
    return;
  }
  await Linking.openURL(`tel:+${d}`);
}

async function openWa(mobile: string) {
  const d = digitsForTel(mobile);
  if (!d) {
    showAlert("WhatsApp not available", "Support WhatsApp number is not set yet.");
    return;
  }
  const text = encodeURIComponent(`Hi, I need help with my ${BRAND} account.`);
  await Linking.openURL(`https://wa.me/${d}?text=${text}`);
}

async function openMail(email: string) {
  const e = email.trim();
  if (!e) {
    showAlert("Email not available", "No email is set for this contact.");
    return;
  }
  await Linking.openURL(
    `mailto:${e}?subject=${encodeURIComponent(`${BRAND} support request`)}`,
  );
}

async function openWeb(url: string) {
  const u = url.trim() || "https://asanpay.in";
  const href = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  await Linking.openURL(href);
}

function ActionCircle({
  onPress,
  children,
  borderColor,
}: {
  onPress: () => void;
  children: React.ReactNode;
  borderColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.actionCircle, { borderColor, backgroundColor: "#fff" }]}
      hitSlop={6}
    >
      {children}
    </Pressable>
  );
}

function ContactRow({
  title,
  value,
  borderColor,
  onAction,
  actionIcon,
}: {
  title: string;
  value: string;
  borderColor: string;
  onAction: () => void;
  actionIcon: React.ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <View style={styles.contactRow}>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
        <Text style={[styles.contactTitle, { color: tokens.txt }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.contactValue, { color: tokens.sub }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <ActionCircle onPress={onAction} borderColor={borderColor}>
        {actionIcon}
      </ActionCircle>
    </View>
  );
}

export function SupportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [upline, setUpline] = useState<UplineItem | null>(null);
  const [contacts, setContacts] = useState<SupportContacts>(EMPTY_CONTACTS);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketList, network, supportContacts] = await Promise.all([
        fetchApi<Ticket[]>("/support/mine").catch(() => [] as Ticket[]),
        fetchApi<{ upline: UplineItem | null }>("/users/network").catch(() => ({
          upline: null,
        })),
        fetchApi<SupportContacts>("/support/contacts").catch(() => EMPTY_CONTACTS),
      ]);
      setTickets(ticketList);
      setUpline(network.upline);
      setContacts(supportContacts);
    } catch (err) {
      showAlert("Error", (err as Error).message || "Failed to load support");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setShowForm(false);
      void load();
    }
  }, [visible, load]);

  async function submit() {
    if (subject.trim().length < 3) {
      showAlert("Subject required", "Subject must be at least 3 characters");
      return;
    }
    if (description.trim().length < 3) {
      showAlert("Description required", "Description must be at least 3 characters");
      return;
    }
    setSaving(true);
    try {
      await api.post("/support", { subject: subject.trim(), description: description.trim() });
      showAlert("Submitted", "Support ticket created");
      setSubject("");
      setDescription("");
      setShowForm(false);
      const list = await fetchApi<Ticket[]>("/support/mine").catch(() => [] as Ticket[]);
      setTickets(list);
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

  const distRole = upline ? roleLabel(upline.role) : "Distributor";
  const distName = upline?.name?.trim() || null;
  const distributorMobile = upline?.mobile?.trim() || "";
  const distributorEmail = upline?.email?.trim() || "";
  const carePhone = contacts.supportPhone.trim();
  const careEmail = contacts.supportEmail.trim();
  const careWa = contacts.supportWhatsapp.trim();
  const companyWebsite = contacts.supportWebsite.trim() || "https://asanpay.in";
  const nodalEmail = contacts.nodalEmail.trim();
  const nodalPhone = contacts.nodalPhone.trim() || carePhone;
  const nodalAddress = contacts.nodalAddress.trim();
  const websiteLabel = companyWebsite.replace(/^https?:\/\//i, "");

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.backBtn} hitSlop={8}>
            <ChevronLeft size={22} color={tokens.txt} strokeWidth={2.4} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: tokens.txt }]}>We are here to help</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 48 }} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* WhatsApp */}
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardHeading, { color: tokens.txt }]}>WhatsApp Support</Text>
                <View style={styles.fastBadge}>
                  <Zap size={11} color="#15803D" fill="#15803D" />
                  <Text style={styles.fastBadgeText}>Faster Response</Text>
                </View>
              </View>
              <ContactRow
                title={BRAND}
                value={careWa ? formatPhone(careWa) : "Not set yet"}
                borderColor={tokens.cardBorder}
                onAction={() => void openWa(careWa)}
                actionIcon={<MessageCircle size={18} color="#25D366" strokeWidth={2.2} />}
              />
            </View>

            {/* Call */}
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.cardHeading, { color: tokens.txt, marginBottom: 10 }]}>
                Call Support
              </Text>
              <ContactRow
                title={distName ? `${distRole} (${distName})` : `${distRole}`}
                value={
                  distributorMobile
                    ? formatPhone(distributorMobile)
                    : upline
                      ? "Phone not on file"
                      : "No upline linked"
                }
                borderColor={tokens.cardBorder}
                onAction={() => void openTel(distributorMobile)}
                actionIcon={<Phone size={17} color={colors.blueFlat} strokeWidth={2.2} />}
              />
              <View style={[styles.rowDivider, { backgroundColor: tokens.cardBorder }]} />
              <ContactRow
                title={BRAND}
                value={carePhone ? formatPhone(carePhone) : "Not set yet"}
                borderColor={tokens.cardBorder}
                onAction={() => void openTel(carePhone)}
                actionIcon={<Phone size={17} color={colors.blueFlat} strokeWidth={2.2} />}
              />
            </View>

            {/* Email */}
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.cardHeading, { color: tokens.txt, marginBottom: 10 }]}>
                Email Support
              </Text>
              <ContactRow
                title={distName ? `${distRole} (${distName})` : distRole}
                value={
                  distributorEmail
                    ? distributorEmail
                    : upline
                      ? "No email on file"
                      : "No upline linked"
                }
                borderColor={tokens.cardBorder}
                onAction={() => void openMail(distributorEmail)}
                actionIcon={<Mail size={17} color={colors.blueFlat} strokeWidth={2.2} />}
              />
              <View style={[styles.rowDivider, { backgroundColor: tokens.cardBorder }]} />
              <ContactRow
                title={BRAND}
                value={careEmail || "Not set yet"}
                borderColor={tokens.cardBorder}
                onAction={() => void openMail(careEmail)}
                actionIcon={<Mail size={17} color={colors.blueFlat} strokeWidth={2.2} />}
              />
            </View>

            {/* Website */}
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <Text style={[styles.cardHeading, { color: tokens.txt, marginBottom: 10 }]}>Website</Text>
              <ContactRow
                title={BRAND}
                value={websiteLabel}
                borderColor={tokens.cardBorder}
                onAction={() => void openWeb(companyWebsite)}
                actionIcon={<Globe size={17} color={colors.blueFlat} strokeWidth={2.2} />}
              />
            </View>

            {/* Nodal */}
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <View style={styles.nodalHead}>
                <MapPin size={15} color={colors.blueLight} strokeWidth={2.2} />
                <Text style={[styles.cardHeading, { color: tokens.txt }]}>Nodal officer</Text>
              </View>
              <View style={[styles.addressBox, { backgroundColor: tokens.bg, borderColor: tokens.cardBorder }]}>
                <Text style={[styles.addressText, { color: tokens.sub }]}>
                  {nodalAddress || "Address not set yet (Admin → Platform Settings)."}
                </Text>
              </View>
              <ContactRow
                title="Email"
                value={nodalEmail || "Not set"}
                borderColor={tokens.cardBorder}
                onAction={() => void openMail(nodalEmail)}
                actionIcon={<Mail size={17} color={colors.blueFlat} strokeWidth={2.2} />}
              />
              <View style={[styles.rowDivider, { backgroundColor: tokens.cardBorder }]} />
              <ContactRow
                title="Phone"
                value={nodalPhone ? formatPhone(nodalPhone) : "Not set"}
                borderColor={tokens.cardBorder}
                onAction={() => void openTel(nodalPhone)}
                actionIcon={<Phone size={17} color={colors.blueFlat} strokeWidth={2.2} />}
              />
            </View>

            {/* Tickets */}
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.ticketTitleRow}>
                  <Ticket size={16} color={colors.blueFlat} strokeWidth={2.2} />
                  <Text style={[styles.cardHeading, { color: tokens.txt }]}>Manage Tickets</Text>
                </View>
                <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={8}>
                  <Text style={[styles.linkBtn, { color: colors.blueFlat }]}>
                    {showForm ? "Cancel" : "Raise ticket"}
                  </Text>
                </Pressable>
              </View>

              {showForm ? (
                <View style={styles.formBlock}>
                  <Text style={[styles.fieldLabel, { color: tokens.mute }]}>SUBJECT</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: tokens.bg,
                        borderColor: tokens.cardBorder,
                        color: tokens.txt,
                      },
                    ]}
                    placeholder="e.g. AePS failed · Balance credit"
                    placeholderTextColor={tokens.mute}
                    value={subject}
                    onChangeText={setSubject}
                  />
                  <Text style={[styles.fieldLabel, { color: tokens.mute }]}>DETAILS</Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.area,
                      {
                        backgroundColor: tokens.bg,
                        borderColor: tokens.cardBorder,
                        color: tokens.txt,
                      },
                    ]}
                    placeholder="What happened? Include amount, UTR / txn id if useful."
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
                <Text style={[styles.emptyTickets, { color: tokens.mute }]}>
                  No support tickets yet.
                </Text>
              ) : (
                tickets.map((t) => (
                  <View
                    key={t.id}
                    style={[styles.ticketRow, { borderColor: tokens.cardBorder, backgroundColor: tokens.bg }]}
                  >
                    <View style={styles.ticketTop}>
                      <Text style={[styles.ticketSubject, { color: tokens.txt }]} numberOfLines={1}>
                        {t.subject}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          t.status === "open" ? styles.statusOpen : styles.statusResolved,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: t.status === "open" ? "#92400E" : "#166534" },
                          ]}
                        >
                          {t.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: tokens.mute, fontSize: 11, marginTop: 4 }}>
                      {new Date(t.createdAt).toLocaleString("en-IN")}
                    </Text>
                    <Text style={{ color: tokens.sub, marginTop: 6, fontSize: 13 }} numberOfLines={3}>
                      {t.description}
                    </Text>
                    {t.resolutionNote ? (
                      <Text style={{ color: colors.greenDark, marginTop: 6, fontSize: 12 }}>
                        Resolution: {t.resolutionNote}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  cardHeading: { fontSize: 16, fontWeight: "800" },
  fastBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  fastBadgeText: { fontSize: 11, fontWeight: "700", color: "#15803D" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  contactTitle: { fontSize: 14, fontWeight: "700" },
  contactValue: { fontSize: 13, marginTop: 2 },
  actionCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowDivider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  nodalHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  addressBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  addressText: { fontSize: 13, lineHeight: 18 },
  ticketTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkBtn: { fontSize: 13, fontWeight: "700" },
  formBlock: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  area: { minHeight: 96, textAlignVertical: "top" },
  submit: {
    marginTop: 4,
    backgroundColor: colors.blue,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  emptyTickets: { fontSize: 13, marginTop: 4 },
  ticketRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  ticketTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  ticketSubject: { flex: 1, fontSize: 14, fontWeight: "800" },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusOpen: { backgroundColor: "#FEF3C7" },
  statusResolved: { backgroundColor: "#DCFCE7" },
  statusText: { fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
});
