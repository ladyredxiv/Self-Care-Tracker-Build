import { Pressable, StyleSheet, Text, View } from "react-native";

import { capacityOptions } from "../db/logic";
import { Palette, useThemedStyles } from "../theme";

/**
 * The morning check-in.
 *
 * Spoon theory's premise is that you wake with a variable number of spoons, so the
 * day's capacity should be something you're asked, not a field silently carrying
 * yesterday's answer forward. Shown only until capacity has been confirmed for the
 * day — it's a prompt, not a permanent fixture, and the exact number stays editable
 * in the budget card either way.
 */
export default function CapacityCheckIn({
  baseline,
  onChoose,
  onDismiss,
}: {
  baseline: number;
  onChoose: (spoons: number) => void;
  onDismiss: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const options = capacityOptions(baseline);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>How many spoons today?</Text>
      <Text style={styles.subtitle}>
        Roughly is fine. You can change it whenever the day turns out different.
      </Text>

      <View style={styles.row}>
        {options.map((option) => (
          <Pressable
            key={option.key}
            style={styles.option}
            onPress={() => onChoose(option.spoons)}
          >
            <Text style={styles.optionSpoons}>{option.spoons}</Text>
            <Text style={styles.optionLabel}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={onDismiss} hitSlop={8}>
        <Text style={styles.skip}>Keep {baseline} for now</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 16,
      borderRadius: 16,
      backgroundColor: palette.surfaceAlt,
      borderWidth: 1,
      borderColor: palette.border,
    },
    title: { fontSize: 16, fontWeight: "700", color: palette.textPrimary },
    subtitle: { fontSize: 13, color: palette.textMuted, marginTop: 4, lineHeight: 18 },
    row: { flexDirection: "row", gap: 8, marginTop: 14 },
    option: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    optionSpoons: { fontSize: 20, fontWeight: "700", color: palette.textPrimary },
    optionLabel: { fontSize: 11, color: palette.textMuted, marginTop: 2 },
    skip: { fontSize: 13, color: palette.textMuted, marginTop: 14, textAlign: "center" },
  });
