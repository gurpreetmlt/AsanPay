import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Geolocation from "@react-native-community/geolocation";
import { ArrowLeft, Eye, EyeOff, Landmark, Lock, MapPin, Store, UserRound, X } from "lucide-react-native";
import {
  AEPS_ONBOARDING_STEPS,
  EMPTY_AEPS_ONBOARDING_FORM,
  validateAepsOnboardingStep,
  type AepsOnboardingForm,
  type AepsOnboardingPrefill,
  type ApiResponse,
  type AuthUser,
} from "@asanpay/shared-types";
import { api } from "../../lib/api";
import { showAlert } from "../../components/AppAlert";
import { MobileSignupStepper, type MobileStepperStep } from "../../components/MobileSignupStepper";
import { StatePickerField } from "../../components/StatePickerField";
import { apiError } from "../../utils/apiError";
import { useAuthStore } from "../../store/auth";
import { useTheme } from "../../theme/ThemeContext";
import { colors } from "../../theme/colors";

const STEP_ICONS = [UserRound, Landmark, Store];
/** Shorter labels than web so the three dots fit on narrow phones. */
const STEP_SHORT = ["Personal", "Address", "Shop"];
const STEPS: MobileStepperStep[] = AEPS_ONBOARDING_STEPS.map((s, i) => ({
  ...s,
  short: STEP_SHORT[i] ?? s.short,
  icon: STEP_ICONS[i]!,
}));
const LAST_STEP = STEPS.length - 1;
/** Full PAN / Aadhaar re-mask automatically after this long. */
const REVEAL_MS = 30_000;
const GPS_REQUIRED_MSG = "Tap Use GPS inside your shop to capture the shop location";

type FieldKey = keyof AepsOnboardingForm;

