import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { getSetting, setSetting } from "./db/database";

export const THEME_PREFERENCE_KEY = "themePreference";

export type ThemePreference = "system" | "light" | "dark";

/**
 * Hex literal. Typed this narrowly because the home-screen widget's style props
 * demand it, and a plain `string` there fails to compile — which is a useful
 * guarantee that every token really is a colour.
 */
export type HexColor = `#${string}`;

/**
 * Semantic colour tokens. Screens reference roles rather than hex values so a
 * second palette doesn't require auditing every style block.
 */
export interface Palette {
  background: HexColor;
  /** Rows and inputs. */
  surface: HexColor;
  /** Raised panels like the budget card. */
  surfaceAlt: HexColor;
  border: HexColor;
  borderSubtle: HexColor;
  textPrimary: HexColor;
  textSecondary: HexColor;
  textMuted: HexColor;
  /** Filled buttons and selected chips. */
  accent: HexColor;
  onAccent: HexColor;
  /**
   * Sage accent, for the one thing on screen that should draw the eye: spoons
   * remaining, essentials, restorative tasks. The base palette sits within a few
   * percent of the same warm value, which is calm but means nothing *can* be
   * emphasised — this is the only hue allowed to break that.
   */
  highlight: HexColor;
  /** Tinted background for highlighted rows. */
  highlightSoft: HexColor;
  /** Unfilled spoon marks — spent, not missing. */
  spoonEmpty: HexColor;
  doneSurface: HexColor;
  doneBorder: HexColor;
  doneText: HexColor;
  warning: HexColor;
  danger: HexColor;
  icon: HexColor;
  chartBudget: HexColor;
  chartSpent: HexColor;
  chartOver: HexColor;
  badgeSurface: HexColor;
  badgeBorder: HexColor;
  badgeText: HexColor;
}

export const lightPalette: Palette = {
  background: "#fdfaf6",
  surface: "#ffffff",
  surfaceAlt: "#f1e6dd",
  border: "#d9c7ba",
  borderSubtle: "#eee2d8",
  textPrimary: "#3c332d",
  textSecondary: "#6b5c52",
  textMuted: "#8a7b70",
  accent: "#4a3f38",
  onAccent: "#ffffff",
  highlight: "#4f7d55",
  highlightSoft: "#e8f1e8",
  spoonEmpty: "#e0d4c7",
  doneSurface: "#e7f3e8",
  doneBorder: "#cfe6d2",
  doneText: "#3c7a3f",
  warning: "#a15c3c",
  danger: "#a1443c",
  icon: "#a8998c",
  chartBudget: "#e3d5c8",
  chartSpent: "#5f8f63",
  chartOver: "#c1573f",
  badgeSurface: "#ece3f5",
  badgeBorder: "#d5c6e6",
  badgeText: "#5d4d70",
};

/**
 * Warm dark rather than neutral black, to keep the app's character. Surfaces step
 * lighter as they come forward, which reads as depth without needing shadows.
 */
export const darkPalette: Palette = {
  background: "#1b1714",
  surface: "#272019",
  surfaceAlt: "#332a22",
  border: "#4c4036",
  borderSubtle: "#372e26",
  textPrimary: "#f3ebe3",
  textSecondary: "#c6b7a9",
  textMuted: "#9c8d80",
  accent: "#e9ddd0",
  onAccent: "#2a231d",
  highlight: "#8fc79a",
  highlightSoft: "#233026",
  spoonEmpty: "#40372f",
  doneSurface: "#233027",
  doneBorder: "#364a3a",
  doneText: "#93c698",
  warning: "#e3a077",
  danger: "#e59288",
  icon: "#8b7b6d",
  chartBudget: "#4c4036",
  chartSpent: "#74ad79",
  chartOver: "#d8785d",
  badgeSurface: "#2f2839",
  badgeBorder: "#483d58",
  badgeText: "#cbbade",
};

interface ThemeValue {
  palette: Palette;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue>({
  palette: lightPalette,
  isDark: false,
  preference: "system",
  setPreference: () => {},
});

function readStoredPreference(): ThemePreference {
  const stored = getSetting(THEME_PREFERENCE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

/**
 * Must be mounted after initDatabase, since the stored preference is read
 * synchronously on first render.
 *
 * Note that "system" can only track the OS once app.json's userInterfaceStyle is
 * "automatic". It's deliberately still "light" so that theming ships as a
 * JS-only, over-the-air change — app config is part of the update fingerprint, and
 * touching it would strand every installed build. Explicit light/dark work
 * regardless, because the palette is chosen in JS.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);

  const setPreference = useCallback((next: ThemePreference) => {
    setSetting(THEME_PREFERENCE_KEY, next);
    setPreferenceState(next);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const isDark = preference === "system" ? systemScheme === "dark" : preference === "dark";
    return {
      palette: isDark ? darkPalette : lightPalette,
      isDark,
      preference,
      setPreference,
    };
  }, [preference, systemScheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/**
 * Builds themed styles, memoised on the palette so switching themes rebuilds them
 * but ordinary re-renders don't.
 */
export function useThemedStyles<T>(factory: (palette: Palette) => T): T {
  const { palette } = useTheme();
  return useMemo(() => factory(palette), [palette, factory]);
}
