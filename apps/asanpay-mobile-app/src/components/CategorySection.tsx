import React, { useEffect, useState } from "react";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";
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

  const showAeps = category.code === "BANKING_SERVICES";
  const headerIcon = categoryIconToDesignKey(category.icon);
  const headerAccent =
    category.code === "BANKING_SERVICES"
      ? "#2A5CDD"
      : category.code === "BILL_PAYMENT_BBPS" ||
          category.code.includes("PAYMENT") ||
          category.code.includes("RECHARGE")
        ? "#7A56D6"
        : "#E8843C";

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
          {showAeps ? <Text style={styles.aepsTag}>AEPS</Text> : null}
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
          <View style={styles.grid}>
            {category.services.map((s, i) => (
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
            ))}
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
  aepsTag: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.greenDark,
    letterSpacing: 0.6,
    backgroundColor: colors.greenBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 8 },
  count: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  body: { paddingTop: 6, paddingBottom: 18 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    paddingHorizontal: 12,
  },
});
