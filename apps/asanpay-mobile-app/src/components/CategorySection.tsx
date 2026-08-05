import React, { useEffect, useMemo, useState } from "react";
import { Image, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { ServiceTile } from "./ServiceTile";
import { DesignIcon, categoryIconToDesignKey } from "../lib/designIcons";
import type { CatalogCategoryView } from "../lib/types";
import { MAX_FAVORITES, selectFavoriteCodes, useFavoritesStore } from "../store/favorites";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { showAlert } from "./AppAlert";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Same order as agent-portal Banking AePS box. */
const AEPS_ORDER = ["CASH_WITHDRAW", "MINI_STATEMENT", "CASH_DEPOSIT", "BALANCE_ENQUIRY"] as const;
const AEPS_CODES = new Set<string>(AEPS_ORDER);

interface Props {
  category: CatalogCategoryView;
  userId: string;
  defaultOpen?: boolean;
  homeEditMode: boolean;
  onEnterEditMode: () => void;
  onOpenService?: (code: string) => void;
}

export function CategorySection({
  category,
  userId,
  defaultOpen = true,
  homeEditMode,
  onEnterEditMode,
  onOpenService,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const favoriteCodes = useFavoritesStore((s) => selectFavoriteCodes(s, userId));
  const toggle = useFavoritesStore((s) => s.toggle);
  const { tokens } = useTheme();

  useEffect(() => {
    if (homeEditMode) setOpen(true);
  }, [homeEditMode]);

  const isBanking = category.code === "BANKING_SERVICES";
  const headerIcon = categoryIconToDesignKey(category.icon);
  const headerAccent =
    category.code === "BANKING_SERVICES"
      ? "#2A5CDD"
      : category.code === "BILL_PAYMENT_BBPS" ||
          category.code.includes("PAYMENT") ||
          category.code.includes("RECHARGE")
        ? "#7A56D6"
        : "#E8843C";

  const { aepsServices, otherServices } = useMemo(() => {
    if (!isBanking) {
      return { aepsServices: [] as typeof category.services, otherServices: category.services };
    }
    const byCode = new Map(category.services.map((s) => [s.code, s]));
    const aeps = AEPS_ORDER.map((code) => byCode.get(code)).filter(
      (s): s is (typeof category.services)[number] => Boolean(s),
    );
    const other = category.services.filter((s) => !AEPS_CODES.has(s.code));
    return { aepsServices: aeps, otherServices: other };
  }, [category.services, isBanking]);

  function toggleSection() {
    if (homeEditMode) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }

  function handleAddFavorite(code: string) {
    if (favoriteCodes.includes(code)) return;
    const result = toggle(userId, code);
    if (result.limitReached) {
      showAlert(
        "Favourites full",
        `Maximum ${MAX_FAVORITES} favourites. Pehle koi hataayein.`,
      );
    }
  }

  function renderTile(s: (typeof category.services)[number], i: number) {
    return (
      <ServiceTile
        key={s.id}
        code={s.code}
        name={s.name}
        badge={s.badge}
        icon={s.icon}
        index={i}
        isFavorite={favoriteCodes.includes(s.code)}
        homeEditMode={homeEditMode}
        onLongPress={onEnterEditMode}
        onAdd={() => handleAddFavorite(s.code)}
        onOpen={onOpenService ? () => onOpenService(s.code) : undefined}
      />
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tokens.card, borderColor: tokens.cardBorder },
        homeEditMode && styles.cardEditing,
      ]}
    >
      <Pressable
        onPress={toggleSection}
        style={[styles.header, { borderBottomColor: tokens.cardBorder }, !open && styles.headerCollapsed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.titleRow}>
          <DesignIcon name={headerIcon} size={21} color={headerAccent} />
          <Text style={[styles.title, { color: tokens.txt }]}>{category.name}</Text>
        </View>
        <View style={styles.headerRight}>
          {!homeEditMode && !open ? (
            <Text style={[styles.count, { color: tokens.sub }]}>{category.services.length} services</Text>
          ) : null}
          {!homeEditMode ? (
            open ? (
              <ChevronUp size={20} color={tokens.sub} strokeWidth={2.2} />
            ) : (
              <ChevronDown size={20} color={tokens.sub} strokeWidth={2.2} />
            )
          ) : null}
        </View>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {isBanking && aepsServices.length > 0 ? (
            <View style={[styles.aepsBox, { borderColor: tokens.cardBorder }]}>
              <View style={styles.aepsLogoRow} pointerEvents="none">
                <View style={[styles.aepsLogoPill, { backgroundColor: tokens.card, borderColor: tokens.cardBorder }]}>
                  <Image
                    source={require("../assets/AEPS-Logo.png")}
                    style={styles.aepsLogo}
                    resizeMode="contain"
                    accessibilityLabel="AePS"
                  />
                </View>
              </View>
              <View style={styles.aepsGrid}>{aepsServices.map((s, i) => renderTile(s, i))}</View>
            </View>
          ) : null}
          <View style={styles.grid}>
            {(isBanking ? otherServices : category.services).map((s, i) =>
              renderTile(s, i + aepsServices.length),
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    overflow: "hidden",
  },
  cardEditing: { borderColor: colors.bluePale, borderWidth: 1.5 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCollapsed: { borderBottomWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 11, flex: 1 },
  title: { fontSize: 16, fontWeight: "700", color: colors.text, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 8 },
  count: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  body: { paddingTop: 6, paddingBottom: 18 },
  aepsBox: {
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingTop: 18,
    paddingBottom: 6,
    position: "relative",
  },
  aepsLogoRow: {
    position: "absolute",
    top: -10,
    left: 0,
    right: 10,
    alignItems: "flex-end",
    zIndex: 2,
  },
  aepsLogoPill: {
    width: 78,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  aepsLogo: { width: 70, height: 14 },
  aepsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    paddingHorizontal: 12,
  },
});
