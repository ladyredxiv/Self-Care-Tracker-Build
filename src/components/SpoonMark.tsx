import { View } from "react-native";

import { HexColor } from "../theme";

/**
 * A single spoon, drawn from two views.
 *
 * Deliberately not an icon font. @expo/vector-icons would look better, but adding
 * any dependency changes the update fingerprint, and that would mean a ten-minute
 * rebuild for every iteration on how this looks — which is the wrong trade while
 * the design is still moving. Two rounded rectangles read as a spoon at this size.
 */
export default function SpoonMark({
  color,
  size = 15,
}: {
  color: HexColor;
  size?: number;
}) {
  const bowlWidth = Math.round(size * 0.6);
  const bowlHeight = Math.round(size * 0.72);
  const stemWidth = Math.max(2, Math.round(size * 0.2));

  return (
    <View style={{ width: size, alignItems: "center" }}>
      <View
        style={{
          width: bowlWidth,
          height: bowlHeight,
          borderRadius: bowlWidth / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: stemWidth,
          height: Math.round(size * 0.42),
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: stemWidth / 2,
          borderBottomRightRadius: stemWidth / 2,
          marginTop: -1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
