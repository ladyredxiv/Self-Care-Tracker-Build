import { Pressable, StyleSheet, Text, View } from "react-native";

import { DAY_RATING_LABELS } from "../db/logic";
import { Palette, useTheme, useThemedStyles } from "../theme";
import FaceMark from "./FaceMark";
import { DayRating } from "../types";

const RATINGS: DayRating[] = [1, 2, 3, 4, 5];

/**
 * The end-of-day reflection.
 *
 * This is the only thing in the app that records an *outcome* rather than an
 * activity. Without it every trend is about compliance — what got done — and the
 * app can never say whether the pacing actually worked, which is the question
 * pacing exists to answer.
 *
 * Deliberately one tap with no required note: asking someone to journal at the end
 * of a rough day is asking for the data you'll least often get.
 */
export default function DayReflection({
  rating,
  onRate,
}: {
  rating: DayRating | null;
  onRate: (rating: DayRating) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {rating === null ? "How did today go?" : "Today felt…"}
      </Text>

      <View style={styles.row}>
        {RATINGS.map((value) => {
          const selected = rating === value;
          return (
            <Pressable
              key={value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => onRate(value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={DAY_RATING_LABELS[value]}
            >
              <FaceMark
                rating={value}
                color={selected ? palette.onAccent : palette.textSecondary}
              />
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {DAY_RATING_LABELS[value]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.borderSubtle,
    },
    title: { fontSize: 14, color: palette.textSecondary, marginBottom: 10 },
    row: { flexDirection: "row", gap: 6 },
    option: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 9,
      gap: 5,
      borderRadius: 10,
      backgroundColor: palette.background,
      borderWidth: 1,
      borderColor: palette.borderSubtle,
    },
    optionSelected: { backgroundColor: palette.accent, borderColor: palette.accent },
    optionLabel: { fontSize: 11, color: palette.textSecondary },
    optionLabelSelected: { color: palette.onAccent, fontWeight: "600" },
  });
