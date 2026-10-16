import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { lookupIndianIfsc } from "../lib/ifsc";
import { showAlert } from "./AppAlert";
import { LabelText } from "./RequiredMark";
import { colors } from "../theme/colors";

export type IfscBankDetailsValue = {
  ifsc: string;
  bankName: string;
  branch: string;
  city: string;
  accountNumber: string;
  holderName: string;
  accountNumberConfirm?: string;
};

type ThemeBits = {
  card: string;
  cardBorder: string;
  txt: string;
  mute: string;
};

type Props = {
  value: IfscBankDetailsValue;
  onChange: (patch: Partial<IfscBankDetailsValue>) => void;
  tokens: ThemeBits;
  showHolder?: boolean;
  showConfirmAccount?: boolean;
  accountRequired?: boolean;
  accountPlaceholder?: string;
  notifyLookupFail?: boolean;
  style?: ViewStyle;
};

/**
 * Shared IFSC → bank/branch autofill + account fields (mobile).
 * Keep in sync with web `IfscBankDetailsFields`.
 */
export function IfscBankDetailsFields({
  value,
  onChange,
  tokens,
  showHolder = true,
  showConfirmAccount = false,
  accountPlaceholder = "Account number",
  notifyLookupFail = true,
  style,
}: Props) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = value.ifsc.trim().toUpperCase();
    if (code.length !== 11) {
      if (value.bankName || value.branch || value.city) {
        onChange({ bankName: "", branch: "", city: "" });
      }
      return;
    }
    let cancelled = false;
    setBusy(true);
    void lookupIndianIfsc(code).then((place) => {
      if (cancelled) return;
      setBusy(false);
      if (!place?.bank) {
        onChange({ bankName: "", branch: "", city: "" });
        if (notifyLookupFail) {
          showAlert("IFSC not found", "Check the code and try again.");
        }
        return;
      }
      onChange({
        bankName: place.bank,
        branch: place.branch || "",
        city: place.city || "",
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.ifsc]);

  const branchLine = [value.branch, value.city].filter(Boolean).join(", ");
  const inputStyle: TextStyle = {
    backgroundColor: tokens.card,
    borderColor: tokens.cardBorder,
    color: tokens.txt,
  };
  const readOnlyStyle: TextStyle = {
    ...inputStyle,
    backgroundColor: "#F8FAFC",
    color: colors.blueFlat,
  };

  return (
    <View style={[styles.wrap, style]}>
      <LabelText label="IFSC *" color={tokens.mute} style={styles.label} />
      <TextInput
        style={[styles.input, inputStyle, styles.mono]}
        placeholder="e.g. SBIN0001234"
        placeholderTextColor={tokens.mute}
        autoCapitalize="characters"
        value={value.ifsc}
        onChangeText={(t) =>
          onChange({ ifsc: t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })
        }
      />
      <Text style={[styles.hint, { color: tokens.mute }]}>
        {value.ifsc.length}/11 {busy ? "· Looking up…" : ""}
      </Text>

      <Text style={[styles.label, { color: tokens.mute }]}>Bank name</Text>
      <TextInput
        style={[styles.input, readOnlyStyle]}
        value={value.bankName}
        editable={false}
        placeholder={busy ? "Looking up…" : "Auto from IFSC"}
        placeholderTextColor={tokens.mute}
      />

      <Text style={[styles.label, { color: tokens.mute }]}>Branch</Text>
      <TextInput
        style={[styles.input, readOnlyStyle]}
        value={branchLine}
        editable={false}
        placeholder={busy ? "Looking up…" : "Auto from IFSC"}
        placeholderTextColor={tokens.mute}
      />

      <View style={styles.accountRow}>
        <View style={styles.accountCol}>
          <LabelText label="Account number *" color={tokens.mute} style={{ ...styles.label, ...styles.labelTight }} />
          <TextInput
            style={[styles.input, inputStyle]}
            placeholder={accountPlaceholder}
            placeholderTextColor={tokens.mute}
            keyboardType="number-pad"
            value={value.accountNumber}
            onChangeText={(t) => onChange({ accountNumber: t.replace(/\D/g, "").slice(0, 18) })}
          />
        </View>

        {showConfirmAccount ? (
          <View style={styles.accountCol}>
            <LabelText label="Confirm account *" color={tokens.mute} style={{ ...styles.label, ...styles.labelTight }} />
            <TextInput
              style={[styles.input, inputStyle]}
              placeholder="Re-enter"
              placeholderTextColor={tokens.mute}
              keyboardType="number-pad"
              value={value.accountNumberConfirm ?? ""}
              onChangeText={(t) =>
                onChange({ accountNumberConfirm: t.replace(/\D/g, "").slice(0, 18) })
              }
            />
          </View>
        ) : null}

        {showHolder ? (
          <View style={styles.accountCol}>
            <LabelText label="Account holder *" color={tokens.mute} style={{ ...styles.label, ...styles.labelTight }} />
            <TextInput
              style={[styles.input, inputStyle]}
              placeholder="Account holder name"
              placeholderTextColor={tokens.mute}
              value={value.holderName}
              onChangeText={(t) => onChange({ holderName: t })}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function emptyIfscBankDetails(): IfscBankDetailsValue {
  return {
    ifsc: "",
    bankName: "",
    branch: "",
    city: "",
    accountNumber: "",
    holderName: "",
    accountNumberConfirm: "",
  };
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  accountRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  accountCol: { flexGrow: 1, flexBasis: "30%", minWidth: 140 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 10,
  },
  labelTight: { marginTop: 6 },
  hint: { fontSize: 11, marginBottom: 4, marginTop: -4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 4,
  },
  mono: { fontFamily: "monospace" },
});
