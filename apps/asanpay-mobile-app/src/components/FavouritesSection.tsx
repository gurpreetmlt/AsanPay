import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { ServiceTile } from "./ServiceTile";
import { DesignIcon } from "../lib/designIcons";
import { flattenCatalogServices } from "../lib/catalog";
import type { CatalogCategoryView } from "../lib/types";
import { selectFavoriteCodes, useFavoritesStore } from "../store/favorites";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  userId: string;
  categories: CatalogCategoryView[];
  homeEditMode: boolean;
  onEnterEditMode: () => void;
  onOpenService?: (code: string) => void;
}

export function FavouritesSection({ userId, categories, homeEditMode, onEnterEditMode, onOpenService }: Props) {
  const codes = useFavoritesStore((s) => selectFavoriteCodes(s, userId));
  const remove = useFavoritesStore((s) => s.remove);
  const [open, setOpen] = useState(true);
  const { tokens } = useTheme();

  const services = useMemo(() => {
    const catalog = flattenCatalogServices(categories);
    return codes
      .map((code) => catalog.find((s) => s.code === code))
      .filter((s): s is NonNullable<typeof s> => !!s);
  }, [categories, codes]);

  useEffect(() => {
    if (homeEditMode) setOpen(true);
  }, [homeEditMode]);

  function handleRemove(code: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    remove(userId, code);
  }

  function toggleSection() {
    if (homeEditMode) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }

  // Hide until at least one favourite exists — no blank card.
  if (services.length === 0) return null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tokens.card, borderColor: colors.green },
        homeEditMode && styles.cardEditing,
      ]}
    >
      <Pressable
        onPress={toggleSection}
        style={[
          styles.header,
          { borderBottomColor: tokens.cardBorder, backgroundColor: colors.greenBg },
          !open && styles.headerCollapsed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.titleRow}>
          <DesignIcon name="star" size={18} color={colors.green} />
          <Text style={[styles.title, { color: tokens.txt }]}>Favourites</Text>
          <Text style={styles.countBadge}>{services.length}</Text>
        </View>
        {!homeEditMode ? (
          open ? (
            <ChevronUp size={20} color={tokens.sub} strokeWidth={2.2} />
          ) : (
            <ChevronDown size={20} color={tokens.sub} strokeWidth={2.2} />
          )
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {homeEditMode ? (
            <Text style={styles.editHint}>− dabayein favourite se hataane ke liye</Text>
          ) : null}
          <View style={styles.grid}>
            {services.map((s, i) => (
              <ServiceTile
                key={s.id}
                code={s.code}
                name={s.name}
                badge={s.badge}
                icon={s.icon}
                index={i}
                isFavorite
                homeEditMode={homeEditMode}
                wiggle={homeEditMode}
                onLongPress={onEnterEditMode}
                onRemove={() => handleRemove(s.code)}
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
    borderColor: colors.green,
    marginBottom: 14,
    overflow: "hidden",
  },
  cardEditing: { borderColor: colors.blueFlat, borderWidth: 1.5 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 15,
    backgroundColor: colors.greenBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCollapsed: { borderBottomWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  countBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.greenDark,
    backgroundColor: colors.card,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
  body: { paddingHorizontal: 12, paddingBottom: 18, paddingTop: 6 },
  editHint: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.blueFlat,
    textAlign: "center",
    paddingTop: 6,
    paddingBottom: 2,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start" },
});
