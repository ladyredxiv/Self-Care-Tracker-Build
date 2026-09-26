import { FlexWidget, TextWidget } from "react-native-android-widget";

import { darkPalette, lightPalette } from "../theme";
import { StatusSummary } from "../utils/statusText";
import { describeStatus } from "../utils/statusText";

/**
 * Home-screen widget showing spoons left and what to start with.
 *
 * Deliberately just a readout. A widget can't prompt, confirm or explain, so it
 * doesn't offer completion — mis-tapping the home screen and silently spending
 * spoons would be worse than opening the app. Tapping anywhere opens Spoons.
 *
 * Widgets are rendered by a headless task, outside React context, so the theme has
 * to be passed in rather than read from a hook.
 */
export default function SpoonsWidget({
  summary,
  isDark,
}: {
  summary: StatusSummary;
  isDark: boolean;
}) {
  const palette = isDark ? darkPalette : lightPalette;
  const { title, body } = describeStatus(summary);

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: palette.surfaceAlt,
        borderRadius: 20,
      }}
    >
      <TextWidget
        text={title}
        style={{ fontSize: 20, fontWeight: "700", color: palette.textPrimary }}
      />
      <TextWidget
        text={body}
        maxLines={2}
        style={{ fontSize: 12, marginTop: 4, color: palette.textMuted }}
      />
    </FlexWidget>
  );
}
