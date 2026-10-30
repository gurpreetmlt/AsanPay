import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { Check, ChevronDown, ListChecks, X } from "lucide-react-native";
import { ModalSheet } from "./ModalSheet";
import { useTheme } from "../theme/ThemeContext";
import { colors, gradientDirection } from "../theme/colors";

interface Props {
  label: string;
  options: string[];
  /** Selected options (one item when not `multiple`). */
  values: string[];
  onChange: (values: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
}

/** Dropdown field: tap → popup list. `multiple` shows checkboxes and a Done button. */
export function OptionPickerField({ label, options, values, onChange, multiple = false, placeholder }: Props) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(values);

  function openPicker() {
    setDraft(values);
    setOpen(true);
  }

  function pick(option: string) {
    if (!multiple) {
      onChange([option]);
      setOpen(false);
      return;
    }
    setDraft((cur) => (cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option]));
  }

  function done() {
    onChange(options.filter((o) => draft.includes(o)));
    setOpen(false);
  }

  const summary = values.length ? values.join(", ") : placeholder ?? (multiple ? "Select one or more" : "Select");
  const current = multiple ? draft : values;

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: tokens.mute }]}>{label}</Text>
      <Pressable
        onPress={openPicker}
        style={[styles.input, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${summary}`}
      >
        {multiple && values.length ? (
          <View style={styles.chips}>
            {values.map((v) => (
              <View key={v} style={styles.chip}>
                <LinearGradient
                  colors={[...colors.gradient]}
                  start={gradientDirection.diagonal.start}
                  end={gradientDirection.diagonal.end}
                  style={styles.chipBadge}
                >
                  <Text style={styles.chipBadgeText}>{v.charAt(0).toUpperCase()}</Text>
                </LinearGradient>
                <Text style={styles.chipText}>{v.toUpperCase()}</Text>
                <Pressable
                  onPress={() => onChange(values.filter((x) => x !== v))}
                  hitSlop={8}
                  style={styles.chipRemove}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${v}`}
                >
                  <X size={13} color={tokens.mute} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: values.length ? tokens.txt : tokens.mute, fontSize: 14, flex: 1 }} numberOfLines={2}>
            {summary}
          </Text>
        )}
        <ChevronDown size={16} color={tokens.mute} />
      </Pressable>

      <ModalSheet
        visible={open}
        title={label.replace(/\s*\*$/, "")}
        subtitle={multiple ? "Select all that apply" : undefined}
        icon={<ListChecks />}
        onClose={() => setOpen(false)}
      >
        {options.map((o) => {
          const on = current.includes(o);
          return (
            <Pressable key={o} onPress={() => pick(o)} style={[styles.row, { borderColor: tokens.cardBorder }]}>
              {multiple ? (
                <View
                  style={[
                    styles.box,
                    { borderColor: on ? colors.blue : tokens.cardBorder, backgroundColor: on ? colors.blue : "transparent" },
                  ]}
                >
                  {on ? <Check size={14} color="#fff" /> : null}
                </View>
              ) : null}
              <Text
                style={{
                  flex: 1,
                  fontSize: 15,
                  color: on ? colors.blueFlat : tokens.txt,
                  fontWeight: on ? "700" : "500",
                }}
              >
                {o}
              </Text>
              {!multiple && on ? <Check size={16} color={colors.blueFlat} /> : null}
            </Pressable>
          );
        })}
        {multiple ? (
          <Pressable
            onPress={done}
            disabled={draft.length === 0}
            style={[styles.done, { backgroundColor: colors.blue, opacity: draft.length ? 1 : 0.5 }]}
          >
            <Text style={styles.doneText}>
              {draft.length ? `Done · ${draft.length} selected` : "Select at least one"}
            </Text>
          </Pressable>
        ) : null}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, letterSpacing: 0.3 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: -6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#D6DEF5",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 6,
    shadowColor: colors.blue,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chipBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  chipBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  chipText: { color: colors.blue, fontSize: 12, fontWeight: "700", letterSpacing: 0.4 },
  chipRemove: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  done: { marginTop: 16, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  doneText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
