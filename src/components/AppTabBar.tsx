import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Palette, useThemedStyles } from "../theme";

type Tab = "today" | "trends" | "tasks" | "settings";

const tabs: { id: Tab; label: string; glyph: string; screen: string }[] = [
  { id: "today", label: "Today", glyph: "◐", screen: "Home" },
  { id: "trends", label: "Trends", glyph: "▥", screen: "Stats" },
  { id: "tasks", label: "Tasks", glyph: "☷", screen: "Tasks" },
  { id: "settings", label: "Settings", glyph: "⚙", screen: "Settings" },
];

export default function AppTabBar({ active }: { active: Tab }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            style={styles.tab}
            onPress={() => navigation.navigate(tab.screen)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
          >
            <Text style={[styles.glyph, selected && styles.glyphActive]}>{tab.glyph}</Text>
            <Text style={[styles.label, selected && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: "row",
      paddingTop: 10,
      backgroundColor: palette.surface,
      borderTopWidth: 1,
      borderColor: palette.borderSubtle,
      shadowColor: "#3a2a28",
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 12,
    },
    tab: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center" },
    glyph: { color: palette.icon, fontSize: 20, lineHeight: 22 },
    glyphActive: { color: palette.accent },
    label: { fontSize: 11, color: palette.textMuted, marginTop: 2 },
    labelActive: { color: palette.textPrimary, fontWeight: "700" },
  });
