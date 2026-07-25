import React from "react";
import {
  Defs as RawDefs,
  LinearGradient as RawLinearGradient,
  Stop as RawStop,
} from "react-native-svg";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "../theme/colors";

// react-native-svg is typed against @types/react 19 (hoisted at the monorepo root),
// while this app runs @types/react 18 — re-type as plain components (runtime unchanged).
const Defs = RawDefs as unknown as React.ComponentType<{ children?: React.ReactNode }>;
const LinearGradient = RawLinearGradient as unknown as React.ComponentType<{
  id: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  children?: React.ReactNode;
}>;
const Stop = RawStop as unknown as React.ComponentType<{ offset: string; stopColor: string }>;

const GRAD_ID = "ap-icon-gradient";

interface Props {
  icon: LucideIcon;
  size?: number;
  strokeWidth?: number;
}

export function GradientServiceIcon({ icon: Icon, size = 30, strokeWidth = 1.9 }: Props) {
  return (
    <Icon size={size} color={`url(#${GRAD_ID})`} strokeWidth={strokeWidth}>
      <Defs>
        <LinearGradient id={GRAD_ID} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.gradientButton[0]} />
          <Stop offset="1" stopColor={colors.gradientButton[1]} />
        </LinearGradient>
      </Defs>
    </Icon>
  );
}
