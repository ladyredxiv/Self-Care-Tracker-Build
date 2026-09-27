import { View } from "react-native";

import { HexColor } from "../theme";

/**
 * A single spoon, drawn from two views.
 *
 * Proportions matter more than they sound: an earlier version used a wide, nearly
 * circular bowl on a short thick stem, which read as a balloon or a pin rather
 * than a spoon. A real teaspoon in silhouette is a narrow oval bowl on a handle
 * about as long again, so the bowl is taller than it is wide and the handle is
 * thin.
 *
 * Deliberately not an icon font: adding @expo/vector-icons moves the update
 * fingerprint, and geometry renders identically everywhere.
 */
export default function SpoonMark({
  color,
  size = 21,
}: {
  color: HexColor;
  size?: number;
}) {
  const bowlWidth = size * 0.44;
  const bowlHeight = size * 0.54;
  const handleWidth = Math.max(1.6, size * 0.15);
  const handleHeight = size * 0.5;

  return (
    <View style={{ width: size * 0.5, alignItems: "center" }}>
      <View
        style={{
          width: bowlWidth,
          height: bowlHeight,
          // Half the *width* keeps the shape an upright oval rather than a circle.
          borderRadius: bowlWidth / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: handleWidth,
          height: handleHeight,
          borderBottomLeftRadius: handleWidth / 2,
          borderBottomRightRadius: handleWidth / 2,
          marginTop: -size * 0.04,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
