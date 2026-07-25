import React, { useState } from "react";
import { LoginScreen, type LoginRoleChip } from "../screens/LoginScreen";
import { WelcomeBackScreen } from "../screens/WelcomeBackScreen";
import { SignupScreen } from "../screens/signup/SignupScreen";

type AuthStep = "login" | "welcome" | "signup";

export function AuthFlow() {
  const [step, setStep] = useState<AuthStep>("login");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<LoginRoleChip>("retailer");
  const [devOtp, setDevOtp] = useState<string | undefined>();
  const [preferMpin, setPreferMpin] = useState(false);

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
