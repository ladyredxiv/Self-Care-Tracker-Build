import { Image, useWindowDimensions, View } from "react-native";

const restingCat = require("../../assets/resting-cat.png");

/** Artwork is 900x450, so height is always half the width. */
const ASPECT = 2;
/** Keeps it a tail-piece on a tablet rather than growing to fill the width. */
const MAX_WIDTH = 320;

/**
 * Decorative tail-piece for the end of the task list.
 *
 * Marks the bottom of the list as a deliberate stopping point rather than a place
 * where content ran out — which suits an app whose whole argument is that not
 * doing everything is fine.
 *
 * Sized from the real window width rather than with a percentage and aspectRatio:
 * that combination rendered wider than the screen and cropped the artwork at both
 * edges. Explicit numbers can't overflow.
 *
 * Hidden from screen readers: it carries no information, and announcing it would
 * just be noise between the last task and the add button.
 */
export default function RestingCat() {
  const { width } = useWindowDimensions();
  // 32 of list padding, plus margin so it doesn't sit flush to the edges.
  const imageWidth = Math.min(width - 64, MAX_WIDTH);

  return (
    <View
      style={{ marginTop: 14, marginBottom: 4, alignItems: "center" }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Image
        source={restingCat}
        style={{
          width: imageWidth,
          height: imageWidth / ASPECT,
          // Settles it into the background rather than competing with the rows.
          opacity: 0.9,
        }}
        resizeMode="contain"
      />
    </View>
  );
}
