import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ChevronDown, Search } from "lucide-react-native";
import { findIndianState, searchIndianStates } from "@asanpay/shared-types";
import { ModalSheet } from "./ModalSheet";
import { useTheme } from "../theme/ThemeContext";
import { colors } from "../theme/colors";

interface Props {
  label: string;
  value: string;
  onChange: (code: string) => void;
}

export function StatePickerField({ label, value, onChange }: Props) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = findIndianState(value);
  const results = useMemo(() => searchIndianStates(query), [query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: tokens.sub }]}>{label}</Text>
      <Pressable
        style={[styles.input, { borderColor: tokens.cardBorder, backgroundColor: tokens.card }]}
        onPress={() => setOpen(true)}
      >
        <Text style={{ color: selected ? tokens.txt : tokens.mute, fontSize: 15, flex: 1 }} numberOfLines={1}>
          {selected ? selected.name : "Select state"}
        </Text>
        <ChevronDown size={16} color={tokens.mute} />
      </Pressable>

      <ModalSheet visible={open} title={label} onClose={close}>
        <View style={[styles.searchRow, { borderColor: tokens.cardBorder }]}>
          <Search size={16} color={tokens.mute} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search state"
            placeholderTextColor={tokens.mute}
            style={[styles.searchInput, { color: tokens.txt }]}
            autoFocus
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={results}
          keyExtractor={(s) => s.code}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: tokens.sub }]}>No state matches “{query}”</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => {
                onChange(item.code);
                close();
              }}
            >
              <Text
                style={{
                  color: item.code === value ? colors.blueFlat : tokens.txt,
                  fontWeight: item.code === value ? "700" : "400",
                  fontSize: 15,
                  flex: 1,
                }}
              >
                {item.name}
              </Text>
              <Text style={{ color: tokens.mute, fontSize: 12 }}>{item.code}</Text>
            </Pressable>
          )}
        />
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  list: { maxHeight: 360 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  empty: { paddingVertical: 16, textAlign: "center", fontSize: 13 },
});
