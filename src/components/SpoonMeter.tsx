import { StyleSheet, Text, View } from "react-native";

import SpoonMark from "./SpoonMark";

import { Palette, useTheme, useThemedStyles } from "../theme";
import { describeSpoons, spoonMeterModel } from "../utils/spoonMeter";

/**
 * Spoons remaining, as actual spoons.
 *
 * Readable without arithmetic, which is the point — "how much have I got left" on
 * a brain-fog morning shouldn't require subtracting one number from another. Falls
 * back to a proportional bar once there are too many marks to count at a glance.
 */
export default function SpoonMeter({ budget, spent }: { budget: number; spent: number }) {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const model = spoonMeterModel(budget, spent);
  const total = Math.max(0, Math.round(budget));

  return (
    <View
      accessible
      accessibilityLabel={describeSpoons(model, total)}
      style={styles.container}
    >
      {model.mode === "marks" ? (
        <View style={styles.marks}>
          {Array.from({ length: model.filled }, (_, i) => (
            <SpoonMark key={`filled-${i}`} color={palette.highlight} />
          ))}
          {Array.from({ length: model.empty }, (_, i) => (
            <SpoonMark key={`empty-${i}`} color={palette.spoonEmpty} />
          ))}
        </View>
      ) : (
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.round(model.fillRatio * 100)}%` }]} />
        </View>
      )}

      <Text style={[styles.summary, model.over > 0 && styles.summaryOver]}>
        {describeSpoons(model, total)}
      </Text>
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    container: { marginTop: 10 },
    marks: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
    barTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: palette.spoonEmpty,
      overflow: "hidden",
    },
    barFill: { height: 10, borderRadius: 5, backgroundColor: palette.highlight },
    summary: { fontSize: 13, color: palette.textSecondary, marginTop: 8 },
    summaryOver: { color: palette.warning, fontWeight: "600" },
  });
