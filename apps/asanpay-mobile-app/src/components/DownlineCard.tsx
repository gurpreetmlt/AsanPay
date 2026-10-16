import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, Power } from "lucide-react-native";
import type { DownlineUser } from "../lib/types";
import { formatINR } from "../lib/format";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

const AVATAR_COLORS = ["#EA580C", "#16A34A", "#2563EB", "#7C3AED", "#DB2777", "#0D9488"];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

interface Props {
  user: DownlineUser;
  onFund: (user: DownlineUser) => void;
  onToggleActive?: (user: DownlineUser) => void;
  toggling?: boolean;
  last?: boolean;
}

export function DownlineCard({ user, onFund, onToggleActive, toggling, last }: Props) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: tokens.cardBorder }]}>
      <View style={[styles.avatar, { backgroundColor: avatarColor(user.id) }]}>
        <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: tokens.txt }]}>{user.name}</Text>
        <Text style={[styles.uid, { color: tokens.sub }]}>{user.uid}</Text>
        <Text style={[styles.mobile, { color: tokens.txt }]}>{user.mobile}</Text>
        <View style={styles.balPill}>
          <Text style={styles.balText}>Bal: {formatINR(user.mainBalance)}</Text>
        </View>
        {!user.isActive ? <Text style={styles.inactive}>Inactive</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => onFund(user)}
          disabled={!user.isActive}
          style={[styles.btn, styles.btnTransfer, !user.isActive && styles.disabled]}
        >
          <Text style={styles.btnTransferText}>Wallet</Text>
          <ArrowRight size={14} color={colors.greenDark} strokeWidth={2.4} />
        </Pressable>
        {onToggleActive ? (
          <Pressable
            onPress={() => onToggleActive(user)}
            disabled={toggling}
            style={[
              styles.btn,
              user.isActive ? styles.btnDisable : styles.btnEnable,
              toggling && styles.disabled,
            ]}
            accessibilityLabel={user.isActive ? "Disable agent" : "Enable agent"}
          >
            {toggling ? (
              <ActivityIndicator size="small" color={user.isActive ? colors.danger : colors.green} />
            ) : (
              <>
                <Power
                  size={14}
                  color={user.isActive ? colors.dangerDark : colors.greenDark}
                  strokeWidth={2.4}
                />
                <Text style={user.isActive ? styles.btnDisableText : styles.btnEnableText}>
                  {user.isActive ? "Disable" : "Enable"}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 16, gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginTop: 2 },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: "800" },
  uid: { fontSize: 13, marginTop: 2 },
  mobile: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  balPill: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: colors.greenBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  balText: { color: colors.greenDark, fontSize: 12.5, fontWeight: "800" },
  inactive: { color: colors.dangerDark, fontSize: 11, fontWeight: "800", marginTop: 4 },
  actions: { gap: 8, alignItems: "stretch" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 104,
  },
  btnTransfer: { borderColor: colors.green, backgroundColor: "#fff" },
  btnTransferText: { color: colors.greenDark, fontWeight: "800", fontSize: 12.5 },
  btnDisable: { borderColor: colors.danger, backgroundColor: "#fff" },
  btnDisableText: { color: colors.dangerDark, fontWeight: "800", fontSize: 12.5 },
  btnEnable: { borderColor: colors.green, backgroundColor: "#fff" },
  btnEnableText: { color: colors.greenDark, fontWeight: "800", fontSize: 12.5 },
  disabled: { opacity: 0.45 },
});
