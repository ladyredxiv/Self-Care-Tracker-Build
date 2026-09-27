import { ImageBackground, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { capacityOptions } from "../db/logic";
import { Palette, useThemedStyles } from "../theme";
import { formatSleepDuration } from "../utils/sleepInsight";
import { spoonMeterModel } from "../utils/spoonMeter";
import SpoonMeter from "./SpoonMeter";
import { nightArtwork } from "./StorybookHeader";

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
}) {
  const styles = useThemedStyles(createStyles);
  // Surfaced as a badge as well as in the meter's summary: being above the day's
  // budget is the sort of good news worth showing rather than tucking into a line
  // of small text.
  const toppedUp = spoonMeterModel(budget, spent).bonus;

  return (
    <ImageBackground source={nightArtwork} style={styles.card} imageStyle={styles.cardImage}>
      <View style={styles.artVeil} />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</Text>
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
            {toppedUp > 0 && (
              <View style={styles.bonusBadge}>
                <Text style={styles.bonusValue}>+{toppedUp}</Text>
                <Text style={styles.bonusLabel}>back</Text>
              </View>
            )}
          </View>
          <SpoonMeter budget={budget} spent={spent} tone="onArtwork" />
        </>
      )}
    </ImageBackground>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginBottom: 14,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 18,
      minHeight: 224,
      borderRadius: 24,
      overflow: "hidden",
    },
    cardImage: { resizeMode: "cover" },
    artVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.artworkVeil },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 34, lineHeight: 38, fontFamily: "serif", fontWeight: "700", color: palette.onArtwork },
    date: { fontSize: 15, color: palette.onArtworkMuted, marginTop: 1 },

    question: { fontSize: 17, fontWeight: "700", color: palette.onArtwork, marginTop: 10 },
    subtitle: { fontSize: 13, color: palette.onArtworkMuted, marginTop: 2 },
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
    skip: { fontSize: 13, color: palette.onArtworkMuted, marginTop: 10, textAlign: "center" },

    countRow: { flexDirection: "row", alignItems: "baseline", marginTop: 2 },
    count: {
      fontSize: 34,
      fontWeight: "700",
      color: palette.onArtwork,
      paddingVertical: 0,
      minWidth: 46,
    },
    countUnit: { fontSize: 15, color: palette.onArtworkMuted, marginLeft: 2 },
    bonusBadge: {
      marginLeft: "auto",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: palette.highlightOnArtwork,
    },
    bonusValue: { fontSize: 15, fontWeight: "800", color: palette.onAccent },
    bonusLabel: { fontSize: 10, color: palette.onAccent, marginTop: -2 },
  });
