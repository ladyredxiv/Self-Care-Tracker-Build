import { StyleSheet, Text, View } from "react-native";

import { Palette, useTheme } from "../theme";
import { describeSpoons, spoonMeterModel } from "../utils/spoonMeter";
import SpoonMark from "./SpoonMark";

/** Where the meter is being drawn, which decides whether its colours are light or dark. */
export type SpoonMeterTone = "onSurface" | "onArtwork";

/**
 * Spoons remaining, as actual spoons.
 *
 * Readable without arithmetic, which is the point — "how much have I got left" on
 * a brain-fog morning shouldn't require subtracting one number from another. Falls
 * back to a proportional bar once there are too many marks to count at a glance.
 */
export default function SpoonMeter({
  budget,
  spent,
  tone = "onSurface",
}: {
  budget: number;
  spent: number;
  tone?: SpoonMeterTone;
}) {
  const { palette } = useTheme();
  const colours = toneColours(palette, tone);
  const styles = createStyles(colours);
  const model = spoonMeterModel(budget, spent);
  const total = Math.max(0, Math.round(budget));

  return (
    <View accessible accessibilityLabel={describeSpoons(model, total)} style={styles.container}>
      {model.mode === "marks" ? (
        <View style={styles.marks}>
          {Array.from({ length: model.filled }, (_, i) => (
            <SpoonMark key={`filled-${i}`} color={colours.filled} />
          ))}
          {Array.from({ length: model.empty }, (_, i) => (
            <SpoonMark key={`empty-${i}`} color={colours.empty} />
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

/**
 * On the artwork every one of these has to be light. Reaching for the ordinary
 * surface tokens there renders dark-on-dark and the summary line vanishes.
 */
function toneColours(palette: Palette, tone: SpoonMeterTone) {
  if (tone === "onArtwork") {
    return {
      filled: palette.highlightOnArtwork,
      empty: palette.spoonEmptyOnArtwork,
      text: palette.onArtworkMuted,
      over: palette.warningOnArtwork,
    };
  }
  return {
    filled: palette.highlight,
    empty: palette.spoonEmpty,
    text: palette.textSecondary,
    over: palette.warning,
  };
}

const createStyles = (colours: ReturnType<typeof toneColours>) =>
  StyleSheet.create({
    container: { marginTop: 10 },
    marks: { flexDirection: "row", flexWrap: "wrap", gap: 5, rowGap: 6 },
    barTrack: { height: 10, borderRadius: 5, backgroundColor: colours.empty, overflow: "hidden" },
    barFill: { height: 10, borderRadius: 5, backgroundColor: colours.filled },
    summary: { fontSize: 13, color: colours.text, marginTop: 9 },
    summaryOver: { color: colours.over, fontWeight: "600" },
  });
