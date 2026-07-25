import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Minus, Star } from "lucide-react-native";
import { SvgXml } from "react-native-svg";
import { designTileColors } from "../lib/designIcons";
import { SERVICE_ICON_XML } from "../assets/serviceIconXml";
import { useLongPress } from "../lib/useLongPress";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { showAlert } from "./AppAlert";

interface Props {
  code: string;
  name: string;
  badge?: string | null;
  /** SVG filename from catalog API, e.g. "Aeps.svg" */
  icon?: string | null;
  index?: number;
  isFavorite?: boolean;
  homeEditMode?: boolean;
  wiggle?: boolean;
  onLongPress?: () => void;
  onAdd?: () => void;
  onRemove?: () => void;
  onOpen?: () => void;
}

export function ServiceTile({
  code,
  name,
  badge,
  icon,
  index = 0,
  isFavorite = false,
  homeEditMode = false,
  wiggle = false,
  onLongPress,
  onAdd,
  onRemove,
  onOpen,
}: Props) {
  const { tokens, scheme } = useTheme();
  const wiggleAnim = useRef(new Animated.Value(0)).current;
  const tile = designTileColors(index, scheme === "dark");
  // Catalog filename → bundled SVG. Missing / pending art → blank box (same as web).
  const iconXml = icon ? (SERVICE_ICON_XML[icon] ?? null) : null;

  useEffect(() => {
    if (!homeEditMode || !wiggle) {
      wiggleAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggleAnim, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: -1, duration: 90, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: 0, duration: 90, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [homeEditMode, wiggle, wiggleAnim]);

  const rotate = wiggleAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-2deg", "2deg"],
  });

  function triggerLongPress() {
    if (homeEditMode) return;
    onLongPress?.();
  }

  const longPress = useLongPress(triggerLongPress, 450);

  function openService() {
    longPress.clear();
    if (homeEditMode || longPress.consumeLongPress()) return;
    if (onOpen) {
      onOpen();
      return;
    }
    showAlert(name, "This service will be available soon.");
  }

  const showRemove = homeEditMode && isFavorite && !!onRemove;
  const showAdd = homeEditMode && !isFavorite && !!onAdd;

  return (
    <Animated.View style={[styles.tile, { transform: [{ rotate }] }]}>
      {showRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBadge} accessibilityLabel="Remove">
          <Minus size={11} color="#fff" strokeWidth={3.2} />
        </Pressable>
      ) : null}

      {showAdd ? (
        <Pressable onPress={onAdd} hitSlop={8} style={styles.addBadge} accessibilityLabel="Add to favourites">
          <Star size={12} color="#fff" fill="#fff" strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.press, pressed && !homeEditMode && styles.pressed]}
        onPress={openService}
        onPressIn={onLongPress && !homeEditMode ? longPress.start : undefined}
        onPressOut={onLongPress && !homeEditMode ? longPress.clear : undefined}
      >
        {badge ? (
          <View style={[styles.badge, badge === "NEW" ? styles.badgeNew : styles.badgeHot]}>
            <Text style={[styles.badgeText, badge === "NEW" ? styles.badgeNewText : styles.badgeHotText]}>
              {badge}
            </Text>
          </View>
        ) : null}
        <View style={[styles.iconBox, { backgroundColor: iconXml ? "transparent" : tile.bg }]}>
          {iconXml ? <SvgXml xml={iconXml} width={36} height={36} /> : null}
        </View>
        <Text style={[styles.name, { color: tokens.txt2 }]} numberOfLines={2}>
          {name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 4,
    position: "relative",
  },
  removeBadge: {
    position: "absolute",
    top: 0,
    left: 8,
    zIndex: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  addBadge: {
    position: "absolute",
    top: 0,
    left: 8,
    zIndex: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  press: { width: "100%", alignItems: "center" },
  pressed: { opacity: 0.6 },
  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    zIndex: 2,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeNew: { backgroundColor: colors.green },
  badgeHot: { backgroundColor: "#fef3c7" },
  badgeText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  badgeNewText: { color: "#fff" },
  badgeHotText: { color: "#b45309" },
  name: {
    marginTop: 8,
    fontSize: 10.5,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    lineHeight: 13,
  },
});
