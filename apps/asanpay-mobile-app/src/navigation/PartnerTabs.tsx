import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BookText, CircleArrowUp, House, Settings, Users } from "lucide-react-native";
import { PartnerHomeScreen } from "../screens/partner/PartnerHomeScreen";
import { NetworkScreen } from "../screens/partner/NetworkScreen";
import { PartnerLedgerScreen } from "../screens/partner/PartnerLedgerScreen";
import { WalletScreen } from "../screens/shared/WalletScreen";
import { AccountScreen } from "../screens/shared/AccountScreen";
import { FundRequestsScreen } from "../screens/shared/FundRequestScreen";
import { TabBarIcon } from "../components/TabBarIcon";
import { useTheme } from "../theme/ThemeContext";
import { useAuthStore } from "../store/auth";
import { getTabBarScreenOptions } from "./tabBarStyles";

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Home: House,
  Network: Users,
  Ledger: BookText,
  Requests: CircleArrowUp,
  Settings: Settings,
} as const;

export function PartnerTabs() {
  const { tokens } = useTheme();
  const role = useAuthStore((s) => s.user?.role);
  const networkLabel = role === "super_distributor" ? "Distrs." : "Retailers";
  const base = getTabBarScreenOptions(tokens);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...base,
        tabBarLabelStyle: [base.tabBarLabelStyle, { fontSize: 10.5 }],
        tabBarAllowFontScaling: false,
        tabBarIcon: ({ focused }) => (
          <TabBarIcon
            icon={TAB_ICONS[route.name as keyof typeof TAB_ICONS] ?? Users}
            focused={focused}
          />
        ),
      })}
    >
      <Tab.Screen name="Home" component={PartnerHomeScreen} />
      <Tab.Screen name="Network" component={NetworkScreen} options={{ tabBarLabel: networkLabel }} />
      <Tab.Screen name="Ledger" component={PartnerLedgerScreen} />
      <Tab.Screen name="Requests" component={FundRequestsScreen} />
      <Tab.Screen name="Settings" component={AccountScreen} />
      <Tab.Screen
        name="Balance"
        component={WalletScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" } }}
      />
    </Tab.Navigator>
  );
}
