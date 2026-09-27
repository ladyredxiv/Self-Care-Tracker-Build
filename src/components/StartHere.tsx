import { Pressable, StyleSheet, Text, View } from "react-native";

import { Palette, useThemedStyles } from "../theme";
import { TaskWithStatus } from "../types";

/**
 * The two or three things to actually attempt now.
 *
 * A list of twelve tasks doesn't answer "what do I do right now", which is the only
 * question worth answering on a low-energy day. These come straight from the budget
 * allocation, so the order already reflects essentials first, then whatever has been
 * waiting longest.
 *
 * Tasks also remain in their time-of-day sections below; this is a suggestion rather
 * than a replacement for the list, and it's styled to read that way.
 */
export default function StartHere({
  tasks,
  onComplete,
}: {
  tasks: TaskWithStatus[];
  onComplete: (task: TaskWithStatus) => void;
}) {
  const styles = useThemedStyles(createStyles);
  if (tasks.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Start here</Text>
      {tasks.map((task) => (
        <Pressable key={task.id} style={styles.row} onPress={() => onComplete(task)}>
          <View style={styles.check} />
          {task.icon ? <Text style={styles.icon}>{task.icon}</Text> : null}
          <Text style={styles.name} numberOfLines={1}>
            {task.name}
          </Text>
          <Text style={styles.cost}>
            {task.energyCost < 0 ? `+${-task.energyCost}` : task.energyCost}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginBottom: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: palette.surfaceAlt,
    },
    heading: {
      fontSize: 12,
      fontWeight: "700",
      color: palette.textSecondary,
      marginBottom: 6,
      letterSpacing: 0.3,
    },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 7, gap: 10 },
    check: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: palette.border,
    },
    icon: { fontSize: 16 },
    name: { flex: 1, fontSize: 15, color: palette.textPrimary },
    cost: { fontSize: 13, color: palette.textMuted },
  });
