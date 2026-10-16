import { Text, type StyleProp, type TextStyle } from "react-native";

/** Brand danger red for required-field asterisks. */
export const REQUIRED_STAR_COLOR = "#DC2626";

export function RequiredMark({ style }: { style?: StyleProp<TextStyle> }) {
  return <Text style={[{ color: REQUIRED_STAR_COLOR, fontWeight: "800" }, style]}> *</Text>;
}

/** Split trailing ` *` from a label into text + red star. */
export function LabelText({
  label,
  color,
  style,
}: {
  label: string;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const m = /^(.*?)\s*\*\s*$/.exec(label);
  if (!m) return <Text style={[{ color }, style]}>{label}</Text>;
  return (
    <Text style={[{ color }, style]}>
      {m[1]}
      <RequiredMark />
    </Text>
  );
}
