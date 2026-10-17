import React, { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { isPartnerRole, isRetailerRole } from "../lib/roles";
import { useAuthStore } from "../store/auth";
import { useTheme } from "../theme/ThemeContext";
import { colors } from "../theme/colors";
import { SetLoginMpinGate } from "../screens/SetLoginMpinGate";
import { AppLockScreen } from "../screens/AppLockScreen";
import { AuthFlow } from "./AuthFlow";
import { PartnerTabs } from "./PartnerTabs";
import { RetailerTabs } from "./RetailerTabs";
import { SignupScreen } from "../screens/signup/SignupScreen";
import { syncRememberedLoginProfile } from "../lib/rememberedLogin";
import type { LoginRoleChip } from "../screens/LoginScreen";

// Bank-app-style resume lock: background the app for this long or more, and coming back to the
// foreground requires PIN/fingerprint again — closes the "left it on the table, someone else
// picked it up" window. A quick app-switch (notification check, etc.) doesn't trigger it.
const APP_LOCK_IDLE_MS = 30_000;

export function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const mpinSetupSkipped = useAuthStore((s) => s.mpinSetupSkipped);
  const signupContinue = useAuthStore((s) => s.signupContinue);
  const setSignupContinue = useAuthStore((s) => s.setSignupContinue);
  const { tokens, scheme } = useTheme();

  const backgroundedAtRef = useRef<number | null>(null);
  const [locked, setLocked] = useState(false);

  // Persist agent name for the cold-start lock greeting ("Welcome back {Name}").
  useEffect(() => {
    if (!user?.mobile) return;
    const role: LoginRoleChip =
      user.role === "super_distributor" || user.role === "distributor" ? user.role : "retailer";
    void syncRememberedLoginProfile({
      mobile: user.mobile,
      role,
      name: user.name,
    });
  }, [user?.mobile, user?.name, user?.role]);

  useEffect(() => {
    function handleChange(next: AppStateStatus) {
      if (next === "background" || next === "inactive") {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (next === "active" && backgroundedAtRef.current != null) {
        const elapsed = Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (elapsed >= APP_LOCK_IDLE_MS) setLocked(true);
      }
    }
    const sub = AppState.addEventListener("change", handleChange);
    return () => sub.remove();
  }, []);

  if (!user || !accessToken) {
    return <AuthFlow />;
  }

  if (signupContinue && !user.hasKycDocs) {
    return <SignupScreen onBack={() => setSignupContinue(false)} />;
  }

  if (locked) {
    return <AppLockScreen onUnlock={() => setLocked(false)} />;
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
