import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LayoutGrid, History, Wallet, User } from "lucide-react-native";
import { ServicesScreen } from "../screens/retailer/ServicesScreen";
import { PassbookScreen } from "../screens/shared/PassbookScreen";
import { WalletScreen } from "../screens/shared/WalletScreen";
import { AccountScreen } from "../screens/shared/AccountScreen";
import { TabBarIcon } from "../components/TabBarIcon";
import { useTheme } from "../theme/ThemeContext";
import { getTabBarScreenOptions } from "./tabBarStyles";

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Services: LayoutGrid,
  History: History,
  Wallet: Wallet,
  Account: User,
} as const;

export function RetailerTabs() {
  const { tokens } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...getTabBarScreenOptions(tokens),
        tabBarIcon: ({ focused }) => (
          <TabBarIcon
            icon={TAB_ICONS[route.name as keyof typeof TAB_ICONS] ?? LayoutGrid}
            focused={focused}
          />
        ),
      })}
    >
      <Tab.Screen name="Services" component={ServicesScreen} />
      <Tab.Screen name="History" component={PassbookScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}
