import { colors } from "./colors";

/** Screen-body / card tokens that swap between light and dark — brand gradients (headers, buttons) stay constant in both modes. */
export interface ThemeTokens {
  bg: string;
  card: string;
  cardBorder: string;
  txt: string;
  txt2: string;
  sub: string;
  mute: string;
  inputBg: string;
  inputBorder: string;
  softBlue: string;
  promoBg: string;
  promoBorder: string;
  promoTitle: string;
  segTrack: string;
  navBg: string;
  navBorder: string;
  logoutBg: string;
  statusBarStyle: "dark-content" | "light-content";
}

export const lightTokens: ThemeTokens = {
  bg: colors.surface,
  card: colors.card,
  cardBorder: colors.border,
  txt: colors.text,
  txt2: colors.text,
  sub: colors.textMuted,
  mute: colors.textLight,
  inputBg: colors.surface,
  inputBorder: colors.border,
  softBlue: colors.bluePale,
  promoBg: "#EAF0FD",
  promoBorder: colors.bluePale,
  promoTitle: colors.blue,
  segTrack: colors.surface,
  navBg: colors.card,
  navBorder: colors.border,
  logoutBg: colors.dangerBg,
  statusBarStyle: "dark-content",
};

export const darkTokens: ThemeTokens = {
  bg: "#0E1420",
  card: "#171F30",
  cardBorder: "#232D42",
  txt: "#F3F5FB",
  txt2: "#E4E8F3",
  sub: "#9AA6C4",
  mute: "#6A7593",
  inputBg: "#1D2740",
  inputBorder: "#2B3654",
  softBlue: "#1E2A4A",
  promoBg: "#1A2340",
  promoBorder: "#26305A",
  promoTitle: "#8FB0FF",
  segTrack: "#0E1420",
  navBg: "#171F30",
  navBorder: "#232D42",
  logoutBg: "#2E1A20",
  statusBarStyle: "light-content",
};
