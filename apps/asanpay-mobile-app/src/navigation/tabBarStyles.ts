import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { colors } from "../theme/colors";
import type { ThemeTokens } from "../theme/tokens";

export function getTabBarScreenOptions(tokens: ThemeTokens): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.green,
    tabBarInactiveTintColor: tokens.sub,
    tabBarStyle: {
      backgroundColor: tokens.navBg,
      borderTopWidth: 1,
      borderTopColor: tokens.navBorder,
      height: 64,
      paddingBottom: 10,
      paddingTop: 8,
      shadowColor: colors.blue,
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -4 },
      elevation: 12,
    },
    tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  };
}