export function NobleAgentOnboardModal({
  visible,
  onClose,
  onSkip,
}: {
  visible: boolean;
  onClose: () => void;
  /** When set, shows "Skip for now" so the service opens without onboarding. */
  onSkip?: () => void;
}) {
  const { tokens } = useTheme();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  /** Prefilled coordinates are not trusted — the agent must capture GPS inside the shop. */
  const [gpsCaptured, setGpsCaptured] = useState(false);
  const [sameAsResidential, setSameAsResidential] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [form, setForm] = useState<AepsOnboardingForm>(EMPTY_AEPS_ONBOARDING_FORM);
  const [prefill, setPrefill] = useState<AepsOnboardingPrefill | null>(null);
  const [revealed, setRevealed] = useState<{ pan: string | null; aadhaar: string | null } | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) return;
    if (revealTimer.current) clearTimeout(revealTimer.current);
    setRevealed(null);
  }, [visible]);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );

  const locks = {
    panLocked: Boolean(prefill?.panMasked),
    aadhaarLocked: Boolean(prefill?.aadhaarMasked),
    bankAccountOnFile: Boolean(prefill?.bankAccountMasked),
  };

  useEffect(() => {
    if (!visible || !user) return;
    const parts = user.name.trim().split(/\s+/);
    setForm((f) => ({
      ...f,
      firstName: f.firstName || parts[0] || "",
      lastName: f.lastName || (parts.length > 1 ? parts.slice(1).join(" ") : ""),
      mobileNumber: f.mobileNumber || user.mobile || "",
      email: f.email || user.email || "",
    }));
  }, [visible, user]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void api
      .get<ApiResponse<AepsOnboardingPrefill>>("/onboarding/noble/prefill")
      .then(({ data }) => {
        if (cancelled || !data.success) return;
        setPrefill(data.data);
        setForm((f) => {
          const merged = { ...f };
          for (const [k, v] of Object.entries(data.data.form) as [FieldKey, string][]) {
            if (v && !merged[k]) merged[k] = v;
          }
          return merged;
        });
      })
      .catch(() => {
        /* prefill is a convenience — the form still works empty */
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!sameAsResidential) return;
    setForm((f) => ({
      ...f,
      shopAddress: f.agentAddress,
      shopStateCode: f.agentStateCode,
      shopCity: f.agentCity,
      shopPinCode: f.agentPinCode,
    }));
  }, [sameAsResidential, form.agentAddress, form.agentStateCode, form.agentCity, form.agentPinCode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  function setField(key: FieldKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  function checkStep(index: number): boolean {
    const err = validateAepsOnboardingStep(index, form, locks);
    if (!err) return true;
    setErrors({ [err.field]: err.message });
    return false;
  }

  function captureLocation() {
    setGeoBusy(true);
    Geolocation.getCurrentPosition(
      (pos) => {
        setField("shopLatitude", pos.coords.latitude.toFixed(4));
        setField("shopLongitude", pos.coords.longitude.toFixed(4));
        setGpsCaptured(true);
        setGeoBusy(false);
      },
      (err) => {
        setGeoBusy(false);
        showAlert("Location failed", err.message || "Allow location access before continuing");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }

  async function toggleReveal() {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    if (revealed) {
      setRevealed(null);
      return;
    }
    setRevealBusy(true);
    try {
      const { data } = await api.get<ApiResponse<{ pan: string | null; aadhaar: string | null }>>(
        "/onboarding/noble/identity",
      );
      if (!data.success) return;
      setRevealed(data.data);
      revealTimer.current = setTimeout(() => setRevealed(null), REVEAL_MS);
    } catch (err) {
      showAlert("Could not show details", apiError(err, "Could not load your PAN and Aadhaar. Try again."));
    } finally {
      setRevealBusy(false);
    }
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  async function next() {
    if (saving) return;
    if (!checkStep(step)) return;
    if (step < LAST_STEP) {
      setStep(step + 1);
      return;
    }
    for (let i = 0; i < LAST_STEP; i++) {
      if (!checkStep(i)) {
        setStep(i);
        return;
      }
    }
    if (!gpsCaptured) {
      setErrors({ shopLatitude: GPS_REQUIRED_MSG });
      showAlert("Shop location required", GPS_REQUIRED_MSG);
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
        panNumber: locks.panLocked ? "" : form.panNumber.toUpperCase().trim(),
        aadhaarNumber: locks.aadhaarLocked ? "" : form.aadhaarNumber.replace(/\D/g, ""),
        dob: form.dob.trim(),
        agentAddress: form.agentAddress.trim(),
        agentStateCode: form.agentStateCode,
        agentCity: form.agentCity.trim(),
        agentPinCode: form.agentPinCode.replace(/\D/g, "").slice(0, 6),
        agentBankName: form.agentBankName.trim(),
        agentBankAccountNumber: form.agentBankAccountNumber.replace(/\D/g, ""),
        agentBankIFSC: form.agentBankIFSC.toUpperCase().trim(),
        shopName: form.shopName.trim(),
        shopAddress: form.shopAddress.trim(),
        shopStateCode: form.shopStateCode,
        shopCity: form.shopCity.trim(),
        shopPinCode: form.shopPinCode.replace(/\D/g, "").slice(0, 6),
        shopLatitude: Number(form.shopLatitude),
        shopLongitude: Number(form.shopLongitude),
        isPhysicalVerified: "YES",
      });
      const { data } = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (data.success) updateUser(data.data.user);
      showAlert("Onboarding complete", "AEPS agent onboarding saved. You can use AEPS services next.");
      setStep(0);
      onClose();
    } catch (err) {
      showAlert("Onboarding failed", apiError(err, "Could not complete AEPS agent onboarding"));
    } finally {
      setSaving(false);
    }
  }

  const input = (label: string, key: FieldKey, props?: TextInputProps) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: tokens.sub }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            color: tokens.txt,
            borderColor: errors[key] ? colors.danger : tokens.cardBorder,
            backgroundColor: props?.editable === false ? tokens.bg : tokens.card,
          },
        ]}
        value={form[key]}
        onChangeText={(t) => setField(key, t)}
        placeholderTextColor={tokens.mute}
        {...props}
      />
      {errors[key] ? <Text style={styles.error}>{errors[key]}</Text> : null}
    </View>
  );

  const locked = (label: string, masked: string, full: string | null) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: tokens.sub }]}>{label}</Text>
      <View style={[styles.input, styles.lockedBox, { borderColor: tokens.cardBorder, backgroundColor: tokens.bg }]}>
        <Text style={[styles.lockedText, { color: tokens.txt }]}>{revealed && full ? full : masked}</Text>
        <View style={styles.lockedTag}>
          <Lock size={12} color={tokens.sub} />
          <Text style={{ color: tokens.sub, fontSize: 11, fontWeight: "600" }}>From KYC</Text>
          <Pressable
            onPress={() => void toggleReveal()}
            disabled={revealBusy}
            hitSlop={10}
            style={styles.eyeBtn}
            accessibilityLabel={revealed ? `Hide ${label}` : `Show full ${label}`}
          >
            {revealBusy ? (
              <ActivityIndicator size="small" color={tokens.sub} />
            ) : revealed ? (
              <EyeOff size={16} color={tokens.sub} />
            ) : (
              <Eye size={16} color={tokens.sub} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  const current = STEPS[step]!;
  const StepIcon = current.icon;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: tokens.txt }]}>AEPS agent onboarding</Text>
            <Text style={[styles.hint, { color: tokens.sub }]}>One-time form for AEPS, Aadhaar Pay, Cash Deposit, and UPI Cash Point</Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={[styles.closeBtn, { borderColor: tokens.cardBorder }]}
            accessibilityLabel="Close"
          >
            <X size={18} color={tokens.txt} />
          </Pressable>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {prefill ? (
              <View style={styles.kycBanner}>
                <Text style={styles.kycBannerText}>Filled from your KYC — check each step before submitting.</Text>
              </View>
            ) : null}

            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
              <MobileSignupStepper currentIndex={step} steps={STEPS} />

              <View style={styles.stepTitleRow}>
                <View style={styles.stepIcon}>
                  <StepIcon size={16} color={colors.blue} strokeWidth={2.4} />
                </View>
                <Text style={[styles.stepTitle, { color: tokens.txt }]}>{current.label}</Text>
              </View>

              {step === 0 ? (
                <>
                  <View style={styles.row}>
                    <View style={styles.col}>{input("First name", "firstName", { maxLength: 50 })}</View>
                    <View style={styles.col}>{input("Last name", "lastName", { maxLength: 50 })}</View>
                  </View>
                  {input("Middle name (optional)", "middleName", { maxLength: 50 })}
                  {input("Mobile", "mobileNumber", { keyboardType: "number-pad", maxLength: 10 })}
                  {input("Email", "email", { keyboardType: "email-address", autoCapitalize: "none" })}
                  {prefill?.panMasked
                    ? locked("PAN", prefill.panMasked, revealed?.pan ?? null)
                    : input("PAN", "panNumber", {
                        autoCapitalize: "characters",
                        maxLength: 10,
                        onChangeText: (t) => setField("panNumber", t.toUpperCase()),
                      })}
                  {prefill?.aadhaarMasked
                    ? locked(
                        "Aadhaar",
                        prefill.aadhaarMasked,
                        revealed?.aadhaar ? revealed.aadhaar.replace(/(\d{4})(?=\d)/g, "$1 ") : null,
                      )
                    : input("Aadhaar", "aadhaarNumber", { keyboardType: "number-pad", maxLength: 12 })}
                  {input("Date of birth (DD-MM-YYYY)", "dob", { placeholder: "20-10-1985", maxLength: 10 })}
                </>
              ) : null}

              {step === 1 ? (
                <>
                  {input("Residential address", "agentAddress", { maxLength: 250, multiline: true })}
                  <StatePickerField
                    label="State"
                    value={form.agentStateCode}
                    onChange={(code) => setField("agentStateCode", code)}
                    error={errors.agentStateCode}
                  />
                  <View style={styles.row}>
                    <View style={styles.col}>{input("City", "agentCity")}</View>
                    <View style={styles.colSmall}>
                      {input("PIN", "agentPinCode", { keyboardType: "number-pad", maxLength: 6 })}
                    </View>
                  </View>
                  <View style={styles.divider} />
                  {input("Bank name", "agentBankName")}
                  {input("IFSC", "agentBankIFSC", {
                    autoCapitalize: "characters",
                    maxLength: 11,
                    onChangeText: (t) => setField("agentBankIFSC", t.toUpperCase()),
                  })}
                  {input("Bank account number", "agentBankAccountNumber", {
                    keyboardType: "number-pad",
                    placeholder: prefill?.bankAccountMasked
                      ? `${prefill.bankAccountMasked} (from KYC) — type to change`
                      : undefined,
                  })}
                </>
              ) : null}

              {step === 2 ? (
                <>
                  {input("Shop name", "shopName")}
                  <View style={[styles.sameRow, { borderColor: tokens.cardBorder }]}>
                    <Text style={[styles.sameText, { color: tokens.txt }]}>Same as residential address</Text>
                    <Switch
                      value={sameAsResidential}
                      onValueChange={setSameAsResidential}
                      trackColor={{ true: colors.green, false: tokens.cardBorder }}
                    />
                  </View>
                  {input("Shop address", "shopAddress", {
                    maxLength: 250,
                    multiline: true,
                    editable: !sameAsResidential,
                  })}
                  <StatePickerField
                    label="Shop state"
                    value={form.shopStateCode}
                    onChange={(code) => setField("shopStateCode", code)}
                    error={errors.shopStateCode}
                    disabled={sameAsResidential}
                  />
                  <View style={styles.row}>
                    <View style={styles.col}>{input("Shop city", "shopCity", { editable: !sameAsResidential })}</View>
                    <View style={styles.colSmall}>
                      {input("Shop PIN", "shopPinCode", {
                        keyboardType: "number-pad",
                        maxLength: 6,
                        editable: !sameAsResidential,
                      })}
                    </View>
                  </View>

                  <View
                    style={[
                      styles.geoCard,
                      {
                        borderColor: errors.shopLatitude ? colors.danger : gpsCaptured ? colors.green : colors.blueFlat,
                        backgroundColor: gpsCaptured ? "#ECFDF3" : "#EEF2FF",
                      },
                    ]}
                  >
                    <View style={styles.geoIcon}>
                      <MapPin size={16} color={colors.blue} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.geoTitleRow}>
                        <Text style={[styles.geoTitle, { color: tokens.txt }]}>Shop location</Text>
                        <Text style={[styles.geoBadge, gpsCaptured ? styles.geoBadgeOk : styles.geoBadgeReq]}>
                          {gpsCaptured ? "Captured" : "Required"}
                        </Text>
                      </View>
                      <Text style={{ color: tokens.sub, fontSize: 12 }}>
                        {gpsCaptured
                          ? `${form.shopLatitude}, ${form.shopLongitude}`
                          : "Stand inside your shop and tap Use GPS before submitting"}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.geoBtn, !gpsCaptured && styles.geoBtnStrong]}
                      onPress={captureLocation}
                      disabled={geoBusy}
                    >
                      {geoBusy ? (
                        <ActivityIndicator size="small" color={gpsCaptured ? colors.blueFlat : "#fff"} />
                      ) : (
                        <Text style={[styles.geoBtnText, !gpsCaptured && styles.geoBtnTextStrong]}>
                          {gpsCaptured ? "Update GPS" : "Use GPS"}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                  {errors.shopLatitude ? <Text style={styles.error}>{errors.shopLatitude}</Text> : null}
                </>
              ) : null}
            </View>
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: tokens.card, borderTopColor: tokens.cardBorder }]}>
            <View style={styles.navRow}>
              {step > 0 ? (
                <Pressable
                  style={[styles.backBtn, { borderColor: tokens.cardBorder }]}
                  disabled={saving}
                  onPress={goBack}
                >
                  <ArrowLeft size={16} color={tokens.txt} />
                  <Text style={{ color: tokens.txt, fontWeight: "700", marginLeft: 4 }}>Back</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.primaryBtn, { opacity: saving ? 0.6 : 1 }]}
                disabled={saving}
                onPress={() => void next()}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{step < LAST_STEP ? "Continue" : "Submit onboarding"}</Text>
                )}
              </Pressable>
            </View>
            {onSkip ? (
              <Pressable style={styles.skipBtn} disabled={saving} onPress={onSkip} hitSlop={6}>
                <Text style={{ color: tokens.sub, fontWeight: "600", fontSize: 14 }}>Skip for now</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "800" },
  hint: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  kycBanner: {
    backgroundColor: "#E8F8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  kycBannerText: { color: colors.greenDark, fontSize: 12, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  stepTitleRow: { flexDirection: "row", alignItems: "center", marginTop: 4, marginBottom: 14, gap: 8 },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  stepTitle: { fontSize: 16, fontWeight: "800" },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  colSmall: { width: 110 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  lockedBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lockedText: { fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  lockedTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  eyeBtn: { marginLeft: 6, padding: 2 },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  divider: { height: 1, backgroundColor: "#EEF2FF", marginVertical: 6, marginBottom: 14 },
  sameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
    gap: 12,
  },
  sameText: { flex: 1, fontSize: 14, fontWeight: "600" },
  geoCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  geoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  geoTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  geoTitle: { fontSize: 14, fontWeight: "700" },
  geoBadge: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  geoBadgeReq: { backgroundColor: "#FEE2E2", color: colors.danger },
  geoBadgeOk: { backgroundColor: "#D1FAE5", color: colors.green },
  geoBtnStrong: { backgroundColor: colors.blueFlat },
  geoBtnTextStrong: { color: "#fff" },
  geoBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#EEF2FF",
    minWidth: 72,
    alignItems: "center",
  },
  geoBtnText: { color: colors.blueFlat, fontWeight: "700" },
  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  navRow: { flexDirection: "row", gap: 10 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.blueFlat,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  skipBtn: { marginTop: 6, paddingVertical: 8, alignItems: "center" },
});
