import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Users, BookText, User } from "lucide-react-native";
import { NetworkScreen } from "../screens/partner/NetworkScreen";
import { PassbookScreen } from "../screens/shared/PassbookScreen";
import { AccountScreen } from "../screens/shared/AccountScreen";
import { TabBarIcon } from "../components/TabBarIcon";
import { useTheme } from "../theme/ThemeContext";
import { getTabBarScreenOptions } from "./tabBarStyles";

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Network: Users,
  Passbook: BookText,
  Account: User,
} as const;

export function PartnerTabs() {
  const { tokens } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...getTabBarScreenOptions(tokens),
        tabBarIcon: ({ focused }) => (
          <TabBarIcon
            icon={TAB_ICONS[route.name as keyof typeof TAB_ICONS] ?? Users}
            focused={focused}
          />
        ),
      })}
    >
      <Tab.Screen name="Network" component={NetworkScreen} />
      <Tab.Screen name="Passbook" component={PassbookScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}
