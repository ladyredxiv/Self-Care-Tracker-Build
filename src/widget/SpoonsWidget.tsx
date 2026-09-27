import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  TextWidget,
} from "react-native-android-widget";

import { HexColor, lightPalette } from "../theme";
import { spoonMeterModel } from "../utils/spoonMeter";
import { StatusSummary } from "../utils/statusText";
import { describeStatus } from "../utils/statusText";

const widgetArtwork = require("../../assets/widget-night.png");

/**
 * Beyond this, marks stop being countable at widget scale and the row would push
 * the RemoteViews node count up for no benefit. The remainder is shown as "+N".
 */
const MAX_WIDGET_MARKS = 10;

/**
 * Home-screen widget: spoons left, over the same night artwork as the app.
 *
 * Deliberately just a readout. A widget can't prompt, confirm or explain, so it
 * offers no completion — mis-tapping the home screen and silently spending spoons
 * would be worse than opening the app. Tapping anywhere opens Spoons.
 *
 * Every colour is taken from the light palette rather than the active theme: the
 * artwork is dark in both themes, so this content is always light, exactly as the
 * capacity card's onArtwork tokens are.
 */
export default function SpoonsWidget({ summary }: { summary: StatusSummary }) {
  const { title, body } = describeStatus(summary);
  const model = spoonMeterModel(summary.budget, summary.spent);

  const filled = Math.min(model.filled, MAX_WIDGET_MARKS);
  const empty = Math.min(model.empty, Math.max(MAX_WIDGET_MARKS - filled, 0));
  const overflow = model.filled - filled;

  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      style={{ height: "match_parent", width: "match_parent", borderRadius: 20 }}
    >
      <ImageWidget
        image={widgetArtwork}
        imageWidth={480}
        imageHeight={240}
        resizeMode="cover"
        style={{ height: "match_parent", width: "match_parent", borderRadius: 20 }}
      />
      {/* Wash, so the text stays legible wherever the art happens to be bright. */}
      <FlexWidget
        style={{
          height: "match_parent",
          width: "match_parent",
          borderRadius: 20,
          backgroundColor: "#19122c66",
        }}
      />

      <FlexWidget
        style={{
          height: "match_parent",
          width: "match_parent",
          justifyContent: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <TextWidget
          text={title}
          style={{ fontSize: 17, fontWeight: "700", color: lightPalette.onArtwork }}
        />

        <FlexWidget
          style={{ flexDirection: "row", alignItems: "center", marginTop: 7 }}
        >
          {Array.from({ length: filled }, (_, i) => (
            <WidgetSpoon key={`filled-${i}`} color={lightPalette.highlightOnArtwork} />
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <WidgetSpoon key={`empty-${i}`} color={lightPalette.spoonEmptyOnArtwork} />
          ))}
          {overflow > 0 ? (
            <TextWidget
              text={`+${overflow}`}
              style={{
                fontSize: 11,
                marginLeft: 4,
                color: lightPalette.highlightOnArtwork,
              }}
            />
          ) : null}
        </FlexWidget>

        <TextWidget
          text={body}
          maxLines={1}
          style={{ fontSize: 11, marginTop: 7, color: lightPalette.onArtworkMuted }}
        />
      </FlexWidget>
    </OverlapWidget>
  );
}

/** The app's spoon mark, rebuilt from widget primitives: oval bowl, thin handle. */
function WidgetSpoon({ color }: { color: HexColor }) {
  return (
    <FlexWidget style={{ alignItems: "center", marginRight: 4 }}>
      <FlexWidget
        style={{ width: 8, height: 10, borderRadius: 4, backgroundColor: color }}
      />
      <FlexWidget
        style={{ width: 3, height: 7, borderRadius: 2, backgroundColor: color }}
      />
    </FlexWidget>
  );
}
