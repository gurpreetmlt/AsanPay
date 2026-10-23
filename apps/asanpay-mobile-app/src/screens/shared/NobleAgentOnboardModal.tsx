import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { ArrowLeft, Landmark, MapPin, Store, UserRound } from "lucide-react-native";
import {
  AEPS_ONBOARDING_STEPS,
  EMPTY_AEPS_ONBOARDING_FORM,
  validateAepsOnboardingStep,
  type AepsOnboardingForm,
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
const STEPS: MobileStepperStep[] = AEPS_ONBOARDING_STEPS.map((s, i) => ({ ...s, icon: STEP_ICONS[i]! }));
const LAST_STEP = STEPS.length - 1;

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
  const [sameAsResidential, setSameAsResidential] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [form, setForm] = useState<AepsOnboardingForm>(EMPTY_AEPS_ONBOARDING_FORM);

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
    const err = validateAepsOnboardingStep(index, form);
    if (!err) return true;
    setErrors({ [err.field]: err.message });
    return false;
  }

  function captureLocation() {
    Geolocation.getCurrentPosition(
      (pos) => {
        setField("shopLatitude", pos.coords.latitude.toFixed(4));
        setField("shopLongitude", pos.coords.longitude.toFixed(4));
      },
      (err) => showAlert("Location failed", err.message || "Allow location access before continuing"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
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
    <View style={styles.field} key={key}>
      <Text style={[styles.label, { color: tokens.sub }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            color: tokens.txt,
            borderColor: errors[key] ? colors.danger : tokens.cardBorder,
            backgroundColor: tokens.card,
            opacity: props?.editable === false ? 0.6 : 1,
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

  const current = STEPS[step]!;
  const StepIcon = current.icon;
  const hasGeo = Boolean(form.shopLatitude && form.shopLongitude);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bg }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.txt }]}>AEPS agent onboarding</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: colors.blueFlat, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.hint, { color: tokens.sub }]}>
            One-time form. Required before using AEPS, Aadhaar Pay, Cash Deposit, and UPI QR.
          </Text>

          <MobileSignupStepper currentIndex={step} steps={STEPS} />

          <View style={styles.stepTitleRow}>
            <View style={styles.stepIcon}>
              <StepIcon size={16} color={colors.blue} strokeWidth={2.4} />
            </View>
            <Text style={[styles.stepTitle, { color: tokens.txt }]}>{current.label}</Text>
          </View>

          {step === 0 ? (
            <>
              {input("First name", "firstName", { maxLength: 50 })}
              {input("Middle name", "middleName", { maxLength: 50 })}
              {input("Last name", "lastName", { maxLength: 50 })}
              {input("Mobile", "mobileNumber", { keyboardType: "number-pad", maxLength: 10 })}
              {input("Email", "email", { keyboardType: "email-address", autoCapitalize: "none" })}
              {input("PAN", "panNumber", {
                autoCapitalize: "characters",
                maxLength: 10,
                onChangeText: (t) => setField("panNumber", t.toUpperCase()),
              })}
              {input("Aadhaar", "aadhaarNumber", { keyboardType: "number-pad", maxLength: 12 })}
              {input("Date of birth (DD-MM-YYYY)", "dob", { placeholder: "20-10-1985", maxLength: 10 })}
            </>
          ) : null}

          {step === 1 ? (
            <>
              {input("Residential address", "agentAddress", { maxLength: 250 })}
              <StatePickerField
                label="State"
                value={form.agentStateCode}
                onChange={(code) => setField("agentStateCode", code)}
                error={errors.agentStateCode}
              />
              {input("City", "agentCity")}
              {input("PIN", "agentPinCode", { keyboardType: "number-pad", maxLength: 6 })}
              {input("Bank name", "agentBankName")}
              {input("IFSC", "agentBankIFSC", {
                autoCapitalize: "characters",
                maxLength: 11,
                onChangeText: (t) => setField("agentBankIFSC", t.toUpperCase()),
              })}
              {input("Bank account number", "agentBankAccountNumber", { keyboardType: "number-pad" })}
            </>
          ) : null}

          {step === 2 ? (
            <>
              {input("Shop name", "shopName")}
              <View style={styles.sameRow}>
                <Text style={[styles.sameText, { color: tokens.txt }]}>
                  Shop address is same as residential address
                </Text>
                <Switch
                  value={sameAsResidential}
                  onValueChange={setSameAsResidential}
                  trackColor={{ true: colors.green, false: tokens.cardBorder }}
                />
              </View>
              {input("Shop address", "shopAddress", { maxLength: 250, editable: !sameAsResidential })}
              <StatePickerField
                label="Shop state"
                value={form.shopStateCode}
                onChange={(code) => setField("shopStateCode", code)}
                error={errors.shopStateCode}
                disabled={sameAsResidential}
              />
              {input("Shop city", "shopCity", { editable: !sameAsResidential })}
              {input("Shop PIN", "shopPinCode", {
                keyboardType: "number-pad",
                maxLength: 6,
                editable: !sameAsResidential,
              })}

              <View
                style={[
                  styles.geoCard,
                  { borderColor: errors.shopLatitude ? colors.danger : tokens.cardBorder, backgroundColor: tokens.card },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.geoTitle, { color: tokens.txt }]}>Shop location</Text>
                  <Text style={{ color: tokens.sub, fontSize: 12 }}>
                    {hasGeo ? `${form.shopLatitude}, ${form.shopLongitude}` : "Stand inside your shop and tap Use GPS"}
                  </Text>
                </View>
                <Pressable style={[styles.geoBtn, { borderColor: tokens.cardBorder }]} onPress={captureLocation}>
                  <MapPin size={14} color={colors.blueFlat} />
                  <Text style={{ color: colors.blueFlat, fontWeight: "700", marginLeft: 4 }}>
                    {hasGeo ? "Update GPS" : "Use GPS"}
                  </Text>
                </Pressable>
              </View>
              {errors.shopLatitude ? <Text style={styles.error}>{errors.shopLatitude}</Text> : null}
            </>
          ) : null}

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
            <Pressable style={styles.skipBtn} disabled={saving} onPress={onSkip}>
              <Text style={{ color: tokens.sub, fontWeight: "600", fontSize: 15 }}>Skip for now</Text>
            </Pressable>
          ) : null}
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
  stepTitleRow: { flexDirection: "row", alignItems: "center", marginTop: 4, marginBottom: 12, gap: 8 },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  stepTitle: { fontSize: 16, fontWeight: "800" },
  field: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  sameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12,
  },
  sameText: { flex: 1, fontSize: 14, fontWeight: "600" },
  geoCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  geoTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  geoBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  navRow: { flexDirection: "row", gap: 10, marginTop: 16 },
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
  skipBtn: { marginTop: 8, paddingVertical: 12, alignItems: "center" },
});
