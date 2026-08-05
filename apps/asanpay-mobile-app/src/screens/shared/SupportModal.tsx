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
  Building2,
  ChevronLeft,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Ticket,
  UserRound,
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

/** Web ContactLine — icon + PHONE/EMAIL/WEBSITE label + value */
function ContactLine({
  kind,
  label,
  value,
  active,
  onPress,
}: {
  kind: "phone" | "mail" | "web";
  label: string;
  value: string;
  active: boolean;
  onPress?: () => void;
}) {
  const { tokens } = useTheme();
  const Icon = kind === "phone" ? Phone : kind === "mail" ? Mail : Globe;
  const inner = (
    <View style={styles.lineInner}>
      <View
        style={[
          styles.lineIcon,
          {
            borderColor: tokens.cardBorder,
            backgroundColor: active ? colors.bluePale : "#F8FAFC",
          },
        ]}
      >
        <Icon size={14} color={active ? colors.blueLight : tokens.mute} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.lineLabel, { color: tokens.mute }]}>{label}</Text>
        <Text
          style={[styles.lineValue, { color: active ? colors.blue : tokens.mute }]}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  );

  if (!onPress || !active) {
    return (
      <View style={[styles.lineCard, { borderColor: tokens.cardBorder }]}>{inner}</View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.lineCard, { borderColor: tokens.cardBorder }]}
    >
      {inner}
    </Pressable>
  );
}

function EntityCard({
  icon,
  title,
  name,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  name: string;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
      <View style={styles.entityHead}>
        {icon}
        <Text style={[styles.entityLabel, { color: tokens.mute }]}>{title}</Text>
      </View>
      <Text style={[styles.entityName, { color: colors.blue }]}>{name}</Text>
      <View style={styles.linesStack}>{children}</View>
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
  const distName = upline?.name?.trim() || "No upline linked";
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
          <View style={styles.headerText}>
            <Text style={[styles.pageTitle, { color: colors.blue }]}>Support</Text>
            <Text style={[styles.pageSub, { color: tokens.mute }]} numberOfLines={2}>
              Call your upline, contact {BRAND}, or raise a ticket below
            </Text>
          </View>
          {careWa ? (
            <Pressable
              onPress={() => void openWa(careWa)}
              style={styles.waBtn}
              hitSlop={6}
            >
              <MessageCircle size={16} color="#fff" strokeWidth={2.2} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blueFlat} style={{ marginTop: 48 }} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Distributor — phone + email (same as web) */}
            <EntityCard
              icon={<UserRound size={15} color={colors.blueLight} strokeWidth={2.2} />}
              title={distRole.toUpperCase()}
              name={distName}
            >
              <ContactLine
                kind="phone"
                label="PHONE"
                value={
                  distributorMobile
                    ? formatPhone(distributorMobile)
                    : upline
                      ? "Not available"
                      : "Not available"
                }
                active={Boolean(distributorMobile)}
                onPress={() => void openTel(distributorMobile)}
              />
              <ContactLine
                kind="mail"
                label="EMAIL"
                value={distributorEmail || (upline ? "No email on file" : "—")}
                active={Boolean(distributorEmail)}
                onPress={() => void openMail(distributorEmail)}
              />
            </EntityCard>

            {/* Company — phone + email + website (same as web) */}
            <EntityCard
              icon={<Building2 size={15} color={colors.blueLight} strokeWidth={2.2} />}
              title="COMPANY"
              name={BRAND}
            >
              <ContactLine
                kind="phone"
                label="PHONE"
                value={carePhone ? formatPhone(carePhone) : "Not set yet"}
                active={Boolean(carePhone)}
                onPress={() => void openTel(carePhone)}
              />
              <ContactLine
                kind="mail"
                label="EMAIL"
                value={careEmail || "Not set yet"}
                active={Boolean(careEmail)}
                onPress={() => void openMail(careEmail)}
              />
              <ContactLine
                kind="web"
                label="WEBSITE"
                value={websiteLabel}
                active
                onPress={() => void openWeb(companyWebsite)}
              />
            </EntityCard>

            {/* Nodal officer */}
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <View style={styles.entityHead}>
                <MapPin size={15} color={colors.blueLight} strokeWidth={2.2} />
                <Text style={[styles.entityLabel, { color: tokens.mute }]}>NODAL OFFICER</Text>
              </View>
              <View
                style={[
                  styles.addressBox,
                  { backgroundColor: tokens.bg, borderColor: tokens.cardBorder },
                ]}
              >
                <Text style={[styles.addressText, { color: colors.blueFlat }]}>
                  {nodalAddress || "Address not set yet (Admin → Platform Settings)."}
                </Text>
              </View>
              <View style={styles.linesStack}>
                <ContactLine
                  kind="mail"
                  label="EMAIL"
                  value={nodalEmail || "Not set"}
                  active={Boolean(nodalEmail)}
                  onPress={() => void openMail(nodalEmail)}
                />
                <ContactLine
                  kind="phone"
                  label="PHONE"
                  value={nodalPhone ? formatPhone(nodalPhone) : "Not set"}
                  active={Boolean(nodalPhone)}
                  onPress={() => void openTel(nodalPhone)}
                />
              </View>
            </View>

            {/* Tickets */}
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <View style={styles.ticketHead}>
                <View style={styles.ticketTitleRow}>
                  <Ticket size={16} color={colors.blueFlat} strokeWidth={2.2} />
                  <Text style={[styles.ticketHeading, { color: colors.blue }]}>
                    Create a support ticket
                  </Text>
                </View>
                <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={8}>
                  <Text style={[styles.linkBtn, { color: colors.blueFlat }]}>
                    {showForm ? "Cancel" : "Raise ticket"}
                  </Text>
                </Pressable>
              </View>
              <Text style={[styles.ticketHint, { color: tokens.mute }]}>
                Reply within ~5 hrs on working days. Add txn ref / UTR when you can.
              </Text>

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

              <Text style={[styles.yourTickets, { color: tokens.mute }]}>YOUR TICKETS</Text>
              {tickets.length === 0 ? (
                <Text style={[styles.emptyTickets, { color: tokens.mute }]}>
                  No support tickets yet.
                </Text>
              ) : (
                tickets.map((t) => (
                  <View
                    key={t.id}
                    style={[
                      styles.ticketRow,
                      { borderColor: tokens.cardBorder, backgroundColor: tokens.bg },
                    ]}
                  >
                    <View style={styles.ticketTop}>
                      <Text style={[styles.ticketSubject, { color: colors.blue }]} numberOfLines={1}>
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
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerText: { flex: 1, paddingTop: 4, paddingHorizontal: 4 },
  pageTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  pageSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  waBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  entityHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  entityLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  entityName: { fontSize: 15, fontWeight: "800", marginBottom: 12 },
  linesStack: { gap: 8 },
  lineCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  lineInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  lineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lineLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  lineValue: { fontSize: 14, fontWeight: "700", marginTop: 1 },
  addressBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  addressText: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  ticketHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  ticketTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  ticketHeading: { fontSize: 15, fontWeight: "800", flexShrink: 1 },
  ticketHint: { fontSize: 12, marginTop: 4, marginBottom: 10, lineHeight: 16 },
  linkBtn: { fontSize: 13, fontWeight: "700" },
  formBlock: { marginBottom: 8 },
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
  yourTickets: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
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
