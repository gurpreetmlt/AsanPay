import React from "react";
import type { LucideIcon } from "lucide-react-native";
import { GradientServiceIcon } from "./GradientServiceIcon";
import { colors } from "../theme/colors";

interface Props {
  icon: LucideIcon;
  focused: boolean;
  size?: number;
}

// Bottom tab icon: gradient stroke when active, muted grey when inactive.
export function TabBarIcon({ icon: Icon, focused, size = 23 }: Props) {
  if (focused) {
    return <GradientServiceIcon icon={Icon} size={size} strokeWidth={2.2} />;
  }
  return <Icon size={size} color={colors.textMuted} strokeWidth={1.9} />;
}
