import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Palette, useTheme, useThemedStyles } from "../theme";
import TabIcon, { TabIconName } from "./TabIcon";

type Tab = "today" | "trends" | "tasks" | "settings";

const tabs: { id: Tab; label: string; icon: TabIconName; screen: string }[] = [
  { id: "today", label: "Today", icon: "today", screen: "Home" },
  { id: "trends", label: "Trends", icon: "trends", screen: "Stats" },
  { id: "tasks", label: "Tasks", icon: "tasks", screen: "Tasks" },
  { id: "settings", label: "Settings", icon: "settings", screen: "Settings" },
];

export default function AppTabBar({ active }: { active: Tab }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();

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
            <TabIcon
              name={tab.icon}
              color={selected ? palette.accent : palette.icon}
            />
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
    tab: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", gap: 3 },
    label: { fontSize: 11, color: palette.textMuted, marginTop: 2 },
    labelActive: { color: palette.textPrimary, fontWeight: "700" },
  });
