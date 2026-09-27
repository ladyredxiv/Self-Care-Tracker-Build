import { View } from "react-native";

import { HexColor } from "../theme";
import { DayRating } from "../types";

/**
 * A face for the end-of-day rating, drawn from views.
 *
 * The five ratings differ only by mouth curve, which is what makes them scannable
 * as a scale rather than five things to read. Eyes stay put; nothing else changes.
 *
 * Drawn rather than an emoji or icon font for two reasons: emoji render at the
 * mercy of the system emoji set and can't be recoloured to match selection state,
 * and an icon font would move the update fingerprint.
 */
export default function FaceMark({
  rating,
  color,
  size = 26,
}: {
  rating: DayRating;
  color: HexColor;
  size?: number;
}) {
  const stroke = Math.max(1.6, size * 0.075);
  const eye = Math.max(2, size * 0.09);
  const mouthWidth = size * 0.42;
  // Curve depth runs from a deep frown through flat to a broad smile.
  const curve = [0.3, 0.16, 0, 0.16, 0.3][rating - 1];
  const smiling = rating > 3;
  const mouthHeight = curve === 0 ? stroke : size * curve;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: stroke,
        borderColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: size * 0.2,
          marginBottom: size * 0.07,
        }}
      >
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{ width: eye, height: eye, borderRadius: eye / 2, backgroundColor: color }}
          />
        ))}
      </View>

      {curve === 0 ? (
        <View
          style={{
            width: mouthWidth,
            height: stroke,
            borderRadius: stroke,
            backgroundColor: color,
          }}
        />
      ) : (
        <View
          style={{
            width: mouthWidth,
            height: mouthHeight,
            // Only one edge is drawn, so the visible arc curves up for a smile and
            // down for a frown.
            borderBottomWidth: smiling ? stroke : 0,
            borderTopWidth: smiling ? 0 : stroke,
            borderColor: color,
            borderBottomLeftRadius: smiling ? mouthWidth : 0,
            borderBottomRightRadius: smiling ? mouthWidth : 0,
            borderTopLeftRadius: smiling ? 0 : mouthWidth,
            borderTopRightRadius: smiling ? 0 : mouthWidth,
          }}
        />
      )}
    </View>
  );
}
