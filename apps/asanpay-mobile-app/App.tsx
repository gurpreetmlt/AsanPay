import React from "react";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppAlertHost } from "./src/components/AppAlert";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider } from "./src/theme/ThemeContext";
import { colors } from "./src/theme/colors";

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* Every screen in this design has a blue-gradient header at the very top, so the status bar is always light-content regardless of theme mode. */}
        <StatusBar barStyle="light-content" backgroundColor={colors.blue} />
        <RootNavigator />
        <AppAlertHost />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;
