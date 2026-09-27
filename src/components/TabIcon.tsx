import { View } from "react-native";

import { HexColor } from "../theme";

export type TabIconName = "today" | "trends" | "tasks" | "settings";

/**
 * Tab icons drawn from views.
 *
 * These were Unicode glyphs — ◐ ▥ ☷ ⚙ — which is a font-fallback lottery: the
 * gear was already rendering as a sun on device, and ☷ (a trigram) and ▥ (a
 * box-drawing character) commonly come out as empty tofu boxes on Android.
 *
 * An icon font would be nicer, but adding @expo/vector-icons moves the update
 * fingerprint and would force a rebuild — measured. Simple geometry costs nothing
 * and renders identically everywhere.
 */
export default function TabIcon({
  name,
  color,
  size = 22,
}: {
  name: TabIconName;
  color: HexColor;
  size?: number;
}) {
  const box = { width: size, height: size, alignItems: "center", justifyContent: "center" } as const;
  const stroke = Math.max(1.5, size * 0.09);

  if (name === "trends") {
    // Three bars, increasing — unmistakable as a chart at any size.
    const heights = [0.42, 0.68, 0.95];
    return (
      <View style={[box, { flexDirection: "row", alignItems: "flex-end", gap: size * 0.11 }]}>
        {heights.map((h, i) => (
          <View
            key={i}
            style={{
              width: size * 0.2,
              height: size * h,
              borderRadius: size * 0.06,
              backgroundColor: color,
            }}
          />
        ))}
      </View>
    );
  }

  if (name === "tasks") {
    // Checklist: a marker and a line, three times over.
    return (
      <View style={[box, { justifyContent: "space-between", paddingVertical: size * 0.12 }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: size * 0.16 }}>
            <View
              style={{
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size * 0.05,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                width: size * 0.5,
                height: stroke,
                borderRadius: stroke,
                backgroundColor: color,
              }}
            />
          </View>
        ))}
      </View>
    );
  }

  if (name === "settings") {
    // Sliders rather than a gear: a gear needs teeth, which views can't draw
    // cleanly, whereas sliders read as settings and are three rectangles.
    return (
      <View style={[box, { justifyContent: "space-between", paddingVertical: size * 0.14 }]}>
        {[0.62, 0.3, 0.46].map((knobAt, i) => (
          <View key={i} style={{ width: size * 0.9, justifyContent: "center" }}>
            <View
              style={{ height: stroke, borderRadius: stroke, backgroundColor: color, opacity: 0.55 }}
            />
            <View
              style={{
                position: "absolute",
                left: size * 0.9 * knobAt,
                width: size * 0.24,
                height: size * 0.24,
                borderRadius: size * 0.12,
                backgroundColor: color,
              }}
            />
          </View>
        ))}
      </View>
    );
  }

  // today — a spoon bowl over a ring, echoing the spoon marks in the header.
  return (
    <View style={box}>
      <View
        style={{
          width: size * 0.78,
          height: size * 0.78,
          borderRadius: size * 0.39,
          borderWidth: stroke,
          borderColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: size * 0.26,
            height: size * 0.26,
            borderRadius: size * 0.13,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}
