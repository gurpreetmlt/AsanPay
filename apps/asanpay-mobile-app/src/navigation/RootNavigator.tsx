import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { isPartnerRole, isRetailerRole } from "../lib/roles";
import { useAuthStore } from "../store/auth";
import { useTheme } from "../theme/ThemeContext";
import { colors } from "../theme/colors";
import { SetLoginMpinGate } from "../screens/SetLoginMpinGate";
import { AuthFlow } from "./AuthFlow";
import { PartnerTabs } from "./PartnerTabs";
import { RetailerTabs } from "./RetailerTabs";

export function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const mpinSetupSkipped = useAuthStore((s) => s.mpinSetupSkipped);
  const { tokens, scheme } = useTheme();

  if (!user || !accessToken) {
    return <AuthFlow />;
  }

  if (!user.hasLoginMpin && !mpinSetupSkipped) {
    return <SetLoginMpinGate />;
  }

  const navTheme = {
    dark: scheme === "dark",
    colors: {
      primary: colors.blue,
      background: tokens.bg,
      card: tokens.card,
      text: tokens.txt,
      border: tokens.cardBorder,
      notification: colors.green,
    },
    fonts: {
      regular: { fontFamily: "System", fontWeight: "400" as const },
      medium: { fontFamily: "System", fontWeight: "500" as const },
      bold: { fontFamily: "System", fontWeight: "700" as const },
      heavy: { fontFamily: "System", fontWeight: "800" as const },
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      {isRetailerRole(user.role) ? (
        <RetailerTabs />
      ) : isPartnerRole(user.role) ? (
        <PartnerTabs />
      ) : (
        <AuthFlow />
      )}
    </NavigationContainer>
  );
}
