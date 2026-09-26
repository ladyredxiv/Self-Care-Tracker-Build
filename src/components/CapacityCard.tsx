import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { capacityOptions } from "../db/logic";
import { Palette, useThemedStyles } from "../theme";
import { formatSleepDuration } from "../utils/sleepInsight";
import SpoonMeter from "./SpoonMeter";

/**
 * The single card at the top of Home.
 *
 * Previously this was two cards — a budget card and a separate check-in — which
 * between them printed the same number four times and pushed the task list below
 * the halfway point of the screen. They ask overlapping questions, so they're one
 * card with two states.
 */
export default function CapacityCard({
  budget,
  spent,
  needsCheckIn,
  sleepHours,
  budgetInput,
  onBudgetInputChange,
  onBudgetCommit,
  onChoose,
  onDismiss,
  onOpenTrends,
  onOpenSettings,
}: {
  budget: number;
  spent: number;
  needsCheckIn: boolean;
  sleepHours: number | null;
  budgetInput: string;
  onBudgetInputChange: (value: string) => void;
  onBudgetCommit: () => void;
  onChoose: (spoons: number) => void;
  onDismiss: () => void;
  onOpenTrends: () => void;
  onOpenSettings: () => void;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Today</Text>
        <View style={styles.headerLinks}>
          <Pressable
            onPress={onOpenTrends}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Trends"
            style={styles.iconButton}
          >
            <Text style={styles.headerLink}>Trends</Text>
          </Pressable>
          <Pressable
            onPress={onOpenSettings}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={styles.iconButton}
          >
            <Text style={styles.headerLink}>Settings</Text>
          </Pressable>
        </View>
      </View>

      {needsCheckIn ? (
        <>
          <Text style={styles.question}>How many spoons today?</Text>
          <Text style={styles.subtitle}>
            Roughly is fine.
            {sleepHours !== null ? ` You slept about ${formatSleepDuration(sleepHours)}.` : ""}
          </Text>

          <View style={styles.optionRow}>
            {capacityOptions(budget).map((option) => (
              <Pressable
                key={option.key}
                style={styles.option}
                onPress={() => onChoose(option.spoons)}
                accessibilityRole="button"
                accessibilityLabel={`${option.label}, ${option.spoons} spoons`}
              >
                <Text style={styles.optionSpoons}>{option.spoons}</Text>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button">
            <Text style={styles.skip}>Keep {budget} for now</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.countRow}>
            <TextInput
              style={styles.count}
              keyboardType="number-pad"
              value={budgetInput}
              onChangeText={onBudgetInputChange}
              onEndEditing={onBudgetCommit}
              accessibilityLabel="Spoons for today"
              selectTextOnFocus
            />
            <Text style={styles.countUnit}>spoons today</Text>
          </View>
          <SpoonMeter budget={budget} spent={spent} />
        </>
      )}
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 14,
      borderRadius: 18,
      backgroundColor: palette.surfaceAlt,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    label: {
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: palette.textMuted,
    },
    headerLinks: { flexDirection: "row", alignItems: "center", gap: 4 },
    // 44dp tall targets; these were previously bare glyphs relying on hitSlop.
    iconButton: { height: 44, paddingHorizontal: 8, justifyContent: "center" },
    headerLink: { fontSize: 13, fontWeight: "600", color: palette.textSecondary },

    question: { fontSize: 17, fontWeight: "700", color: palette.textPrimary, marginTop: 2 },
    subtitle: { fontSize: 13, color: palette.textMuted, marginTop: 2 },
    optionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    option: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    optionSpoons: { fontSize: 19, fontWeight: "700", color: palette.textPrimary },
    optionLabel: { fontSize: 11, color: palette.textMuted, marginTop: 1 },
    skip: { fontSize: 13, color: palette.textMuted, marginTop: 10, textAlign: "center" },

    countRow: { flexDirection: "row", alignItems: "baseline", marginTop: 2 },
    count: {
      fontSize: 34,
      fontWeight: "700",
      color: palette.textPrimary,
      paddingVertical: 0,
      minWidth: 46,
    },
    countUnit: { fontSize: 15, color: palette.textSecondary, marginLeft: 2 },
  });
