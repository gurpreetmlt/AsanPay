import React, { useEffect, useState } from "react";
import { LoginScreen, type LoginRoleChip } from "../screens/LoginScreen";
import { WelcomeBackScreen } from "../screens/WelcomeBackScreen";
import { TrustedUnlockScreen } from "../screens/TrustedUnlockScreen";
import { SignupScreen } from "../screens/signup/SignupScreen";
import { getRememberedLogin } from "../lib/rememberedLogin";

type AuthStep = "login" | "welcome" | "signup" | "trustedUnlock";

export function AuthFlow() {
  const [step, setStep] = useState<AuthStep>("login");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<LoginRoleChip>("retailer");
  const [devOtp, setDevOtp] = useState<string | undefined>();
  const [preferMpin, setPreferMpin] = useState(false);
  // Gate first render until this check resolves, so logout never flashes the mobile-number
  // entry screen before jumping straight to Welcome-back PIN unlock (12h device-trust window).
  const [checkedRemembered, setCheckedRemembered] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const remembered = await getRememberedLogin();
      if (alive && remembered) {
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
        onFallbackToOtp={() => {
          setStep("login");
          setPreferMpin(false);
        }}
      />
    );
  }

  if (step === "welcome") {
    return (
      <WelcomeBackScreen
        mobile={mobile}
        role={role}
        devOtp={devOtp}
        preferMpin={preferMpin}
        onBack={() => {
          setStep("login");
          setDevOtp(undefined);
          setPreferMpin(false);
          setRole("retailer");
        }}
      />
    );
  }

  if (step === "signup") {
    return <SignupScreen onBack={() => setStep("login")} />;
  }

  return (
    <LoginScreen
      onOtpSent={(m, selectedRole, otp, mpinFirst) => {
        setMobile(m);
        setRole(selectedRole);
        setDevOtp(otp);
        setPreferMpin(Boolean(mpinFirst));
        setStep("welcome");
      }}
      onSignup={() => setStep("signup")}
    />
  );
}
