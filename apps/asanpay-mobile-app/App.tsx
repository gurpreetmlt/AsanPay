import React, { useEffect, useState } from "react";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppAlertHost } from "./src/components/AppAlert";
import { LoginApprovalHost } from "./src/components/LoginApprovalHost";
import { ensurePushPermission, startPushListeners, startPushTokenSync } from "./src/lib/push";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { SplashScreen } from "./src/screens/SplashScreen";
import { ThemeProvider } from "./src/theme/ThemeContext";

/** Long enough for one slow Y→A reveal (~1.6s) + brief hold. */
const SPLASH_MS = 2600;

function App(): React.JSX.Element {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => startPushListeners(), []);
  useEffect(() => startPushTokenSync(), []);

  // Ask after the splash so the system prompt does not cover the brand animation.
  useEffect(() => {
    if (!showSplash) ensurePushPermission().catch(() => {});
  }, [showSplash]);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar barStyle="light-content" />
        {showSplash ? <SplashScreen /> : <RootNavigator />}
        {showSplash ? null : <LoginApprovalHost />}
        <AppAlertHost />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;
