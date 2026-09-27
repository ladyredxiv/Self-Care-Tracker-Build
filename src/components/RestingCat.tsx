import { Image, StyleSheet, View } from "react-native";

const restingCat = require("../../assets/resting-cat.png");

/**
 * Decorative tail-piece for the end of the task list.
 *
 * Marks the bottom of the list as a deliberate stopping point rather than a place
 * where content ran out — which suits an app whose whole argument is that not
 * doing everything is fine.
 *
 * Hidden from screen readers: it carries no information, and announcing it would
 * just be noise between the last task and the add button.
 */
export default function RestingCat() {
  return (
    <View
      style={styles.container}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Image source={restingCat} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 18, alignItems: "center" },
  image: {
    width: "100%",
    // Matches the artwork's 2:1 crop, so it never letterboxes or distorts.
    aspectRatio: 2,
    // Settles it into the background rather than competing with the task rows.
    opacity: 0.92,
  },
});
