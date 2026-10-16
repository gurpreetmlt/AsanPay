import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BookText, CircleArrowUp, LayoutGrid, User, Wallet } from "lucide-react-native";
import { isFundRequestEnabled } from "@asanpay/shared-types";
import { ServicesScreen } from "../screens/retailer/ServicesScreen";
import { PartnerLedgerScreen } from "../screens/partner/PartnerLedgerScreen";
import { FundRequestsScreen } from "../screens/shared/FundRequestScreen";
import { WalletScreen } from "../screens/shared/WalletScreen";
import { AccountScreen } from "../screens/shared/AccountScreen";
import { TabBarIcon } from "../components/TabBarIcon";
import { useTheme } from "../theme/ThemeContext";
import { useAuthStore } from "../store/auth";
import { getTabBarScreenOptions } from "./tabBarStyles";

const Tab = createBottomTabNavigator();

export function RetailerTabs() {
  const { tokens } = useTheme();
  const user = useAuthStore((s) => s.user);
  const fundOn = user ? isFundRequestEnabled(user.role, user.fundRequestEnabled) : false;
  const base = getTabBarScreenOptions(tokens);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...base,
        tabBarLabelStyle: [base.tabBarLabelStyle, { fontSize: 10.5 }],
        tabBarAllowFontScaling: false,
        tabBarIcon: ({ focused }) => {
          const icon =
            route.name === "Services"
              ? LayoutGrid
              : route.name === "Ledger"
                ? BookText
                : route.name === "Requests"
                  ? CircleArrowUp
                  : route.name === "Balance"
                    ? Wallet
                    : User;
          return <TabBarIcon icon={icon} focused={focused} />;
        },
      })}
    >
      <Tab.Screen name="Services" component={ServicesScreen} />
      <Tab.Screen name="Ledger" component={PartnerLedgerScreen} />
      {fundOn ? <Tab.Screen name="Requests" component={FundRequestsScreen} /> : null}
      <Tab.Screen name="Balance" component={WalletScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}
