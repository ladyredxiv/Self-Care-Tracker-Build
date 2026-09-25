import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Pressable,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  completeTask,
  DEFAULT_BUDGET_KEY,
  setBudgetForDate,
  setSetting,
  uncompleteTask,
} from "../db/database";
import { todayDateString } from "../db/logic";
import { loadDayStatus } from "../db/selectors";
import { TaskWithStatus } from "../types";
import { formatTimeLabel } from "../utils/time";

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const today = todayDateString();
  const [budget, setBudget] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [spent, setSpent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [tasks, setTasks] = useState<TaskWithStatus[]>([]);

  const load = useCallback(() => {
    const status = loadDayStatus(today);
    setBudget(status.budget);
    setBudgetInput(String(status.budget));
    setSpent(status.spent);
    setRemaining(status.remaining);
    setTasks(status.tasks);
  }, [today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const saveBudget = () => {
    const value = parseInt(budgetInput, 10);
    if (Number.isNaN(value) || value < 0) {
      setBudgetInput(String(budget)); // reject the edit and show the real value again
      return;
    }
    setBudgetForDate(today, value);
    // Carried forward so tomorrow starts here too; past days keep their own
    // frozen budget, so this no longer rewrites history.
    setSetting(DEFAULT_BUDGET_KEY, String(value));
    load();
  };

  const toggleComplete = (task: TaskWithStatus) => {
    if (task.completedToday) {
      uncompleteTask(task.id, today);
    } else {
      completeTask(task.id, today);
    }
    load();
  };

  const editTask = (task: TaskWithStatus) => {
    navigation.navigate("TaskForm", { taskId: task.id });
  };

  const scheduledTasks = tasks.filter((t) => t.scheduledToday);
  const otherTasks = tasks.filter((t) => !t.scheduledToday);

  return (
    <View style={styles.container}>
      <View style={styles.budgetCard}>
        <View style={styles.budgetCardHeader}>
          <Text style={styles.budgetLabel}>Today's energy budget</Text>
          <Pressable onPress={() => navigation.navigate("Stats")} hitSlop={8}>
            <Text style={styles.trendsLink}>Trends →</Text>
          </Pressable>
        </View>
        <View style={styles.budgetRow}>
          <TextInput
            style={styles.budgetInput}
            keyboardType="number-pad"
            value={budgetInput}
            onChangeText={setBudgetInput}
            onEndEditing={saveBudget}
          />
          <Text style={[styles.budgetRemaining, remaining < 0 && styles.budgetOver]}>
            {remaining < 0
              ? `${spent} / ${budget} · ${-remaining} over`
              : `${remaining} / ${budget} remaining`}
          </Text>
        </View>
      </View>

      <FlatList
        data={scheduledTasks}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          scheduledTasks.length === 0 ? (
            <Text style={styles.emptyText}>
              No tasks scheduled for today yet. Add one below.
            </Text>
          ) : null
        }
        ListFooterComponent={
          otherTasks.length > 0 ? (
            <View>
              <Text style={styles.sectionHeader}>Not scheduled today</Text>
              {otherTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={toggleComplete}
                  onEdit={editTask}
                  disabled
                />
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TaskRow task={item} onToggle={toggleComplete} onEdit={editTask} />
        )}
      />

      <Pressable
        style={styles.addButton}
        onPress={() => navigation.navigate("TaskForm")}
      >
        <Text style={styles.addButtonText}>+ Add self-care task</Text>
      </Pressable>
    </View>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  disabled,
}: {
  task: TaskWithStatus;
  onToggle: (t: TaskWithStatus) => void;
  onEdit: (t: TaskWithStatus) => void;
  disabled?: boolean;
}) {
  const blocked = !task.completedToday && !task.fitsRemainingBudget;
  return (
    <TouchableOpacity
      style={[
        styles.taskRow,
        task.completedToday && styles.taskRowDone,
        blocked && styles.taskRowBlocked,
      ]}
      disabled={disabled}
      onPress={() => onToggle(task)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.taskName}>{task.name}</Text>
        <Text style={styles.taskMeta}>
          {task.energyCost} energy · {task.category}
          {task.streak > 0 ? ` · 🔥 ${task.streak}` : ""}
          {task.reminderEnabled && task.reminderTime
            ? ` · ⏰ ${formatTimeLabel(task.reminderTime)}`
            : ""}
        </Text>
      </View>
      {blocked && <Text style={styles.blockedTag}>over budget</Text>}
      {task.completedToday && <Text style={styles.doneTag}>done</Text>}
      <Pressable
        hitSlop={10}
        style={styles.editButton}
        onPress={() => onEdit(task)}
      >
        <Text style={styles.editButtonText}>✎</Text>
      </Pressable>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdfaf6", paddingTop: 60 },
  budgetCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#f1e6dd",
  },
  budgetCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  budgetLabel: { fontSize: 14, color: "#6b5c52" },
  trendsLink: { fontSize: 13, color: "#4a3f38", fontWeight: "600" },
  budgetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  budgetInput: {
    borderWidth: 1,
    borderColor: "#d9c7ba",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 80,
    fontSize: 18,
    backgroundColor: "white",
  },
  budgetRemaining: { fontSize: 16, fontWeight: "600", color: "#4a3f38" },
  budgetOver: { color: "#a15c3c" },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyText: { color: "#8a7b70", textAlign: "center", marginTop: 24 },
  sectionHeader: { marginTop: 16, marginBottom: 8, color: "#8a7b70", fontSize: 13 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "white",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#eee2d8",
  },
  taskRowDone: { backgroundColor: "#e7f3e8", borderColor: "#cfe6d2" },
  taskRowBlocked: { opacity: 0.45 },
  taskName: { fontSize: 16, fontWeight: "600", color: "#3c332d" },
  taskMeta: { fontSize: 13, color: "#8a7b70", marginTop: 2 },
  blockedTag: { fontSize: 12, color: "#a15c3c" },
  doneTag: { fontSize: 12, color: "#3c7a3f", fontWeight: "600" },
  editButton: { paddingLeft: 12, paddingVertical: 4 },
  editButtonText: { fontSize: 16, color: "#a8998c" },
  addButton: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: "#4a3f38",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  addButtonText: { color: "white", fontWeight: "600", fontSize: 16 },
});
