import React, { useEffect, useState } from "react";
import { LoginScreen, type LoginRoleChip } from "../screens/LoginScreen";
import { TrustedUnlockScreen } from "../screens/TrustedUnlockScreen";
import { SignupScreen } from "../screens/signup/SignupScreen";
import { getRememberedLogin, isTrustWindowExpired } from "../lib/rememberedLogin";

type AuthStep = "login" | "signup" | "trustedUnlock";

export function AuthFlow() {
  const [step, setStep] = useState<AuthStep>("login");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<LoginRoleChip>("retailer");
  // Gate first render until this check resolves, so logout never flashes the mobile-number
  // entry screen before jumping straight to Welcome-back PIN unlock (12h device-trust window).
  const [checkedRemembered, setCheckedRemembered] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const remembered = await getRememberedLogin();
      // If the 12h trust window has already lapsed, don't show PIN just to bounce off a
      // DEVICE_NOT_TRUSTED response — go straight to full login (mobile number entry).
      if (alive && remembered && !isTrustWindowExpired(remembered)) {
        setMobile(remembered.mobile);
        setRole(remembered.role);
        setStep("trustedUnlock");
      }
      if (alive) setCheckedRemembered(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!checkedRemembered) return null;

  if (step === "trustedUnlock") {
    return (
      <TrustedUnlockScreen
        mobile={mobile}
        role={role}
        onFallbackToOtp={() => setStep("login")}
      />
    );
  }

  if (step === "signup") {
    return <SignupScreen initialRole={role} onBack={() => setStep("login")} />;
  }

  return (
    <LoginScreen
      onSignup={(selected) => {
        setRole(selected);
        setStep("signup");
      }}
    />
  );
}
